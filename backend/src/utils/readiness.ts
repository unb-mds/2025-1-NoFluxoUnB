import { Request, Response } from 'express';
import { SupabaseWrapper } from '../supabase_wrapper';

// Readiness do backend (pré-mortem 27/09/2026, R54).
//
// /health é liveness: só diz que o processo responde, sem tocar em dependência
// nenhuma — se virasse checagem de banco, uma instabilidade do Supabase faria o
// k8s reiniciar os pods em loop. /ready diz se o pod consegue atender de fato:
// consulta o Supabase com prazo curto e responde 503 se ele falhar, demorar
// demais ou se o processo estiver drenando para desligar (R55).

// Recebe um AbortSignal para a consulta poder ser cancelada no timeout.
export type ReadinessProbe = (signal: AbortSignal) => PromiseLike<void>;

export const DEFAULT_READINESS_TIMEOUT_MS = 2_000;

export async function checkReadiness(probe: ReadinessProbe, timeoutMs = DEFAULT_READINESS_TIMEOUT_MS): Promise<boolean> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>(resolve => {
        timer = setTimeout(() => {
            controller.abort();
            resolve(false);
        }, timeoutMs);
    });
    try {
        return await Promise.race([
            Promise.resolve(probe(controller.signal)).then(() => true),
            timeout,
        ]);
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

export interface ReadyHandlerOptions {
    probe: ReadinessProbe;
    timeoutMs?: number;
    isShuttingDown?: () => boolean;
}

export function createReadyHandler(options: ReadyHandlerOptions) {
    const { probe, timeoutMs = DEFAULT_READINESS_TIMEOUT_MS, isShuttingDown = () => false } = options;
    return async (_req: Request, res: Response) => {
        if (isShuttingDown()) {
            res.status(503).json({ status: 'shutting_down' });
            return;
        }
        const ok = await checkReadiness(probe, timeoutMs);
        if (ok) {
            res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
        } else {
            res.status(503).json({ status: 'unavailable' });
        }
    };
}

// Consulta mínima no Supabase: HEAD em uma tabela pequena, sem trazer linhas.
// Erro de rede, de chave ou de PostgREST vira exceção e, portanto, 503.
export const supabaseProbe: ReadinessProbe = async (signal) => {
    const { error } = await SupabaseWrapper.get()
        .from('cursos')
        .select('id_curso', { head: true })
        .limit(1)
        .abortSignal(signal);
    if (error) throw new Error(error.message);
};
