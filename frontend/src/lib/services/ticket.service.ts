import { createSupabaseBrowserClient } from '$lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
	NewTicketInput,
	Ticket,
	TicketAttachment,
	TicketDetail,
	TicketListItem,
	TicketMessage,
	TicketMetadata,
	TicketStatus,
	TicketCategory,
	TicketAuditEntry
} from '$lib/types/ticket';

const BUCKET = 'ticket-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export class TicketService {
	private supabase = createSupabaseBrowserClient();

	private collectMetadata(): TicketMetadata {
		if (typeof window === 'undefined') return {};
		return {
			user_agent: window.navigator.userAgent,
			platform: window.navigator.platform,
			url: window.location.href
		};
	}

	private async uploadAttachments(
		authId: string,
		files: File[]
	): Promise<TicketAttachment[]> {
		const results: TicketAttachment[] = [];
		for (const file of files) {
			const safeName = file.name.replace(/[^\w.-]+/g, '_');
			const stamp = Date.now();
			const rand = Math.random().toString(36).slice(2, 8);
			// path independente de ticket_id pra permitir upload antes do INSERT
			// (RLS de storage exige apenas que o primeiro segmento seja auth.uid())
			const path = `${authId}/${stamp}_${rand}_${safeName}`;
			const { error } = await this.supabase.storage
				.from(BUCKET)
				.upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
			if (error) throw new Error(`Falha ao enviar anexo: ${error.message}`);
			results.push({ path, name: file.name, mime: file.type, size: file.size });
		}
		return results;
	}

	async createTicket(input: NewTicketInput): Promise<Ticket> {
		const { data: authData } = await this.supabase.auth.getUser();
		const authId = authData.user?.id;
		if (!authId) throw new Error('Usuário não autenticado.');

		// 1. upload primeiro (path não depende do ticket_id)
		const uploaded =
			input.attachments && input.attachments.length > 0
				? await this.uploadAttachments(authId, input.attachments)
				: [];

		// 2. único INSERT já com attachments populado — sem UPDATE (que a RLS bloqueia)
		const { data: inserted, error: insertError } = await this.supabase
			.from('tickets')
			.insert({
				created_by: authId,
				title: input.title.trim(),
				description: input.description.trim(),
				category: input.category,
				status: 'aberto',
				metadata: { ...this.collectMetadata(), ...(input.metadata ?? {}) },
				attachments: uploaded
			})
			.select('*')
			.single();

		if (insertError || !inserted) {
			// limpa anexos órfãos se o INSERT falhou
			if (uploaded.length > 0) {
				await this.supabase.storage.from(BUCKET).remove(uploaded.map((a) => a.path));
			}
			throw new Error(insertError?.message || 'Erro ao criar ticket.');
		}

		return inserted as Ticket;
	}

	async listMyTickets(): Promise<Ticket[]> {
		// RPC em vez de SELECT direto: traz unread_count + última mensagem da conversa.
		const { data, error } = await this.supabase.rpc('get_my_tickets');
		if (error) throw new Error(error.message);
		return (data ?? []) as Ticket[];
	}

	/** Total de mensagens do suporte não lidas nos meus chamados (badge da navbar). */
	async countUnreadTickets(): Promise<number> {
		const tickets = await this.listMyTickets();
		return tickets.reduce((soma, t) => soma + (t.unread_count ?? 0), 0);
	}

	/** Marca a conversa do ticket como lida até a mensagem mais recente. */
	async markTicketRead(ticketId: number): Promise<void> {
		const { error } = await this.supabase.rpc('ticket_mark_read', { p_ticket_id: ticketId });
		if (error) throw new Error(error.message);
	}

	async listTicketsAdmin(params: {
		limit?: number;
		offset?: number;
		status?: TicketStatus | null;
		category?: TicketCategory | null;
		search?: string | null;
	} = {}): Promise<{ items: TicketListItem[]; total: number }> {
		const { data, error } = await this.supabase.rpc('get_tickets_paginated', {
			p_limit: params.limit ?? 50,
			p_offset: params.offset ?? 0,
			p_status: params.status ?? null,
			p_category: params.category ?? null,
			p_search: params.search ?? null
		});
		if (error) throw new Error(error.message);
		const rows = (data ?? []) as TicketListItem[];
		return { items: rows, total: rows[0]?.total_count ?? 0 };
	}

	async getTicket(id: number): Promise<TicketDetail> {
		const { data, error } = await this.supabase.rpc('get_ticket_by_id', { p_id: id });
		if (error) throw new Error(error.message);
		if (!data) throw new Error('Ticket não encontrado.');
		const detail = data as { ticket: Ticket; audit_log: TicketAuditEntry[] };
		return { ticket: detail.ticket, audit_log: detail.audit_log ?? [] };
	}

	async updateStatus(id: number, status: TicketStatus, note?: string): Promise<Ticket> {
		const { data, error } = await this.supabase.rpc('update_ticket_status', {
			p_id: id,
			p_status: status,
			p_note: note ?? null
		});
		if (error) throw new Error(error.message);
		return data as Ticket;
	}

	async deleteAttachment(ticketId: number, path: string): Promise<Ticket> {
		const { data, error } = await this.supabase.rpc('delete_ticket_attachment', {
			p_ticket_id: ticketId,
			p_path: path
		});
		if (error) throw new Error(error.message);
		return data as Ticket;
	}

	async signAttachment(path: string): Promise<string | null> {
		const { data, error } = await this.supabase.storage
			.from(BUCKET)
			.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
		if (error) return null;
		return data?.signedUrl ?? null;
	}

	async signAttachments(attachments: TicketAttachment[]): Promise<TicketAttachment[]> {
		if (!attachments || attachments.length === 0) return [];
		const signed = await Promise.all(
			attachments.map(async (att) => ({
				...att,
				signedUrl: (await this.signAttachment(att.path)) ?? undefined
			}))
		);
		return signed;
	}

	async listMessages(
		ticketId: number,
		opts?: { beforeId?: number; afterId?: number; limit?: number }
	): Promise<TicketMessage[]> {
		const { data, error } = await this.supabase.rpc('get_ticket_messages', {
			p_ticket_id: ticketId,
			p_before_id: opts?.beforeId ?? null,
			p_after_id: opts?.afterId ?? null,
			p_limit: opts?.limit ?? 30
		});
		if (error) throw new Error(error.message);
		return (data ?? []) as TicketMessage[];
	}

	async sendMessage(ticketId: number, content: string): Promise<TicketMessage> {
		const { data, error } = await this.supabase.rpc('ticket_add_message', {
			p_ticket_id: ticketId,
			p_content: content
		});
		if (error) throw new Error(error.message);
		return data as TicketMessage;
	}

	/**
	 * Pedido "Mais perguntas no Darcy": aprova criando a concessão vinculada ao
	 * ticket (aprovado_por = admin logado), responde na conversa e resolve.
	 */
	async aprovarPedidoDarcy(
		ticketId: number,
		opcao: 'hoje' | 'semana' | 'limite',
		quantidade: number,
		resposta?: string
	): Promise<void> {
		const { error } = await this.supabase.rpc('darcy_aprovar_pedido', {
			p_ticket_id: ticketId,
			p_opcao: opcao,
			p_quantidade: quantidade,
			p_resposta: resposta?.trim() ? resposta.trim() : null
		});
		if (error) throw new Error(error.message);
	}

	/** Recusa o pedido, respondendo o motivo na conversa do ticket. */
	async recusarPedidoDarcy(ticketId: number, resposta: string): Promise<void> {
		const { error } = await this.supabase.rpc('darcy_recusar_pedido', {
			p_ticket_id: ticketId,
			p_resposta: resposta
		});
		if (error) throw new Error(error.message);
	}

	async getAuthUserId(): Promise<string | null> {
		const { data } = await this.supabase.auth.getUser();
		return data.user?.id ?? null;
	}

	/**
	 * Assina INSERTs em ticket_messages do ticket via Realtime.
	 * Retorna a função de unsubscribe (remove o canal).
	 */
	subscribeToMessages(
		ticketId: number,
		onNew: () => void,
		onStatus?: (subscribed: boolean) => void
	): () => void {
		const channel: RealtimeChannel = this.supabase
			.channel(`ticket-messages-${ticketId}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'ticket_messages',
					filter: `ticket_id=eq.${ticketId}`
				},
				() => onNew()
			)
			.subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
		return () => {
			this.supabase.removeChannel(channel);
		};
	}
}

export const ticketService = new TicketService();
