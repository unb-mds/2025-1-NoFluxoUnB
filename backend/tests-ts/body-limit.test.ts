/**
 * Limite de corpo das requisições (pré-mortem 27/09/2026, R20).
 *
 * Antes o index.ts aceitava 50 MB de JSON em qualquer rota, parseado antes da
 * checagem de token. Aqui sobe um Express real com `applyBodyParsers` numa
 * porta efêmera e manda corpos de tamanhos diferentes.
 */

import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { applyBodyParsers } from "../src/config/body_limit";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
    const app = express();
    applyBodyParsers(app);
    // Eco do tamanho recebido: prova que o corpo chegou parseado na rota.
    app.post("*", (req, res) => {
        res.json({ recebido: JSON.stringify(req.body).length });
    });
    await new Promise<void>((resolve) => {
        server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** JSON com ~`kb` KB. */
function corpo(kb: number): string {
    return JSON.stringify({ dados: "x".repeat(kb * 1024) });
}

async function post(path: string, body: string) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });
    return { status: res.status, body: (await res.json()) as any };
}

describe("limite de corpo global", () => {
    it("aceita 500 KB numa rota comum", async () => {
        const { status } = await post("/assistente/chat", corpo(500));
        expect(status).toBe(200);
    });

    it("rejeita 2 MB numa rota comum com 413 em JSON", async () => {
        const { status, body } = await post("/assistente/chat", corpo(2 * 1024));
        expect(status).toBe(413);
        expect(body).toEqual({ error: expect.any(String) });
    });

    it("JSON malformado vira 400 em JSON, sem stack trace", async () => {
        const { status, body } = await post("/assistente/chat", "{nao é json");
        expect(status).toBe(400);
        expect(JSON.stringify(body)).not.toMatch(/at |node_modules/);
    });
});

describe("overrides por rota", () => {
    it("casar_disciplinas aceita 3 MB (histórico com texto integral do PDF)", async () => {
        const { status, body } = await post("/fluxograma/casar_disciplinas", corpo(3 * 1024));
        expect(status).toBe(200);
        expect(body.recebido).toBeGreaterThan(3 * 1024 * 1024);
    });

    it("upload-dados-fluxograma aceita 3 MB", async () => {
        const { status } = await post("/fluxograma/upload-dados-fluxograma", corpo(3 * 1024));
        expect(status).toBe(200);
    });

    it("override também tem teto: 6 MB em casar_disciplinas => 413", async () => {
        const { status } = await post("/fluxograma/casar_disciplinas", corpo(6 * 1024));
        expect(status).toBe(413);
    });

    it("planejamento/chat aceita 1,5 MB mas não 3 MB", async () => {
        expect((await post("/planejamento/chat", corpo(1536))).status).toBe(200);
        expect((await post("/planejamento/chat", corpo(3 * 1024))).status).toBe(413);
    });
});
