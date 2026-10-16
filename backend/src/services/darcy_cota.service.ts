/**
 * Cota diária de perguntas ao Darcy e teto global de custo.
 *
 * O estado mora no banco (migration 20260929_darcy_cota.sql): a reserva é uma
 * única instrução SQL que incrementa e checa o limite juntas, então duas abas
 * perguntando ao mesmo tempo não passam do limite. O "dia" é o de Brasília e
 * renova à meia-noite (America/Sao_Paulo).
 *
 * Admins do sistema (tabela `admins`) não têm cota diária: a pergunta não é
 * contada e a cota volta com `ilimitado: true`. O teto global de custo continua
 * valendo para todo mundo.
 *
 * Configuração por env:
 *   AI_COTA_DIARIA     perguntas por usuário por dia (padrão 30);
 *   AI_TETO_DIARIO_RS  custo máximo de IA no dia, em R$ (padrão 15).
 */

import { SupabaseWrapper } from '../supabase_wrapper';

export const COTA_DIARIA_PADRAO = 30;
export const TETO_DIARIO_PADRAO_RS = 15;
/** Por quanto tempo o custo do dia fica em cache (não consulta o banco a cada pergunta). */
export const TETO_CACHE_MS = 60_000;

export interface CotaIA {
    usadas: number;
    limite: number;
    restantes: number;
    /** ISO 8601 da próxima meia-noite de Brasília. */
    renova_em: string;
    /** Admin: sem limite diário (o app esconde a rodinha e nunca bloqueia). */
    ilimitado?: true;
}

export interface ReservaCota {
    permitido: boolean;
    cota: CotaIA;
    /** Dia (YYYY-MM-DD, Brasília) em que a pergunta foi contada — usado no estorno. */
    dia: string;
}

function inteiroNaoNegativo(valor: string | undefined, padrao: number): number {
    const n = Number.parseInt(valor ?? '', 10);
    return Number.isInteger(n) && n >= 0 ? n : padrao;
}

export function cotaDiariaPadrao(env: NodeJS.ProcessEnv = process.env): number {
    return inteiroNaoNegativo(env.AI_COTA_DIARIA, COTA_DIARIA_PADRAO);
}

export function tetoDiarioRs(env: NodeJS.ProcessEnv = process.env): number {
    const n = Number.parseFloat(env.AI_TETO_DIARIO_RS ?? '');
    return Number.isFinite(n) && n >= 0 ? n : TETO_DIARIO_PADRAO_RS;
}

function paraCota(row: { usadas: number; limite: number; renova_em: string }): CotaIA {
    const usadas = Number(row.usadas) || 0;
    const limite = Number(row.limite) || 0;
    return {
        usadas,
        limite,
        restantes: Math.max(0, limite - usadas),
        renova_em: new Date(row.renova_em).toISOString(),
    };
}

function primeiraLinha<T>(data: unknown): T | null {
    if (Array.isArray(data)) return (data[0] as T) ?? null;
    return (data as T) ?? null;
}

/** Próxima meia-noite de Brasília (UTC-3, sem horário de verão desde 2019). */
export function proximaMeiaNoiteBrasilia(agora: number = Date.now()): string {
    const BRASILIA_MS = 3 * 60 * 60 * 1000;
    const local = new Date(agora - BRASILIA_MS);
    const meiaNoiteLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
    return new Date(meiaNoiteLocal + BRASILIA_MS).toISOString();
}

/** Cota de admin: sem limite, nada contado. */
export function cotaIlimitada(agora: number = Date.now()): CotaIA {
    return { usadas: 0, limite: 0, restantes: 0, renova_em: proximaMeiaNoiteBrasilia(agora), ilimitado: true };
}

/** Por quanto tempo "é admin?" fica em cache por usuário. */
export const ADMIN_CACHE_MS = 60_000;
const cacheAdmin = new Map<string, { admin: boolean; em: number }>();

/** Só para testes. */
export function _limparCacheAdmin(): void {
    cacheAdmin.clear();
}

/**
 * True se o usuário (auth.users.id) está na tabela `admins`. Se o banco falhar,
 * devolve false: na dúvida a cota vale (nunca libera uso ilimitado por erro).
 */
export async function ehAdminSemCota(userId: string, agora: number = Date.now()): Promise<boolean> {
    const salvo = cacheAdmin.get(userId);
    if (salvo && agora - salvo.em < ADMIN_CACHE_MS) return salvo.admin;
    try {
        const { data, error } = await SupabaseWrapper.get()
            .from('admins')
            .select('auth_id')
            .eq('auth_id', userId)
            .limit(1);
        if (error) throw new Error(error.message);
        const admin = Array.isArray(data) && data.length > 0;
        cacheAdmin.set(userId, { admin, em: agora });
        return admin;
    } catch (e) {
        console.error('[darcy_cota] checagem de admin falhou:', e instanceof Error ? e.message : e);
        return false;
    }
}

/** Reserva uma pergunta. Lança se o banco falhar (o chamador decide o que fazer). */
export async function reservarPergunta(userId: string): Promise<ReservaCota> {
    const { data, error } = await SupabaseWrapper.get().rpc('darcy_reservar_pergunta', {
        p_user_id: userId,
        p_limite_padrao: cotaDiariaPadrao(),
    });
    if (error) throw new Error(`darcy_reservar_pergunta: ${error.message}`);
    const row = primeiraLinha<{ permitido: boolean; usadas: number; limite: number; dia: string; renova_em: string }>(data);
    if (!row) throw new Error('darcy_reservar_pergunta não devolveu linha');
    return { permitido: row.permitido === true, cota: paraCota(row), dia: String(row.dia) };
}

/** Devolve a pergunta reservada (a IA falhou). Nunca lança. */
export async function estornarPergunta(userId: string, dia: string): Promise<void> {
    try {
        const { error } = await SupabaseWrapper.get().rpc('darcy_estornar_pergunta', {
            p_user_id: userId,
            p_dia: dia,
        });
        if (error) console.error(`[darcy_cota] estorno falhou (${userId}, ${dia}): ${error.message}`);
    } catch (e) {
        console.error('[darcy_cota] estorno falhou:', e);
    }
}

/** Estado atual sem consumir (rodinha ao abrir a página). Admin: `cotaIlimitada`. */
export async function estadoCota(userId: string): Promise<CotaIA> {
    if (await ehAdminSemCota(userId)) return cotaIlimitada();
    const { data, error } = await SupabaseWrapper.get().rpc('darcy_estado_cota', {
        p_user_id: userId,
        p_limite_padrao: cotaDiariaPadrao(),
    });
    if (error) throw new Error(`darcy_estado_cota: ${error.message}`);
    const row = primeiraLinha<{ usadas: number; limite: number; renova_em: string }>(data);
    if (!row) throw new Error('darcy_estado_cota não devolveu linha');
    return paraCota(row);
}

let cacheCusto: { valor: number; em: number } | null = null;

/** Só para testes. */
export function _limparCacheTeto(): void {
    cacheCusto = null;
}

/**
 * True quando o custo de IA do dia (Brasília) já bateu o teto global. Usa cache
 * de TETO_CACHE_MS. Se o banco falhar, NÃO bloqueia (loga): a cota por usuário
 * continua valendo e um erro de leitura não deve derrubar o assistente.
 */
export async function tetoGlobalAtingido(agora: number = Date.now()): Promise<boolean> {
    const teto = tetoDiarioRs();
    if (!cacheCusto || agora - cacheCusto.em >= TETO_CACHE_MS) {
        try {
            const { data, error } = await SupabaseWrapper.get().rpc('darcy_custo_ia_hoje');
            if (error) throw new Error(error.message);
            cacheCusto = { valor: Number(data) || 0, em: agora };
        } catch (e) {
            console.error('[darcy_cota] custo do dia indisponível:', e instanceof Error ? e.message : e);
            return false;
        }
    }
    return cacheCusto.valor >= teto;
}
