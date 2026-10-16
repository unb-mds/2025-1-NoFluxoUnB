import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { AuthState, UserModel } from '$lib/types/auth';
import { normalizeDadosFluxogramaFromStored } from '$lib/factories';

const STORAGE_KEY = 'nofluxo_user';
const ANON_KEY = 'nofluxo_anonimo';
/** DEV-ONLY: marca que o usuário atual foi impersonado via /dev/impersonar. */
const DEV_IMPERSONATE_KEY = 'nofluxo_dev_impersonate';

/**
 * O que vai para o localStorage: o usuário SEM papel de admin e SEM token. O papel
 * vem da RPC get_my_admin a cada carregamento (ensureSessionBootstrapped, que o guard
 * de rota aguarda) e o token já vive na sessão do Supabase. Gravá-los aqui só deixava
 * o papel visível e editável no navegador — a checagem de verdade é no banco, mas o
 * menu de admin aparecia para quem editasse o cache.
 */
function paraPersistir(user: UserModel): string {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { isAdmin, adminRole, adminScopes, token, ...resto } = user;
	return JSON.stringify(resto);
}

// Initialize state from localStorage if available
function getInitialState(): AuthState {
	if (browser) {
		const storedUser = localStorage.getItem(STORAGE_KEY);
		const isAnonymous = localStorage.getItem(ANON_KEY) === 'true';

		if (storedUser && storedUser !== 'null') {
			try {
				const rawUser = JSON.parse(storedUser);
				// D4 Vini (Médio): antes, qualquer JSON com `email` virava UserModel com
				// idUser=0 e isAuthenticated=true — permitindo que um atacante injetasse
				// um usuário fantasma só com addInitScript. Agora exigimos um idUser real
				// (camelCase ou snake_case) E email válido antes de hidratar a sessão.
				const idUserCandidate = rawUser.idUser ?? rawUser.id_user;
				const emailCandidate = String(rawUser.email ?? '').trim();
				const hasValidIdUser =
					typeof idUserCandidate === 'number' && Number.isFinite(idUserCandidate) && idUserCandidate > 0;
				const hasValidEmail = emailCandidate.length > 0 && emailCandidate.includes('@');
				if (!hasValidIdUser || !hasValidEmail) {
					localStorage.removeItem(STORAGE_KEY);
					throw new Error('storedUser inválido: idUser/email ausentes ou malformados');
				}

				// Normalize fluxograma so codigoMateria/status/mencao are always in the expected shape
				const dadosFluxograma = normalizeDadosFluxogramaFromStored(
					rawUser.dadosFluxograma ?? rawUser.dados_fluxograma ?? null
				);
				// Handle both old snake_case and new camelCase formats from localStorage
				const cargaHorariaIntegralizada = rawUser.cargaHorariaIntegralizada ?? rawUser.carga_horaria_integralizada ?? null;
				// Caches antigos ainda trazem papel de admin e token: descartados aqui, o
				// bootstrap repõe o papel a partir do banco.
				delete rawUser.isAdmin;
				delete rawUser.is_admin;
				delete rawUser.adminRole;
				delete rawUser.adminScopes;
				delete rawUser.token;
				const user: UserModel = rawUser.idUser !== undefined
					? { ...rawUser, dadosFluxograma: dadosFluxograma ?? rawUser.dadosFluxograma ?? null, cargaHorariaIntegralizada: cargaHorariaIntegralizada ?? undefined }
					: {
							idUser: idUserCandidate,
							email: emailCandidate,
							nomeCompleto: rawUser.nome_completo ?? '',
							dadosFluxograma: dadosFluxograma ?? rawUser.dados_fluxograma ?? null,
							cargaHorariaIntegralizada: cargaHorariaIntegralizada ?? undefined
						};
				return {
					user,
					isAuthenticated: true,
					isAnonymous: false,
					isLoading: false,
					error: null
				};
			} catch {
				localStorage.removeItem(STORAGE_KEY);
			}
		}

		if (isAnonymous) {
			return {
				user: null,
				isAuthenticated: false,
				isAnonymous: true,
				isLoading: false,
				error: null
			};
		}
	}

	return {
		user: null,
		isAuthenticated: false,
		isAnonymous: false,
		isLoading: true,
		error: null
	};
}

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>(getInitialState());

	return {
		subscribe,

		setUser(user: UserModel | null) {
			if (browser) {
				if (user) {
					localStorage.setItem(STORAGE_KEY, paraPersistir(user));
					localStorage.removeItem(ANON_KEY);
				} else {
					localStorage.removeItem(STORAGE_KEY);
				}
			}

			update((state) => ({
				...state,
				user,
				isAuthenticated: !!user,
				isAnonymous: false,
				isLoading: false,
				error: null
			}));
		},

		setAnonymous(value: boolean) {
			if (browser) {
				if (value) {
					localStorage.setItem(ANON_KEY, 'true');
					localStorage.removeItem(STORAGE_KEY);
				} else {
					localStorage.removeItem(ANON_KEY);
				}
			}

			update((state) => ({
				...state,
				user: null,
				isAuthenticated: false,
				isAnonymous: value,
				isLoading: false,
				error: null
			}));
		},

		setLoading(isLoading: boolean) {
			update((state) => ({ ...state, isLoading }));
		},

		setError(error: string | null) {
			update((state) => ({ ...state, error, isLoading: false }));
		},

		updateToken(token: string) {
			update((state) => {
				if (state.user) {
					const updatedUser = { ...state.user, token };
					if (browser) {
						localStorage.setItem(STORAGE_KEY, paraPersistir(updatedUser));
					}
					return { ...state, user: updatedUser };
				}
				return state;
			});
		},

		updateDadosFluxograma(
			dados: UserModel['dadosFluxograma'],
			cargaHorariaIntegralizada?: UserModel['cargaHorariaIntegralizada']
		) {
			update((state) => {
				if (state.user) {
					const updatedUser = {
						...state.user,
						dadosFluxograma: dados,
						...(cargaHorariaIntegralizada !== undefined && { cargaHorariaIntegralizada })
					};
					if (browser) {
						localStorage.setItem(STORAGE_KEY, paraPersistir(updatedUser));
					}
					return { ...state, user: updatedUser };
				}
				return state;
			});
		},

		clear() {
			if (browser) {
				localStorage.removeItem(STORAGE_KEY);
				localStorage.removeItem(ANON_KEY);
				localStorage.removeItem(DEV_IMPERSONATE_KEY);
				// Remove anonymous cookie
				document.cookie = 'nofluxo_anonimo=; path=/; max-age=0';
			}
			set({
				user: null,
				isAuthenticated: false,
				isAnonymous: false,
				isLoading: false,
				error: null
			});
		},

		getUser(): UserModel | null {
			return get({ subscribe }).user;
		},

		isLoggedIn(): boolean {
			const state = get({ subscribe });
			return state.isAuthenticated || state.isAnonymous;
		}
	};
}

export const authStore = createAuthStore();

// Derived stores for convenience
export const currentUser = derived(authStore, ($auth) => $auth.user);
export const isAuthenticated = derived(authStore, ($auth) => $auth.isAuthenticated);
export const isAnonymous = derived(authStore, ($auth) => $auth.isAnonymous);
export const isLoading = derived(authStore, ($auth) => $auth.isLoading);
export const authError = derived(authStore, ($auth) => $auth.error);
