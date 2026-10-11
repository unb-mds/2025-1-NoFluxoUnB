/**
 * Linha de custo do POST /assistente/analyze (RAGFlow).
 *
 * O RAGFlow não informa qual LLM usou por trás do agente, então a linha sai com
 * model 'ragflow' — sem preço em ai_pricing, o dashboard mostra o alerta "sem
 * preço cadastrado" em vez de um custo R$ 0 silencioso. Tokens só quando a
 * resposta trouxer um objeto `usage` (formato OpenAI) em `data`; senão a
 * chamada é registrada com 0 tokens (conta como chamada, não como custo).
 */

import type { LlmUsage } from './ai_usage_logger';
import type { RagflowResponse } from '../services/ragflow.types';

export const RAGFLOW_MODEL = 'ragflow';

const inteiro = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

export function usageDoRagflow(resposta: RagflowResponse | undefined | null): LlmUsage[] {
    const u = (resposta?.data as Record<string, unknown> | undefined)?.usage as Record<string, unknown> | undefined;
    const prompt_tokens = inteiro(u?.prompt_tokens);
    const completion_tokens = inteiro(u?.completion_tokens);
    const total_tokens = inteiro(u?.total_tokens) || prompt_tokens + completion_tokens;
    return [{ model: RAGFLOW_MODEL, prompt_tokens, completion_tokens, total_tokens }];
}
