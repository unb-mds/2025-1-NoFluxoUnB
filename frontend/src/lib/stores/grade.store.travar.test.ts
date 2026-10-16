import { describe, it, expect, beforeEach } from 'vitest';
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
function materiaComTurmas(codigo: string, creditos: number, bits: number[], baseId: number): MateriaGrade {
	return {
		codigo,
		nome: codigo,
		creditos,
		idMateria: baseId,
		turmas: bits.map((bit, i) => ({ mask: 1n << BigInt(bit), turma: turmaOferta(baseId + i) }))
	};
}

describe('gradeStore — matéria travada (já cursando, turma real escolhida)', () => {
	beforeEach(() => {
		gradeStore.init([], { idUser: null, periodo: '2026.1' });
	});

	it('trava sozinha ao escolher a turma de uma matéria marcada como cursando', () => {
		const materias = [materiaComTurmas('L', 4, [0], 1)];
		gradeStore.init(materias, { idUser: null, periodo: '2026.1' });
		gradeStore.definirCursandoAtual(['L']);

		expect(gradeStore.isTravada('L')).toBe(false);
		gradeStore.selecionarTurma('L', 1);
		expect(gradeStore.isTravada('L')).toBe(true);
	});

	it('"Montar grade" nunca reatribui a turma travada e evita conflito com ela', () => {
		// L (travada) só tem turma no bit 0. B (livre) tem duas opções: uma no
		// mesmo bit 0 (colidiria com L) e outra no bit 1 (livre).
		const materias = [
			materiaComTurmas('L', 4, [0], 1),
			materiaComTurmas('B', 4, [0, 1], 10)
		];
		gradeStore.init(materias, { idUser: null, periodo: '2026.1' });
		gradeStore.definirCursandoAtual(['L']);
		gradeStore.selecionarTurma('L', 1); // trava com a turma id=1 (bit 0)

		gradeStore.montarAutomatico();

		expect(gradeStore.turmaSelecionada('L')?.turma.id_turmas).toBe(1);
		// B só podia entrar pela turma do bit 1 (id=11) — a do bit 0 (id=10) colide com L.
		expect(gradeStore.turmaSelecionada('B')?.turma.id_turmas).toBe(11);
	});

	it('destrava ao remover a turma manualmente ou remover a matéria do pool', () => {
		const materias = [materiaComTurmas('L', 4, [0], 1), materiaComTurmas('M', 4, [1], 10)];
		gradeStore.init(materias, { idUser: null, periodo: '2026.1' });
		gradeStore.definirCursandoAtual(['L', 'M']);
		gradeStore.selecionarTurma('L', 1);
		gradeStore.selecionarTurma('M', 10);
		expect(gradeStore.isTravada('L')).toBe(true);
		expect(gradeStore.isTravada('M')).toBe(true);

		gradeStore.removerTurma('L');
		expect(gradeStore.isTravada('L')).toBe(false);

		gradeStore.removerMateriaDoPool('M');
		expect(gradeStore.isTravada('M')).toBe(false);
		expect(gradeStore.isCursandoAtual('M')).toBe(false);
	});

	it('o slider de créditos nunca tira uma matéria travada, mesmo passando do limite', () => {
		const materias = [materiaComTurmas('L', 10, [0], 1)];
		gradeStore.init(materias, { idUser: null, periodo: '2026.1' });
		gradeStore.definirCursandoAtual(['L']);
		gradeStore.selecionarTurma('L', 1);

		gradeStore.ajustarParaLimite(2);

		expect(gradeStore.turmaSelecionada('L')?.turma.id_turmas).toBe(1);
		expect(gradeStore.creditosSelecionados).toBe(10);
	});

	/**
	 * O relato: "escolho as turmas certas, aperto Montar grade e ele apaga tudo".
	 * A trava valia só para matéria em curso, então tudo que o aluno escolhia na mão
	 * para uma matéria nova era matéria-prima livre para o solver reatribuir.
	 */
	it('trava sozinha ao escolher a turma na mão, mesmo sem estar cursando', () => {
		gradeStore.init([materiaComTurmas('N', 4, [0], 1)], { idUser: null, periodo: '2026.1' });

		expect(gradeStore.isCursandoAtual('N')).toBe(false);
		gradeStore.selecionarTurma('N', 1);

		expect(gradeStore.isTravada('N')).toBe(true);
	});

	it('"Montar grade" preserva a escolha manual e só preenche o que sobrou', () => {
		// N: escolhida na mão na turma do bit 1 (id 2), tendo também a do bit 0.
		// O solver, solto, preferiria remexer; e C só cabe no bit 5.
		const materias = [materiaComTurmas('N', 4, [0, 1], 1), materiaComTurmas('C', 4, [5], 10)];
		gradeStore.init(materias, { idUser: null, periodo: '2026.1' });
		gradeStore.selecionarTurma('N', 2);

		gradeStore.montarAutomatico();

		expect(gradeStore.turmaSelecionada('N')?.turma.id_turmas).toBe(2);
		expect(gradeStore.turmaSelecionada('C')?.turma.id_turmas).toBe(10);
	});

	/**
	 * "Limpar" esvaziava a grade mas deixava `travadas` cheio. Matéria travada fica
	 * FORA do solver (a turma dela seria fixa) e, sem seleção, também fora da grade:
	 * ela sumia da montagem seguinte sem deixar rastro.
	 */
	it('limpar destrava tudo, senão a matéria some da montagem seguinte', () => {
		gradeStore.init([materiaComTurmas('N', 4, [0], 1)], { idUser: null, periodo: '2026.1' });
		gradeStore.selecionarTurma('N', 1);
		expect(gradeStore.isTravada('N')).toBe(true);

		gradeStore.limpar();
		expect(gradeStore.isTravada('N')).toBe(false);

		gradeStore.montarAutomatico();
		expect(gradeStore.turmaSelecionada('N')?.turma.id_turmas).toBe(1);
	});

	/**
	 * Regressão: `OpcaoGrade.resultado.selecao` (de `montarOpcoes`) nunca inclui
	 * travadas — elas são horário pré-ocupado passado pro solver via máscara, não
	 * candidatas dele. `popularOpcoes`/`aplicarSelecao` têm que mesclar a travada de
	 * volta, senão aplicar uma opção apaga a matéria travada da grade.
	 */
	it('popularOpcoes preserva a matéria travada em cada cenário gerado', () => {
		const materias = [
			materiaComTurmas('L', 4, [0], 1), // travada no bit 0
			materiaComTurmas('C', 4, [1], 10) // livre, só cabe no bit 1
		];
		gradeStore.init(materias, { idUser: null, periodo: '2026.1' });
		gradeStore.definirCursandoAtual(['L']);
		gradeStore.selecionarTurma('L', 1);
		expect(gradeStore.isTravada('L')).toBe(true);

		const opcoes = gradeStore.montarOpcoes();
		expect(opcoes.length).toBeGreaterThan(0);
		gradeStore.popularOpcoes(opcoes);

		const geradas = gradeStore.grades.filter((g) => g.origem === 'opcao-solver');
		expect(geradas.length).toBeGreaterThan(0);
		for (const cenario of geradas) {
			expect(cenario.selecao['L']).toBe(1);
		}

		gradeStore.selecionarCenario(geradas[0].id);
		expect(gradeStore.turmaSelecionada('L')?.turma.id_turmas).toBe(1);
		expect(gradeStore.turmaSelecionada('C')?.turma.id_turmas).toBe(10);
	});

	it('aplicarSelecao preserva a matéria travada ao aplicar uma seleção sem ela (ex.: vinda do chat)', () => {
		const materias = [
			materiaComTurmas('L', 4, [0], 1), // travada no bit 0
			materiaComTurmas('C', 4, [1], 10)
		];
		gradeStore.init(materias, { idUser: null, periodo: '2026.1' });
		gradeStore.definirCursandoAtual(['L']);
		gradeStore.selecionarTurma('L', 1);

		// Simula o que `opcaoGrade.selecao` do chat traria: só a matéria livre.
		gradeStore.aplicarSelecao({ C: 10 });

		expect(gradeStore.turmaSelecionada('L')?.turma.id_turmas).toBe(1);
		expect(gradeStore.turmaSelecionada('C')?.turma.id_turmas).toBe(10);
	});
});
