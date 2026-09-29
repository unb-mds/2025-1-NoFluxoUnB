/**
 * Course type definitions
 */

import type { MateriaModel } from './materia';
import type { EquivalenciaModel } from './equivalencia';

import type {
	ExpressaoLogicaJson,
	ExpressaoLogicaRecursiva
} from '$lib/utils/expressao-logica';
import {
	evaluateExpressaoLogica,
	evaluateExpression,
	getCodigosFromExpressaoLogica
} from '$lib/utils/expressao-logica';
import { setHasCodeIgnoreCase } from '$lib/utils/subject-codes';

export interface PreRequisitoModel {
	idPreRequisito: number;
	idMateria: number;
	idMateriaRequisito: number | null;
	codigoMateriaRequisito: string;
	nomeMateriaRequisito: string;
	/** Exibição e conferência humana. */
	expressaoOriginal?: string | null;
	/** Árvore de decisão: { materias, operador } ou recursivo { operador, condicoes }. */
	expressaoLogica?: ExpressaoLogicaJson | ExpressaoLogicaRecursiva | null;
}

export interface CoRequisitoModel {
	idCoRequisito: number;
	idMateria: number;
	idMateriaCoRequisito: number | null;
	codigoMateriaCoRequisito: string;
	nomeMateriaCoRequisito: string;
	expressaoOriginal?: string | null;
	expressaoLogica?: ExpressaoLogicaJson | ExpressaoLogicaRecursiva | null;
}

export type CourseType = 'graduacao' | 'pos-graduacao' | 'tecnico' | 'outro';
export type CourseClassification = 'obrigatoria' | 'optativa' | 'modulo_livre' | 'outro';

export interface CursoModel {
	nomeCurso: string;
	matrizCurricular: string;
	idCurso: number;
	totalCreditos: number | null;
	classificacao: CourseClassification | string;
	tipoCurso: CourseType | string;
	materias: MateriaModel[];
	semestres: number;
	equivalencias: EquivalenciaModel[];
	preRequisitos: PreRequisitoModel[];
	coRequisitos: CoRequisitoModel[];
	/** Identificador único da matriz (ex: "8117/-2 - 2018.2"). Preenchido quando o fluxograma é carregado por matriz. */
	curriculoCompleto?: string | null;
	/** DIURNO ou NOTURNO */
	turno?: string | null;
}

export interface MinimalCursoModel {
	nomeCurso: string;
	matrizCurricular: string;
	idCurso: number;
	creditos: number | null;
	tipoCurso: CourseType | string;
	classificacao: CourseClassification | string;
	/** DIURNO ou NOTURNO */
	turno?: string | null;
	status?: string | null;
}

export function getCourseSubjectCodes(curso: CursoModel): Set<string> {
	return new Set(curso.materias.map((m) => m.codigoMateria));
}

/**
 * Agrupa todas as matérias do curso por semestre (nivel).
 * Inclui obrigatórias e optativas; tipo_natureza (0=obrigatória, 1=optativa) define a natureza.
 * Agrupa por nivel (semestre sugerido na matriz). Optativas nivel 0 não viram coluna no fluxograma — entram ao serem planejadas.
 */
export function getSubjectsBySemester(curso: CursoModel): Map<number, MateriaModel[]> {
	const semesterMap = new Map<number, MateriaModel[]>();

	for (const materia of curso.materias) {
		if (!semesterMap.has(materia.nivel)) {
			semesterMap.set(materia.nivel, []);
		}
		semesterMap.get(materia.nivel)!.push(materia);
	}

	return semesterMap;
}

/**
 * Verifica se todos os pré-requisitos da matéria estão cumpridos (usa expressao_logica quando existir).
 * Deduplica por idPreRequisito pois o backend pode retornar múltiplos registros expandidos.
 */
export function satisfazPreRequisitos(
	preRequisitosParaMateria: PreRequisitoModel[],
	completedCodes: Set<string>
): boolean {
	const vistos = new Set<number>();
	for (const pr of preRequisitosParaMateria) {
		if (pr.expressaoLogica != null) {
			if (vistos.has(pr.idPreRequisito)) continue;
			vistos.add(pr.idPreRequisito);
			if (!evaluateExpressaoLogica(pr.expressaoLogica, completedCodes)) return false;
		} else {
			const req = pr.codigoMateriaRequisito || '';
			if (req.trim()) {
				if (!setHasCodeIgnoreCase(completedCodes, req)) return false;
			} else if (pr.expressaoOriginal?.trim()) {
				if (!evaluateExpression(pr.expressaoOriginal.trim(), completedCodes)) return false;
			} else {
				return false;
			}
		}
	}
	return true;
}

/**
 * Matérias que aparecem na regra de pré-requisito da matéria (1 nível).
 * Varre TODOS os códigos da expressao_logica — `codigoMateriaRequisito` guarda só o
 * primeiro, então em "A OU B" a alternativa B sumia (setas do Planejador e ficha).
 * Mesma extração da factory (getCodigosFromExpressaoLogica), sem semântica E/OU:
 * quem precisa avaliar a regra usa satisfazPreRequisitos.
 */
export function getDirectPrerequisites(
	curso: CursoModel,
	codigoMateria: string
): MateriaModel[] {
	const norm = (c: string) => c.trim().toUpperCase();
	const materiaMap = new Map(curso.materias.map((m) => [norm(m.codigoMateria), m]));
	const directPrereqs: MateriaModel[] = [];

	const materia = curso.materias.find((m) => m.codigoMateria === codigoMateria);
	if (!materia) return [];

	for (const preReq of curso.preRequisitos) {
		if (preReq.idMateria !== materia.idMateria) continue;
		const codigos =
			preReq.expressaoLogica != null
				? getCodigosFromExpressaoLogica(preReq.expressaoLogica)
				: [preReq.codigoMateriaRequisito ?? ''];
		for (const codigo of codigos) {
			const prerequisiteMateria = materiaMap.get(norm(codigo));
			if (prerequisiteMateria && !directPrereqs.includes(prerequisiteMateria)) {
				directPrereqs.push(prerequisiteMateria);
			}
		}
	}

	return directPrereqs;
}

export function getCorequisites(curso: CursoModel, codigoMateria: string): MateriaModel[] {
	const materiaMap = new Map(curso.materias.map((m) => [m.codigoMateria, m]));
	const coreqs: MateriaModel[] = [];

	const materia = curso.materias.find((m) => m.codigoMateria === codigoMateria);
	if (!materia) return [];

	for (const coReq of curso.coRequisitos) {
		if (coReq.idMateria === materia.idMateria) {
			const coreqMateria = materiaMap.get(coReq.codigoMateriaCoRequisito);
			if (coreqMateria) {
				coreqs.push(coreqMateria);
			}
		}
	}

	return coreqs;
}

export function filterPrerequisitesInCourse(
	preRequisitos: PreRequisitoModel[],
	courseSubjectCodes: Set<string>
): PreRequisitoModel[] {
	return preRequisitos.filter((pr) => courseSubjectCodes.has(pr.codigoMateriaRequisito));
}

export function calculateMaxSemester(materias: MateriaModel[]): number {
	return materias.reduce((max, m) => Math.max(max, m.nivel), 0);
}
