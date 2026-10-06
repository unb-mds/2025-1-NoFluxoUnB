/**
 * AI Assistant Service
 * Proxies messages to the AI agent backend
 * Supports both RAGFlow and Sabiá AI agents
 */

import { config } from '$lib/config';
import { apiRequest } from '$lib/utils/api';
import { authService } from '$lib/services/auth.service';
import { ErroIA, type CotaIA } from '$lib/utils/darcy-cota';
import type { PlannerChatMessage } from '$lib/types/plano-formatura';

/**
 * Headers das chamadas de IA: o backend exige login (401 LOGIN_NECESSARIO sem
 * token) e desconta a pergunta da cota do aluno do token.
 */
async function headersIA(): Promise<Record<string, string>> {
	return { ...(await authService.getAuthHeaders()), 'Content-Type': 'application/json' };
}

/** planoInput enviado quando o aluno está logado (acende as tools de plano/histórico). */
export interface AssistentePlanoInput {
	curriculoCompleto: string;
	codigosConcluidos: string[];
	semestreAtual: number;
	limiteCreditos: number;
	objetivo: 'velocidade' | 'equilibrio';
	trabalha: boolean;
}

export interface AssistenteChatResponse {
	reply: string;
	plano?: unknown;
	restricoes?: unknown;
	/** Cota diária do aluno já contando esta pergunta (rodinha do chat). */
	cota?: CotaIA;
}

interface AssistenteRequest {
    materia: string;
    matriz_curricular?: string; // 1. ADICIONADO: Nova propriedade para enviar ao backend
}

interface AssistenteResponse {
    resultado?: string;
    erro?: string;
    cota?: CotaIA;
    agente?: 'ragflow' | 'sabia';
    disciplinas?: Array<{
        codigo: string;
        nome: string;
        nota: number;
        justificativa: string;
    }>;
}

export type AgentType = 'ragflow' | 'sabia';

export interface StreamEvent {
    stage: 'thinking' | 'searching' | 'generating' | 'disciplina' | 'done' | 'error' | 'cota';
    message?: string;
    /** Evento `cota`: estado da cota diária já contando esta pergunta. */
    cota?: CotaIA;
    data?: {
        codigo: string;
        nome: string;
        nota: number;
        justificativa: string;
    };
    resultado?: string;
}

export class AssistenteService {
    private readonly ragflowEndpoint = '/assistente/analyze';
    private readonly sabiaEndpoint = '/assistente/analyze-sabia';
    private readonly sabiaStreamEndpoint = '/assistente/analyze-sabia-stream';

    /**
     * Chat-agente da aba Assistente — mesmo motor de tool-calling do planejador.
     * Envia histórico + (opcional) planoInput. Com planoInput + login, o backend
     * monta o contexto completo do aluno e libera todas as tools; sem ele, só as
     * genéricas. Usa apiRequest para levar os headers de autenticação.
     */
    async chatAgente(
        messages: PlannerChatMessage[],
        planoInput?: AssistentePlanoInput | null,
        restricoes?: unknown,
        contexto?: 'montador'
    ): Promise<AssistenteChatResponse> {
        const body: Record<string, unknown> = { messages };
        if (planoInput) {
            body.planoInput = {
                curriculo_completo: planoInput.curriculoCompleto,
                codigos_concluidos: planoInput.codigosConcluidos,
                semestre_atual: planoInput.semestreAtual,
                limite_creditos: planoInput.limiteCreditos,
                objetivo: planoInput.objetivo === 'velocidade' ? 'velocidade' : 'equilibrado',
                trabalha: planoInput.trabalha
            };
            if (restricoes) body.restricoes = restricoes;
        }
        // Contexto do Montador de Grade → backend filtra recomendações por oferta.
        if (contexto) body.contexto = contexto;

        const { data, error, status } = await apiRequest<AssistenteChatResponse>('/assistente/chat', {
            method: 'POST',
            body
        });

        if (error || !data) {
            throw new ErroIA(status, error ?? '', 'assistente');
        }
        return data;
    }

    /**
     * Send a message to the AI assistant using the specified agent
     * @param message The user's message
     * @param agent Which AI agent to use ('ragflow' or 'sabia')
     * @returns The AI response text
     */
    async sendMessage(message: string, agent: AgentType = 'sabia'): Promise<string> {
        const endpoint = agent === 'sabia' ? this.sabiaEndpoint : this.ragflowEndpoint;
        const url = `${config.apiUrl}${endpoint}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: await headersIA(),
                body: JSON.stringify({ materia: message } satisfies AssistenteRequest)
            });

            if (!response.ok) {
                throw new ErroIA(response.status, await response.text(), endpoint);
            }

            const data: AssistenteResponse = await response.json();

            if (data.erro) {
                throw new Error(data.erro);
            }

            return data.resultado || 'Sem resposta da IA.';
        } catch (error) {
            if (error instanceof ErroIA) throw error;
            if (error instanceof Error) {
                throw new Error(`Erro ao se comunicar com a IA: ${error.message}`);
            }
            throw new Error('Erro ao se comunicar com a IA.');
        }
    }

    /**
     * Send a message specifically to the Sabiá AI agent
     * @param message The user's message
     * @returns The AI response with structured data
     */
    async sendMessageToSabia(message: string): Promise<AssistenteResponse> {
        const url = `${config.apiUrl}${this.sabiaEndpoint}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: await headersIA(),
                body: JSON.stringify({ materia: message } satisfies AssistenteRequest)
            });

            if (!response.ok) {
                throw new ErroIA(response.status, await response.text(), this.sabiaEndpoint);
            }

            const data: AssistenteResponse = await response.json();

            if (data.erro) {
                throw new Error(data.erro);
            }

            return data;
        } catch (error) {
            if (error instanceof ErroIA) throw error;
            if (error instanceof Error) {
                throw new Error(`Erro ao se comunicar com o Sabiá: ${error.message}`);
            }
            throw new Error('Erro ao se comunicar com o Sabiá.');
        }
    }

    /**
     * Stream a message to the Sabiá AI agent via SSE
     * @param message The user's message
     * @param matrizCurricular A matriz curricular extraída do frontend (NOVO PARÂMETRO)
     * @param onEvent Callback for each streamed event
     */
    async streamMessageFromSabia(
        message: string,
        matrizCurricularOrOnEvent: string | ((event: StreamEvent) => void),
        onEventMaybe?: (event: StreamEvent) => void
    ): Promise<void> {
        const url = `${config.apiUrl}${this.sabiaStreamEndpoint}`;

        // Backward-compatible signatures:
        // - streamMessageFromSabia(message, onEvent)
        // - streamMessageFromSabia(message, matrizCurricular, onEvent)
        const hasMatriz = typeof matrizCurricularOrOnEvent === 'string';
        const matrizCurricular = hasMatriz ? matrizCurricularOrOnEvent : undefined;
        const onEvent = hasMatriz ? onEventMaybe : matrizCurricularOrOnEvent;

        if (typeof onEvent !== 'function') {
            throw new Error('Callback de stream inválido.');
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: await headersIA(),
            // 3. ADICIONADO: Injetando a matriz_curricular no payload
            body: JSON.stringify({ 
                materia: message,
                matriz_curricular: matrizCurricular 
            } satisfies AssistenteRequest)
        });

        if (!response.ok) {
            throw new ErroIA(response.status, await response.text(), this.sabiaStreamEndpoint);
        }

        if (!response.body) {
            throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events from the buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const event: StreamEvent = JSON.parse(line.slice(6));
                        onEvent(event);
                    } catch {
                        // Skip malformed events
                    }
                }
            }
        }

        // Process any remaining buffer
        if (buffer.startsWith('data: ')) {
            try {
                const event: StreamEvent = JSON.parse(buffer.slice(6));
                onEvent(event);
            } catch {
                // Skip malformed events
            }
        }
    }
}

// Singleton
export const assistenteService = new AssistenteService();