/**
 * Cliente HTTP da Darcy única (orquestrador, `/chat/*`).
 *
 * O cliente manda só a mensagem nova, a superfície (tela) de onde ela saiu e o
 * estado dessa tela. Tudo o que é do aluno — matriz, concluídas, plano,
 * preferências — o backend lê do banco; mandar daqui seria duplicar (e deixar o
 * cliente forjar) o que já é fonte de verdade lá. A conversa é uma só e vive na
 * sessão do servidor, por isso `historico()` em vez de reenviar mensagens.
 */
import { apiRequest } from '$lib/utils/api';
import type { OpcaoGradeChat, PlanoFormaturav2, RestricoesPlano } from '$lib/types/plano-formatura';

export type Superficie = 'assistente' | 'plano' | 'montador';
export type TurnoChat = 'M' | 'T' | 'N';

export interface EstadoMontador {
	tipo: 'montador';
	/** Grade aberta: matéria → turma escolhida. */
	grade: Array<{ codigo: string; idTurma: number }>;
	creditos: number;
	turnos: TurnoChat[];
	incluirCursando: boolean;
	/** `gradeStore.freeMask.toString()` — slots livres nos turnos permitidos. */
	horarioLivre: string;
}

export interface EstadoPlano {
	tipo: 'plano';
	semestreFoco?: number;
}

export interface EstadoAssistente {
	tipo: 'assistente';
}

export type EstadoSuperficie = EstadoMontador | EstadoPlano | EstadoAssistente;

export interface ChatSendResponse {
	reply: string;
	/** Seleção que o solver do backend já resolveu (aplicada pelo botão "Montar grade"). */
	opcaoGrade?: OpcaoGradeChat;
	/** Plano atualizado quando uma tool de plano (adiar, mover, ajustar carga…) mudou algo. */
	plano?: PlanoFormaturav2;
	restricoes?: RestricoesPlano;
}

export interface MensagemHistorico {
	role: 'user' | 'assistant';
	content: string;
}

export class ChatService {
	async enviarMensagem(
		message: string,
		superficie: Superficie,
		estado?: EstadoSuperficie
	): Promise<ChatSendResponse> {
		const body: Record<string, unknown> = { message, superficie };
		if (estado) body.estado = estado;

		const { data, error, status } = await apiRequest<ChatSendResponse>('/chat/send', {
			method: 'POST',
			body
		});
		if (error || !data) {
			throw new Error(`Erro ${status} ao chamar /chat/send: ${error ?? 'Resposta inválida'}`);
		}
		return data;
	}

	async historico(): Promise<MensagemHistorico[]> {
		const { data, error, status } = await apiRequest<{ mensagens: MensagemHistorico[] }>(
			'/chat/historico'
		);
		if (error || !data) {
			throw new Error(`Erro ${status} ao chamar /chat/historico: ${error ?? 'Resposta inválida'}`);
		}
		return Array.isArray(data.mensagens) ? data.mensagens : [];
	}

	async novaConversa(): Promise<void> {
		const { error, status } = await apiRequest<{ ok: boolean }>('/chat/nova-conversa', {
			method: 'POST'
		});
		if (error) throw new Error(`Erro ${status} ao chamar /chat/nova-conversa: ${error}`);
	}
}

export const chatService = new ChatService();
