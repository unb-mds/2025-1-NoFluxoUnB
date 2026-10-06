<script lang="ts">
	import { onMount } from 'svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import TicketChat from '$lib/components/tickets/TicketChat.svelte';
	import { ticketService } from '$lib/services/ticket.service';
	import { atualizarTicketsNaoLidas } from '$lib/stores/ticketsNaoLidas';
	import {
		CATEGORY_COLORS,
		CATEGORY_LABELS,
		STATUS_COLORS,
		STATUS_LABELS,
		type Ticket,
		type TicketAttachment,
		type TicketCategory
	} from '$lib/types/ticket';
	import {
		AlertTriangle,
		CheckCircle2,
		ChevronRight,
		Loader2,
		Paperclip,
		Plus,
		Send,
		X
	} from 'lucide-svelte';

	type Tab = 'novo' | 'meus';

	let activeTab = $state<Tab>('novo');

	let title = $state('');
	let description = $state('');
	let category = $state<TicketCategory>('bug');
	let files = $state<File[]>([]);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let justCreatedId = $state<number | null>(null);

	let myTickets = $state<Ticket[]>([]);
	let loadingList = $state(false);
	let listError = $state<string | null>(null);

	// Chamado aberto no Dialog de conversa (null = fechado).
	let ticketAberto = $state<Ticket | null>(null);
	// Anexos do chamado aberto, com URL assinada pra visualizar/baixar.
	let anexosDialog = $state<TicketAttachment[]>([]);

	const MAX_FILES = 3;
	const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
	const CATEGORIES: TicketCategory[] = ['bug', 'sugestao', 'duvida'];

	onMount(() => {
		// deep-link do menu/badge: /suporte?tab=meus abre direto em "Meus chamados"
		if (new URLSearchParams(window.location.search).get('tab') === 'meus') {
			activeTab = 'meus';
		}
		void loadMyTickets();
	});

	async function loadMyTickets() {
		loadingList = true;
		listError = null;
		try {
			myTickets = await ticketService.listMyTickets();
		} catch (e) {
			listError = e instanceof Error ? e.message : 'Erro ao carregar seus tickets.';
		} finally {
			loadingList = false;
		}
	}

	/**
	 * Recarrega a lista sem spinner — usada após enviar mensagem no chat,
	 * já que o status pode ter mudado (ex: aberto → em_andamento).
	 */
	async function recarregarMeusQuietly() {
		try {
			const novos = await ticketService.listMyTickets();
			myTickets = novos;
			// mantém o Dialog com o status fresco, se o chamado ainda existir
			if (ticketAberto) {
				const atualizado = novos.find((t) => t.id === ticketAberto?.id);
				if (atualizado) ticketAberto = atualizado;
			}
			// badge do avatar na navbar acompanha a leitura sem esperar o polling
			void atualizarTicketsNaoLidas();
		} catch {
			// silencioso — a lista antiga continua válida na tela
		}
	}

	function onDialogOpenChange(next: boolean) {
		if (!next) {
			ticketAberto = null;
			anexosDialog = [];
			// a conversa foi lida — atualiza os badges de não lidas na lista
			void recarregarMeusQuietly();
		}
	}

	/** Abre o Dialog da conversa e assina os anexos do chamado (se houver). */
	function abrirChamado(t: Ticket) {
		ticketAberto = t;
		anexosDialog = [];
		if (t.attachments && t.attachments.length > 0) {
			void ticketService.signAttachments(t.attachments).then((assinados) => {
				// descarta se o usuário trocou/fechou o chamado durante a assinatura
				if (ticketAberto?.id === t.id) anexosDialog = assinados;
			});
		}
	}

	function onFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const selected = Array.from(target.files ?? []);
		const valid: File[] = [];
		for (const f of selected) {
			if (f.size > MAX_FILE_SIZE) {
				submitError = `Arquivo "${f.name}" excede 8 MB.`;
				continue;
			}
			valid.push(f);
		}
		files = [...files, ...valid].slice(0, MAX_FILES);
		target.value = '';
	}

	function removeFile(idx: number) {
		files = files.filter((_, i) => i !== idx);
	}

	async function onSubmit(e: Event) {
		e.preventDefault();
		submitError = null;
		if (title.trim().length < 4) {
			submitError = 'O título precisa ter ao menos 4 caracteres.';
			return;
		}
		if (description.trim().length < 10) {
			submitError = 'A descrição precisa ter ao menos 10 caracteres.';
			return;
		}
		submitting = true;
		try {
			const created = await ticketService.createTicket({
				title,
				description,
				category,
				attachments: files
			});
			justCreatedId = created.id;
			title = '';
			description = '';
			category = 'bug';
			files = [];
			activeTab = 'meus';
			await loadMyTickets();
		} catch (e) {
			submitError = e instanceof Error ? e.message : 'Erro ao enviar ticket.';
		} finally {
			submitting = false;
		}
	}

	function formatDate(value: string): string {
		try {
			return new Date(value).toLocaleString('pt-BR', {
				day: '2-digit',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return value;
		}
	}
</script>

<PageMeta
	title="Suporte"
	description="Relate bugs, envie sugestões ou tire dúvidas sobre o NoFluxoUNB."
/>

<PageBackground />

<main class="relative z-10 flex min-h-[calc(100vh-64px)] flex-col items-center px-3 py-6 sm:px-4 sm:py-10">
	<div class="w-full max-w-3xl">
		<div class="mb-6 text-center sm:mb-8">
			<h1 class="text-2xl font-bold text-foreground sm:text-3xl">Suporte</h1>
			<p class="mt-1.5 text-sm text-muted-foreground sm:text-base">
				Relate um bug, envie uma sugestão ou tire uma dúvida. Nosso time técnico vai analisar.
			</p>
		</div>

		<div class="mb-5 flex gap-2 border-b border-foreground/10">
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'novo'}
				onclick={() => (activeTab = 'novo')}
			>
				<Plus class="h-4 w-4" />
				<span>Novo chamado</span>
			</button>
			<button
				type="button"
				class="tab-btn"
				class:active={activeTab === 'meus'}
				onclick={() => {
					activeTab = 'meus';
					void loadMyTickets();
				}}
			>
				<span>Meus chamados</span>
				{#if myTickets.length > 0}
					<span class="badge-count">{myTickets.length}</span>
				{/if}
			</button>
		</div>

		{#if activeTab === 'novo'}
			<form class="card" onsubmit={onSubmit}>
				<div class="field">
					<label for="ticket-category" class="label">Categoria</label>
					<div class="category-row">
						{#each CATEGORIES as cat}
							<button
								type="button"
								class="cat-chip"
								class:active={category === cat}
								onclick={() => (category = cat)}
							>
								{CATEGORY_LABELS[cat]}
							</button>
						{/each}
					</div>
				</div>

				<div class="field">
					<label for="ticket-title" class="label">Título</label>
					<input
						id="ticket-title"
						type="text"
						class="input"
						placeholder="Resumo curto (ex: Fluxograma não carrega no Firefox)"
						maxlength={120}
						bind:value={title}
					/>
				</div>

				<div class="field">
					<label for="ticket-description" class="label">Descrição</label>
					<textarea
						id="ticket-description"
						class="textarea"
						placeholder={category === 'bug'
							? 'Descreva o problema: o que você fez, o que esperava, e o que aconteceu. Adicione prints se possível.'
							: category === 'sugestao'
								? 'Conte sua ideia: qual problema ela resolve e como imagina que funcionaria.'
								: 'Faça sua pergunta com o máximo de contexto possível.'}
						rows={6}
						bind:value={description}
					></textarea>
				</div>

				<div class="field">
					<label for="ticket-attachments" class="label">
						Anexos <span class="label-hint">(opcional, até {MAX_FILES} arquivos, 8 MB cada)</span>
					</label>
					<label class="upload-trigger" for="ticket-attachments">
						<Paperclip class="h-4 w-4" />
						<span>Selecionar arquivos</span>
						<input
							id="ticket-attachments"
							type="file"
							class="hidden"
							multiple
							accept="image/*,.pdf,.txt,.log"
							onchange={onFileSelect}
						/>
					</label>
					{#if files.length > 0}
						<ul class="file-list">
							{#each files as f, i}
								<li class="file-item">
									<Paperclip class="h-3.5 w-3.5" />
									<span class="truncate">{f.name}</span>
									<span class="file-size">{(f.size / 1024).toFixed(0)} KB</span>
									<button
										type="button"
										class="file-remove"
										aria-label="Remover anexo"
										onclick={() => removeFile(i)}
									>
										<X class="h-3.5 w-3.5" />
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				{#if submitError}
					<div class="alert alert-error">
						<AlertTriangle class="h-4 w-4 shrink-0" />
						<span>{submitError}</span>
					</div>
				{/if}

				{#if justCreatedId}
					<div class="alert alert-success">
						<CheckCircle2 class="h-4 w-4 shrink-0" />
						<span>Chamado #{justCreatedId} enviado. Acompanhe em "Meus chamados".</span>
					</div>
				{/if}

				<button type="submit" class="submit-btn" disabled={submitting}>
					{#if submitting}
						<Loader2 class="h-4 w-4 animate-spin" />
						<span>Enviando…</span>
					{:else}
						<Send class="h-4 w-4" />
						<span>Enviar chamado</span>
					{/if}
				</button>
			</form>
		{:else}
			<div class="space-y-3">
				{#if loadingList}
					<div class="card loading">
						<Loader2 class="h-5 w-5 animate-spin" />
						<span>Carregando seus tickets…</span>
					</div>
				{:else if listError}
					<div class="alert alert-error">
						<AlertTriangle class="h-4 w-4 shrink-0" />
						<span>{listError}</span>
					</div>
				{:else if myTickets.length === 0}
					<div class="card empty">
						<p>Você ainda não abriu nenhum chamado.</p>
						<button class="link-btn" onclick={() => (activeTab = 'novo')}>Abrir o primeiro →</button>
					</div>
				{:else}
					{#each myTickets as t (t.id)}
						<!-- Card inteiro é um botão: abre a conversa do chamado no Dialog -->
						<button
							type="button"
							class="ticket-card"
							aria-label="Abrir conversa do chamado #{t.id}"
							onclick={() => abrirChamado(t)}
						>
							<div class="ticket-header">
								<span class="ticket-id">#{t.id}</span>
								<span class="chip {CATEGORY_COLORS[t.category]}">{CATEGORY_LABELS[t.category]}</span>
								<span class="chip {STATUS_COLORS[t.status]}">{STATUS_LABELS[t.status]}</span>
								<span class="ticket-date">{formatDate(t.created_at)}</span>
								{#if (t.unread_count ?? 0) > 0}
									<span
										class="badge-nao-lidas"
										aria-label="{t.unread_count} mensagem{(t.unread_count ?? 0) > 1
											? 'ns'
											: ''} não lida{(t.unread_count ?? 0) > 1 ? 's' : ''}"
									>
										{(t.unread_count ?? 0) > 99 ? '99+' : t.unread_count}
									</span>
								{/if}
							</div>
							<span class="ticket-title">{t.title}</span>
							<span class="ticket-desc">{t.description}</span>
							<div class="ticket-footer">
								{#if (t.unread_count ?? 0) === 0 && t.last_message_role === 'tech'}
									<span class="hint-respondido">✓ Suporte respondeu — sua vez</span>
								{/if}
								{#if t.attachments && t.attachments.length > 0}
									<div class="ticket-attachments">
										<Paperclip class="h-3.5 w-3.5" />
										<span>{t.attachments.length} anexo{t.attachments.length > 1 ? 's' : ''}</span>
									</div>
								{/if}
								<span class="ticket-ver">
									Ver conversa
									<ChevronRight class="h-3.5 w-3.5" />
								</span>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</main>

<!-- Dialog de conversa do chamado — mesmo padrão do SuporteFab -->
<Dialog.Root open={ticketAberto !== null} onOpenChange={onDialogOpenChange}>
	<Dialog.Content
		class="max-h-[88dvh] overflow-y-auto sm:max-w-2xl bg-card border-border text-foreground"
		showCloseButton={true}
	>
		{#if ticketAberto}
			<Dialog.Header>
				<Dialog.Title class="flex flex-wrap items-center gap-2 text-foreground">
					<span class="dialog-id">Chamado #{ticketAberto.id}</span>
					<span class="chip {CATEGORY_COLORS[ticketAberto.category]}">
						{CATEGORY_LABELS[ticketAberto.category]}
					</span>
					<span class="chip {STATUS_COLORS[ticketAberto.status]}">
						{STATUS_LABELS[ticketAberto.status]}
					</span>
				</Dialog.Title>
				<Dialog.Description class="text-foreground/85">
					{ticketAberto.title}
				</Dialog.Description>
			</Dialog.Header>

			<details class="descricao-original">
				<summary>Descrição original</summary>
				<p>{ticketAberto.description}</p>
			</details>

			{#if ticketAberto.attachments && ticketAberto.attachments.length > 0}
				<div class="anexos-dialog">
					<Paperclip class="h-3.5 w-3.5 shrink-0" />
					{#each anexosDialog.length > 0 ? anexosDialog : ticketAberto.attachments as att (att.path)}
						{#if att.signedUrl}
							<a class="anexo-link" href={att.signedUrl} target="_blank" rel="noopener noreferrer">
								{att.name}
							</a>
						{:else}
							<span class="anexo-pendente" title="Gerando link…">{att.name}</span>
						{/if}
					{/each}
				</div>
			{/if}

			<TicketChat
				ticketId={ticketAberto.id}
				ticketStatus={ticketAberto.status}
				perspective="user"
				onMessageSent={recarregarMeusQuietly}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style>
	.tab-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		color: hsl(var(--foreground) / 0.6);
		font-weight: 500;
		cursor: pointer;
		transition: color 150ms, border-color 150ms;
		font-size: 14px;
	}
	.tab-btn:hover {
		color: hsl(var(--foreground));
	}
	.tab-btn.active {
		color: hsl(var(--foreground));
		border-bottom-color: hsl(var(--primary));
	}
	.badge-count {
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
		border-radius: 9999px;
		padding: 1px 8px;
		font-size: 11px;
		font-weight: 600;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 18px;
		background: hsl(var(--card));
		backdrop-filter: blur(10px);
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		padding: 22px;
	}
	.card.loading,
	.card.empty {
		align-items: center;
		justify-content: center;
		gap: 10px;
		color: hsl(var(--muted-foreground));
		min-height: 140px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.label {
		font-size: 13px;
		font-weight: 600;
		color: hsl(var(--foreground) / 0.85);
	}
	.label-hint {
		font-weight: 400;
		color: hsl(var(--muted-foreground));
	}

	.input,
	.textarea {
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		color: hsl(var(--foreground));
		padding: 10px 12px;
		font-size: 14px;
		font-family: inherit;
		transition: border-color 150ms;
		width: 100%;
	}
	.input::placeholder,
	.textarea::placeholder {
		color: hsl(var(--muted-foreground));
	}
	.input:focus,
	.textarea:focus {
		outline: none;
		border-color: hsl(var(--ring));
	}
	.textarea {
		resize: vertical;
		min-height: 120px;
	}

	.category-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.cat-chip {
		padding: 8px 14px;
		border-radius: 999px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
		color: hsl(var(--foreground) / 0.8);
		font-size: 13px;
		cursor: pointer;
		transition: all 150ms;
	}
	.cat-chip:hover {
		background: hsl(var(--muted));
	}
	.cat-chip.active {
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.7);
		color: hsl(var(--accent-foreground));
	}

	.upload-trigger {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		border-radius: 8px;
		border: 1px dashed hsl(var(--border));
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--foreground) / 0.75);
		font-size: 13px;
		cursor: pointer;
		width: fit-content;
	}
	.upload-trigger:hover {
		background: hsl(var(--muted) / 0.7);
		color: hsl(var(--foreground));
	}
	.hidden {
		display: none;
	}

	.file-list {
		list-style: none;
		padding: 0;
		margin: 6px 0 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.file-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: hsl(var(--muted) / 0.5);
		border-radius: 6px;
		font-size: 12px;
		color: hsl(var(--foreground) / 0.8);
	}
	.file-size {
		margin-left: auto;
		color: hsl(var(--muted-foreground));
	}
	.file-remove {
		background: none;
		border: none;
		color: hsl(var(--foreground) / 0.6);
		cursor: pointer;
		padding: 2px;
		border-radius: 4px;
	}
	.file-remove:hover {
		color: hsl(var(--destructive));
	}

	.alert {
		display: flex;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 8px;
		font-size: 13px;
		border: 1px solid transparent;
	}
	.alert-error {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.3);
		color: hsl(var(--destructive));
	}
	.alert-success {
		background: rgba(16, 185, 129, 0.1);
		border-color: rgba(16, 185, 129, 0.3);
		/* emerald-800: 7,3:1 sobre o card */
		color: #065f46;
	}

	.submit-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 11px 18px;
		border-radius: 8px;
		border: none;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: transform 120ms, opacity 150ms;
	}
	.submit-btn:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.link-btn {
		background: none;
		border: none;
		color: hsl(var(--ai));
		cursor: pointer;
		font-weight: 500;
		padding: 0;
	}
	.link-btn:hover {
		color: hsl(var(--primary));
	}

	/* O card é um <button>: resetamos a aparência e mantemos o visual de card */
	.ticket-card {
		display: block;
		width: 100%;
		text-align: left;
		font-family: inherit;
		background: hsl(var(--card));
		backdrop-filter: blur(10px);
		border: 1px solid hsl(var(--border));
		border-radius: 10px;
		padding: 16px 18px;
		cursor: pointer;
		transition: border-color 150ms, transform 120ms;
	}
	.ticket-card:hover {
		border-color: hsl(var(--primary) / 0.5);
		transform: translateY(-1px);
	}
	.ticket-card:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}
	.ticket-header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 8px;
	}
	.ticket-id {
		font-family: 'JetBrains Mono', monospace;
		color: hsl(var(--muted-foreground));
		font-size: 12px;
	}
	.chip {
		display: inline-flex;
		padding: 2px 8px;
		font-size: 11px;
		font-weight: 600;
		border-radius: 4px;
		border: 1px solid;
	}
	.ticket-date {
		margin-left: auto;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.ticket-title {
		display: block;
		color: hsl(var(--foreground));
		font-size: 15px;
		font-weight: 600;
		margin: 0 0 4px;
	}
	.ticket-desc {
		color: hsl(var(--foreground) / 0.65);
		font-size: 13px;
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.ticket-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 8px;
	}
	.ticket-attachments {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	/* Hint discreto de que o card abre a conversa */
	.ticket-ver {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
		font-size: 12px;
		font-weight: 500;
		color: hsl(var(--ai));
		transition: color 150ms;
	}
	.ticket-card:hover .ticket-ver {
		color: hsl(var(--primary));
	}

	.dialog-id {
		font-family: 'JetBrains Mono', monospace;
		font-size: 14px;
		color: hsl(var(--foreground));
	}

	.descricao-original {
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		background: hsl(var(--muted) / 0.4);
		padding: 8px 12px;
		font-size: 13px;
	}
	.descricao-original summary {
		cursor: pointer;
		font-weight: 600;
		color: hsl(var(--foreground) / 0.8);
		user-select: none;
	}
	.descricao-original summary:hover {
		color: hsl(var(--foreground));
	}
	.descricao-original p {
		margin: 8px 0 0;
		color: hsl(var(--foreground) / 0.75);
		white-space: pre-wrap;
		overflow-wrap: break-word;
		max-height: 180px;
		overflow-y: auto;
	}

	/* Bolinha de não lidas estilo WhatsApp (verde, redonda, com contagem) */
	.badge-nao-lidas {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 22px;
		height: 22px;
		padding: 0 6px;
		border-radius: 999px;
		/* light: emerald-700 + branco (5,5:1), igual ao badge da navbar; .dark volta ao verde WhatsApp */
		background: #047857;
		color: #fff;
		font-size: 12px;
		font-weight: 700;
		line-height: 1;
	}
	.hint-respondido {
		color: #065f46;
		font-size: 12px;
	}

	/* Anexos do chamado no Dialog de conversa */
	.anexos-dialog {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		color: hsl(var(--muted-foreground));
		font-size: 13px;
	}
	.anexo-link {
		display: inline-flex;
		padding: 3px 10px;
		border-radius: 6px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--ai));
		text-decoration: none;
		max-width: 260px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition:
			border-color 150ms,
			color 150ms;
	}
	.anexo-link:hover {
		border-color: hsl(var(--primary) / 0.5);
		color: hsl(var(--primary));
	}
	.anexo-pendente {
		opacity: 0.6;
	}

	/* Dark: receita histórica, sem alteração de aparência */
	:global(.dark) .tab-btn.active {
		border-bottom-color: #9333ea;
	}
	:global(.dark) .badge-count {
		background: rgba(147, 51, 234, 0.2);
		color: #e9d5ff;
	}
	:global(.dark) .input:focus,
	:global(.dark) .textarea:focus {
		border-color: #9333ea;
	}
	:global(.dark) .cat-chip.active {
		background: rgba(147, 51, 234, 0.25);
		border-color: rgba(147, 51, 234, 0.6);
		color: white;
	}
	:global(.dark) .file-remove:hover {
		color: #f87171;
	}
	:global(.dark) .alert-error {
		color: #fca5a5;
	}
	:global(.dark) .alert-success,
	:global(.dark) .hint-respondido {
		color: #6ee7b7;
	}
	:global(.dark) .submit-btn {
		background: linear-gradient(90deg, #9333ea, #ec4899);
		color: white;
	}
	:global(.dark) .link-btn,
	:global(.dark) .ticket-ver,
	:global(.dark) .anexo-link {
		color: #c4b5fd;
	}
	:global(.dark) .link-btn:hover,
	:global(.dark) .ticket-card:hover .ticket-ver,
	:global(.dark) .anexo-link:hover {
		color: #e9d5ff;
	}
	:global(.dark) .ticket-card:hover,
	:global(.dark) .anexo-link:hover {
		border-color: rgba(147, 51, 234, 0.5);
	}
	:global(.dark) .ticket-card:focus-visible {
		outline-color: #c4b5fd;
	}
	:global(.dark) .badge-nao-lidas {
		background: #25d366;
		color: #05240f;
	}
</style>
