import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { camadasStore } from './camadas.store.svelte';
import { montarEfeitoDaGaveta, storeIngenuo } from './camadas.efeito.svelte';

/**
 * Regressão: `abrir()` fazia `modais += 1` (lê E escreve o mesmo $state). Chamado
 * dentro do $effect da gaveta, o efeito passava a depender do contador que ele mesmo
 * muda → reexecutava sem parar, desregistrando o modal e travando os botões.
 */
describe('camadasStore dentro de $effect', () => {
	it('registrar/desregistrar num efeito não entra em laço', () => {
		const g = montarEfeitoDaGaveta(camadasStore);
		flushSync();
		const antes = g.execucoes;

		g.abrir();
		expect(() => flushSync()).not.toThrow();
		expect(camadasStore.temModal).toBe(true);
		expect(g.execucoes - antes).toBe(1);

		g.fechar();
		flushSync();
		expect(camadasStore.temModal).toBe(false);
		g.limpar();
	});

	it('o padrão antigo (ler e escrever o mesmo $state) realmente laça — documenta a causa', () => {
		const ingenuo = storeIngenuo();
		const g = montarEfeitoDaGaveta(ingenuo);
		flushSync();
		g.abrir();
		let laco = false;
		try {
			flushSync();
		} catch {
			laco = true;
		}
		// Ou estoura o limite de atualizações, ou o modal terminou desregistrado.
		expect(laco || !ingenuo.temModal || g.execucoes > 2).toBe(true);
		try {
			g.limpar();
		} catch {
			/* ok */
		}
	});

	it('vários modais: só libera quando o último fecha', () => {
		const a = camadasStore.abrir();
		const b = camadasStore.abrir();
		expect(camadasStore.temModal).toBe(true);
		a();
		expect(camadasStore.temModal).toBe(true);
		b();
		expect(camadasStore.temModal).toBe(false);
		a(); // idempotente
		expect(camadasStore.temModal).toBe(false);
	});
});
