/**
 * Regressão (pré-mortem 27/09/2026, R3): pré-requisito de UM código só é o caso
 * mais comum da UnB, e o ETL grava ele no JSONB como string pura ("FGA0158").
 * Antes, evaluateExpressaoLogica caía no ramo legado (`.materias`) e devolvia
 * false: a disciplina liberada aparecia "Bloqueado" no fluxograma e a
 * equivalência simples não marcava nada. O fix já está no código; estes testes
 * impedem que ele volte.
 */
import { describe, it, expect } from 'vitest';
import { evaluateExpressaoLogica } from './expressao-logica';
import { determineSubjectStatus, SubjectStatusEnum, type MateriaModel } from '$lib/types/materia';
import type { CursoModel, PreRequisitoModel } from '$lib/types/curso';

describe('evaluateExpressaoLogica com string de código único', () => {
	it('código concluído satisfaz', () => {
		expect(evaluateExpressaoLogica('FGA0158', new Set(['FGA0158']))).toBe(true);
	});

	it('ignora caixa e espaços', () => {
		expect(evaluateExpressaoLogica(' fga0158 ', new Set(['FGA0158']))).toBe(true);
		expect(evaluateExpressaoLogica('FGA0158', new Set(['fga0158']))).toBe(true);
	});

	it('código não concluído não satisfaz', () => {
		expect(evaluateExpressaoLogica('FGA0158', new Set(['FGA0161']))).toBe(false);
	});

	it('string vazia não satisfaz', () => {
		expect(evaluateExpressaoLogica('   ', new Set(['FGA0158']))).toBe(false);
	});

	it('string textual com operador continua sendo avaliada', () => {
		expect(evaluateExpressaoLogica('FGA0158 OU FGA0161', new Set(['FGA0161']))).toBe(true);
		expect(evaluateExpressaoLogica('FGA0158 E FGA0161', new Set(['FGA0161']))).toBe(false);
	});
});

describe('determineSubjectStatus com pré-requisito de código único (ponta a ponta)', () => {
	const materia: MateriaModel = {
		ementa: '',
		idMateria: 2,
		nomeMateria: 'Orientação a Objetos',
		codigoMateria: 'FGA0158',
		nivel: 2,
		creditos: 4
	};

	function curso(expressaoLogica: PreRequisitoModel['expressaoLogica']): CursoModel {
		const pr: PreRequisitoModel = {
			idPreRequisito: 10,
			idMateria: 2,
			idMateriaRequisito: 1,
			codigoMateriaRequisito: 'FGA0161',
			nomeMateriaRequisito: 'Algoritmos e Programação de Computadores',
			expressaoOriginal: 'FGA0161',
			expressaoLogica
		};
		return { preRequisitos: [pr] } as unknown as CursoModel;
	}

	it('aluno que fez o pré-requisito vê a disciplina Disponível, não Bloqueada', () => {
		const st = determineSubjectStatus(materia, new Set(['FGA0161']), new Set(), new Set(), curso('FGA0161'));
		expect(st).toBe(SubjectStatusEnum.AVAILABLE);
	});

	it('aluno que não fez o pré-requisito continua Bloqueado', () => {
		const st = determineSubjectStatus(materia, new Set(), new Set(), new Set(), curso('FGA0161'));
		expect(st).toBe(SubjectStatusEnum.LOCKED);
	});
});
