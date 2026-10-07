/**
 * Montador de Grade — a grade montada tem de fazer sentido para o aluno:
 * - matéria com pré-requisito pendente não é proposta pela montagem automática
 *   (a matrícula seria recusada), salvo se for a `essencial` que ele pediu;
 * - entre duas matérias do mesmo degrau que disputam o horário, a mais atrasada
 *   na matriz ganha (`fatorAtraso`), sem nunca trocar mais matérias por uma só.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$lib/stores/fluxograma.store.svelte', () => ({
	fluxogramaStore: {
		get optatorias() {
			return new Map<string, string[]>();
		},
		get completedCodes() {
			return new Set<string>();
		},
		get state() {
			return { courseData: { preRequisitos: [] } };
		}
	}
}));

import {
	gradeStore,
	fatorAtraso,
	ATRASO_MAX,
	FATOR_ENTRE_DEGRAUS,
	type MateriaGrade
} from './grade.store.svelte';
import { slotMaskFromHorario } from '$lib/utils/horario-slots';

let seq = 0;

function materia(
	codigo: string,
	horarios: string[],
	extra: Partial<MateriaGrade> = {}
): MateriaGrade {
	const base = ++seq * 100;
	return {
		codigo,
		nome: codigo,
		creditos: 4,
		idMateria: base,
		natureza: 'obrigatoria',
		turmas: horarios.map((h, i) => ({
			mask: slotMaskFromHorario(h),
			turma: { id_turmas: base + i, horario: h, turma: String(i + 1), docente: null } as never
		})),
		...extra
	};
}

beforeEach(() => {
	seq = 0;
	gradeStore.definirCursandoAtual([]);
	gradeStore.definirSituacao(null);
	gradeStore.init([], { idUser: null, periodo: '2026.2' });
	gradeStore.setTurnos(['M', 'T', 'N']);
});

describe('pré-requisito pendente fica fora da montagem automática', () => {
	it('não entra na grade, mas continua na lista', () => {
		const ok = materia('OK0001', ['2M12']);
		const pend = materia('PEND0001', ['3M12'], { nivelPreRequisito: 'pendente' });
		gradeStore.init([ok, pend], { idUser: null, periodo: '2026.2' });

		const r = gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect(gradeStore.selecao.has('OK0001')).toBe(true);
		expect(gradeStore.selecao.has('PEND0001')).toBe(false);
		expect(gradeStore.pool.some((m) => m.codigo === 'PEND0001')).toBe(true);
		expect(r.candidatas).toBe(1);
	});

	it('dependência "em curso" continua entrando', () => {
		const emCurso = materia('DEP0001', ['3M12'], { nivelPreRequisito: 'em-curso' });
		gradeStore.init([emCurso], { idUser: null, periodo: '2026.2' });

		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect(gradeStore.selecao.has('DEP0001')).toBe(true);
	});

	it('a essencial entra mesmo com pré-requisito pendente (o aluno pediu)', () => {
		const pend = materia('PEND0001', ['3M12'], { nivelPreRequisito: 'pendente' });
		gradeStore.init([pend], { idUser: null, periodo: '2026.2' });

		gradeStore.montarAutomatico({ limiteCreditos: 24, essencial: 'PEND0001' });

		expect(gradeStore.selecao.has('PEND0001')).toBe(true);
	});

	it('montarOpcoes segue a mesma regra', () => {
		const ok = materia('OK0001', ['2M12']);
		const pend = materia('PEND0001', ['3M12'], { nivelPreRequisito: 'pendente' });
		gradeStore.init([ok, pend], { idUser: null, periodo: '2026.2' });

		const opcoes = gradeStore.montarOpcoes({ limiteCreditos: 24 });

		expect(opcoes.length).toBeGreaterThan(0);
		for (const o of opcoes) expect(o.resultado.selecao.has('PEND0001')).toBe(false);
	});
});

describe('desempate por atraso na matriz', () => {
	it('fatorAtraso: 1º semestre vale mais, sem nível não ganha nada, nunca passa do teto', () => {
		expect(fatorAtraso(1)).toBeCloseTo(1 + ATRASO_MAX);
		expect(fatorAtraso(2)).toBeGreaterThan(fatorAtraso(7));
		expect(fatorAtraso(undefined)).toBe(1);
		expect(fatorAtraso(0)).toBe(1);
		expect(fatorAtraso(99)).toBe(1);
		// Duas matérias de um degrau sempre valem mais que uma só, por mais atrasada.
		expect(2 * fatorAtraso(99)).toBeGreaterThan(fatorAtraso(1));
		// E nunca cruza degrau num pool que caiba na tela.
		expect(200 * fatorAtraso(1)).toBeLessThan(FATOR_ENTRE_DEGRAUS);
	});

	it('entre duas obrigatórias no mesmo horário, fica a mais atrasada', () => {
		// A de nível 7 vem primeiro na lista de propósito: sem o desempate, a
		// ordem da lista decidiria.
		const avancada = materia('OBR0007', ['2M12'], { nivel: 7 });
		const atrasada = materia('OBR0002', ['2M12'], { nivel: 2 });
		gradeStore.init([avancada, atrasada], { idUser: null, periodo: '2026.2' });

		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect(gradeStore.selecao.has('OBR0002')).toBe(true);
		expect(gradeStore.selecao.has('OBR0007')).toBe(false);
	});

	it('o atraso não troca duas matérias por uma', () => {
		// OBR0001 (nível 1) colide com duas de nível 8 que cabem juntas.
		const atrasada = materia('OBR0001', ['2M1234'], { nivel: 1 });
		const a = materia('OBR0008', ['2M12'], { nivel: 8 });
		const b = materia('OBR0009', ['2M34'], { nivel: 8 });
		gradeStore.init([atrasada, a, b], { idUser: null, periodo: '2026.2' });

		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect([...gradeStore.selecao.keys()].sort()).toEqual(['OBR0008', 'OBR0009']);
	});

	it('o atraso não faz optativa passar na frente de obrigatória', () => {
		const obrig = materia('OBR0009', ['2M12'], { nivel: 9 });
		const opt = materia('OPT0001', ['2M12'], { natureza: 'optativa', nivel: 1 });
		gradeStore.init([opt, obrig], { idUser: null, periodo: '2026.2' });

		gradeStore.montarAutomatico({ limiteCreditos: 24 });

		expect(gradeStore.selecao.has('OBR0009')).toBe(true);
	});
});
