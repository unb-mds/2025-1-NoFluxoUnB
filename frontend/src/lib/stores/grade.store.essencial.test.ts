/**
 * Montador de Grade — matéria `essencial` (Fase 1(a)/(c) do plano
 * `montador-de-grade-resilient-muffin`): a disciplina que o aluno marca no
 * Passo 1 do wizard como "nunca pode ficar de fora". `montarAutomatico` e
 * `montarOpcoes` marcam `essencial`/`obrigatoria` na `MateriaTurmas` certa (o
 * mecanismo de garantia em si — peso dinamicamente dominante — mora em
 * `horario-slots.ts`, já testado lá); aqui testamos que o STORE monta o
 * contexto certo para `diagnosticarEssenciais` quando, mesmo assim, ela não
 * coube, e os métodos novos da Facade (`montarOpcoes`/`popularOpcoes`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `pendenciasPreRequisitoDe` (privada do store) lê `fluxogramaStore.completedCodes`
 * e `fluxogramaStore.state.courseData.preRequisitos` — mock com estado mutável
 * por teste, no mesmo padrão de `grade.store.montagemVazia.test.ts`.
 */
let mockCompletedCodes = new Set<string>();
let mockPreRequisitos: Array<{
	idMateria: number;
	idPreRequisito: number;
	idMateriaRequisito: number | null;
	codigoMateriaRequisito: string;
	nomeMateriaRequisito: string;
	expressaoLogica?: unknown;
}> = [];

vi.mock('$lib/stores/fluxograma.store.svelte', () => ({
	fluxogramaStore: {
		get optatorias() {
			return new Map<string, string[]>();
		},
		get completedCodes() {
			return mockCompletedCodes;
		},
		get state() {
			return { courseData: { preRequisitos: mockPreRequisitos } };
		}
	}
}));

import { gradeStore, type MateriaGrade } from './grade.store.svelte';
import { slotMaskFromHorario } from '$lib/utils/horario-slots';

let seq = 0;

/** Matéria com uma turma por horário informado. `horarios` vazio = sem oferta. */
function materia(codigo: string, horarios: string[], creditos = 4): MateriaGrade {
	const base = ++seq * 100;
	return {
		codigo,
		nome: codigo,
		creditos,
		idMateria: base,
		turmas: horarios.map((h, i) => ({
			mask: slotMaskFromHorario(h),
			turma: { id_turmas: base + i, horario: h, turma: String(i + 1), docente: null } as never
		}))
	};
}

beforeEach(() => {
	seq = 0;
	mockCompletedCodes = new Set<string>();
	mockPreRequisitos = [];
	gradeStore.definirCursandoAtual([]);
	gradeStore.definirSituacao(null);
	gradeStore.init([], { idUser: null, periodo: '2026.2' });
	gradeStore.setTurnos(['M', 'T', 'N']);
});

describe('montarAutomatico — essencial nunca fica de fora quando cabe', () => {
	it('vence uma obrigatória de peso normal mesmo colidindo no horário', () => {
		const obrig = materia('CIC0007', ['2M12']);
		obrig.natureza = 'obrigatoria';
		const ess = materia('ESS1', ['2M12']);
		gradeStore.init([obrig, ess], { idUser: null, periodo: '2026.2' });

		const r = gradeStore.montarAutomatico({ essencial: 'ESS1' });

		expect(gradeStore.selecao.has('ESS1')).toBe(true);
		expect(gradeStore.selecao.has('CIC0007')).toBe(false);
		expect(r.erros).toBeUndefined();
	});

	it('não é barrada pelo teto de créditos (obrigatoria=true internamente)', () => {
		const ess = materia('ESS1', ['2M12'], 10);
		const outra = materia('OUTRA', ['3T12'], 4);
		gradeStore.init([ess, outra], { idUser: null, periodo: '2026.2' });

		const r = gradeStore.montarAutomatico({ essencial: 'ESS1', limiteCreditos: 2 });

		expect(gradeStore.selecao.has('ESS1')).toBe(true);
		expect(r.naoAlocadas).not.toContain('ESS1');
	});

	it('sem `essencial` nos opts, `erros` nunca aparece (comportamento de sempre)', () => {
		const a = materia('MAT0001', ['2M12']);
		const b = materia('MAT0002', ['2M12']); // colide, uma fica de fora — não é essencial
		gradeStore.init([a, b], { idUser: null, periodo: '2026.2' });

		const r = gradeStore.montarAutomatico();

		expect(r.naoAlocadas.length).toBe(1);
		expect(r.erros).toBeUndefined();
	});
});

describe('montarAutomatico — diagnóstico quando a essencial não coube', () => {
	it('ESSENCIAL_SEM_VAGA: zero turmas, mesmo sem filtro de turno', () => {
		const ess = materia('ESS1', []);
		gradeStore.init([ess], { idUser: null, periodo: '2026.2' });

		const r = gradeStore.montarAutomatico({ essencial: 'ESS1' });

		expect(r.naoAlocadas).toEqual(['ESS1']);
		expect(r.erros).toEqual([{ tipo: 'ESSENCIAL_SEM_VAGA', chave: 'ESS1' }]);
	});

	it('ESSENCIAL_FORA_DO_TURNO: só tem turma à noite, aluno filtrou manhã', () => {
		const ess = materia('ESS1', ['2N12']);
		gradeStore.init([ess], { idUser: null, periodo: '2026.2' });
		gradeStore.setTurnos(['M']);

		const r = gradeStore.montarAutomatico({ essencial: 'ESS1' });

		expect(r.naoAlocadas).toEqual(['ESS1']);
		expect(r.erros).toEqual([
			{ tipo: 'ESSENCIAL_FORA_DO_TURNO', chave: 'ESS1', turnosComOferta: ['N'] }
		]);
	});

	it('ESSENCIAL_CONFLITO: única turma colide com matéria travada (cursando/turma real)', () => {
		const travada = materia('CURSO1', ['2M12']);
		const ess = materia('ESS1', ['2M12']);
		gradeStore.init([travada, ess], { idUser: null, periodo: '2026.2' });
		gradeStore.selecionarTurma('CURSO1', travada.turmas[0].turma.id_turmas);

		const r = gradeStore.montarAutomatico({ essencial: 'ESS1' });

		expect(r.naoAlocadas).toEqual(['ESS1']);
		expect(r.erros).toHaveLength(1);
		expect(r.erros?.[0]).toMatchObject({ tipo: 'ESSENCIAL_CONFLITO', chave: 'ESS1' });
	});

	it('ESSENCIAL_PRE_REQUISITO: pendência tem prioridade sobre o conflito de horário', () => {
		const travada = materia('CURSO1', ['2M12']);
		const ess = materia('ESS1', ['2M12']);
		mockPreRequisitos = [
			{
				idMateria: ess.idMateria,
				idPreRequisito: 1,
				idMateriaRequisito: null,
				codigoMateriaRequisito: 'MAT0001',
				nomeMateriaRequisito: 'Matéria base'
			}
		];
		mockCompletedCodes = new Set(); // MAT0001 não cursada ainda

		gradeStore.init([travada, ess], { idUser: null, periodo: '2026.2' });
		gradeStore.selecionarTurma('CURSO1', travada.turmas[0].turma.id_turmas);

		const r = gradeStore.montarAutomatico({ essencial: 'ESS1' });

		expect(r.naoAlocadas).toEqual(['ESS1']);
		expect(r.erros).toEqual([
			{ tipo: 'ESSENCIAL_PRE_REQUISITO', chave: 'ESS1', pendencias: ['MAT0001'] }
		]);
	});

	it('pré-requisito satisfeito não gera ESSENCIAL_PRE_REQUISITO — cai no conflito real', () => {
		const travada = materia('CURSO1', ['2M12']);
		const ess = materia('ESS1', ['2M12']);
		mockPreRequisitos = [
			{
				idMateria: ess.idMateria,
				idPreRequisito: 1,
				idMateriaRequisito: null,
				codigoMateriaRequisito: 'MAT0001',
				nomeMateriaRequisito: 'Matéria base'
			}
		];
		mockCompletedCodes = new Set(['MAT0001']);

		gradeStore.init([travada, ess], { idUser: null, periodo: '2026.2' });
		gradeStore.selecionarTurma('CURSO1', travada.turmas[0].turma.id_turmas);

		const r = gradeStore.montarAutomatico({ essencial: 'ESS1' });

		expect(r.erros?.[0].tipo).toBe('ESSENCIAL_CONFLITO');
	});
});

describe('gradeStore.montarOpcoes / popularOpcoes — múltiplas opções', () => {
	it('a essencial aparece em toda opção gerada', () => {
		const ess = materia('ESS1', ['2M12']);
		const filler = materia('OPT0001', ['3T12']);
		gradeStore.init([ess, filler], { idUser: null, periodo: '2026.2' });

		const opcoes = gradeStore.montarOpcoes({ essencial: 'ESS1' });

		expect(opcoes.length).toBeGreaterThan(0);
		for (const opcao of opcoes) {
			expect(opcao.resultado.selecao.has('ESS1')).toBe(true);
		}
	});

	it('professor preferido da essencial também é bônus em `montarOpcoes` (empate de horário)', () => {
		seq = 0;
		const essBruno: MateriaGrade = {
			codigo: 'ESS1',
			nome: 'ESS1',
			creditos: 4,
			idMateria: 900,
			turmas: [
				{ mask: slotMaskFromHorario('2M12'), turma: { id_turmas: 901, horario: '2M12', turma: '1', docente: 'BRUNO LIMA' } as never },
				{ mask: slotMaskFromHorario('2M12'), turma: { id_turmas: 902, horario: '2M12', turma: '2', docente: 'ANA SOUZA' } as never }
			]
		};
		gradeStore.init([essBruno], { idUser: null, periodo: '2026.2' });

		const opcoes = gradeStore.montarOpcoes({
			essencial: 'ESS1',
			professorPreferidoEssencial: 'ANA SOUZA'
		});

		expect(opcoes.length).toBeGreaterThan(0);
		for (const opcao of opcoes) {
			expect(opcao.resultado.selecao.get('ESS1')?.turma.docente).toBe('ANA SOUZA');
			expect(opcao.metricas.professorEssencialAtendido).toBe(true);
		}
	});

	it('popularOpcoes cria um cenário por opção, nomeado pela estratégia, origem "opcao-solver"', () => {
		const ess = materia('ESS1', ['2M12']);
		gradeStore.init([ess], { idUser: null, periodo: '2026.2' });
		const antes = gradeStore.grades.length;

		const opcoes = gradeStore.montarOpcoes({ essencial: 'ESS1' });
		gradeStore.popularOpcoes(opcoes);

		expect(gradeStore.grades.length).toBe(antes + opcoes.length);
		const novos = gradeStore.grades.slice(antes);
		novos.forEach((cenario, i) => {
			expect(cenario.nome).toBe(opcoes[i].estrategia);
			expect(cenario.origem).toBe('opcao-solver');
			expect(cenario.selecao.ESS1).toBe(opcoes[i].resultado.selecao.get('ESS1')?.turma.id_turmas);
		});
	});

	it('popularOpcoes não mexe no cenário ativo', () => {
		const ess = materia('ESS1', ['2M12']);
		gradeStore.init([ess], { idUser: null, periodo: '2026.2' });
		const ativoAntes = gradeStore.activeId;
		const selecaoAntes = { ...gradeStore.cenarioAtivo?.selecao };

		gradeStore.popularOpcoes(gradeStore.montarOpcoes({ essencial: 'ESS1' }));

		expect(gradeStore.activeId).toBe(ativoAntes);
		expect(gradeStore.cenarioAtivo?.selecao).toEqual(selecaoAntes);
	});
});
