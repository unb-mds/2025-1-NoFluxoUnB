/**
 * Subject/Course unit type definitions
 */

import type { CursoModel } from './curso';
import { satisfazPreRequisitos } from './curso';
import { setHasCodeIgnoreCase } from '$lib/utils/subject-codes';

export interface MateriaModel {
	ementa: string;
	idMateria: number;
	nomeMateria: string;
	codigoMateria: string;
	nivel: number;
	/** materias_por_curso.tipo_natureza: 0=obrigatória, 1=optativa. Prioridade sobre nivel para classificação. */
	tipoNatureza?: number | null;
	creditos: number;
	status?: string | null;
	mencao?: string | null;
	professor?: string | null;
	preRequisitos?: MateriaModel[];
}

export const SubjectStatusEnum = {
	NOT_STARTED: 'not_started',
	IN_PROGRESS: 'in_progress',
	COMPLETED: 'completed',
	FAILED: 'failed',
	AVAILABLE: 'available',
	LOCKED: 'locked'
} as const;

export type SubjectStatusValue = (typeof SubjectStatusEnum)[keyof typeof SubjectStatusEnum];

/**
 * Optativa na grade: tipo_natureza=1 em materias_por_curso.
 * tipo_natureza=0 é obrigatória (mesmo com nivel 0 em dados legados).
 * Se tipo_natureza não veio da API, cai no fallback nivel===0 (igual grade Supabase).
 */
export function isOptativa(materia: MateriaModel): boolean {
	if (materia.tipoNatureza === 1) return true;
	if (materia.tipoNatureza === 0) return false;
	return materia.nivel === 0;
}

/**
 * Natureza de uma matéria em relação à matriz do aluno — mesma regra que o
 * fluxograma usa para etiquetar os cards.
 *
 * "Módulo livre" é definido por **ausência**: componente que não existe na matriz
 * do curso (monitoria, eletiva de outro curso). É por isso que a função recebe a
 * matéria já resolvida (ou `null`/`undefined` quando não foi encontrada na matriz)
 * em vez do código — quem busca é o chamador, que já tem o índice em mãos.
 */
export function classificarNatureza(
	materiaDaMatriz: MateriaModel | null | undefined
): 'obrigatoria' | 'optativa' | 'modulo_livre' {
	if (!materiaDaMatriz) return 'modulo_livre';
	return isOptativa(materiaDaMatriz) ? 'optativa' : 'obrigatoria';
}

export function getPrerequisiteCodes(materia: MateriaModel): string[] {
	return materia.preRequisitos?.map((m) => m.codigoMateria) ?? [];
}

export function getPrerequisiteNames(materia: MateriaModel): string[] {
	return materia.preRequisitos?.map((m) => m.nomeMateria) ?? [];
}

export function hasPrerequisites(materia: MateriaModel): boolean {
	return (materia.preRequisitos?.length ?? 0) > 0;
}

export function hasAnyPrerequisitesNotCompletedOrCurrent(
	materia: MateriaModel,
	completedCodes: Set<string>,
	currentCodes: Set<string>
): boolean {
	if (!hasPrerequisites(materia)) {
		return false;
	}

	const allCompletedOrCurrent = new Set([...completedCodes, ...currentCodes]);

	for (const prereq of materia.preRequisitos!) {
		if (!allCompletedOrCurrent.has(prereq.codigoMateria)) {
			return true;
		}
	}

	return false;
}

export function hasPrerequisite(materia: MateriaModel, codigoMateria: string): boolean {
	return materia.preRequisitos?.some((m) => m.codigoMateria === codigoMateria) ?? false;
}

export function getTotalPrerequisiteCredits(materia: MateriaModel): number {
	return materia.preRequisitos?.reduce((sum, m) => sum + m.creditos, 0) ?? 0;
}

export function canBeTaken(materia: MateriaModel, completedMateriasCodes: Set<string>): boolean {
	if (!hasPrerequisites(materia)) return true;

	return materia.preRequisitos!.every((prereq) =>
		setHasCodeIgnoreCase(completedMateriasCodes, prereq.codigoMateria)
	);
}

export function determineSubjectStatus(
	materia: MateriaModel,
	completedCodes: Set<string>,
	currentCodes: Set<string>,
	failedCodes: Set<string>,
	curso?: CursoModel | null
): SubjectStatusValue {
	const code = materia.codigoMateria;

	// Concluída tem prioridade: no histórico ou por equivalência (com ou sem diferença de casing)
	if (setHasCodeIgnoreCase(completedCodes, code)) {
		return SubjectStatusEnum.COMPLETED;
	}

	if (currentCodes.has(code)) {
		return SubjectStatusEnum.IN_PROGRESS;
	}

	if (failedCodes.has(code)) {
		return SubjectStatusEnum.FAILED;
	}

	// Pré-requisitos: usa expressao_logica (curso) quando existir, senão materia.preRequisitos
	const prereqsParaMateria = curso?.preRequisitos?.filter((pr) => pr.idMateria === materia.idMateria) ?? [];
	const podeCursar =
		prereqsParaMateria.length > 0
			? satisfazPreRequisitos(prereqsParaMateria, completedCodes)
			: canBeTaken(materia, completedCodes);

	if (podeCursar) {
		return SubjectStatusEnum.AVAILABLE;
	}

	return SubjectStatusEnum.LOCKED;
}

/**
 * Pode registrar optativa como concluída: alinhado a {@link determineSubjectStatus} (pré-requisitos,
 * matrícula atual e reprovação), exceto quando já está concluída ou bloqueada.
 */
export function prerequisitosAprovadosParaRegistrarConcluida(
	materia: MateriaModel,
	completedCodes: Set<string>,
	curso?: CursoModel | null,
	currentCodes: Set<string> = new Set(),
	failedCodes: Set<string> = new Set()
): boolean {
	const st = determineSubjectStatus(materia, completedCodes, currentCodes, failedCodes, curso);
	return st !== SubjectStatusEnum.LOCKED && st !== SubjectStatusEnum.COMPLETED;
}

export function getStatusLabel(status: SubjectStatusValue): string {
	const labelMap: Record<SubjectStatusValue, string> = {
		[SubjectStatusEnum.COMPLETED]: 'Aprovado',
		[SubjectStatusEnum.IN_PROGRESS]: 'Matriculado',
		[SubjectStatusEnum.FAILED]: 'Reprovado',
		[SubjectStatusEnum.AVAILABLE]: 'Disponível',
		[SubjectStatusEnum.LOCKED]: 'Bloqueado',
		[SubjectStatusEnum.NOT_STARTED]: 'Não iniciado'
	};
	return labelMap[status];
}

export interface OptativaAdicionada {
	materia: MateriaModel;
	semestre: number;
}
