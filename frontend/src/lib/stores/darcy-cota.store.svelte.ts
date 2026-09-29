/**
 * Estado compartilhado da cota do Darcy (Svelte 5 runes) — um só para os três
 * chats (página /assistente, FAB do Montador, Plano de Formatura), porque a
 * cota é do aluno e não do chat.
 *
 * - `cota`: alimenta a rodinha; vem de GET /assistente/cota e do campo `cota`
 *   de cada resposta de IA;
 * - `bloqueio`: 'cota' (429, card "Você usou suas N perguntas") ou 'teto'
 *   (503 TETO_GLOBAL) — o campo de texto fica desabilitado;
 * - `loginAberto`: modal "Faça login para usar o assistente" (anônimo ou 401).
 */

import {
	classificarErroIA,
	cotaRenovou,
	type CotaIA,
	type TipoErroIA
} from '$lib/utils/darcy-cota';

export type BloqueioDarcy = 'cota' | 'teto' | null;

function createDarcyCotaStore() {
	let cota = $state<CotaIA | null>(null);
	let bloqueio = $state<BloqueioDarcy>(null);
	let loginAberto = $state(false);
	let pedidoAberto = $state(false);
	let mensagemTeto = $state<string | null>(null);

	// Passou da meia-noite de Brasília: o bloqueio cai sozinho (sem mutar
	// estado dentro de um getter lido no template).
	const renovou = () => cota !== null && cotaRenovou(cota);

	return {
		get cota() {
			if (cota && renovou()) return { ...cota, usadas: 0, restantes: cota.limite };
			return cota;
		},
		get bloqueio() {
			if (bloqueio && renovou()) return null;
			return bloqueio;
		},
		get loginAberto() {
			return loginAberto;
		},
		get pedidoAberto() {
			return pedidoAberto;
		},
		get mensagemTeto() {
			return mensagemTeto;
		},

		/** Atualiza com o `cota` de uma resposta de sucesso. */
		atualizar(nova: CotaIA | null | undefined): void {
			if (!nova) return;
			cota = nova;
			// Última pergunta do dia respondida: já mostra o card em vez de
			// esperar o 429 da próxima tentativa.
			if (nova.usadas >= nova.limite) bloqueio = 'cota';
			else if (bloqueio === 'cota') bloqueio = null;
			if (bloqueio === 'teto') {
				bloqueio = null;
				mensagemTeto = null;
			}
		},

		/** Carrega o estado atual (rodinha ao abrir a página). Silencioso em erro. */
		async carregar(): Promise<void> {
			try {
				const { apiRequest } = await import('$lib/utils/api');
				const { data, status } = await apiRequest<{ cota: CotaIA }>('/assistente/cota');
				if (status === 401) return;
				if (data?.cota) {
					cota = data.cota;
					bloqueio = data.cota.usadas >= data.cota.limite ? 'cota' : bloqueio === 'cota' ? null : bloqueio;
				}
			} catch {
				// Sem rodinha: o chat segue funcionando.
			}
		},

		/**
		 * Trata o erro de um serviço de IA. Devolve o tipo: 'login' (abriu o modal),
		 * 'cota' (card de limite), 'teto' (assistente pausado) ou 'outro' (o chamador
		 * mostra a bolha de erro de sempre).
		 */
		tratarErro(erro: unknown): TipoErroIA {
			const c = classificarErroIA(erro);
			if (c.tipo === 'login') loginAberto = true;
			if (c.tipo === 'cota') {
				bloqueio = 'cota';
				if (c.cota) cota = c.cota;
			}
			if (c.tipo === 'teto') {
				bloqueio = 'teto';
				mensagemTeto = c.mensagem ?? null;
			}
			return c.tipo;
		},

		abrirLogin(): void {
			loginAberto = true;
		},
		fecharLogin(): void {
			loginAberto = false;
		},
		abrirPedido(): void {
			pedidoAberto = true;
		},
		fecharPedido(): void {
			pedidoAberto = false;
		},

		/** Só para testes. */
		_reset(): void {
			cota = null;
			bloqueio = null;
			loginAberto = false;
			pedidoAberto = false;
			mensagemTeto = null;
		}
	};
}

export const darcyCotaStore = createDarcyCotaStore();
