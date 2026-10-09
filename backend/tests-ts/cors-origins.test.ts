/**
 * Allowlist de CORS.
 *
 * Regressão de 05/09/2026: o commit 5442f87c ("Harden auth, CORS, and CI
 * permissions") passou a rejeitar origem desconhecida com `callback(new Error)`,
 * mas a allowlist nunca teve `https://no-fluxo.crianex.com` — que é o domínio
 * real do frontend em produção (k8s.frontend-svelte.Dockerfile:24). Resultado:
 * TODA requisição do app respondia 500 sem cabeçalho Access-Control-Allow-Origin.
 *
 * Dois invariantes saem daqui:
 *  1. o domínio de produção está na allowlist;
 *  2. origem negada NÃO vira erro — vira resposta sem os cabeçalhos de CORS.
 *     Erro no middleware do cors vira 500, que quebra até health check e
 *     esconde o motivo real atrás de "CORS header missing".
 */

import { resolveAllowedOrigins, buildCorsOptions } from "../src/config/cors";

/** Roda o callback de origem do pacote `cors` e devolve o resultado cru. */
function decidir(origin: string | undefined, env: NodeJS.ProcessEnv = {}) {
    const originFn = buildCorsOptions(env).origin as (
        origin: string | undefined,
        cb: (err: Error | null, allow?: boolean) => void
    ) => void;

    let resultado: { err: Error | null; allow?: boolean } | undefined;
    originFn(origin, (err, allow) => {
        resultado = { err, allow };
    });

    if (!resultado) throw new Error("callback de origem não foi chamado");
    return resultado;
}

describe("resolveAllowedOrigins", () => {
    it("inclui os domínios de produção do frontend", () => {
        const origens = resolveAllowedOrigins({});

        // O que quebrou em produção: só no-fluxo.com estava na lista.
        expect(origens.has("https://no-fluxo.crianex.com")).toBe(true);
    });

    it("não libera o domínio expirado no-fluxo.com (qualquer um pode registrá-lo)", () => {
        const origens = resolveAllowedOrigins({});

        expect(origens.has("https://no-fluxo.com")).toBe(false);
        expect(origens.has("https://www.no-fluxo.com")).toBe(false);
    });

    it("aceita origens extras via ALLOWED_ORIGINS, sem perder as padrão", () => {
        const origens = resolveAllowedOrigins({
            ALLOWED_ORIGINS: "https://preview.crianex.com, https://staging.crianex.com",
        });

        expect(origens.has("https://preview.crianex.com")).toBe(true);
        expect(origens.has("https://staging.crianex.com")).toBe(true);
        expect(origens.has("https://no-fluxo.crianex.com")).toBe(true);
    });

    it("ignora entradas vazias e barra final em ALLOWED_ORIGINS", () => {
        const origens = resolveAllowedOrigins({
            ALLOWED_ORIGINS: "https://a.example.com/, ,,https://b.example.com",
        });

        expect(origens.has("https://a.example.com")).toBe(true);
        expect(origens.has("https://b.example.com")).toBe(true);
        expect(origens.has("")).toBe(false);
    });
});

describe("buildCorsOptions().origin", () => {
    it("libera o domínio de produção", () => {
        expect(decidir("https://no-fluxo.crianex.com")).toEqual({ err: null, allow: true });
    });

    it("libera requisição sem Origin (curl, health check, server-to-server)", () => {
        expect(decidir(undefined)).toEqual({ err: null, allow: true });
    });

    it.each([
        "http://localhost:5173",
        "http://localhost:31415",
        "http://127.0.0.1:3000",
    ])("libera %s em dev", (origin) => {
        expect(decidir(origin)).toEqual({ err: null, allow: true });
    });

    /**
     * O ponto central da regressão: negar é omitir os cabeçalhos, não estourar.
     * Com Error o express devolve 500 antes de qualquer rota.
     */
    it.each([
        "https://evil.example.com",
        "https://no-fluxo.com",
        "https://www.no-fluxo.com",
        "https://no-fluxo.com.evil.example.com",
        "http://localhost.evil.example.com",
    ])("nega %s sem lançar erro", (origin) => {
        expect(decidir(origin)).toEqual({ err: null, allow: false });
    });
});
