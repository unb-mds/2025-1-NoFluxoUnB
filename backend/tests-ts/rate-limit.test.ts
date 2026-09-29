/**
 * Rate limiting atrás de proxy (pré-mortem 27/09/2026, R2 e R8).
 *
 * Bug: sem `trust proxy`, `req.ip` é o IP do Traefik e TODOS os alunos dividem
 * o mesmo balde de 120 req/min — o 121º aluno do minuto levava 429.
 *
 * Invariantes:
 *  1. clientes diferentes (X-Forwarded-For distintos) têm baldes separados;
 *  2. o mesmo cliente continua limitado;
 *  3. /health nunca leva 429 (probe do Kubernetes);
 *  4. rotas de IA paga têm um teto próprio, bem menor, por IP;
 *  5. TRUST_PROXY nunca vira `true` (o cliente escolheria o próprio IP);
 *  6. os limites são ajustáveis por env (NAT do Wi-Fi do campus).
 */

import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { applyRateLimits, resolveLimits, resolveTrustProxy, ROTAS_IA_PAGA } from "../src/config/rate_limit";

function montarApp(env: NodeJS.ProcessEnv = {}) {
    const app = express();
    applyRateLimits(app, env);
    app.get("/health", (_req, res) => res.json({ ok: true }));
    app.get("/cursos/all-cursos", (_req, res) => res.json({ ok: true }));
    for (const rota of ROTAS_IA_PAGA) app.post(rota, (_req, res) => res.json({ ok: true }));
    return app;
}

let server: Server | undefined;
let base: string;

async function subir(env: NodeJS.ProcessEnv = {}) {
    const s = montarApp(env).listen(0);
    server = s;
    await new Promise<void>((r) => s.once("listening", () => r()));
    base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

afterEach(async () => {
    const s = server;
    server = undefined;
    if (s) await new Promise<void>((r) => s.close(() => r()));
});

async function status(path: string, ip: string, method = "GET"): Promise<number> {
    const res = await fetch(base + path, { method, headers: { "X-Forwarded-For": ip } });
    await res.arrayBuffer();
    return res.status;
}

async function emSequencia(n: number, fn: (i: number) => Promise<number>): Promise<number[]> {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(await fn(i));
    return out;
}

describe("resolveTrustProxy", () => {
    it("usa 1 hop por padrão (Traefik)", () => {
        expect(resolveTrustProxy({})).toBe(1);
    });
    it("aceita número de hops via TRUST_PROXY", () => {
        expect(resolveTrustProxy({ TRUST_PROXY: "2" })).toBe(2);
        expect(resolveTrustProxy({ TRUST_PROXY: "0" })).toBe(0);
    });
    it("nunca devolve true, mesmo com TRUST_PROXY=true", () => {
        expect(resolveTrustProxy({ TRUST_PROXY: "true" })).toBe(1);
        expect(resolveTrustProxy({ TRUST_PROXY: "abc" })).toBe(1);
        expect(resolveTrustProxy({ TRUST_PROXY: "-1" })).toBe(1);
    });
});

describe("resolveLimits", () => {
    it("padrões: 120/min global e 20/min para IA", () => {
        expect(resolveLimits({})).toEqual({ globalPorMinuto: 120, iaPorMinuto: 20 });
    });
    it("lê RATE_LIMIT_GLOBAL_PER_MIN e RATE_LIMIT_IA_PER_MIN", () => {
        expect(resolveLimits({ RATE_LIMIT_GLOBAL_PER_MIN: "300", RATE_LIMIT_IA_PER_MIN: "40" }))
            .toEqual({ globalPorMinuto: 300, iaPorMinuto: 40 });
    });
    it("valor inválido, zero ou negativo cai no padrão (não desliga o limite)", () => {
        expect(resolveLimits({ RATE_LIMIT_GLOBAL_PER_MIN: "0", RATE_LIMIT_IA_PER_MIN: "abc" }))
            .toEqual({ globalPorMinuto: 120, iaPorMinuto: 20 });
        expect(resolveLimits({ RATE_LIMIT_IA_PER_MIN: "-5" }).iaPorMinuto).toBe(20);
    });
});

describe("limiter global atrás do proxy", () => {
    beforeEach(() => subir());

    it("130 alunos diferentes no mesmo minuto não levam 429", async () => {
        const st = await emSequencia(130, (i) => status("/cursos/all-cursos", `10.1.${Math.floor(i / 250)}.${i % 250}`));
        expect(st.filter((s) => s === 429)).toHaveLength(0);
    });

    it("o mesmo aluno continua limitado a 120/min", async () => {
        const st = await emSequencia(121, () => status("/cursos/all-cursos", "10.9.9.9"));
        expect(st.slice(0, 120).every((s) => s === 200)).toBe(true);
        expect(st[120]).toBe(429);
    });

    it("/health nunca leva 429", async () => {
        const st = await emSequencia(130, () => status("/health", "10.9.9.9"));
        expect(st.every((s) => s === 200)).toBe(true);
    });
});

describe("limiter das rotas de IA paga", () => {
    beforeEach(() => subir());

    it.each(ROTAS_IA_PAGA)("%s: 21ª chamada do mesmo IP no minuto leva 429", async (rota) => {
        const st = await emSequencia(21, () => status(rota, "10.7.7.7", "POST"));
        expect(st.slice(0, 20).every((s) => s === 200)).toBe(true);
        expect(st[20]).toBe(429);
    });

    it("limite de IA segue RATE_LIMIT_IA_PER_MIN", async () => {
        const s0 = server;
        server = undefined;
        await new Promise<void>((r) => s0!.close(() => r()));
        await subir({ RATE_LIMIT_IA_PER_MIN: "3" });
        const st = await emSequencia(4, () => status("/assistente/chat", "10.7.7.7", "POST"));
        expect(st).toEqual([200, 200, 200, 429]);
    });

    it("outro aluno não é afetado pelo limite de IA de quem abusou", async () => {
        await emSequencia(21, () => status("/assistente/chat", "10.7.7.7", "POST"));
        expect(await status("/assistente/chat", "10.8.8.8", "POST")).toBe(200);
    });

    it("estourar a IA não bloqueia o resto do app para o mesmo aluno", async () => {
        await emSequencia(21, () => status("/assistente/chat", "10.7.7.7", "POST"));
        expect(await status("/cursos/all-cursos", "10.7.7.7")).toBe(200);
    });
});

describe("regressão: sem trust proxy todos dividem um balde", () => {
    beforeEach(() => subir({ TRUST_PROXY: "0" }));

    it("com TRUST_PROXY=0 alunos diferentes esgotam o mesmo balde (o bug original)", async () => {
        const st = await emSequencia(121, (i) => status("/cursos/all-cursos", `10.2.0.${i % 250}`));
        expect(st[120]).toBe(429);
    });
});
