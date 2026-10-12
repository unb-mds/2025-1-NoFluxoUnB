import { describe, it, expect } from 'vitest';
import { fundirCorrequisitos } from './correquisitos';
import {
	autoMontarGradeCompacta,
	autoMontarGradeOpcoes,
	slotMaskFromHorario,
	type MateriaTurmas
} from './horario-slots';

type T = { id: number; horario: string };

let seq = 0;
function mat(chave: string, horarios: string[], extra: Partial<MateriaTurmas<T>> = {}): MateriaTurmas<T> {
	return {
		chave,
		peso: 1_000,
		creditos: 4,
		turmas: horarios.map((h) => ({ mask: slotMaskFromHorario(h), turma: { id: ++seq, horario: h } })),
		...extra
	};
}

/** Teoria ↔ Prática de Eletrônica Digital 2, como na matriz de Eng. de Software. */
const PAR = new Map([
	['FGA0074', ['FGA0072']],
	['FGA0072', ['FGA0074']]
]);

describe('fundirCorrequisitos', () => {
	/** O caso que abriu isto: a Teoria entrou na grade e a Prática não estava na lista. */
	it('tira da montagem a matéria cujo correquisito não está na lista', () => {
		const f = fundirCorrequisitos([mat('FGA0074', ['35M34']), mat('FGA0060', ['24T23'])], PAR);

		expect(f.materias.map((m) => m.chave)).toEqual(['FGA0060']);
		expect(f.semCorrequisito.get('FGA0074')).toEqual(['FGA0072']);

		const r = f.separar(autoMontarGradeCompacta(f.materias, 0n, 28));
		expect([...r.selecao.keys()]).toEqual(['FGA0060']);
		expect(r.naoAlocadas).toContain('FGA0074');
	});

	it('o par entra junto, cada um na sua turma', () => {
		const f = fundirCorrequisitos([mat('FGA0074', ['35M34']), mat('FGA0072', ['4M12'])], PAR);
		const r = f.separar(autoMontarGradeCompacta(f.materias, 0n, 28));

		expect(new Set(r.selecao.keys())).toEqual(new Set(['FGA0072', 'FGA0074']));
		expect(r.selecao.get('FGA0074')!.turma.horario).toBe('35M34');
		expect(r.selecao.get('FGA0072')!.turma.horario).toBe('4M12');
	});

	/** Sem fusão, o limite deixava a Teoria entrar sozinha (4 cr cabiam, 8 não). */
	it('se só cabe metade do par no limite, nenhuma das duas entra', () => {
		const f = fundirCorrequisitos([mat('FGA0074', ['35M34']), mat('FGA0072', ['4M12'])], PAR);
		const r = f.separar(autoMontarGradeCompacta(f.materias, 0n, 4));

		expect(r.selecao.size).toBe(0);
		expect(new Set(r.naoAlocadas)).toEqual(new Set(['FGA0072', 'FGA0074']));
	});

	it('só combina turmas do par que não conflitam entre si', () => {
		const f = fundirCorrequisitos(
			[mat('FGA0074', ['35M34', '24T23']), mat('FGA0072', ['3M34', '6M12'])],
			PAR
		);
		// 35M34 conflita com 3M34; sobram 3 combinações.
		expect(f.materias[0].turmas).toHaveLength(3);
	});

	it('par sem nenhuma combinação sem conflito fica inteiro de fora', () => {
		const f = fundirCorrequisitos([mat('FGA0074', ['3M34']), mat('FGA0072', ['3M34'])], PAR);

		expect(f.materias).toEqual([]);
		expect([...f.semCorrequisito.keys()].sort()).toEqual(['FGA0072', 'FGA0074']);
	});

	it('correquisito já na grade (travado) está atendido', () => {
		const f = fundirCorrequisitos([mat('FGA0074', ['35M34'])], PAR, new Set(['FGA0072']));

		expect(f.materias.map((m) => m.chave)).toEqual(['FGA0074']);
	});

	it('matrícula que já aconteceu não passa pela regra', () => {
		const f = fundirCorrequisitos([mat('FGA0074', ['35M34'])], PAR, new Set(), new Set(['FGA0074']));

		expect(f.materias.map((m) => m.chave)).toEqual(['FGA0074']);
	});

	it('a composta soma créditos e pesos, e herda essencial', () => {
		const f = fundirCorrequisitos(
			[mat('FGA0074', ['35M34'], { essencial: true }), mat('FGA0072', ['4M12'], { creditos: 2 })],
			PAR
		);
		expect(f.materias[0]).toMatchObject({ creditos: 6, peso: 2_000, essencial: true });
	});

	it('as opções do solver também voltam separadas', () => {
		const f = fundirCorrequisitos([mat('FGA0074', ['35M34']), mat('FGA0072', ['4M12'])], PAR);
		const opcoes = autoMontarGradeOpcoes(f.materias, 0n, 28, [
			{ nome: 'Menos dias', avaliar: (m) => [m.diasComAula] },
			{ nome: 'Pontuada', pontuar: () => 0 }
		]).map(f.separarOpcao);

		for (const o of opcoes) {
			expect(new Set(o.resultado.selecao.keys())).toEqual(new Set(['FGA0072', 'FGA0074']));
		}
	});
});
