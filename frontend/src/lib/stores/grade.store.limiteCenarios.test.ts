import { describe, expect, it } from 'vitest';
import { gradeStore } from './grade.store.svelte';

describe('gradeStore — limite de grades por semestre', () => {
	it('recusa criar acima do teto e não mexe na grade ativa', () => {
		gradeStore.init([], { idUser: null, periodo: '2026.2' });
		const teto = gradeStore.limiteCenarios;
		while (gradeStore.grades.length < teto) expect(gradeStore.criarCenario()).toBe(true);
		const ativo = gradeStore.activeId;

		expect(gradeStore.criarCenario('Extra')).toBe(false);
		expect(gradeStore.grades).toHaveLength(teto);
		expect(gradeStore.activeId).toBe(ativo);
	});

	it('cenário criado pela Darcy guarda a origem', () => {
		gradeStore.init([], { idUser: null, periodo: '2026.2' });
		expect(gradeStore.criarCenario('Darcy · Sem sexta', 'darcy')).toBe(true);
		expect(gradeStore.grades.at(-1)?.origem).toBe('darcy');
	});
});
