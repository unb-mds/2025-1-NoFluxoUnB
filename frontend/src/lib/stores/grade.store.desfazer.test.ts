import { describe, expect, it } from 'vitest';
import { gradeStore } from './grade.store.svelte';

describe('gradeStore — snapshot completo (desfazer da Darcy)', () => {
	it('restaura abas, ativa, turnos, estrelas e removidas ao estado anterior', () => {
		gradeStore.init([], { idUser: null, periodo: '2026.2' });
		gradeStore.criarCenario('Minha');
		gradeStore.setTurnos(['M']);
		const antes = gradeStore.snapshotCompleto();

		// "Darcy" mexe em tudo:
		gradeStore.criarCenario('Darcy · Sem sexta', 'darcy');
		gradeStore.setTurnos(['N']);
		expect(gradeStore.grades).toHaveLength(antes.grades.length + 1);

		const r = gradeStore.restaurarCompleto(antes);

		expect(r.descartadas).toEqual([]);
		expect(gradeStore.grades.map((g) => g.nome)).toEqual(antes.grades.map((g) => g.nome));
		expect(gradeStore.activeId).toBe(antes.activeId);
		expect([...gradeStore.turnosPermitidos]).toEqual(['M']);
	});

	it('o snapshot é uma cópia: mexer depois não o altera', () => {
		gradeStore.init([], { idUser: null, periodo: '2026.2' });
		const s = gradeStore.snapshotCompleto();
		const nomes = s.grades.map((g) => g.nome);
		gradeStore.criarCenario('Outra');
		gradeStore.renomearCenario(gradeStore.grades[0].id, 'Renomeada');
		expect(s.grades.map((g) => g.nome)).toEqual(nomes);
	});
});
