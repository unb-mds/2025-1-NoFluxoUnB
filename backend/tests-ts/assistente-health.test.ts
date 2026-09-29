/**
 * GET /assistente/health reflete o estado real do Sabiá (pré-mortem
 * 27/09/2026, R52).
 *
 * Antes o status vinha só de env vars (isAvailable()), então com o mcp_agent
 * fora do ar o endpoint respondia 200 { status: 'healthy' }. Agora pinga o
 * /health do Python com timeout curto e cache.
 *
 * O controller instancia os services no import, com as env vars do momento:
 * cada cenário recarrega o módulo com jest.resetModules().
 */

import type { Request, Response } from 'express';

// winston recarregado por isolateModules perde o registro de cores do logform.
jest.mock('../src/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), http: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/controllers/PlanejamentoController', () => ({ montarContextoAgente: jest.fn() }));
jest.mock('../src/services/planejador_agente.service', () => ({ PlanejadorAgenteService: jest.fn() }));
jest.mock('../src/services/agente/context', () => ({ criarContextoLeve: () => ({}) }));

const URL_SABIA = 'http://sabia.test:8000';
const envOriginal = { ...process.env };
const fetchOriginal = global.fetch;

function configurarEnv({ sabia, ragflow }: { sabia: boolean; ragflow: boolean }) {
    process.env = { ...envOriginal };
    process.env.SABIA_API_URL = URL_SABIA;
    if (sabia) {
        process.env.MARITACA_API_KEY = 'fake';
        process.env.GOOGLE_API_KEY = 'fake';
    } else {
        delete process.env.MARITACA_API_KEY;
        delete process.env.GOOGLE_API_KEY;
    }
    if (ragflow) {
        process.env.RAGFLOW_API_KEY = 'fake';
        process.env.RAGFLOW_BASE_URL = 'http://ragflow.test';
        process.env.RAGFLOW_AGENT_ID = 'agent';
    } else {
        delete process.env.RAGFLOW_API_KEY;
        delete process.env.RAGFLOW_BASE_URL;
        delete process.env.RAGFLOW_AGENT_ID;
    }
}

function carregarHealth() {
    let health: (req: Request, res: Response) => Promise<unknown>;
    jest.isolateModules(() => {
        const { AssistenteController } = require('../src/controllers/assistente_controller');
        health = AssistenteController.routes.health.value;
    });
    return health!;
}

async function chamar(health: (req: Request, res: Response) => Promise<unknown>) {
    const res: any = { statusCode: 200, body: undefined };
    res.status = jest.fn((c: number) => { res.statusCode = c; return res; });
    res.json = jest.fn((b: unknown) => { res.body = b; return res; });
    await health({} as Request, res as Response);
    return res as { statusCode: number; body: any };
}

afterEach(() => {
    process.env = { ...envOriginal };
    global.fetch = fetchOriginal;
});

describe('GET /assistente/health', () => {
    it('Sabiá configurado mas fora do ar (ECONNREFUSED) => degraded', async () => {
        configurarEnv({ sabia: true, ragflow: false });
        global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as any;

        const { statusCode, body } = await chamar(carregarHealth());

        expect(global.fetch).toHaveBeenCalledWith(`${URL_SABIA}/health`, expect.anything());
        expect(statusCode).toBe(200);
        expect(body.status).toBe('degraded');
    });

    it('Sabiá respondendo 500 => degraded', async () => {
        configurarEnv({ sabia: true, ragflow: true });
        global.fetch = jest.fn().mockResolvedValue(new globalThis.Response('x', { status: 500 })) as any;

        const { body } = await chamar(carregarHealth());

        expect(body.status).toBe('degraded');
    });

    it('Sabiá respondendo 200 => healthy, e a resposta continua resumida (D-Sec-1)', async () => {
        configurarEnv({ sabia: true, ragflow: false });
        global.fetch = jest.fn().mockResolvedValue(new globalThis.Response('{}', { status: 200 })) as any;

        const { statusCode, body } = await chamar(carregarHealth());

        expect(statusCode).toBe(200);
        expect(Object.keys(body).sort()).toEqual(['service', 'status', 'timestamp']);
        expect(body.status).toBe('healthy');
    });

    it('nada configurado => down com 503, sem chamar a rede', async () => {
        configurarEnv({ sabia: false, ragflow: false });
        global.fetch = jest.fn() as any;

        const { statusCode, body } = await chamar(carregarHealth());

        expect(statusCode).toBe(503);
        expect(body.status).toBe('down');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('Sabiá pendurado: responde degraded dentro do timeout curto', async () => {
        configurarEnv({ sabia: true, ragflow: false });
        // fetch que só termina quando o AbortSignal dispara.
        global.fetch = jest.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        })) as any;

        const inicio = Date.now();
        const { body } = await chamar(carregarHealth());

        expect(body.status).toBe('degraded');
        expect(Date.now() - inicio).toBeLessThan(2500);
    });

    it('resultado do ping fica em cache: health repetido não martela o Python', async () => {
        configurarEnv({ sabia: true, ragflow: false });
        global.fetch = jest.fn().mockResolvedValue(new globalThis.Response('{}', { status: 200 })) as any;
        const health = carregarHealth();

        await Promise.all([chamar(health), chamar(health)]);
        await chamar(health);

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
