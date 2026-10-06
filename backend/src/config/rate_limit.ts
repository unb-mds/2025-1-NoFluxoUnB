/**
 * Rate limiting do backend.
 *
 * Fica fora do index.ts pelo mesmo motivo do cors.ts: dá para testar sem subir
 * o servidor inteiro (Supabase, controllers etc.).
 *
 * Pré-mortem de 27/09/2026 (R2): o limiter global rodava sem `trust proxy`.
 * Atrás do Traefik, `req.ip` é o IP do proxy — todos os alunos caíam no MESMO
 * balde de 120 req/min e o 121º aluno do minuto levava 429. Na semana de
 * matrícula isso derruba o site.
 *
 * Pré-mortem R8: as rotas que chamam LLM pago (Maritaca/RAGFlow) ganham um
 * limiter por IP próprio, bem mais apertado que o global. Desde 29/09/2026 elas
 * também exigem login e descontam da cota diária por usuário (utils/ia_acesso.ts);
 * o limiter por IP continua como primeira barreira contra rajadas.
 */

import type { Express, Request } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

/**
 * Quantos proxies confiáveis existem na frente do Express (Traefik no K3s = 1).
 * Configurável por `TRUST_PROXY` caso entre um CDN na frente (ex.: 2).
 * Nunca usar `true`: com isso o cliente escolhe o próprio IP via X-Forwarded-For
 * e fura o rate limit.
 */
export function resolveTrustProxy(env: NodeJS.ProcessEnv = process.env): number {
    const n = Number.parseInt(env.TRUST_PROXY ?? "", 10);
    return Number.isInteger(n) && n >= 0 ? n : 1;
}

/** Rotas que nunca devem levar 429 (probes do Kubernetes). */
const SEM_LIMITE = new Set(["/", "/health"]);

/** Rotas que disparam chamada a LLM pago. */
export const ROTAS_IA_PAGA = [
    "/assistente/analyze",
    "/assistente/analyze-sabia",
    "/assistente/analyze-sabia-stream",
    "/assistente/chat",
    "/planejamento/chat",
    "/chat/send",
];

export interface RateLimitOptions {
    globalPorMinuto?: number;
    iaPorMinuto?: number;
}

function inteiroPositivo(valor: string | undefined, padrao: number): number {
    const n = Number.parseInt(valor ?? "", 10);
    return Number.isInteger(n) && n > 0 ? n : padrao;
}

/**
 * Limites por IP por minuto. Atenção: o Wi-Fi do campus põe muitos alunos atrás
 * do MESMO IP público (NAT) — por isso o teto de IA não é baixo demais e os dois
 * são ajustáveis por env sem mexer em código.
 */
export function resolveLimits(env: NodeJS.ProcessEnv = process.env): Required<RateLimitOptions> {
    return {
        globalPorMinuto: inteiroPositivo(env.RATE_LIMIT_GLOBAL_PER_MIN, 120),
        iaPorMinuto: inteiroPositivo(env.RATE_LIMIT_IA_PER_MIN, 20),
    };
}

export function createGlobalLimiter(opts: RateLimitOptions = {}): RateLimitRequestHandler {
    return rateLimit({
        windowMs: 60 * 1000,
        limit: opts.globalPorMinuto ?? 120,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req: Request) => SEM_LIMITE.has(req.path),
        message: { error: "Muitas requisições. Tente novamente em instantes." },
    });
}

export function createAiLimiter(opts: RateLimitOptions = {}): RateLimitRequestHandler {
    return rateLimit({
        windowMs: 60 * 1000,
        limit: opts.iaPorMinuto ?? 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { erro: "Você fez muitas perguntas ao assistente em pouco tempo. Aguarde um minuto e tente de novo." },
    });
}

/** Aplica trust proxy + limiters. Chamar ANTES de registrar as rotas. */
export function applyRateLimits(app: Express, env: NodeJS.ProcessEnv = process.env): void {
    const limites = resolveLimits(env);
    app.set("trust proxy", resolveTrustProxy(env));
    app.use(createGlobalLimiter(limites));
    app.use(ROTAS_IA_PAGA, createAiLimiter(limites));
}
