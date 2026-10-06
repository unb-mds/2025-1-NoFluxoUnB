/**
 * Erros das rotas de IA não vazam detalhe interno ao cliente
 * (pré-mortem 27/09/2026, R34).
 *
 * Antes, analyze/analyze-sabia/chat/stream devolviam `error.message` cru —
 * inclusive `Cannot connect to Sabiá API ... on http://<host interno>` e
 * `connect ECONNREFUSED 127.0.0.1:1` — e o frontend exibia `data.erro` na
 * tela. Agora: mensagem genérica + requestId, com o detalhe só no log.
 */

import { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Mocks (var para serem hoisted junto com jest.mock)
// ---------------------------------------------------------------------------

var mockLogError = jest.fn();
jest.mock('../src/utils/controller_logger', () => ({
    createControllerLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        http: jest.fn(),
        error: (...args: any[]) => mockLogError(...args),
    }),
}));

var mockRagflow = {
    isAvailable: jest.fn(() => true),
    startSession: jest.fn(),
    analyzeMateria: jest.fn(),
};
jest.mock('../src/services/ragflow.service', () => ({
    RagflowService: jest.fn(() => mockRagflow),
}));

var mockSabia = {
    isAvailable: jest.fn(() => true),
    analyzarInteresse: jest.fn(),
    analyzarInteresseStream: jest.fn(),
    formatAsMarkdown: jest.fn(() => ''),
};
jest.mock('../src/services/sabia.service', () => ({
    ...jest.requireActual('../src/services/sabia.service'),
    SabiaService: jest.fn(() => mockSabia),
}));

var mockConversar = jest.fn();
jest.mock('../src/services/planejador_agente.service', () => ({
    PlanejadorAgenteService: jest.fn(() => ({
        isAvailable: () => true,
        conversar: (...args: any[]) => mockConversar(...args),
    })),
}));

jest.mock('../src/controllers/PlanejamentoController', () => ({
    montarContextoAgente: jest.fn(),
}));

jest.mock('../src/services/agente/context', () => ({
    criarContextoLeve: () => ({}),
}));

jest.mock('../src/utils/ai_usage_logger', () => ({ logAiUsage: jest.fn() }));

jest.mock('../src/supabase_wrapper', () => ({
    SupabaseWrapper: { get: jest.fn() },
}));

jest.mock('../src/utils', () => {
    const actual = jest.requireActual('../src/utils');
    return {
        ...actual,
        Utils: { ...actual.Utils, checkAuthorization: jest.fn(async () => false) },
    };
});

import { AssistenteController } from '../src/controllers/assistente_controller';
import { SupabaseWrapper } from '../src/supabase_wrapper';
import { ERRO_IA_GENERICO } from '../src/utils/erro_publico';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const URL_INTERNA = 'http://10.0.0.99-interno.svc:8000';

function mockReqRes(body: any = {}, query: any = {}) {
    const req = { body, query, headers: {} } as unknown as Request;
    const res: any = {
        statusCode: 200,
        body: undefined as any,
        written: [] as string[],
        status: jest.fn(function (this: any, code: number) { res.statusCode = code; return res; }),
        json: jest.fn((b: any) => { res.body = b; return res; }),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn((chunk: string) => { res.written.push(chunk); return true; }),
        end: jest.fn(),
        // O stream escuta 'close' para abortar a chamada ao Sabiá (fix/darcy-resiliencia).
        writableEnded: false,
        on: jest.fn(),
    };
    return { req, res: res as Response & typeof res };
}

function route(name: string) {
    return (AssistenteController.routes as any)[name].value;
}

/** O que foi pro cliente não carrega nenhum detalhe interno. */
function expectSemVazamento(payload: unknown) {
    const texto = JSON.stringify(payload);
    expect(texto).not.toMatch(/http:\/\//);
    expect(texto).not.toMatch(/ECONNREFUSED/);
    expect(texto).not.toMatch(/FastAPI/);
    expect(texto).not.toMatch(/Cannot connect/);
    expect(texto).not.toMatch(/Traceback|stack/i);
}

/** O detalhe foi pro log, marcado com o mesmo requestId devolvido ao cliente. */
function expectLogadoCom(requestId: string, trecho: string) {
    const linhas = mockLogError.mock.calls.map((c) => String(c[0]));
    expect(linhas.some((l) => l.includes(`requestId=${requestId}`) && l.includes(trecho))).toBe(true);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRagflow.isAvailable.mockReturnValue(true);
    mockSabia.isAvailable.mockReturnValue(true);
});

// ---------------------------------------------------------------------------

describe('POST /assistente/analyze-sabia', () => {
    it('conexão recusada com o Sabiá: 500 genérico, URL interna só no log', async () => {
        mockSabia.analyzarInteresse.mockRejectedValue(
            new Error(`Cannot connect to Sabiá API. Make sure api_producao.py is running on ${URL_INTERNA}`),
        );
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze-sabia')(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ erro: ERRO_IA_GENERICO, requestId: expect.any(String) });
        expectSemVazamento(res.body);
        expectLogadoCom(res.body.requestId, URL_INTERNA);
    });

    it('erro HTTP do FastAPI (corpo cru) não chega ao cliente', async () => {
        mockSabia.analyzarInteresse.mockRejectedValue(
            new Error('FastAPI returned 500: {"detail":"Traceback ... psycopg2.OperationalError"}'),
        );
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze-sabia')(req, res);

        expect(res.statusCode).toBe(500);
        expectSemVazamento(res.body);
    });

    it('success:false com texto arbitrário do agente vira 502 genérico', async () => {
        mockSabia.analyzarInteresse.mockResolvedValue({ success: false, error: 'KeyError: choices' });
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze-sabia')(req, res);

        expect(res.statusCode).toBe(502);
        expect(res.body.erro).toBe(ERRO_IA_GENERICO);
        expect(JSON.stringify(res.body)).not.toContain('KeyError');
    });

    it('mensagem de orientação escrita no mcp_agent continua chegando ao usuário', async () => {
        mockSabia.analyzarInteresse.mockResolvedValue({ success: false, error: 'Envie o historico academico' });
        const { req, res } = mockReqRes({ materia: 'optativas' });
        await route('analyze-sabia')(req, res);

        expect(res.body.erro).toContain('Envie o historico academico');
    });

    it('503 de configuração ausente não lista nomes de env vars', async () => {
        mockSabia.isAvailable.mockReturnValue(false);
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze-sabia')(req, res);

        expect(res.statusCode).toBe(503);
        expect(JSON.stringify(res.body)).not.toMatch(/MARITACA|SUPABASE/);
    });
});

describe('POST /assistente/analyze (RAGFlow)', () => {
    it('ECONNREFUSED do RAGFlow: 500 genérico', async () => {
        mockRagflow.startSession.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1'));
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze')(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body.erro).toBe(ERRO_IA_GENERICO);
        expectSemVazamento(res.body);
        expectLogadoCom(res.body.requestId, 'ECONNREFUSED');
    });

    it('code != 0 do RAGFlow: mensagem do provedor fica só no log', async () => {
        mockRagflow.startSession.mockResolvedValue('s1');
        mockRagflow.analyzeMateria.mockResolvedValue({ code: 102, message: `Agent not found at ${URL_INTERNA}`, data: {} });
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze')(req, res);

        expect(res.statusCode).toBe(502);
        expectSemVazamento(res.body);
        expectLogadoCom(res.body.requestId, 'Agent not found');
    });
});

// Pré-mortem 27/09/2026, R53: code 0 sem `answer` virava HTTP 200 com
// "Erro ao processar o JSON: Cannot read properties of undefined" no resultado.
describe('POST /assistente/analyze com resposta do RAGFlow sem answer', () => {
    it('responde 502 genérico em vez de 200 com texto de erro', async () => {
        mockRagflow.startSession.mockResolvedValue('s1');
        mockRagflow.analyzeMateria.mockResolvedValue({ code: 0, data: { session_id: 's1' } });
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze')(req, res);

        expect(res.statusCode).toBe(502);
        expect(res.body).toEqual({ erro: ERRO_IA_GENERICO, requestId: expect.any(String) });
        expect(JSON.stringify(res.body)).not.toContain('Cannot read properties');
    });

    it('answer sem bloco de ranking também é 502', async () => {
        mockRagflow.startSession.mockResolvedValue('s1');
        mockRagflow.analyzeMateria.mockResolvedValue({ code: 0, data: { answer: `{"content": {"0": ""}}`, session_id: 's1' } });
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze')(req, res);

        expect(res.statusCode).toBe(502);
    });

    it('answer válido continua 200 com o ranking', async () => {
        mockRagflow.startSession.mockResolvedValue('s1');
        mockRagflow.analyzeMateria.mockResolvedValue({
            code: 0,
            data: { answer: `{"content": {"0": "INÍCIO DO RANKING\\n1. **Disciplina:** IA; Codigo: CIC0001; Unidade responsavel: CIC\\n**Pontuação:** 90\\n"}}`, session_id: 's1' },
        });
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze')(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.resultado).toContain('`CIC0001`');
    });
});

describe('POST /assistente/chat', () => {
    it('erro do LLM não volta cru', async () => {
        mockConversar.mockRejectedValue(new Error(`Maritaca API error: 500 upstream ${URL_INTERNA}`));
        const { req, res } = mockReqRes({ messages: [{ role: 'user', content: 'oi' }] });
        await route('chat')(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: ERRO_IA_GENERICO, requestId: expect.any(String) });
        expectSemVazamento(res.body);
    });
});

describe('POST /assistente/analyze-sabia-stream', () => {
    it('evento SSE de erro leva a mensagem genérica', async () => {
        mockSabia.analyzarInteresseStream.mockRejectedValue(
            new Error(`FastAPI returned 502: bad gateway at ${URL_INTERNA}`),
        );
        const { req, res } = mockReqRes({ materia: 'IA' });
        await route('analyze-sabia-stream')(req, res);

        const enviado = res.written.join('');
        expect(enviado).toContain('"stage":"error"');
        expect(enviado).toContain(ERRO_IA_GENERICO);
        expectSemVazamento(enviado);
    });
});

describe('GET /assistente/turmas-by-codigo e prerequisitos-by-codigo', () => {
    it('exceção inesperada não devolve a mensagem crua', async () => {
        (SupabaseWrapper.get as jest.Mock).mockImplementation(() => {
            throw new Error(`fetch failed: ${URL_INTERNA}`);
        });
        for (const nome of ['turmas-by-codigo', 'prerequisitos-by-codigo']) {
            const { req, res } = mockReqRes({}, { codigo: 'FGA0001' });
            await route(nome)(req, res);
            expect(res.statusCode).toBe(500);
            expectSemVazamento(res.body);
        }
    });
});
