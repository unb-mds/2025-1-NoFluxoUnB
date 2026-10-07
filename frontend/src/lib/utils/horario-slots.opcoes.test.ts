/**
 * Montador de Grade — `autoMontarGradeOpcoes` com estratégias que avaliam a
 * grade INTEIRA (`RankingStrategy.avaliar`).
 *
 * Regressão do experimento que motivou a mudança: com as estratégias antigas
 * (bônus por turma isolada), "Menos lacunas" devolvia a grade com quase o dobro
 * de furo da "Menos dias", e "Semana equilibrada" saía idêntica a outra.
 */
import { describe, it, expect } from 'vitest';
import {
	autoMontarGrade,
	autoMontarGradeOpcoes,
	slotMaskFromHorario,
	type MateriaTurmas,
	type MetricasOpcao,
	type RankingStrategy
} from './horario-slots';

type T = { id: number; horario: string; docente?: string };

let seq = 0;
function mat(chave: string, horarios: string[], extra: Partial<MateriaTurmas<T>> = {}): MateriaTurmas<T> {
	return {
		chave,
		peso: 1_000_000,
		creditos: 4,
		turmas: horarios.map((h) => ({ mask: slotMaskFromHorario(h), turma: { id: ++seq, horario: h } })),
		...extra
	};
}

// Mesmas três do store (`construirEstrategiasPadrao`).
const ESTRATEGIAS: RankingStrategy<T>[] = [
	{ nome: 'Menos dias', avaliar: (m) => [m.diasComAula, m.minutosDeLacuna] },
	{ nome: 'Menos lacunas', avaliar: (m) => [m.minutosDeLacuna, m.diasComAula] },
	{ nome: 'Semana equilibrada', avaliar: (m) => [m.variancaCargaDiaria, m.minutosDeLacuna] }
];

function poolExperimento(): MateriaTurmas<T>[] {
	return [
		mat('A', ['24M12', '35T23', '35N12']),
		mat('B', ['24M34', '35M12', '24T45']),
		mat('C', ['35M34', '24T23', '6M1234']),
		mat('D', ['35T45', '24N12', '6T2345']),
		mat('E', ['24T23', '35M12', '35T23'])
	];
}

function metricaDe(opcoes: ReturnType<typeof autoMontarGradeOpcoes<T>>, nome: string): MetricasOpcao {
	const o = opcoes.find((x) => x.estrategia === nome);
	if (!o) throw new Error(`sem opção ${nome}`);
	return o.metricas;
}

describe('autoMontarGradeOpcoes — estratégias pela grade inteira', () => {
	it('cada estratégia vence no próprio critério (cenário do experimento)', () => {
		// maxOpcoes alto e sem dedupe por conjunto atrapalhar: queremos ver as 3.
		const brutas = ESTRATEGIAS.map(
			(e) => autoMontarGradeOpcoes(poolExperimento(), 0n, 20, [e], 6, (t) => t.id)[0]
		);
		const [dias, lacunas, equilibrada] = brutas.map((o) => o.metricas);

		for (const outra of [lacunas, equilibrada]) {
			expect(dias.diasComAula).toBeLessThanOrEqual(outra.diasComAula);
		}
		for (const outra of [dias, equilibrada]) {
			expect(lacunas.minutosDeLacuna).toBeLessThanOrEqual(outra.minutosDeLacuna);
		}
		for (const outra of [dias, lacunas]) {
			expect(equilibrada.variancaCargaDiaria).toBeLessThanOrEqual(outra.variancaCargaDiaria);
		}
	});

	it('"Menos lacunas" não tem mais furo que "Menos dias" (era 780 vs 410 min)', () => {
		const opcoes = autoMontarGradeOpcoes(poolExperimento(), 0n, 20, ESTRATEGIAS, 6, (t) => t.id);
		// Estratégias que caem na mesma grade são deduplicadas; a que sobra leva o nome da primeira.
		const lacunas = opcoes.find((o) => o.estrategia === 'Menos lacunas') ?? opcoes[0];
		expect(lacunas.metricas.minutosDeLacuna).toBeLessThanOrEqual(
			metricaDe(opcoes, 'Menos dias').minutosDeLacuna
		);
	});

	it('nunca troca matéria por semana mais bonita: todas as opções alocam o mesmo tanto que o solver', () => {
		const pool = poolExperimento();
		const otimo = autoMontarGrade(pool, 0n, 20);
		const opcoes = autoMontarGradeOpcoes(pool, 0n, 20, ESTRATEGIAS, 6, (t) => t.id);
		for (const o of opcoes) expect(o.resultado.selecao.size).toBe(otimo.selecao.size);
	});

	it('preferência de professor vem antes da métrica', () => {
		// X: turma da ANA concentra em 1 dia a mais que a do BRUNO; "Menos dias" não
		// pode trocar a ANA (bônus) só para tirar um dia.
		const x: MateriaTurmas<T> = {
			chave: 'X',
			peso: 1_000_000,
			turmas: [
				{ mask: slotMaskFromHorario('6M12'), turma: { id: 900, horario: '6M12', docente: 'ANA' }, bonus: 0.1 },
				{ mask: slotMaskFromHorario('2M34'), turma: { id: 901, horario: '2M34', docente: 'BRUNO' } }
			]
		};
		const y = mat('Y', ['2M12']);
		const [opcao] = autoMontarGradeOpcoes([x, y], 0n, undefined, [ESTRATEGIAS[0]], 6, (t) => t.id);
		expect(opcao.resultado.selecao.get('X')?.turma.docente).toBe('ANA');
	});

	it('peso fracionário (fator de atraso) não quebra o empate', () => {
		const pool = poolExperimento().map((m, i) => ({ ...m, peso: 1_000_000 * (1 + i * 0.137) }));
		const opcoes = autoMontarGradeOpcoes(pool, 0n, 20, ESTRATEGIAS, 6, (t) => t.id);
		const otimo = autoMontarGrade(pool, 0n, 20);
		for (const o of opcoes) expect(o.resultado.selecao.size).toBe(otimo.selecao.size);
		expect(opcoes.length).toBeGreaterThan(1);
	});

	it('estratégia legada só com `pontuar` continua funcionando', () => {
		const legado: RankingStrategy<T> = { nome: 'legado', pontuar: () => 0 };
		const opcoes = autoMontarGradeOpcoes(poolExperimento(), 0n, 20, [legado]);
		expect(opcoes).toHaveLength(1);
		expect(opcoes[0].resultado.selecao.size).toBeGreaterThan(0);
	});

	it('intervalo regular entre pares de módulos não conta como furo', () => {
		const opcoes = autoMontarGradeOpcoes(
			[mat('P', ['2M12']), mat('Q', ['2M34'])],
			0n,
			undefined,
			[ESTRATEGIAS[1]]
		);
		expect(opcoes[0].metricas.minutosDeLacuna).toBe(0);
	});
});
