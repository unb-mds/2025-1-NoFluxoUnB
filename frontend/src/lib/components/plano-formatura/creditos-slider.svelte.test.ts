import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarCreditosSlider } from './creditos-slider.svelte';

function montar(inicial = 19) {
	let atual = inicial;
	const chamadas: number[] = [];
	let liberar: (() => void) | null = null;
	const aplicar = vi.fn(async (valor: number) => {
		chamadas.push(valor);
		await new Promise<void>((r) => (liberar = r));
		atual = valor;
	});
	const slider = criarCreditosSlider({ atual: () => atual, aplicar, min: 8, max: 32 });
	return {
		slider,
		chamadas,
		aplicar,
		terminarRecalculo: async () => {
			liberar?.();
			liberar = null;
			await vi.runAllTimersAsync();
		}
	};
}

describe('slider de créditos do plano de formatura', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('mostra o valor na hora, antes do recálculo', () => {
		const { slider, aplicar } = montar(19);
		slider.alterar(24);
		expect(slider.exibido).toBe(24);
		expect(slider.ocupado).toBe(true);
		expect(aplicar).not.toHaveBeenCalled();
	});

	it('recalcula uma vez só, com o último valor, depois do debounce', async () => {
		const { slider, chamadas, terminarRecalculo } = montar(19);
		slider.alterar(20);
		slider.alterar(22);
		slider.alterar(25);
		await vi.advanceTimersByTimeAsync(400);
		expect(chamadas).toEqual([25]);
		await terminarRecalculo();
		expect(slider.exibido).toBe(25);
		expect(slider.ocupado).toBe(false);
	});

	it('não descarta o valor escolhido durante um recálculo em andamento', async () => {
		const { slider, chamadas, terminarRecalculo } = montar(19);
		slider.alterar(24);
		await vi.advanceTimersByTimeAsync(400);
		expect(chamadas).toEqual([24]);

		slider.alterar(28); // mexeu de novo enquanto o plano recalcula
		await vi.advanceTimersByTimeAsync(400);
		expect(slider.exibido).toBe(28);
		expect(chamadas).toEqual([24]); // espera o recálculo atual

		await terminarRecalculo(); // termina o de 24 e dispara o pendente
		expect(chamadas).toEqual([24, 28]);
		await terminarRecalculo();
		expect(slider.exibido).toBe(28);
		expect(slider.ocupado).toBe(false);
	});

	it('não recalcula se voltar ao valor atual', async () => {
		const { slider, aplicar } = montar(19);
		slider.alterar(23);
		slider.alterar(19);
		await vi.advanceTimersByTimeAsync(400);
		expect(aplicar).not.toHaveBeenCalled();
		expect(slider.ocupado).toBe(false);
	});

	it('limita ao intervalo e ignora valor inválido da caixa', () => {
		const { slider } = montar(19);
		slider.alterar(40);
		expect(slider.exibido).toBe(32);
		slider.alterar(2);
		expect(slider.exibido).toBe(8);
		slider.alterar(Number('abc'));
		expect(slider.exibido).toBe(8);
	});
});
