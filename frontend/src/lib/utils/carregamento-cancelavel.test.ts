import { describe, it, expect, vi, afterEach } from 'vitest';
import { iniciarCarregamento } from '$lib/utils/carregamento-cancelavel';

/**
 * Pré-mortem R27: o $effect de integralização em /meu-fluxograma fazia só `.then`,
 * sem catch/finally. Uma rejeição do Supabase deixava `integralizacaoLoading`
 * preso em true (spinner eterno) e gerava unhandled rejection; e, sem
 * cancelamento, a resposta mais lenta vencia.
 */
const esperar = () => new Promise((r) => setTimeout(r, 0));

/** Réplica do effect da página, com o estado que a tela lê. */
function effectDeIntegralizacao(carregar: () => Promise<string | null>) {
	const tela = { integralizacao: null as string | null, loading: true };
	const cancelar = iniciarCarregamento(carregar, {
		ok: (r) => {
			tela.integralizacao = r;
		},
		erro: () => {
			tela.integralizacao = null;
		},
		fim: () => {
			tela.loading = false;
		}
	});
	return { tela, cancelar };
}

describe('iniciarCarregamento', () => {
	const unhandled: unknown[] = [];
	const onUnhandled = (e: unknown) => unhandled.push(e);
	process.on('unhandledRejection', onUnhandled);
	afterEach(() => {
		unhandled.length = 0;
	});

	it('rejeição desliga o loading e não vira unhandled rejection', async () => {
		const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { tela } = effectDeIntegralizacao(() =>
			Promise.reject(new Error('Erro ao buscar matriz: fetch failed'))
		);
		await esperar();
		await esperar();
		expect(tela.loading).toBe(false);
		expect(tela.integralizacao).toBeNull();
		expect(unhandled).toHaveLength(0);
		erro.mockRestore();
	});

	it('erro síncrono em carregar também desliga o loading', async () => {
		const { tela } = effectDeIntegralizacao(() => {
			throw new Error('boom');
		});
		await esperar();
		await esperar();
		expect(tela.loading).toBe(false);
	});

	it('execução cancelada (effect re-rodou) não sobrescreve a mais recente', async () => {
		let resolverA!: (v: string) => void;
		const tela = { integralizacao: null as string | null };
		const cancelarA = iniciarCarregamento(
			() => new Promise<string>((r) => (resolverA = r)),
			{ ok: (r) => (tela.integralizacao = r) }
		);
		// Troca de matriz: o effect re-roda, cancelando a execução anterior.
		cancelarA();
		iniciarCarregamento(() => Promise.resolve('B'), { ok: (r) => (tela.integralizacao = r) });
		await esperar();
		resolverA('A');
		await esperar();
		expect(tela.integralizacao).toBe('B');
	});
});
