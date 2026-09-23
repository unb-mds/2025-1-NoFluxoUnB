/**
 * Cliente do pipeline novo de chat (orquestrador + atuadores, /chat/send).
 * Separado de AssistenteService (que ainda fala com o Darcy legado,
 * /assistente/chat) — os dois convivem até a migração completa.
 */
import { apiRequest } from '$lib/utils/api';

export interface EnviarMensagemOrquestradorOpts {
	contexto?: 'montador';
	curriculoCompleto?: string;
	horarioLivre?: string;
	turnos?: string[];
	/** Códigos já alocados na grade em construção (mesmo semestre da recomendação). */
	codigosNaGrade?: string[];
}

export interface OrquestradorChatResponse {
	reply: string;
	/**
	 * Quando o orquestrador já resolveu a montagem no backend (ação MONTAR_GRADE
	 * processada lá, com o contexto de turmas que só ele tem), a seleção exata vem
	 * pronta aqui — o frontend só aplica via `gradeStore.aplicarSelecao`, sem rodar
	 * o solver de novo. `undefined` quando o backend não resolveu (resposta comum,
	 * ou a ação ainda só na tag de texto `[MONTAR_GRADE|...]`) — nesse caso o
	 * handler do chat cai no fallback de re-montar a partir da tag.
	 */
	opcaoGrade?: {
		estrategia: string;
		selecao: Array<{ codigo: string; idTurma: number }>;
	};
}

export class ChatService {
	async enviarMensagem(
		message: string,
		opts?: EnviarMensagemOrquestradorOpts
	): Promise<OrquestradorChatResponse> {
		const body: Record<string, unknown> = { message };
		if (opts?.contexto) body.contexto = opts.contexto;
		if (opts?.curriculoCompleto) body.curriculoCompleto = opts.curriculoCompleto;
		if (opts?.horarioLivre) body.horarioLivre = opts.horarioLivre;
		if (opts?.turnos && opts.turnos.length > 0) body.turnos = opts.turnos;
		if (opts?.codigosNaGrade && opts.codigosNaGrade.length > 0)
			body.codigosNaGrade = opts.codigosNaGrade;

		const { data, error, status } = await apiRequest<OrquestradorChatResponse>('/chat/send', {
			method: 'POST',
			body
		});

		if (error || !data) {
			throw new Error(`Erro ${status} ao chamar /chat/send: ${error ?? 'Resposta inválida'}`);
		}
		return data;
	}
}

export const chatService = new ChatService();
