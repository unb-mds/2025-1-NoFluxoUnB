import { browser } from '$app/environment';
import { derived, writable, type Readable } from 'svelte/store';

/**
 * Preferências de acessibilidade do usuário (WCAG 2.2).
 *
 * Cada chave vira uma classe no <html> (ver A11Y_CLASS) e o CSS em app.css faz o resto:
 * o alto contraste sobrescreve os tokens do tema, então todos os componentes o seguem
 * sem precisar de código próprio. O mesmo algoritmo de leitura roda inline em app.html
 * antes do primeiro paint, para não piscar.
 */
export interface A11ySettings {
	/** Sobrescreve os tokens por uma paleta de contraste máximo (light e dark). */
	highContrast: boolean;
	/** Fonte base 112,5% (tudo que usa rem cresce junto). */
	largeText: boolean;
	/** Troca a fonte de leitura por Lexend, desenhada para fluência de leitura. */
	readableFont: boolean;
	/** Remove animações e transições, independente da preferência do sistema. */
	reducedMotion: boolean;
	/** Anel de foco mais grosso e com halo para navegação por teclado. */
	focusBold: boolean;
}

export type A11yKey = keyof A11ySettings;

export const A11Y_STORAGE_KEY = 'nofluxo_a11y';

export const A11Y_DEFAULTS: A11ySettings = {
	highContrast: false,
	largeText: false,
	readableFont: false,
	reducedMotion: false,
	focusBold: false
};

export const A11Y_CLASS: Record<A11yKey, string> = {
	highContrast: 'a11y-high-contrast',
	largeText: 'a11y-large-text',
	readableFont: 'a11y-readable-font',
	reducedMotion: 'a11y-reduced-motion',
	focusBold: 'a11y-focus-bold'
};

export const A11Y_KEYS = Object.keys(A11Y_DEFAULTS) as A11yKey[];

/**
 * Interpreta o valor salvo. Sem nada salvo, "reduzir movimento" começa igual à
 * preferência do sistema (o CSS já respeita `prefers-reduced-motion`; aqui só deixamos
 * o interruptor coerente com o que a pessoa vê). Valores corrompidos caem no padrão.
 */
export function parseStoredSettings(raw: string | null, prefersReducedMotion = false): A11ySettings {
	if (raw) {
		try {
			const parsed = JSON.parse(raw) as Partial<Record<A11yKey, unknown>>;
			if (parsed && typeof parsed === 'object') {
				const out = { ...A11Y_DEFAULTS };
				for (const key of A11Y_KEYS) out[key] = parsed[key] === true;
				return out;
			}
		} catch {
			/* JSON inválido — ignora */
		}
	}
	return { ...A11Y_DEFAULTS, reducedMotion: prefersReducedMotion };
}

/** Classes que devem estar no <html> para um conjunto de preferências. */
export function classesFor(settings: A11ySettings): string[] {
	return A11Y_KEYS.filter((key) => settings[key]).map((key) => A11Y_CLASS[key]);
}

export function countActive(settings: A11ySettings): number {
	return A11Y_KEYS.filter((key) => settings[key]).length;
}

/** `browser` pode ser true em testes sem DOM (Vitest em modo cliente); por isso o guard extra. */
const hasDom = () => browser && typeof window !== 'undefined' && typeof document !== 'undefined';

function readStored(): A11ySettings {
	if (!hasDom()) return { ...A11Y_DEFAULTS };
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(A11Y_STORAGE_KEY);
	} catch {
		/* localStorage indisponível */
	}
	const prefersReduced =
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	return parseStoredSettings(raw, prefersReduced);
}

function applyToDocument(settings: A11ySettings) {
	if (!hasDom()) return;
	const root = document.documentElement;
	for (const key of A11Y_KEYS) root.classList.toggle(A11Y_CLASS[key], settings[key]);
}

function persist(settings: A11ySettings) {
	if (!hasDom()) return;
	try {
		localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(settings));
	} catch {
		/* quota ou modo privado — vale só para a sessão */
	}
}

function createA11yStore() {
	const store = writable<A11ySettings>(readStored());

	if (hasDom()) {
		// Reaplica no <html> a cada mudança (inclui a primeira execução).
		store.subscribe(applyToDocument);
	}

	function update(fn: (current: A11ySettings) => A11ySettings) {
		store.update((current) => {
			const next = fn(current);
			persist(next);
			return next;
		});
	}

	return {
		subscribe: store.subscribe,
		toggle: (key: A11yKey) => update((s) => ({ ...s, [key]: !s[key] })),
		set: (key: A11yKey, value: boolean) => update((s) => ({ ...s, [key]: value })),
		reset: () => update(() => ({ ...A11Y_DEFAULTS }))
	};
}

export const a11y = createA11yStore();

/** Quantas preferências estão ligadas (para o badge do menu). */
export const a11yActiveCount: Readable<number> = derived(a11y, countActive);
