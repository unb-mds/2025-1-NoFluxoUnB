/**
 * Toda chamada de IA manda o token: o backend exige login (401
 * LOGIN_NECESSARIO) e conta a pergunta na cota do aluno do token. Antes,
 * sendMessage/sendMessageToSabia e o stream usavam fetch cru sem Authorization.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/services/auth.service', () => ({
	authService: {
		getAuthHeaders: vi.fn(async () => ({
			Authorization: 'token-do-aluno',
			'User-ID': '7',
			'Content-Type': 'application/json'
		}))
	}
}));
vi.mock('$lib/utils/api', () => ({ apiRequest: vi.fn() }));
vi.mock('$lib/config', () => ({ config: { apiUrl: 'http://api.test' } }));

import { apiRequest } from '$lib/utils/api';
import { AssistenteService, type StreamEvent } from './assistente.service';
import { ErroIA } from '$lib/utils/darcy-cota';

const fetchOriginal = globalThis.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function headersDaChamada(i = 0): Record<string, string> {
	return fetchMock.mock.calls[i][1].headers as Record<string, string>;
}

beforeEach(() => {
	fetchMock = vi.fn();
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	vi.mocked(apiRequest).mockReset();
});

afterEach(() => {
	globalThis.fetch = fetchOriginal;
});

describe('AssistenteService manda o token em todas as chamadas de IA', () => {
	it('sendMessageToSabia', async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ resultado: 'ok' }), { status: 200 }));
		await new AssistenteService().sendMessageToSabia('IA');
		expect(headersDaChamada()).toMatchObject({ Authorization: 'token-do-aluno' });
	});

	it('sendMessage (RAGFlow/Sabiá)', async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ resultado: 'ok' }), { status: 200 }));
		await new AssistenteService().sendMessage('IA', 'ragflow');
		expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/assistente/analyze');
		expect(headersDaChamada()).toMatchObject({ Authorization: 'token-do-aluno' });
	});

	it('stream: manda o token e repassa o evento `cota`', async () => {
		const cota = { usadas: 3, limite: 30, restantes: 27, renova_em: '2026-09-30T03:00:00.000Z' };
		const corpo =
			`data: ${JSON.stringify({ stage: 'cota', cota })}\n\n` +
			`data: ${JSON.stringify({ stage: 'done', resultado: 'ok' })}\n\n`;
		fetchMock.mockResolvedValue(new Response(corpo, { status: 200 }));

		const eventos: StreamEvent[] = [];
		await new AssistenteService().streamMessageFromSabia('IA', (e) => eventos.push(e));

		expect(headersDaChamada()).toMatchObject({ Authorization: 'token-do-aluno' });
		expect(eventos[0]).toEqual({ stage: 'cota', cota });
	});

	it('chatAgente vai pelo apiRequest com autenticação (padrão requireAuth)', async () => {
		vi.mocked(apiRequest).mockResolvedValue({ data: { reply: 'oi' }, error: null, status: 200 });
		await new AssistenteService().chatAgente([{ role: 'user', content: 'oi' }]);
		const opcoes = vi.mocked(apiRequest).mock.calls[0][1] as { requireAuth?: boolean };
		expect(opcoes.requireAuth).not.toBe(false);
	});
});

describe('erros HTTP viram ErroIA com o corpo (para o modal/card)', () => {
	it('401 do stream', async () => {
		fetchMock.mockResolvedValue(new Response('{"codigo":"LOGIN_NECESSARIO"}', { status: 401 }));
		const p = new AssistenteService().streamMessageFromSabia('IA', () => {});
		await expect(p).rejects.toBeInstanceOf(ErroIA);
		await expect(p).rejects.toMatchObject({ status: 401, corpo: '{"codigo":"LOGIN_NECESSARIO"}' });
	});

	it('429 do sendMessageToSabia', async () => {
		fetchMock.mockResolvedValue(new Response('{"codigo":"COTA_DIARIA","usadas":30,"limite":30}', { status: 429 }));
		await expect(new AssistenteService().sendMessageToSabia('IA')).rejects.toMatchObject({ status: 429 });
	});

	it('chatAgente', async () => {
		vi.mocked(apiRequest).mockResolvedValue({ data: null, error: '{"codigo":"TETO_GLOBAL"}', status: 503 });
		await expect(new AssistenteService().chatAgente([])).rejects.toMatchObject({
			status: 503,
			corpo: '{"codigo":"TETO_GLOBAL"}'
		});
	});
});
