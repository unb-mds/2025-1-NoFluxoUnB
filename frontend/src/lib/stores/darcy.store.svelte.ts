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

import { limparCacheGrade } from '$lib/services/grade-estado.service';
import { authStore } from '$lib/stores/auth';
import { chatService, type EstadoSuperficie, type Superficie } from '$lib/services/chat.service';
import { darcyCotaStore } from '$lib/stores/darcy-cota.store.svelte';
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

/** Quantas mensagens o navegador guarda — o bastante para a tela abrir cheia. */
const MAX_CACHE = 50;
const chaveCache = (idUser: number) => `darcy:conversa:${idUser}`;

/**
 * Cache local da conversa: a tela abre com ela na hora, sem esperar o
 * `/chat/historico`, que depois confirma (o servidor é a fonte de verdade).
 * `localStorage` pode não existir ou lançar (aba privada, SSR) — aí só não há cache.
 */
function lerCache(idUser: number): PlannerChatMessage[] {
	try {
		const bruto = localStorage.getItem(chaveCache(idUser));
		const lista = bruto ? JSON.parse(bruto) : [];
		return Array.isArray(lista) ? lista : [];
	} catch {
		return [];
	}
}

function gravarCache(idUser: number | null, mensagens: PlannerChatMessage[]): void {
	if (idUser === null) return;
	try {
		if (mensagens.length === 0) localStorage.removeItem(chaveCache(idUser));
		else localStorage.setItem(chaveCache(idUser), JSON.stringify(mensagens.slice(-MAX_CACHE)));
	} catch {
		// Sem espaço/sem storage: o cache é conveniência, a conversa continua no servidor.
	}
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

	/** Mensagem enviada desde que a tela abriu — o histórico do servidor não a sobrescreve. */
	let enviouAposAbrir = false;

	let idUserAtual: number | null = null;
	authStore.subscribe((estado) => {
		const id = estado.user?.idUser ?? null;
		if (id === idUserAtual) return;
		// Logout: a conversa não fica no navegador para o próximo que usar a máquina.
		if (id === null && idUserAtual !== null) {
			gravarCache(idUserAtual, []);
			limparCacheGrade();
		}
		idUserAtual = id;
		// Troca de usuário (login/logout): a conversa do anterior não pode vazar.
		mensagens = id === null ? [] : lerCache(id);
		enviouAposAbrir = false;
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
					// O servidor manda no que o cache mostrou — exceto se o aluno já
					// mandou algo nesta tela antes de o histórico chegar.
					if (!enviouAposAbrir) {
						mensagens = doServidor.map((m) => ({ role: m.role, content: m.content }));
						gravarCache(dono, mensagens);
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
			enviouAposAbrir = true;
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
					{
						role: 'assistant',
						content: resposta.reply,
						opcaoGrade: resposta.opcaoGrade,
						opcoesGrade: resposta.opcoesGrade,
						acoesGrade: resposta.acoesGrade
					}
				];
				gravarCache(idUserAtual, mensagens);
				if (resposta.cota) {
					darcyCotaStore.atualizar(resposta.cota);
				}
				if (resposta.opcaoGrade) registro?.onOpcaoGrade?.(resposta.opcaoGrade);
				if (resposta.plano) registro?.onPlano?.(resposta.plano);
				if (resposta.restricoes) registro?.onRestricoes?.(resposta.restricoes);
			} catch (err) {
				// Login (401), cota (429) e teto global (503) viram modal/card, não
				// bolha de erro — a pergunta volta pro aluno reenviar depois.
				const tipo = darcyCotaStore.tratarErro(err);
				if (tipo !== 'outro') {
					mensagens = mensagens.slice(0, -1);
					error = null;
					return;
				}
				// Bolha amigável: "sem créditos" da Maritaca ganha texto próprio;
				// o resto cai no fallback genérico (ver $lib/utils/ai-errors).
				const bolha = mensagemErroChat(err);
				error = bolha;
				mensagens = [...mensagens, { role: 'assistant', content: bolha }];
			} finally {
				carregando = false;
			}
		},

		/**
		 * Começa uma conversa nova — vale para todas as telas. A atual vai para
		 * "Conversas anteriores" e o que importava dela fica na memória da Darcy;
		 * com `esquecer`, apaga tudo (conversas e memória).
		 */
		async novaConversa(opcoes?: { esquecer?: boolean }): Promise<void> {
			if (carregando) return;
			try {
				if (opcoes?.esquecer) await chatService.novaConversa(true);
				else await chatService.novaConversa();
				mensagens = [];
				gravarCache(idUserAtual, []);
				error = null;
			} catch (err) {
				error = mensagemErroChat(err);
			}
		},

		/**
		 * Volta a uma conversa anterior: ela vira a atual (a atual é guardada nas
		 * anteriores pelo servidor). Lança se falhar — quem chamou mostra o erro.
		 */
		async retomarConversa(id: string): Promise<void> {
			if (carregando) return;
			const dono = idUserAtual;
			const doServidor = await chatService.retomarConversa(id);
			if (dono !== idUserAtual) return;
			mensagens = doServidor.map((m) => ({ role: m.role, content: m.content }));
			gravarCache(dono, mensagens);
			error = null;
		},

		/** Zera o estado local (testes / troca de conta). Não toca no servidor. */
		reset(): void {
			mensagens = [];
			enviouAposAbrir = false;
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
