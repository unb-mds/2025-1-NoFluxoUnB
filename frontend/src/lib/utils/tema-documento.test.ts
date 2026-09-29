import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TEMA_INICIAL, observarTemaDoDocumento, temaDoElemento } from './tema-documento';

function elemento(classes: string[]) {
	const set = new Set(classes);
	return {
		set,
		classList: { contains: (c: string) => set.has(c) } as unknown as DOMTokenList
	};
}

class ObservadorFalso {
	static ultimo: ObservadorFalso;
	opcoes?: MutationObserverInit;
	desligado = false;
	constructor(public cb: () => void) {
		ObservadorFalso.ultimo = this;
	}
	observe(_alvo: unknown, opcoes: MutationObserverInit) {
		this.opcoes = opcoes;
	}
	disconnect() {
		this.desligado = true;
	}
}

describe('tema do documento', () => {
	it('lê a classe dark do <html>', () => {
		expect(temaDoElemento(elemento(['dark']))).toBe('dark');
		expect(temaDoElemento(elemento([]))).toBe('light');
		expect(temaDoElemento(null)).toBe('light');
	});

	it('o tema inicial é o do app.html (produção só dark)', () => {
		const html = readFileSync(resolve(__dirname, '../../app.html'), 'utf8');
		const classe = /<html[^>]*class="([^"]*)"/.exec(html)?.[1] ?? '';
		expect(temaDoElemento(elemento(classe.split(/\s+/)))).toBe(TEMA_INICIAL);
	});

	it('avisa o tema atual e cada troca da classe; para ao cancelar', () => {
		const el = elemento(['dark']);
		const visto = vi.fn();
		const parar = observarTemaDoDocumento(visto, el, ObservadorFalso);
		expect(visto).toHaveBeenLastCalledWith('dark');
		expect(ObservadorFalso.ultimo.opcoes).toEqual({ attributes: true, attributeFilter: ['class'] });

		el.set.delete('dark');
		ObservadorFalso.ultimo.cb();
		expect(visto).toHaveBeenLastCalledWith('light');
		ObservadorFalso.ultimo.cb(); // sem troca real: não repete
		expect(visto).toHaveBeenCalledTimes(2);

		parar();
		expect(ObservadorFalso.ultimo.desligado).toBe(true);
	});
});

describe('Toaster do svelte-sonner segue o tema', () => {
	// Sem `theme` o sonner usa o claro: toast branco sobre a página escura.
	it('o layout passa o tema do documento ao <Toaster>', () => {
		const layout = readFileSync(resolve(__dirname, '../../routes/+layout.svelte'), 'utf8');
		const toaster = /<Toaster\b[^>]*>/.exec(layout)?.[0] ?? '';
		expect(toaster).toMatch(/\btheme=\{temaToaster\}/);
		expect(layout).toMatch(/observarTemaDoDocumento\(/);
		expect(layout).toMatch(/let temaToaster = \$state<TemaDocumento>\(TEMA_INICIAL\)/);
	});
});
