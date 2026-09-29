import { beforeAll, describe, expect, it } from 'vitest';
import {
	calcularNumeroSemestre,
	extrairCargaHorariaIntegralizada,
	extrairDadosAcademicos,
	extrairDisciplinasPendentes,
	extrairMatrizCurricular
} from './pdfDataExtractor';

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

describe('extrairDisciplinasPendentes (R40)', () => {
	const resumo = (texto: string) =>
		extrairDisciplinasPendentes(texto).map((d) => `${d.codigo}:${d.status}:${d.carga_horaria}:${d.nome}`);

	it('layout padrão', () => {
		const texto = [
			'Componentes Curriculares Obrigatórios Pendentes:2',
			'Código          Componente Curricular          CH',
			'MAT0026    CÁLCULO 2          90 h',
			'FGA0142    FUNDAMENTOS DE ARQUITETURA DE COMPUTADORES          Matriculado       60 h',
			'Observações:'
		].join('\n');
		expect(resumo(texto)).toEqual([
			'MAT0026:PENDENTE:90:CÁLCULO 2',
			'FGA0142:MATR:60:FUNDAMENTOS DE ARQUITETURA DE COMPUTADORES'
		]);
	});

	it('cabeçalho e "Matriculado em Equivalente" com as palavras coladas', () => {
		const texto = [
			'ComponentesCurriculares ObrigatóriosPendentes:2',
			'Código          ComponenteCurricular          CH',
			'FGA0172    REQUISITOS DESOFTWARE          MatriculadoemEquivalente       60h',
			'IFD0171    FISICA1          60h'
		].join('\n');
		expect(resumo(texto)).toEqual(['FGA0172:MATR:60:REQUISITOS DESOFTWARE', 'IFD0171:PENDENTE:60:FISICA 1']);
	});

	it('formato detalhado: nome e CH numa linha, código colado na linha da ementa', () => {
		const texto = [
			'Componentes Curriculares Obrigatórios Pendentes:2',
			'Código          Componente Curricular          CH',
			'ENGENHARIA E AMBIENTE          60 h',
			'EMENTA: Engenharia e Ambiente1 - Conceitos básicos 2 - A terra com um sistema',
			'FGA0161ambiente e sociedade',
			'MÉTODOS NUMÉRICOS PARA ENGENHARIA          60 h',
			'EMENTA: Fontes de erros em métodos numéricos',
			'FGA0160quadrados mínimos'
		].join('\n');
		expect(resumo(texto)).toEqual([
			'FGA0161:PENDENTE:60:ENGENHARIA E AMBIENTE',
			'FGA0160:PENDENTE:60:MÉTODOS NUMÉRICOS PARA ENGENHARIA'
		]);
	});
});

describe('calcularNumeroSemestre (R37)', () => {
	const disc = (ano_periodo: string, status = 'APR') =>
		({ tipo_dado: 'Disciplina Regular', ano_periodo, status }) as Parameters<typeof calcularNumeroSemestre>[0][number];

	it('não conta verão (x.3/x.4) nem período desconhecido', () => {
		const n = calcularNumeroSemestre([disc('2023.1'), disc('2023.2'), disc('2023.4'), disc('2024.1'), disc('2020.0'), disc('')]);
		expect(n).toBe(4); // 3 regulares + o atual
	});

	it('sem nenhum semestre cursado é o 1º', () => {
		expect(calcularNumeroSemestre([disc('2025.1', 'MATR')])).toBe(1);
	});
});

describe('fallback regex: período truncado (R37)', () => {
	it('"2020." não vira "2020.0"', () => {
		const texto = ['CÁLCULO 1', '2020.      MAT0025          90    01    100,0    MS    APR'].join('\n');
		expect(regulares(texto)[0].ano_periodo).toBe('');
	});
});

describe('extrairMatrizCurricular (R12)', () => {
	it('sem label, não confunde data do cabeçalho com código de currículo', () => {
		const texto =
			'Credenciada conforme decreto MEC Nº 500, de 15 de janeiro de 1962\nna seção 01, pág. 559, em 16/01/1962.\nCurso: ENGENHARIA DE SOFTWARE/FGA - BACHARELADO - DIURNO\nMatriz: 6360/1 - 2017.1';
		expect(extrairMatrizCurricular(texto)).toBe('6360/1');
	});

	it('texto só com datas não tem matriz', () => {
		expect(extrairMatrizCurricular('Emitido em 16/01/2025')).toBeNull();
	});

	it('com label continua igual', () => {
		expect(extrairMatrizCurricular('Currículo:          6360/1 - 2017.1')).toBe('6360/1');
		expect(extrairMatrizCurricular('Currículo:          8150/-2')).toBe('8150/-2');
	});
});

describe('extrairCargaHorariaIntegralizada (R18)', () => {
	it('layout em coluna com Complementares em branco não inventa total', () => {
		// Exigido 3225/630/3855, Integralizado 990/120/1110, Pendente 2235/510/2745
		const texto =
			'Obrigatórias\nOptativos\nComplementares\nTotal\nExigido\n3225 h\n630 h\n3855 h\nIntegralizado\n990 h\n120 h\n1110 h\nPendente\n2235 h\n510 h\n2745 h\nCarga Horária Extensionista';
		const ch = extrairCargaHorariaIntegralizada(texto);
		expect(ch).toEqual({ obrigatoria: 990, optativa: 120, complementar: 0, total: 1110 });
	});

	it('bloco cujos números não fecham a soma devolve null em vez de chutar', () => {
		const texto = 'Integralizado\n990 h\n120 h\n45 h\n2000 h\nCarga Horária Extensionista';
		expect(extrairCargaHorariaIntegralizada(texto)).toBeNull();
	});

	it('layouts que já funcionavam continuam iguais', () => {
		expect(
			extrairCargaHorariaIntegralizada(
				'Exigido   3225 h   630 h      3855 h\nIntegralizado   990 h   120 h      1110 h\nPendente   2235 h   510 h      2745 h\n'
			)
		).toBeNull();
		expect(extrairCargaHorariaIntegralizada('Integralizado   3225 h   690 h   0 h   3915 h')).toEqual({
			obrigatoria: 3225,
			optativa: 690,
			complementar: 0,
			total: 3915
		});
		expect(extrairCargaHorariaIntegralizada('Integralizado\nPendente\n')).toBeNull();
	});
});
