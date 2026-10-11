import { Request, Response } from 'express';
import { SupabaseWrapper } from '../src/supabase_wrapper';
import { checkReadiness, createReadyHandler, supabaseProbe } from '../src/utils/readiness';

// Pré-mortem 27/09/2026, R54: só existia /health estático, que respondia
// "healthy" mesmo com o Supabase inalcançável; não havia /ready.

jest.mock('../src/supabase_wrapper', () => ({
    SupabaseWrapper: { get: jest.fn() },
}));

function mockRes() {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res as Response & { status: jest.Mock; json: jest.Mock };
}

// Encadeamento from().select().limit().abortSignal() do supabase-js.
function mockSupabase(resultado: Promise<{ error: { message: string } | null }>) {
    const chain: any = {};
    chain.from = jest.fn(() => chain);
    chain.select = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.abortSignal = jest.fn(() => resultado);
    (SupabaseWrapper.get as jest.Mock).mockReturnValue(chain);
    return chain;
}

const handlerSupabase = (timeoutMs = 2_000, isShuttingDown?: () => boolean) =>
    createReadyHandler({ probe: supabaseProbe, timeoutMs, isShuttingDown });

describe('/ready (R54)', () => {
    it('200 quando o Supabase responde sem erro', async () => {
        const chain = mockSupabase(Promise.resolve({ error: null }));
        const res = mockRes();
        await handlerSupabase()({} as Request, res);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }));
        // HEAD, sem trazer linhas.
        expect(chain.select).toHaveBeenCalledWith(expect.any(String), { head: true });
    });

    it('503 quando o Supabase devolve erro', async () => {
        mockSupabase(Promise.resolve({ error: { message: 'down' } }));
        const res = mockRes();
        await handlerSupabase()({} as Request, res);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({ status: 'unavailable' });
    });

    it('503 quando a consulta rejeita (rede)', async () => {
        mockSupabase(Promise.reject(new Error('ECONNREFUSED')));
        const res = mockRes();
        await handlerSupabase()({} as Request, res);
        expect(res.status).toHaveBeenCalledWith(503);
    });

    it('503 dentro do prazo quando o Supabase nunca responde, e aborta a consulta', async () => {
        const chain = mockSupabase(new Promise(() => {}));
        const res = mockRes();
        const inicio = Date.now();
        await handlerSupabase(100)({} as Request, res);
        expect(Date.now() - inicio).toBeLessThan(1_000);
        expect(res.status).toHaveBeenCalledWith(503);
        const signal: AbortSignal = chain.abortSignal.mock.calls[0][0];
        expect(signal.aborted).toBe(true);
    });

    it('503 durante a drenagem do shutdown, sem consultar o banco', async () => {
        const chain = mockSupabase(Promise.resolve({ error: null }));
        const res = mockRes();
        await handlerSupabase(2_000, () => true)({} as Request, res);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({ status: 'shutting_down' });
        expect(chain.from).not.toHaveBeenCalled();
    });

    it('checkReadiness trata exceção síncrona do probe como não pronto', async () => {
        const probe = () => {
            throw new Error('SupabaseWrapper not initialized');
        };
        await expect(checkReadiness(probe, 100)).resolves.toBe(false);
    });
});
