import { beforeAll, describe, expect, it } from 'vitest';
import { extrairDadosAcademicos } from './pdfDataExtractor';

/**
 * Textos SINTÉTICOS no formato que o pdfExtractor produz a partir do histórico do
 * SIGAA (linhas reconstruídas por Y, colunas separadas por espaços). Nenhum dado
 * real de aluno: os nomes de disciplina vêm do catálogo público de turmas.
 */

beforeAll(() => {
	console.log = () => {};
});

const regulares = (texto: string) =>
	extrairDadosAcademicos(texto).disciplinas.filter((d) => d.tipo_dado === 'Disciplina Regular');

describe('fallback regex: nome de disciplina que começa com palavra de metadata (R4)', () => {
	it('nome na linha de cima em CAIXA ALTA não é tratado como rótulo', () => {
		const texto = [
			'Trabalho de Conclusão de Curso:          -',
			'TRABALHO DE CONCLUSÃO DE CURSO 2',
			'2025.1      FGA0011          90    01    100,0    MS    APR',
			'CURRÍCULO E AVALIAÇÃO EM MATEMÁTICA',
			'2025.1      MAT0164          60    01    100,0    MS    APR'
		].join('\n');
		const nomes = regulares(texto).map((d) => `${d.codigo}:${d.nome}`);
		expect(nomes).toEqual([
			'FGA0011:TRABALHO DE CONCLUSÃO DE CURSO 2',
			'MAT0164:CURRÍCULO E AVALIAÇÃO EM MATEMÁTICA'
		]);
	});

	it('rótulo em Title Case continua sendo ignorado como nome', () => {
		const texto = ['Currículo:          6360/1 - 2017.1', '2025.1      FGA0011          90    01    100,0    MS    APR'].join(
			'\n'
		);
		expect(regulares(texto)[0].nome).toBe('');
	});
});
