/**
 * Pontos de desfazer das alterações que a Darcy faz na grade.
 *
 * Antes de aplicar QUALQUER mudança vinda do chat, a tela guarda aqui o estado
 * anterior (só no navegador, em `localStorage`) — a Darcy sabe quais pontos
 * existem (o estado do Montador carrega id + rótulo) e pode propor reverter.
 *
 * Fica no navegador de propósito: não gasta banco, e a chave começa com o prefixo
 * das grades, então o logout a apaga junto (`limparCacheGrade`). Pilha curta: os
 * mais antigos caem.
 */

export const MAX_PONTOS_DESFAZER = 5;
const PREFIXO = 'nofluxo:grade:';

/** Tudo que o aluno perderia se a Darcy errasse: abas, ativa, lista e preferências. */
export interface SnapshotGrade {
	grades: Array<{
		id: string;
		nome: string;
		selecao: Record<string, number>;
		origem: 'opcao-solver' | 'usuario' | 'darcy';
	}>;
	activeId: string;
	pool: string[];
	prioritarias: string[];
	turnos: Array<'M' | 'T' | 'N'>;
	removidas: string[];
	incluirCursando: boolean;
}

export interface PontoDesfazer {
	id: string;
	/** Texto curto que o aluno e a Darcy leem: "Darcy · Sem sexta". */
	rotulo: string;
	/** ISO — só para exibir "há 3 min". */
	quando: string;
	snapshot: SnapshotGrade;
}

export function chaveDesfazer(idUser: number | null, periodo: string | null): string | null {
	return idUser != null && periodo ? `${PREFIXO}${idUser}:${periodo}:desfazer` : null;
}

function novoId(): string {
	return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Do mais recente ao mais antigo. */
export function listarPontos(idUser: number | null, periodo: string | null): PontoDesfazer[] {
	const key = chaveDesfazer(idUser, periodo);
	if (!key || typeof localStorage === 'undefined') return [];
	try {
		const arr = JSON.parse(localStorage.getItem(key) ?? '[]');
		return Array.isArray(arr)
			? arr.filter(
					(p): p is PontoDesfazer =>
						!!p && typeof p.id === 'string' && !!p.snapshot && Array.isArray(p.snapshot.grades)
				)
			: [];
	} catch {
		return [];
	}
}

function gravar(key: string, pontos: PontoDesfazer[]): void {
	try {
		localStorage.setItem(key, JSON.stringify(pontos));
	} catch {
		/* storage cheio/bloqueado: sem desfazer nesta sessão, a mudança segue valendo */
	}
}

/** Guarda o estado de ANTES de uma mudança. Devolve o ponto criado (ou null sem storage). */
export function registrarPonto(
	idUser: number | null,
	periodo: string | null,
	rotulo: string,
	snapshot: SnapshotGrade
): PontoDesfazer | null {
	const key = chaveDesfazer(idUser, periodo);
	if (!key || typeof localStorage === 'undefined') return null;
	const ponto: PontoDesfazer = {
		id: novoId(),
		rotulo: rotulo.trim().slice(0, 80) || 'Alteração da Darcy',
		quando: new Date().toISOString(),
		snapshot
	};
	gravar(key, [ponto, ...listarPontos(idUser, periodo)].slice(0, MAX_PONTOS_DESFAZER));
	return ponto;
}

/**
 * Devolve o ponto e descarta ele e os mais NOVOS que ele: depois de voltar, o que
 * veio depois não existe mais. Os mais antigos continuam disponíveis.
 */
export function consumirPonto(
	idUser: number | null,
	periodo: string | null,
	id: string
): PontoDesfazer | null {
	const key = chaveDesfazer(idUser, periodo);
	if (!key) return null;
	const pontos = listarPontos(idUser, periodo);
	const i = pontos.findIndex((p) => p.id === id);
	if (i < 0) return null;
	gravar(key, pontos.slice(i + 1));
	return pontos[i];
}

/** Para o estado enviado ao chat: sem o snapshot (a Darcy só precisa saber que existe). */
export function resumoPontos(
	idUser: number | null,
	periodo: string | null
): Array<{ id: string; rotulo: string; quando: string }> {
	return listarPontos(idUser, periodo).map(({ id, rotulo, quando }) => ({ id, rotulo, quando }));
}
