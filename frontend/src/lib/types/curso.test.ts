import { describe, expect, it } from 'vitest';
import { createCursoModelFromJson } from '$lib/factories';
import { determineSubjectStatus, SubjectStatusEnum } from './materia';
import { getDirectPrerequisites, satisfazPreRequisitos } from './curso';

/** C0001 exige A0001 OU B0001 (formato recursivo, sem expressao_original). */
function cursoComOu(expressaoLogica: unknown, codigoMateriaRequisito?: string) {
	return createCursoModelFromJson({
		nome_curso: 'X',
		id_curso: 1,
		materias_por_curso: [
			{ id_materia: 1, nivel: 1, tipo_natureza: 0, materias: { id_materia: 1, codigo_materia: 'A0001', nome_materia: 'A' } },
			{ id_materia: 2, nivel: 1, tipo_natureza: 0, materias: { id_materia: 2, codigo_materia: 'B0001', nome_materia: 'B' } },
			{ id_materia: 3, nivel: 2, tipo_natureza: 0, materias: { id_materia: 3, codigo_materia: 'C0001', nome_materia: 'C' } }
		],
		pre_requisitos: [
			{
				id_pre_requisito: 9,
				id_materia: 3,
				expressao_logica: expressaoLogica,
				codigo_materia_requisito: codigoMateriaRequisito
			}
		]
	});
}

const codigos = (ms: { codigoMateria: string }[]) => ms.map((m) => m.codigoMateria).sort();

describe('getDirectPrerequisites — pré-requisito com OU (pré-mortem R43)', () => {
	it('inclui todas as alternativas do OU, não só o primeiro código', () => {
		const curso = cursoComOu({ operador: 'OU', condicoes: ['A0001', 'B0001'] });
		expect(codigos(getDirectPrerequisites(curso, 'C0001'))).toEqual(['A0001', 'B0001']);
	});

	it('aceita expressão em texto e casing diferente sem duplicar', () => {
		const curso = cursoComOu('a0001 OU b0001 OU A0001');
		expect(codigos(getDirectPrerequisites(curso, 'C0001'))).toEqual(['A0001', 'B0001']);
	});

	it('status continua AVAILABLE quando só a alternativa B foi cursada (regressão)', () => {
		const curso = cursoComOu({ operador: 'OU', condicoes: ['A0001', 'B0001'] });
		const c = curso.materias.find((m) => m.codigoMateria === 'C0001')!;
		const rows = curso.preRequisitos.filter((p) => p.idMateria === 3);
		expect(satisfazPreRequisitos(rows, new Set(['B0001']))).toBe(true);
		expect(determineSubjectStatus(c, new Set(['B0001']), new Set(), new Set(), curso)).toBe(
			SubjectStatusEnum.AVAILABLE
		);
	});

	it('expressão longa (> 64 chars, sem códigos extraídos) mantém codigoMateriaRequisito', () => {
		const longa = '(A0001 E B0001) OU (CCC0001 E DDD0001) OU (EEE0001 E FFF0001) OU GGG0001';
		expect(longa.length).toBeGreaterThan(64);
		const curso = cursoComOu(longa, 'A0001');
		expect(codigos(getDirectPrerequisites(curso, 'C0001'))).toEqual(['A0001']);
	});

	it('objeto sem materias/condicoes mantém codigoMateriaRequisito', () => {
		const curso = cursoComOu({ operador: 'E' }, 'b0001');
		expect(codigos(getDirectPrerequisites(curso, 'C0001'))).toEqual(['B0001']);
	});

	it('une expressão e codigoMateriaRequisito sem duplicar', () => {
		const curso = cursoComOu({ operador: 'OU', condicoes: ['A0001', 'B0001'] }, 'A0001');
		expect(codigos(getDirectPrerequisites(curso, 'C0001'))).toEqual(['A0001', 'B0001']);
	});
});
