import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MateriaModel } from '$lib/types/materia';

/**
 * As candidatas a módulo livre.
 *
 * Módulo livre é definido por AUSÊNCIA — é qualquer componente do catálogo da UnB
 * que não está na matriz do aluno. Isso é o catálogo inteiro da universidade, e é
 * por isso que a busca exige um tema: não existe "listar o módulo livre", só
 * "procurar módulo livre sobre alguma coisa".
 */
const curso = {
	materias: [] as MateriaModel[],
	preRequisitos: [] as unknown[],
	coRequisitos: [] as unknown[],
	equivalencias: [] as unknown[]
};
const completed = new Set<string>();
const current = new Set<string>();
let comOferta = new Set<string>();
/** O que a busca global do catálogo devolve para o termo do teste. */
let achados: Array<{ idMateria: number; codigo: string; nome: string; creditos: number }> = [];
/** Termos que chegaram na busca — para provar que nem sempre se busca. */
let termosBuscados: string[] = [];

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
			return new Map<string, string[]>();
		}
	}
}));

vi.mock('$lib/services/materias.service', () => ({
	searchMaterias: async (q: string) => {
		termosBuscados.push(`literal:${q}`);
		return achados;
	},
	getMateriasByCodigos: async (codigos: string[]) =>
		achados.filter((a) => codigos.includes(a.codigo))
}));

/** A busca semântica do backend responde? `false` = backend fora. */
let semanticaDisponivel = true;

vi.mock('$lib/services/modulo-livre.service', () => ({
	buscarSugestoesModuloLivre: async (tema: string) => {
		if (!semanticaDisponivel) return { materias: [], aviso: null, falhou: true };
		termosBuscados.push(`semantica:${tema}`);
		return {
			materias: achados.map((a) => ({ codigo: a.codigo, nome: a.nome })),
			aviso: null,
			falhou: false
		};
	}
}));

vi.mock('$lib/services/oferta-turmas.service', () => ({
	getOfertaComEquivalencia: async (materias: Array<{ codigo: string }>) =>
		new Map(
			materias.map((m) => [
				m.codigo,
				comOferta.has(m.codigo)
					? [{ turma: { id_turmas: 1, horario: '2M12' }, codigoOfertado: undefined }]
					: []
			])
		)
}));

const { candidatosModuloLivre } = await import('./grade-pool.service');

function materiaDaMatriz(codigo: string, idMateria: number): MateriaModel {
	return {
		codigoMateria: codigo,
		nomeMateria: codigo,
		idMateria,
		nivel: 1,
		tipoNatureza: 0,
		creditos: 4,
		ementa: ''
	} as unknown as MateriaModel;
}

function noCatalogo(...codigos: string[]): void {
	achados = codigos.map((codigo, i) => ({
		idMateria: 900 + i,
		codigo,
		nome: codigo,
		creditos: 4
	}));
}

beforeEach(() => {
	curso.materias = [];
	curso.preRequisitos = [];
	curso.equivalencias = [];
	completed.clear();
	current.clear();
	comOferta = new Set();
	achados = [];
	termosBuscados = [];
	semanticaDisponivel = true;
});

describe('candidatosModuloLivre', () => {
	it('traz matéria de fora da matriz que tem turma no período', async () => {
		noCatalogo('MUS0033');
		comOferta = new Set(['MUS0033']);

		const r = await candidatosModuloLivre('música', '2026.2');

		expect(r.map((m) => m.codigo)).toEqual(['MUS0033']);
		expect(r[0].natureza).toBe('modulo_livre');
	});

	/**
	 * A busca varre o catálogo inteiro, então ela devolve também as matérias do
	 * próprio curso do aluno. Deixá-las passar apresentaria a obrigatória dele como
	 * "módulo livre" — o oposto do que a etiqueta significa.
	 */
	it('descarta o que já é da matriz do aluno', async () => {
		curso.materias = [materiaDaMatriz('CIC0004', 1)];
		noCatalogo('CIC0004', 'MUS0033');
		comOferta = new Set(['CIC0004', 'MUS0033']);

		const r = await candidatosModuloLivre('computação', '2026.2');

		expect(r.map((m) => m.codigo)).toEqual(['MUS0033']);
	});

	/**
	 * MAT0035 substitui sozinha uma matéria da matriz que o aluno já concluiu:
	 * cursá-la como módulo livre repetiria um conteúdo já aproveitado.
	 */
	it('descarta a equivalente de uma matéria já concluída', async () => {
		curso.materias = [materiaDaMatriz('MAT1234', 1)];
		curso.equivalencias = [{ codigoMateriaOrigem: 'MAT1234', expressao: 'MAT0035' }];
		completed.add('MAT1234');
		noCatalogo('MAT0035', 'MUS0033');
		comOferta = new Set(['MAT0035', 'MUS0033']);

		const r = await candidatosModuloLivre('matemática', '2026.2');

		expect(r.map((m) => m.codigo)).toEqual(['MUS0033']);
	});

	it('descarta o que o aluno já cursou', async () => {
		noCatalogo('MUS0033', 'LIP0096');
		comOferta = new Set(['MUS0033', 'LIP0096']);
		completed.add('MUS0033');

		const r = await candidatosModuloLivre('cultura', '2026.2');

		expect(r.map((m) => m.codigo)).toEqual(['LIP0096']);
	});

	it('descarta o que o aluno já está cursando', async () => {
		noCatalogo('MUS0033', 'LIP0096');
		comOferta = new Set(['MUS0033', 'LIP0096']);
		current.add('LIP0096');

		const r = await candidatosModuloLivre('cultura', '2026.2');

		expect(r.map((m) => m.codigo)).toEqual(['MUS0033']);
	});

	/** Sem turma no período a matéria não vira bloco no calendário — não serve. */
	it('descarta quem não tem turma neste período', async () => {
		noCatalogo('MUS0033', 'LIP0096');
		comOferta = new Set(['LIP0096']);

		const r = await candidatosModuloLivre('cultura', '2026.2');

		expect(r.map((m) => m.codigo)).toEqual(['LIP0096']);
	});

	it('respeita a lista de exclusão de quem já está na grade', async () => {
		noCatalogo('MUS0033', 'LIP0096');
		comOferta = new Set(['MUS0033', 'LIP0096']);

		const r = await candidatosModuloLivre('cultura', '2026.2', ['MUS0033']);

		expect(r.map((m) => m.codigo)).toEqual(['LIP0096']);
	});

	/**
	 * Sem tema não há o que procurar, e um tema curto demais varreria o catálogo
	 * inteiro. Devolver lista vazia sem consultar o banco é mais honesto do que
	 * apresentar as primeiras matérias em ordem de código como "recomendação".
	 */
	it('não busca nada com tema vazio', async () => {
		const r = await candidatosModuloLivre('   ', '2026.2');

		expect(r).toEqual([]);
		expect(termosBuscados).toEqual([]);
	});

	it('usa a busca semântica quando ela responde', async () => {
		noCatalogo('MUS0033');
		comOferta = new Set(['MUS0033']);

		await candidatosModuloLivre('robótica', '2026.2');

		expect(termosBuscados).toContain('semantica:robótica');
		expect(termosBuscados).not.toContain('literal:robótica');
	});

	/**
	 * Backend fora é situação real — o próprio Montador já convive com o plano de
	 * formatura falhando por rede. Sem a reserva, uma queda transformaria "não
	 * consegui procurar" em "não existe nada sobre esse tema", que é pior: manda o
	 * aluno desistir de uma carga que ele ainda precisa cumprir.
	 */
	it('cai na busca literal do catálogo quando a semântica falha', async () => {
		noCatalogo('MUS0033');
		comOferta = new Set(['MUS0033']);
		semanticaDisponivel = false;

		const r = await candidatosModuloLivre('robótica', '2026.2');

		expect(termosBuscados).toContain('literal:robótica');
		expect(r.map((m) => m.codigo)).toEqual(['MUS0033']);
	});
});
