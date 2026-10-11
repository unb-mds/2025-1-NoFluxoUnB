<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ROUTES } from '$lib/config/routes';
	import { ticketService } from '$lib/services/ticket.service';
	import { authStore } from '$lib/stores/auth';
	import {
		CATEGORY_LABELS,
		type TicketCategory
	} from '$lib/types/ticket';
	import {
		AlertTriangle,
		LifeBuoy,
		CheckCircle2,
		Loader2,
		Paperclip,
		Send,
		X
	} from 'lucide-svelte';
	import { get } from 'svelte/store';

	let open = $state(false);

	const MINIMIZED_KEY = 'suporte-fab-minimized';

	let minimized = $state(false);

	onMount(() => {
		try {
			minimized = localStorage.getItem(MINIMIZED_KEY) === '1';
		} catch {
			minimized = false;
		}
	});

	function setMinimized(value: boolean) {
		minimized = value;
		try {
			localStorage.setItem(MINIMIZED_KEY, value ? '1' : '0');
		} catch {
			/* localStorage indisponível — mantém apenas em memória */
		}
	}

	let title = $state('');
	let description = $state('');
	let category = $state<TicketCategory>('bug');
	let files = $state<File[]>([]);

	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let createdId = $state<number | null>(null);

	const MAX_FILES = 3;
	const MAX_FILE_SIZE = 8 * 1024 * 1024;
	const CATEGORIES: TicketCategory[] = ['bug', 'sugestao', 'duvida'];

	function resetForm() {
		title = '';
		description = '';
		category = 'bug';
		files = [];
		submitError = null;
		createdId = null;
	}

	function onOpenChange(next: boolean) {
		open = next;
		if (!next) {
			setTimeout(resetForm, 200);
		} else {
			const state = get(authStore);
			if (!state.isAuthenticated || !state.user) {
				open = false;
				goto(`${ROUTES.LOGIN}?redirect=${encodeURIComponent('/suporte')}`);
			}
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
		if (description.trim().length < 10) {
			submitError = 'Conte um pouco mais: descreva em ao menos 10 caracteres.';
			return;
		}
		// Título é opcional — se vazio, usa o começo da descrição como resumo.
		const resolvedTitle =
			title.trim() || description.trim().slice(0, 60) + (description.trim().length > 60 ? '…' : '');
		submitting = true;
		try {
			const created = await ticketService.createTicket({
				title: resolvedTitle,
				description,
				category,
				attachments: files
			});
			createdId = created.id;
		} catch (e) {
			submitError = e instanceof Error ? e.message : 'Erro ao enviar ticket.';
		} finally {
			submitting = false;
		}
	}
</script>

<!-- FAB de ajuda (canto inferior esquerdo — longe do chat de IA, com rótulo claro) -->
{#if minimized}
	<button
		type="button"
		class="suporte-tab"
		aria-label="Mostrar botão de ajuda"
		title="Ajuda"
		onclick={() => setMinimized(false)}
	>
		<LifeBuoy class="h-4 w-4" />
	</button>
{:else}
	<div class="suporte-fab-wrap">
		<button
			type="button"
			class="suporte-fab"
			aria-label="Ajuda e suporte"
			onclick={() => onOpenChange(true)}
		>
			<LifeBuoy class="h-5 w-5" />
			<span class="fab-label">Ajuda</span>
		</button>
		<button
			type="button"
			class="fab-minimize"
			aria-label="Minimizar botão de ajuda"
			title="Minimizar"
			onclick={() => setMinimized(true)}
		>
			<X class="h-3 w-3" />
		</button>
	</div>
{/if}

<Dialog.Root {open} onOpenChange={onOpenChange}>
	<Dialog.Content
		class="sm:max-w-lg bg-card border-border text-foreground"
		showCloseButton={true}
	>
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-foreground">
				<LifeBuoy class="h-5 w-5 text-pink-600 dark:text-pink-400" />
				<span>Precisa de ajuda?</span>
			</Dialog.Title>
			<Dialog.Description class="text-muted-foreground">
				Relate um problema, envie uma sugestão ou tire uma dúvida — nosso time acompanha.
			</Dialog.Description>
		</Dialog.Header>

		{#if createdId !== null}
			<div class="success-state">
				<CheckCircle2 class="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
				<h3>Recebemos seu chamado #{createdId}</h3>
				<p>Nosso time vai analisar. Você pode acompanhar o andamento em "Meus chamados".</p>
				<div class="success-actions">
					<button type="button" class="btn-secondary" onclick={() => (createdId = null, resetForm())}>
						Enviar outro
					</button>
					<button
						type="button"
						class="btn-primary"
						onclick={() => {
							open = false;
							goto(ROUTES.SUPORTE);
						}}
					>
						Acompanhar
					</button>
				</div>
			</div>
		{:else}
			<form class="form" onsubmit={onSubmit}>
				<div class="field">
					<span class="label">Categoria</span>
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
					<label for="fab-ticket-title" class="label">
						Título <span class="label-hint">(opcional)</span>
					</label>
					<input
						id="fab-ticket-title"
						type="text"
						class="input"
						placeholder="Resumo curto (ex: Fluxograma não carrega no Firefox)"
						maxlength={120}
						bind:value={title}
					/>
				</div>

				<div class="field">
					<label for="fab-ticket-description" class="label">O que aconteceu?</label>
					<textarea
						id="fab-ticket-description"
						class="textarea"
						placeholder={category === 'bug'
							? 'Descreva o problema: o que você fez, o que esperava, e o que aconteceu.'
							: category === 'sugestao'
								? 'Conte sua ideia: qual problema ela resolve e como imagina que funcionaria.'
								: 'Faça sua pergunta com o máximo de contexto possível.'}
						rows={5}
						bind:value={description}
					></textarea>
				</div>

				<div class="field">
					<label for="fab-ticket-attachments" class="label">
						Anexos <span class="label-hint">(opcional, até {MAX_FILES}, 8 MB cada)</span>
					</label>
					<label class="upload-trigger" for="fab-ticket-attachments">
						<Paperclip class="h-4 w-4" />
						<span>Selecionar arquivos</span>
						<input
							id="fab-ticket-attachments"
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
					<div class="alert">
						<AlertTriangle class="h-4 w-4 shrink-0" />
						<span>{submitError}</span>
					</div>
				{/if}

				<div class="actions">
					<button
						type="button"
						class="btn-secondary"
						onclick={() => onOpenChange(false)}
						disabled={submitting}
					>
						Cancelar
					</button>
					<button type="submit" class="btn-primary" disabled={submitting}>
						{#if submitting}
							<Loader2 class="h-4 w-4 animate-spin" />
							<span>Enviando…</span>
						{:else}
							<Send class="h-4 w-4" />
							<span>Enviar</span>
						{/if}
					</button>
				</div>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style>
	.suporte-fab-wrap {
		position: fixed;
		left: 20px;
		bottom: 20px;
		z-index: 40;
	}
	/* Pílula rotulada no canto INFERIOR ESQUERDO — deixa claro que é ajuda,
	   sem se confundir com o chat de IA (que vive no canto inferior direito). */
	.suporte-fab {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 16px;
		border-radius: 999px;
		border: 1px solid hsl(var(--border) / 0.5);
		background: hsl(var(--background) / 0.5);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: hsl(var(--foreground) / 0.9);
		cursor: pointer;
		font-size: 14px;
		font-weight: 600;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
		transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
	}
	.fab-label {
		white-space: nowrap;
	}
	.suporte-fab:hover {
		transform: translateY(-2px);
		background: hsl(var(--muted) / 0.8);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
	}
	.suporte-fab:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 3px;
	}
	.fab-minimize {
		position: absolute;
		top: -6px;
		right: -6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted));
		color: hsl(var(--foreground) / 0.85);
		cursor: pointer;
		opacity: 0;
		transform: scale(0.8);
		transition: opacity 150ms ease, transform 150ms ease, background 150ms ease;
	}
	.suporte-fab-wrap:hover .fab-minimize,
	.fab-minimize:focus-visible {
		opacity: 1;
		transform: scale(1);
	}
	.fab-minimize:hover {
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}
	/* Aba lateral discreta exibida quando minimizado (lado esquerdo) */
	.suporte-tab {
		position: fixed;
		left: 0;
		bottom: 90px;
		z-index: 40;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 44px;
		border: 1px solid hsl(var(--border) / 0.5);
		border-left: none;
		border-radius: 0 8px 8px 0;
		background: hsl(var(--background) / 0.5);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: hsl(var(--foreground) / 0.9);
		cursor: pointer;
		opacity: 0.7;
		box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.1);
		transition: opacity 150ms ease, width 150ms ease, background 150ms ease;
	}
	.suporte-tab:hover,
	.suporte-tab:focus-visible {
		opacity: 1;
		width: 32px;
		outline: none;
		background: hsl(var(--muted) / 0.8);
	}

	@media (max-width: 640px) {
		.suporte-fab-wrap {
			left: 16px;
			bottom: 16px;
		}
		.fab-minimize {
			opacity: 1;
			transform: scale(1);
		}
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.label {
		font-size: 12px;
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
		padding: 9px 11px;
		font-size: 13px;
		font-family: inherit;
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
		min-height: 100px;
	}
	.category-row {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.cat-chip {
		padding: 6px 12px;
		border-radius: 999px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
		color: hsl(var(--foreground) / 0.8);
		font-size: 12px;
		cursor: pointer;
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
		gap: 6px;
		padding: 7px 12px;
		border-radius: 6px;
		border: 1px dashed hsl(var(--border));
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--foreground) / 0.75);
		font-size: 12px;
		cursor: pointer;
		width: fit-content;
	}
	.hidden {
		display: none;
	}
	.file-list {
		list-style: none;
		padding: 0;
		margin: 4px 0 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.file-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 9px;
		background: hsl(var(--muted) / 0.5);
		border-radius: 5px;
		font-size: 11px;
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
	}
	.file-remove:hover {
		color: hsl(var(--destructive));
	}
	.alert {
		display: flex;
		gap: 8px;
		padding: 9px 11px;
		border-radius: 6px;
		font-size: 12px;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: hsl(var(--destructive));
	}
	.actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		margin-top: 4px;
	}
	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid transparent;
		transition: transform 120ms, opacity 150ms;
	}
	.btn-primary {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}
	.btn-primary:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-secondary {
		background: hsl(var(--muted) / 0.6);
		border-color: hsl(var(--border));
		color: hsl(var(--foreground));
	}
	.btn-secondary:hover:not(:disabled) {
		background: hsl(var(--muted));
	}
	.success-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 18px 0 8px;
		text-align: center;
	}
	.success-state h3 {
		color: hsl(var(--foreground));
		font-size: 16px;
		font-weight: 700;
		margin: 0;
	}
	.success-state p {
		color: hsl(var(--foreground) / 0.65);
		font-size: 13px;
		margin: 0;
	}
	.success-actions {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}

	/* Dark: receita histórica, sem alteração de aparência */
	:global(.dark) .suporte-fab:focus-visible {
		outline-color: #c4b5fd;
	}
	:global(.dark) .input:focus,
	:global(.dark) .textarea:focus {
		border-color: #c4b5fd;
	}
	:global(.dark) .cat-chip.active {
		background: rgba(147, 51, 234, 0.3);
		border-color: rgba(147, 51, 234, 0.6);
		color: white;
	}
	:global(.dark) .file-remove:hover {
		color: #f87171;
	}
	:global(.dark) .alert {
		color: #fca5a5;
	}
	:global(.dark) .btn-primary {
		background: linear-gradient(90deg, #9333ea, #ec4899);
		color: white;
	}
</style>
