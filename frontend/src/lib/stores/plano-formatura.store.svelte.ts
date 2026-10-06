/**
 * Plano Formatura Store — Motor 2
 * Svelte 5 runes-based store for the graduation planner.
 * Wires together fluxogramaStore, authStore, and planoFormaturaService.
 */

import { authStore } from '$lib/stores/auth';
import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
import { planoFormaturaService } from '$lib/services/plano-formatura.service';
import { mensagemErroChat } from '$lib/utils/ai-errors';
import { darcyCotaStore } from '$lib/stores/darcy-cota.store.svelte';
import type {
	PlanoFormatura,
	PreferenciasPlano,
	PreferenciaModuloLivre,
	PlannerChatMessage,
	RestricoesPlano
} from '$lib/types/plano-formatura';
import {
	DEFAULT_PREFERENCIAS,
	LIMITE_CREDITOS_MAX,
	LIMITE_CREDITOS_MIN
} from '$lib/types/plano-formatura';
import type { AuthState } from '$lib/types/auth';

export type PlanoFormaturaStatus = 'idle' | 'loading' | 'success' | 'error';

export interface PlanoFormaturaStoreState {
	status: PlanoFormaturaStatus;
	plano: PlanoFormatura | null;
	preferencias: PreferenciasPlano;
	/** Erro descritivo ao gerar plano, se houver. */
	error: string | null;
	/** Indica se o modal de onboarding deve estar aberto. */
	showOnboarding: boolean;
	/** Mensagens do chat agente planejador. */
	chatMessages: PlannerChatMessage[];
	/** Restrições ativas (adiar/priorizar). */
	restricoes: RestricoesPlano;
	/** Estado do chat (carregando resposta). */
	chatLoading: boolean;
}

function createPlanoFormaturaStore() {
	// ─── State ────────────────────────────────────────────────────────────────

	let status = $state<PlanoFormaturaStatus>('idle');
	let plano = $state<PlanoFormatura | null>(null);
	let preferencias = $state<PreferenciasPlano>({ ...DEFAULT_PREFERENCIAS });
	let error = $state<string | null>(null);
	let showOnboarding = $state(false);
	let chatMessages = $state<PlannerChatMessage[]>([]);
	let restricoes = $state<RestricoesPlano>({ adiar: [], priorizar: [] });
	let chatLoading = $state(false);

	// Mirror the Svelte 4 writable authStore into a $state variable so that
	// $derived expressions can reactively track auth changes.
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

	// ─── Derived ──────────────────────────────────────────────────────────────

	/** Semestres restantes — compatível com v1 (snake_case) e v2 (camelCase). */
	const semestresRestantes = $derived(
		(plano as any)?.semestresRestantes ?? (plano as any)?.semestres_restantes ?? null
	);

	/** Formatura estimada — compatível com v1 e v2. */
	const formaturaEstimada = $derived(
		(plano as any)?.formaturaEstimada ?? (plano as any)?.formatura_estimada ?? null
	);

	/** true quando o usuário ainda não concluiu o onboarding. */
	const needsOnboarding = $derived(!preferencias.onboardingConcluido);

	// ─── Internal helpers ─────────────────────────────────────────────────────

	function getIdUser(): number | null {
		return authState.user?.idUser ?? null;
	}

	function getCurriculoCompleto(): string | null {
		return fluxogramaStore.state.courseData?.curriculoCompleto ?? null;
	}

	function getSemestreAtual(): number {
		return authState.user?.dadosFluxograma?.semestreAtual ?? 1;
	}

	function getCodigosConcluidos(): string[] {
		return [...fluxogramaStore.completedCodes];
	}

	// ─── Public API ───────────────────────────────────────────────────────────


	return {
		// Expose reactive state as getters
		get status() { return status; },
		get plano() { return plano; },
		get preferencias() { return preferencias; },
		get error() { return error; },
		get showOnboarding() { return showOnboarding; },
		get semestresRestantes() { return semestresRestantes; },
		get formaturaEstimada() { return formaturaEstimada; },
		get needsOnboarding() { return needsOnboarding; },
		get chatMessages() { return chatMessages; },
		get restricoes() { return restricoes; },
		get chatLoading() { return chatLoading; },


		/**
		 * Carrega preferências do usuário a partir do Supabase.
		 * Se não houver preferências salvas, mantém os defaults e abre o onboarding.
		 */
		async loadPreferencias(): Promise<void> {
			const idUser = getIdUser();
			if (!idUser) {
				// Usuário não autenticado — usa defaults sem abrir onboarding
				preferencias = { ...DEFAULT_PREFERENCIAS };
				return;
			}

			try {
				const prefs = await planoFormaturaService.loadPreferencias(idUser);
				preferencias = prefs;
				
				if (prefs.restricoes) {
					restricoes = prefs.restricoes;
				}

				if (!prefs.onboardingConcluido) {
					showOnboarding = true;
				}
			} catch {
				preferencias = { ...DEFAULT_PREFERENCIAS };
				showOnboarding = true;
			}
		},

		/**
		 * Gera o plano de formatura chamando o backend (Motor 2).
		 * Atualiza status, plano e error reativamente.
		 */
		async gerar(): Promise<void> {
			const curriculoCompleto = getCurriculoCompleto();
			if (!curriculoCompleto) {
				error = 'Dados do curso não carregados. Acesse seu fluxograma primeiro.';
				status = 'error';
				return;
			}

			status = 'loading';
			error = null;

			try {
				const resultado = await planoFormaturaService.gerarPlano({
					curriculoCompleto,
					codigosConcluidos: getCodigosConcluidos(),
					semestreAtual: getSemestreAtual(),
					limiteCreditos: preferencias.limiteCreditos
				});
				plano = resultado;
				status = 'success';
			} catch (err) {
				const msg = err instanceof Error ? err.message : 'Erro ao gerar plano de formatura.';
				error = msg;
				status = 'error';
				plano = null;
			}
		},

		/**
		 * Persiste as preferências e fecha o onboarding. Em seguida, regenera o plano.
		 */
		async savePreferencias(novasPreferencias: PreferenciasPlano): Promise<void> {
			preferencias = { ...novasPreferencias, onboardingConcluido: true };
			showOnboarding = false;

			const idUser = getIdUser();
			if (idUser) {
				try {
					await planoFormaturaService.savePreferencias(idUser, preferencias);
				} catch {
					// Falha silenciosa — preferências ficam em memória
				}
			}

			// Regenera o plano com as novas preferências
			await this.gerar();
		},

		/**
		 * Guarda a resposta do aluno sobre módulo livre no Montador.
		 *
		 * Único caminho de escrita desse campo, e de propósito: `savePreferencias`
		 * grava o objeto de preferências INTEIRO a partir do estado em memória, então
		 * escrever por fora faria a próxima mexida no slider apagar a resposta.
		 *
		 * Não regenera o plano — a preferência é do Montador (Motor 1), não do plano
		 * de formatura, e regenerar custaria uma volta ao backend por nada.
		 */
		async setPreferenciaModuloLivre(moduloLivre: PreferenciaModuloLivre): Promise<void> {
			preferencias = { ...preferencias, moduloLivre };

			const idUser = getIdUser();
			if (!idUser) return;
			try {
				await planoFormaturaService.savePreferencias(idUser, preferencias);
			} catch {
				// Best-effort: vale nesta sessão mesmo se o banco falhar; o aluno só
				// terá de responder de novo numa próxima visita.
			}
		},

		/**
		 * Guarda o limite de créditos SEM regenerar o plano.
		 *
		 * É o que o slider do Montador usa. Ele mexe na mesma preferência do plano de
		 * formatura — limite de carga por semestre é um só —, mas arrastar o slider
		 * lá não pode disparar uma volta ao backend a cada ajuste, e o Montador
		 * precisa funcionar mesmo com o plano indisponível. O plano se atualiza na
		 * próxima vez que for gerado.
		 *
		 * Sem isto o valor vivia só na sessão da tela e voltava ao padrão a cada
		 * recarga, desfazendo em silêncio a escolha do aluno.
		 */
		async salvarLimiteCreditos(limite: number): Promise<void> {
			// Trava na faixa aceita pelo resto do sistema: o que for salvo aqui abre a
			// próxima visita, e um zero persistido deixaria o aluno sem nenhuma
			// matéria semeada e sem pista do porquê.
			const dentroDaFaixa = Math.min(
				LIMITE_CREDITOS_MAX,
				Math.max(LIMITE_CREDITOS_MIN, Math.round(limite))
			);
			if (preferencias.limiteCreditos === dentroDaFaixa) return;
			preferencias = { ...preferencias, limiteCreditos: dentroDaFaixa };

			const idUser = getIdUser();
			if (!idUser) return;
			try {
				await planoFormaturaService.savePreferencias(idUser, preferencias);
			} catch {
				// Best-effort: vale nesta sessão mesmo se o banco falhar.
			}
		},

		/**
		 * Atualiza apenas o limite de créditos e regenera o plano imediatamente.
		 * Usado pelo slider de carga (8–32 créditos) na PlanoFormaturaView.
		 */
		async setLimiteCreditos(limite: number): Promise<void> {
			if (preferencias.limiteCreditos === limite) return;
			preferencias = { ...preferencias, limiteCreditos: limite };

			const idUser = getIdUser();
			if (idUser) {
				try {
					await planoFormaturaService.savePreferencias(idUser, preferencias);
				} catch {
					// Falha silenciosa
				}
			}

			await this.gerar();
		},

		/**
		 * Abre o modal de onboarding (ex: botão "Ajustar preferências").
		 */
		openOnboarding(): void {
			showOnboarding = true;
		},

		/**
		 * Fecha o modal de onboarding sem salvar.
		 */
		closeOnboarding(): void {
			showOnboarding = false;
		},


		/**
		 * Envia uma mensagem para o agente planejador e recebe resposta com possível atualização de plano.
		 */
		async enviarMensagem(mensagem: string): Promise<void> {
			chatMessages = [...chatMessages, { role: 'user', content: mensagem }];
			chatLoading = true;

			try {
				const curriculo = getCurriculoCompleto();
				if (!curriculo) throw new Error('Dados do curso não carregados');

				const resposta = await planoFormaturaService.chat(
					chatMessages,
					{
						curriculoCompleto: curriculo,
						codigosConcluidos: getCodigosConcluidos(),
						semestreAtual: getSemestreAtual(),
						limiteCreditos: preferencias.limiteCreditos,
						objetivo: preferencias.objetivo,
						trabalha: preferencias.trabalha
					},
					restricoes
				);

				// Atualiza chat com resposta do agente
				chatMessages = [...chatMessages, { role: 'assistant', content: resposta.reply }];
				darcyCotaStore.atualizar(resposta.cota);

				// Se o agente retornar um plano atualizado, usa-o
				if (resposta.plano) {
					plano = resposta.plano;
				}

				// Atualiza restrições e persiste no backend em background
				if (resposta.restricoes) {
					restricoes = resposta.restricoes;
					preferencias = { ...preferencias, restricoes: resposta.restricoes };
					
					const idUser = getIdUser();
					if (idUser) {
						// Salva de forma silenciosa para o usuário não perder as edições do bot
						planoFormaturaService.savePreferencias(idUser, preferencias).catch(() => {
							console.warn('Falha ao persistir restrições do agente em background.');
						});
					}
				}
			} catch (err) {
				// Login (401), cota (429) e teto global (503) viram modal/card do
				// Darcy, não bolha de erro.
				if (darcyCotaStore.tratarErro(err) !== 'outro') {
					chatMessages = chatMessages.slice(0, -1);
					return;
				}
				// Antes o chat ficava mudo em erro (só setava `error`, que ninguém
				// renderiza). Agora responde com bolha: texto próprio pra "sem
				// créditos" da Maritaca, fallback genérico pro resto.
				const bolha = mensagemErroChat(err);
				error = bolha;
				chatMessages = [...chatMessages, { role: 'assistant', content: bolha }];
			} finally {
				chatLoading = false;
			}
		},

		/**
		 * Remove um código das restrições de adiar ou priorizar.
		 */
		removerRestricao(codigo: string, tipo: 'adiar' | 'priorizar'): void {
			restricoes = {
				...restricoes,
				[tipo]: restricoes[tipo].filter((c) => c !== codigo)
			};
		},

		/**
		 * Limpa o histórico do chat (ex: ao gerar novo plano).
		 */
		clearChat(): void {
			chatMessages = [];
			chatLoading = false;
		},

		/**
		 * Reseta o store para o estado inicial.
		 */
		reset(): void {
			status = 'idle';
			plano = null;
			preferencias = { ...DEFAULT_PREFERENCIAS };
			error = null;
			showOnboarding = false;
			chatMessages = [];
			restricoes = { adiar: [], priorizar: [] };
			chatLoading = false;

			const idUser = getIdUser();
			if (idUser) {
				planoFormaturaService.savePreferencias(idUser, preferencias).catch(() => {});
			}
		}
	};
}

export const planoFormaturaStore = createPlanoFormaturaStore();
