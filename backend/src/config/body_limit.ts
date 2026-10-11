/**
 * Limite de tamanho do corpo das requisições.
 *
 * Antes era 50 MB para TODA rota (json e urlencoded), inclusive as que exigem
 * login — o body parser roda antes do handler, então o JSON inteiro era
 * parseado em memória antes de qualquer checagem de token. Com o rate limit
 * global de 120 req/min, um único IP conseguia empurrar ~6 GB/min para o
 * heap do Node (pré-mortem 27/09/2026, R20).
 *
 * Fica num módulo próprio (mesmo padrão de cors.ts) para dar para testar sem
 * subir o servidor e para os overrides ficarem visíveis num lugar só.
 *
 * Medição dos payloads grandes (pior caso plausível, histórico SIGAA de 150
 * disciplinas com o texto integral do PDF): casar_disciplinas ~190 KB,
 * upload-dados-fluxograma ~290 KB, planejamento/chat com 60 mensagens
 * ~135 KB, gerar-plano ~2 KB. O global de 1 MB já cobre tudo isso; os
 * overrides dão folga às rotas que carregam histórico/fluxograma inteiro.
 */

import bodyParser from "body-parser";
import type { Express, NextFunction, Request, Response } from "express";

/** Limite padrão de qualquer rota sem override. */
export const BODY_LIMIT_GLOBAL = "1mb";

/**
 * Rotas que recebem JSON grande de verdade. Registradas ANTES do parser
 * global: o body-parser marca `req._body` e o global não reparseia.
 */
export const BODY_LIMIT_OVERRIDES: Record<string, string> = {
    "/fluxograma/casar_disciplinas": "5mb",
    "/fluxograma/upload-dados-fluxograma": "5mb",
    "/planejamento/gerar-plano": "2mb",
    "/planejamento/chat": "2mb",
};

/**
 * Erro do body-parser vira JSON curto. Sem isso o Express cai no handler
 * padrão, que devolve HTML com stack trace quando NODE_ENV != production
 * (o Dockerfile do backend não define NODE_ENV).
 */
export function bodyParserErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
    if (err?.type === "entity.too.large") {
        return res.status(413).json({ error: "Corpo da requisição muito grande." });
    }
    if (err?.type === "entity.parse.failed") {
        return res.status(400).json({ error: "JSON inválido no corpo da requisição." });
    }
    return next(err);
}

export function applyBodyParsers(app: Express): void {
    for (const [rota, limit] of Object.entries(BODY_LIMIT_OVERRIDES)) {
        app.use(rota, bodyParser.json({ limit }), bodyParser.urlencoded({ extended: true, limit }));
    }

    app.use(bodyParser.json({ limit: BODY_LIMIT_GLOBAL }));
    app.use(bodyParser.urlencoded({ extended: true, limit: BODY_LIMIT_GLOBAL }));
    app.use(bodyParserErrorHandler);
}
