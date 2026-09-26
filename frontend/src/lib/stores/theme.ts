import { browser } from '$app/environment';
import { derived, writable, type Readable } from 'svelte/store';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const DEFAULT_THEME: Theme = 'dark';
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#faf9fe', dark: '#09090b' };

function isTheme(value: unknown): value is Theme {
	return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredTheme(): Theme {
	if (!browser) return DEFAULT_THEME;
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return isTheme(stored) ? stored : DEFAULT_THEME;
	} catch {
		return DEFAULT_THEME;
	}
}

function getSystemTheme(): ResolvedTheme {
	if (!browser) return 'dark';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(theme: Theme, system: ResolvedTheme): ResolvedTheme {
	return theme === 'system' ? system : theme;
}

/**
 * Aplica a classe no <html> e sincroniza as <meta name="theme-color"> com media.
 * O mesmo algoritmo roda inline em app.html antes do primeiro paint; aqui só mantemos
 * o DOM em dia quando o usuário troca de tema ou o SO muda a preferência.
 */
function applyResolved(resolved: ResolvedTheme) {
	if (!browser) return;
	const root = document.documentElement;
	root.classList.remove('light', 'dark');
	root.classList.add(resolved);
	document
		.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]')
		.forEach((meta) => meta.setAttribute('content', THEME_COLOR[resolved]));
}

function persist(theme: Theme) {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		/* localStorage indisponível — o tema vale só para a sessão */
	}
}

function createThemeStore() {
	// No servidor a store nasce em 'dark' (o padrão) e nenhum componente deve renderizar
	// markup dependente dela no SSR — o inline script de app.html já aplicou a classe certa.
	const preference = writable<Theme>(readStoredTheme());
	const system = writable<ResolvedTheme>(getSystemTheme());

	const resolved: Readable<ResolvedTheme> = derived([preference, system], ([$pref, $sys]) =>
		resolve($pref, $sys)
	);

	if (browser) {
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', (e) => system.set(e.matches ? 'dark' : 'light'));
		// Reaplica sempre que a preferência ou o SO mudarem (inclui a primeira execução).
		resolved.subscribe(applyResolved);
	}

	function setTheme(theme: Theme) {
		preference.set(theme);
		persist(theme);
	}

	return {
		subscribe: preference.subscribe,
		resolved,
		set: setTheme,
		setSystem: () => setTheme('system')
	};
}

export const theme = createThemeStore();

/** Tema efetivamente aplicado ('light' | 'dark'), já com 'system' resolvido. */
export const resolvedTheme: Readable<ResolvedTheme> = theme.resolved;
