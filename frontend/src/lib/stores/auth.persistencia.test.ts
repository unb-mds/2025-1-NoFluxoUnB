import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));

const STORAGE_KEY = 'nofluxo_user';

function fakeStorage(): Storage {
	const m = new Map<string, string>();
	return {
		get length() {
			return m.size;
		},
		clear: () => m.clear(),
		getItem: (k) => m.get(k) ?? null,
		key: (i) => [...m.keys()][i] ?? null,
		removeItem: (k) => void m.delete(k),
		setItem: (k, v) => void m.set(k, String(v))
	};
}

const usuario = {
	idUser: 7,
	email: 'aluno@unb.br',
	nomeCompleto: 'Aluno',
	dadosFluxograma: null,
	token: 'jwt-secreto',
	isAdmin: true,
	adminRole: 'superadmin' as const,
	adminScopes: ['dashboard']
};

beforeEach(() => {
	vi.resetModules();
	vi.stubGlobal('localStorage', fakeStorage());
});

describe('authStore — o que vai para o localStorage', () => {
	it('não grava papel de admin nem token, mas mantém em memória', async () => {
		const { authStore } = await import('./auth');
		authStore.setUser(usuario);

		const salvo = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(salvo).toMatchObject({ idUser: 7, email: 'aluno@unb.br' });
		for (const campo of ['isAdmin', 'adminRole', 'adminScopes', 'token']) {
			expect(salvo).not.toHaveProperty(campo);
		}
		expect(get(authStore).user?.isAdmin).toBe(true);
	});

	it('updateToken também não grava o token', async () => {
		const { authStore } = await import('./auth');
		authStore.setUser(usuario);
		authStore.updateToken('outro-jwt');
		expect(localStorage.getItem(STORAGE_KEY)).not.toContain('jwt');
	});

	it('cache antigo editado para admin não vira admin ao carregar', async () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ ...usuario, isAdmin: true, adminRole: 'superadmin', adminScopes: ['*'] })
		);
		const { authStore } = await import('./auth');
		const { user } = get(authStore);
		expect(user?.idUser).toBe(7);
		expect(user?.isAdmin).toBeFalsy();
		expect(user?.adminScopes).toBeUndefined();
		expect(user?.token).toBeUndefined();
	});
});
