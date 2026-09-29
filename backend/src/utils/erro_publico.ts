/**
 * Erros que chegam ao cliente nas rotas de IA.
 *
 * As rotas do assistente devolviam `error.message` cru: mensagem do provedor,
 * corpo de erro do FastAPI e até a URL interna do serviço Sabiá
 * (`Cannot connect to Sabiá API ... on http://<host interno>`), exibidos na
 * tela pelo frontend (pré-mortem 27/09/2026, R34). O detalhe agora vai só para
 * o log, marcado com um requestId que também volta ao cliente — assim um
 * print do usuário ainda leva à linha certa do log.
 */

import { randomUUID } from 'crypto';

export const ERRO_IA_GENERICO = 'Não foi possível processar sua solicitação agora. Tente novamente em instantes.';

/** Loga o detalhe da falha com um requestId novo e devolve o id. */
export function registrarFalha(logger: { error(message: string): void }, contexto: string, detalhe: unknown): string {
    const requestId = randomUUID();
    const msg = detalhe instanceof Error ? detalhe.message : String(detalhe);
    logger.error(`[requestId=${requestId}] ${contexto}: ${msg}`);
    return requestId;
}
