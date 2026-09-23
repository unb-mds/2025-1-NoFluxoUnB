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
 * Isolado do Darcy legado (PlanejadorAgenteService / /assistente/chat /
 * /planejamento/chat) — esta rota não toca nesses arquivos.
 */

import { EndpointController, RequestType } from "../interfaces";
import { Pair } from "../utils";
import { Request, Response } from "express";
import { run } from "@openai/agents";
import { createControllerLogger } from "../utils/controller_logger";
import { logAiUsage } from "../utils/ai_usage_logger";
import { SupabaseWrapper } from "../supabase_wrapper";
import { SupabaseSession } from "../services/chat/supabase_session";
import { createOrquestradorAgent, obterOpcaoGradeDoOrquestrador } from "../services/chat/orquestrador_agent";
import { isMaritacaConfigured } from "../services/chat/model_provider";
import { MARITACA_MODELS } from "../config/maritaca";
import { AI_SEM_CREDITOS_BODY, isMaritacaSemCreditos } from "../config/maritaca_errors";

export const ChatController: EndpointController = {
    name: "chat",
    routes: {
        send: new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "send");
            const startTime = Date.now();

            const authorization = req.headers["authorization"];
            if (!authorization || typeof authorization !== "string") {
                return res.status(401).json({ error: "Header 'Authorization' é obrigatório." });
            }
            const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : authorization;

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

            try {
                const { data: authData, error: erroAuth } = await SupabaseWrapper.get().auth.getUser(token);
                if (erroAuth || !authData?.user?.id) {
                    logger.error(`Token inválido: ${erroAuth?.message}`);
                    return res.status(401).json({ error: "Token inválido." });
                }

                const session = new SupabaseSession(authData.user.id);

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
                    authData.user.email ?? "",
                    req.body?.contexto === "montador",
                    typeof curriculoCompleto === "string" ? curriculoCompleto : undefined,
                    horarioLivreResolvido
                );
                const resultado = await run(orquestrador, message, { session });

                // Usage acumulado do run inteiro (todas as chamadas ao LLM feitas
                // pelo orquestrador + atuadores) — tracking de custo no dashboard admin.
                // O @openai/agents-openai (openaiChatCompletionsModel.js) confia cegamente
                // em `usage.total_tokens ?? 0` da resposta, sem recalcular — mesma falha já
                // vista na Maritaca via mcp_agent/api_producao.py. Recalcula aqui também.
                const usage = resultado.state.usage;
                const totalTokens = usage.totalTokens || (usage.inputTokens + usage.outputTokens);
                logAiUsage({
                    endpoint: "chat-send",
                    durationMs: Date.now() - startTime,
                    success: true,
                    requestExcerpt: message,
                    usage: [{
                        model: MARITACA_MODELS.AGENTE,
                        prompt_tokens: usage.inputTokens,
                        completion_tokens: usage.outputTokens,
                        total_tokens: totalTokens,
                    }],
                });

                // Fase 3 (montador-de-grade-resilient-muffin.md): quando a Darcy chamou a
                // tool montar_grade nesta run, a seleção que ela realmente calculou (backend
                // solver, garantidamente sem conflito) vai junto em `opcaoGrade` — o frontend
                // aplica ISSO, não faz parsing do texto de `reply`. Fora do contexto de grade
                // (ou quando nenhuma tool de grade rodou), `opcaoGrade` fica `undefined` e
                // some do JSON (comportamento antigo de /chat/send intacto).
                const opcaoGrade = obterOpcaoGradeDoOrquestrador(orquestrador) ?? undefined;
                return res.status(200).json({ reply: resultado.finalOutput, opcaoGrade });
            } catch (error) {
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
