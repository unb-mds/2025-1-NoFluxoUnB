/**
 * ChatController — Darcy única (docs/darcy-unificada.md).
 *
 * POST /chat/send          — uma mensagem para a Darcy, de qualquer tela.
 * GET  /chat/historico     — a conversa visível (a mesma em todas as telas).
 * POST /chat/nova-conversa — arquiva a conversa ativa (vai para "Conversas anteriores";
 *                            o que importava dela vira memória).
 * POST /chat/esquecer      — apaga a conversa, as arquivadas E a memória (`memoria_aluno.ts`).
 * GET  /chat/conversas     — conversas arquivadas do aluno (título, data, tamanho).
 * GET  /chat/conversa?id=  — mensagens de uma conversa arquivada (só leitura).
 * POST /chat/retomar-conversa { id } — a arquivada volta a ser a ativa.
 * POST /chat/apagar-conversa  { id } — apaga uma conversa arquivada.
 *
 * session_id = uuid do usuário autenticado (auth.users.id), extraído do token, não do
 * corpo da requisição — evita que um cliente forje o histórico de outro usuário. O
 * e-mail (também do token) resolve o aluno no banco; o perfil acadêmico que vai para
 * o prompt é montado aqui no servidor (`montarPerfilAluno`). Do cliente só vem a
 * mensagem e a tela em que ele está (`superficie` + `estado`).
 *
 * Marcadores interativos da resposta (`[MONTAR_GRADE]`, `[TURMA]`, `[BOTAO]`): ver
 * `services/chat/marcadores.ts` e a seção "Ações no chat" de docs/darcy-unificada.md.
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
import {
    createOrquestradorAgent,
    obterEfeitosDoOrquestrador,
    type RestricoesDevolvidas,
} from "../services/chat/orquestrador_agent";
import { isMaritacaConfigured } from "../services/chat/model_provider";
import { montarPerfilAluno, type PerfilAluno } from "../services/chat/perfil_aluno";
import { invalidarPerfilAluno } from "../services/chat/perfil_cache";
import { apagarMemoria, consolidarMemoria, lerMemoria } from "../services/chat/memoria_aluno";
import { parseCorpoChat } from "../services/chat/superficie";
import { codigoDoAtalhoTurmas, responderAtalhoTurmas, itensDaTroca } from "../services/chat/atalhos";
import { canonicalizarResposta } from "../services/chat/marcadores";
import { MARITACA_MODELS } from "../config/maritaca";
import { AI_SEM_CREDITOS_BODY, isMaritacaSemCreditos } from "../config/maritaca_errors";

type Autenticado = { authId: string; email: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de conversa vindo do cliente (query ou corpo) — só uuid chega ao banco. */
function idDaConversa(valor: unknown): string | null {
    return typeof valor === "string" && UUID.test(valor.trim()) ? valor.trim() : null;
}

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

            const usuario = await exigirLoginIA(req, res);
            if (!usuario) return;

            const corpo = parseCorpoChat(req.body);
            if ("error" in corpo) return res.status(400).json({ error: corpo.error });

            // Atalho sem LLM (botões "ver turmas" do plano) — responde e grava a troca.
            // Comando direto (/turmas COD) responde do banco, sem LLM: não gasta cota.
            const codigoTurmas = codigoDoAtalhoTurmas(corpo.message);
            if (codigoTurmas) {
                const session = new SupabaseSession(usuario.id);
                const reply = await responderAtalhoTurmas(codigoTurmas);
                await session.addItems(itensDaTroca(corpo.message, reply));
                return res.status(200).json({ reply });
            }

            if (!isMaritacaConfigured()) {
                logger.error("Maritaca não configurada");
                return res.status(503).json({ error: "Serviço de chat indisponível." });
            }

            const pergunta = await reservarPerguntaIA(res, usuario);
            if (!pergunta) return;
            const ctxIA = { userId: usuario.id, perguntaId: pergunta.perguntaId };
            const contextoRun = new RunContext<unknown>();

            try {
                const session = new SupabaseSession(usuario.id);

                // Perfil falhando não derruba o chat: a Darcy responde sem ele e as
                // tools continuam buscando o que precisam. A memória (em cache) vem junto.
                let perfil: PerfilAluno | null = null;
                const memoriaPromise = lerMemoria(usuario.id);
                try {
                    perfil = await montarPerfilAluno(usuario.email ?? "");
                } catch (err) {
                    logger.error(`Falha ao montar perfil do aluno: ${err instanceof Error ? err.message : String(err)}`);
                }
                const memoria = await memoriaPromise;

                const orquestrador = createOrquestradorAgent({
                    email: usuario.email ?? "",
                    perfil,
                    superficie: corpo.superficie,
                    estado: corpo.estado,
                    memoria,
                });
                const resultado = await executarComContextoIA(ctxIA, () =>
                    run(orquestrador, corpo.message, { session, context: contextoRun })
                );

                logAiUsage({
                    endpoint: "chat-send",
                    durationMs: Date.now() - startTime,
                    success: true,
                    requestExcerpt: corpo.message,
                    usage: usageDoAgente(resultado.state?.usage ?? contextoRun.usage, MARITACA_MODELS.AGENTE),
                    ...ctxIA,
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

                // Depois da resposta, sem segurar o aluno: o que saiu da janela vira memória.
                void consolidarMemoria(usuario.id);

                // O modelo já respondeu (e cobrou): quem saiu gasta a pergunta, só não recebe a resposta.
                if (pergunta.clienteSaiu()) return;

                return res.status(200).json({
                    reply,
                    opcaoGrade: efeitos.opcaoGrade ?? undefined,
                    plano: efeitos.plano ?? undefined,
                    restricoes: efeitos.restricoes ?? undefined,
                    cota: pergunta.cota,
                });
            } catch (error) {
                await pergunta.estornar();
                // A pergunta volta para o aluno, mas o que o modelo já respondeu
                // até a falha foi cobrado: entra no custo como falha.
                logAiUsage({
                    endpoint: "chat-send",
                    durationMs: Date.now() - startTime,
                    success: false,
                    requestExcerpt: corpo.message,
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

        historico: new Pair(RequestType.GET, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "historico");
            try {
                const usuario = await autenticar(req, res);
                if (!usuario) return;
                const session = new SupabaseSession(usuario.authId);
                // Muito tempo sem falar com a Darcy: a tela abre numa conversa nova e a
                // antiga vai para "Conversas anteriores" (o contexto segue pela memória).
                if (await session.arquivarSeInativa()) void consolidarMemoria(usuario.authId, { tudo: true });
                const mensagens = await session.listarMensagensVisiveis(50);
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
                // A conversa é arquivada, não apagada — por isso a memória pode ser
                // consolidada em segundo plano: os itens continuam lá até ela terminar.
                // A Darcy começa do zero na tela, não no que sabe do aluno.
                await new SupabaseSession(usuario.authId).arquivarConversa();
                void consolidarMemoria(usuario.authId, { tudo: true });
                return res.status(200).json({ ok: true });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`Erro ao zerar conversa: ${msg}`);
                return res.status(500).json({ error: `Erro interno no servidor: ${msg}` });
            }
        }),

        conversas: new Pair(RequestType.GET, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "conversas");
            try {
                const usuario = await autenticar(req, res);
                if (!usuario) return;
                const conversas = await new SupabaseSession(usuario.authId).listarConversas();
                return res.status(200).json({ conversas });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`Erro ao listar conversas: ${msg}`);
                return res.status(500).json({ error: `Erro interno no servidor: ${msg}` });
            }
        }),

        conversa: new Pair(RequestType.GET, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "conversa");
            try {
                const usuario = await autenticar(req, res);
                if (!usuario) return;
                const id = idDaConversa(req.query.id);
                if (!id) return res.status(400).json({ error: "Parâmetro 'id' inválido." });
                const mensagens = await new SupabaseSession(usuario.authId).mensagensDaConversa(id);
                if (!mensagens) return res.status(404).json({ error: "Conversa não encontrada." });
                return res.status(200).json({ mensagens });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`Erro ao ler conversa: ${msg}`);
                return res.status(500).json({ error: `Erro interno no servidor: ${msg}` });
            }
        }),

        "retomar-conversa": new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "retomar-conversa");
            try {
                const usuario = await autenticar(req, res);
                if (!usuario) return;
                const id = idDaConversa(req.body?.id);
                if (!id) return res.status(400).json({ error: "Campo 'id' inválido." });
                const session = new SupabaseSession(usuario.authId);
                if (!(await session.retomarConversa(id))) {
                    return res.status(404).json({ error: "Conversa não encontrada." });
                }
                // A conversa que estava ativa foi arquivada: o que importava dela vira memória.
                void consolidarMemoria(usuario.authId, { tudo: true });
                const mensagens = await session.listarMensagensVisiveis(50);
                return res.status(200).json({ mensagens });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`Erro ao retomar conversa: ${msg}`);
                return res.status(500).json({ error: `Erro interno no servidor: ${msg}` });
            }
        }),

        "apagar-conversa": new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "apagar-conversa");
            try {
                const usuario = await autenticar(req, res);
                if (!usuario) return;
                const id = idDaConversa(req.body?.id);
                if (!id) return res.status(400).json({ error: "Campo 'id' inválido." });
                if (!(await new SupabaseSession(usuario.authId).apagarConversa(id))) {
                    return res.status(404).json({ error: "Conversa não encontrada." });
                }
                return res.status(200).json({ ok: true });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`Erro ao apagar conversa: ${msg}`);
                return res.status(500).json({ error: `Erro interno no servidor: ${msg}` });
            }
        }),

        esquecer: new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger("ChatController", "esquecer");
            try {
                const usuario = await autenticar(req, res);
                if (!usuario) return;
                await apagarMemoria(usuario.authId);
                await new SupabaseSession(usuario.authId).clearSession();
                return res.status(200).json({ ok: true });
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`Erro ao apagar memória: ${msg}`);
                return res.status(500).json({ error: `Erro interno no servidor: ${msg}` });
            }
        }),
    },
};
