/**
 * Heurística para identificar disciplinas de "estágio obrigatório" na grade de um curso.
 *
 * `materias_por_curso.tipo_natureza` só distingue obrigatória (0) / optativa (1) — não há
 * sinalização própria de estágio. Na ausência dessa coluna (sem migração de banco),
 * detectamos por nome: disciplinas obrigatórias cujo nome contém "ESTAGIO" (ex.:
 * "ESTÁGIO SUPERVISIONADO", "ESTÁGIO SUPERVISIONADO 1", "ESTAGIO SUPERVISIONADO EM ..."),
 * conforme documentado em docs/dupla-diplomacao-plano.md e docs/unb-domain.md.
 *
 * Limitação conhecida: cursos cuja disciplina de estágio obrigatório não tenha "estágio"
 * no nome não serão detectados (E ficará 0, o que penaliza a fórmula ao não excluir essa
 * CH do denominador).
 */

import { isOptativa, type MateriaModel } from '$lib/types/materia';

function normalizeNome(nome: string | null | undefined): string {
	return (nome ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toUpperCase()
		.trim();
}

/** True quando a matéria é obrigatória e o nome indica estágio supervisionado. */
export function isDisciplinaEstagioObrigatorio(materia: MateriaModel): boolean {
	if (isOptativa(materia)) return false;
	return normalizeNome(materia.nomeMateria).includes('ESTAGIO');
}

/**
 * Soma a CH (em horas) das disciplinas obrigatórias de estágio na grade informada.
 * Deduplica por código de matéria (mesma disciplina não deve ser somada duas vezes
 * quando a grade tiver linhas repetidas/conflitantes).
 */
export function getChEstagioObrigatorio(materias: MateriaModel[]): number {
	const porCodigo = new Map<string, MateriaModel>();
	for (const materia of materias) {
		if (!isDisciplinaEstagioObrigatorio(materia)) continue;
		const codigo = String(materia.codigoMateria ?? '').trim().toUpperCase();
		if (!codigo) continue;
		if (!porCodigo.has(codigo)) porCodigo.set(codigo, materia);
	}
	let total = 0;
	for (const materia of porCodigo.values()) {
		total += (Number(materia.creditos) || 0) * 15;
	}
	return Math.round(total * 10) / 10;
}

/** Códigos (normalizados, maiúsculos) das disciplinas obrigatórias de estágio na grade. */
export function getCodigosEstagioObrigatorio(materias: MateriaModel[]): Set<string> {
	const codigos = new Set<string>();
	for (const materia of materias) {
		if (!isDisciplinaEstagioObrigatorio(materia)) continue;
		const codigo = String(materia.codigoMateria ?? '').trim().toUpperCase();
		if (codigo) codigos.add(codigo);
	}
	return codigos;
}
