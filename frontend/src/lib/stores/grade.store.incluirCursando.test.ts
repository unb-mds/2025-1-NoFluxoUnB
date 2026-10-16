/**
 * Montador de Grade — o aluno escolhe se as matriculadas entram.
 *
 * O Montador deixou de dizer que semestre monta: ele monta uma grade com a oferta
 * real mais recente. Como consequência, "matrícula em curso é intocável" virou uma
 * OPÇÃO em vez de uma lei — ligada por padrão, porque na maioria das vezes o aluno
 * quer ver a semana dele inteira; desligável porque, quando ele está olhando o que
 * pegar depois, a matrícula atual só ocupa espaço.
 *
 * A auditoria prática que motivou isto: em 24 alunos reais, 83 das 124 matérias
 * montadas (67%) eram matérias já em curso, e num deles a grade era 100% disso —
 * com 13 obrigatórias ofertadas de fora.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { gradeStore, type MateriaGrade } from './grade.store.svelte';
import { slotMaskFromHorario } from '$lib/utils/horario-slots';

let seq = 0;

function mat(codigo: string, horarios: string[], creditos = 4): MateriaGrade {
	const base = ++seq * 100;
	return {
		codigo,
		nome: codigo,
		creditos,
		idMateria: base,
		natureza: 'obrigatoria',
		turmas: horarios.map((h, i) => ({
			mask: slotMaskFromHorario(h),
			turma: { id_turmas: base + i, horario: h, turma: String(i + 1).padStart(2, '0') } as never
		}))
	};
}

const sel = () => [...gradeStore.selecao.keys()].sort();

function init(pool: MateriaGrade[]): void {
	gradeStore.init(pool, { idUser: null, periodo: '2026.2' });
}

beforeEach(() => {
	seq = 0;
	gradeStore.definirCursandoAtual([]);
	gradeStore.setIncluirCursando(true);
	init([]);
});

describe('incluirCursando — ligado (padrão)', () => {
	it('vem ligado por padrão', () => {
		expect(gradeStore.incluirCursando).toBe(true);
	});

	it('a matriculada entra na grade e é intocável, como sempre foi', () => {
		init([mat('MATR0001', ['2M12']), mat('NOVA0001', ['2M12', '3T12'])]);
		gradeStore.definirCursandoAtual(['MATR0001']);

		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect(sel()).toEqual(['MATR0001', 'NOVA0001']);
		// A nova cedeu o horário para a matriculada.
		expect(gradeStore.selecao.get('NOVA0001')?.turma.horario).toBe('3T12');
	});

	it('a matriculada estoura o teto de créditos em vez de sair', () => {
		init([mat('MATR0001', ['2M12'], 6), mat('MATR0002', ['3M12'], 6)]);
		gradeStore.definirCursandoAtual(['MATR0001', 'MATR0002']);

		gradeStore.montarAutomatico({ limiteCreditos: 4 });

		expect(sel()).toEqual(['MATR0001', 'MATR0002']);
		expect(gradeStore.creditosSelecionados).toBe(12);
	});

	it('o slider não derruba matriculada', () => {
		init([mat('MATR0001', ['2M12'], 6), mat('NOVA0001', ['3M12'], 4)]);
		gradeStore.definirCursandoAtual(['MATR0001']);
		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		gradeStore.ajustarParaLimite(4);

		expect(gradeStore.selecao.has('MATR0001')).toBe(true);
	});
});

describe('incluirCursando — desligado', () => {
	it('a matriculada não entra na grade', () => {
		init([mat('MATR0001', ['2M12']), mat('NOVA0001', ['3T12'])]);
		gradeStore.definirCursandoAtual(['MATR0001']);
		gradeStore.setIncluirCursando(false);

		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect(sel()).toEqual(['NOVA0001']);
	});

	it('libera o horário: a nova fica com a turma que a matriculada ocupava', () => {
		init([mat('MATR0001', ['2M12']), mat('NOVA0001', ['2M12', '3T12'])]);
		gradeStore.definirCursandoAtual(['MATR0001']);
		gradeStore.setIncluirCursando(false);

		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect(sel()).toEqual(['NOVA0001']);
		// Sem a matriculada ocupando 2M12, a preferida volta a ser a primeira turma.
		expect(gradeStore.selecao.get('NOVA0001')?.turma.horario).toBe('2M12');
	});

	it('libera o orçamento: o teto passa a valer só para as novas', () => {
		init([
			mat('MATR0001', ['2M12'], 6),
			mat('NOVA0001', ['3M12'], 4),
			mat('NOVA0002', ['4M12'], 4)
		]);
		gradeStore.definirCursandoAtual(['MATR0001']);
		gradeStore.setIncluirCursando(false);

		gradeStore.montarAutomatico({ limiteCreditos: 8 });

		expect(sel()).toEqual(['NOVA0001', 'NOVA0002']);
		expect(gradeStore.creditosSelecionados).toBe(8);
	});

	it('o slider pode derrubar a matriculada que ficou selecionada', () => {
		init([mat('MATR0001', ['2M12'], 6), mat('NOVA0001', ['3M12'], 4)]);
		gradeStore.definirCursandoAtual(['MATR0001']);
		gradeStore.montarAutomatico({ limiteCreditos: 24 });
		expect(gradeStore.selecao.has('MATR0001')).toBe(true);

		gradeStore.setIncluirCursando(false);
		gradeStore.ajustarParaLimite(4);

		expect(gradeStore.selecao.has('MATR0001')).toBe(false);
		expect(gradeStore.selecao.has('NOVA0001')).toBe(true);
	});

	it('a trava da turma real não vale enquanto o modo está desligado', () => {
		init([mat('MATR0001', ['2M12', '5T12'])]);
		gradeStore.definirCursandoAtual(['MATR0001']);
		gradeStore.selecionarTurma('MATR0001', gradeStore.pool[0].turmas[0].turma.id_turmas);
		expect(gradeStore.isTravada('MATR0001')).toBe(true);

		gradeStore.setIncluirCursando(false);

		expect(gradeStore.isTravada('MATR0001')).toBe(false);
	});

	it('religar devolve a matriculada sem perder a informação', () => {
		init([mat('MATR0001', ['2M12']), mat('NOVA0001', ['3T12'])]);
		gradeStore.definirCursandoAtual(['MATR0001']);

		gradeStore.setIncluirCursando(false);
		gradeStore.montarAutomatico({ limiteCreditos: 24 });
		expect(sel()).toEqual(['NOVA0001']);

		gradeStore.setIncluirCursando(true);
		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect(sel()).toEqual(['MATR0001', 'NOVA0001']);
		expect(gradeStore.isCursandoAtual('MATR0001')).toBe(true);
	});

	it('sem matrícula nenhuma, ligar ou desligar dá na mesma', () => {
		const pool = () => [mat('OBR0001', ['2M12']), mat('OBR0002', ['3M12'])];

		init(pool());
		gradeStore.montarAutomatico({ limiteCreditos: 24 });
		const ligado = sel().join(',');

		seq = 0;
		init(pool());
		gradeStore.setIncluirCursando(false);
		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect(sel().join(',')).toBe(ligado);
	});
});

describe('planejar o próximo semestre (modo desligado) com essencial', () => {
	// Chamado: "pedi a grade focada na FGA0211 e ele focou nas matérias já
	// matriculadas". Com a matrícula ocupando a carga, a essencial entrava sozinha
	// ao lado dela. Para o semestre seguinte a matrícula conta como feita.
	it('a essencial entra com as outras novas, sem a matrícula atual', () => {
		init([
			mat('MATR0001', ['2M12'], 6),
			mat('MATR0002', ['3M12'], 6),
			mat('MATR0003', ['4M12'], 6),
			mat('FGA0211', ['2M12', '5T12'], 4),
			mat('NOVA0001', ['3M12'], 4),
			mat('NOVA0002', ['4M12'], 4)
		]);
		gradeStore.definirCursandoAtual(['MATR0001', 'MATR0002', 'MATR0003']);
		gradeStore.setIncluirCursando(false);

		const opcoes = gradeStore.montarOpcoes({ limiteCreditos: 12, essencial: 'FGA0211' });

		expect(opcoes.length).toBeGreaterThan(0);
		for (const o of opcoes) {
			expect([...o.resultado.selecao.keys()].sort()).toEqual(['FGA0211', 'NOVA0001', 'NOVA0002']);
		}
	});
});
