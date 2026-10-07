/**
 * Darcy única: uma conversa só entre Assistente, Plano e Montador; cada tela
 * só informa de onde a mensagem saiu (superfície + estado) e trata os efeitos
 * da resposta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/chat.service', () => ({
	chatService: {
		enviarMensagem: vi.fn(),
		historico: vi.fn(),
		novaConversa: vi.fn()
	}
}));

// Store svelte mínimo com usuário logado; `definirUsuario` simula login/logout.
// `vi.hoisted` porque `vi.mock` sobe para o topo do arquivo.
type Auth = { user: { idUser: number } | null };
const auth = vi.hoisted(() => ({
	ouvintes: new Set<(v: { user: { idUser: number } | null }) => void>(),
	estado: { user: { idUser: 7 } } as { user: { idUser: number } | null }
}));
vi.mock('$lib/stores/auth', () => ({
	authStore: {
		subscribe: (fn: (v: Auth) => void) => {
			auth.ouvintes.add(fn);
			fn(auth.estado);
			return () => auth.ouvintes.delete(fn);
		}
	}
}));
function definirUsuario(idUser: number | null) {
	auth.estado = { user: idUser === null ? null : { idUser } };
	for (const fn of auth.ouvintes) fn(auth.estado);
}

import { chatService } from '$lib/services/chat.service';
import { darcyStore } from './darcy.store.svelte';
import type { EstadoMontador } from '$lib/services/chat.service';

const enviar = vi.mocked(chatService.enviarMensagem);
const historico = vi.mocked(chatService.historico);
const novaConversa = vi.mocked(chatService.novaConversa);

describe('darcyStore', () => {
	beforeEach(() => {
		enviar.mockReset();
		historico.mockReset().mockResolvedValue([]);
		novaConversa.mockReset().mockResolvedValue(undefined);
		darcyStore.reset();
	});

	it('a conversa é a mesma em todas as telas', async () => {
		enviar.mockResolvedValue({ reply: 'resposta' });

		const sairPlano = darcyStore.registrarSuperficie({ superficie: 'plano' });
		await darcyStore.enviar('pergunta no plano');
		sairPlano();

		darcyStore.registrarSuperficie({ superficie: 'montador' });
		await darcyStore.enviar('pergunta no montador');

		expect(darcyStore.mensagens.map((m) => m.content)).toEqual([
			'pergunta no plano',
			'resposta',
			'pergunta no montador',
			'resposta'
		]);
	});

	it('cada tela manda a própria superfície e o estado atual', async () => {
		enviar.mockResolvedValue({ reply: 'ok' });

		await darcyStore.enviar('sem tela');
		expect(enviar).toHaveBeenLastCalledWith('sem tela', 'assistente', undefined);

		const sairPlano = darcyStore.registrarSuperficie({
			superficie: 'plano',
			estado: () => ({ tipo: 'plano', semestreFoco: 2 })
		});
		await darcyStore.enviar('no plano');
		expect(enviar).toHaveBeenLastCalledWith('no plano', 'plano', { tipo: 'plano', semestreFoco: 2 });
		sairPlano();

		let grade: EstadoMontador['grade'] = [];
		darcyStore.registrarSuperficie({
			superficie: 'montador',
			estado: () => ({
				tipo: 'montador',
				grade,
				creditos: grade.length * 4,
				turnos: ['M'],
				incluirCursando: true,
				horarioLivre: '123'
			})
		});
		grade = [{ codigo: 'FGA0001', idTurma: 10 }]; // estado lido na hora do envio
		await darcyStore.enviar('no montador');
		expect(enviar).toHaveBeenLastCalledWith('no montador', 'montador', {
			tipo: 'montador',
			grade: [{ codigo: 'FGA0001', idTurma: 10 }],
			creditos: 4,
			turnos: ['M'],
			incluirCursando: true,
			horarioLivre: '123'
		});
	});

	it('plano e restrições da resposta vão para os handlers da tela ativa', async () => {
		const plano = { plano: [], semestresRestantes: 3 } as never;
		const restricoes = { adiar: ['MAT0026'], priorizar: [] };
		enviar.mockResolvedValue({ reply: 'adiei', plano, restricoes });
		const onPlano = vi.fn();
		const onRestricoes = vi.fn();
		darcyStore.registrarSuperficie({ superficie: 'plano', onPlano, onRestricoes });

		await darcyStore.enviar('adia cálculo 2');

		expect(onPlano).toHaveBeenCalledWith(plano);
		expect(onRestricoes).toHaveBeenCalledWith(restricoes);
	});

	it('opcaoGrade fica na mensagem e chega ao handler do montador', async () => {
		const opcaoGrade = { estrategia: 'Menos dias', selecao: [{ codigo: 'IFD0171', idTurma: 2 }] };
		enviar.mockResolvedValue({ reply: 'montei', opcaoGrade });
		const onOpcaoGrade = vi.fn();
		darcyStore.registrarSuperficie({ superficie: 'montador', onOpcaoGrade });

		await darcyStore.enviar('monta minha grade');

		expect(darcyStore.mensagens.at(-1)?.opcaoGrade).toEqual(opcaoGrade);
		expect(onOpcaoGrade).toHaveBeenCalledWith(opcaoGrade);
	});

	it('erro vira bolha amigável em vez de chat mudo', async () => {
		enviar.mockRejectedValue(new Error('Erro 500 ao chamar /chat/send'));
		await darcyStore.enviar('oi');
		const ultima = darcyStore.mensagens.at(-1);
		expect(ultima?.role).toBe('assistant');
		expect(ultima?.content.length).toBeGreaterThan(0);
		expect(darcyStore.carregando).toBe(false);
	});

	it('carrega o histórico do servidor uma vez por usuário', async () => {
		historico.mockResolvedValue([
			{ role: 'user', content: 'antes' },
			{ role: 'assistant', content: 'resposta antiga' }
		]);

		await darcyStore.carregarHistorico();
		await darcyStore.carregarHistorico();

		expect(historico).toHaveBeenCalledTimes(1);
		expect(darcyStore.mensagens.map((m) => m.content)).toEqual(['antes', 'resposta antiga']);
	});

	it('trocar de usuário apaga a conversa do anterior', async () => {
		enviar.mockResolvedValue({ reply: 'ok' });
		await darcyStore.enviar('segredo do aluno 7');
		definirUsuario(8);
		expect(darcyStore.mensagens).toHaveLength(0);
		definirUsuario(7);
	});

	it('novaConversa apaga no servidor e na tela', async () => {
		enviar.mockResolvedValue({ reply: 'ok' });
		await darcyStore.enviar('oi');

		await darcyStore.novaConversa();

		expect(novaConversa).toHaveBeenCalledTimes(1);
		expect(darcyStore.mensagens).toHaveLength(0);
	});

	it('pedirAbertura entrega o texto e é consumido', () => {
		darcyStore.pedirAbertura('Quero Física 1 (IFD0171)');
		expect(darcyStore.pedidoAbertura?.texto).toBe('Quero Física 1 (IFD0171)');
		darcyStore.consumirPedidoAbertura();
		expect(darcyStore.pedidoAbertura).toBeNull();
	});

	it('grade pendente ("Abrir no Montador") é entregue uma única vez', () => {
		const opcaoGrade = { estrategia: 'Darcy', selecao: [{ codigo: 'IFD0171', idTurma: 12 }] };
		darcyStore.definirGradePendente({ codigos: ['IFD0171'], opcaoGrade });
		expect(darcyStore.consumirGradePendente()).toEqual({ codigos: ['IFD0171'], opcaoGrade });
		expect(darcyStore.consumirGradePendente()).toBeNull();
	});

	it('reset descarta a grade pendente', () => {
		darcyStore.definirGradePendente({ codigos: ['MAT0026'] });
		darcyStore.reset();
		expect(darcyStore.consumirGradePendente()).toBeNull();
	});
});
