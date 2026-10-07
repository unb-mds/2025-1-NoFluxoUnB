/**
 * ChatController — Darcy única (docs/darcy-unificada.md).
 *
 * POST /chat/send          — uma mensagem para a Darcy, de qualquer tela.
 * GET  /chat/historico     — a conversa visível (a mesma em todas as telas).
 * POST /chat/nova-conversa — zera a conversa do aluno.
 *
 * session_id = uuid do usuário autenticado (auth.users.id), extraído do token, não do
 * corpo da requisição — evita que um cliente forje o histórico de outro usuário. O
 * e-mail (também do token) resolve o aluno no banco; o perfil acadêmico que vai para
 * o prompt é montado aqui no servidor (`montarPerfilAluno`). Do cliente só vem a
 * mensagem e a tela em que ele está (`superficie` + `estado`).
 *
 * Marcadores interativos da resposta (`[MONTAR_GRADE]`, `[TURMA]`, `[BOTAO]`): ver
 * `services/chat/marcadores.ts` e a seção "Ações no chat" de docs/darcy-unificada.md.
 */

import { EndpointController, RequestType } from "../interfaces";
import { Pair } from "../utils";
import { Request, Response } from "express";
import { run } from "@openai/agents";
import { createControllerLogger } from "../utils/controller_logger";
import { logAiUsage } from "../utils/ai_usage_logger";
import { SupabaseWrapper } from "../supabase_wrapper";
import { SupabaseSession } from "../services/chat/supabase_session";
import {
    createOrquestradorAgent,
    obterEfeitosDoOrquestrador,
    type RestricoesDevolvidas,
} from "../services/chat/orquestrador_agent";
import { isMaritacaConfigured } from "../services/chat/model_provider";
import { montarPerfilAluno, type PerfilAluno } from "../services/chat/perfil_aluno";
import { invalidarPerfilAluno } from "../services/chat/perfil_cache";
import { parseCorpoChat } from "../services/chat/superficie";
import { codigoDoAtalhoTurmas, responderAtalhoTurmas, itensDaTroca } from "../services/chat/atalhos";
import { canonicalizarResposta } from "../services/chat/marcadores";
import { MARITACA_MODELS } from "../config/maritaca";
import { AI_SEM_CREDITOS_BODY, isMaritacaSemCreditos } from "../config/maritaca_errors";

type Autenticado = { authId: string; email: string };

/** Usuário do token Bearer, ou responde 401 e devolve `null`. */
async function autenticar(req: Request, res: Response): Promise<Autenticado | null> {
    const authorization = req.headers["authorization"];
    if (!authorization || typeof authorization !== "string") {
        res.status(401).json({ error: "Header 'Authorization' é obrigatório." });
        return null;
    }
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : authorization;
    const { data, error } = await SupabaseWrapper.get().auth.getUser(token);
    if (error || !data?.user?.id) {
        res.status(401).json({ error: "Token inválido." });
        return null;
    }
    return { authId: data.user.id, email: data.user.email ?? "" };
}

/**
 * Grava as restrições que a Darcy alterou no plano em `preferencias_plano`
 * (mesmo lugar onde a tela as salva), sem apagar o resto das preferências.
 */
async function persistirRestricoes(idUser: string, restricoes: RestricoesDevolvidas): Promise<void> {
    const supabase = SupabaseWrapper.get();
    const { data } = await supabase
        .from("dados_users")
        .select("preferencias_plano")
        .eq("id_user", idUser)
        .maybeSingle();
    const atuais = (data?.preferencias_plano as Record<string, unknown> | null) ?? {};
    await supabase
        .from("dados_users")
        .update({ preferencias_plano: { ...atuais, restricoes } })
        .eq("id_user", idUser);
    invalidarPerfilAluno(idUser);
}

export const ChatController: EndpointController = {
    name: "chat",
    routes: {
        send: new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "send");
            const startTime = Date.now();

            if (!req.headers["authorization"]) {
                return res.status(401).json({ error: "Header 'Authorization' é obrigatório." });
            }
            const corpo = parseCorpoChat(req.body);
            if ("error" in corpo) return res.status(400).json({ error: corpo.error });

            try {
                const usuario = await autenticar(req, res);
                if (!usuario) return;
                const session = new SupabaseSession(usuario.authId);

                // Atalho sem LLM (botões "ver turmas" do plano) — responde e grava a troca.
                const codigoTurmas = codigoDoAtalhoTurmas(corpo.message);
                if (codigoTurmas) {
                    const reply = await responderAtalhoTurmas(codigoTurmas);
                    await session.addItems(itensDaTroca(corpo.message, reply));
                    return res.status(200).json({ reply });
                }

                if (!isMaritacaConfigured()) {
                    logger.error("Maritaca não configurada");
                    return res.status(503).json({ error: "Serviço de chat indisponível." });
                }

                // Perfil falhando não derruba o chat: a Darcy responde sem ele e as
                // tools continuam buscando o que precisam.
                let perfil: PerfilAluno | null = null;
                try {
                    perfil = await montarPerfilAluno(usuario.email);
                } catch (err) {
                    logger.error(`Falha ao montar perfil do aluno: ${err instanceof Error ? err.message : String(err)}`);
                }

                const orquestrador = createOrquestradorAgent({
                    email: usuario.email,
                    perfil,
                    superficie: corpo.superficie,
                    estado: corpo.estado,
                });
                const resultado = await run(orquestrador, corpo.message, { session });

                // Usage acumulado do run inteiro (orquestrador + atuadores) — dashboard
                // de custo. O SDK confia em `usage.total_tokens ?? 0` da Maritaca, que às
                // vezes vem nulo; recalcula aqui.
                const usage = resultado.state.usage;
                const totalTokens = usage.totalTokens || usage.inputTokens + usage.outputTokens;
                logAiUsage({
                    endpoint: "chat-send",
                    durationMs: Date.now() - startTime,
                    success: true,
                    requestExcerpt: corpo.message,
                    usage: [
                        {
                            model: MARITACA_MODELS.AGENTE,
                            prompt_tokens: usage.inputTokens,
                            completion_tokens: usage.outputTokens,
                            total_tokens: totalTokens,
                        },
                    ],
                });

                // Efeitos estruturados da run: a tela aplica ISSO, não faz parsing do texto.
                const efeitos = obterEfeitosDoOrquestrador(orquestrador);
                if (efeitos.restricoes && perfil?.idUser) {
                    try {
                        await persistirRestricoes(perfil.idUser, efeitos.restricoes);
                    } catch (err) {
                        logger.error(`Falha ao salvar restrições: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }

                // Botão de grade determinístico: com `opcaoGrade`, o marcador vem dela,
                // não do texto do modelo. A sessão guarda o texto final (o que o aluno viu).
                const textoModelo = String(resultado.finalOutput ?? "");
                const reply = canonicalizarResposta(textoModelo, efeitos.opcaoGrade);
                if (reply !== textoModelo) {
                    try {
                        await session.substituirUltimaResposta(reply);
                    } catch (err) {
                        logger.error(`Falha ao gravar resposta final na sessão: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }

                return res.status(200).json({
                    reply,
                    opcaoGrade: efeitos.opcaoGrade ?? undefined,
                    plano: efeitos.plano ?? undefined,
                    restricoes: efeitos.restricoes ?? undefined,
                });
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

        historico: new Pair(RequestType.GET, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "historico");
            try {
                const usuario = await autenticar(req, res);
                if (!usuario) return;
                const mensagens = await new SupabaseSession(usuario.authId).listarMensagensVisiveis(50);
                return res.status(200).json({ mensagens });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`Erro ao ler histórico: ${msg}`);
                return res.status(500).json({ error: `Erro interno no servidor: ${msg}` });
            }
        }),

        "nova-conversa": new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "nova-conversa");
            try {
                const usuario = await autenticar(req, res);
                if (!usuario) return;
                await new SupabaseSession(usuario.authId).clearSession();
                return res.status(200).json({ ok: true });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`Erro ao zerar conversa: ${msg}`);
                return res.status(500).json({ error: `Erro interno no servidor: ${msg}` });
            }
        }),
    },
};
