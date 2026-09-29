/**
 * Cliente do pipeline novo de chat (orquestrador + atuadores, /chat/send).
 * Separado de AssistenteService (que ainda fala com o Darcy legado,
 * /assistente/chat) — os dois convivem até a migração completa.
 */
import { apiRequest } from '$lib/utils/api';
import { ErroIA, type CotaIA } from '$lib/utils/darcy-cota';

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
	/** Cota diária do aluno já contando esta pergunta (rodinha do chat). */
	cota?: CotaIA;
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
			throw new ErroIA(status, error ?? '', '/chat/send');
		}
		return data;
	}
}

export const chatService = new ChatService();
