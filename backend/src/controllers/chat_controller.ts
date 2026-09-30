/**
 * ChatController — Fase 1+2 do orquestrador de chat (docs/chatbot-orquestrador.md).
 *
 * POST /chat/send — roda o orquestrador (SDK @openai/agents, Fase 2) com sessão
 * persistida no Supabase (SupabaseSession, Fase 1). O cliente manda só a mensagem
 * nova; o histórico completo é reconstruído a partir da sessão antes de chamar o
 * modelo.
 *
 * session_id = uuid do usuário autenticado (auth.users.id), extraído do token, não do
 * corpo da requisição — evita que um cliente forje o histórico de outro usuário. O
 * e-mail (também do token) alimenta os atuadores que precisam resolver o id_user
 * legado (bigint) do aluno.
 *
 * Login obrigatório + cota diária de perguntas (utils/ia_acesso.ts): sem token
 * válido → 401 LOGIN_NECESSARIO antes de qualquer chamada ao modelo; a pergunta
 * é estornada se o orquestrador falhar.
 *
 * Isolado do Darcy legado (PlanejadorAgenteService / /assistente/chat /
 * /planejamento/chat) — esta rota não toca nesses arquivos.
 */

import { EndpointController, RequestType } from "../interfaces";
import { Pair } from "../utils";
import { Request, Response } from "express";
import { run, RunContext } from "@openai/agents";
import { createControllerLogger } from "../utils/controller_logger";
import { executarComContextoIA, logAiUsage, usageDoAgente } from "../utils/ai_usage_logger";
import { exigirLoginIA, reservarPerguntaIA } from "../utils/ia_acesso";
import { SupabaseWrapper } from "../supabase_wrapper";
import { SupabaseSession } from "../services/chat/supabase_session";
import { createOrquestradorAgent } from "../services/chat/orquestrador_agent";
import { isMaritacaConfigured } from "../services/chat/model_provider";
import { MARITACA_MODELS } from "../config/maritaca";
import { AI_SEM_CREDITOS_BODY, isMaritacaSemCreditos } from "../config/maritaca_errors";

export const ChatController: EndpointController = {
    name: "chat",
    routes: {
        send: new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "send");
            const startTime = Date.now();

            const usuario = await exigirLoginIA(req, res);
            if (!usuario) return;

            // turnos: reservado pra uma extensão futura (filtro de turno explícito no
            // AtuadorGrade) — desencapado do body agora, ainda não usado nesta task.
            const { message, curriculoCompleto, horarioLivre, codigosNaGrade, turnos: _turnos } = req.body ?? {};
            if (!message || typeof message !== "string" || !message.trim()) {
                return res.status(400).json({ error: "O campo 'message' é obrigatório." });
            }

            if (!isMaritacaConfigured()) {
                logger.error("Maritaca não configurada");
                return res.status(503).json({ error: "Serviço de chat indisponível." });
            }

            const pergunta = await reservarPerguntaIA(res, usuario);
            if (!pergunta) return;
            const ctxIA = { userId: usuario.id, perguntaId: pergunta.perguntaId };
            // RunContext criado aqui (e não pelo run) para o usage acumulado —
            // orquestrador + atuadores + sub-execuções com revisor — continuar
            // acessível se o run lançar no meio.
            const contextoRun = new RunContext<unknown>();

            try {
                const session = new SupabaseSession(usuario.id);

                // Horário livre só faz sentido acompanhado de um período letivo ativo pra
                // consultar as turmas contra — mesma RPC já usada em
                // optativas_actuator.ts:filtrarPorOfertaAtiva, não inventar outra forma de
                // descobrir o período.
                let horarioLivreResolvido:
                    | { freeMaskStr: string; periodoAtivo: string; codigosNaGrade: string[] }
                    | undefined;
                if (typeof horarioLivre === "string" && horarioLivre) {
                    const { data: periodoAtivo } = await SupabaseWrapper.get().rpc("periodo_letivo_atual");
                    horarioLivreResolvido = {
                        freeMaskStr: horarioLivre,
                        periodoAtivo: periodoAtivo ?? "",
                        // Matérias já alocadas na grade: não recomendar de novo e não deixar
                        // valerem como pré-requisito (são do mesmo semestre).
                        codigosNaGrade: Array.isArray(codigosNaGrade)
                            ? codigosNaGrade.filter((c: unknown): c is string => typeof c === "string")
                            : [],
                    };
                }

                const orquestrador = createOrquestradorAgent(
                    usuario.email ?? "",
                    req.body?.contexto === "montador",
                    typeof curriculoCompleto === "string" ? curriculoCompleto : undefined,
                    horarioLivreResolvido
                );
                const resultado = await executarComContextoIA(ctxIA, () =>
                    run(orquestrador, message, { session, context: contextoRun })
                );

                // Usage acumulado do run inteiro (orquestrador + atuadores via
                // asTool + sub-execuções com revisor, ver sub_run.ts) — custo no
                // dashboard admin. usageDoAgente recalcula o total zerado.
                logAiUsage({
                    endpoint: "chat-send",
                    durationMs: Date.now() - startTime,
                    success: true,
                    requestExcerpt: message,
                    usage: usageDoAgente(resultado.state?.usage ?? contextoRun.usage, MARITACA_MODELS.AGENTE),
                    ...ctxIA,
                });

                // O modelo já respondeu (e cobrou): quem saiu gasta a pergunta, só não recebe a resposta.
                if (pergunta.clienteSaiu()) return;
                return res.status(200).json({ reply: resultado.finalOutput, cota: pergunta.cota });
            } catch (error) {
                await pergunta.estornar();
                // A pergunta volta para o aluno, mas o que o modelo já respondeu
                // até a falha foi cobrado: entra no custo como falha.
                logAiUsage({
                    endpoint: "chat-send",
                    durationMs: Date.now() - startTime,
                    success: false,
                    requestExcerpt: message,
                    usage: usageDoAgente(contextoRun.usage, MARITACA_MODELS.AGENTE),
                    modeloPadrao: MARITACA_MODELS.AGENTE,
                    erro: error,
                    ...ctxIA,
                });
                if (isMaritacaSemCreditos(error)) {
                    logger.error("Chat (orquestrador): Maritaca sem créditos ativos");
                    return res.status(503).json(AI_SEM_CREDITOS_BODY);
                }
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`Erro no chat: ${msg}`);
                return res.status(500).json({ error: `Erro interno no servidor: ${msg}` });
            }
        }),
    },
};
