/**
 * Darcy Store — a conversa ÚNICA com a Darcy, compartilhada por todas as telas
 * (Assistente, Plano de Formatura, Montador de Grade). Svelte 5 runes.
 *
 * Substitui os três chats que existiam (`assistenteChatStore`, `montadorChatStore`
 * e o chat embutido no `planoFormaturaStore`), cada um com histórico e backend
 * próprios — o aluno trocava de tela e a Darcy "esquecia" a conversa.
 *
 * Quem sabe quem é o aluno é o backend (lê do banco); este store só diz DE ONDE a
 * mensagem saiu. A tela ativa se registra com `registrarSuperficie` informando a
 * superfície, o estado dela (ex.: a grade aberta) e os handlers dos efeitos que a
 * resposta pode trazer (`opcaoGrade`, `plano`, `restricoes`). Sem tela registrada,
 * a mensagem vai como superfície `assistente`.
 */

import { authStore } from '$lib/stores/auth';
import {
	chatService,
	type EstadoSuperficie,
	type Superficie
} from '$lib/services/chat.service';
import { mensagemErroChat } from '$lib/utils/ai-errors';
import type {
	OpcaoGradeChat,
	PlannerChatMessage,
	PlanoFormaturav2,
	RestricoesPlano
} from '$lib/types/plano-formatura';

export interface RegistroSuperficie {
	superficie: Superficie;
	/** Lido na hora do envio — sempre o estado atual da tela, nunca uma foto velha. */
	estado?: () => EstadoSuperficie;
	onOpcaoGrade?: (opcao: OpcaoGradeChat) => void;
	onPlano?: (plano: PlanoFormaturav2) => void;
	onRestricoes?: (restricoes: RestricoesPlano) => void;
}

/**
 * Grade que a Darcy montou fora do Montador ("Abrir no Montador"): fica guardada
 * aqui até a rota do montador carregar e aplicar.
 */
export interface GradePendente {
	codigos: string[];
	/** Seleção pronta (backend/`opcaoGrade` ou pares do marcador); ausente = sugestão. */
	opcaoGrade?: OpcaoGradeChat;
}

function createDarcyStore() {
	let mensagens = $state<PlannerChatMessage[]>([]);
	let gradePendente: GradePendente | null = null;
	let carregando = $state(false);
	let error = $state<string | null>(null);

	/**
	 * Pedido de abertura do chat com um texto pré-preenchido — usado por controles
	 * fora do painel (ex.: "Pedir pra Darcy" no card de uma matéria do Montador).
	 * `nonce` garante que pedir a mesma matéria duas vezes seguidas dispare de novo.
	 */
	let pedidoAbertura = $state<{ texto: string; nonce: number } | null>(null);

	/** Pilha de telas registradas: a última é a ativa (layouts aninhados, navegação). */
	let registros: RegistroSuperficie[] = [];

	/** Histórico do servidor já carregado para este usuário? */
	let historicoDoUsuario: number | null = null;
	let historicoEmVoo: Promise<void> | null = null;

	let idUserAtual: number | null = null;
	authStore.subscribe((estado) => {
		const id = estado.user?.idUser ?? null;
		if (id === idUserAtual) return;
		idUserAtual = id;
		// Troca de usuário (login/logout): a conversa do anterior não pode vazar.
		mensagens = [];
		error = null;
		gradePendente = null;
		historicoDoUsuario = null;
		historicoEmVoo = null;
	});

	function registroAtivo(): RegistroSuperficie | undefined {
		return registros[registros.length - 1];
	}

	return {
		get mensagens() {
			return mensagens;
		},
		get carregando() {
			return carregando;
		},
		get error() {
			return error;
		},
		get pedidoAbertura() {
			return pedidoAbertura;
		},
		/** Superfície da tela ativa — `assistente` quando nenhuma está registrada. */
		get superficieAtiva(): Superficie {
			return registroAtivo()?.superficie ?? 'assistente';
		},

		/**
		 * A tela passa a ser a origem das mensagens. Devolve o cleanup — use dentro
		 * de `$effect` (ou onDestroy) pra desregistrar ao sair da tela.
		 */
		registrarSuperficie(registro: RegistroSuperficie): () => void {
			registros = [...registros, registro];
			void this.carregarHistorico();
			return () => {
				registros = registros.filter((r) => r !== registro);
			};
		},

		/**
		 * Traz a conversa salva no servidor — uma vez por usuário logado. Não
		 * sobrescreve o que já está na tela (ex.: uma mensagem enviada antes de o
		 * histórico chegar).
		 */
		carregarHistorico(): Promise<void> {
			if (idUserAtual === null) return Promise.resolve();
			if (historicoDoUsuario === idUserAtual) return Promise.resolve();
			if (historicoEmVoo) return historicoEmVoo;

			const dono = idUserAtual;
			historicoEmVoo = chatService
				.historico()
				.then((doServidor) => {
					if (dono !== idUserAtual) return; // trocou de usuário no meio
					historicoDoUsuario = dono;
					if (mensagens.length === 0) {
						mensagens = doServidor.map((m) => ({ role: m.role, content: m.content }));
					}
				})
				.catch(() => {
					// Sem histórico a conversa só começa vazia — não é erro pra mostrar.
				})
				.finally(() => {
					historicoEmVoo = null;
				});
			return historicoEmVoo;
		},

		/** Pede pra abrir o chat com `texto` já no campo de mensagem (não envia). */
		pedirAbertura(texto: string): void {
			pedidoAbertura = { texto, nonce: (pedidoAbertura?.nonce ?? 0) + 1 };
		},

		/** Consumido por quem atendeu o pedido (abriu o painel e aplicou o texto). */
		consumirPedidoAbertura(): void {
			pedidoAbertura = null;
		},

		/** Guarda a grade pra rota do montador aplicar quando abrir. */
		definirGradePendente(grade: GradePendente): void {
			gradePendente = grade;
		},

		/** Entrega a grade pendente uma única vez (quem consome aplica). */
		consumirGradePendente(): GradePendente | null {
			const g = gradePendente;
			gradePendente = null;
			return g;
		},

		async enviar(mensagem: string): Promise<void> {
			if (!mensagem.trim() || carregando) return;
			const registro = registroAtivo();
			mensagens = [...mensagens, { role: 'user', content: mensagem }];
			carregando = true;
			error = null;

			try {
				const resposta = await chatService.enviarMensagem(
					mensagem,
					registro?.superficie ?? 'assistente',
					registro?.estado?.()
				);
				// `opcaoGrade` fica na mensagem: o botão "Montar grade" do ChatPanel aplica
				// a seleção exata que o backend resolveu, em vez de recomputar pela tag.
				mensagens = [
					...mensagens,
					{ role: 'assistant', content: resposta.reply, opcaoGrade: resposta.opcaoGrade }
				];
				if (resposta.opcaoGrade) registro?.onOpcaoGrade?.(resposta.opcaoGrade);
				if (resposta.plano) registro?.onPlano?.(resposta.plano);
				if (resposta.restricoes) registro?.onRestricoes?.(resposta.restricoes);
			} catch (err) {
				// Bolha amigável: "sem créditos" da Maritaca ganha texto próprio;
				// o resto cai no fallback genérico (ver $lib/utils/ai-errors).
				const bolha = mensagemErroChat(err);
				error = bolha;
				mensagens = [...mensagens, { role: 'assistant', content: bolha }];
			} finally {
				carregando = false;
			}
		},

		/** Apaga a conversa no servidor e na tela — vale para todas as telas. */
		async novaConversa(): Promise<void> {
			if (carregando) return;
			try {
				await chatService.novaConversa();
				mensagens = [];
				error = null;
			} catch (err) {
				error = mensagemErroChat(err);
			}
		},

		/** Zera o estado local (testes / troca de conta). Não toca no servidor. */
		reset(): void {
			mensagens = [];
			carregando = false;
			error = null;
			pedidoAbertura = null;
			gradePendente = null;
			registros = [];
			historicoDoUsuario = null;
			historicoEmVoo = null;
		}
	};
}

export const darcyStore = createDarcyStore();
