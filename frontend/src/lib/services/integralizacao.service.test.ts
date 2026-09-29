import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MatrizModel } from '$lib/types/matriz';
import type { DadosFluxogramaUser } from '$lib/types/user';

/**
 * Stub do acesso ao banco: o que está sob teste é a conta de integralização
 * (exigido x realizado), não as queries do Supabase.
 */
type GradeRow = { codigoMateria: string; cargaHoraria: number; categoria: 'obrigatoria' | 'optativa' | 'complementar' };
let matriz: MatrizModel | null = null;
let grade: GradeRow[] = [];

vi.mock('$lib/services/supabase-data.service', () => ({
	supabaseDataService: {
		getMatrizByCurriculoCompleto: async () => matriz,
		getGradeByMatriz: async () => grade
	}
}));

const { getIntegralizacao, pct } = await import('./integralizacao.service');

function criarMatriz(ex: { obr: number; opt: number; compl?: number; total: number }): MatrizModel {
	return {
		idMatriz: 1,
		idCurso: 6360,
		curriculoCompleto: '6360/1 - 2017.1',
		versao: '1',
		anoVigor: '2017.1',
		chObrigatoriaExigida: ex.obr,
		chOptativaExigida: ex.opt,
		chComplementarExigida: ex.compl ?? 0,
		chTotalExigida: ex.total,
		status: null
	} as MatrizModel;
}

function alunoCom(codigos: string[]): DadosFluxogramaUser {
	return {
		nomeCurso: 'X',
		ira: 4,
		matricula: '1',
		horasIntegralizadas: 0,
		suspensoes: [],
		anoAtual: '2026.2',
		matrizCurricular: '6360/1 - 2017.1',
		semestreAtual: 1,
		dadosFluxograma: [
			codigos.map((c) => ({ codigoMateria: c, mencao: 'SS', professor: '', status: 'APR' }))
		]
	};
}

beforeEach(() => {
	matriz = null;
	grade = [];
});

describe('pct (R13: nunca arredonda para 100 faltando horas)', () => {
	it('3840 de 3855 h é 99, não 100', () => {
		expect(pct(3855, 3840)).toBe(99);
	});
	it('só é 100 quando realizado >= exigido', () => {
		expect(pct(3855, 3855)).toBe(100);
		expect(pct(3855, 4000)).toBe(100);
	});
	it('exigido zero ou realizado negativo não gera valores absurdos', () => {
		expect(pct(0, 10)).toBe(0);
		expect(pct(100, -13)).toBe(0);
	});
});

describe('getIntegralizacao com CH do PDF', () => {
	it('R13: PDF com 3840 de 3855 h mostra 99% e faltam 15 h', async () => {
		matriz = criarMatriz({ obr: 3000, opt: 855, total: 3855 });
		grade = [{ codigoMateria: 'A', cargaHoraria: 60, categoria: 'obrigatoria' }];
		const r = await getIntegralizacao({
			curriculoCompleto: '6360/1 - 2017.1',
			dadosFluxograma: null,
			cargaHorariaIntegralizada: { obrigatoria: 2990, optativa: 850, complementar: 0, total: 3840 }
		});
		expect(r?.faltam.chTotal).toBe(15);
		expect(r?.pctTotal).toBe(99);
		expect(r?.pctObrigatoria).toBe(99);
	});

	it('R13: PDF com o total exigido mostra 100%', async () => {
		matriz = criarMatriz({ obr: 3000, opt: 855, total: 3855 });
		grade = [{ codigoMateria: 'A', cargaHoraria: 60, categoria: 'obrigatoria' }];
		const r = await getIntegralizacao({
			curriculoCompleto: '6360/1 - 2017.1',
			dadosFluxograma: null,
			cargaHorariaIntegralizada: { obrigatoria: 3000, optativa: 855, complementar: 0, total: 3855 }
		});
		expect(r?.faltam.chTotal).toBe(0);
		expect(r?.pctTotal).toBe(100);
	});
});
