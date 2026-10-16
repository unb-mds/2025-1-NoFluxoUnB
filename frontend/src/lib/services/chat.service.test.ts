import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/utils/api', () => ({
	apiRequest: vi.fn()
}));

import { apiRequest } from '$lib/utils/api';
import { ChatService } from './chat.service';

describe('ChatService (Darcy única, /chat/*)', () => {
	beforeEach(() => {
		vi.mocked(apiRequest).mockReset();
	});

	it('POST /chat/send leva só mensagem, superfície e estado — nada do aluno', async () => {
		vi.mocked(apiRequest).mockResolvedValue({ data: { reply: 'oi' }, error: null, status: 200 });

		const resultado = await new ChatService().enviarMensagem('quantos créditos faltam?', 'plano', {
			tipo: 'plano'
		});

		expect(apiRequest).toHaveBeenCalledWith('/chat/send', {
			method: 'POST',
			body: { message: 'quantos créditos faltam?', superficie: 'plano', estado: { tipo: 'plano' } }
		});
		expect(resultado).toEqual({ reply: 'oi' });
	});

	it('sem estado, o corpo não leva a chave estado', async () => {
		vi.mocked(apiRequest).mockResolvedValue({ data: { reply: 'ok' }, error: null, status: 200 });
		await new ChatService().enviarMensagem('oi', 'assistente');
		expect(apiRequest).toHaveBeenCalledWith('/chat/send', {
			method: 'POST',
			body: { message: 'oi', superficie: 'assistente' }
		});
	});

	it('lança erro legível quando /chat/send falha', async () => {
		vi.mocked(apiRequest).mockResolvedValue({ data: null, error: 'Token inválido.', status: 401 });
		await expect(new ChatService().enviarMensagem('oi', 'assistente')).rejects.toThrow(/401/);
	});

	it('GET /chat/historico devolve as mensagens', async () => {
		const mensagens = [
			{ role: 'user', content: 'oi' },
			{ role: 'assistant', content: 'olá!' }
		];
		vi.mocked(apiRequest).mockResolvedValue({ data: { mensagens }, error: null, status: 200 });

		expect(await new ChatService().historico()).toEqual(mensagens);
		expect(apiRequest).toHaveBeenCalledWith('/chat/historico');
	});

	it('POST /chat/nova-conversa', async () => {
		vi.mocked(apiRequest).mockResolvedValue({ data: { ok: true }, error: null, status: 200 });
		await new ChatService().novaConversa();
		expect(apiRequest).toHaveBeenCalledWith('/chat/nova-conversa', { method: 'POST' });
	});
});
