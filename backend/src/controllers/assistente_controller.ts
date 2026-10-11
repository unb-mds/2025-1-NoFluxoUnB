/**
 * Assistente Controller — AI assistant endpoint.
 * Replaces the standalone Python/Flask AI agent server.
 *
 * POST /assistente/analyze        — Analyze a materia using RAGFlow.
 * POST /assistente/analyze-sabia  — Analyze a materia using Sabiá AI (Maritaca).
 * GET  /assistente/health         — Health check for the AI service.
 * GET  /assistente/cota           — Cota diária de perguntas do aluno logado.
 *
 * Todas as rotas que chamam LLM pago exigem login e gastam uma pergunta da
 * cota diária (ver utils/ia_acesso.ts); a pergunta é estornada se a IA falhar.
 */

import { EndpointController, RequestType } from '../interfaces';
import { Pair, Utils } from '../utils';
import { Request, Response } from 'express';
import { RagflowService } from '../services/ragflow.service';
import type { RagflowResponse } from '../services/ragflow.types';
import { SabiaService, SabiaTimeoutError, isMensagemSabiaPublica } from '../services/sabia.service';
import { removeAccents } from '../utils/text.utils';
import { formatRanking, RankingFormatError } from '../utils/ranking.formatter';
import { createControllerLogger } from '../utils/controller_logger';
import { executarComContextoIA, logAiUsage, usageParcialDoErro, type ContextoIA, type LlmUsage } from '../utils/ai_usage_logger';
import { MARITACA_MODELS } from '../config/maritaca';
import { usageDoRagflow, RAGFLOW_MODEL } from '../utils/ragflow_usage';
import { exigirLoginIA, reservarPerguntaIA, MSG_COTA_INDISPONIVEL } from '../utils/ia_acesso';
import { estadoCota } from '../services/darcy_cota.service';
import { SupabaseWrapper } from '../supabase_wrapper';
import { PlanejadorAgenteService, ehComandoDireto, type MensagemChat } from '../services/planejador_agente.service';
import { criarContextoLeve } from '../services/agente/context';
import { montarContextoAgente } from './PlanejamentoController';
import { AI_SEM_CREDITOS_BODY, isMaritacaSemCreditos } from '../config/maritaca_errors';
import { ERRO_IA_GENERICO, registrarFalha } from '../utils/erro_publico';

/**
 * Teto do texto livre enviado ao LLM pago. Pré-mortem R8: sem isso, um body
 * de 2 MB era repassado inteiro à Maritaca (custo por token de entrada).
 */
export const MAX_MATERIA_CHARS = 300;

const ragflow = new RagflowService();
const sabia = new SabiaService();

export const AssistenteController: EndpointController = {
    name: 'assistente',
    routes: {
        analyze: new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger('AssistenteController', 'analyze');
            const startTime = Date.now();

            const usuario = await exigirLoginIA(req, res);
            if (!usuario) return;

            // Validate input
            const { materia } = req.body;
            if (!materia || typeof materia !== 'string' || !materia.trim()) {
                logger.error('Missing or empty "materia" field');
                return res.status(400).json({ erro: "O campo 'materia' é obrigatório no corpo da requisição JSON." });
            }
            if (materia.length > MAX_MATERIA_CHARS) {
                logger.error(`"materia" com ${materia.length} caracteres (máx. ${MAX_MATERIA_CHARS})`);
                return res.status(413).json({ erro: `Descreva seu interesse em até ${MAX_MATERIA_CHARS} caracteres.` });
            }

            // Check if RAGFlow is configured
            if (!ragflow.isAvailable()) {
                logger.error('RAGFlow service not configured');
                return res.status(503).json({ erro: 'Serviço de IA indisponível. Configuração do RAGFlow ausente.' });
            }

            const pergunta = await reservarPerguntaIA(res, usuario);
            if (!pergunta) return;
            // Antes esta rota não deixava rastro no ai_usage_log. O RAGFlow não
            // diz o modelo e em geral não devolve tokens: a linha sai com model
            // 'ragflow' (o dashboard avisa "sem preço cadastrado") e os tokens
            // só quando a resposta os trouxer (usageDoRagflow).
            let respostaRagflow: RagflowResponse | undefined;
            const logarRagflow = (success: boolean, erro?: unknown) =>
                logAiUsage({
                    endpoint: 'analyze',
                    durationMs: Date.now() - startTime,
                    success,
                    erro,
                    requestExcerpt: materia,
                    usage: usageDoRagflow(respostaRagflow),
                    modeloPadrao: RAGFLOW_MODEL,
                    userId: usuario.id,
                    perguntaId: pergunta.perguntaId,
                });

            try {
                // Preprocess: remove accents and uppercase
                const processed = removeAccents(materia).toUpperCase();
                logger.info(`Processing materia: "${materia}" → "${processed}"`);

                // Call RAGFlow: create session → analyze
                const sessionId = await ragflow.startSession(processed);
                logger.info(`Session created: ${sessionId}`);

                const result = await ragflow.analyzeMateria(processed, sessionId);
                respostaRagflow = result;

                if (result.code !== 0) {
                    await pergunta.estornar();
                    logarRagflow(false, result.message);
                    const requestId = registrarFalha(logger, `RAGFlow API error code=${result.code}`, result.message ?? 'sem mensagem');
                    return res.status(502).json({ erro: ERRO_IA_GENERICO, requestId });
                }

                // Format response as Markdown ranking. Resposta sem answer (ou
                // sem bloco de ranking) é falha do provedor: 502, não um 200
                // com texto de erro no lugar do resultado.
                let formatted: string;
                try {
                    formatted = formatRanking(result);
                } catch (error) {
                    if (!(error instanceof RankingFormatError)) throw error;
                    await pergunta.estornar();
                    logarRagflow(false);
                    const requestId = registrarFalha(logger, 'Resposta do RAGFlow sem ranking', error);
                    return res.status(502).json({ erro: ERRO_IA_GENERICO, requestId });
                }
                const duration = Date.now() - startTime;
                logger.info(`Request completed in ${duration}ms`);
                logarRagflow(true);

                // O modelo já respondeu (e cobrou): quem saiu gasta a pergunta, só não recebe a resposta.
                if (pergunta.clienteSaiu()) return;
                return res.json({ resultado: formatted, cota: pergunta.cota });
            } catch (error) {
                await pergunta.estornar();
                logarRagflow(false, error);
                const requestId = registrarFalha(logger, `Error after ${Date.now() - startTime}ms`, error);
                return res.status(500).json({ erro: ERRO_IA_GENERICO, requestId });
            }
        }),

        // Chat-agente da aba Assistente. Mesmo motor (tool-calling) do Planejamento,
        // via Tool Registry compartilhado. Contexto sob demanda: logado + planoInput
        // => todas as tools; anônimo/sem plano => só as tools genéricas.
        chat: new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger('AssistenteController', 'chat');
            const startTime = Date.now();

            const usuario = await exigirLoginIA(req, res);
            if (!usuario) return;

            let pergunta: Awaited<ReturnType<typeof reservarPerguntaIA>> = null;
            let ctxIA: ContextoIA = {};
            let excerpt = '';
            try {
                const svc = new PlanejadorAgenteService();
                if (!svc.isAvailable()) {
                    return res.status(503).json({ error: 'Serviço de agente temporariamente indisponível.' });
                }

                const body = req.body;
                if (!body || typeof body !== 'object') {
                    return res.status(400).json({ error: 'Body inválido.' });
                }

                const messages = Array.isArray(body.messages) ? body.messages : [];
                if (!messages.every((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')) {
                    return res.status(400).json({ error: 'messages deve ser array de { role, content }.' });
                }
                const historico: MensagemChat[] = messages.map((m: any) => ({ role: m.role, content: m.content }));

                // Comando direto (/turmas COD) responde do banco, sem LLM: não gasta cota.
                const semLlm = ehComandoDireto(historico);
                if (!semLlm) {
                    pergunta = await reservarPerguntaIA(res, usuario);
                    if (!pergunta) return;
                }
                ctxIA = { userId: usuario.id, perguntaId: pergunta?.perguntaId };
                excerpt = historico.slice().reverse().find((m) => m.role === 'user')?.content ?? '';

                const resultado = await executarComContextoIA(ctxIA, async () => {
                    // Contexto sob demanda.
                    let ctx = criarContextoLeve();
                    const autorizado = await Utils.checkAuthorization(req as Request);
                    const idUser = req.headers['user-id'] || req.headers['User-ID'];
                    if (autorizado && idUser && body.planoInput) {
                        const { ctx: ctxPlano, error } = await montarContextoAgente(String(idUser), body.planoInput, body.restricoes);
                        if (ctxPlano) {
                            ctx = ctxPlano;
                        } else {
                            logger.warn(`Sem contexto de plano (modo leve): ${error}`);
                        }
                    }

                    // Chat embutido no Montador de Grade: recomenda só matérias com turma
                    // ofertada no período ativo. O /assistente comum não manda esse contexto.
                    ctx.apenasComOferta = body.contexto === 'montador';

                    return svc.conversar(historico, ctx);
                });

                if (!resultado.semLlm) {
                    logAiUsage({
                        endpoint: 'assistente-chat',
                        durationMs: Date.now() - startTime,
                        success: true,
                        requestExcerpt: excerpt,
                        usage: resultado.usage,
                        ...ctxIA,
                    });
                }

                // O modelo já respondeu (e cobrou): quem saiu gasta a pergunta, só não recebe a resposta.
                if (pergunta?.clienteSaiu()) return;

                const cota = pergunta ? pergunta.cota : await estadoCota(usuario.id).catch(() => undefined);
                return res.status(200).json({
                    reply: resultado.reply,
                    plano: resultado.plano ?? undefined,
                    restricoes: resultado.restricoes,
                    cota,
                });
            } catch (err: any) {
                await pergunta?.estornar();
                // Só pergunta que passou pela cota (comando direto não chama LLM):
                // o que o modelo cobrou até a falha entra no custo como falha.
                if (pergunta) {
                    logAiUsage({
                        endpoint: 'assistente-chat',
                        durationMs: Date.now() - startTime,
                        success: false,
                        requestExcerpt: excerpt,
                        usage: usageParcialDoErro(err),
                        modeloPadrao: MARITACA_MODELS.AGENTE,
                        erro: err,
                        ...ctxIA,
                    });
                }
                if (isMaritacaSemCreditos(err)) {
                    logger.error('Chat da assistente: Maritaca sem créditos ativos');
                    return res.status(503).json(AI_SEM_CREDITOS_BODY);
                }
                const requestId = registrarFalha(logger, 'Erro no chat da assistente', err);
                return res.status(500).json({ error: ERRO_IA_GENERICO, requestId });
            }
        }),

        // Estado da cota diária (rodinha do chat ao abrir a página). Não consome.
        cota: new Pair(RequestType.GET, async (req: Request, res: Response) => {
            const usuario = await exigirLoginIA(req, res);
            if (!usuario) return;
            try {
                return res.json({ cota: await estadoCota(usuario.id) });
            } catch (error) {
                const requestId = registrarFalha(createControllerLogger('AssistenteController', 'cota'), 'Estado da cota', error);
                return res.status(503).json({ codigo: 'COTA_INDISPONIVEL', erro: MSG_COTA_INDISPONIVEL, requestId });
            }
        }),

        health: new Pair(RequestType.GET, async (_req: Request, res: Response) => {
            // D-Sec-1: o /health era usado por monitoring externo, mas vazava quais
            // provedores estavam configurados (ragflowConfigured / sabiaConfigured)
            // para qualquer um sem autenticação. Resposta resumida agora:
            // só 'healthy' | 'degraded' | 'down' — sem revelar a infra interna.
            // O Sabiá (motor usado pelo frontend) é pingado de verdade, com
            // timeout curto e cache (ver SabiaService.ping); antes o status só
            // olhava env vars e dizia 'healthy' com o Python fora do ar.
            const sabiaUp = sabia.isAvailable() && await sabia.ping();
            const status = sabiaUp
                ? 'healthy'
                : (ragflow.isAvailable() || sabia.isAvailable()) ? 'degraded' : 'down';
            return res.status(status === 'down' ? 503 : 200).json({
                status,
                service: 'AI Assistant',
                timestamp: new Date().toISOString(),
            });
        }),

        'analyze-sabia-stream': new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger('AssistenteController', 'analyze-sabia-stream');
            const startTime = Date.now();

            const usuario = await exigirLoginIA(req, res);
            if (!usuario) return;

            const { materia, matriz_curricular } = req.body;
            if (!materia || typeof materia !== 'string' || !materia.trim()) {
                logger.error('Missing or empty "materia" field');
                return res.status(400).json({ erro: "O campo 'materia' é obrigatório no corpo da requisição JSON." });
            }
            if (materia.length > MAX_MATERIA_CHARS) {
                logger.error(`"materia" com ${materia.length} caracteres (máx. ${MAX_MATERIA_CHARS})`);
                return res.status(413).json({ erro: `Descreva seu interesse em até ${MAX_MATERIA_CHARS} caracteres.` });
            }

            const matrizCurricular = typeof matriz_curricular === 'string' ? matriz_curricular : '';

            if (!sabia.isAvailable()) {
                logger.error('Sabiá service not configured');
                return res.status(503).json({ erro: 'Serviço Sabiá indisponível.' });
            }

            // Reserva ANTES dos headers SSE: 401/429/503 continuam sendo JSON.
            const pergunta = await reservarPerguntaIA(res, usuario);
            if (!pergunta) return;
            const ctxIA = { userId: usuario.id, perguntaId: pergunta.perguntaId };

            // Set SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            // Aluno fechou a aba/conexão antes do fim: aborta o stream do upstream
            // (senão o backend segue lendo e a Maritaca cobrando até o fim). O
            // guard evita abortar no 'close' que também dispara após o res.end().
            const clientAbort = new AbortController();
            res.on('close', () => {
                if (!res.writableEnded) clientAbort.abort();
            });

            // Estado da cota para a rodinha (já contando esta pergunta).
            res.write(`data: ${JSON.stringify({ stage: 'cota', cota: pergunta.cota })}\n\n`);

            try {
                logger.info(`Streaming with Sabiá: "${materia}"`);
                // Contexto da pergunta: o SabiaService repassa user_id/pergunta_id
                // ao mcp_agent, que loga as embeddings Gemini na mesma pergunta.
                const resultadoStream = await executarComContextoIA(ctxIA, () =>
                    sabia.analyzarInteresseStream(materia, matrizCurricular, res, clientAbort.signal),
                );
                const { usage, aborted, recebeuDoUpstream, concluiu } = resultadoStream;
                if (aborted) {
                    // Sem o evento `usage` do Python: registra a request como não
                    // concluída (tokens 0) para não sumir do dashboard de custo.
                    logger.info('Cliente fechou a conexão — stream do Sabiá abortado');
                    // Só não conta se saiu antes de o Python mandar qualquer
                    // evento: depois do 1º (`thinking`) a Maritaca já foi chamada
                    // e cobra, mesmo sem disciplina entregue.
                    if (!recebeuDoUpstream) await pergunta.estornar();
                    logAiUsage({
                        endpoint: 'analyze-sabia-stream',
                        durationMs: Date.now() - startTime,
                        success: false,
                        requestExcerpt: materia,
                        usage,
                        ...ctxIA,
                    });
                    return;
                }
                // Terminou com evento de erro (ou sem `done`): o Darcy não respondeu.
                // A pergunta é estornada e a linha do log vai como falha — com o
                // usage que chegou, porque a Maritaca cobrou do mesmo jeito.
                if (!concluiu) await pergunta.estornar();
                const { erroUpstream } = resultadoStream;
                // Tokens reais vêm do evento SSE "usage" que o Python emite antes do
                // "done" (ver SabiaService.analyzarInteresseStream). Fallback: se a
                // Maritaca não mandar include_usage em algum caminho, o evento não
                // chega e loga com tokens = 0 — a requisição ainda é contabilizada.
                logAiUsage({
                    endpoint: 'analyze-sabia-stream',
                    durationMs: Date.now() - startTime,
                    success: concluiu,
                    requestExcerpt: materia,
                    usage: usage && usage.length > 0
                        ? usage
                        : [{ model: 'sabia-4', prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }],
                    erro: erroUpstream,
                    ...ctxIA,
                });
                return;
            } catch (error) {
                await pergunta.estornar();
                logAiUsage({
                    endpoint: 'analyze-sabia-stream',
                    durationMs: Date.now() - startTime,
                    success: false,
                    requestExcerpt: materia,
                    // O evento `usage` pode ter chegado antes da falha.
                    usage: usageParcialDoErro(error),
                    modeloPadrao: MARITACA_MODELS.AGENTE,
                    erro: error,
                    ...ctxIA,
                });
                if (clientAbort.signal.aborted || res.writableEnded) return;
                const requestId = registrarFalha(logger, 'Stream error', error);
                const errorEvent = `data: ${JSON.stringify({ stage: 'error', message: ERRO_IA_GENERICO, requestId })}\n\n`;
                res.write(errorEvent);
                res.end();
                return;
            }
        }),

        'analyze-sabia': new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger('AssistenteController', 'analyze-sabia');
            const startTime = Date.now();

            const usuario = await exigirLoginIA(req, res);
            if (!usuario) return;

            // Validate input
            const { materia, matriz_curricular } = req.body;
            if (!materia || typeof materia !== 'string' || !materia.trim()) {
                logger.error('Missing or empty "materia" field');
                return res.status(400).json({ erro: "O campo 'materia' é obrigatório no corpo da requisição JSON." });
            }
            if (materia.length > MAX_MATERIA_CHARS) {
                logger.error(`"materia" com ${materia.length} caracteres (máx. ${MAX_MATERIA_CHARS})`);
                return res.status(413).json({ erro: `Descreva seu interesse em até ${MAX_MATERIA_CHARS} caracteres.` });
            }

            const matrizCurricular = typeof matriz_curricular === 'string' ? matriz_curricular : '';

            // Check if Sabiá is configured
            if (!sabia.isAvailable()) {
                logger.error('Sabiá service not configured');
                return res.status(503).json({ erro: 'Serviço Sabiá indisponível.' });
            }

            const pergunta = await reservarPerguntaIA(res, usuario);
            if (!pergunta) return;
            const ctxIA = { userId: usuario.id, perguntaId: pergunta.perguntaId };
            const logarFalha = (usage: LlmUsage[] | undefined, erro: unknown) =>
                logAiUsage({
                    endpoint: 'analyze-sabia',
                    durationMs: Date.now() - startTime,
                    success: false,
                    requestExcerpt: materia,
                    usage,
                    modeloPadrao: MARITACA_MODELS.AGENTE,
                    erro,
                    ...ctxIA,
                });

            // Usage já recebido do mcp_agent: se algo quebrar depois (ex.: na
            // formatação), o catch loga o gasto real em vez de usage vazio.
            let usageRecebido: LlmUsage[] | undefined;
            try {
                logger.info(`Processing with Sabiá: "${materia}"`);

                // Call Sabiá AI service (o contexto leva user_id/pergunta_id ao mcp_agent)
                const result = await executarComContextoIA(ctxIA, () => sabia.analyzarInteresse(materia, matrizCurricular));

                usageRecebido = result.usage;

                if (!result.success) {
                    await pergunta.estornar();
                    logarFalha(result.usage, result.error);
                    // Só as mensagens de orientação escritas no próprio mcp_agent
                    // (ex.: "Envie o historico academico") chegam ao usuário.
                    if (result.error && isMensagemSabiaPublica(result.error)) {
                        logger.error(`Sabiá error: ${result.error}`);
                        return res.status(500).json({ erro: `Erro no agente Sabiá: ${result.error}` });
                    }
                    const requestId = registrarFalha(logger, 'Sabiá error', result.error ?? 'sem mensagem');
                    return res.status(502).json({ erro: ERRO_IA_GENERICO, requestId });
                }

                // Format response as Markdown
                const formatted = sabia.formatAsMarkdown(result);
                const duration = Date.now() - startTime;
                logger.info(`Sabiá request completed in ${duration}ms — ${result.disciplinas?.length || 0} disciplinas`);

                logAiUsage({
                    endpoint: 'analyze-sabia',
                    durationMs: duration,
                    success: true,
                    requestExcerpt: materia,
                    usage: result.usage,
                    ...ctxIA,
                });

                // O modelo já respondeu (e cobrou): quem saiu gasta a pergunta, só não recebe a resposta.
                if (pergunta.clienteSaiu()) return;
                return res.json({
                    resultado: formatted,
                    disciplinas: result.disciplinas,
                    agente: 'sabia',
                    cota: pergunta.cota,
                });
            } catch (error) {
                await pergunta.estornar();
                logarFalha(usageRecebido ?? usageParcialDoErro(error), error);
                if (error instanceof SabiaTimeoutError) {
                    // Mensagem própria e segura (sem detalhe interno): ver SabiaTimeoutError.
                    logger.error(`Timeout do Sabiá após ${Date.now() - startTime}ms`);
                    return res.status(504).json({ erro: error.message });
                }
                const requestId = registrarFalha(logger, `Error after ${Date.now() - startTime}ms`, error);
                return res.status(500).json({ erro: ERRO_IA_GENERICO, requestId });
            }
        }),

        'turmas-by-codigo': new Pair(RequestType.GET, async (req: Request, res: Response) => {
            const logger = createControllerLogger('AssistenteController', 'turmas-by-codigo');
            const codigoRaw = String(req.query.codigo ?? '').trim().toUpperCase();

            if (!codigoRaw) {
                return res.status(400).json({ erro: "Informe o parâmetro 'codigo'." });
            }

            try {
                const { data: materiaRows, error: materiaError } = await SupabaseWrapper.get()
                    .from('materias')
                    .select('id_materia')
                    .eq('codigo_materia', codigoRaw)
                    .limit(1);

                if (materiaError) {
                    logger.error(`Erro ao buscar matéria por código: ${materiaError.message}`);
                    return res.status(500).json({ erro: 'Erro ao buscar matéria.' });
                }

                if (!materiaRows || materiaRows.length === 0) {
                    return res.json({ turmas: [], ultimaAtualizacaoTurmas: null });
                }

                const idMateria = Number(materiaRows[0].id_materia);
                const { data: turmasRows, error: turmasError } = await SupabaseWrapper.get()
                    .from('turmas')
                    .select('*')
                    .eq('id_materia', idMateria)
                    .order('ano_periodo', { ascending: false })
                    .limit(50);

                if (turmasError) {
                    logger.error(`Erro ao buscar turmas: ${turmasError.message}`);
                    return res.status(500).json({ erro: 'Erro ao buscar turmas.' });
                }

                const turmas = (turmasRows ?? []).map((row) => ({
                    turma: row.turma ?? '',
                    anoPeriodo: row.ano_periodo ?? '',
                    docente: row.docente ?? '',
                    horario: row.horario ?? '',
                    local: row.local ?? '',
                    vagasOfertadas: row.vagas_ofertadas ?? null,
                    vagasOcupadas: row.vagas_ocupadas ?? null,
                    vagasSobrando: row.vagas_sobrando ?? null,
                    lastUpdatedAt: row.last_updated_at ?? row.updated_at ?? null,
                }));

                const ultimaAtualizacaoTurmas = turmas
                    .map((t) => t.lastUpdatedAt)
                    .filter((v) => typeof v === 'string')
                    .sort()
                    .reverse()[0] ?? null;

                return res.json({ turmas, ultimaAtualizacaoTurmas });
            } catch (error) {
                const requestId = registrarFalha(logger, 'Erro interno ao buscar turmas', error);
                return res.status(500).json({ erro: 'Erro ao buscar turmas.', requestId });
            }
        }),

        'prerequisitos-by-codigo': new Pair(RequestType.GET, async (req: Request, res: Response) => {
            const logger = createControllerLogger('AssistenteController', 'prerequisitos-by-codigo');
            const codigoRaw = String(req.query.codigo ?? '').trim().toUpperCase();

            if (!codigoRaw) {
                return res.status(400).json({ erro: "Informe o parâmetro 'codigo'." });
            }

            try {
                const { data: materiaRows, error: materiaError } = await SupabaseWrapper.get()
                    .from('materias')
                    .select('id_materia')
                    .eq('codigo_materia', codigoRaw)
                    .limit(1);

                if (materiaError) {
                    logger.error(`Erro ao buscar matéria: ${materiaError.message}`);
                    return res.status(500).json({ erro: 'Erro ao buscar matéria.' });
                }

                if (!materiaRows || materiaRows.length === 0) {
                    return res.json({ prerequisitos: [] });
                }

                const idMateria = Number(materiaRows[0].id_materia);
                const { data: prereqRows, error: prereqError } = await SupabaseWrapper.get()
                    .from('pre_requisitos')
                    .select('id_materia_requisito, expressao_original, expressao_logica, materias:id_materia_requisito(codigo_materia, nome_materia)')
                    .eq('id_materia', idMateria);

                if (prereqError) {
                    logger.error(`Erro ao buscar pré-requisitos: ${prereqError.message}`);
                    return res.status(500).json({ erro: 'Erro ao buscar pré-requisitos.' });
                }

                return res.json({ prerequisitos: prereqRows ?? [] });
            } catch (error) {
                const requestId = registrarFalha(logger, 'Erro interno ao buscar pré-requisitos', error);
                return res.status(500).json({ erro: 'Erro ao buscar pré-requisitos.', requestId });
            }
        }),
    },
};