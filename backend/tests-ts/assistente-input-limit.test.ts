/**
 * Teto do texto livre enviado ao LLM pago (pré-mortem 27/09/2026, R8).
 * Antes, um body de 2 MB em `materia` era repassado inteiro à Maritaca.
 * O corte acontece ANTES de qualquer checagem de serviço/chamada externa.
 */

import type { Request, Response } from "express";

// Login/cota fora do escopo deste arquivo (ver darcy-login-cota.test.ts).
jest.mock("../src/utils/ia_acesso", () => require("./utils/ia_acesso_liberado").iaAcessoLiberado());

// Serviços de IA sempre "indisponíveis" aqui: nenhum teste pode gerar chamada paga.
jest.mock("../src/services/ragflow.service", () => ({
    RagflowService: jest.fn().mockImplementation(() => ({ isAvailable: () => false })),
}));
jest.mock("../src/services/sabia.service", () => ({
    SabiaService: jest.fn().mockImplementation(() => ({ isAvailable: () => false })),
}));

import { AssistenteController, MAX_MATERIA_CHARS } from "../src/controllers/assistente_controller";

function mockRes() {
    const res: any = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.setHeader = jest.fn();
    res.flushHeaders = jest.fn();
    res.write = jest.fn();
    res.end = jest.fn();
    return res as Response & { status: jest.Mock; json: jest.Mock; flushHeaders: jest.Mock };
}

const ROTAS = ["analyze", "analyze-sabia", "analyze-sabia-stream"] as const;

describe.each(ROTAS)("/assistente/%s", (rota) => {
    const handler = AssistenteController.routes[rota].value;

    it(`recusa materia com mais de ${MAX_MATERIA_CHARS} caracteres com 413`, async () => {
        const res = mockRes();
        await handler({ body: { materia: "a".repeat(MAX_MATERIA_CHARS + 1) }, headers: {} } as unknown as Request, res);
        expect(res.status).toHaveBeenCalledWith(413);
        expect(res.flushHeaders).not.toHaveBeenCalled();
    });

    it(`não recusa por tamanho uma materia de exatamente ${MAX_MATERIA_CHARS} caracteres`, async () => {
        const res = mockRes();
        await handler({ body: { materia: "a".repeat(MAX_MATERIA_CHARS) }, headers: {} } as unknown as Request, res);
        expect(res.status).not.toHaveBeenCalledWith(413);
    });
});
