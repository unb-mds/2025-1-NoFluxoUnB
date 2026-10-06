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
import { MaritacaSemCreditosError, isMaritacaSemCreditos } from '../config/maritaca_errors';

/**
 * Marcador em ai_usage_log.erro_codigo (migration 20260930_ai_saldo.sql) da
 * falha por falta de créditos na Maritaca. O dashboard admin mostra
 * "Créditos acabaram" quando há uma linha dessas nas últimas 24h.
 */
export const ERRO_CODIGO_SEM_CREDITOS = MaritacaSemCreditosError.code;

/** Código do erro para a coluna erro_codigo (null = nenhum marcador). */
export function erroCodigoDoErro(erro: unknown): string | null {
    if (erro === undefined || erro === null) return null;
    return isMaritacaSemCreditos(erro) ? ERRO_CODIGO_SEM_CREDITOS : null;
}

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
 * Uso parcial preso a um erro: o que o modelo já cobrou antes de a pergunta
 * falhar (ex.: o loop de tools do PlanejadorAgenteService quebra na 3ª
 * chamada — as duas primeiras já foram pagas). O controller loga com
 * success=false; a pergunta continua estornada (a regra da cota não muda).
 */
const USAGE_PARCIAL = Symbol.for("nofluxo.usageParcial");

export function anexarUsageParcial<E>(erro: E, usage: LlmUsage[]): E {
    if (erro && typeof erro === "object") {
        try {
            Object.defineProperty(erro, USAGE_PARCIAL, { value: [...usage], configurable: true });
        } catch {
            /* objeto congelado: segue sem o parcial */
        }
    }
    return erro;
}

export function usageParcialDoErro(erro: unknown): LlmUsage[] {
    if (!erro || typeof erro !== "object") return [];
    const u = (erro as Record<symbol, unknown>)[USAGE_PARCIAL];
    return Array.isArray(u) ? (u as LlmUsage[]) : [];
}

/**
 * Usage acumulado de um run do @openai/agents (RunContext.usage) numa linha do
 * log. O @openai/agents-openai confia em `usage.total_tokens ?? 0` da resposta
 * sem recalcular — mesma falha já vista na Maritaca via mcp_agent — então o
 * total é recalculado da soma quando vier zerado.
 */
export function usageDoAgente(
    usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null | undefined,
    model: string
): LlmUsage[] {
    if (!usage) return [];
    const prompt_tokens = usage.inputTokens ?? 0;
    const completion_tokens = usage.outputTokens ?? 0;
    return [{
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens: usage.totalTokens || (prompt_tokens + completion_tokens),
    }];
}

/**
 * Registra uso de IA em ai_usage_log. Fire-and-forget: nunca lança nem
 * bloqueia a resposta ao usuário.
 *
 * `usage` vazio/ausente significa que nenhum modelo foi chamado — o chamador
 * não deve logar nesse caso (ver PlanejadorAgenteService: comandos diretos como
 * `/turmas` respondem sem LLM). Se ainda assim chegar vazio (ex.: erro antes de
 * qualquer resposta do modelo), grava UMA linha com 0 tokens e o modelo de
 * `modeloPadrao` (ou 'desconhecido'), para a requisição — e a falha — não
 * sumirem do dashboard.
 */
export function logAiUsage(params: {
    endpoint: string;
    durationMs: number;
    success: boolean;
    requestExcerpt: string;
    usage?: LlmUsage[];
    userId?: string | null;
    perguntaId?: string | null;
    /** Modelo da linha única gravada quando `usage` vem vazio. */
    modeloPadrao?: string;
    /**
     * O erro da falha (o que caiu no catch, ou a mensagem de erro do
     * upstream). Se for o 403 de saldo da Maritaca, a linha sai com
     * erro_codigo = 'ai_sem_creditos' — o evento que o alerta de saldo lê.
     */
    erro?: unknown;
}): void {
    const ctx = contextoIAAtual();
    const userId = params.userId ?? ctx.userId ?? null;
    const perguntaId = params.perguntaId ?? ctx.perguntaId ?? null;
    const erroCodigo = params.success ? null : erroCodigoDoErro(params.erro);
    void (async () => {
        try {
            const calls = params.usage && params.usage.length > 0
                ? params.usage
                : [{ model: params.modeloPadrao ?? 'desconhecido', prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }];
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
                // Só quando há marcador: sem a migration 20260930 a coluna não
                // existe e as linhas comuns seguem sendo gravadas.
                ...(erroCodigo ? { erro_codigo: erroCodigo } : {}),
            }));
            let { error } = await SupabaseWrapper.get().from('ai_usage_log').insert(rows);
            if (error && erroCodigo) {
                // Banco sem a coluna erro_codigo: não perde o custo da falha.
                console.error('[logAiUsage] insert com erro_codigo falhou, gravando sem ele:', error.message);
                ({ error } = await SupabaseWrapper.get().from('ai_usage_log')
                    .insert(rows.map(({ erro_codigo: _e, ...r }) => r)));
            }
            if (error) console.error('[logAiUsage] insert falhou:', error.message);
        } catch (e) {
            console.error('[logAiUsage] erro inesperado:', e);
        }
    })();
}
