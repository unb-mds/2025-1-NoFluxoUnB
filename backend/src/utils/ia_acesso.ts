/**
 * Porta de entrada das rotas que chamam LLM pago (Maritaca/RAGFlow).
 *
 * Ordem, sempre ANTES de qualquer chamada externa ao modelo:
 *   1. login: token Supabase válido (Utils.getAuthenticatedUser) → senão 401
 *      { codigo: 'LOGIN_NECESSARIO' }. O bypass X-Dev-Impersonate só vale fora
 *      de produção e com ALLOW_DEV_IMPERSONATE=true (mesma regra de
 *      Utils.checkAuthorization);
 *   2. teto global de custo do dia → 503 { codigo: 'TETO_GLOBAL' };
 *   3. reserva atômica de uma pergunta na cota diária → 429 { codigo: 'COTA_DIARIA' }.
 *
 * A pergunta reservada só conta se o Darcy respondeu: qualquer falha (erro,
 * timeout, sem créditos, cliente que saiu antes da resposta) chama
 * `estornar()`. Toda resposta de sucesso leva `cota` para a rodinha do chat.
 */

import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Utils } from '../utils';
import { SupabaseWrapper } from '../supabase_wrapper';
import {
    type CotaIA,
    estornarPergunta,
    reservarPergunta,
    tetoGlobalAtingido,
} from '../services/darcy_cota.service';

export interface UsuarioIA {
    /** auth.users.id */
    id: string;
    email: string | null;
}

export const MSG_LOGIN_NECESSARIO = 'Faça login para usar o assistente.';
export const MSG_TETO_GLOBAL = 'O assistente atingiu o limite de uso de hoje. Volta amanhã.';
export const MSG_COTA_INDISPONIVEL = 'Não foi possível verificar seu limite de perguntas agora. Tente novamente em instantes.';

/** Corpo do 401. `error`/`erro` repetem a mensagem para os clientes antigos. */
export const LOGIN_NECESSARIO_BODY = {
    codigo: 'LOGIN_NECESSARIO',
    error: MSG_LOGIN_NECESSARIO,
    erro: MSG_LOGIN_NECESSARIO,
} as const;

export const TETO_GLOBAL_BODY = {
    codigo: 'TETO_GLOBAL',
    error: MSG_TETO_GLOBAL,
    erro: MSG_TETO_GLOBAL,
} as const;

export function msgCotaDiaria(limite: number): string {
    return `Você usou suas ${limite} perguntas de hoje. O limite renova à meia-noite.`;
}

async function usuarioDevImpersonado(req: Request): Promise<UsuarioIA | null> {
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEV_IMPERSONATE !== 'true') return null;
    if (!req.headers['x-dev-impersonate']) return null;
    if (!(await Utils.checkAuthorization(req))) return null;
    const idUser = req.headers['user-id'];
    const { data } = await SupabaseWrapper.get()
        .from('users')
        .select('auth_id, email')
        .eq('id_user', String(idUser))
        .limit(1);
    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.auth_id) return null;
    return { id: String(row.auth_id), email: row.email ?? null };
}

/** Usuário do token (ou do bypass dev), sem responder nada. */
export async function autenticarUsuarioIA(req: Request): Promise<UsuarioIA | null> {
    try {
        const dev = await usuarioDevImpersonado(req);
        if (dev) return dev;
        const user = await Utils.getAuthenticatedUser(req);
        if (!user?.id) return null;
        return { id: user.id, email: user.email ?? null };
    } catch {
        return null;
    }
}

/** Autentica ou responde 401 LOGIN_NECESSARIO (e devolve null). */
export async function exigirLoginIA(req: Request, res: Response): Promise<UsuarioIA | null> {
    const usuario = await autenticarUsuarioIA(req);
    if (!usuario) {
        res.status(401).json(LOGIN_NECESSARIO_BODY);
        return null;
    }
    return usuario;
}

export interface PerguntaIA {
    usuario: UsuarioIA;
    /** Agrupa no ai_usage_log as chamadas ao modelo desta pergunta. */
    perguntaId: string;
    /** Cota já contando esta pergunta. Muda para o valor devolvido se houver estorno. */
    cota: CotaIA;
    /** Devolve a pergunta (a IA falhou). Idempotente. */
    estornar(): Promise<void>;
    /** True se o cliente fechou a conexão antes de receber a resposta. */
    clienteSaiu(): boolean;
}

/**
 * Teto global + reserva na cota. Responde 503/429 e devolve null quando a
 * pergunta não pode seguir. Chamar depois de validar o corpo da requisição
 * (entrada inválida não gasta pergunta) e imediatamente antes do LLM.
 */
export async function reservarPerguntaIA(res: Response, usuario: UsuarioIA): Promise<PerguntaIA | null> {
    if (await tetoGlobalAtingido()) {
        res.status(503).json(TETO_GLOBAL_BODY);
        return null;
    }

    let reserva;
    try {
        reserva = await reservarPergunta(usuario.id);
    } catch (e) {
        // Fail-closed: sem conseguir contar, não chama o modelo pago.
        console.error('[ia_acesso] reserva da cota falhou:', e instanceof Error ? e.message : e);
        res.status(503).json({ codigo: 'COTA_INDISPONIVEL', error: MSG_COTA_INDISPONIVEL, erro: MSG_COTA_INDISPONIVEL });
        return null;
    }

    if (!reserva.permitido) {
        const msg = msgCotaDiaria(reserva.cota.limite);
        res.status(429).json({
            codigo: 'COTA_DIARIA',
            error: msg,
            erro: msg,
            usadas: reserva.cota.usadas,
            limite: reserva.cota.limite,
            renova_em: reserva.cota.renova_em,
            cota: reserva.cota,
        });
        return null;
    }

    // Cliente que sai antes da resposta não gasta a pergunta. O guard ignora o
    // 'close' que também dispara depois do res.end().
    let saiu = false;
    if (typeof (res as { on?: unknown }).on === 'function') {
        res.on('close', () => {
            if (!res.writableEnded) saiu = true;
        });
    }

    let estornada = false;
    const pergunta: PerguntaIA = {
        clienteSaiu: () => saiu,
        usuario,
        perguntaId: randomUUID(),
        cota: reserva.cota,
        async estornar() {
            if (estornada) return;
            estornada = true;
            const usadas = Math.max(0, pergunta.cota.usadas - 1);
            pergunta.cota = { ...pergunta.cota, usadas, restantes: Math.max(0, pergunta.cota.limite - usadas) };
            await estornarPergunta(usuario.id, reserva.dia);
        },
    };
    return pergunta;
}

/** Login + teto + cota numa chamada só (rotas sem validação intermediária). */
export async function abrirPerguntaIA(req: Request, res: Response): Promise<PerguntaIA | null> {
    const usuario = await exigirLoginIA(req, res);
    if (!usuario) return null;
    return reservarPerguntaIA(res, usuario);
}
