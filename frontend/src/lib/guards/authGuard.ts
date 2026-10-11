import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { get } from 'svelte/store';
import { redirect } from '@sveltejs/kit';
import { authStore } from '$lib/stores/auth';
import { authService } from '$lib/services/auth.service';
import { requiresAdmin, requiredAdminScope } from '$lib/config/routes';
import { hasAdminScope } from '$lib/types/user';
import type { AuthState } from '$lib/types/auth';

const PUBLIC_ROUTES_EXACT = [
	'/',
	'/home',
	'/login',
	'/signup',
	'/password-recovery',
	'/login-anonimo',
	'/auth/callback',
	'/auth/reset-password',
	'/termos',
	'/privacidade',
	'/conheca',
	'/acessibilidade'
];

/** Rotas públicas por prefixo: qualquer path que comece com um deles é público (ex: /fluxogramas, /meu-fluxograma/Engenharia). */
const PUBLIC_ROUTES_PREFIX = ['/fluxogramas', '/disciplinas', '/meu-fluxograma'];

export function isPublicRoute(path: string): boolean {
	const normalized = path.replace(/\/+$/, '') || '/';
	if (PUBLIC_ROUTES_EXACT.includes(normalized)) return true;
	return PUBLIC_ROUTES_PREFIX.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

/**
 * Verifica se a sessão do usuário autenticado ainda é válida (usuários
 * dev-impersonados pulam a checagem). Se inválida, já faz signOut() como
 * efeito colateral. Compartilhado entre checkAuth() e guardProtectedRoute()
 * para não duplicar a mesma lógica de expiração de sessão.
 */
async function checkSessionStillValid(): Promise<boolean> {
	const isDevImpersonate =
		import.meta.env.DEV &&
		typeof localStorage !== 'undefined' &&
		localStorage.getItem('nofluxo_dev_impersonate') === 'true';

	if (isDevImpersonate) return true;

	const isValid = await authService.isSessionValid();
	if (!isValid) {
		await authService.signOut();
		return false;
	}
	return true;
}

/**
 * Check if user should be redirected.
 * This is the sole auth guard — no server-side hooks.server.ts.
 */
export async function checkAuth(path: string): Promise<boolean> {
	if (!browser) return true;

	if (isPublicRoute(path)) return true;

	const state = get(authStore);

	// Allow anonymous users
	if (state.isAnonymous) return true;

	// D9/D10 (Alto, transversal): antes, qualquer rota privada acessada antes do
	// bootstrap (state.isLoading=true) era liberada implicitamente, expondo a tela
	// por alguns segundos enquanto a sessão era buscada. Agora aguardamos o boot
	// terminar antes de decidir — bloquear é o default seguro.
	if (state.isLoading) {
		const start = Date.now();
		while (Date.now() - start < 3000) {
			const s = get(authStore);
			if (!s.isLoading) break;
			await new Promise((r) => setTimeout(r, 50));
		}
	}

	// Re-leitura do estado após o wait
	const settled = get(authStore);
	if (settled.isAnonymous) return true;

	// Check if authenticated (lê o estado já estabilizado após o wait de isLoading — D9/D10)
	if (settled.isAuthenticated && settled.user) {
		// Verify session is still valid (covers expiry check previously in hooks.server.ts)
		if (!(await checkSessionStillValid())) {
			await goto('/login?error=session_expired');
			return false;
		}

		// Rotas admin: exige o escopo correspondente (superadmin passa sempre)
		if (requiresAdmin(path)) {
			const scope = requiredAdminScope(path);
			if (!scope || !hasAdminScope(settled.user, scope)) {
				await goto('/suporte?error=access_denied');
				return false;
			}
		}

		return true;
	}

	// Not authenticated, redirect to login
	await goto(`/login?redirect=${encodeURIComponent(path)}`);
	return false;
}

/**
 * Guard for pages that should redirect logged-in users
 * (e.g., login page should redirect to home if already logged in)
 */
export async function checkAlreadyAuthenticated(redirectTo = '/upload-historico'): Promise<boolean> {
	if (!browser) return false;

	const state = get(authStore);

	if (state.isAuthenticated || state.isAnonymous) {
		await goto(redirectTo);
		return true;
	}

	return false;
}

/** Prefixos de rota que exigem conta real — login anônimo não é suficiente. */
const REQUIRES_REAL_AUTH_PREFIXES = ['/plano-formatura', '/suporte', '/admin'];

function requiresRealAuth(pathname: string): boolean {
	return REQUIRES_REAL_AUTH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
	);
}

export type ProtectedRouteDecision = { action: 'allow' } | { action: 'redirect'; to: string };

/**
 * Decisão pura do guard de rota protegida, dado o estado de auth já resolvido.
 * Sem I/O — reaproveitada pelos testes e por guardProtectedRoute.
 */
export function decideProtectedRouteAccess(
	pathname: string,
	state: Pick<AuthState, 'isAuthenticated' | 'isAnonymous' | 'user'>
): ProtectedRouteDecision {
	if (!state.isAuthenticated && !state.isAnonymous) {
		return { action: 'redirect', to: `/login?redirect=${encodeURIComponent(pathname)}` };
	}

	if (requiresRealAuth(pathname) && (!state.isAuthenticated || !state.user)) {
		return { action: 'redirect', to: `/login?redirect=${encodeURIComponent(pathname)}` };
	}

	if (state.isAuthenticated && state.user && requiresAdmin(pathname)) {
		const scope = requiredAdminScope(pathname);
		if (!scope || !hasAdminScope(state.user, scope)) {
			return { action: 'redirect', to: '/suporte?error=access_denied' };
		}
	}

	return { action: 'allow' };
}

/**
 * Guard para o route group (protected): roda no load() de +layout.ts, antes do
 * componente da rota montar — bloqueia o mount lançando redirect() em vez de
 * fazer goto() depois do primeiro frame (o que causava o flash de conteúdo).
 */
export async function guardProtectedRoute(url: URL): Promise<void> {
	if (!browser) return;

	await authService.ensureSessionBootstrapped();

	if (get(authStore).isAuthenticated && get(authStore).user) {
		if (!(await checkSessionStillValid())) {
			throw redirect(303, '/login?error=session_expired');
		}
	}

	const decision = decideProtectedRouteAccess(url.pathname, get(authStore));
	if (decision.action === 'redirect') {
		throw redirect(303, decision.to);
	}
}
