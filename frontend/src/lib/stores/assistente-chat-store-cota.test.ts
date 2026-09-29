/**
 * Chat do Darcy × login obrigatório e cota diária: 401 abre o modal de login,
 * 429 vira o card de limite (sem bolha de erro), 503 TETO_GLOBAL pausa o chat
 * e toda resposta de sucesso atualiza a rodinha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErroIA } from '$lib/utils/darcy-cota';

var mockChatAgente = vi.fn();
vi.mock('$lib/services/chat.service', () => ({
	chatService: { enviarMensagem: vi.fn() }
}));
vi.mock('$lib/services/assistente.service', () => {
	class AssistenteService {
		chatAgente = (...a: unknown[]) => mockChatAgente(...a);
	}
	return { AssistenteService };
});
vi.mock('$lib/stores/auth', () => ({
	authStore: {
		subscribe: (fn: (v: unknown) => void) => {
			fn({ user: null, isAuthenticated: false, isAnonymous: false, isLoading: false, error: null });
			return () => {};
		}
	}
}));
vi.mock('$lib/stores/fluxograma.store.svelte', () => ({
	fluxogramaStore: { state: { courseData: null }, completedCodes: new Set() }
}));
vi.mock('$lib/services/plano-formatura.service', () => ({
	planoFormaturaService: { loadPreferencias: vi.fn() }
}));

import { assistenteChatStore } from './assistente-chat.store.svelte';
import { darcyCotaStore } from './darcy-cota.store.svelte';

const COTA = { usadas: 12, limite: 30, restantes: 18, renova_em: '2099-01-01T03:00:00.000Z' };

describe('assistenteChatStore × cota do Darcy', () => {
	beforeEach(() => {
		mockChatAgente.mockReset();
		assistenteChatStore.reset();
		darcyCotaStore._reset();
	});

	it('resposta de sucesso atualiza a rodinha', async () => {
		mockChatAgente.mockResolvedValue({ reply: 'oi', cota: COTA });
		await assistenteChatStore.enviarMensagem('oi');
		expect(darcyCotaStore.cota).toEqual(COTA);
		expect(assistenteChatStore.chatMessages.at(-1)).toEqual({ role: 'assistant', content: 'oi' });
	});

	it('401 LOGIN_NECESSARIO abre o modal de login, sem bolha de erro', async () => {
		mockChatAgente.mockRejectedValue(new ErroIA(401, '{"codigo":"LOGIN_NECESSARIO"}', 'assistente'));
		await assistenteChatStore.enviarMensagem('oi');

		expect(darcyCotaStore.loginAberto).toBe(true);
		expect(assistenteChatStore.chatMessages).toEqual([]);
		expect(assistenteChatStore.error).toBeNull();
	});

	it('429 COTA_DIARIA mostra o card de limite (bloqueio) em vez de erro', async () => {
		mockChatAgente.mockRejectedValue(
			new ErroIA(
				429,
				JSON.stringify({ codigo: 'COTA_DIARIA', usadas: 30, limite: 30, renova_em: '2099-01-01T03:00:00.000Z' }),
				'assistente'
			)
		);
		await assistenteChatStore.enviarMensagem('mais uma');

		expect(darcyCotaStore.bloqueio).toBe('cota');
		expect(darcyCotaStore.cota).toMatchObject({ usadas: 30, limite: 30, restantes: 0 });
		expect(assistenteChatStore.chatMessages).toEqual([]);
	});

	it('503 TETO_GLOBAL pausa o chat com a mensagem própria', async () => {
		mockChatAgente.mockRejectedValue(new ErroIA(503, '{"codigo":"TETO_GLOBAL"}', 'assistente'));
		await assistenteChatStore.enviarMensagem('oi');

		expect(darcyCotaStore.bloqueio).toBe('teto');
		expect(darcyCotaStore.mensagemTeto).toBe('O assistente atingiu o limite de uso de hoje. Volta amanhã.');
	});

	it('erro comum continua virando bolha', async () => {
		mockChatAgente.mockRejectedValue(new ErroIA(500, 'boom', 'assistente'));
		await assistenteChatStore.enviarMensagem('oi');

		expect(darcyCotaStore.bloqueio).toBeNull();
		expect(darcyCotaStore.loginAberto).toBe(false);
		expect(assistenteChatStore.chatMessages.at(-1)?.role).toBe('assistant');
	});

	it('o bloqueio de cota cai quando uma concessão libera mais perguntas', () => {
		darcyCotaStore.tratarErro(
			new ErroIA(429, JSON.stringify({ codigo: 'COTA_DIARIA', usadas: 30, limite: 30, renova_em: '2099-01-01T03:00:00.000Z' }), 'x')
		);
		expect(darcyCotaStore.bloqueio).toBe('cota');
		darcyCotaStore.atualizar({ usadas: 30, limite: 60, restantes: 30, renova_em: '2099-01-01T03:00:00.000Z' });
		expect(darcyCotaStore.bloqueio).toBeNull();
	});

	it('o bloqueio some sozinho depois da meia-noite de Brasília', () => {
		darcyCotaStore.tratarErro(
			new ErroIA(429, JSON.stringify({ codigo: 'COTA_DIARIA', usadas: 30, limite: 30, renova_em: '2000-01-01T03:00:00.000Z' }), 'x')
		);
		expect(darcyCotaStore.bloqueio).toBeNull();
		expect(darcyCotaStore.cota).toMatchObject({ usadas: 0, restantes: 30 });
	});
});
