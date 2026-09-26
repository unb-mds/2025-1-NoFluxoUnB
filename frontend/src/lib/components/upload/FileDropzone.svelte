<script lang="ts">
	import { Upload, FileText, FileType2 } from 'lucide-svelte';
	import { validatePdfFile } from '$lib/utils/fileValidation';
	import { toast } from 'svelte-sonner';

	interface Props {
		onfileselected: (file: File) => void;
		disabled?: boolean;
	}

	let { onfileselected, disabled = false }: Props = $props();

	let isDragging = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		if (!disabled) isDragging = true;
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (!disabled) isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		if (disabled) return;

		const file = e.dataTransfer?.files[0];
		if (file) processFile(file);
	}

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) processFile(file);
		if (target) target.value = '';
	}

	function processFile(file: File) {
		const validation = validatePdfFile(file);
		if (!validation.valid) {
			toast.error(validation.error ?? 'Arquivo inválido.');
			return;
		}
		onfileselected(file);
	}

	function openFilePicker() {
		if (!disabled) fileInput?.click();
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
			e.preventDefault();
			openFilePicker();
		}
	}

	function handleSelectClick(e: MouseEvent) {
		e.stopPropagation();
		openFilePicker();
	}
</script>

<div
	class="dropzone"
	class:dropzone--drag={isDragging}
	class:dropzone--disabled={disabled}
	role="button"
	tabindex={disabled ? -1 : 0}
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	onclick={openFilePicker}
	onkeydown={handleKeydown}
	aria-label="Área para arrastar e soltar arquivo PDF"
>
	<input
		bind:this={fileInput}
		type="file"
		accept=".pdf,application/pdf"
		class="sr-only"
		onchange={handleFileSelect}
		{disabled}
	/>

	<div class="icon-wrap">
		{#if isDragging}
			<FileText class="size-11" stroke-width="2" />
		{:else}
			<Upload class="size-11" stroke-width="2" />
		{/if}
	</div>

	<p class="dropzone-title">
		{#if isDragging}
			Solte o PDF aqui
		{:else}
			Arraste seu histórico em PDF aqui
		{/if}
	</p>

	<div class="divider" aria-hidden="true">
		<span class="divider-line"></span>
		<span class="divider-text">ou</span>
		<span class="divider-line"></span>
	</div>

	<button
		type="button"
		class="select-btn"
		tabindex={-1}
		disabled={disabled}
		onclick={handleSelectClick}
	>
		<FileType2 class="size-4 shrink-0 opacity-95" aria-hidden="true" />
		Selecionar arquivo
	</button>

	<p class="dropzone-hint">Somente PDF (máx. 10MB). O documento deve ser o histórico oficial da UnB.</p>
</div>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.dropzone {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		padding: 2.5rem 1.5rem;
		border-radius: 14px;
		cursor: pointer;
		/* Light: tracejado em border-strong (≥ 3:1) sobre o fundo da página */
		border: 1.5px dashed hsl(var(--border-strong));
		background: hsl(var(--background));
		transition:
			border-color 0.2s ease,
			background 0.2s ease,
			box-shadow 0.2s ease;
	}

	/* :not(.dropzone--drag) mantém a especificidade abaixo de .dropzone--drag
	   (senão .dark .dropzone venceria e o feedback de drag do dark mudaria) */
	:global(.dark) .dropzone:not(.dropzone--drag) {
		border-color: hsl(var(--primary) / 0.35);
		background: hsl(var(--primary) / 0.04);
	}

	.dropzone:hover:not(.dropzone--disabled) {
		border-color: hsl(var(--primary) / 0.6);
		background: hsl(var(--primary) / 0.07);
		box-shadow: 0 0 0 1px hsl(var(--primary) / 0.12);
	}

	.dropzone:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px hsl(var(--ring) / 0.35);
	}

	.dropzone--drag {
		border-style: solid;
		border-color: hsl(var(--primary) / 0.7);
		background: hsl(var(--primary) / 0.1);
		box-shadow:
			0 0 0 1px hsl(var(--primary) / 0.22),
			0 0 32px hsl(var(--primary) / 0.12);
	}

	.dropzone--disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.icon-wrap {
		display: flex;
		height: 5rem;
		width: 5rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: hsl(var(--primary));
		border: 2px solid hsl(var(--primary) / 0.55);
		color: hsl(var(--primary-foreground));
		margin-bottom: 0.5rem;
		transition: transform 0.2s ease;
		box-shadow: 0 4px 14px hsl(var(--primary) / 0.28);
	}

	:global(.dark) .icon-wrap {
		box-shadow:
			0 0 24px hsl(var(--primary) / 0.4),
			inset 0 1px 0 hsl(0 0% 100% / 0.18);
	}

	.icon-wrap :global(svg) {
		color: hsl(var(--primary-foreground));
		stroke: hsl(var(--primary-foreground));
	}

	.dropzone--drag .icon-wrap {
		transform: scale(1.03);
	}

	.dropzone-title {
		margin-top: 1.25rem;
		font-size: 1.125rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		text-align: center;
	}

	.divider {
		display: flex;
		width: 100%;
		max-width: 220px;
		align-items: center;
		gap: 0.75rem;
		margin: 1.15rem 0;
	}

	.divider-line {
		height: 1px;
		flex: 1;
		background: hsl(var(--primary) / 0.3);
	}

	.divider-text {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.select-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.75rem;
		border-radius: 12px;
		border: none;
		font-size: 0.9375rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: hsl(var(--primary-foreground));
		background: hsl(var(--primary));
		cursor: pointer;
		box-shadow: 0 4px 14px hsl(var(--primary) / 0.22);
		transition:
			filter 0.15s ease,
			box-shadow 0.15s ease;
	}

	.select-btn:hover:not(:disabled) {
		filter: brightness(1.08);
		box-shadow: 0 6px 18px hsl(var(--primary) / 0.3);
	}

	:global(.dark) .select-btn {
		box-shadow:
			0 0 28px hsl(var(--primary) / 0.35),
			0 0 8px hsl(var(--primary) / 0.18);
	}

	:global(.dark) .select-btn:hover:not(:disabled) {
		box-shadow:
			0 0 36px hsl(var(--primary) / 0.45),
			inset 0 1px 0 hsl(0 0% 100% / 0.12);
	}

	.select-btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.dropzone-hint {
		margin-top: 1rem;
		max-width: 26rem;
		text-align: center;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: hsl(var(--muted-foreground));
	}
</style>
