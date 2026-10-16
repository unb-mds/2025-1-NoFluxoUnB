import { describe, it, expect, beforeEach, vi } from 'vitest';
import { gradeStore, type MateriaGrade } from './grade.store.svelte';
import type { TurmaOferta } from '$lib/services/turmas.service';

function turmaOferta(id: number): TurmaOferta {
	return {
		id_turmas: id,
		id_materia: id,
		turma: 'A',
		docente: null,
		horario: null,
		local: null,
		ano_periodo: '2026.1',
		vagas_ofertadas: null,
		vagas_ocupadas: null,
		vagas_sobrando: null
	};
}

/** Matéria com uma turma por bit informado — `bits` vira uma turma por posição. */
function materiaComTurmas(
	codigo: string,
	creditos: number,
	bits: number[],
	baseId: number
): MateriaGrade {
	return {
		codigo,
		nome: codigo,
		creditos,
		idMateria: baseId,
		turmas: bits.map((bit, i) => ({ mask: 1n << BigInt(bit), turma: turmaOferta(baseId + i) }))
	};
}

describe('gradeStore — limparTudo e resetarParaInicio', () => {
	beforeEach(() => {
		gradeStore.init([], { idUser: null, periodo: '2026.1' });
	});

	it('limparTudo esvazia lista e grade, marca tudo como removida e volta a um só cenário', () => {
		const materias = [materiaComTurmas('A', 4, [0], 1), materiaComTurmas('B', 4, [1], 10)];
		gradeStore.init(materias, { idUser: null, periodo: '2026.1' });
		gradeStore.definirCursandoAtual(['A']);
		gradeStore.selecionarTurma('A', 1); // trava por ser cursando
		gradeStore.togglePrioridade('B');
		gradeStore.criarCenario('Grade 2');

		gradeStore.limparTudo();

		expect(gradeStore.pool).toHaveLength(0);
		expect(gradeStore.selecao.size).toBe(0);
		expect(gradeStore.grades).toHaveLength(1);
		// Removida: o reload da página não pode re-semear o que o aluno apagou.
		// 'A' é matrícula em curso e fica de fora — ver o teste dedicado abaixo.
		expect(gradeStore.dispensadas.has('B')).toBe(true);
		expect(gradeStore.temPrioritarias).toBe(false);
		expect(gradeStore.isTravada('A')).toBe(false);
	});

	/**
	 * Matrícula em curso é fato consumado, não sugestão: "Limpar tudo" esvazia a
	 * tela, mas não pode apagar do próximo carregamento uma matéria em que o aluno
	 * JÁ está matriculado. Antes disso, `dispensadas` engolia as MATR e a rota
	 * (`montar()`) as filtrava para sempre — o aluno recarregava a página e as
	 * matérias que ele cursa de verdade simplesmente não estavam mais na lista.
	 */
	it('limparTudo não marca como removida uma matéria que o aluno está cursando', () => {
		const materias = [materiaComTurmas('A', 4, [0], 1), materiaComTurmas('B', 4, [1], 10)];
		gradeStore.init(materias, { idUser: null, periodo: '2026.1' });
		gradeStore.definirCursandoAtual(['A']);

		gradeStore.limparTudo();

		expect(gradeStore.dispensadas.has('A')).toBe(false);
		expect(gradeStore.dispensadas.has('B')).toBe(true);
	});

	it('resetarParaInicio zera dispensadas/prioridades/turnos e aplica pool + seleção reconciliada', () => {
		gradeStore.init([materiaComTurmas('A', 4, [0], 1)], { idUser: null, periodo: '2026.1' });
		gradeStore.removerMateriaDoPool('A');
		gradeStore.toggleTurno('N');
		expect(gradeStore.dispensadas.has('A')).toBe(true);
		expect(gradeStore.temFiltroTurno).toBe(true);

		// A e B disputam o mesmo horário (bit 0): a seleção inicial só mantém A.
		const pool = [materiaComTurmas('A', 4, [0], 1), materiaComTurmas('B', 4, [0], 10)];
		gradeStore.resetarParaInicio(pool, { A: 1, B: 10 });

		expect(gradeStore.pool.map((m) => m.codigo)).toEqual(['A', 'B']);
		expect(gradeStore.dispensadas.size).toBe(0);
		expect(gradeStore.temFiltroTurno).toBe(false);
		expect(gradeStore.grades).toHaveLength(1);
		expect(gradeStore.turmaSelecionada('A')?.turma.id_turmas).toBe(1);
		expect(gradeStore.turmaSelecionada('B')).toBeUndefined();
	});

	it('depois do reset, matéria removida antes pode voltar ao pool normalmente', () => {
		gradeStore.init([materiaComTurmas('A', 4, [0], 1)], { idUser: null, periodo: '2026.1' });
		gradeStore.limparTudo();
		expect(gradeStore.dispensadas.has('A')).toBe(true);

		gradeStore.resetarParaInicio([materiaComTurmas('A', 4, [0], 1)]);
		expect(gradeStore.hasMateria('A')).toBe(true);
		expect(gradeStore.dispensadas.has('A')).toBe(false);
	});
});

describe('compatibilidade: cache com o nome antigo "removidas"', () => {
	it('lerDispensadasSalvo e o init leem o campo antigo', async () => {
		const mem = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => mem.get(k) ?? null,
			setItem: (k: string, v: string) => void mem.set(k, v),
			removeItem: (k: string) => void mem.delete(k)
		});
		mem.set(
			'nofluxo:grade:9:2026.2:cenarios',
			JSON.stringify({ grades: [], activeId: '', removidas: ['FGA0060'] })
		);
		const { lerDispensadasSalvo, gradeStore } = await import('./grade.store.svelte');
		expect(lerDispensadasSalvo(9, '2026.2')).toEqual(['FGA0060']);
		gradeStore.init([], { idUser: 9, periodo: '2026.2' });
		expect([...gradeStore.dispensadas]).toEqual(['FGA0060']);
		vi.unstubAllGlobals();
	});
});
