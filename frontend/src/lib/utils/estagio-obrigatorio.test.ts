import { describe, expect, it } from 'vitest';
import {
	getChEstagioObrigatorio,
	getCodigosEstagioObrigatorio,
	isDisciplinaEstagioObrigatorio
} from './estagio-obrigatorio';
import type { MateriaModel } from '$lib/types/materia';

function materia(overrides: Partial<MateriaModel>): MateriaModel {
	return {
		ementa: '',
		idMateria: 0,
		nomeMateria: '',
		codigoMateria: '',
		nivel: 1,
		creditos: 0,
		...overrides
	};
}

describe('isDisciplinaEstagioObrigatorio', () => {
	it('reconhece "ESTÁGIO SUPERVISIONADO" obrigatório', () => {
		const m = materia({ nomeMateria: 'ESTÁGIO SUPERVISIONADO', tipoNatureza: 0 });
		expect(isDisciplinaEstagioObrigatorio(m)).toBe(true);
	});

	it('reconhece variações numeradas ("ESTAGIO SUPERVISIONADO 1", "...2")', () => {
		expect(
			isDisciplinaEstagioObrigatorio(materia({ nomeMateria: 'ESTAGIO SUPERVISIONADO 1', tipoNatureza: 0 }))
		).toBe(true);
		expect(
			isDisciplinaEstagioObrigatorio(materia({ nomeMateria: 'ESTÁGIO SUPERVISIONADO 2', tipoNatureza: 0 }))
		).toBe(true);
	});

	it('ignora acentuação e caixa', () => {
		expect(
			isDisciplinaEstagioObrigatorio(materia({ nomeMateria: 'estagio supervisionado em engenharia', tipoNatureza: 0 }))
		).toBe(true);
	});

	it('não conta estágio quando é optativa', () => {
		const m = materia({ nomeMateria: 'ESTÁGIO SUPERVISIONADO', tipoNatureza: 1 });
		expect(isDisciplinaEstagioObrigatorio(m)).toBe(false);
	});

	it('não marca disciplinas obrigatórias sem "estágio" no nome', () => {
		const m = materia({ nomeMateria: 'CÁLCULO 1', tipoNatureza: 0 });
		expect(isDisciplinaEstagioObrigatorio(m)).toBe(false);
	});
});

describe('getChEstagioObrigatorio', () => {
	it('soma CH (creditos * 15) das disciplinas de estágio obrigatórias', () => {
		const materias = [
			materia({ codigoMateria: 'EST0001', nomeMateria: 'ESTÁGIO SUPERVISIONADO 1', tipoNatureza: 0, creditos: 4 }),
			materia({ codigoMateria: 'EST0002', nomeMateria: 'ESTÁGIO SUPERVISIONADO 2', tipoNatureza: 0, creditos: 4 }),
			materia({ codigoMateria: 'MAT0001', nomeMateria: 'CÁLCULO 1', tipoNatureza: 0, creditos: 4 })
		];
		expect(getChEstagioObrigatorio(materias)).toBe(120);
	});

	it('deduplica por código quando a grade tem linhas repetidas', () => {
		const materias = [
			materia({ codigoMateria: 'EST0001', nomeMateria: 'ESTÁGIO SUPERVISIONADO', tipoNatureza: 0, creditos: 4 }),
			materia({ codigoMateria: 'EST0001', nomeMateria: 'ESTÁGIO SUPERVISIONADO', tipoNatureza: 0, creditos: 4 })
		];
		expect(getChEstagioObrigatorio(materias)).toBe(60);
	});

	it('retorna 0 quando não há estágio na grade', () => {
		const materias = [materia({ codigoMateria: 'MAT0001', nomeMateria: 'CÁLCULO 1', tipoNatureza: 0, creditos: 4 })];
		expect(getChEstagioObrigatorio(materias)).toBe(0);
	});
});

describe('getCodigosEstagioObrigatorio', () => {
	it('retorna os códigos normalizados das disciplinas de estágio', () => {
		const materias = [
			materia({ codigoMateria: 'est0001', nomeMateria: 'Estágio Supervisionado 1', tipoNatureza: 0, creditos: 4 }),
			materia({ codigoMateria: 'MAT0001', nomeMateria: 'CÁLCULO 1', tipoNatureza: 0, creditos: 4 })
		];
		expect(getCodigosEstagioObrigatorio(materias)).toEqual(new Set(['EST0001']));
	});
});
