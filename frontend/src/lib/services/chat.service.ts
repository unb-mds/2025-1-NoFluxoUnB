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
import { ErroIA, type CotaIA } from '$lib/utils/darcy-cota';

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
	/** Cota diária do aluno já contando esta pergunta (rodinha do chat). */
	cota?: CotaIA;
}

export interface MensagemHistorico {
	role: 'user' | 'assistant';
	content: string;
}

/** Conversa arquivada ("Conversas anteriores"). */
export interface ConversaAnterior {
	id: string;
	titulo: string;
	mensagens: number;
	inicio: string | null;
	fim: string | null;
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
			throw new ErroIA(status, error ?? '', '/chat/send');
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

	/**
	 * Começa uma conversa nova: a atual vai para "Conversas anteriores" e o que
	 * importa dela vira memória da Darcy. Com `esquecer`, apaga a conversa, as
	 * anteriores e a memória.
	 */
	async novaConversa(esquecer = false): Promise<void> {
		const rota = esquecer ? '/chat/esquecer' : '/chat/nova-conversa';
		const { error, status } = await apiRequest<{ ok: boolean }>(rota, { method: 'POST' });
		if (error) throw new Error(`Erro ${status} ao chamar ${rota}: ${error}`);
	}

	async conversas(): Promise<ConversaAnterior[]> {
		const { data, error, status } = await apiRequest<{ conversas: ConversaAnterior[] }>(
			'/chat/conversas'
		);
		if (error || !data) throw new Error(`Erro ${status} ao chamar /chat/conversas: ${error ?? ''}`);
		return Array.isArray(data.conversas) ? data.conversas : [];
	}

	/** Mensagens de uma conversa anterior (só leitura). */
	async conversa(id: string): Promise<MensagemHistorico[]> {
		const { data, error, status } = await apiRequest<{ mensagens: MensagemHistorico[] }>(
			`/chat/conversa?id=${encodeURIComponent(id)}`
		);
		if (error || !data) throw new Error(`Erro ${status} ao chamar /chat/conversa: ${error ?? ''}`);
		return Array.isArray(data.mensagens) ? data.mensagens : [];
	}

	/** A conversa anterior volta a ser a atual; devolve as mensagens dela. */
	async retomarConversa(id: string): Promise<MensagemHistorico[]> {
		const { data, error, status } = await apiRequest<{ mensagens: MensagemHistorico[] }>(
			'/chat/retomar-conversa',
			{ method: 'POST', body: { id } }
		);
		if (error || !data) {
			throw new Error(`Erro ${status} ao chamar /chat/retomar-conversa: ${error ?? ''}`);
		}
		return Array.isArray(data.mensagens) ? data.mensagens : [];
	}

	async apagarConversa(id: string): Promise<void> {
		const { error, status } = await apiRequest<{ ok: boolean }>('/chat/apagar-conversa', {
			method: 'POST',
			body: { id }
		});
		if (error) throw new Error(`Erro ${status} ao chamar /chat/apagar-conversa: ${error}`);
	}
}

export const chatService = new ChatService();
