/**
 * Testes do SabiaService (cliente HTTP do mcp_agent) com `fetch` mockado —
 * nenhuma chamada de rede real.
 *
 * R30: timeout nas chamadas ao mcp_agent.
 * R31: abortar o stream do upstream quando o cliente fecha a conexão.
 * R32: nota fora de 0-10 / código fora do padrão não chegam ao front.
 * R51: teto de termos na busca semântica.
 */

import { EventEmitter } from "events";
import type { Response as ExpressResponse } from "express";
import {
    SabiaService,
    SabiaTimeoutError,
    SABIA_BUSCA_TIMEOUT_MS,
    SABIA_STREAM_IDLE_TIMEOUT_MS,
    SABIA_TIMEOUT_MS,
} from "../src/services/sabia.service";
import { executarComContextoIA } from "../src/utils/ai_usage_logger";

const ENV_KEYS = ["MARITACA_API_KEY", "GOOGLE_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SABIA_API_URL"];
const envOriginal: Record<string, string | undefined> = {};
const fetchOriginal = global.fetch;

beforeAll(() => {
    for (const k of ENV_KEYS) envOriginal[k] = process.env[k];
    process.env.MARITACA_API_KEY = "fake";
    process.env.GOOGLE_API_KEY = "fake";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
    process.env.SABIA_API_URL = "http://sabia.test";
});

afterAll(() => {
    for (const k of ENV_KEYS) {
        if (envOriginal[k] === undefined) delete process.env[k];
        else process.env[k] = envOriginal[k];
    }
});

afterEach(() => {
    global.fetch = fetchOriginal;
    jest.useRealTimers();
});

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("SabiaService.buscarMaterias — rastreabilidade da pergunta", () => {
    test("manda user_id e pergunta_id da pergunta corrente para o mcp_agent", async () => {
        const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ materias: [] }));
        global.fetch = fetchMock as unknown as typeof fetch;

        await executarComContextoIA({ userId: "u-1", perguntaId: "p-1" }, () =>
            new SabiaService().buscarMaterias(["redes"]),
        );

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body).toMatchObject({ user_id: "u-1", pergunta_id: "p-1" });
    });

    test("fora de uma pergunta manda null", async () => {
        const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ materias: [] }));
        global.fetch = fetchMock as unknown as typeof fetch;

        await new SabiaService().buscarMaterias(["redes"]);

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body).toMatchObject({ user_id: null, pergunta_id: null });
    });
});

describe("SabiaService /recomendar(-stream) — rastreabilidade da pergunta", () => {
    // O Python loga as embeddings Gemini da busca feita dentro do /recomendar
    // com estes ids; sem eles as linhas ficavam fora da pergunta no dashboard.
    test("/recomendar manda user_id e pergunta_id da pergunta corrente", async () => {
        const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ success: true, disciplinas: [], usage: [] }));
        global.fetch = fetchMock as unknown as typeof fetch;

        await executarComContextoIA({ userId: "u-1", perguntaId: "p-1" }, () =>
            new SabiaService().analyzarInteresse("redes"),
        );

        expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/recomendar$/);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body).toMatchObject({ interesse: "redes", user_id: "u-1", pergunta_id: "p-1" });
    });

    test("/recomendar-stream manda user_id e pergunta_id da pergunta corrente", async () => {
        const fetchMock = jest.fn().mockResolvedValue(
            new Response('data: {"stage":"done","resultado":""}\n\n', { status: 200, headers: { "Content-Type": "text/event-stream" } }),
        );
        global.fetch = fetchMock as unknown as typeof fetch;
        const res = Object.assign(new EventEmitter(), {
            write: jest.fn(() => true),
            end: jest.fn(),
            writableEnded: false,
        }) as unknown as ExpressResponse;

        await executarComContextoIA({ userId: "u-2", perguntaId: "p-2" }, () =>
            new SabiaService().analyzarInteresseStream("redes", "", res),
        );

        expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/recomendar-stream$/);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body).toMatchObject({ user_id: "u-2", pergunta_id: "p-2" });
    });
});

describe("SabiaService.buscarMaterias — teto de termos (R51)", () => {
    test("manda no máximo 4 termos, sem duplicados, para o mcp_agent", async () => {
        const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ materias: [] }));
        global.fetch = fetchMock as unknown as typeof fetch;

        const termos = ["redes", "redes", " ", ...Array.from({ length: 50 }, (_, i) => `t${i}`)];
        await new SabiaService().buscarMaterias(termos);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.termos_busca).toEqual(["redes", "t0", "t1", "t2"]);
    });

    test("sem termo válido não chama o mcp_agent", async () => {
        const fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        expect(await new SabiaService().buscarMaterias(["", "  "])).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

/** fetch que só termina quando `init.signal` aborta (upstream pendurado). */
function fetchPendurado() {
    return jest.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return; // sem signal: fica pendurado para sempre
        signal.addEventListener("abort", () => reject(signal.reason));
    }));
}

/** Troca AbortSignal.timeout por um signal que o teste aborta na mão. */
function controlarAbortSignalTimeout() {
    const pedidos: Array<{ ms: number; ac: AbortController }> = [];
    jest.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
        const ac = new AbortController();
        pedidos.push({ ms, ac });
        return ac.signal;
    });
    const estourar = () => {
        for (const p of pedidos) p.ac.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    };
    return { pedidos, estourar };
}

describe("SabiaService — timeout das chamadas ao mcp_agent (R30)", () => {
    afterEach(() => jest.restoreAllMocks());

    test("analyzarInteresse desiste com SabiaTimeoutError quando o upstream não responde", async () => {
        global.fetch = fetchPendurado() as unknown as typeof fetch;
        const { pedidos, estourar } = controlarAbortSignalTimeout();

        const p = new SabiaService().analyzarInteresse("ia");
        expect(pedidos.map((x) => x.ms)).toEqual([SABIA_TIMEOUT_MS]);
        estourar();
        await expect(p).rejects.toBeInstanceOf(SabiaTimeoutError);
    });

    test("buscarMaterias desiste e devolve [] quando o upstream não responde", async () => {
        global.fetch = fetchPendurado() as unknown as typeof fetch;
        const { pedidos, estourar } = controlarAbortSignalTimeout();

        const p = new SabiaService().buscarMaterias(["redes"]);
        expect(pedidos.map((x) => x.ms)).toEqual([SABIA_BUSCA_TIMEOUT_MS]);
        estourar();
        await expect(p).resolves.toEqual([]);
    });

    test("stream sem chunk por SABIA_STREAM_IDLE_TIMEOUT_MS vira SabiaTimeoutError", async () => {
        jest.useFakeTimers();
        global.fetch = fetchPendurado() as unknown as typeof fetch;
        const res = fakeRes();

        const p = new SabiaService().analyzarInteresseStream("ia", "", res as unknown as ExpressResponse);
        const verificacao = expect(p).rejects.toBeInstanceOf(SabiaTimeoutError);
        await jest.advanceTimersByTimeAsync(SABIA_STREAM_IDLE_TIMEOUT_MS + 1);
        await verificacao;
        // Em erro o res fica aberto para o controller escrever o evento de erro.
        expect(res.end).not.toHaveBeenCalled();
    });
});

/** Response do Express mínimo: EventEmitter com write/end/writableEnded. */
function fakeRes() {
    const res = new EventEmitter() as EventEmitter & {
        write: jest.Mock; end: jest.Mock; writableEnded: boolean;
    };
    res.writableEnded = false;
    res.write = jest.fn(() => true);
    res.end = jest.fn(() => {
        res.writableEnded = true;
        res.emit("close");
    });
    return res;
}

/**
 * Upstream SSE que emite `total` eventos, um a cada `intervaloMs`, e conta
 * quantos `pull` aconteceram. NÃO reage ao signal do fetch de propósito: o
 * service tem que cancelar o reader por conta própria.
 */
function upstreamSse(total: number, intervaloMs: number) {
    const stats = { pulls: 0, cancelado: false };
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            stats.pulls++;
            if (stats.pulls > total) {
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

describe("SabiaService.analyzarInteresseStream — cliente fecha a conexão (R31)", () => {
    test("aborta o upstream logo depois que o cliente sai e não escreve mais nada", async () => {
        const { body, stats } = upstreamSse(15, 10);
        global.fetch = jest.fn().mockResolvedValue(
            new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
        ) as unknown as typeof fetch;

        const res = fakeRes();
        const cliente = new AbortController();
        let pullsNoAbort = -1;
        res.write.mockImplementation(() => {
            // Cliente fecha a aba logo depois do 1º evento.
            if (!cliente.signal.aborted) {
                pullsNoAbort = stats.pulls;
                cliente.abort();
            }
            return true;
        });

        const r = await new SabiaService().analyzarInteresseStream("ia", "", res as unknown as ExpressResponse, cliente.signal);

        expect(r.aborted).toBe(true);
        // Um evento já veio do Python: a Maritaca foi chamada, a pergunta conta.
        expect(r.recebeuDoUpstream).toBe(true);
        expect(stats.cancelado).toBe(true);
        expect(stats.pulls - pullsNoAbort).toBeLessThanOrEqual(1);
        expect(res.write).toHaveBeenCalledTimes(1);
    });

    test("sem abort o stream é repassado inteiro e o res é encerrado", async () => {
        const { body } = upstreamSse(3, 1);
        global.fetch = jest.fn().mockResolvedValue(new Response(body, { status: 200 })) as unknown as typeof fetch;
        const res = fakeRes();

        const r = await new SabiaService().analyzarInteresseStream("ia", "", res as unknown as ExpressResponse, new AbortController().signal);

        expect(r.aborted).toBe(false);
        expect(r.recebeuDoUpstream).toBe(true);
        expect(res.write).toHaveBeenCalledTimes(3);
        expect(res.end).toHaveBeenCalledTimes(1);
    });
});

describe("SabiaService.analyzarInteresseStream — recebeuDoUpstream", () => {
    test("cliente que sai antes de qualquer byte do Python: recebeuDoUpstream false", async () => {
        // fetch real: signal já abortado rejeita antes de qualquer resposta.
        global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
            if (init?.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
            return new Response(upstreamSse(3, 1).body, { status: 200 });
        }) as unknown as typeof fetch;
        const cliente = new AbortController();
        cliente.abort();

        const r = await new SabiaService().analyzarInteresseStream("ia", "", fakeRes() as unknown as ExpressResponse, cliente.signal);

        expect(r.aborted).toBe(true);
        expect(r.recebeuDoUpstream).toBe(false);
    });
});

describe("SabiaService.analyzarInteresse — validação das disciplinas (R32)", () => {
    test("limita a nota a 0-10 e descarta código fora do padrão", async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({
            success: true,
            disciplinas: [
                { codigo: "CIC0004", nome: "ALG", nota: 85, justificativa: "x" },
                { codigo: "ZZZ99", nome: "INVENTADA", nota: 9, justificativa: "y" },
                { codigo: "MAT0025", nome: "CALCULO 1", nota: 8.5, justificativa: "z" },
            ],
        })) as unknown as typeof fetch;

        const service = new SabiaService();
        const r = await service.analyzarInteresse("ia");

        expect(r.disciplinas).toEqual([
            { codigo: "CIC0004", nome: "ALG", nota: 10, justificativa: "x" },
            { codigo: "MAT0025", nome: "CALCULO 1", nota: 8.5, justificativa: "z" },
        ]);
        const md = service.formatAsMarkdown(r);
        expect(md).not.toContain("85/10");
        expect(md).toContain("8.5/10");
    });
});
