import { describe, it, expect, beforeEach } from 'vitest';
import { gradeStore, type MateriaGrade } from './grade.store.svelte';
import { slotMaskFromHorario } from '$lib/utils/horario-slots';

function materia(codigo: string, ...horarios: string[]): MateriaGrade {
	const n = Number(codigo.replace(/\D/g, ''));
	return {
		codigo,
		nome: codigo,
		creditos: 4,
		idMateria: n,
		turmas: horarios.map((h, i) => ({
			mask: slotMaskFromHorario(h),
			turma: { id_turmas: n * 10 + i, horario: h, turma: String(i + 1) } as any
		}))
	};
}

describe('gradeStore.motivosPrioritarias — a estrela "pegou"?', () => {
	beforeEach(() => {
		gradeStore.init([], { idUser: null, periodo: '2026.2' });
	});

	it('estrela dentro da grade não aparece como problema', () => {
		const a = materia('FGA0001', '2M12');
		gradeStore.addMateriaAoPool(a);
		gradeStore.selecionarTurma('FGA0001', a.turmas[0].turma.id_turmas);
		gradeStore.togglePrioridade('FGA0001');
		expect(gradeStore.motivosPrioritarias.size).toBe(0);
	});

	it('explica a colisão e com quem', () => {
		const a = materia('FGA0001', '2M12');
		const b = materia('FGA0002', '2M12');
		gradeStore.addMateriaAoPool(a);
		gradeStore.addMateriaAoPool(b);
		gradeStore.selecionarTurma('FGA0001', a.turmas[0].turma.id_turmas);
		gradeStore.togglePrioridade('FGA0002');
		expect(gradeStore.motivosPrioritarias.get('FGA0002')).toMatch(/bate com FGA0001/);
	});

	it('sem turma ofertada e fora do turno têm motivo próprio', () => {
		gradeStore.addMateriaAoPool(materia('FGA0003'));
		gradeStore.addMateriaAoPool(materia('FGA0004', '3T12'));
		gradeStore.togglePrioridade('FGA0003');
		gradeStore.togglePrioridade('FGA0004');
		gradeStore.setTurnos(['M']);
		const m = gradeStore.motivosPrioritarias;
		expect(m.get('FGA0003')).toMatch(/não tem turma ofertada/);
		expect(m.get('FGA0004')).toMatch(/fora dos turnos/);
	});

	it('cabe mas ainda não montou: diz que vale na próxima montagem', () => {
		gradeStore.addMateriaAoPool(materia('FGA0005', '4M12'));
		gradeStore.togglePrioridade('FGA0005');
		expect(gradeStore.motivosPrioritarias.get('FGA0005')).toMatch(/próxima montagem/);
	});
});
