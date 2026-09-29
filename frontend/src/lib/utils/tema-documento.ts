/**
 * Tema efetivo do documento, lido da classe `dark` do <html> (tailwind
 * `darkMode: 'class'`). Hoje o app.html fixa `class="dark"`; componentes de
 * terceiros que não leem essa classe (ex.: o Toaster do svelte-sonner, que
 * por padrão é claro) recebem o tema daqui.
 */

export type TemaDocumento = 'light' | 'dark';

/** Tema de partida, igual ao `class="dark"` fixo do app.html. */
export const TEMA_INICIAL: TemaDocumento = 'dark';

export function temaDoElemento(el: Pick<Element, 'classList'> | null | undefined): TemaDocumento {
	return el?.classList.contains('dark') ? 'dark' : 'light';
}

type ObservadorCtor = new (cb: () => void) => {
	observe(alvo: unknown, opcoes: MutationObserverInit): void;
	disconnect(): void;
};

/**
 * Chama `aoMudar` com o tema atual e de novo a cada troca da classe do <html>.
 * Devolve a função que para de observar.
 */
export function observarTemaDoDocumento(
	aoMudar: (tema: TemaDocumento) => void,
	raiz: Pick<Element, 'classList'> = document.documentElement,
	Observador: ObservadorCtor = MutationObserver as unknown as ObservadorCtor
): () => void {
	let atual = temaDoElemento(raiz);
	aoMudar(atual);
	const obs = new Observador(() => {
		const novo = temaDoElemento(raiz);
		if (novo !== atual) {
			atual = novo;
			aoMudar(novo);
		}
	});
	obs.observe(raiz, { attributes: true, attributeFilter: ['class'] });
	return () => obs.disconnect();
}
