export type TicketCategory = 'bug' | 'sugestao' | 'duvida';

export type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_info' | 'resolvido';

export type TicketPriority = 'low' | 'normal' | 'high' | 'critical';

export type AuditAction =
	| 'created'
	| 'status_changed'
	| 'assigned'
	| 'priority_changed'
	| 'category_changed'
	| 'note_updated'
	| 'closed'
	| 'message_added';

/** Papel do autor de uma mensagem no chat do chamado. */
export type TicketMessageRole = 'user' | 'tech';

/** Tamanho máximo (em caracteres) de uma mensagem do chat. */
export const MAX_MESSAGE_LENGTH = 2000;

/** Mensagem trocada no chat de um chamado (shape retornado pelas RPCs). */
export interface TicketMessage {
	id: number;
	ticket_id: number;
	author_id: string;
	author_role: TicketMessageRole;
	content: string;
	created_at: string;
	author_name: string | null;
}

export interface TicketAttachment {
	path: string;
	name: string;
	mime: string;
	size: number;
	signedUrl?: string;
}

export interface TicketMetadata {
	user_agent?: string;
	platform?: string;
	url?: string;
	app_version?: string;
	[key: string]: unknown;
}

export interface Ticket {
	id: number;
	created_by: string;
	assigned_to: string | null;
	title: string;
	description: string;
	category: TicketCategory;
	status: TicketStatus;
	priority: TicketPriority;
	metadata: TicketMetadata;
	attachments: TicketAttachment[];
	admin_notes: string | null;
	created_at: string;
	updated_at: string;
	resolved_at: string | null;
	creator_name?: string | null;
	creator_email?: string | null;
	/** Resumo da conversa (presente quando a listagem vem de get_my_tickets). */
	last_message_at?: string | null;
	last_message_role?: TicketMessageRole | null;
	unread_count?: number;
}

export interface TicketListItem {
	id: number;
	title: string;
	description: string;
	status: TicketStatus;
	category: TicketCategory;
	priority: TicketPriority;
	created_by: string;
	creator_name: string | null;
	creator_email: string | null;
	assigned_to: string | null;
	created_at: string;
	updated_at: string;
	resolved_at: string | null;
	total_count: number;
	/** Resumo da conversa (colunas novas de get_tickets_paginated). */
	last_message_at?: string | null;
	last_message_role?: TicketMessageRole | null;
	unread_count?: number;
}

export interface TicketAuditEntry {
	id: number;
	ticket_id: number;
	actor_id: string | null;
	actor_name: string | null;
	action: AuditAction;
	from_value: string | null;
	to_value: string | null;
	notes: string | null;
	created_at: string;
}

export interface TicketDetail {
	ticket: Ticket;
	audit_log: TicketAuditEntry[];
}

export interface NewTicketInput {
	title: string;
	description: string;
	category: TicketCategory;
	attachments?: File[];
	/** Campos extras no metadata (ex.: tipo 'darcy_mais_perguntas'). */
	metadata?: Record<string, unknown>;
}

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
	bug: 'Bug',
	sugestao: 'Sugestão',
	duvida: 'Dúvida'
};

export const CATEGORY_COLORS: Record<TicketCategory, string> = {
	bug: 'bg-red-500/20 text-red-300 border-red-500/30',
	sugestao: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
	duvida: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
	aberto: 'Aberto',
	em_andamento: 'Em andamento',
	aguardando_info: 'Aguardando info',
	resolvido: 'Resolvido'
};

export const STATUS_COLORS: Record<TicketStatus, string> = {
	aberto: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
	em_andamento: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
	aguardando_info: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30',
	resolvido: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
};

export const STATUS_ORDER: TicketStatus[] = [
	'aberto',
	'em_andamento',
	'aguardando_info',
	'resolvido'
];

export function isTerminalStatus(status: TicketStatus): boolean {
	return status === 'resolvido';
}
