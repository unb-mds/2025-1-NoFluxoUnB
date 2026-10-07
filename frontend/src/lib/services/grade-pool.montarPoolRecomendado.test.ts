import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MateriaModel } from '$lib/types/materia';

/**
 * A política de semeadura do Montador: quem entra na lista, em que ordem e até
 * onde. Fluxograma e oferta são stubs — o que está sob teste aqui é a REGRA de
 * escolha, não o acesso ao banco.
 */
const curso = {
	materias: [] as MateriaModel[],
	preRequisitos: [] as unknown[],
	coRequisitos: [] as unknown[],
	equivalencias: [] as unknown[]
};
const completed = new Set<string>();
const current = new Set<string>();
/** Optativa → obrigatórias que a exigem (o `optatorias` do fluxogramaStore). */
let optatorias = new Map<string, string[]>();
/** Códigos com turma no período; o resto volta sem oferta nenhuma. */
let comOferta = new Set<string>();
/** Horário fixo por código, quando o teste precisa forçar conflito. */
let horarioDe = new Map<string, string>();

vi.mock('$lib/stores/fluxograma.store.svelte', () => ({
	fluxogramaStore: {
		get state() {
			return { courseData: curso };
		},
		get completedCodes() {
			return completed;
		},
		get currentCodes() {
			return current;
		},
		get optatorias() {
			return optatorias;
		}
	}
}));

/** Horários distintos por matéria, para nada conflitar sem o teste pedir. */
const HORARIOS = ['2M12', '2M34', '3M12', '3M34', '4M12', '4M34', '5M12', '5M34', '6M12', '6M34'];
let proximoHorario = 0;

vi.mock('$lib/services/oferta-turmas.service', () => ({
	getOfertaComEquivalencia: async (materias: Array<{ codigo: string }>) =>
		new Map(
			materias.map((m) => {
				if (!comOferta.has(m.codigo)) return [m.codigo, []];
				const horario =
					horarioDe.get(m.codigo) ?? HORARIOS[proximoHorario++ % HORARIOS.length];
				return [
					m.codigo,
					[{ turma: { id_turmas: 1000 + proximoHorario, horario }, codigoOfertado: undefined }]
				];
			})
		)
}));

const { montarPoolRecomendado } = await import('./grade-pool.service');

function materiaDaMatriz(
	codigo: string,
	nivel: number,
	tipoNatureza: 0 | 1,
	idMateria: number,
	creditos = 4
): MateriaModel {
	return {
		codigoMateria: codigo,
		nomeMateria: codigo,
		idMateria,
		nivel,
		tipoNatureza,
		creditos,
		ementa: ''
	} as unknown as MateriaModel;
}

/** Todas as matérias da matriz passam a ter oferta — o caso comum dos testes. */
function todasComOferta(): void {
	comOferta = new Set(curso.materias.map((m) => m.codigoMateria));
}

describe('montarPoolRecomendado', () => {
	beforeEach(() => {
		curso.materias = [];
		curso.preRequisitos = [];
		curso.equivalencias = [];
		completed.clear();
		current.clear();
		optatorias = new Map();
		comOferta = new Set();
		horarioDe = new Map();
		proximoHorario = 0;
	});

	/**
	 * O sintoma que abriu este trabalho: aluno matriculado em N matérias e nenhuma
	 * delas na lista. Matrícula é fato consumado — entra antes de qualquer
	 * recomendação e não disputa vaga no limite de créditos.
	 */
	it('a matéria em curso entra sempre, antes das recomendadas', async () => {
		curso.materias = [
			materiaDaMatriz('MATR0001', 3, 0, 1),
			materiaDaMatriz('OBR0001', 1, 0, 2)
		];
		todasComOferta();
		current.add('MATR0001');

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['MATR0001', 'OBR0001']);
	});

	it('as obrigatórias param no limite de créditos', async () => {
		curso.materias = [
			materiaDaMatriz('OBR0001', 1, 0, 1),
			materiaDaMatriz('OBR0002', 2, 0, 2),
			materiaDaMatriz('OBR0003', 3, 0, 3),
			materiaDaMatriz('OBR0004', 4, 0, 4),
			materiaDaMatriz('OBR0005', 5, 0, 5)
		];
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 12 });

		// 4 créditos cada: cabem 3, e as mais atrasadas (nível baixo) vêm primeiro.
		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0001', 'OBR0002', 'OBR0003']);
	});

	/**
	 * A matrícula já aconteceu: o crédito dela está gasto antes de o app recomendar
	 * qualquer coisa. Recomendar 24 créditos POR CIMA de 12 já cursados é o caminho
	 * mais curto para uma grade que ninguém consegue se matricular.
	 */
	it('a matéria em curso come o orçamento antes das recomendadas', async () => {
		curso.materias = [
			materiaDaMatriz('MATR0001', 3, 0, 1),
			materiaDaMatriz('OBR0001', 1, 0, 2),
			materiaDaMatriz('OBR0002', 2, 0, 3),
			materiaDaMatriz('OBR0003', 3, 0, 4)
		];
		todasComOferta();
		current.add('MATR0001');

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 12 });

		// 4 da MATR + 8 de recomendação = 12.
		expect(r.materias.map((m) => m.codigo)).toEqual(['MATR0001', 'OBR0001', 'OBR0002']);
	});

	/**
	 * Sem turma a matéria não vira bloco no calendário, então ela não entra na
	 * lista. Mas sumir calada é pior: "a obrigatória que te falta não é ofertada
	 * neste semestre" muda o planejamento do aluno e ele precisa ver isso.
	 */
	it('obrigatória sem turma no período fica de fora, mas é reportada', async () => {
		curso.materias = [
			materiaDaMatriz('OBR0001', 1, 0, 1),
			materiaDaMatriz('OBR0002', 2, 0, 2),
			materiaDaMatriz('OPT0001', 0, 1, 3)
		];
		comOferta = new Set(['OBR0001']);

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0001']);
		expect(r.obrigatoriasSemOferta).toEqual(['OBR0002']);
	});

	/**
	 * As "optatórias": no SIGAA constam como optativa, mas são pré-requisito de
	 * obrigatória — quem não as faz trava a formatura. Entre optativas, elas vêm
	 * primeiro; o `fluxogramaStore.optatorias` já mapeia quais são.
	 */
	it('entre optativas, a que destrava obrigatória vem primeiro', async () => {
		curso.materias = [
			materiaDaMatriz('OPT0001', 0, 1, 1),
			materiaDaMatriz('OPT0002', 0, 1, 2),
			materiaDaMatriz('OPT0003', 0, 1, 3)
		];
		todasComOferta();
		optatorias = new Map([['OPT0003', ['OBR0009']]]);

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['OPT0003', 'OPT0001', 'OPT0002']);
	});

	/**
	 * O plano de formatura deixou de ser a FONTE da lista e virou desempate: entre
	 * duas obrigatórias igualmente elegíveis, vem antes a que ele recomendou. Sem
	 * o plano, o critério seguinte (nível) mandaria OBR0001 primeiro.
	 */
	it('o plano de formatura desempata entre obrigatórias igualmente elegíveis', async () => {
		curso.materias = [
			materiaDaMatriz('OBR0001', 1, 0, 1),
			materiaDaMatriz('OBR0002', 2, 0, 2),
			materiaDaMatriz('OBR0003', 3, 0, 3)
		];
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 24,
			ordemDoPlano: ['OBR0003', 'OBR0002']
		});

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0003', 'OBR0002', 'OBR0001']);
	});

	/**
	 * O outro lado da mesma moeda, e o motivo de a fonte ter mudado: o plano pode
	 * recomendar código que não está na matriz do aluno (no chamado que abriu isso,
	 * um EST0161 que entrou como módulo livre). Citar no plano não dá passaporte —
	 * matéria de fora da matriz só entra se o aluno adicionar na mão.
	 */
	it('matéria fora da matriz não entra nem quando o plano recomenda', async () => {
		curso.materias = [materiaDaMatriz('OBR0001', 1, 0, 1)];
		comOferta = new Set(['OBR0001', 'EST0161']);

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 24,
			ordemDoPlano: ['EST0161', 'OBR0001']
		});

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0001']);
	});

	it('optativa só entra com o crédito que sobra depois das obrigatórias', async () => {
		curso.materias = [
			materiaDaMatriz('OBR0001', 1, 0, 1),
			materiaDaMatriz('OBR0002', 2, 0, 2),
			materiaDaMatriz('OPT0001', 0, 1, 3)
		];
		todasComOferta();

		const apertado = await montarPoolRecomendado('2026.2', { limiteCreditos: 8 });
		expect(apertado.materias.map((m) => m.codigo)).toEqual(['OBR0001', 'OBR0002']);

		const folgado = await montarPoolRecomendado('2026.2', { limiteCreditos: 12 });
		expect(folgado.materias.map((m) => m.codigo)).toEqual(['OBR0001', 'OBR0002', 'OPT0001']);
	});

	it('não traz de volta o que o aluno tirou na lixeira', async () => {
		curso.materias = [
			materiaDaMatriz('MATR0001', 3, 0, 1),
			materiaDaMatriz('OBR0001', 1, 0, 2),
			materiaDaMatriz('OBR0002', 2, 0, 3)
		];
		todasComOferta();
		current.add('MATR0001');

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 24,
			excluir: ['OBR0001', 'MATR0001']
		});

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0002']);
	});

	/**
	 * Pré-requisito que não fecha nem contando o que ele cursa agora: a matrícula
	 * seria recusada. Recomendar isso é recomendar uma grade impossível.
	 */
	it('não semeia matéria com pré-requisito pendente', async () => {
		curso.materias = [materiaDaMatriz('OBR0001', 1, 0, 1), materiaDaMatriz('OBR0002', 2, 0, 2)];
		curso.preRequisitos = [
			{ idMateria: 2, idPreRequisito: 1, codigoMateriaRequisito: 'XYZ0001', expressaoLogica: null }
		];
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0001']);
	});

	it('dependência em curso continua sendo semeada', async () => {
		curso.materias = [materiaDaMatriz('MATR0001', 1, 0, 1), materiaDaMatriz('OBR0002', 2, 0, 2)];
		curso.preRequisitos = [
			{ idMateria: 2, idPreRequisito: 1, codigoMateriaRequisito: 'MATR0001', expressaoLogica: null }
		];
		todasComOferta();
		current.add('MATR0001');

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['MATR0001', 'OBR0002']);
	});

	it('carimba o nível da matriz na matéria (desempate por atraso)', async () => {
		curso.materias = [materiaDaMatriz('OBR0001', 3, 0, 1), materiaDaMatriz('OPT0001', 0, 1, 2)];
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.find((m) => m.codigo === 'OBR0001')?.nivel).toBe(3);
		expect(r.materias.find((m) => m.codigo === 'OPT0001')?.nivel).toBeUndefined();
	});

	/**
	 * "Todas as pendentes": o solver escolhe dentro do limite, então a lista leva
	 * toda obrigatória com oferta — inclusive as que conflitam entre si ou passam
	 * do limite, que é justamente o que dá alternativa para a montagem.
	 */
	it('todas-pendentes semeia toda obrigatória com oferta, sem cortar por crédito', async () => {
		curso.materias = [
			materiaDaMatriz('OBR0001', 1, 0, 1),
			materiaDaMatriz('OBR0002', 2, 0, 2),
			materiaDaMatriz('OBR0003', 3, 0, 3),
			materiaDaMatriz('OPT0001', 0, 1, 4)
		];
		todasComOferta();
		horarioDe = new Map([
			['OBR0001', '2M12'],
			['OBR0002', '2M12'],
			['OBR0003', '3M12'],
			['OPT0001', '4M12']
		]);

		const periodo = await montarPoolRecomendado('2026.2', { limiteCreditos: 8 });
		expect(periodo.materias.map((m) => m.codigo)).toEqual(['OBR0001', 'OBR0003']);

		const todas = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 8,
			escopo: 'todas-pendentes'
		});
		// Optativa comum continua pelo prefixo do orçamento (num peso menor, o solver
		// só a encaixa se sobrar espaço depois das obrigatórias).
		expect(todas.materias.map((m) => m.codigo)).toEqual([
			'OBR0001',
			'OBR0002',
			'OBR0003',
			'OPT0001'
		]);
	});
});
