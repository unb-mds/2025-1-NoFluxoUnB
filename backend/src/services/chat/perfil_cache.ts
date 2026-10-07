/**
 * Cache em memória do perfil do aluno da Darcy (`perfil_aluno.ts`).
 *
 * Módulo à parte, sem dependências, para que controllers que GRAVAM dados do
 * aluno (upload de histórico, preferências) possam invalidar o cache sem importar
 * o montador de perfil — que por sua vez importa esses mesmos controllers.
 */

export interface EntradaCachePerfil<P> {
    perfil: P;
    /** Assinatura dos dados baratos lidos a cada mensagem — mudou, recalcula. */
    impressao: string;
    expiraEm: number;
}

export const TTL_PERFIL_MS = 10 * 60 * 1000;

const cache = new Map<string, EntradaCachePerfil<unknown>>();

export function lerPerfilEmCache<P>(idUser: string, impressao: string): P | null {
    const entrada = cache.get(idUser);
    if (!entrada || entrada.impressao !== impressao || entrada.expiraEm <= Date.now()) return null;
    return entrada.perfil as P;
}

export function guardarPerfilEmCache<P>(idUser: string, impressao: string, perfil: P): void {
    cache.set(idUser, { perfil, impressao, expiraEm: Date.now() + TTL_PERFIL_MS });
}

/**
 * Descarta o perfil em cache do aluno. Chamado onde o backend grava algo que muda
 * o perfil (upload/remoção de histórico, preferências de grade, restrições salvas
 * pelo chat). Gravações feitas direto do cliente no Supabase não passam por aqui —
 * para elas a `impressao` já invalida sozinha.
 */
export function invalidarPerfilAluno(idUser: string | number | string[] | undefined | null): void {
    if (idUser == null) return;
    cache.delete(String(Array.isArray(idUser) ? idUser[0] : idUser));
}

/** Só para testes. */
export function limparCachePerfis(): void {
    cache.clear();
}
