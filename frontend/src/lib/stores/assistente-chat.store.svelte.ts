/**
 * Assistente Chat Store — chat-agente da aba Assistente (Svelte 5 runes).
 *
 * Espelha o fluxo do chat do planejador (histórico completo, request/response).
 * Rotea pra dois endpoints conforme o contexto: `opts.contexto === 'montador'`
 * (chat do Montador de Grade) vai pro pipeline novo em /chat/send (orquestrador +
 * atuadores); qualquer outro contexto (aba Assistente) segue pro legado
 * /assistente/chat. Monta o planoInput a partir de fluxograma + auth + preferências
 * salvas quando o aluno está logado — assim as tools de plano/histórico do agente
 * acendem. Anônimo/sem curso → só as tools genéricas.
 */

import { authStore } from '$lib/stores/auth';
import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
import { AssistenteService, type AssistentePlanoInput } from '$lib/services/assistente.service';
import { chatService } from '$lib/services/chat.service';
import { planoFormaturaService } from '$lib/services/plano-formatura.service';
import { mensagemErroChat } from '$lib/utils/ai-errors';
import type { PlannerChatMessage } from '$lib/types/plano-formatura';
import type { AuthState } from '$lib/types/auth';

function createAssistenteChatStore() {
	let chatMessages = $state<PlannerChatMessage[]>([]);
	let chatLoading = $state(false);
	let error = $state<string | null>(null);

	/**
	 * Pedido de abertura do chat com um texto pré-preenchido — usado por controles
	 * fora do próprio painel (ex.: botão "Pedir pra Darcy" no card de uma matéria do
	 * Montador de Grade) para abrir o `AssistenteChatFab`, que vive num componente
	 * irmão na árvore, com o campo de mensagem já começado.
	 * `nonce` garante que pedir a mesma matéria duas vezes seguidas dispare de novo.
	 */
	let pedidoAbertura = $state<{ texto: string; nonce: number } | null>(null);

	let authState = $state<AuthState>({
		user: null,
		isAuthenticated: false,
		isAnonymous: false,
		isLoading: true,
		error: null
	});
	authStore.subscribe((value) => {
		authState = value;
	});

	const service = new AssistenteService();

	// Cache das preferências salvas (evita refetch a cada mensagem).
	let prefsCache: { limiteCreditos: number; objetivo: 'velocidade' | 'equilibrio'; trabalha: boolean } | null = null;

	async function buildPlanoInput(): Promise<AssistentePlanoInput | null> {
		const curriculo = fluxogramaStore.state.courseData?.curriculoCompleto;
		const idUser = authState.user?.idUser;
		if (!curriculo || !idUser) return null; // sem curso/login → contexto leve

		if (!prefsCache) {
			try {
				const p = await planoFormaturaService.loadPreferencias(idUser);
				prefsCache = {
					limiteCreditos: p.limiteCreditos,
					objetivo: p.objetivo === 'velocidade' ? 'velocidade' : 'equilibrio',
					trabalha: p.trabalha
				};
			} catch {
				prefsCache = { limiteCreditos: 24, objetivo: 'equilibrio', trabalha: false };
			}
		}

		return {
			curriculoCompleto: curriculo,
			codigosConcluidos: [...fluxogramaStore.completedCodes],
			semestreAtual: authState.user?.dadosFluxograma?.semestreAtual ?? 1,
			limiteCreditos: prefsCache.limiteCreditos,
			objetivo: prefsCache.objetivo,
			trabalha: prefsCache.trabalha
		};
	}

	return {
		get chatMessages() { return chatMessages; },
		get chatLoading() { return chatLoading; },
		get error() { return error; },
		get pedidoAbertura() { return pedidoAbertura; },

		/** Pede pra abrir o chat com `texto` já no campo de mensagem (não envia sozinho). */
		pedirAbertura(texto: string): void {
			pedidoAbertura = { texto, nonce: (pedidoAbertura?.nonce ?? 0) + 1 };
		},

		/** Consumido por quem atendeu o pedido (abriu o painel e aplicou o texto). */
		consumirPedidoAbertura(): void {
			pedidoAbertura = null;
		},

		async enviarMensagem(
			mensagem: string,
			opts?: {
				contexto?: 'montador';
				curriculoCompleto?: string;
				horarioLivre?: string;
				turnos?: string[];
				codigosNaGrade?: string[];
			}
		): Promise<void> {
			if (!mensagem.trim() || chatLoading) return;
			chatMessages = [...chatMessages, { role: 'user', content: mensagem }];
			chatLoading = true;
			error = null;

			try {
				let reply: string;
				let opcaoGrade: PlannerChatMessage['opcaoGrade'];
				if (opts?.contexto === 'montador') {
					// Montador de Grade já migrou pro pipeline novo (orquestrador + atuadores).
					const resposta = await chatService.enviarMensagem(mensagem, {
						contexto: 'montador',
						curriculoCompleto: opts.curriculoCompleto,
						horarioLivre: opts.horarioLivre,
						turnos: opts.turnos,
						codigosNaGrade: opts.codigosNaGrade
					});
					reply = resposta.reply;
					// Quando o orquestrador já resolveu a montagem no backend, a seleção
					// exata vem pronta aqui — precisa sobreviver na mensagem pra o botão
					// "Montar grade" do ChatPanel aplicar via `gradeStore.aplicarSelecao`
					// em vez de recomputar a partir da tag de texto `[MONTAR_GRADE|...]`.
					opcaoGrade = resposta.opcaoGrade;
				} else {
					const planoInput = await buildPlanoInput();
					const resposta = await service.chatAgente(chatMessages, planoInput, undefined, opts?.contexto);
					reply = resposta.reply;
				}
				chatMessages = [...chatMessages, { role: 'assistant', content: reply, opcaoGrade }];
			} catch (err) {
				// Bolha amigável: "sem créditos" da Maritaca ganha texto próprio;
				// o resto cai no fallback genérico (ver $lib/utils/ai-errors).
				const bolha = mensagemErroChat(err);
				error = bolha;
				chatMessages = [...chatMessages, { role: 'assistant', content: bolha }];
			} finally {
				chatLoading = false;
			}
		},

		reset(): void {
			chatMessages = [];
			error = null;
		}
	};
}

/**
 * Uma instância POR CONTEXTO — os dois chats do Darcy conversam com backends
 * diferentes (`/assistente/chat` legado vs. `/chat/send`, que mantém a sessão
 * no servidor). Com um singleton compartilhado, o histórico de um vazava no
 * corpo da requisição do outro e o assistente respondia fora de contexto.
 */

/** Chat da página /assistente. */
export const assistenteChatStore = createAssistenteChatStore();

/** Chat do Montador de Grade (FAB flutuante). */
export const montadorChatStore = createAssistenteChatStore();
