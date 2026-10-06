import { describe, expect, it } from 'vitest';
import { SubjectStatusEnum, type SubjectStatusValue } from '$lib/types/materia';
import { subjectCardAriaLabel } from './subject-card-colors';

const statuses = Object.values(SubjectStatusEnum) as SubjectStatusValue[];

describe('status não só por cor (pré-mortem R28)', () => {
	it('nome acessível traz status e situação dos pré-requisitos', () => {
		expect(
			subjectCardAriaLabel({
				codigo: 'CIC0004',
				nome: 'Algoritmos e Programação de Computadores',
				creditos: 6,
				status: SubjectStatusEnum.AVAILABLE,
				prereqsCompleted: true
			})
		).toBe('CIC0004 Algoritmos e Programação de Computadores, 6 créditos, Disponível, pré-requisitos cumpridos');
		expect(
			subjectCardAriaLabel({
				codigo: 'CIC0090',
				nome: 'Estruturas de Dados',
				creditos: 4,
				status: SubjectStatusEnum.LOCKED,
				prereqsCompleted: false,
				etiquetas: ['optativa']
			})
		).toBe('CIC0090 Estruturas de Dados, 4 créditos, Bloqueado, pré-requisitos pendentes, optativa');
	});

	it('sem badge de pré-requisito o nome não inventa a situação', () => {
		expect(
			subjectCardAriaLabel({ codigo: 'X', nome: 'Y', creditos: 2, status: SubjectStatusEnum.COMPLETED })
		).toBe('X Y, 2 créditos, Aprovado');
	});

	it('cada status tem rótulo próprio — bloqueado e não iniciado dividem o fundo e diferem pelo texto', () => {
		const rotulos = statuses.map((status) =>
			subjectCardAriaLabel({ codigo: 'X', nome: 'Y', creditos: 2, status })
		);
		expect(new Set(rotulos).size).toBe(statuses.length);
	});
});
