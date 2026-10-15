import { describe, expect, it, vi } from 'vitest';
import type { IntegralizacaoResult } from '$lib/types/matriz';
import type { DadosFluxogramaUser, DadosMateria } from '$lib/types/user';
import type { MateriaModel } from '$lib/types/materia';

let matrizOrigemMock: { idMatriz: number; chTotalExigida: number } | null = { idMatriz: 1, chTotalExigida: 1000 };
let gradeOrigemMock: Array<{ codigoMateria: string; cargaHoraria: number; categoria: 'obrigatoria' | 'optativa' | 'complementar' }> = [];
let cursoOrigemMock: { materias: MateriaModel[]; equivalencias: unknown[] } = { materias: [], equivalencias: [] };

vi.mock('$lib/services/supabase-data.service', () => ({
	supabaseDataService: {
		getMatrizByCurriculoCompleto: vi.fn(async () => matrizOrigemMock),
		getGradeByMatriz: vi.fn(async () => gradeOrigemMock)
	}
}));

vi.mock('$lib/services/fluxograma.service', () => ({
	fluxogramaService: {
		getCourseDataByCurriculoCompleto: vi.fn(async () => {
			if (!matrizOrigemMock) throw new Error('Matriz não encontrada');
			return cursoOrigemMock;
		})
	}
}));

import {
	avaliarRequisitosDuplaDiplomacao,
	calcularIntegralizacaoDupla,
	IRA_MINIMO_DUPLA_DIPLOMACAO
} from './dupla-diplomacao-requisitos.service';

function materiaCursada(codigoMateria: string, status: DadosMateria['status']): DadosMateria {
	return { codigoMateria, mencao: '-', professor: '', status };
}

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

function integralizacao(overrides: Partial<IntegralizacaoResult>): IntegralizacaoResult {
	return {
		curriculoCompleto: 'X',
		idMatriz: 1,
		idCurso: 1,
		exigido: { chObrigatoria: 0, chOptativa: 0, chComplementar: 0, chTotal: 0 },
		realizado: { chObrigatoria: 0, chOptativa: 0, chComplementar: 0, chTotal: 0 },
		faltam: { chObrigatoria: 0, chOptativa: 0, chComplementar: 0, chTotal: 0 },
		codigosObrigatorios: [],
		codigosConcluidos: [],
		pctObrigatoria: 0,
		pctOptativa: 0,
		pctComplementar: 0,
		pctTotal: 0,
		...overrides
	};
}

function dadosFluxograma(overrides: Partial<DadosFluxogramaUser>): DadosFluxogramaUser {
	return {
		nomeCurso: 'Curso Atual',
		ira: 4.0,
		matricula: '000',
		horasIntegralizadas: 0,
		suspensoes: [],
		anoAtual: '2026.1',
		matrizCurricular: 'MATRIZ-ORIGEM',
		semestreAtual: 8,
		dadosFluxograma: [],
		...overrides
	};
}

describe('calcularIntegralizacaoDupla', () => {
	it('reproduz o exemplo de docs/unb-domain.md: T=3840, P=3450, C=300, E=300 -> X=12,03%', () => {
		// P = T - realizadoNucleo => realizadoNucleo = T - P = 390
		const resultado = calcularIntegralizacaoDupla(
			integralizacao({
				exigido: { chObrigatoria: 0, chOptativa: 0, chComplementar: 300, chTotal: 3840 },
				realizado: { chObrigatoria: 390, chOptativa: 0, chComplementar: 0, chTotal: 390 },
				codigosConcluidos: []
			}),
			[materia({ codigoMateria: 'EST0001', nomeMateria: 'ESTÁGIO SUPERVISIONADO 1', creditos: 20 })]
		);

		expect(resultado.T).toBe(3840);
		expect(resultado.C).toBe(300);
		expect(resultado.E).toBe(300);
		expect(resultado.P).toBe(3450);
		expect(Math.round(resultado.pctIntegralizacaoDupla * 10000) / 100).toBeCloseTo(12.03, 1);
		expect(resultado.atende70porcento).toBe(false);
	});

	it('aceita quando X >= 70%', () => {
		const resultado = calcularIntegralizacaoDupla(
			integralizacao({
				exigido: { chObrigatoria: 2000, chOptativa: 500, chComplementar: 0, chTotal: 2500 },
				realizado: { chObrigatoria: 1900, chOptativa: 500, chComplementar: 0, chTotal: 2400 },
				codigosConcluidos: []
			}),
			[]
		);
		expect(resultado.atende70porcento).toBe(true);
	});

	it('limita CH optativa realizada ao exigido no destino (não infla o percentual)', () => {
		const base = {
			exigido: { chObrigatoria: 1000, chOptativa: 100, chComplementar: 0, chTotal: 1100 },
			codigosConcluidos: []
		};
		const comExcedente = calcularIntegralizacaoDupla(
			integralizacao({ ...base, realizado: { chObrigatoria: 700, chOptativa: 300, chComplementar: 0, chTotal: 1000 } }),
			[]
		);
		const semExcedente = calcularIntegralizacaoDupla(
			integralizacao({ ...base, realizado: { chObrigatoria: 700, chOptativa: 100, chComplementar: 0, chTotal: 800 } }),
			[]
		);
		expect(comExcedente.pctIntegralizacaoDupla).toBeCloseTo(semExcedente.pctIntegralizacaoDupla, 6);
	});

	it('exclui a CH de estágio obrigatório realizada do numerador e do denominador', () => {
		const materiasDestino = [
			materia({ codigoMateria: 'EST0001', nomeMateria: 'ESTÁGIO SUPERVISIONADO', creditos: 8 }) // 120h
		];
		const resultado = calcularIntegralizacaoDupla(
			integralizacao({
				exigido: { chObrigatoria: 500, chOptativa: 0, chComplementar: 0, chTotal: 620 },
				realizado: { chObrigatoria: 620, chOptativa: 0, chComplementar: 0, chTotal: 620 },
				codigosConcluidos: ['EST0001']
			}),
			materiasDestino
		);
		// realizadoNucleo = 620 (obrigatoria realizada) - 120 (estagio) = 500 = T - E
		expect(resultado.realizadoNucleo).toBe(500);
		expect(resultado.pctIntegralizacaoDupla).toBe(1);
	});
});

describe('avaliarRequisitosDuplaDiplomacao', () => {
	it('retorna null sem integralização do destino', async () => {
		const resultado = await avaliarRequisitosDuplaDiplomacao(dadosFluxograma({}), null, []);
		expect(resultado).toBeNull();
	});

	it('reprova pelo IRA quando ira < 3.0', async () => {
		const resultado = await avaliarRequisitosDuplaDiplomacao(
			dadosFluxograma({ ira: 2.5, horasIntegralizadas: 950 }),
			integralizacao({
				exigido: { chObrigatoria: 900, chOptativa: 100, chComplementar: 0, chTotal: 1000 },
				realizado: { chObrigatoria: 900, chOptativa: 100, chComplementar: 0, chTotal: 1000 },
				codigosConcluidos: []
			}),
			[]
		);
		expect(resultado?.ira.atendeIra).toBe(false);
		expect(resultado?.elegivel).toBe(false);
	});

	it('reprova por não ser provável formando quando as matriculadas não cobrem o que falta', async () => {
		gradeOrigemMock = [{ codigoMateria: 'ORI0001', cargaHoraria: 180, categoria: 'obrigatoria' }];
		cursoOrigemMock = {
			materias: [materia({ codigoMateria: 'ORI0001', creditos: 12 })], // 12*15 = 180h
			equivalencias: []
		};
		const resultado = await avaliarRequisitosDuplaDiplomacao(
			dadosFluxograma({
				ira: 4.0,
				dadosFluxograma: [[materiaCursada('ORI0001', 'MATR')]] // só cobre 180 de 500 que faltam
			}),
			integralizacao({
				exigido: { chObrigatoria: 900, chOptativa: 100, chComplementar: 0, chTotal: 1000 },
				realizado: { chObrigatoria: 900, chOptativa: 100, chComplementar: 0, chTotal: 1000 },
				codigosConcluidos: []
			}),
			[],
			{ obrigatoria: 500, optativa: 0, complementar: 0, total: 500 } // 500/1000 já integralizado (curso atual), faltam 500
		);
		expect(resultado?.formando.chFaltanteOrigem).toBe(500);
		expect(resultado?.formando.chMatriculadaAtual).toBe(180);
		expect(resultado?.formando.atendeProvavelFormando).toBe(false);
		expect(resultado?.elegivel).toBe(false);
		gradeOrigemMock = [];
		cursoOrigemMock = { materias: [], equivalencias: [] };
	});

	it('é elegível quando os três gates passam (matriculado em tudo que falta para 100%)', async () => {
		gradeOrigemMock = [{ codigoMateria: 'ORI0001', cargaHoraria: 60, categoria: 'obrigatoria' }];
		cursoOrigemMock = {
			materias: [materia({ codigoMateria: 'ORI0001', creditos: 4 })], // 4*15 = 60h
			equivalencias: []
		};
		const resultado = await avaliarRequisitosDuplaDiplomacao(
			dadosFluxograma({
				ira: 4.0,
				dadosFluxograma: [[materiaCursada('ORI0001', 'MATR')]] // cobre além dos 50 que faltam
			}),
			integralizacao({
				exigido: { chObrigatoria: 900, chOptativa: 100, chComplementar: 0, chTotal: 1000 },
				realizado: { chObrigatoria: 900, chOptativa: 100, chComplementar: 0, chTotal: 1000 },
				codigosConcluidos: []
			}),
			[],
			{ obrigatoria: 950, optativa: 0, complementar: 0, total: 950 } // 950/1000 já integralizado (curso atual), faltam 50
		);
		expect(resultado?.integralizacao.atende70porcento).toBe(true);
		expect(resultado?.formando.atendeProvavelFormando).toBe(true);
		expect(resultado?.ira.atendeIra).toBe(true);
		expect(resultado?.elegivel).toBe(true);
		gradeOrigemMock = [];
		cursoOrigemMock = { materias: [], equivalencias: [] };
	});

	it('não consegue avaliar "provável formando" sem matriz de origem encontrada', async () => {
		matrizOrigemMock = null;
		const resultado = await avaliarRequisitosDuplaDiplomacao(
			dadosFluxograma({ ira: 4.0 }),
			integralizacao({
				exigido: { chObrigatoria: 900, chOptativa: 100, chComplementar: 0, chTotal: 1000 },
				realizado: { chObrigatoria: 900, chOptativa: 100, chComplementar: 0, chTotal: 1000 },
				codigosConcluidos: []
			}),
			[]
		);
		expect(resultado?.formando.podeAvaliar).toBe(false);
		expect(resultado?.formando.atendeProvavelFormando).toBeNull();
		expect(resultado?.elegivel).toBe(false);
		matrizOrigemMock = { idMatriz: 1, chTotalExigida: 1000 };
	});
});

describe('constantes', () => {
	it('IRA mínimo bate com docs/unb-domain.md', () => {
		expect(IRA_MINIMO_DUPLA_DIPLOMACAO).toBe(3.0);
	});
});
