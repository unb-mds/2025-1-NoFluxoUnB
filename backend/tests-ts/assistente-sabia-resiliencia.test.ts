/**
 * Rotas do Sabiá no AssistenteController com `fetch` mockado (sem rede).
 *
 * R30: upstream pendurado em /analyze-sabia vira 504 em vez de esperar pra sempre.
 * R31: cliente fechando a conexão SSE aborta o stream do upstream.
 */

import { EventEmitter } from "events";

jest.mock("../src/utils/ai_usage_logger", () => ({ ...jest.requireActual("../src/utils/ai_usage_logger"), logAiUsage: jest.fn() }));

// Login/cota fora do escopo deste arquivo (ver darcy-login-cota.test.ts).
jest.mock("../src/utils/ia_acesso", () => require("./utils/ia_acesso_liberado").iaAcessoLiberado());

const ENV = {
    MARITACA_API_KEY: "fake",
    GOOGLE_API_KEY: "fake",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fake",
    SABIA_API_URL: "http://sabia.test",
};
const envOriginal: Record<string, string | undefined> = {};
for (const [k, v] of Object.entries(ENV)) {
    envOriginal[k] = process.env[k];
    process.env[k] = v;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AssistenteController } = require("../src/controllers/assistente_controller");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { logAiUsage } = require("../src/utils/ai_usage_logger");

const fetchOriginal = global.fetch;

afterAll(() => {
    for (const [k, v] of Object.entries(envOriginal)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
});

afterEach(() => {
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
    (logAiUsage as jest.Mock).mockClear();
});

function rota(nome: string) {
    return AssistenteController.routes[nome].value as (req: unknown, res: unknown) => Promise<unknown>;
}

/** Response do Express mínimo, com 'close' emitido no end() como o http real. */
function fakeRes() {
    const res = new EventEmitter() as EventEmitter & Record<string, any>;
    res.writableEnded = false;
    res.statusCode = 200;
    res.setHeader = jest.fn();
    res.flushHeaders = jest.fn();
    res.write = jest.fn(() => true);
    res.end = jest.fn(() => {
        res.writableEnded = true;
        res.emit("close");
    });
    res.status = jest.fn((c: number) => {
        res.statusCode = c;
        return res;
    });
    res.json = jest.fn(() => res);
    return res;
}

function upstreamSse(total: number, intervaloMs: number, { comDone = false } = {}) {
    const stats = { pulls: 0, cancelado: false };
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            stats.pulls++;
            if (stats.pulls > total) {
                if (comDone && stats.pulls === total + 1) {
                    controller.enqueue(encoder.encode('data: {"stage":"done"}\n\n'));
                    return;
                }
                controller.close();
                return;
            }
            await new Promise((r) => setTimeout(r, intervaloMs));
            controller.enqueue(encoder.encode(`data: {"stage":"disciplina","n":${stats.pulls}}\n\n`));
        },
        cancel() {
            stats.cancelado = true;
        },
    }, { highWaterMark: 0 });
    return { body, stats };
}

describe("POST /assistente/analyze-sabia-stream — cliente fecha a conexão (R31)", () => {
    test("res 'close' antes do fim aborta o upstream e não escreve evento de erro", async () => {
        const { body, stats } = upstreamSse(15, 10);
        global.fetch = jest.fn().mockResolvedValue(new Response(body, { status: 200 })) as unknown as typeof fetch;

        const res = fakeRes();
        let pullsNoClose = -1;
        res.write.mockImplementation((chunk: string) => {
            // O primeiro write é o evento `cota` (antes do upstream); o aluno
            // fecha a aba ao receber a primeira disciplina.
            if (String(chunk).includes('"stage":"cota"')) return true;
            if (pullsNoClose === -1) {
                pullsNoClose = stats.pulls;
                res.emit("close"); // aluno fechou a aba (sem res.end)
            }
            return true;
        });

        await rota("analyze-sabia-stream")({ body: { materia: "ia" } }, res);

        expect(stats.cancelado).toBe(true);
        expect(stats.pulls - pullsNoClose).toBeLessThanOrEqual(1);
        expect(res.write).toHaveBeenCalledTimes(2); // cota + 1 disciplina
        expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test("stream completo continua sendo repassado e logado com sucesso", async () => {
        const { body, stats } = upstreamSse(3, 1, { comDone: true });
        global.fetch = jest.fn().mockResolvedValue(new Response(body, { status: 200 })) as unknown as typeof fetch;
        const res = fakeRes();

        await rota("analyze-sabia-stream")({ body: { materia: "ia" } }, res);

        expect(stats.cancelado).toBe(false);
        expect(res.write).toHaveBeenCalledTimes(5); // cota + 3 disciplinas + done
        expect(res.end).toHaveBeenCalledTimes(1);
        expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});

describe("POST /assistente/analyze-sabia — upstream pendurado (R30)", () => {
    test("responde 504 quando o timeout do fetch estoura", async () => {
        global.fetch = jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_r, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        })) as unknown as typeof fetch;
        const timeouts: AbortController[] = [];
        jest.spyOn(AbortSignal, "timeout").mockImplementation(() => {
            const ac = new AbortController();
            timeouts.push(ac);
            return ac.signal;
        });

        const res = fakeRes();
        const p = rota("analyze-sabia")({ body: { materia: "ia" } }, res);
        // Login e reserva da cota rodam antes do fetch (assíncronos).
        for (let i = 0; i < 20 && timeouts.length === 0; i++) await new Promise((r) => setImmediate(r));
        expect(timeouts).toHaveLength(1);
        timeouts[0].abort(new DOMException("timeout", "TimeoutError"));
        await p;

        expect(res.status).toHaveBeenCalledWith(504);
    });
});
