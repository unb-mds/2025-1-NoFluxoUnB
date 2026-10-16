<script lang="ts">
	import { browser } from '$app/environment';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { HelpCircle } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	/**
	 * Dica de ajuda no padrão do DS. Sem `children`, renderiza o ícone "?" padrão;
	 * com `children`, vira wrapper de qualquer gatilho (botão, chip, título).
	 */
	let {
		text,
		title = '',
		side = 'top',
		children,
		class: className = ''
	}: {
		text: string;
		title?: string;
		side?: 'top' | 'bottom' | 'left' | 'right';
		children?: Snippet;
		class?: string;
	} = $props();

	/*
	 * Tooltip depende de hover: no celular o toque mal abre e o texto some antes de
	 * dar pra ler. Sem hover, o "?" padrão abre um pop-up modal. O modo com
	 * `children` continua tooltip — o gatilho é um botão com ação própria.
	 */
	let semHover = $state(false);
	let popupAberto = $state(false);
	$effect(() => {
		if (!browser) return;
		const mq = window.matchMedia('(hover: none)');
		const aplicar = () => (semHover = mq.matches);
		aplicar();
		mq.addEventListener('change', aplicar);
		return () => mq.removeEventListener('change', aplicar);
	});
</script>

{#if semHover && !children}
	<button
		type="button"
		class={`help-trigger help-trigger-toque ${className}`}
		aria-label={title || text}
		onclick={(e) => {
			e.stopPropagation();
			popupAberto = true;
		}}
	>
		<HelpCircle class="h-3.5 w-3.5 text-muted-foreground/80" />
	</button>
	<Dialog.Root bind:open={popupAberto}>
		<Dialog.Content
			class="max-w-[calc(100%-2rem)] gap-2 rounded-2xl border-border bg-popover p-5 pr-11 text-foreground normal-case tracking-normal sm:max-w-sm dark:bg-background"
		>
			<Dialog.Title class="text-sm font-semibold text-foreground">
				{title || 'Ajuda'}
			</Dialog.Title>
			<Dialog.Description class="text-[13px] leading-relaxed text-foreground/75">
				{text}
			</Dialog.Description>
		</Dialog.Content>
	</Dialog.Root>
{:else}
<Tooltip.Provider delayDuration={200}>
	<Tooltip.Root>
		{#if children}
			<!--
				Com gatilho próprio o Trigger vira <span> (snippet `child`): o conteúdo
				normalmente já é um <button>/<a>, e botão dentro de botão é HTML inválido
				— o navegador desmonta a árvore e o clique original para de funcionar.
			-->
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<span {...props} class={`help-trigger-wrap ${className}`}>
						{@render children()}
					</span>
				{/snippet}
			</Tooltip.Trigger>
		{:else}
			<Tooltip.Trigger class={`help-trigger ${className}`} aria-label={title || text}>
				<HelpCircle class="h-3.5 w-3.5 text-muted-foreground/80 transition-colors hover:text-foreground/80" />
			</Tooltip.Trigger>
		{/if}
		<Tooltip.Content
			{side}
			sideOffset={6}
			class="nf-card-surface z-[140] max-w-[260px] border-border bg-popover/95 px-3 py-2 text-foreground backdrop-blur-md dark:border-foreground/12 dark:bg-background/95"
			arrowClasses="bg-popover dark:bg-background"
		>
			{#if title}
				<p class="mb-0.5 text-[12px] font-semibold text-foreground">{title}</p>
			{/if}
			<p class="text-[11px] leading-relaxed text-foreground/70">{text}</p>
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
{/if}

<style>
	:global(.help-trigger) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: help;
	}

	/* Ícone de 14px é alvo pequeno demais pro dedo: área de toque de 32px sem mexer no layout. */
	:global(.help-trigger-toque) {
		cursor: pointer;
		padding: 9px;
		margin: -9px;
	}

	:global(.help-trigger-wrap) {
		display: inline-flex;
		align-items: center;
	}
</style>
