<script lang="ts">
	import { onMount } from 'svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import AdminNav from '$lib/components/admin/AdminNav.svelte';
	import TicketChat from '$lib/components/tickets/TicketChat.svelte';
	import { ticketService } from '$lib/services/ticket.service';
	import {
		CATEGORY_COLORS,
		CATEGORY_LABELS,
		STATUS_COLORS,
		STATUS_LABELS,
		STATUS_ORDER,
		type TicketAttachment,
		type TicketAuditEntry,
		type TicketCategory,
		type TicketDetail,
		type TicketListItem,
		type TicketStatus
	} from '$lib/types/ticket';
	import {
		AlertTriangle,
		ChevronLeft,
		ChevronRight,
		FileDown,
		Filter,
		Loader2,
		Paperclip,
		RefreshCw,
		Search,
		Trash2,
		X
	} from 'lucide-svelte';

	const PAGE_SIZE = 50;

	let loadingList = $state(false);
	let loadingDetail = $state(false);
	let listError = $state<string | null>(null);
	let detailError = $state<string | null>(null);

	let items = $state<TicketListItem[]>([]);
	let totalItems = $state(0);
	let currentPage = $state(0);

	let statusFilter = $state<TicketStatus | ''>('');
	let categoryFilter = $state<TicketCategory | ''>('');
	let searchQuery = $state('');
	let searchDebounce: ReturnType<typeof setTimeout> | null = null;

	let selected = $state<TicketDetail | null>(null);
	let selectedId = $state<number | null>(null);
	let signedAttachments = $state<TicketAttachment[]>([]);
	let statusUpdating = $state(false);
	let statusNote = $state('');
	let deletingPath = $state<string | null>(null);

	const totalPages = $derived(Math.max(1, Math.ceil(totalItems / PAGE_SIZE)));

	onMount(() => {
		void loadPage(0);
	});

	async function loadPage(page: number) {
		loadingList = true;
		listError = null;
		try {
			const { items: rows, total } = await ticketService.listTicketsAdmin({
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
				status: statusFilter || null,
				category: categoryFilter || null,
				search: searchQuery.trim() || null
			});
			items = rows;
			totalItems = total;
			currentPage = page;
		} catch (e) {
			listError = e instanceof Error ? e.message : 'Erro ao carregar tickets.';
		} finally {
			loadingList = false;
		}
	}

	async function selectTicket(id: number) {
		selectedId = id;
		loadingDetail = true;
		detailError = null;
		selected = null;
		signedAttachments = [];
		statusNote = '';
		try {
			const detail = await ticketService.getTicket(id);
			if (id !== selectedId) return; // resposta atrasada de um ticket já trocado
			selected = detail;
			// o chat vai marcar como lida no servidor — reflete já na lista
			items = items.map((i) => (i.id === id ? { ...i, unread_count: 0 } : i));
			if (detail.ticket.attachments && detail.ticket.attachments.length > 0) {
				const signed = await ticketService.signAttachments(detail.ticket.attachments);
				if (id !== selectedId) return;
				signedAttachments = signed;
			}
		} catch (e) {
			if (id !== selectedId) return;
			detailError = e instanceof Error ? e.message : 'Erro ao carregar ticket.';
		} finally {
			if (id === selectedId) loadingDetail = false;
		}
	}

	/**
	 * Re-busca o ticket selecionado sem mexer em loadingDetail — o painel não
	 * desmonta o chat. Usado após enviar mensagem, que pode mudar o status do
	 * ticket no servidor (aberto → em_andamento).
	 */
	async function refreshDetailQuietly() {
		if (selectedId === null) return;
		try {
			const detail = await ticketService.getTicket(selectedId);
			if (detail.ticket.id !== selectedId) return; // trocou de ticket no meio da busca
			selected = detail;
			signedAttachments =
				detail.ticket.attachments && detail.ticket.attachments.length > 0
					? await ticketService.signAttachments(detail.ticket.attachments)
					: [];
		} catch (e) {
			console.error('Erro ao atualizar ticket silenciosamente:', e);
		}
	}

	async function deleteAttachment(path: string, name: string) {
		if (!selected) return;
		const ok = confirm(
			`Remover o anexo "${name}"?\n\nO arquivo será apagado do storage e do ticket. Esta ação não pode ser desfeita.`
		);
		if (!ok) return;
		deletingPath = path;
		detailError = null;
		try {
			const updated = await ticketService.deleteAttachment(selected.ticket.id, path);
			selected = { ...selected, ticket: { ...selected.ticket, attachments: updated.attachments } };
			signedAttachments = signedAttachments.filter((a) => a.path !== path);
			await selectTicket(selected.ticket.id);
		} catch (e) {
			detailError = e instanceof Error ? e.message : 'Erro ao remover anexo.';
		} finally {
			deletingPath = null;
		}
	}

	async function changeStatus(newStatus: TicketStatus) {
		if (!selected) return;
		statusUpdating = true;
		try {
			await ticketService.updateStatus(selected.ticket.id, newStatus, statusNote || undefined);
			await Promise.all([selectTicket(selected.ticket.id), loadPage(currentPage)]);
			statusNote = '';
		} catch (e) {
			detailError = e instanceof Error ? e.message : 'Erro ao atualizar status.';
		} finally {
			statusUpdating = false;
		}
	}

	function onSearchInput() {
		if (searchDebounce) clearTimeout(searchDebounce);
		searchDebounce = setTimeout(() => void loadPage(0), 300);
	}

	function clearFilters() {
		statusFilter = '';
		categoryFilter = '';
		searchQuery = '';
		void loadPage(0);
	}

	function formatDate(value: string | null | undefined): string {
		if (!value) return '—';
		try {
			return new Date(value).toLocaleString('pt-BR', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return String(value);
		}
	}

	function auditLabel(entry: TicketAuditEntry): string {
		const actor = entry.actor_name || 'Sistema';
		switch (entry.action) {
			case 'created':
				return `${actor} criou o ticket`;
			case 'status_changed':
				return `${actor}: status ${STATUS_LABELS[entry.from_value as TicketStatus] ?? entry.from_value} → ${STATUS_LABELS[entry.to_value as TicketStatus] ?? entry.to_value}`;
			case 'assigned':
				return `${actor}: atribuição alterada`;
			case 'priority_changed':
				return `${actor}: prioridade ${entry.from_value} → ${entry.to_value}`;
			case 'category_changed':
				return `${actor}: categoria ${entry.from_value} → ${entry.to_value}`;
			case 'note_updated':
				return `${actor}: nota atualizada`;
			case 'message_added':
				return 'Primeira resposta do suporte';
			case 'closed':
				return `${actor} fechou o ticket`;
			default:
				return `${actor}: ${entry.action}`;
		}
	}
</script>

<PageMeta title="Tickets — Admin" description="Dashboard de tickets (admin)." />

<PageBackground />

<main class="admin-tickets-main relative z-10">
	<div class="admin-topbar">
		<AdminNav />
	</div>
	<div class="layout">
		<!-- Lista à esquerda -->
		<aside class="list-pane">
			<header class="pane-header">
				<h1 class="pane-title">Tickets</h1>
				<button
					type="button"
					class="icon-btn"
					aria-label="Recarregar"
					onclick={() => void loadPage(currentPage)}
				>
					<RefreshCw class={`h-4 w-4 ${loadingList ? 'animate-spin' : ''}`} />
				</button>
			</header>

			<div class="filters">
				<div class="search">
					<Search class="h-4 w-4" />
					<input
						type="search"
						placeholder="Buscar por título, descrição ou id…"
						bind:value={searchQuery}
						oninput={onSearchInput}
					/>
				</div>
				<div class="chip-row">
					<span class="chip-label"><Filter class="h-3 w-3" /> Status</span>
					{#each STATUS_ORDER as s}
						<button
							type="button"
							class="filter-chip"
							class:active={statusFilter === s}
							onclick={() => {
								statusFilter = statusFilter === s ? '' : s;
								void loadPage(0);
							}}
						>
							{STATUS_LABELS[s]}
						</button>
					{/each}
				</div>
				<div class="chip-row">
					<span class="chip-label">Categoria</span>
					{#each ['bug', 'sugestao', 'duvida'] as const as c}
						<button
							type="button"
							class="filter-chip"
							class:active={categoryFilter === c}
							onclick={() => {
								categoryFilter = categoryFilter === c ? '' : c;
								void loadPage(0);
							}}
						>
							{CATEGORY_LABELS[c]}
						</button>
					{/each}
					{#if statusFilter || categoryFilter || searchQuery}
						<button type="button" class="clear-btn" onclick={clearFilters}>
							<X class="h-3 w-3" /> Limpar
						</button>
					{/if}
				</div>
			</div>

			{#if listError}
				<div class="alert alert-error">
					<AlertTriangle class="h-4 w-4 shrink-0" />
					<span>{listError}</span>
				</div>
			{/if}

			<div class="list-scroll">
				{#if loadingList && items.length === 0}
					<div class="loading-row">
						<Loader2 class="h-4 w-4 animate-spin" />
						<span>Carregando…</span>
					</div>
				{:else if items.length === 0}
					<div class="empty-row">Nenhum ticket encontrado.</div>
				{:else}
					{#each items as t (t.id)}
						<button
							type="button"
							class="list-item"
							class:selected={selectedId === t.id}
							onclick={() => selectTicket(t.id)}
						>
							<div class="list-row-top">
								<span class="list-id">#{t.id}</span>
								<span class="chip {CATEGORY_COLORS[t.category]}">{CATEGORY_LABELS[t.category]}</span>
								<span class="chip {STATUS_COLORS[t.status]}">{STATUS_LABELS[t.status]}</span>
								{#if (t.unread_count ?? 0) > 0}
									<span class="badge-nao-lidas">
										{(t.unread_count ?? 0) > 99 ? '99+' : t.unread_count}
									</span>
								{/if}
							</div>
							<div class="list-title">{t.title}</div>
							<div class="list-meta">
								<span>{t.creator_name || t.creator_email || 'Anônimo'}</span>
								<span>·</span>
								<span>{formatDate(t.created_at)}</span>
								{#if (t.unread_count ?? 0) > 0}
									<span>·</span>
									<span class="meta-aguardando">aguardando resposta</span>
								{:else if t.last_message_role === 'tech'}
									<span>·</span>
									<span class="meta-respondido">respondido</span>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
			</div>

			{#if totalPages > 1}
				<footer class="pagination">
					<button
						type="button"
						class="page-btn"
						disabled={currentPage === 0}
						onclick={() => void loadPage(currentPage - 1)}
						aria-label="Página anterior"
					>
						<ChevronLeft class="h-4 w-4" />
					</button>
					<span class="page-info">
						{currentPage + 1} / {totalPages} · {totalItems} tickets
					</span>
					<button
						type="button"
						class="page-btn"
						disabled={currentPage + 1 >= totalPages}
						onclick={() => void loadPage(currentPage + 1)}
						aria-label="Próxima página"
					>
						<ChevronRight class="h-4 w-4" />
					</button>
				</footer>
			{/if}
		</aside>

		<!-- Detalhe à direita -->
		<section class="detail-pane">
			{#if loadingDetail}
				<div class="detail-empty">
					<Loader2 class="h-5 w-5 animate-spin" />
					<span>Carregando ticket…</span>
				</div>
			{:else if detailError}
				<div class="alert alert-error">
					<AlertTriangle class="h-4 w-4 shrink-0" />
					<span>{detailError}</span>
				</div>
			{:else if !selected}
				<div class="detail-empty">Selecione um ticket na lista para ver os detalhes.</div>
			{:else}
				{@const t = selected.ticket}
				<header class="detail-header">
					<div class="detail-badges">
						<span class="list-id">#{t.id}</span>
						<span class="chip {CATEGORY_COLORS[t.category]}">{CATEGORY_LABELS[t.category]}</span>
						<span class="chip {STATUS_COLORS[t.status]}">{STATUS_LABELS[t.status]}</span>
					</div>
					<h2 class="detail-title">{t.title}</h2>
					<div class="detail-meta">
						<span><strong>De:</strong> {t.creator_name || '—'} ({t.creator_email || '—'})</span>
						<span><strong>Criado em:</strong> {formatDate(t.created_at)}</span>
						{#if t.resolved_at}
							<span><strong>Resolvido em:</strong> {formatDate(t.resolved_at)}</span>
						{/if}
					</div>
				</header>

				<div class="detail-actions">
					<label class="action-label" for="status-note">Nota (opcional)</label>
					<input
						id="status-note"
						type="text"
						class="input"
						placeholder="Anote o motivo da mudança de status…"
						bind:value={statusNote}
						disabled={statusUpdating}
					/>
					<div class="status-btns">
						{#each STATUS_ORDER as s}
							<button
								type="button"
								class="status-btn"
								class:current={t.status === s}
								disabled={statusUpdating || t.status === s}
								onclick={() => changeStatus(s)}
							>
								{STATUS_LABELS[s]}
							</button>
						{/each}
					</div>
				</div>

				<div class="detail-body">
					<section>
						<h3 class="section-title">Descrição</h3>
						<p class="detail-desc">{t.description}</p>
					</section>

					{#if signedAttachments.length > 0}
						<section>
							<h3 class="section-title">Anexos</h3>
							<ul class="attachment-list">
								{#each signedAttachments as a}
									<li>
										<Paperclip class="h-3.5 w-3.5" />
										<span class="truncate">{a.name}</span>
										<span class="att-size">{(a.size / 1024).toFixed(0)} KB</span>
										{#if a.signedUrl}
											<a
												class="att-link"
												href={a.signedUrl}
												target="_blank"
												rel="noopener noreferrer"
											>
												<FileDown class="h-3.5 w-3.5" />
												Abrir
											</a>
										{:else}
											<span class="att-error">Sem permissão</span>
										{/if}
										<button
											type="button"
											class="att-delete"
											aria-label={`Remover anexo ${a.name}`}
											disabled={deletingPath === a.path}
											onclick={() => deleteAttachment(a.path, a.name)}
										>
											{#if deletingPath === a.path}
												<Loader2 class="h-3.5 w-3.5 animate-spin" />
											{:else}
												<Trash2 class="h-3.5 w-3.5" />
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						</section>
					{/if}

					{#if t.metadata && Object.keys(t.metadata).length > 0}
						<section>
							<h3 class="section-title">Contexto</h3>
							<pre class="metadata-block">{JSON.stringify(t.metadata, null, 2)}</pre>
						</section>
					{/if}

					<section>
						<h3 class="section-title">Conversa</h3>
						<TicketChat
							ticketId={t.id}
							ticketStatus={t.status}
							perspective="admin"
							counterpartName={t.creator_name}
							onMessageSent={refreshDetailQuietly}
						/>
					</section>

					<section>
						<h3 class="section-title">Histórico</h3>
						<ol class="timeline">
							{#each selected.audit_log as entry (entry.id)}
								<li class="timeline-item">
									<span class="timeline-dot"></span>
									<div class="timeline-body">
										<div class="timeline-label">{auditLabel(entry)}</div>
										{#if entry.notes}
											<div class="timeline-notes">"{entry.notes}"</div>
										{/if}
										<div class="timeline-date">{formatDate(entry.created_at)}</div>
									</div>
								</li>
							{/each}
						</ol>
					</section>
				</div>
			{/if}
		</section>
	</div>
</main>

<style>
	/* Light = padrão (tokens). O bloco :global(.dark) no fim restaura, verbatim, a receita histórica do tema escuro. */
	.admin-tickets-main {
		min-height: calc(100vh - 64px);
		padding: 16px;
	}
	.admin-topbar {
		max-width: 1400px;
		margin: 0 auto 12px;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(320px, 2fr) 3fr;
		gap: 16px;
		max-width: 1400px;
		margin: 0 auto;
		height: calc(100vh - 150px);
	}
	@media (max-width: 900px) {
		.layout {
			grid-template-columns: 1fr;
			height: auto;
		}
	}

	.list-pane,
	.detail-pane {
		background: hsl(var(--card));
		backdrop-filter: blur(10px);
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.pane-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid hsl(var(--border));
	}
	.pane-title {
		font-size: 18px;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
	}
	.icon-btn {
		background: none;
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		color: hsl(var(--muted-foreground));
		padding: 6px;
		cursor: pointer;
	}
	.icon-btn:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}

	.filters {
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-bottom: 1px solid hsl(var(--border));
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		color: hsl(var(--muted-foreground));
	}
	.search input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: hsl(var(--foreground));
		font-size: 13px;
	}
	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.chip-label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		margin-right: 2px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.filter-chip {
		padding: 3px 10px;
		font-size: 11px;
		font-weight: 500;
		border-radius: 999px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
		color: hsl(var(--foreground) / 0.8);
		cursor: pointer;
	}
	.filter-chip:hover {
		background: hsl(var(--muted));
	}
	.filter-chip.active {
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.7);
		color: hsl(var(--accent-foreground));
	}
	.clear-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 3px 8px;
		font-size: 11px;
		border-radius: 999px;
		border: 1px solid transparent;
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
		cursor: pointer;
		margin-left: auto;
	}

	.alert {
		display: flex;
		gap: 10px;
		padding: 10px 12px;
		font-size: 13px;
		border: 1px solid transparent;
		margin: 12px 16px;
		border-radius: 8px;
	}
	.alert-error {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.3);
		color: hsl(var(--destructive));
	}

	.list-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}
	.list-item {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		padding: 12px 16px;
		background: none;
		border: none;
		border-bottom: 1px solid hsl(var(--border) / 0.7);
		color: hsl(var(--foreground));
		text-align: left;
		cursor: pointer;
		transition: background 100ms;
	}
	.list-item:hover {
		background: hsl(var(--muted) / 0.6);
	}
	.list-item.selected {
		background: hsl(var(--accent) / 0.6);
		border-left: 3px solid hsl(var(--primary));
		padding-left: 13px;
	}
	.list-row-top {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.list-id {
		font-family: 'JetBrains Mono', monospace;
		color: hsl(var(--muted-foreground));
		font-size: 11px;
	}
	.chip {
		display: inline-flex;
		padding: 2px 8px;
		font-size: 10px;
		font-weight: 600;
		border-radius: 4px;
		border: 1px solid;
	}
	.list-title {
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.list-meta {
		display: flex;
		gap: 6px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	/* Bolinha de não lidas estilo WhatsApp (verde, redonda, com contagem).
	   Light: emerald-700 + branco (5,5:1), igual ao badge da navbar; .dark volta ao verde WhatsApp. */
	.badge-nao-lidas {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		margin-left: auto;
		border-radius: 999px;
		background: #047857;
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
	}
	.meta-aguardando {
		/* amber-800: 6,8:1 sobre o card */
		color: #92400e;
		font-weight: 600;
	}
	.meta-respondido {
		/* emerald-800: 7,3:1 sobre o card */
		color: #065f46;
	}
	.loading-row,
	.empty-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 24px;
		color: hsl(var(--muted-foreground));
		font-size: 13px;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px;
		border-top: 1px solid hsl(var(--border));
	}
	.page-btn {
		padding: 6px;
		background: hsl(var(--muted) / 0.6);
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		color: hsl(var(--foreground));
		cursor: pointer;
	}
	.page-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.page-info {
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}

	.detail-pane {
		padding: 20px 22px;
		overflow-y: auto;
	}
	.detail-empty {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 10px;
		color: hsl(var(--muted-foreground));
		font-size: 14px;
		min-height: 240px;
	}
	.detail-header {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 18px;
		padding-bottom: 14px;
		border-bottom: 1px solid hsl(var(--border));
	}
	.detail-badges {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.detail-title {
		font-size: 20px;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
	}
	.detail-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	.detail-meta strong {
		color: hsl(var(--foreground) / 0.8);
		font-weight: 600;
	}

	.detail-actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 22px;
		padding: 14px;
		background: hsl(var(--muted) / 0.4);
		border: 1px solid hsl(var(--border));
		border-radius: 10px;
	}
	.action-label {
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		font-weight: 600;
	}
	.input {
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		color: hsl(var(--foreground));
		padding: 8px 10px;
		font-size: 13px;
		width: 100%;
	}
	.status-btns {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.status-btn {
		padding: 6px 12px;
		font-size: 12px;
		border-radius: 6px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		color: hsl(var(--foreground) / 0.85);
		cursor: pointer;
		transition: all 120ms;
	}
	.status-btn:hover:not(:disabled) {
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.4);
		color: hsl(var(--accent-foreground));
	}
	.status-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.status-btn.current {
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.7);
		color: hsl(var(--accent-foreground));
	}

	.detail-body {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.section-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: hsl(var(--muted-foreground));
		margin: 0 0 8px;
		font-weight: 700;
	}
	.detail-desc {
		color: hsl(var(--foreground) / 0.85);
		font-size: 14px;
		line-height: 1.55;
		white-space: pre-wrap;
		margin: 0;
	}
	.attachment-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.attachment-list li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: hsl(var(--muted) / 0.5);
		border-radius: 6px;
		font-size: 12px;
		color: hsl(var(--foreground) / 0.8);
	}
	.att-size {
		color: hsl(var(--muted-foreground));
		margin-left: auto;
	}
	.att-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: hsl(var(--ai));
		text-decoration: none;
		font-weight: 500;
	}
	.att-link:hover {
		color: hsl(var(--primary));
	}
	.att-error {
		color: hsl(var(--destructive));
		font-size: 11px;
	}
	.att-delete {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 4px;
		border: 1px solid transparent;
		background: transparent;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 120ms;
	}
	.att-delete:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.3);
		color: hsl(var(--destructive));
	}
	.att-delete:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.metadata-block {
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		padding: 10px 12px;
		color: hsl(var(--foreground) / 0.8);
		font-size: 11px;
		font-family: 'JetBrains Mono', monospace;
		overflow-x: auto;
		margin: 0;
	}

	.timeline {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
		position: relative;
	}
	.timeline::before {
		content: '';
		position: absolute;
		left: 6px;
		top: 8px;
		bottom: 8px;
		width: 1px;
		background: hsl(var(--border));
	}
	.timeline-item {
		position: relative;
		padding: 8px 0 8px 22px;
	}
	.timeline-dot {
		position: absolute;
		left: 2px;
		top: 14px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: hsl(var(--primary));
		border: 2px solid hsl(var(--card));
	}
	.timeline-label {
		color: hsl(var(--foreground));
		font-size: 13px;
	}
	.timeline-notes {
		color: hsl(var(--foreground) / 0.7);
		font-size: 12px;
		font-style: italic;
		margin-top: 2px;
	}
	.timeline-date {
		color: hsl(var(--muted-foreground));
		font-size: 11px;
		margin-top: 2px;
	}

	/* ---------- Dark: receita histórica (vidro branco translúcido), sem alteração de aparência ---------- */
	:global(.dark) .list-pane,
	:global(.dark) .detail-pane {
		background: rgba(255, 255, 255, 0.03);
		border-color: rgba(255, 255, 255, 0.08);
	}
	:global(.dark) .pane-header,
	:global(.dark) .filters,
	:global(.dark) .detail-header {
		border-bottom-color: rgba(255, 255, 255, 0.08);
	}
	:global(.dark) .pane-title,
	:global(.dark) .search input,
	:global(.dark) .list-item,
	:global(.dark) .list-title,
	:global(.dark) .page-btn,
	:global(.dark) .detail-title,
	:global(.dark) .input,
	:global(.dark) .timeline-label {
		color: white;
	}
	:global(.dark) .icon-btn {
		border-color: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
	}
	:global(.dark) .icon-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: white;
	}
	:global(.dark) .search {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
	}
	:global(.dark) .chip-label,
	:global(.dark) .list-meta,
	:global(.dark) .att-size,
	:global(.dark) .att-delete,
	:global(.dark) .section-title,
	:global(.dark) .detail-empty {
		color: rgba(255, 255, 255, 0.5);
	}
	:global(.dark) .filter-chip {
		border-color: rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.03);
		color: rgba(255, 255, 255, 0.7);
	}
	:global(.dark) .filter-chip:hover {
		background: rgba(255, 255, 255, 0.08);
	}
	:global(.dark) .filter-chip.active {
		background: rgba(147, 51, 234, 0.25);
		border-color: rgba(147, 51, 234, 0.55);
		color: white;
	}
	:global(.dark) .clear-btn {
		background: rgba(248, 113, 113, 0.12);
		color: #fca5a5;
	}
	:global(.dark) .alert-error,
	:global(.dark) .att-error,
	:global(.dark) .att-delete:hover:not(:disabled) {
		color: #fca5a5;
	}
	:global(.dark) .list-item {
		border-bottom-color: rgba(255, 255, 255, 0.05);
	}
	:global(.dark) .list-item:hover {
		background: rgba(255, 255, 255, 0.04);
	}
	:global(.dark) .list-item.selected {
		background: rgba(147, 51, 234, 0.12);
		border-left-color: #9333ea;
	}
	:global(.dark) .list-id,
	:global(.dark) .detail-meta {
		color: rgba(255, 255, 255, 0.55);
	}
	:global(.dark) .badge-nao-lidas {
		background: #25d366;
		color: #05240f;
	}
	:global(.dark) .meta-aguardando {
		color: #fbbf24;
	}
	:global(.dark) .meta-respondido {
		color: #6ee7b7;
	}
	:global(.dark) .loading-row,
	:global(.dark) .empty-row,
	:global(.dark) .page-info,
	:global(.dark) .action-label {
		color: rgba(255, 255, 255, 0.6);
	}
	:global(.dark) .pagination {
		border-top-color: rgba(255, 255, 255, 0.08);
	}
	:global(.dark) .page-btn,
	:global(.dark) .input {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.1);
	}
	:global(.dark) .detail-meta strong {
		color: rgba(255, 255, 255, 0.75);
	}
	:global(.dark) .detail-actions {
		background: rgba(255, 255, 255, 0.02);
		border-color: rgba(255, 255, 255, 0.06);
	}
	:global(.dark) .status-btn {
		border-color: rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.85);
	}
	:global(.dark) .status-btn:hover:not(:disabled) {
		background: rgba(147, 51, 234, 0.2);
		border-color: rgba(147, 51, 234, 0.4);
		color: white;
	}
	:global(.dark) .status-btn.current {
		background: rgba(147, 51, 234, 0.3);
		border-color: rgba(147, 51, 234, 0.6);
		color: white;
	}
	:global(.dark) .detail-desc {
		color: rgba(255, 255, 255, 0.85);
	}
	:global(.dark) .attachment-list li {
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.8);
	}
	:global(.dark) .att-link {
		color: #c4b5fd;
	}
	:global(.dark) .att-link:hover {
		color: #e9d5ff;
	}
	:global(.dark) .metadata-block {
		background: rgba(0, 0, 0, 0.25);
		border-color: rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.8);
	}
	:global(.dark) .timeline::before {
		background: rgba(255, 255, 255, 0.08);
	}
	:global(.dark) .timeline-dot {
		background: #9333ea;
		border-color: rgba(0, 0, 0, 0.5);
	}
	:global(.dark) .timeline-notes {
		color: rgba(255, 255, 255, 0.65);
	}
	:global(.dark) .timeline-date {
		color: rgba(255, 255, 255, 0.45);
	}
</style>
