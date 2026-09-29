/**
 * Logger compartilhado de uso de IA — grava em `ai_usage_log` (custo no
 * dashboard admin, `get_ai_cost_metrics` faz JOIN com `ai_pricing` por `model`).
 *
 * Extraído de assistente_controller.ts pra ser reusado por qualquer endpoint
 * que chame um LLM (Sabiá, PlanejadorAgenteService, orquestrador via
 * @openai/agents) — antes só o endpoint de recomendação Sabiá logava, e nem
 * esse é o caminho que o chat de verdade usa hoje.
 *
 * Rastreabilidade (migration 20260929_darcy_cota.sql): cada linha leva o
 * `user_id` (auth.users.id de quem perguntou) e o `pergunta_id` (agrupa as
 * chamadas ao modelo feitas para a mesma pergunta). Os dois vêm dos parâmetros
 * ou, se ausentes, do contexto da requisição (`executarComContextoIA`) — assim
 * serviços chamados no meio da pergunta (ex.: a avaliação de dificuldade no
 * lazy load do plano) também ficam atribuídos sem passar o id de mão em mão.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { SupabaseWrapper } from '../supabase_wrapper';

export interface LlmUsage {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface ContextoIA {
    userId?: string;
    perguntaId?: string;
}

const contextoIA = new AsyncLocalStorage<ContextoIA>();

/** Roda `fn` com o usuário/pergunta atuais visíveis para logAiUsage. */
export function executarComContextoIA<T>(ctx: ContextoIA, fn: () => T): T {
    return contextoIA.run(ctx, fn);
}

/** Contexto da requisição corrente (vazio fora de executarComContextoIA). */
export function contextoIAAtual(): ContextoIA {
    return contextoIA.getStore() ?? {};
}

/**
 * Registra uso de IA em ai_usage_log. Fire-and-forget: nunca lança nem
 * bloqueia a resposta ao usuário.
 *
 * `usage` vazio/ausente significa que nenhum modelo foi chamado — o chamador
 * não deve logar nesse caso (ver PlanejadorAgenteService: comandos diretos como
 * `/turmas` respondem sem LLM). Se ainda assim chegar vazio, grava uma linha
 * com model 'desconhecido' para a requisição não sumir do dashboard.
 */
export function logAiUsage(params: {
    endpoint: string;
    durationMs: number;
    success: boolean;
    requestExcerpt: string;
    usage?: LlmUsage[];
    userId?: string | null;
    perguntaId?: string | null;
}): void {
    const ctx = contextoIAAtual();
    const userId = params.userId ?? ctx.userId ?? null;
    const perguntaId = params.perguntaId ?? ctx.perguntaId ?? null;
    void (async () => {
        try {
            const calls = params.usage && params.usage.length > 0
                ? params.usage
                : [{ model: 'desconhecido', prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }];
            const rows = calls.map((u) => ({
                endpoint: params.endpoint,
                model: u.model,
                prompt_tokens: u.prompt_tokens ?? 0,
                completion_tokens: u.completion_tokens ?? 0,
                total_tokens: u.total_tokens ?? 0,
                duration_ms: params.durationMs,
                success: params.success,
                request_excerpt: params.requestExcerpt.slice(0, 120),
                user_id: userId,
                pergunta_id: perguntaId,
            }));
            const { error } = await SupabaseWrapper.get().from('ai_usage_log').insert(rows);
            if (error) console.error('[logAiUsage] insert falhou:', error.message);
        } catch (e) {
            console.error('[logAiUsage] erro inesperado:', e);
        }
    })();
}
