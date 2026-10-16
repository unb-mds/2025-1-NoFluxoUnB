/**
 * Montador de Grade — professor preferido virou BÔNUS de desempate, não mais
 * filtro rígido (Fase 1(b) do plano `montador-de-grade-resilient-muffin`).
 *
 * Antes, `docentesObrigatorios` filtrava fora qualquer turma cujo `docente` cru
 * não contivesse o nome alvo como substring — inclusive cruzando fronteira de
 * nome quando a turma tinha mais de um professor separado por vírgula (ex.:
 * "SILVA, MARIA" batendo por acidente no fim de um nome + início do próximo).
 * Agora `docenteBate` faz o split por vírgula primeiro e compara nome a nome, e
 * o match vira `bonus` (via `epsilonSeguro`) em vez de excluir a turma — a
 * matéria nunca mais fica de fora só porque nenhuma turma é do professor
 * pedido.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { gradeStore, docenteBate, type MateriaGrade } from './grade.store.svelte';
import { slotMaskFromHorario } from '$lib/utils/horario-slots';
import type { TurmaOferta } from '$lib/services/turmas.service';

function turmaOferta(id: number, docente: string | null, horario: string): TurmaOferta {
	return {
		id_turmas: id,
		id_materia: id,
		turma: 'A',
		docente,
		horario,
		local: null,
		ano_periodo: '2026.1',
		vagas_ofertadas: null,
		vagas_ocupadas: null,
		vagas_sobrando: null
	};
}

/** Matéria com uma turma por `{horario, docente}` informado. */
function materiaComDocentes(
	codigo: string,
	baseId: number,
	turmas: Array<{ horario: string; docente: string | null }>
): MateriaGrade {
	return {
		codigo,
		nome: codigo,
		creditos: 4,
		idMateria: baseId,
		turmas: turmas.map((t, i) => ({
			mask: slotMaskFromHorario(t.horario),
			turma: turmaOferta(baseId + i, t.docente, t.horario)
		}))
	};
}

beforeEach(() => {
	gradeStore.definirCursandoAtual([]);
	gradeStore.definirSituacao(null);
	gradeStore.init([], { idUser: null, periodo: '2026.2' });
	gradeStore.setTurnos(['M', 'T', 'N']);
});

describe('docenteBate — split por vírgula, comparação nome a nome', () => {
	it('bate com qualquer um dos nomes quando a turma tem mais de um professor', () => {
		expect(docenteBate('ana maria silva, maria clara souza', 'MARIA CLARA')).toBe(true);
		expect(docenteBate('ana maria silva, maria clara souza', 'ANA MARIA SILVA')).toBe(true);
	});

	it('não cruza fronteira de nome (regressão do filtro rígido antigo por substring cru)', () => {
		// "ANA MARIA SILVA, MARIA CLARA SOUZA" contém o literal "SILVA, MARIA" (fim
		// do 1º nome + vírgula + início do 2º) — um match por substring na string
		// crua bateria aqui; o split por vírgula elimina esse falso positivo porque
		// nenhum nome INDIVIDUAL contém "SILVA, MARIA".
		expect(docenteBate('ANA MARIA SILVA, MARIA CLARA SOUZA', 'SILVA, MARIA')).toBe(false);
	});

	it('ignora caixa e espaços redundantes', () => {
		expect(docenteBate('  ana   souza  ', 'ANA SOUZA')).toBe(true);
	});

	it('docente nulo/vazio ou alvo vazio nunca batem', () => {
		expect(docenteBate(null, 'ANA')).toBe(false);
		expect(docenteBate(undefined, 'ANA')).toBe(false);
		expect(docenteBate('ANA SOUZA', '')).toBe(false);
		expect(docenteBate('ANA SOUZA', '   ')).toBe(false);
	});
});

describe('montarAutomatico — professor preferido é bônus, não filtro rígido', () => {
	it('matéria continua na grade mesmo sem nenhuma turma do professor preferido', () => {
		gradeStore.init(
			[materiaComDocentes('MAT0001', 100, [{ horario: '2M12', docente: 'BRUNO LIMA' }])],
			{ idUser: null, periodo: '2026.2' }
		);

		const r = gradeStore.montarAutomatico({ docentesObrigatorios: { MAT0001: 'ANA SOUZA' } });

		expect(r.naoAlocadas).toEqual([]);
		expect(gradeStore.selecao.has('MAT0001')).toBe(true);
		expect(gradeStore.selecao.get('MAT0001')?.turma.docente).toBe('BRUNO LIMA');
	});

	it('desempata a favor da turma do professor preferido quando o horário é o mesmo', () => {
		gradeStore.init(
			[
				materiaComDocentes('MAT0001', 100, [
					{ horario: '2M12', docente: 'BRUNO LIMA' },
					{ horario: '2M12', docente: 'ANA SOUZA' }
				])
			],
			{ idUser: null, periodo: '2026.2' }
		);

		gradeStore.montarAutomatico({ docentesObrigatorios: { MAT0001: 'ANA SOUZA' } });

		expect(gradeStore.selecao.get('MAT0001')?.turma.docente).toBe('ANA SOUZA');
	});

	it('turma com vários professores (campo docente com vírgula) também recebe o bônus', () => {
		gradeStore.init(
			[
				materiaComDocentes('MAT0001', 100, [
					{ horario: '2M12', docente: 'BRUNO LIMA' },
					{ horario: '2M12', docente: 'CARLOS DIAS, ANA SOUZA' }
				])
			],
			{ idUser: null, periodo: '2026.2' }
		);

		gradeStore.montarAutomatico({ docentesObrigatorios: { MAT0001: 'ANA SOUZA' } });

		expect(gradeStore.selecao.get('MAT0001')?.turma.docente).toBe('CARLOS DIAS, ANA SOUZA');
	});

	it('o bônus nunca custa encaixar mais uma matéria — continua perdendo pra maximizar a grade', () => {
		// CIC0007 tem duas turmas: uma do professor preferido (2M12, colide com
		// OPT0001) e outra sem (4M12, livre). Encaixar OPT0001 junto vale mais do
		// que agradar a preferência de professor — exatamente a invariante que
		// `epsilonSeguro` existe para proteger.
		const cic = materiaComDocentes('CIC0007', 100, [
			{ horario: '2M12', docente: 'ANA SOUZA' },
			{ horario: '4M12', docente: 'BRUNO LIMA' }
		]);
		cic.natureza = 'obrigatoria';
		const opt = materiaComDocentes('OPT0001', 200, [{ horario: '2M12', docente: null }]);
		opt.natureza = 'optativa';
		gradeStore.init([cic, opt], { idUser: null, periodo: '2026.2' });

		gradeStore.montarAutomatico({ docentesObrigatorios: { CIC0007: 'ANA SOUZA' } });

		expect(gradeStore.selecao.get('CIC0007')?.turma.horario).toBe('4M12');
		expect(gradeStore.selecao.has('OPT0001')).toBe(true);
	});

	it('docentesPersistidos e docentesObrigatorios se mesclam, o argumento vence em conflito', () => {
		gradeStore.definirDocentesPersistidos({ MAT0001: 'BRUNO LIMA' });
		gradeStore.init(
			[
				materiaComDocentes('MAT0001', 100, [
					{ horario: '2M12', docente: 'BRUNO LIMA' },
					{ horario: '2M12', docente: 'ANA SOUZA' }
				])
			],
			{ idUser: null, periodo: '2026.2' }
		);

		gradeStore.montarAutomatico({ docentesObrigatorios: { MAT0001: 'ANA SOUZA' } });

		expect(gradeStore.selecao.get('MAT0001')?.turma.docente).toBe('ANA SOUZA');
		gradeStore.definirDocentesPersistidos({});
	});
});

describe('gradeStore.aplicarSelecao — caminho único de aplicação de seleção pronta', () => {
	it('aplica a seleção exata no cenário ativo', () => {
		const mat = materiaComDocentes('MAT0001', 100, [{ horario: '2M12', docente: null }]);
		gradeStore.init([mat], { idUser: null, periodo: '2026.2' });
		const idTurma = mat.turmas[0].turma.id_turmas;

		gradeStore.aplicarSelecao({ MAT0001: idTurma });

		expect(gradeStore.selecao.get('MAT0001')?.turma.id_turmas).toBe(idTurma);
	});

	it('reconcilia: ignora turma que não existe (mais) no pool', () => {
		const mat = materiaComDocentes('MAT0001', 100, [{ horario: '2M12', docente: null }]);
		gradeStore.init([mat], { idUser: null, periodo: '2026.2' });

		gradeStore.aplicarSelecao({ MAT0001: 999999 });

		expect(gradeStore.selecao.has('MAT0001')).toBe(false);
	});

	it('reconcilia: descarta a segunda seleção que conflita em horário com a primeira', () => {
		const a = materiaComDocentes('MAT0001', 100, [{ horario: '2M12', docente: null }]);
		const b = materiaComDocentes('MAT0002', 200, [{ horario: '2M12', docente: null }]);
		gradeStore.init([a, b], { idUser: null, periodo: '2026.2' });

		gradeStore.aplicarSelecao({
			MAT0001: a.turmas[0].turma.id_turmas,
			MAT0002: b.turmas[0].turma.id_turmas
		});

		expect(gradeStore.selecao.size).toBe(1);
	});
});
