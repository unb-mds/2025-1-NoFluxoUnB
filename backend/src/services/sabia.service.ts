/**
 * Sabiá AI Agent Service
 * Integrates with the FastAPI-based Sabiá agent (api_producao.py).
 * Makes HTTP requests to the Python FastAPI server for AI recommendations.
 */

import logger from '../logger';
import { Response } from 'express';
import { ERRO_IA_GENERICO, registrarFalha } from '../utils/erro_publico';
import { anexarUsageParcial, contextoIAAtual } from '../utils/ai_usage_logger';

/**
 * Mensagens de erro que o próprio mcp_agent escreve para o usuário
 * (api_producao.py). Qualquer outra — `str(e)` de exceção, corpo de erro do
 * provedor — fica só no log (pré-mortem 27/09/2026, R34).
 */
const MENSAGENS_SABIA_PUBLICAS = new Set(['Envie o historico academico']);

export function isMensagemSabiaPublica(msg: unknown): boolean {
    return typeof msg === 'string' && MENSAGENS_SABIA_PUBLICAS.has(msg.trim());
}

/**
 * Tetos das chamadas ao mcp_agent. Sem `signal`, um upstream pendurado (Python
 * ou Maritaca) deixava a request do aluno esperando sem limite.
 *
 * /recomendar é SEM stream: faz o roteamento (sabiazinho-4, até 60s) e a geração
 * final (sabia-4, até 240s — sem stream o read timeout do httpx é o teto da
 * geração inteira), cada uma com connect de 10s e sem retry (ver
 * mcp_agent/sabia_utils.py). O teto aqui fica ACIMA dessa soma (320s) mais a
 * busca no banco, para o backend não devolver 504 enquanto o Python ainda gera
 * (e a Maritaca cobra). test_sabia_utils.py confere essa relação.
 *
 * /buscar-materias é só embedding + RPC. O stream usa timeout de INATIVIDADE
 * (tempo máximo sem chegar chunk), não total, para não cortar geração longa; ele
 * fica acima dos 90s de inatividade / 60s do roteamento do lado Python.
 */
export const SABIA_TIMEOUT_MS = 360_000;
export const SABIA_BUSCA_TIMEOUT_MS = 15_000;
export const SABIA_STREAM_IDLE_TIMEOUT_MS = 120_000;

/** Upstream do Sabiá não respondeu dentro do teto — o controller devolve 504. */
export class SabiaTimeoutError extends Error {
    constructor() {
        super('Sabiá demorou demais para responder. Tente novamente em instantes.');
        this.name = 'SabiaTimeoutError';
    }
}

/** O fetch rejeita com DOMException (TimeoutError/AbortError), checada pelo nome. */
function isAbortOuTimeout(error: unknown): boolean {
    const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
    return name === 'TimeoutError' || name === 'AbortError';
}

/** Teto de termos por busca semântica (espelha MAX_TERMOS_BUSCA do mcp_agent). */
export const MAX_TERMOS_BUSCA = 4;
const MAX_CHARS_TERMO = 80;

export interface SabiaDisciplina {
    codigo: string;
    nome: string;
    nota: number;
    justificativa: string;
}

const CODIGO_DISCIPLINA = /^[A-Z]{3}\d{4}$/;

/**
 * Validação em runtime do que vem do mcp_agent (o tipo SabiaDisciplina é só
 * compile-time): descarta código fora do padrão AAA9999 e limita a nota a 0-10.
 * Antes uma nota "8.5" parseada como 85 chegava ao front como "85/10".
 */
export function sanitizarDisciplinas(disciplinas: unknown): SabiaDisciplina[] {
    if (!Array.isArray(disciplinas)) return [];
    const out: SabiaDisciplina[] = [];
    for (const d of disciplinas) {
        if (!d || typeof d !== 'object') continue;
        const { codigo, nome, nota, justificativa } = d as Record<string, unknown>;
        if (typeof codigo !== 'string' || !CODIGO_DISCIPLINA.test(codigo)) continue;
        const notaNum = typeof nota === 'number' && Number.isFinite(nota) ? nota : 7;
        out.push({
            codigo,
            nome: typeof nome === 'string' ? nome : '',
            nota: Math.min(10, Math.max(0, notaNum)),
            justificativa: typeof justificativa === 'string' ? justificativa : '',
        });
    }
    return out;
}

export interface SabiaUsage {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface SabiaResponse {
    success: boolean;
    disciplinas?: SabiaDisciplina[];
    resposta_completa?: string;
    error?: string;
    /** Uso de tokens por chamada de modelo (vindo do FastAPI). */
    usage?: SabiaUsage[];
}

/** Ping do /health do mcp_agent: timeout e validade do resultado em cache. */
export const SABIA_PING_TIMEOUT_MS = 2000;
export const SABIA_PING_CACHE_MS = 30_000;

export interface ResultadoStreamSabia {
    usage?: SabiaUsage[];
    /** O cliente fechou a conexão antes do fim. */
    aborted: boolean;
    /** Algum evento `disciplina` ou `done` foi repassado ao cliente. */
    entregouConteudo: boolean;
    /**
     * Algum byte chegou do Python. O primeiro evento (`thinking`) sai antes da
     * 1ª chamada à Maritaca; depois dele o gerador segue e o modelo cobra mesmo
     * que o cliente saia. Só sem nada recebido a pergunta pode ser estornada.
     */
    recebeuDoUpstream: boolean;
    /** O stream terminou com `done` e sem evento de erro. */
    concluiu: boolean;
    /**
     * Mensagem crua do evento `error` do Python (não vai ao cliente): o
     * controller a usa para marcar a falha por falta de créditos da Maritaca.
     */
    erroUpstream?: string;
}

/**
 * Quem perguntou e qual pergunta (contexto da requisição, ver
 * executarComContextoIA): o mcp_agent grava junto das embeddings Gemini no
 * ai_usage_log, e a busca entra na mesma pergunta do dashboard em vez de
 * contar como outra. Vale para /buscar-materias, /recomendar e
 * /recomendar-stream.
 */
function idsDaPergunta(): { user_id: string | null; pergunta_id: string | null } {
    const ctx = contextoIAAtual();
    return { user_id: ctx.userId ?? null, pergunta_id: ctx.perguntaId ?? null };
}

export class SabiaService {
    private readonly apiUrl: string;
    private readonly available: boolean;
    private pingCache: { ok: boolean; expiraEm: number } | null = null;
    private pingEmVoo: Promise<boolean> | null = null;

    constructor() {
        this.apiUrl = process.env.SABIA_API_URL ?? 'http://localhost:8000';


        // Check if required env vars are set
        logger.info('[SabiaService] Checking environment variables...');
        logger.info(`[SabiaService] SABIA_API_URL: ${this.apiUrl}`);
        logger.info(`[SabiaService] MARITACA_API_KEY: ${process.env.MARITACA_API_KEY ? 'set' : 'MISSING'}`);
        logger.info(`[SabiaService] GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? 'set' : 'MISSING'}`);
        logger.info(`[SabiaService] SUPABASE_URL: ${process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 30) + '...' : 'MISSING'}`);
        
        const hasMaritaca = !!process.env.MARITACA_API_KEY;
        const hasGoogle = !!process.env.GOOGLE_API_KEY;
        const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        this.available = hasMaritaca && hasGoogle && hasSupabase;

        if (!this.available) {
            logger.warn('[SabiaService] Sabiá AI agent unavailable — missing configuration');
            if (!hasMaritaca) logger.warn('[SabiaService] Missing: MARITACA_API_KEY');
            if (!hasGoogle) logger.warn('[SabiaService] Missing: GOOGLE_API_KEY (for Gemini embeddings)');
            if (!hasSupabase) logger.warn('[SabiaService] Missing: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        } else {
            logger.info('[SabiaService] ✅ Sabiá AI agent initialized and ready');
            logger.info(`[SabiaService] API URL: ${this.apiUrl}`);
        }
    }

    /** Whether the Sabiá service is properly configured */
    isAvailable(): boolean {
        return this.available;
    }

    /**
     * O mcp_agent responde de verdade? isAvailable() só olha env vars, então o
     * /assistente/health dizia 'healthy' com o Python fora do ar (pré-mortem
     * 27/09/2026, R52). Timeout curto e cache em memória para o health não
     * virar amplificador de carga; pings simultâneos compartilham a mesma
     * requisição. Nunca lança.
     */
    async ping(timeoutMs: number = SABIA_PING_TIMEOUT_MS): Promise<boolean> {
        if (!this.available) return false;
        if (this.pingCache && this.pingCache.expiraEm > Date.now()) return this.pingCache.ok;
        if (this.pingEmVoo) return this.pingEmVoo;

        this.pingEmVoo = (async () => {
            let ok = false;
            try {
                const response = await fetch(`${this.apiUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
                ok = response.ok;
                if (!ok) logger.warn(`[SabiaService] /health respondeu ${response.status}`);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.warn(`[SabiaService] /health falhou: ${msg}`);
            }
            this.pingCache = { ok, expiraEm: Date.now() + SABIA_PING_CACHE_MS };
            return ok;
        })().finally(() => {
            this.pingEmVoo = null;
        });
        return this.pingEmVoo;
    }

    /**
     * Headers para chamadas ao mcp_agent (api_producao.py), que exige
     * X-API-Key igual à env var MCP_AGENT_API_KEY compartilhada entre os dois.
     */
    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (process.env.MCP_AGENT_API_KEY) {
            headers['X-API-Key'] = process.env.MCP_AGENT_API_KEY;
        }
        return headers;
    }

    /**
     * Analyze a subject interest and return recommended disciplines using Sabiá AI.
     * Makes an HTTP POST request to the FastAPI server (api_producao.py).
     * 
     * @param interesse - The subject/interest to analyze (e.g., "inteligência artificial")
     * @returns Promise with the Sabiá response containing disciplinas and justifications
     */
    async analyzarInteresse(interesse: string, matrizCurricular: string = ''): Promise<SabiaResponse> {
        if (!this.available) {
            throw new Error('Sabiá service is not configured');
        }

        logger.info(`[SabiaService] Analyzing interesse: "${interesse}"`);
        const startTime = Date.now();

        try {
            // Make HTTP POST request to FastAPI server
            const response = await fetch(`${this.apiUrl}/recomendar`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify({
                    interesse,
                    matriz_curricular: matrizCurricular,
                    ...idsDaPergunta(),
                }),
                signal: AbortSignal.timeout(SABIA_TIMEOUT_MS),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`FastAPI returned ${response.status}: ${errorText}`);
            }

            const result = await response.json() as SabiaResponse;
            if (result.disciplinas !== undefined) {
                result.disciplinas = sanitizarDisciplinas(result.disciplinas);
            }
            const duration = Date.now() - startTime;

            if (result.success) {
                logger.info(`[SabiaService] ✅ Analysis completed in ${duration}ms — ${result.disciplinas?.length || 0} disciplinas found`);
            } else {
                logger.error(`[SabiaService] ❌ Analysis failed: ${result.error || 'Unknown error'}`);
            }

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`[SabiaService] Error after ${duration}ms: ${msg}`);

            if (isAbortOuTimeout(error)) {
                throw new SabiaTimeoutError();
            }

            // Check if it's a connection error
            if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
                // A URL interna fica no log acima; a mensagem pode subir até o cliente.
                logger.error(`[SabiaService] Cannot connect to Sabiá API at ${this.apiUrl}`);
                throw new Error('Cannot connect to Sabiá API');
            }
            
            throw error;
        }
    }

    /**
     * Busca semântica pura (embeddings) via endpoint enxuto /buscar-materias do
     * FastAPI — sem LLM. Usada como TOOL pelo agente (buscar_materias_unb).
     * Retorna lista de { codigo, nome, similaridade }. Nunca lança: em erro/queda
     * do serviço Python devolve [] para o agente degradar graciosamente.
     */
    async buscarMaterias(termosBusca: string[]): Promise<Array<{ codigo: string; nome: string; similaridade: number }>> {
        if (!this.available) return [];
        // Cada termo vira 1 embedding Gemini + 1 RPC no Supabase lá no Python:
        // dedup + teto de MAX_TERMOS_BUSCA para o LLM não expandir sem limite.
        const termos = [...new Set(
            termosBusca
                .filter((t) => typeof t === 'string' && t.trim().length > 0)
                .map((t) => t.trim().slice(0, MAX_CHARS_TERMO).trim()),
        )].slice(0, MAX_TERMOS_BUSCA);
        if (termos.length === 0) return [];
        try {
            const response = await fetch(`${this.apiUrl}/buscar-materias`, {
                method: 'POST',
                headers: this.buildHeaders(),
                // Quem perguntou e qual pergunta: o Python grava junto das
                // embeddings no ai_usage_log, e a busca entra na mesma pergunta
                // do dashboard em vez de contar como outra.
                body: JSON.stringify({ termos_busca: termos, ...idsDaPergunta() }),
                signal: AbortSignal.timeout(SABIA_BUSCA_TIMEOUT_MS),
            });
            if (!response.ok) {
                logger.error(`[SabiaService] /buscar-materias retornou ${response.status}`);
                return [];
            }
            const data = await response.json() as { materias?: Array<{ codigo: string; nome: string; similaridade: number }> };
            return data.materias ?? [];
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`[SabiaService] Falha em buscarMaterias: ${msg}`);
            return [];
        }
    }

    /**
     * Stream the Sabiá AI response via SSE, piping events from the FastAPI server.
     *
     * O Python emite um evento `usage` (`stage: "usage"`) antes do `done` com os
     * tokens gastos nas chamadas Maritaca da requisição — parseado aqui e NÃO
     * repassado pro cliente (o front não o consome). Todo o resto do stream passa
     * cru, como antes. Bufferiza por `\n\n` (delimitador de evento SSE) porque um
     * evento pode chegar partido entre dois `read()` do TCP.
     *
     * `clientSignal` é abortado pelo controller quando o aluno fecha a conexão:
     * aí o fetch/reader do upstream é abortado na hora (antes o backend seguia
     * lendo — e a Maritaca cobrando — até o fim natural do stream) e nada mais é
     * escrito em `res`; retorna `aborted: true`. Se o upstream ficar
     * SABIA_STREAM_IDLE_TIMEOUT_MS sem mandar nada, lança SabiaTimeoutError.
     * Em erro, `res` fica aberto para o controller escrever o evento de erro.
     */
    async analyzarInteresseStream(
        interesse: string,
        matrizCurricular: string = '',
        res: Response,
        clientSignal?: AbortSignal,
    ): Promise<ResultadoStreamSabia> {
        if (!this.available) {
            throw new Error('Sabiá service is not configured');
        }

        logger.info(`[SabiaService] Streaming interesse: "${interesse}"`);

        // Um único controller junta os dois motivos de abortar o upstream
        // (cliente saiu / inatividade), sem depender de AbortSignal.any.
        const upstream = new AbortController();
        let timedOut = false;
        let idleTimer: ReturnType<typeof setTimeout> | undefined;
        const rearmarIdle = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                timedOut = true;
                upstream.abort();
            }, SABIA_STREAM_IDLE_TIMEOUT_MS);
        };
        const onClientAbort = () => upstream.abort();
        if (clientSignal?.aborted) upstream.abort();
        clientSignal?.addEventListener('abort', onClientAbort, { once: true });
        const clienteSaiu = () => clientSignal?.aborted === true;

        let usage: SabiaUsage[] | undefined;
        // Para a cota do Darcy: a pergunta só conta se houve resposta.
        let entregouConteudo = false; // algum `disciplina`/`done` chegou ao cliente
        let recebeuDoUpstream = false; // algum byte veio do Python (ver ResultadoStreamSabia)
        let viuDone = false;
        let viuErro = false;
        let erroUpstream: string | undefined;
        const resultado = (aborted: boolean): ResultadoStreamSabia => ({
            usage,
            aborted,
            entregouConteudo,
            recebeuDoUpstream,
            concluiu: viuDone && !viuErro,
            ...(erroUpstream !== undefined ? { erroUpstream } : {}),
        });
        try {
            rearmarIdle();
            const response = await fetch(`${this.apiUrl}/recomendar-stream`, {
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify({
                    interesse,
                    matriz_curricular: matrizCurricular,
                    ...idsDaPergunta(),
                }),
                signal: upstream.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`FastAPI returned ${response.status}: ${errorText}`);
            }

            if (!response.body) {
                throw new Error('No response body from FastAPI stream');
            }

            const reader = response.body.getReader();
            // Garante que o upstream é fechado mesmo se o body mock/implementação
            // não reagir ao signal do fetch.
            upstream.signal.addEventListener('abort', () => { reader.cancel().catch(() => {}); }, { once: true });
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (value && value.length > 0) recebeuDoUpstream = true;
                if (upstream.signal.aborted) break;
                if (done) break;
                rearmarIdle();
                buffer += decoder.decode(value, { stream: true });

                let boundary: number;
                let forward = '';
                while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                    const rawEvent = buffer.slice(0, boundary + 2);
                    buffer = buffer.slice(boundary + 2);

                    const match = rawEvent.match(/^data: (.*)\n\n$/s);
                    if (match) {
                        try {
                            const parsed = JSON.parse(match[1]);
                            if (parsed.stage === 'usage' && Array.isArray(parsed.calls)) {
                                usage = parsed.calls;
                                continue; // evento interno — não repassa pro cliente
                            }
                            if (parsed.stage === 'disciplina') entregouConteudo = true;
                            if (parsed.stage === 'done') {
                                entregouConteudo = true;
                                viuDone = true;
                            }
                            if (parsed.stage === 'error') {
                                viuErro = true;
                                erroUpstream = typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message ?? '');
                            }
                            // O Python manda `str(e)` cru no evento de erro: troca
                            // pela mensagem genérica, exceto as de orientação.
                            if (parsed.stage === 'error' && !isMensagemSabiaPublica(parsed.message)) {
                                const requestId = registrarFalha(logger, '[SabiaService] Erro no stream do FastAPI', parsed.message);
                                forward += `data: ${JSON.stringify({ stage: 'error', message: ERRO_IA_GENERICO, requestId })}\n\n`;
                                continue;
                            }
                        } catch {
                            // não parseou como JSON — repassa cru abaixo
                        }
                    }
                    forward += rawEvent;
                }

                if (forward) {
                    res.write(forward);
                    // Flush if available (for compression middleware)
                    if (typeof (res as any).flush === 'function') {
                        (res as any).flush();
                    }
                }
            }
            if (timedOut) throw new SabiaTimeoutError();
            if (clienteSaiu()) return resultado(true);

            // Sobra sem `\n\n` final (não deveria conter o evento usage, que sempre
            // fecha com o delimitador) — repassa como está.
            if (buffer) {
                res.write(buffer);
            }
            res.end();
            return resultado(false);
        } catch (error) {
            // O evento `usage` pode ter chegado antes da falha (ex.: timeout
            // depois do resumo): vai preso ao erro para o controller logar o
            // gasto real com success=false (ver usageParcialDoErro).
            if (timedOut) throw anexarUsageParcial(new SabiaTimeoutError(), usage ?? []);
            if (clienteSaiu()) return resultado(true);
            throw anexarUsageParcial(error, usage ?? []);
        } finally {
            clearTimeout(idleTimer);
            clientSignal?.removeEventListener('abort', onClientAbort);
        }
    }

    /**
     * Format the Sabiá response as Markdown ranking (compatible with frontend expectations).
     * Similar format to RAGFlow output.
     */
    formatAsMarkdown(response: SabiaResponse): string {
        if (!response.success || !response.disciplinas || response.disciplinas.length === 0) {
            return 'Esta plataforma destina-se exclusivamente à recomendação de disciplinas acadêmicas. Por gentileza, lembre-se de que a consulta é apenas sobre disciplinas acadêmicas. Reoriente sua pergunta para temas relacionados a áreas de estudo. Exemplo: "Quero aprender sobre inteligência artificial e suas aplicações".';
        }

        let markdown = `### 🎓 Disciplinas Recomendadas pelo Sabiá\n\n`;
        markdown += `Encontramos **${response.disciplinas.length} disciplinas** relacionadas ao seu interesse:\n\n`;

        response.disciplinas.forEach((disc, index) => {
            const emoji = disc.nota >= 9 ? '🌟' : disc.nota >= 7 ? '✨' : '📚';
            markdown += `${index + 1}. ${emoji} **${disc.codigo} - ${disc.nome}**\n`;
            markdown += `   - **Relevância:** ${disc.nota}/10\n`;
            markdown += `   - **Justificativa:** ${disc.justificativa}\n\n`;
        });

        if (response.resposta_completa) {
            markdown += `\n---\n\n**Análise Completa:**\n${response.resposta_completa}`;
        }

        return markdown;
    }
}