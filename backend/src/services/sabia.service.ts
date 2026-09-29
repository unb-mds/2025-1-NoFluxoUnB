/**
 * Sabiá AI Agent Service
 * Integrates with the FastAPI-based Sabiá agent (api_producao.py).
 * Makes HTTP requests to the Python FastAPI server for AI recommendations.
 */

import logger from '../logger';
import { Response } from 'express';

/** Teto de termos por busca semântica (espelha MAX_TERMOS_BUSCA do mcp_agent). */
export const MAX_TERMOS_BUSCA = 4;
const MAX_CHARS_TERMO = 80;

export interface SabiaDisciplina {
    codigo: string;
    nome: string;
    nota: number;
    justificativa: string;
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

export class SabiaService {
    private readonly apiUrl: string;
    private readonly available: boolean;

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
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`FastAPI returned ${response.status}: ${errorText}`);
            }

            const result = await response.json() as SabiaResponse;
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
            
            // Check if it's a connection error
            if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
                throw new Error('Cannot connect to Sabiá API. Make sure api_producao.py is running on ' + this.apiUrl);
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
                body: JSON.stringify({ termos_busca: termos }),
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
     */
    async analyzarInteresseStream(interesse: string, matrizCurricular: string = '', res: Response): Promise<{ usage?: SabiaUsage[] }> {
        if (!this.available) {
            throw new Error('Sabiá service is not configured');
        }

        logger.info(`[SabiaService] Streaming interesse: "${interesse}"`);

        const response = await fetch(`${this.apiUrl}/recomendar-stream`, {
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify({
                interesse,
                matriz_curricular: matrizCurricular,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`FastAPI returned ${response.status}: ${errorText}`);
        }

        if (!response.body) {
            throw new Error('No response body from FastAPI stream');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let usage: SabiaUsage[] | undefined;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
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
            // Sobra sem `\n\n` final (não deveria conter o evento usage, que sempre
            // fecha com o delimitador) — repassa como está.
            if (buffer) {
                res.write(buffer);
            }
        } finally {
            res.end();
        }

        return { usage };
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