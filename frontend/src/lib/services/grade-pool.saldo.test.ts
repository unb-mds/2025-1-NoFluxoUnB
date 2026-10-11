import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MateriaModel } from '$lib/types/materia';
import type { SituacaoAcademica } from '$lib/services/situacao-academica.service';

/**
 * A semeadura quando o Montador conhece o saldo de carga horária do aluno.
 *
 * O que se prova aqui é a POLÍTICA de quem sequer é oferecido — separada da
 * política de quem sobrevive ao conflito de horário, que vive nos pesos. As duas
 * são necessárias: o pool não é a única porta de entrada (a busca manual e o chat
 * também adicionam) e o solver não inventa candidata fora do pool.
 */
const curso = {
	materias: [] as MateriaModel[],
	preRequisitos: [] as unknown[],
	coRequisitos: [] as unknown[],
	equivalencias: [] as unknown[]
};
const completed = new Set<string>();
const current = new Set<string>();
let optatorias = new Map<string, string[]>();
let comOferta = new Set<string>();

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

const HORARIOS = ['2M12', '2M34', '3M12', '3M34', '4M12', '4M34', '5M12', '5M34', '6M12', '6M34'];
let proximoHorario = 0;

vi.mock('$lib/services/oferta-turmas.service', () => ({
	getOfertaComEquivalencia: async (materias: Array<{ codigo: string }>) =>
		new Map(
			materias.map((m) => {
				if (!comOferta.has(m.codigo)) return [m.codigo, []];
				const horario = HORARIOS[proximoHorario++ % HORARIOS.length];
				return [
					m.codigo,
					[{ turma: { id_turmas: 1000 + proximoHorario, horario }, codigoOfertado: undefined }]
				];
			})
		)
}));

const { montarPoolRecomendado, construirMateriasGrade, motivoParaNaoAdicionar } = await import(
	'./grade-pool.service'
);

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

function todasComOferta(): void {
	comOferta = new Set(curso.materias.map((m) => m.codigoMateria));
}

/** Situação com os faltantes que o teste quiser; o resto é irrelevante aqui. */
function situacao(faltam: Partial<SituacaoAcademica['faltam']>): SituacaoAcademica {
	return {
		faltam: { obrigatoria: 480, optativa: 180, modulo_livre: null, ...faltam },
		exigido: { obrigatoria: 2400, optativa: 360, modulo_livre: 120 },
		realizado: { obrigatoria: 1920, optativa: 180, modulo_livre: 0 },
		exigeModuloLivre: true,
		complementarConfiavel: true
	};
}

beforeEach(() => {
	curso.materias = [];
	curso.preRequisitos = [];
	curso.equivalencias = [];
	completed.clear();
	current.clear();
	optatorias = new Map();
	comOferta = new Set();
	proximoHorario = 0;
});

describe('semeadura — natureza já cumprida', () => {
	/**
	 * O desperdício que abriu este trabalho: o aluno já fechou a carga optativa e o
	 * montador continuava enchendo a grade dele de optativa, deixando de fora a
	 * obrigatória que ele ainda deve.
	 */
	it('optativa já cumprida não toma o lugar da obrigatória', async () => {
		curso.materias = [
			materiaDaMatriz('OBR0001', 1, 0, 1),
			materiaDaMatriz('OPT0001', 0, 1, 2),
			materiaDaMatriz('OPT0002', 0, 1, 3)
		];
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 4,
			situacao: situacao({ optativa: 0 })
		});

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0001']);
		expect(r.naturezasSaturadas).toContain('optativa');
	});

	/**
	 * O relato: "priorizei uma matéria e ela saiu sozinha". Quem já fechou as
	 * optativas e tem poucas pendentes com turma recebia uma grade com metade do
	 * limite vazio. A lacuna é completada — depois das que contam, nunca antes.
	 */
	it('com crédito sobrando, optativa já cumprida completa a lacuna — depois da obrigatória', async () => {
		curso.materias = [
			materiaDaMatriz('OPT0001', 0, 1, 2),
			materiaDaMatriz('OBR0001', 1, 0, 1),
			materiaDaMatriz('OPT0002', 0, 1, 3)
		];
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 12,
			situacao: situacao({ optativa: 0 })
		});

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0001', 'OPT0001', 'OPT0002']);
	});

	it('optativa continua entrando quando a carga optativa ainda falta', async () => {
		curso.materias = [materiaDaMatriz('OBR0001', 1, 0, 1), materiaDaMatriz('OPT0001', 0, 1, 2)];
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 24,
			situacao: situacao({ optativa: 180 })
		});

		expect(r.materias.map((m) => m.codigo)).toContain('OPT0001');
		expect(r.naturezasSaturadas).not.toContain('optativa');
	});

	/**
	 * Obrigatória é governada pela LISTA de pendentes, nunca pela conta de horas:
	 * quem mudou de matriz tem CH de um currículo e matriz de outro. Entre esconder
	 * uma obrigatória que o aluno ainda deve e sugerir uma a mais, o erro barato é
	 * o segundo — o primeiro custa um semestre.
	 */
	it('obrigatória pendente entra mesmo com a CH obrigatória zerada', async () => {
		curso.materias = [materiaDaMatriz('OBR0001', 1, 0, 1)];
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 24,
			situacao: situacao({ obrigatoria: 0 })
		});

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0001']);
		expect(r.naturezasSaturadas).not.toContain('obrigatoria');
	});
});

/**
 * "Optatória" é a optativa que destrava uma obrigatória. Ela não é horas de
 * optativa — é a chave de uma obrigatória, e sumir junto com as outras seria
 * travar o aluno por causa de uma conta que já fechou.
 */
describe('semeadura — optatórias sobrevivem à saturação', () => {
	it('optativa que destrava obrigatória pendente entra mesmo com a carga cumprida', async () => {
		curso.materias = [materiaDaMatriz('OPT0001', 0, 1, 1), materiaDaMatriz('OPT0002', 0, 1, 2)];
		todasComOferta();
		optatorias = new Map([['OPT0002', ['OBR0009']]]);

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 4,
			situacao: situacao({ optativa: 0 })
		});

		expect(r.materias.map((m) => m.codigo)).toEqual(['OPT0002']);
	});

	/**
	 * Optativa que só destrava obrigatória JÁ CURSADA é peso morto: destravar o que
	 * já está feito não serve para nada, e mantê-la ocuparia o lugar de matéria útil.
	 */
	it('optativa que só destrava obrigatória já cursada NÃO ganha a vaga da obrigatória', async () => {
		curso.materias = [materiaDaMatriz('OPT0001', 0, 1, 1), materiaDaMatriz('OBR0002', 3, 0, 2)];
		todasComOferta();
		optatorias = new Map([['OPT0001', ['OBR0009']]]);
		completed.add('OBR0009');

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 4,
			situacao: situacao({ optativa: 0 })
		});

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0002']);
	});
});

/**
 * Semear cinco optativas para quem precisa de duas enche a lista de matéria que
 * não conta para nada — e empurra para fora a obrigatória que ainda falta.
 */
describe('semeadura — teto pelo que falta de cada natureza', () => {
	it('não semeia mais optativa do que a carga que falta', async () => {
		curso.materias = [
			materiaDaMatriz('OPT0001', 0, 1, 1),
			materiaDaMatriz('OPT0002', 0, 1, 2),
			materiaDaMatriz('OPT0003', 0, 1, 3),
			materiaDaMatriz('OPT0004', 0, 1, 4)
		];
		todasComOferta();

		// 60h faltando = 4 créditos = exatamente uma matéria de 4 créditos. A obrigatória
		// pendente vem antes das optativas além do que falta (que só completam a lacuna).
		curso.materias.push(materiaDaMatriz('OBR0001', 5, 0, 5));
		comOferta.add('OBR0001');
		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 8,
			situacao: situacao({ optativa: 60 })
		});

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0001', 'OPT0001']);
	});

	it('sem situação, o teto por natureza não existe — comportamento de antes', async () => {
		curso.materias = [
			materiaDaMatriz('OPT0001', 0, 1, 1),
			materiaDaMatriz('OPT0002', 0, 1, 2),
			materiaDaMatriz('OPT0003', 0, 1, 3)
		];
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias).toHaveLength(3);
	});
});

describe('construirMateriasGrade — carimbo de optatória', () => {
	it('marca a optativa que destrava obrigatória pendente', async () => {
		curso.materias = [materiaDaMatriz('OPT0001', 0, 1, 1)];
		todasComOferta();
		optatorias = new Map([['OPT0001', ['OBR0009']]]);

		const [m] = await construirMateriasGrade(['OPT0001'], '2026.2');

		expect(m.optatoria).toBe(true);
	});

	it('não marca quando a obrigatória que ela destrava já foi cursada', async () => {
		curso.materias = [materiaDaMatriz('OPT0001', 0, 1, 1)];
		todasComOferta();
		optatorias = new Map([['OPT0001', ['OBR0009']]]);
		completed.add('OBR0009');

		const [m] = await construirMateriasGrade(['OPT0001'], '2026.2');

		expect(m.optatoria).toBe(false);
	});
});

/**
 * O chamado que motivou este bloco: "minha lista só tem as matérias que eu já
 * curso, e quando desligo as em curso não sobra nada para montar".
 *
 * O orçamento debitava os créditos das matérias em curso SEMPRE. Para quem já
 * cursa perto do teto — o caso comum de quem está com a grade cheia e quer
 * planejar o semestre seguinte — não sobrava crédito nenhum e a semeadura não
 * trazia nem uma obrigatória pendente, mesmo havendo turma ofertada.
 */
describe('orçamento das matérias em curso', () => {
	it('com as em curso NA grade, o crédito delas é debitado', async () => {
		curso.materias = [
			materiaDaMatriz('MATR0001', 1, 0, 1, 20),
			materiaDaMatriz('OBR0001', 2, 0, 2, 4)
		];
		todasComOferta();
		current.add('MATR0001');

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		// 20 em curso + 4 da obrigatória = 24, exatamente no teto.
		expect(r.materias.map((m) => m.codigo)).toEqual(['MATR0001', 'OBR0001']);
	});

	it('estourado o teto pelas em curso, nada mais é recomendado', async () => {
		curso.materias = [
			materiaDaMatriz('MATR0001', 1, 0, 1, 24),
			materiaDaMatriz('OBR0001', 2, 0, 2, 4)
		];
		todasComOferta();
		current.add('MATR0001');

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['MATR0001']);
	});

	/**
	 * O caso do chamado. Com as em curso FORA da montagem elas não vão ocupar a
	 * grade, então cobrar o crédito delas do orçamento deixa o aluno sem nenhuma
	 * sugestão justamente na tela que ele abriu para descobrir o que pegar.
	 */
	it('com as em curso FORA da montagem, o crédito delas não bloqueia a semeadura', async () => {
		curso.materias = [
			materiaDaMatriz('MATR0001', 1, 0, 1, 24),
			materiaDaMatriz('OBR0001', 2, 0, 2, 4),
			materiaDaMatriz('OBR0002', 3, 0, 3, 4)
		];
		todasComOferta();
		current.add('MATR0001');

		const r = await montarPoolRecomendado('2026.2', {
			limiteCreditos: 24,
			cursandoOcupaOrcamento: false
		});

		// A matéria em curso continua na lista — desligar o modo esconde da grade,
		// não apaga a matrícula —, mas agora sobra orçamento para o resto.
		expect(r.materias.map((m) => m.codigo)).toEqual(['MATR0001', 'OBR0001', 'OBR0002']);
	});
});

/**
 * O caso do aluno no fim do curso, que gerou o chamado: a matriz ainda tem
 * dezenas de pendências, mas NENHUMA é ofertada no período — e o Montador
 * culpava o filtro de matérias em curso, mandando-o apertar um botão que não
 * mudaria nada. O número de pendentes sem oferta é o que permite dizer a verdade.
 */
describe('pendentes sem oferta no período', () => {
	it('conta obrigatórias E optativas que não têm turma', async () => {
		curso.materias = [
			materiaDaMatriz('OBR0001', 1, 0, 1),
			materiaDaMatriz('OBR0002', 2, 0, 2),
			materiaDaMatriz('OPT0001', 0, 1, 3),
			materiaDaMatriz('OPT0002', 0, 1, 4)
		];
		comOferta = new Set(); // o período não oferta nada disso

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias).toEqual([]);
		expect(r.pendentesSemOferta).toBe(4);
		// Só as obrigatórias são nomeadas; optativa sem oferta é rotina.
		expect(r.obrigatoriasSemOferta).toEqual(['OBR0001', 'OBR0002']);
	});

	it('não conta quem tem turma', async () => {
		curso.materias = [materiaDaMatriz('OBR0001', 1, 0, 1), materiaDaMatriz('OBR0002', 2, 0, 2)];
		comOferta = new Set(['OBR0001']);

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0001']);
		expect(r.pendentesSemOferta).toBe(1);
	});
});

/**
 * "Já aproveitada como equivalente": OBR0009 está feita e a tabela diz que
 * OPT0002 sozinha a substitui. Cursar OPT0002 não contaria de novo — então ela
 * não é recomendação, nem como complemento da lacuna.
 */
describe('semeadura — equivalente de matéria já feita', () => {
	function equivalencia(origem: string, expressao: string) {
		return { codigoMateriaOrigem: origem, expressao } as never;
	}

	it('optativa que substitui sozinha uma matéria já concluída não é recomendada', async () => {
		curso.materias = [materiaDaMatriz('OPT0001', 0, 1, 1), materiaDaMatriz('OPT0002', 0, 1, 2)];
		curso.equivalencias = [equivalencia('OBR0009', 'OPT0002 OU XYZ0001')];
		completed.add('OBR0009');
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['OPT0001']);
		expect(r.pendentesSemOferta).toBe(0);
	});

	it('vale também para matéria em curso', async () => {
		curso.materias = [materiaDaMatriz('OPT0002', 0, 1, 2)];
		curso.equivalencias = [equivalencia('OBR0009', 'OPT0002')];
		current.add('OBR0009');
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).not.toContain('OPT0002');
	});

	it('metade de um ramo E não é equivalente sozinha: continua recomendada', async () => {
		curso.materias = [materiaDaMatriz('OPT0002', 0, 1, 2)];
		curso.equivalencias = [equivalencia('OBR0009', 'OPT0002 E OPT0003')];
		completed.add('OBR0009');
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['OPT0002']);
	});

	it('vale também para obrigatória equivalente a matéria já concluída', async () => {
		curso.materias = [materiaDaMatriz('OBR0002', 2, 0, 2), materiaDaMatriz('OBR0003', 2, 0, 3)];
		curso.equivalencias = [equivalencia('OBR0009', 'OBR0002')];
		completed.add('OBR0009');
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias.map((m) => m.codigo)).toEqual(['OBR0003']);
		expect(r.obrigatoriasSemOferta).not.toContain('OBR0002');
	});

	it('cursei X fora da matriz e a tabela registra "R equivale a X": R já conta como feita', async () => {
		curso.materias = [materiaDaMatriz('OPT0002', 0, 1, 2)];
		curso.equivalencias = [equivalencia('OPT0002', 'MAT0035')];
		completed.add('MAT0035');
		completed.add('OPT0002'); // o que o fluxogramaStore faz via getCompletedByEquivalenceCodes
		todasComOferta();

		const r = await montarPoolRecomendado('2026.2', { limiteCreditos: 24 });

		expect(r.materias).toEqual([]);
	});

	it('adicionar na mão avisa o motivo em vez de aceitar calado', () => {
		curso.equivalencias = [equivalencia('OBR0009', 'OPT0002')];
		completed.add('OBR0009');

		expect(motivoParaNaoAdicionar('opt0002')).toMatch(/OPT0002 equivale a OBR0009, que você já concluiu/);
	});
});
