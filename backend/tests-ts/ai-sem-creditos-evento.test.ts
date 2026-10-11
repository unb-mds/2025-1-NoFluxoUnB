/**
 * Evento "Maritaca sem créditos" no ai_usage_log (migration 20260930_ai_saldo).
 *
 * Quando isMaritacaSemCreditos reconhece o erro, a linha da falha vai ao log com
 * success=false e erro_codigo='ai_sem_creditos' — é o que acende o alerta
 * "Créditos acabaram" no dashboard admin. Aqui o logAiUsage é o de verdade e o
 * Supabase é um fake que guarda as linhas inseridas, em cada rota de IA.
 */

import { Request, Response } from "express";

var mockGetUser = jest.fn();
var mockRpc = jest.fn();
var mockInsert = jest.fn(async (_rows: any[]): Promise<{ error: { message: string } | null }> => ({ error: null }));

/** Consulta encadeável que termina em { data: [], error: null } (serviço de dificuldade). */
function consultaVazia(): any {
    const alvo: any = () => undefined;
    return new Proxy(alvo, {
        get(_t, prop) {
            if (prop === "then") return (ok: (v: unknown) => void) => ok({ data: [], error: null });
            return () => consultaVazia();
        },
    });
}

jest.mock("../src/supabase_wrapper", () => ({
    SupabaseWrapper: {
        get: () => ({
            auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
            rpc: (...a: unknown[]) => mockRpc(...a),
            from: (tabela: string) =>
                tabela === "ai_usage_log" ? { insert: (rows: any[]) => mockInsert(rows) } : consultaVazia(),
        }),
    },
}));

jest.mock("../src/utils/controller_logger", () => ({
    createControllerLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn(), error: jest.fn() }),
}));

var mockRagflow = { isAvailable: jest.fn(() => true), startSession: jest.fn(), analyzeMateria: jest.fn() };
jest.mock("../src/services/ragflow.service", () => ({ RagflowService: jest.fn(() => mockRagflow) }));

var mockSabia = {
    isAvailable: jest.fn(() => true),
    analyzarInteresse: jest.fn(),
    analyzarInteresseStream: jest.fn(),
    formatAsMarkdown: jest.fn(() => "md"),
};
jest.mock("../src/services/sabia.service", () => ({
    ...jest.requireActual("../src/services/sabia.service"),
    SabiaService: jest.fn(() => mockSabia),
}));

var mockConversar = jest.fn();
jest.mock("../src/services/planejador_agente.service", () => ({
    ...jest.requireActual("../src/services/planejador_agente.service"),
    PlanejadorAgenteService: jest.fn(() => ({
        isAvailable: () => true,
        conversar: (...args: unknown[]) => mockConversar(...args),
    })),
}));

var mockRun = jest.fn();
jest.mock("@openai/agents", () => ({ ...jest.requireActual("@openai/agents"), run: (...a: unknown[]) => mockRun(...a) }));
jest.mock("../src/services/chat/orquestrador_agent", () => ({ createOrquestradorAgent: jest.fn(() => ({})) }));
jest.mock("../src/services/chat/model_provider", () => ({ isMaritacaConfigured: () => true }));
jest.mock("../src/services/chat/supabase_session", () => ({ SupabaseSession: jest.fn(() => ({})) }));

// executarComContextoIA real, com um gancho para o /planejamento/chat pular a
// montagem do plano (que lê meio banco) e chegar ao modelo.
var mockExecutar = jest.fn();
jest.mock("../src/utils/ai_usage_logger", () => {
    const actual = jest.requireActual("../src/utils/ai_usage_logger");
    mockExecutar.mockImplementation(actual.executarComContextoIA);
    return { ...actual, executarComContextoIA: (...a: unknown[]) => mockExecutar(...a) };
});

jest.mock("../src/utils", () => {
    const actual = jest.requireActual("../src/utils");
    return { ...actual, Utils: { ...actual.Utils, checkAuthorization: jest.fn(async () => true) } };
});

import { AssistenteController } from "../src/controllers/assistente_controller";
import { PlanejamentoController } from "../src/controllers/PlanejamentoController";
import { ChatController } from "../src/controllers/chat_controller";
import { DificuldadeAgenteService } from "../src/services/dificuldade_agente.service";
import { _limparCacheTeto } from "../src/services/darcy_cota.service";
import { MaritacaSemCreditosError } from "../src/config/maritaca_errors";
import { ERRO_CODIGO_SEM_CREDITOS, erroCodigoDoErro, logAiUsage } from "../src/utils/ai_usage_logger";

const TOKEN = "token-valido";
const ALUNO = { id: "11111111-1111-1111-1111-111111111111", email: "aluno@aluno.unb.br" };

/** Corpo real da Maritaca sem saldo. */
const CORPO_403 =
    '{"error":{"message":"Sorry, you need have active credits to use MariTalk via API.","type":"invalid_request_error","param":null,"code":"insufficient_funds"}}';
const erroSemCreditos = () => new Error(`Maritaca API error: 403 ${CORPO_403}`);

function bancoOk() {
    mockRpc.mockImplementation(async (nome: string) => {
        switch (nome) {
            case "darcy_custo_ia_hoje":
                return { data: 0, error: null };
            case "darcy_reservar_pergunta":
                return { data: [{ permitido: true, usadas: 1, limite: 30, dia: "2026-09-30", renova_em: "2026-10-01T03:00:00Z" }], error: null };
            case "darcy_estornar_pergunta":
                return { data: 0, error: null };
            default:
                return { data: [{ usadas: 0, limite: 30, dia: "2026-09-30", renova_em: "2026-10-01T03:00:00Z" }], error: null };
        }
    });
}

function mockReqRes(body: any) {
    const req = { body, query: {}, headers: { authorization: `Bearer ${TOKEN}`, "user-id": "7" } } as unknown as Request;
    const res: any = {
        statusCode: 200,
        body: undefined as any,
        writableEnded: false,
        status: jest.fn((code: number) => { res.statusCode = code; return res; }),
        json: jest.fn((b: any) => { res.body = b; return res; }),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(() => true),
        end: jest.fn(() => { res.writableEnded = true; }),
        on: jest.fn(),
    };
    return { req, res: res as Response & typeof res };
}

const assistente = (nome: string) => (AssistenteController.routes as any)[nome].value;
const planejamento = (nome: string) => (PlanejamentoController.routes as any)[nome].value;
const chatSend = () => (ChatController.routes as any).send.value;

/** Espera o insert fire-and-forget do logAiUsage. */
const esperarLog = () => new Promise((r) => setImmediate(r));

function linhasInseridas(): any[] {
    return mockInsert.mock.calls.flatMap((c) => c[0]);
}

const MSG = { messages: [{ role: "user", content: "me recomenda optativas de IA" }] };

/** Cada rota de IA com a forma como a falta de créditos chega a ela. */
const ROTAS: Array<[string, string, () => any, any, () => void]> = [
    ["/assistente/chat", "assistente-chat", () => assistente("chat"), MSG,
        () => mockConversar.mockRejectedValue(new MaritacaSemCreditosError())],
    ["/planejamento/chat", "planejamento-chat", () => planejamento("chat"), { ...MSG, planoInput: {} },
        () => {
            mockExecutar.mockImplementationOnce(async () => ({ ctx: {} })); // montagem do plano
            mockConversar.mockRejectedValue(new MaritacaSemCreditosError());
        }],
    ["/chat/send", "chat-send", () => chatSend(), { message: "oi" },
        () => mockRun.mockRejectedValue(Object.assign(new Error(`403 ${CORPO_403}`), { status: 403 }))],
    ["/assistente/analyze-sabia (exceção)", "analyze-sabia", () => assistente("analyze-sabia"), { materia: "IA" },
        () => mockSabia.analyzarInteresse.mockRejectedValue(erroSemCreditos())],
    ["/assistente/analyze-sabia (success:false do mcp_agent)", "analyze-sabia", () => assistente("analyze-sabia"), { materia: "IA" },
        () => mockSabia.analyzarInteresse.mockResolvedValue({ success: false, error: `Error code: 403 - ${CORPO_403}`, usage: [] })],
    ["/assistente/analyze-sabia-stream (evento de erro)", "analyze-sabia-stream", () => assistente("analyze-sabia-stream"), { materia: "IA" },
        () => mockSabia.analyzarInteresseStream.mockResolvedValue({
            usage: [], aborted: false, entregouConteudo: false, recebeuDoUpstream: true, concluiu: false,
            erroUpstream: `Error code: 403 - ${CORPO_403}`,
        })],
    ["/assistente/analyze-sabia-stream (exceção)", "analyze-sabia-stream", () => assistente("analyze-sabia-stream"), { materia: "IA" },
        () => mockSabia.analyzarInteresseStream.mockRejectedValue(erroSemCreditos())],
    ["/assistente/analyze (RAGFlow)", "analyze", () => assistente("analyze"), { materia: "IA" },
        () => mockRagflow.startSession.mockRejectedValue(erroSemCreditos())],
];

/** As mesmas rotas com uma falha qualquer: sem marcador. */
const ROTAS_FALHA_COMUM: Array<[string, string, () => any, any, () => void]> = [
    ["/assistente/chat", "assistente-chat", () => assistente("chat"), MSG,
        () => mockConversar.mockRejectedValue(new Error("Maritaca API error: 500"))],
    ["/chat/send", "chat-send", () => chatSend(), { message: "oi" },
        () => mockRun.mockRejectedValue(new Error("boom"))],
    ["/assistente/analyze-sabia", "analyze-sabia", () => assistente("analyze-sabia"), { materia: "IA" },
        () => mockSabia.analyzarInteresse.mockResolvedValue({ success: false, error: "KeyError", usage: [] })],
    ["/assistente/analyze-sabia-stream", "analyze-sabia-stream", () => assistente("analyze-sabia-stream"), { materia: "IA" },
        () => mockSabia.analyzarInteresseStream.mockResolvedValue({
            usage: [], aborted: false, entregouConteudo: false, recebeuDoUpstream: true, concluiu: false, erroUpstream: "timeout",
        })],
];

const envOriginal = { ...process.env };

beforeEach(() => {
    jest.clearAllMocks();
    _limparCacheTeto();
    process.env = { ...envOriginal };
    delete process.env.AI_COTA_DIARIA;
    delete process.env.AI_TETO_DIARIO_RS;
    mockInsert.mockImplementation(async () => ({ error: null }));
    mockGetUser.mockResolvedValue({ data: { user: ALUNO }, error: null });
    bancoOk();
    mockConversar.mockResolvedValue({ reply: "ok", restricoes: {}, usage: [] });
    mockRun.mockResolvedValue({ finalOutput: "ok", state: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } });
    mockSabia.analyzarInteresse.mockResolvedValue({ success: true, disciplinas: [], usage: [] });
    mockRagflow.startSession.mockResolvedValue("s1");
    mockRagflow.analyzeMateria.mockResolvedValue({ code: 0, data: {} });
});

afterAll(() => {
    process.env = envOriginal;
});

describe("sem créditos na Maritaca: evento no ai_usage_log em cada rota de IA", () => {
    it.each(ROTAS)("%s grava success=false com erro_codigo='ai_sem_creditos'", async (_nome, endpoint, rota, body, preparar) => {
        preparar();
        const { req, res } = mockReqRes(body);
        await rota()(req, res);
        await esperarLog();

        const linhas = linhasInseridas().filter((l) => l.endpoint === endpoint);
        expect(linhas.length).toBeGreaterThan(0);
        for (const l of linhas) {
            expect(l).toMatchObject({ success: false, erro_codigo: "ai_sem_creditos", user_id: ALUNO.id });
        }
    });

    it.each(ROTAS_FALHA_COMUM)("%s: falha comum não leva o marcador", async (_nome, endpoint, rota, body, preparar) => {
        preparar();
        const { req, res } = mockReqRes(body);
        await rota()(req, res);
        await esperarLog();

        const linhas = linhasInseridas().filter((l) => l.endpoint === endpoint);
        expect(linhas.length).toBeGreaterThan(0);
        for (const l of linhas) {
            expect(l.success).toBe(false);
            expect(l).not.toHaveProperty("erro_codigo");
        }
    });

    it("sucesso não leva o marcador", async () => {
        const { req, res } = mockReqRes(MSG);
        mockConversar.mockResolvedValue({ reply: "ok", restricoes: {}, usage: [{ model: "sabia-4", prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }] });
        await assistente("chat")(req, res);
        await esperarLog();
        expect(linhasInseridas()).toEqual([expect.not.objectContaining({ erro_codigo: expect.anything() })]);
    });

    it("avaliação de dificuldade (lazy load do plano): o 403 vai ao log mesmo sem nenhuma chamada paga", async () => {
        process.env.MARITACA_API_KEY = "teste";
        const fetchOriginal = global.fetch;
        global.fetch = jest.fn(async () => ({ ok: false, status: 403, text: async () => CORPO_403 })) as any;
        try {
            await DificuldadeAgenteService.avaliarESalvarDificuldades([
                { codigo: "CIC0004", nome: "Algoritmos e Programação de Computadores", creditos: 6, nivel: 1 } as any,
            ]);
            await esperarLog();
        } finally {
            global.fetch = fetchOriginal;
        }
        const linhas = linhasInseridas().filter((l) => l.endpoint === "planejamento-gerar-plano-dificuldade");
        expect(linhas).toEqual([
            expect.objectContaining({ success: false, erro_codigo: "ai_sem_creditos", model: "sabiazinho-4", total_tokens: 0 }),
        ]);
    });
});

describe("logAiUsage com erro_codigo", () => {
    it("o código é o mesmo que a API devolve ao cliente", () => {
        expect(ERRO_CODIGO_SEM_CREDITOS).toBe("ai_sem_creditos");
        expect(erroCodigoDoErro(erroSemCreditos())).toBe("ai_sem_creditos");
        expect(erroCodigoDoErro(new Error("ECONNRESET"))).toBeNull();
        expect(erroCodigoDoErro(undefined)).toBeNull();
    });

    it("banco sem a coluna erro_codigo: grava de novo sem ela, o custo não se perde", async () => {
        mockInsert
            .mockResolvedValueOnce({ error: { message: 'column "erro_codigo" does not exist' } })
            .mockResolvedValueOnce({ error: null });
        const usage = [{ model: "sabia-4", prompt_tokens: 900, completion_tokens: 10, total_tokens: 910 }];
        logAiUsage({ endpoint: "chat-send", durationMs: 1, success: false, requestExcerpt: "oi", usage, erro: new MaritacaSemCreditosError() });
        await esperarLog();
        await esperarLog();

        expect(mockInsert).toHaveBeenCalledTimes(2);
        expect(mockInsert.mock.calls[0][0][0]).toMatchObject({ erro_codigo: "ai_sem_creditos", prompt_tokens: 900 });
        expect(mockInsert.mock.calls[1][0][0]).not.toHaveProperty("erro_codigo");
        expect(mockInsert.mock.calls[1][0][0]).toMatchObject({ prompt_tokens: 900, success: false });
    });

    it("linha de sucesso nunca leva o marcador, mesmo com erro informado", async () => {
        logAiUsage({ endpoint: "x", durationMs: 1, success: true, requestExcerpt: "", usage: [], erro: new MaritacaSemCreditosError() });
        await esperarLog();
        expect(mockInsert.mock.calls[0][0][0]).not.toHaveProperty("erro_codigo");
    });
});
