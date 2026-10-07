import { describe, it, expect } from 'vitest';
import {
	mesmaTurma,
	turmasReaisDoHistorico,
	professoresReaisDoHistorico,
	encontrarTurmaReal,
	type MateriaComTurmas
} from './turmas-reais';
import type { DadosFluxogramaUser, DadosMateria } from '$lib/types/user';

function dm(overrides: Partial<DadosMateria> & { codigoMateria: string }): DadosMateria {
	return {
		mencao: '-',
		professor: '',
		status: 'MATR',
		anoPeriodo: '2026.2',
		turma: '01',
		...overrides
	};
}

function historico(...materias: DadosMateria[]): DadosFluxogramaUser {
	return {
		nomeCurso: 'Engenharia de Software',
		ira: 4,
		matricula: '000000000',
		horasIntegralizadas: 0,
		suspensoes: [],
		anoAtual: '2026.2',
		matrizCurricular: '60810/1',
		semestreAtual: 5,
		// Após o upload tudo vive num bucket só — o semestre real está em anoPeriodo.
		dadosFluxograma: [materias]
	};
}

describe('mesmaTurma', () => {
	it('ignora zeros à esquerda, caixa e espaços', () => {
		expect(mesmaTurma('01', '1')).toBe(true);
		expect(mesmaTurma('001', '01')).toBe(true);
		expect(mesmaTurma(' a ', 'A')).toBe(true);
		expect(mesmaTurma('02A', '2A')).toBe(true);
	});

	it('não confunde turmas de fato diferentes', () => {
		expect(mesmaTurma('01', '02')).toBe(false);
		expect(mesmaTurma('A', 'B')).toBe(false);
		expect(mesmaTurma('10', '1')).toBe(false);
	});

	it('turma "0" sozinha não vira vazio', () => {
		expect(mesmaTurma('0', '0')).toBe(true);
		expect(mesmaTurma('0', '00')).toBe(true);
	});
});

describe('turmasReaisDoHistorico', () => {
	it('mapeia só as matérias MATR do período ativo', () => {
		const dados = historico(
			dm({ codigoMateria: 'FGA0240', turma: '02' }),
			dm({ codigoMateria: 'FGA0211', status: 'APR', anoPeriodo: '2025.1' }),
			dm({ codigoMateria: 'FGA0138', anoPeriodo: '2025.2', turma: '01' })
		);
		const reais = turmasReaisDoHistorico(dados, '2026.2');
		expect(reais.get('FGA0240')).toBe('02');
		expect(reais.has('FGA0211')).toBe(false); // aprovada, não matriculada
		expect(reais.has('FGA0138')).toBe(false); // MATR de outro período
	});

	it('ignora MATR sem turma registrada e normaliza o código', () => {
		const dados = historico(
			dm({ codigoMateria: 'FGA0240', turma: null }),
			dm({ codigoMateria: 'FGA0250', turma: '   ' }),
			dm({ codigoMateria: ' fga0303 ', turma: '03' })
		);
		const reais = turmasReaisDoHistorico(dados, '2026.2');
		expect(reais.size).toBe(1);
		expect(reais.get('FGA0303')).toBe('03');
	});

	it('sem histórico (ou vazio), não quebra e devolve mapa vazio', () => {
		expect(turmasReaisDoHistorico(null, '2026.2').size).toBe(0);
		expect(turmasReaisDoHistorico(undefined, '2026.2').size).toBe(0);
		expect(turmasReaisDoHistorico(historico(), '2026.2').size).toBe(0);
	});

	it('status é comparado sem sensibilidade a caixa/espaço (via isMateriaCurrent)', () => {
		const dados = historico(dm({ codigoMateria: 'FGA0240', status: ' matr ' }));
		expect(turmasReaisDoHistorico(dados, '2026.2').get('FGA0240')).toBe('01');
	});
});

describe('encontrarTurmaReal', () => {
	function materia(
		codigo: string,
		turmas: Array<{ id: number; turma: string; codigoOfertado?: string }>
	): MateriaComTurmas {
		return {
			codigo,
			turmas: turmas.map((t) => ({
				turma: { id_turmas: t.id, turma: t.turma },
				codigoOfertado: t.codigoOfertado
			}))
		};
	}

	it('acha a turma da matrícula pelo código da matéria', () => {
		const m = materia('FGA0240', [
			{ id: 10, turma: '01' },
			{ id: 11, turma: '02' }
		]);
		const reais = new Map([['FGA0240', '02']]);
		expect(encontrarTurmaReal(m, reais)).toBe(11);
	});

	it('casa "1" do histórico com "01" da oferta (e vice-versa)', () => {
		const m = materia('FGA0240', [{ id: 10, turma: '01' }]);
		expect(encontrarTurmaReal(m, new Map([['FGA0240', '1']]))).toBe(10);
	});

	it('matrícula em equivalente casa pelo codigoOfertado da turma', () => {
		// Matéria da matriz é FGA0240, mas a oferta publicada (e a matrícula do
		// aluno no SIGAA) usam o código novo FGA0317.
		const m = materia('FGA0240', [
			{ id: 20, turma: '01', codigoOfertado: 'FGA0317' },
			{ id: 21, turma: '02', codigoOfertado: 'FGA0317' }
		]);
		const reais = new Map([['FGA0317', '02']]);
		expect(encontrarTurmaReal(m, reais)).toBe(21);
	});

	it('devolve null quando o histórico não tem a matrícula ou a turma sumiu da oferta', () => {
		const m = materia('FGA0240', [{ id: 10, turma: '01' }]);
		expect(encontrarTurmaReal(m, new Map())).toBeNull();
		expect(encontrarTurmaReal(m, new Map([['FGA0240', '05']]))).toBeNull();
		expect(encontrarTurmaReal(m, new Map([['OUTRA', '01']]))).toBeNull();
	});

	it('matéria sem nenhuma turma na oferta devolve null', () => {
		const m = materia('FGA0240', []);
		expect(encontrarTurmaReal(m, new Map([['FGA0240', '01']]))).toBeNull();
	});
});

describe('encontrarTurmaReal — plano B pelo professor', () => {
	const fisica: MateriaComTurmas = {
		codigo: 'IFD0171',
		turmas: [
			{ turma: { id_turmas: 1, turma: 'A', docente: 'FULANO DE TAL' } },
			{ turma: { id_turmas: 2, turma: 'B', docente: 'RAFAEL MORGADO SILVA' } },
			{ turma: { id_turmas: 3, turma: 'C', docente: 'CICLANA, OUTRO NOME' } }
		]
	};

	it('sem casamento pela turma, acha pela turma do professor do histórico', () => {
		const reais = new Map([['IFD0171', '05']]);
		const profs = new Map([['IFD0171', 'Rafael Morgado Silva']]);
		expect(encontrarTurmaReal(fisica, reais, profs)).toBe(2);
	});

	it('código da turma continua tendo prioridade sobre o professor', () => {
		const reais = new Map([['IFD0171', 'A']]);
		const profs = new Map([['IFD0171', 'Rafael Morgado Silva']]);
		expect(encontrarTurmaReal(fisica, reais, profs)).toBe(1);
	});

	it('professor com duas turmas não vira palpite', () => {
		const m: MateriaComTurmas = {
			codigo: 'X',
			turmas: [
				{ turma: { id_turmas: 1, turma: 'A', docente: 'RAFAEL MORGADO' } },
				{ turma: { id_turmas: 2, turma: 'B', docente: 'RAFAEL MORGADO' } }
			]
		};
		expect(encontrarTurmaReal(m, new Map(), new Map([['X', 'Rafael Morgado']]))).toBeNull();
	});
});

describe('professoresReaisDoHistorico', () => {
	it('mapeia o professor só das MATR do período ativo', () => {
		const dados = historico(
			dm({ codigoMateria: 'ifd0171', professor: 'RAFAEL MORGADO' }),
			dm({ codigoMateria: 'MAT0025', professor: 'ANTIGO', anoPeriodo: '2026.1' })
		);
		const profs = professoresReaisDoHistorico(dados, '2026.2');
		expect(profs.get('IFD0171')).toBe('RAFAEL MORGADO');
		expect(profs.has('MAT0025')).toBe(false);
	});
});
