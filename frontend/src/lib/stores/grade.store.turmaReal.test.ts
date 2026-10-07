/**
 * Matéria em curso com turma real conhecida (histórico SIGAA) nunca muda de
 * turma na montagem — nem depois de "Limpar a grade", nem num cenário novo, nem
 * quando o cenário salvo apontava outra turma.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { gradeStore, type MateriaGrade } from './grade.store.svelte';
import type { TurmaOferta } from '$lib/services/turmas.service';
import { slotMaskFromHorario } from '$lib/utils/horario-slots';

function turma(id: number, horario: string, docente: string): TurmaOferta {
	return {
		id_turmas: id,
		id_materia: 1,
		turma: String(id),
		docente,
		horario,
		local: null,
		ano_periodo: '2026.2',
		vagas_ofertadas: null,
		vagas_ocupadas: null,
		vagas_sobrando: null
	};
}

function materia(codigo: string, turmas: TurmaOferta[]): MateriaGrade {
	return {
		codigo,
		nome: codigo,
		creditos: 4,
		idMateria: 1,
		natureza: 'obrigatoria',
		turmas: turmas.map((t) => ({ turma: t, mask: slotMaskFromHorario(t.horario) }))
	};
}

// Física: a matrícula real é a 24M12 (Rafael Morgado). As outras turmas são
// "melhores" para as estratégias (sábado/noite livres etc.), o que tentava o
// solver a trocar.
const FISICA = materia('IFD0171', [
	turma(1, '35T23', 'OUTRO PROFESSOR'),
	turma(2, '24M12', 'RAFAEL MORGADO'),
	turma(3, '6M1234', 'TERCEIRO')
]);
const CALCULO = materia('MAT0026', [turma(10, '24M34', 'X'), turma(11, '35M12', 'Y')]);

describe('gradeStore — turma real da matéria em curso', () => {
	beforeEach(() => {
		gradeStore.init([FISICA, CALCULO], { idUser: null, periodo: '2026.2' });
		gradeStore.definirCursandoAtual(['IFD0171']);
		gradeStore.definirTurmasReais({ IFD0171: 2 });
	});

	it('depois de "Limpar a grade", montar devolve a turma real', () => {
		gradeStore.limpar();
		gradeStore.montarAutomatico({ limiteCreditos: 24 });
		expect(gradeStore.turmaSelecionada('IFD0171')?.turma.id_turmas).toBe(2);
	});

	it('todas as opções do assistente usam a turma real', () => {
		gradeStore.limpar();
		const opcoes = gradeStore.montarOpcoes({ limiteCreditos: 24 });
		expect(opcoes.length).toBeGreaterThan(0);
		for (const o of opcoes) {
			expect(o.resultado.selecao.get('IFD0171')?.turma.id_turmas).toBe(2);
		}
	});

	it('num cenário novo a matéria em curso entra na turma real (não some)', () => {
		gradeStore.criarCenario('Nova');
		gradeStore.montarAutomatico({ limiteCreditos: 24 });
		expect(gradeStore.turmaSelecionada('IFD0171')?.turma.id_turmas).toBe(2);
	});

	it('cenário salvo com a turma errada é corrigido para a real', () => {
		gradeStore.init([FISICA, CALCULO], { idUser: null, periodo: '2026.2' });
		gradeStore.selecionarTurma('IFD0171', 1); // seleção antiga errada
		gradeStore.definirCursandoAtual(['IFD0171']);
		gradeStore.definirTurmasReais({ IFD0171: 2 });
		expect(gradeStore.turmaSelecionada('IFD0171')?.turma.id_turmas).toBe(2);
		expect(gradeStore.isTravada('IFD0171')).toBe(true);
	});
});
