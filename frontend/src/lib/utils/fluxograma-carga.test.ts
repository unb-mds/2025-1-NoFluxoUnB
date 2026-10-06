import { describe, it, expect } from 'vitest';
import { escolherCargaFluxograma } from '$lib/utils/fluxograma-carga';

/**
 * Pré-mortem R61: o "Tentar novamente" de /meu-fluxograma/[courseName] sempre
 * recarregava pelo nome (matriz padrão), ignorando ?matriz= e a matriz do aluno.
 * Agora onMount e retry usam a mesma escolha.
 */
const aluno = {
	dadosFluxograma: { nomeCurso: 'Engenharia de Software', matrizCurricular: '6360/1 - 2017.1' }
};

describe('escolherCargaFluxograma', () => {
	it('aluno do mesmo curso usa a matriz do aluno', () => {
		expect(escolherCargaFluxograma(aluno, 'ENGENHARIA DE SOFTWARE', null)).toEqual({
			tipo: 'curriculo',
			valor: '6360/1 - 2017.1',
			anonymous: false
		});
	});

	it('?matriz= é respeitado quando não é o curso do aluno', () => {
		expect(escolherCargaFluxograma(aluno, 'Matemática', '123/1')).toEqual({
			tipo: 'curriculo',
			valor: '123/1',
			anonymous: false
		});
		expect(escolherCargaFluxograma(null, 'Matemática', '123/1')).toEqual({
			tipo: 'curriculo',
			valor: '123/1',
			anonymous: true
		});
	});

	it('sem contexto carrega pelo nome (matriz padrão)', () => {
		expect(escolherCargaFluxograma(null, 'Matemática', null)).toEqual({
			tipo: 'nome',
			valor: 'Matemática',
			anonymous: true
		});
	});

	it('sem curso na URL não carrega nada (a página mostra "Curso não encontrado")', () => {
		expect(escolherCargaFluxograma(aluno, '', '123/1')).toBeNull();
	});
});
