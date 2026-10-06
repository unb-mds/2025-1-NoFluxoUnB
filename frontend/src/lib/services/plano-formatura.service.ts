/**
 * Plano Formatura Service — Motor 2
 * Calls POST /planejamento/gerar-plano on the backend.
 * Also handles loading/saving user preferences via supabaseDataService.
 */

import type { PlanoFormatura, PlanoFormaturav2, PreferenciasPlano, PlannerChatMessage, PlannerChatResponse, RestricoesPlano } from '$lib/types/plano-formatura';
import { ErroIA } from '$lib/utils/darcy-cota';
import { DEFAULT_PREFERENCIAS } from '$lib/types/plano-formatura';
import { supabaseDataService } from './supabase-data.service';
import { apiRequest } from '$lib/utils/api';

export interface GerarPlanoPayload {
	/** Código completo do currículo (curriculo_completo). */
	curriculoCompleto: string;
	/** Conjunto de códigos de disciplinas já concluídas (uppercase). */
	codigosConcluidos: string[];
	/** Semestre atual do aluno (número ordinal). */
	semestreAtual: number;
	/** Limite de créditos por semestre escolhido no onboarding (8–32). */
	limiteCreditos: number;
}

export interface GerarPlanoError {
	message: string;
	status?: number;
}

class PlanoFormaturaService {
	/**
	 * Chama o backend (Motor 2) para gerar o plano de formatura personalizado.
	 * Retorna PlanoFormaturav2 conforme resposta do backend.
	 * Retorna null se o backend não estiver disponível — a UI deve mostrar estado de erro.
	 */
	async gerarPlano(payload: GerarPlanoPayload): Promise<PlanoFormaturav2 | null> {
		const { data, error, status } = await apiRequest<PlanoFormaturav2>('/planejamento/gerar-plano', {
			method: 'POST',
			body: {
				curriculo_completo: payload.curriculoCompleto,
				codigos_concluidos: payload.codigosConcluidos,
				semestre_atual: payload.semestreAtual,
				limite_creditos: payload.limiteCreditos
			}
		});

		if (error || !data) {
			throw new Error(`Erro ${status} ao gerar plano: ${error ?? 'Resposta inválida'}`);
		}

		return data;
	}

	/**
	 * Carrega as preferências de planejamento do usuário a partir do Supabase.
	 * Retorna DEFAULT_PREFERENCIAS se não houver preferências salvas.
	 */
	async loadPreferencias(idUser: number): Promise<PreferenciasPlano> {
		try {
			const prefs = await supabaseDataService.getPreferenciasPlano(idUser);
			if (!prefs) return { ...DEFAULT_PREFERENCIAS };
			return prefs;
		} catch {
			return { ...DEFAULT_PREFERENCIAS };
		}
	}

	/**
	 * Persiste as preferências de planejamento do usuário no Supabase.
	 */
	async savePreferencias(idUser: number, preferencias: PreferenciasPlano): Promise<void> {
		await supabaseDataService.savePreferenciasPlano(idUser, preferencias);
	}

	/**
	 * Envia mensagem para o agente planejador via chat.
	 * Stateless — frontend envia histórico + planoInput + restrições atuais.
	 */
	async chat(
		messages: PlannerChatMessage[],
		planoInput: {
			curriculoCompleto: string;
			codigosConcluidos: string[];
			semestreAtual: number;
			limiteCreditos: number;
			objetivo: 'velocidade' | 'equilibrio';
			trabalha: boolean;
		},
		restricoes: RestricoesPlano
	): Promise<PlannerChatResponse> {
		const { data, error, status } = await apiRequest<PlannerChatResponse>(
			'/planejamento/chat',
			{
				method: 'POST',
				body: {
					messages,
					planoInput: {
						curriculo_completo: planoInput.curriculoCompleto,
						codigos_concluidos: planoInput.codigosConcluidos,
						semestre_atual: planoInput.semestreAtual,
						limite_creditos: planoInput.limiteCreditos,
						objetivo: planoInput.objetivo === 'velocidade' ? 'velocidade' : 'equilibrado',
						trabalha: planoInput.trabalha
					},
					restricoes
				}
			}
		);

		if (error || !data) {
			throw new ErroIA(status, error ?? '', 'chat agente');
		}

		return data;
	}
}

export const planoFormaturaService = new PlanoFormaturaService();
