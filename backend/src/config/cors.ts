/**
 * Allowlist de CORS do backend.
 *
 * Fica num módulo próprio (e não inline no index.ts) por dois motivos:
 * dá para testar a decisão de origem sem subir o servidor, e a lista de
 * domínios deixa de ser algo que só se descobre lendo o bootstrap do Express.
 *
 * Cuidado ao mexer: `no-fluxo.crianex.com` é o domínio onde o frontend roda de
 * verdade (ver ARG PUBLIC_REDIRECT_URL em k8s.frontend-svelte.Dockerfile).
 * Tirá-lo da lista derruba o app inteiro — já aconteceu em 05/09/2026.
 *
 * `no-fluxo.com` NÃO entra: o domínio expirou (whois sem registro em 10/2026)
 * e qualquer um pode comprá-lo; liberado aqui, um site nesse endereço faria o
 * navegador dos alunos chamar a API. Só volta se o domínio for nosso de novo.
 */

import type { CorsOptions } from "cors";

/** Domínios fixos: produção do app, host legado e portas de dev. */
const DEFAULT_ORIGINS = [
    "https://no-fluxo.crianex.com",
    "https://simplifica-pbl.space",
    "http://localhost:3000",
    "http://localhost:3008",
    "http://localhost:5000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3008",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:5173",
];

/** Qualquer porta em localhost/127.0.0.1 — conveniência de desenvolvimento. */
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Origens permitidas: as fixas mais o que vier em `ALLOWED_ORIGINS`
 * (separado por vírgula). A env só acrescenta — assim um typo na variável de
 * ambiente do cluster não tem como cortar o domínio de produção.
 */
export function resolveAllowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
    const extras = (env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origem) => origem.trim().replace(/\/+$/, ""))
        .filter(Boolean);

    return new Set([...DEFAULT_ORIGINS, ...extras]);
}

export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
    const allowedOrigins = resolveAllowedOrigins(env);

    return {
        origin: (origin, callback) => {
            // Sem Origin: curl, health check do cluster, server-to-server.
            if (!origin) return callback(null, true);
            if (allowedOrigins.has(origin)) return callback(null, true);
            if (LOCALHOST.test(origin)) return callback(null, true);

            // Negar é omitir os cabeçalhos e deixar o browser bloquear.
            // `callback(new Error(...))` viraria 500 antes de qualquer rota —
            // some com o motivo real e quebra até quem não é browser.
            return callback(null, false);
        },
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization", "User-ID"],
        credentials: false,
        optionsSuccessStatus: 204,
        preflightContinue: false,
    };
}
