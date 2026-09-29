/**
 * Darcy só para logados + cota diária (29/09/2026).
 *
 * Rotas que chamam LLM pago: sem token válido → 401 LOGIN_NECESSARIO antes de
 * qualquer chamada externa; logado desconta uma pergunta (reserva atômica no
 * banco); 31ª pergunta → 429 sem chamar o LLM; falha da IA estorna; teto
 * global de custo → 503. O banco é um fake das funções SQL (a lógica SQL em si
 * é testada no PGlite, tests-ts/db/darcy-cota.pglite.test.ts).
 */

import { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Mocks (var para serem hoisted junto com jest.mock)
// ---------------------------------------------------------------------------

var mockGetUser = jest.fn();
var mockRpc = jest.fn();
var mockInsert = jest.fn(async (_rows: unknown) => ({ error: null }));
jest.mock("../src/supabase_wrapper", () => ({
    SupabaseWrapper: {
        get: () => ({
            auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
            rpc: (...a: unknown[]) => mockRpc(...a),
            from: () => ({ insert: (rows: unknown) => mockInsert(rows) }),
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

var mockLogAiUsage = jest.fn();
jest.mock("../src/utils/ai_usage_logger", () => ({
    ...jest.requireActual("../src/utils/ai_usage_logger"),
    logAiUsage: (...a: unknown[]) => mockLogAiUsage(...a),
}));

jest.mock("../src/utils", () => {
    const actual = jest.requireActual("../src/utils");
    return { ...actual, Utils: { ...actual.Utils, checkAuthorization: jest.fn(async () => false) } };
});

import { AssistenteController } from "../src/controllers/assistente_controller";
import { PlanejamentoController } from "../src/controllers/PlanejamentoController";
import { ChatController } from "../src/controllers/chat_controller";
import { Utils } from "../src/utils";
import { _limparCacheTeto, TETO_CACHE_MS, tetoGlobalAtingido } from "../src/services/darcy_cota.service";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const TOKEN = "token-valido";
const ALUNO = { id: "11111111-1111-1111-1111-111111111111", email: "aluno@aluno.unb.br" };
const DIA = "2026-09-29";
const RENOVA = "2026-09-30T03:00:00+00:00";

/** Fake das funções SQL da migration, com contador em memória. */
function bancoCom({ usadas = 0, limite = 30, custo = 0 } = {}) {
    const estado = { usadas, limite, custo };
    mockRpc.mockImplementation(async (nome: string) => {
        switch (nome) {
            case "darcy_custo_ia_hoje":
                return { data: estado.custo, error: null };
            case "darcy_reservar_pergunta": {
                const permitido = estado.usadas < estado.limite;
                if (permitido) estado.usadas++;
                return { data: [{ permitido, usadas: estado.usadas, limite: estado.limite, dia: DIA, renova_em: RENOVA }], error: null };
            }
            case "darcy_estornar_pergunta":
                estado.usadas = Math.max(0, estado.usadas - 1);
                return { data: estado.usadas, error: null };
            case "darcy_estado_cota":
                return { data: [{ usadas: estado.usadas, limite: estado.limite, dia: DIA, renova_em: RENOVA }], error: null };
            default:
                return { data: null, error: { message: `rpc inesperada: ${nome}` } };
        }
    });
    return estado;
}

function rpcsChamadas(nome: string) {
    return mockRpc.mock.calls.filter((c) => c[0] === nome);
}

function mockReqRes(opts: { body?: any; token?: string | null; headers?: Record<string, string>; query?: any } = {}) {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    const req = { body: opts.body ?? {}, query: opts.query ?? {}, headers } as unknown as Request;
    const res: any = {
        statusCode: 200,
        body: undefined as any,
        written: [] as string[],
        writableEnded: false,
        status: jest.fn((code: number) => { res.statusCode = code; return res; }),
        json: jest.fn((b: any) => { res.body = b; return res; }),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn((chunk: string) => { res.written.push(chunk); return true; }),
        end: jest.fn(() => { res.writableEnded = true; }),
        on: jest.fn(),
    };
    return { req, res: res as Response & typeof res };
}

const assistente = (nome: string) => (AssistenteController.routes as any)[nome].value;
const planejamento = (nome: string) => (PlanejamentoController.routes as any)[nome].value;
const chatSend = () => (ChatController.routes as any).send.value;

const MSG = { messages: [{ role: "user", content: "me recomenda optativas de IA" }] };

/** Todas as rotas que chamam LLM pago, com um corpo válido. */
const ROTAS_IA: Array<[string, () => any, any]> = [
    ["/assistente/chat", () => assistente("chat"), MSG],
    ["/assistente/analyze", () => assistente("analyze"), { materia: "IA" }],
    ["/assistente/analyze-sabia", () => assistente("analyze-sabia"), { materia: "IA" }],
    ["/assistente/analyze-sabia-stream", () => assistente("analyze-sabia-stream"), { materia: "IA" }],
    ["/planejamento/chat", () => planejamento("chat"), { ...MSG, planoInput: {} }],
    ["/chat/send", () => chatSend(), { message: "oi" }],
];

function nenhumLlmChamado() {
    expect(mockConversar).not.toHaveBeenCalled();
    expect(mockSabia.analyzarInteresse).not.toHaveBeenCalled();
    expect(mockSabia.analyzarInteresseStream).not.toHaveBeenCalled();
    expect(mockRagflow.startSession).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
}

const envOriginal = { ...process.env };

beforeEach(() => {
    jest.clearAllMocks();
    _limparCacheTeto();
    process.env = { ...envOriginal };
    delete process.env.AI_COTA_DIARIA;
    delete process.env.AI_TETO_DIARIO_RS;
    mockGetUser.mockImplementation(async (token: string) =>
        token === TOKEN
            ? { data: { user: ALUNO }, error: null }
            : { data: { user: null }, error: { message: "invalid JWT" } }
    );
    mockConversar.mockResolvedValue({ reply: "Recomendo CIC0135.", restricoes: {}, usage: [{ model: "sabia-4", prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }] });
    mockRun.mockResolvedValue({ finalOutput: "ok", state: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } });
    mockSabia.analyzarInteresse.mockResolvedValue({ success: true, disciplinas: [], usage: [] });
    mockSabia.analyzarInteresseStream.mockImplementation(async (_m: string, _mc: string, res: any) => {
        res.write('data: {"stage":"done","resultado":"ok"}\n\n');
        res.end();
        return { usage: [], aborted: false, entregouConteudo: true, recebeuDoUpstream: true, concluiu: true };
    });
    mockRagflow.startSession.mockResolvedValue("s1");
    mockRagflow.analyzeMateria.mockResolvedValue({
        code: 0,
        data: { answer: `{"content": {"0": "INÍCIO DO RANKING\\n1. **Disciplina:** IA; Codigo: CIC0001; Unidade responsavel: CIC\\n**Pontuação:** 90\\n"}}`, session_id: "s1" },
    });
    (Utils.checkAuthorization as jest.Mock).mockResolvedValue(false);
});

afterAll(() => {
    process.env = envOriginal;
});

// ---------------------------------------------------------------------------

describe("login obrigatório nas rotas de IA paga", () => {
    it.each(ROTAS_IA)("%s sem token: 401 LOGIN_NECESSARIO sem chamar LLM nem gastar cota", async (_nome, rota, body) => {
        bancoCom();
        const { req, res } = mockReqRes({ body, token: null });
        await rota()(req, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toMatchObject({ codigo: "LOGIN_NECESSARIO" });
        expect(res.flushHeaders).not.toHaveBeenCalled();
        nenhumLlmChamado();
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it.each(ROTAS_IA)("%s com token inválido: 401", async (_nome, rota, body) => {
        bancoCom();
        const { req, res } = mockReqRes({ body, token: "token-forjado" });
        await rota()(req, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toMatchObject({ codigo: "LOGIN_NECESSARIO" });
        nenhumLlmChamado();
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("bypass X-Dev-Impersonate não vale em produção", async () => {
        process.env.NODE_ENV = "production";
        process.env.ALLOW_DEV_IMPERSONATE = "true";
        bancoCom();
        const { req, res } = mockReqRes({
            body: MSG,
            headers: { "x-dev-impersonate": ALUNO.email, "user-id": "7" },
        });
        await assistente("chat")(req, res);

        expect(res.statusCode).toBe(401);
        nenhumLlmChamado();
    });

    it.each(["turmas-by-codigo", "prerequisitos-by-codigo"])("%s (sem LLM) continua aberta", async (nome) => {
        const { req, res } = mockReqRes({ query: {} });
        await assistente(nome)(req, res);
        // 400 de parâmetro faltando, não 401
        expect(res.statusCode).toBe(400);
        expect(mockGetUser).not.toHaveBeenCalled();
    });
});

describe("cota diária", () => {
    it("logado passa, desconta uma pergunta e recebe a cota na resposta", async () => {
        bancoCom({ usadas: 11 });
        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);

        expect(res.statusCode).toBe(200);
        expect(mockConversar).toHaveBeenCalledTimes(1);
        expect(rpcsChamadas("darcy_reservar_pergunta")).toEqual([
            ["darcy_reservar_pergunta", { p_user_id: ALUNO.id, p_limite_padrao: 30 }],
        ]);
        expect(res.body.cota).toEqual({ usadas: 12, limite: 30, restantes: 18, renova_em: "2026-09-30T03:00:00.000Z" });
    });

    it("31ª pergunta do dia: 429 COTA_DIARIA sem chamar o LLM", async () => {
        const estado = bancoCom();
        for (let i = 0; i < 30; i++) {
            const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
            await assistente("chat")(req, res);
            expect(res.statusCode).toBe(200);
        }
        expect(mockConversar).toHaveBeenCalledTimes(30);

        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);

        expect(res.statusCode).toBe(429);
        expect(res.body).toMatchObject({ codigo: "COTA_DIARIA", usadas: 30, limite: 30, renova_em: "2026-09-30T03:00:00.000Z" });
        expect(mockConversar).toHaveBeenCalledTimes(30);
        expect(estado.usadas).toBe(30);
    });

    it.each(ROTAS_IA)("%s no limite: 429 sem chamar LLM", async (_nome, rota, body) => {
        (Utils.checkAuthorization as jest.Mock).mockResolvedValue(true);
        bancoCom({ usadas: 30 });
        const { req, res } = mockReqRes({ body, token: TOKEN, headers: { "user-id": "7" } });
        await rota()(req, res);

        expect(res.statusCode).toBe(429);
        expect(res.body.codigo).toBe("COTA_DIARIA");
        expect(res.flushHeaders).not.toHaveBeenCalled();
        nenhumLlmChamado();
    });

    it("AI_COTA_DIARIA muda o limite padrão", async () => {
        process.env.AI_COTA_DIARIA = "50";
        bancoCom();
        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);
        expect(rpcsChamadas("darcy_reservar_pergunta")[0][1]).toEqual({ p_user_id: ALUNO.id, p_limite_padrao: 50 });
    });

    it("entrada inválida não gasta pergunta", async () => {
        bancoCom();
        const { req, res } = mockReqRes({ body: { materia: "a".repeat(301) }, token: TOKEN });
        await assistente("analyze-sabia")(req, res);
        expect(res.statusCode).toBe(413);
        expect(rpcsChamadas("darcy_reservar_pergunta")).toHaveLength(0);
    });

    it("comando /turmas (sem LLM) não gasta pergunta nem vira uso de IA", async () => {
        bancoCom({ usadas: 30 });
        mockConversar.mockResolvedValue({ reply: "turmas...", restricoes: {}, usage: [], semLlm: true });
        const { req, res } = mockReqRes({ body: { messages: [{ role: "user", content: "/turmas MAT0025" }] }, token: TOKEN });
        await assistente("chat")(req, res);

        expect(res.statusCode).toBe(200);
        expect(rpcsChamadas("darcy_reservar_pergunta")).toHaveLength(0);
        expect(mockLogAiUsage).not.toHaveBeenCalled();
        expect(res.body.cota).toMatchObject({ usadas: 30, limite: 30 });
    });

    it("banco fora: não chama o LLM (fail-closed)", async () => {
        mockRpc.mockImplementation(async (nome: string) =>
            nome === "darcy_custo_ia_hoje" ? { data: 0, error: null } : { data: null, error: { message: "relation does not exist" } }
        );
        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);
        expect(res.statusCode).toBe(503);
        expect(res.body.codigo).toBe("COTA_INDISPONIVEL");
        nenhumLlmChamado();
    });
});

describe("estorno quando a IA falha", () => {
    it("erro do LLM no /assistente/chat estorna", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockConversar.mockRejectedValue(new Error("Maritaca API error: 500"));
        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);

        expect(res.statusCode).toBe(500);
        expect(rpcsChamadas("darcy_estornar_pergunta")).toEqual([
            ["darcy_estornar_pergunta", { p_user_id: ALUNO.id, p_dia: DIA }],
        ]);
        expect(estado.usadas).toBe(5);
    });

    it("Maritaca sem créditos estorna", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockConversar.mockRejectedValue(new Error('403 {"code":"insufficient_funds"}'));
        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);
        expect(res.statusCode).toBe(503);
        expect(estado.usadas).toBe(5);
    });

    it("timeout/erro do Sabiá estorna", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockSabia.analyzarInteresse.mockRejectedValue(new Error("timeout"));
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze-sabia")(req, res);
        expect(res.statusCode).toBe(500);
        expect(estado.usadas).toBe(5);
    });

    it("Sabiá com success:false estorna", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockSabia.analyzarInteresse.mockResolvedValue({ success: false, error: "KeyError" });
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze-sabia")(req, res);
        expect(res.statusCode).toBe(502);
        expect(estado.usadas).toBe(5);
    });

    it("stream que termina em erro estorna", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockSabia.analyzarInteresseStream.mockImplementation(async (_m: string, _mc: string, r: any) => {
            r.write('data: {"stage":"error","message":"falhou"}\n\n');
            r.end();
            return { usage: [], aborted: false, entregouConteudo: false, recebeuDoUpstream: true, concluiu: false };
        });
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze-sabia-stream")(req, res);
        expect(estado.usadas).toBe(5);
    });

    it("cliente que fecha o stream antes de o Python mandar qualquer evento não gasta pergunta", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockSabia.analyzarInteresseStream.mockResolvedValue({ usage: [], aborted: true, entregouConteudo: false, recebeuDoUpstream: false, concluiu: false });
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze-sabia-stream")(req, res);
        expect(estado.usadas).toBe(5);
    });

    it("cliente que fecha depois de receber disciplinas gasta a pergunta", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockSabia.analyzarInteresseStream.mockResolvedValue({ usage: [], aborted: true, entregouConteudo: true, recebeuDoUpstream: true, concluiu: false });
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze-sabia-stream")(req, res);
        expect(estado.usadas).toBe(6);
    });

    it("stream bem-sucedido manda um evento `cota`", async () => {
        bancoCom({ usadas: 5 });
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze-sabia-stream")(req, res);
        const cota = res.written.map((w: string) => JSON.parse(w.slice(6))).find((e: any) => e.stage === "cota");
        expect(cota).toEqual({ stage: "cota", cota: { usadas: 6, limite: 30, restantes: 24, renova_em: "2026-09-30T03:00:00.000Z" } });
    });

    it("orquestrador (/chat/send) com erro estorna", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockRun.mockRejectedValue(new Error("boom"));
        const { req, res } = mockReqRes({ body: { message: "oi" }, token: TOKEN });
        await chatSend()(req, res);
        expect(res.statusCode).toBe(500);
        expect(estado.usadas).toBe(5);
    });

    it("RAGFlow sem ranking estorna", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockRagflow.analyzeMateria.mockResolvedValue({ code: 0, data: { session_id: "s1" } });
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze")(req, res);
        expect(res.statusCode).toBe(502);
        expect(estado.usadas).toBe(5);
    });
});

describe("cliente que fecha a conexão depois de o modelo ser chamado", () => {
    /** res que guarda o handler de 'close' para simular o aluno saindo. */
    function reqResComClose(body: any) {
        const { req, res } = mockReqRes({ body, token: TOKEN });
        const handlers: Array<() => void> = [];
        res.on.mockImplementation((ev: string, fn: () => void) => {
            if (ev === "close") handlers.push(fn);
            return res;
        });
        const fechar = () => handlers.forEach((h) => h());
        return { req, res, fechar };
    }

    // Script com AbortController de ~2s: a conexão cai enquanto o LLM (pago)
    // responde. Antes o 'close' estornava e a pergunta nunca era gasta.
    const CASOS: Array<[string, () => any, any, (fechar: () => void) => void]> = [
        ["/assistente/chat", () => assistente("chat"), MSG, (fechar) =>
            mockConversar.mockImplementation(async () => {
                fechar();
                return { reply: "ok", restricoes: {}, usage: [{ model: "sabia-4", prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }] };
            })],
        ["/assistente/analyze-sabia", () => assistente("analyze-sabia"), { materia: "IA" }, (fechar) =>
            mockSabia.analyzarInteresse.mockImplementation(async () => {
                fechar();
                return { success: true, disciplinas: [], usage: [{ model: "sabia-4", prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }] };
            })],
        ["/assistente/analyze", () => assistente("analyze"), { materia: "IA" }, (fechar) => {
            const original = mockRagflow.analyzeMateria.getMockImplementation()!;
            mockRagflow.analyzeMateria.mockImplementation(async (...a: unknown[]) => {
                fechar();
                return original(...a);
            });
        }],
        ["/chat/send", () => chatSend(), { message: "oi" }, (fechar) =>
            mockRun.mockImplementation(async () => {
                fechar();
                return { finalOutput: "ok", state: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } };
            })],
    ];

    it.each(CASOS)("%s: a pergunta conta e não é estornada", async (_nome, rota, body, preparar) => {
        const estado = bancoCom({ usadas: 5 });
        const { req, res, fechar } = reqResComClose(body);
        preparar(fechar);

        await rota()(req, res);

        expect(estado.usadas).toBe(6);
        expect(rpcsChamadas("darcy_estornar_pergunta")).toHaveLength(0);
        expect(res.json).not.toHaveBeenCalled();
    });

    it("stream: quem sai depois do 1º evento do Python (antes de qualquer disciplina) gasta a pergunta", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockSabia.analyzarInteresseStream.mockResolvedValue({
            usage: [], aborted: true, entregouConteudo: false, recebeuDoUpstream: true, concluiu: false,
        });
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze-sabia-stream")(req, res);
        expect(estado.usadas).toBe(6);
        expect(rpcsChamadas("darcy_estornar_pergunta")).toHaveLength(0);
    });
});

describe("teto global diário", () => {
    it("custo do dia no teto: 503 TETO_GLOBAL sem chamar o LLM nem gastar cota", async () => {
        bancoCom({ custo: 15.2 });
        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);

        expect(res.statusCode).toBe(503);
        expect(res.body).toMatchObject({ codigo: "TETO_GLOBAL", error: "O assistente atingiu o limite de uso de hoje. Volta amanhã." });
        expect(rpcsChamadas("darcy_reservar_pergunta")).toHaveLength(0);
        nenhumLlmChamado();
    });

    it("AI_TETO_DIARIO_RS muda o teto", async () => {
        process.env.AI_TETO_DIARIO_RS = "20";
        bancoCom({ custo: 15.2 });
        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);
        expect(res.statusCode).toBe(200);
    });

    it("o custo fica em cache e não é consultado a cada pergunta", async () => {
        const estado = bancoCom({ custo: 1 });
        expect(await tetoGlobalAtingido(1_000)).toBe(false);
        estado.custo = 99;
        expect(await tetoGlobalAtingido(1_000 + TETO_CACHE_MS - 1)).toBe(false);
        expect(rpcsChamadas("darcy_custo_ia_hoje")).toHaveLength(1);
        expect(await tetoGlobalAtingido(1_000 + TETO_CACHE_MS)).toBe(true);
    });
});

describe("GET /assistente/cota", () => {
    it("devolve o estado sem consumir", async () => {
        bancoCom({ usadas: 12 });
        const { req, res } = mockReqRes({ token: TOKEN });
        await assistente("cota")(req, res);
        expect(res.body).toEqual({ cota: { usadas: 12, limite: 30, restantes: 18, renova_em: "2026-09-30T03:00:00.000Z" } });
        expect(rpcsChamadas("darcy_reservar_pergunta")).toHaveLength(0);
    });

    it("exige login", async () => {
        bancoCom();
        const { req, res } = mockReqRes({ token: null });
        await assistente("cota")(req, res);
        expect(res.statusCode).toBe(401);
        expect(res.body.codigo).toBe("LOGIN_NECESSARIO");
    });
});

describe("rastreabilidade no ai_usage_log", () => {
    it.each([
        ["/assistente/chat", () => assistente("chat"), MSG, "assistente-chat"],
        ["/assistente/analyze-sabia", () => assistente("analyze-sabia"), { materia: "IA" }, "analyze-sabia"],
        ["/assistente/analyze-sabia-stream", () => assistente("analyze-sabia-stream"), { materia: "IA" }, "analyze-sabia-stream"],
        ["/chat/send", () => chatSend(), { message: "oi" }, "chat-send"],
    ])("%s loga user_id e pergunta_id", async (_n, rota, body, endpoint) => {
        bancoCom();
        const { req, res } = mockReqRes({ body, token: TOKEN });
        await rota()(req, res);
        expect(mockLogAiUsage).toHaveBeenCalledWith(
            expect.objectContaining({ endpoint, userId: ALUNO.id, perguntaId: expect.any(String) })
        );
    });

    it("logAiUsage grava user_id e pergunta_id nas linhas", async () => {
        const { logAiUsage } = jest.requireActual("../src/utils/ai_usage_logger");
        logAiUsage({
            endpoint: "assistente-chat", durationMs: 1, success: true, requestExcerpt: "oi",
            usage: [{ model: "sabia-4", prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }],
            userId: ALUNO.id, perguntaId: "p-1",
        });
        await new Promise((r) => setImmediate(r));
        expect(mockInsert).toHaveBeenCalledWith([
            expect.objectContaining({ endpoint: "assistente-chat", user_id: ALUNO.id, pergunta_id: "p-1" }),
        ]);
    });

    it("logAiUsage pega usuário/pergunta do contexto da requisição (ex.: dificuldade no lazy load)", async () => {
        const { logAiUsage, executarComContextoIA } = jest.requireActual("../src/utils/ai_usage_logger");
        await executarComContextoIA({ userId: ALUNO.id, perguntaId: "p-2" }, async () => {
            await Promise.resolve();
            logAiUsage({ endpoint: "planejamento-gerar-plano-dificuldade", durationMs: 1, success: true, requestExcerpt: "3 materias",
                usage: [{ model: "sabiazinho-4", prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }] });
        });
        await new Promise((r) => setImmediate(r));
        expect(mockInsert).toHaveBeenCalledWith([
            expect.objectContaining({ user_id: ALUNO.id, pergunta_id: "p-2" }),
        ]);
    });
});

describe("falhas também entram no custo (success=false)", () => {
    const PARCIAL = [
        { model: "sabia-4", prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
        { model: "sabia-4", prompt_tokens: 1200, completion_tokens: 30, total_tokens: 1230 },
    ];
    const { anexarUsageParcial } = jest.requireActual("../src/utils/ai_usage_logger");

    function logDe(endpoint: string) {
        return mockLogAiUsage.mock.calls.map((c) => c[0]).filter((p) => p.endpoint === endpoint);
    }

    it("/assistente/chat: o loop de tools quebra na 3ª chamada — as duas pagas vão ao log, a pergunta é estornada", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockConversar.mockRejectedValue(anexarUsageParcial(new Error("Maritaca API error: 500"), PARCIAL));
        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);

        expect(res.statusCode).toBe(500);
        expect(estado.usadas).toBe(5);
        expect(logDe("assistente-chat")).toEqual([
            expect.objectContaining({
                success: false, usage: PARCIAL, userId: ALUNO.id, perguntaId: expect.any(String),
                requestExcerpt: "me recomenda optativas de IA",
            }),
        ]);
    });

    it("/assistente/chat sem nenhuma resposta do modelo: registra a falha com 0 tokens no sabia-4", async () => {
        bancoCom();
        mockConversar.mockRejectedValue(new Error("fetch failed"));
        const { req, res } = mockReqRes({ body: MSG, token: TOKEN });
        await assistente("chat")(req, res);
        expect(logDe("assistente-chat")).toEqual([
            expect.objectContaining({ success: false, usage: [], modeloPadrao: "sabia-4" }),
        ]);
    });

    it("/assistente/chat: comando /turmas que falha não vira uso de IA", async () => {
        bancoCom();
        mockConversar.mockRejectedValue(new Error("banco fora"));
        const { req, res } = mockReqRes({ body: { messages: [{ role: "user", content: "/turmas MAT0025" }] }, token: TOKEN });
        await assistente("chat")(req, res);
        expect(mockLogAiUsage).not.toHaveBeenCalled();
    });

    it("/planejamento/chat: erro depois da reserva registra a falha", async () => {
        (Utils.checkAuthorization as jest.Mock).mockResolvedValue(true);
        const estado = bancoCom({ usadas: 5 });
        const { req, res } = mockReqRes({
            // plano válido: a falha vem do banco ao montar o contexto (depois da reserva)
            body: {
                ...MSG,
                planoInput: {
                    curriculoCompleto: "8117/-2 - 2018.2", completedCodes: [], numeroPeriodo: 3,
                    preferencias: { limiteCreditos: 24, objetivo: "equilibrado", trabalha: false },
                },
            },
            token: TOKEN,
            headers: { "user-id": "7" },
        });
        await planejamento("chat")(req, res);

        expect(estado.usadas).toBe(5);
        const linhas = logDe("planejamento-chat");
        expect(linhas).toHaveLength(1);
        expect(linhas[0]).toMatchObject({ success: false, userId: ALUNO.id, modeloPadrao: "sabia-4" });
    });

    it("/chat/send: o usage acumulado até o erro (orquestrador + atuadores) vai ao log", async () => {
        const estado = bancoCom({ usadas: 5 });
        mockRun.mockImplementation(async (_agente: unknown, _msg: unknown, opts: any) => {
            // o modelo já respondeu duas vezes antes de o run quebrar
            opts.context.usage.inputTokens += 300;
            opts.context.usage.outputTokens += 20;
            throw new Error("boom");
        });
        const { req, res } = mockReqRes({ body: { message: "oi" }, token: TOKEN });
        await chatSend()(req, res);

        expect(estado.usadas).toBe(5);
        expect(logDe("chat-send")).toEqual([
            expect.objectContaining({
                success: false,
                userId: ALUNO.id,
                usage: [{ model: "sabia-4", prompt_tokens: 300, completion_tokens: 20, total_tokens: 320 }],
            }),
        ]);
    });

    it.each([
        ["timeout", () => mockSabia.analyzarInteresse.mockRejectedValue(new Error("timeout"))],
        ["success:false", () => mockSabia.analyzarInteresse.mockResolvedValue({ success: false, error: "KeyError", usage: PARCIAL })],
    ])("/assistente/analyze-sabia (%s) registra a falha", async (_n, preparar) => {
        bancoCom();
        preparar();
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze-sabia")(req, res);
        expect(logDe("analyze-sabia")).toEqual([
            expect.objectContaining({ success: false, userId: ALUNO.id, perguntaId: expect.any(String) }),
        ]);
    });

    it("/assistente/analyze-sabia-stream que lança registra a falha", async () => {
        bancoCom();
        mockSabia.analyzarInteresseStream.mockRejectedValue(new Error("ECONNRESET"));
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze-sabia-stream")(req, res);
        expect(logDe("analyze-sabia-stream")).toEqual([
            expect.objectContaining({ success: false, userId: ALUNO.id, modeloPadrao: "sabia-4" }),
        ]);
    });
});

describe("POST /assistente/analyze (RAGFlow) no ai_usage_log", () => {
    const logDe = () => mockLogAiUsage.mock.calls.map((c) => c[0]).filter((p) => p.endpoint === "analyze");

    it("sucesso: registra a chamada com model 'ragflow', duração e a pergunta", async () => {
        bancoCom();
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze")(req, res);

        expect(res.statusCode).toBe(200);
        expect(logDe()).toEqual([
            expect.objectContaining({
                success: true,
                durationMs: expect.any(Number),
                requestExcerpt: "IA",
                userId: ALUNO.id,
                perguntaId: expect.any(String),
                usage: [{ model: "ragflow", prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }],
            }),
        ]);
    });

    it("usa os tokens quando o RAGFlow devolve `usage`", async () => {
        bancoCom();
        const original = mockRagflow.analyzeMateria.getMockImplementation()!;
        mockRagflow.analyzeMateria.mockImplementation(async (...a: unknown[]) => {
            const r = await original(...a);
            return { ...r, data: { ...r.data, usage: { prompt_tokens: 120, completion_tokens: 30 } } };
        });
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze")(req, res);
        expect(logDe()[0].usage).toEqual([{ model: "ragflow", prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }]);
    });

    it.each([
        ["code != 0", () => mockRagflow.analyzeMateria.mockResolvedValue({ code: 102, message: "x", data: {} })],
        ["sem ranking", () => mockRagflow.analyzeMateria.mockResolvedValue({ code: 0, data: { session_id: "s1" } })],
        ["exceção", () => mockRagflow.startSession.mockRejectedValue(new Error("ECONNREFUSED"))],
    ])("falha (%s): registra success=false", async (_n, preparar) => {
        bancoCom();
        preparar();
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente("analyze")(req, res);
        expect(logDe()).toEqual([expect.objectContaining({ success: false, modeloPadrao: "ragflow" })]);
    });
});

describe("Sabiá recebe a pergunta no contexto (embeddings do /recomendar no log)", () => {
    it.each([
        ["analyze-sabia", () => mockSabia.analyzarInteresse],
        ["analyze-sabia-stream", () => mockSabia.analyzarInteresseStream],
    ])("%s roda o SabiaService dentro do contexto da pergunta", async (rota, fn) => {
        bancoCom();
        const { contextoIAAtual } = jest.requireActual("../src/utils/ai_usage_logger");
        let visto: unknown;
        const original = fn().getMockImplementation();
        fn().mockImplementation(async (...a: unknown[]) => {
            visto = contextoIAAtual();
            return original ? original(...a) : { success: true, disciplinas: [], usage: [] };
        });
        const { req, res } = mockReqRes({ body: { materia: "IA" }, token: TOKEN });
        await assistente(rota)(req, res);
        expect(visto).toEqual({ userId: ALUNO.id, perguntaId: expect.any(String) });
    });
});
