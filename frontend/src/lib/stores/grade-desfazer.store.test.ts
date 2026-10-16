import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { gradeStore } from './grade.store.svelte';
import { desfazerStore } from './grade-desfazer.store.svelte';

beforeEach(() => {
	const mem = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => mem.get(k) ?? null,
		setItem: (k: string, v: string) => void mem.set(k, v),
		removeItem: (k: string) => void mem.delete(k),
		key: (i: number) => [...mem.keys()][i] ?? null,
		get length() {
			return mem.size;
		}
	});
	gradeStore.init([], { idUser: 5, periodo: '2026.2' });
	desfazerStore.configurar({ adicionarAoPool: async () => {} });
	desfazerStore.sincronizar();
});
afterEach(() => vi.unstubAllGlobals());

describe('desfazerStore — botão Desfazer/Refazer', () => {
	it('sem mudança grande não há o que desfazer (botão some)', () => {
		expect(desfazerStore.ultimo).toBeNull();
	});

	it('desfaz a última mudança grande e depois refaz', async () => {
		gradeStore.criarCenario('Minha');
		const antes = gradeStore.grades.length;

		desfazerStore.registrar('Montar grade');
		gradeStore.criarCenario('Depois');
		expect(gradeStore.grades).toHaveLength(antes + 1);
		expect(desfazerStore.ultimo?.rotulo).toBe('Montar grade');
		expect(desfazerStore.ehRefazer).toBe(false);

		await desfazerStore.desfazerUltimo();
		expect(gradeStore.grades).toHaveLength(antes);
		// O que estava antes de desfazer vira o "Refazer".
		expect(desfazerStore.ehRefazer).toBe(true);

		await desfazerStore.desfazerUltimo();
		expect(gradeStore.grades).toHaveLength(antes + 1);
	});

	it('mudança que não mudou nada não deixa botão (ponto descartado)', () => {
		const id = desfazerStore.registrar('Montar grade');
		expect(desfazerStore.ultimo?.id).toBe(id);
		desfazerStore.descartarSeNadaMudou(id);
		expect(desfazerStore.ultimo).toBeNull();
	});

	it('mudança de verdade mantém o ponto', () => {
		const id = desfazerStore.registrar('Montar grade');
		gradeStore.criarCenario('Nova');
		desfazerStore.descartarSeNadaMudou(id);
		expect(desfazerStore.ultimo?.id).toBe(id);
	});

	it('pontos de visitas anteriores continuam guardados mas não acendem o botão', () => {
		// Gravado "antes" desta sessão (como se viesse de uma visita anterior).
		const chave = `nofluxo:grade:5:2026.2:desfazer`;
		const antigo = {
			id: 'velho',
			rotulo: 'Darcy: algo de ontem',
			quando: new Date(Date.now() - 86_400_000).toISOString(),
			snapshot: gradeStore.snapshotCompleto()
		};
		localStorage.setItem(chave, JSON.stringify([antigo]));
		desfazerStore.sincronizar();
		expect(desfazerStore.pontos.map((p) => p.id)).toEqual(['velho']);
		expect(desfazerStore.ultimo).toBeNull();
	});

	it('restaurar ponto inexistente não quebra', async () => {
		expect(await desfazerStore.restaurar('nao-existe')).toBeNull();
	});
});
