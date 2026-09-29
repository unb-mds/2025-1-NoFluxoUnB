/**
 * Testes do SabiaService (cliente HTTP do mcp_agent) com `fetch` mockado —
 * nenhuma chamada de rede real.
 *
 * R51: teto de termos na busca semântica.
 */

import { SabiaService } from "../src/services/sabia.service";

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
