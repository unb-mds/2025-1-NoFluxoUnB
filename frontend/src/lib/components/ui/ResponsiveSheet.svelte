<script lang="ts">
	// `ui/sheet/` (a subpasta shadcn-svelte ao lado desta) existe no código mas tem
	// zero imports reais — é código morto, não usar. Este é o overlay do Montador de
	// Grade: bottom sheet no celular e, no desktop, dialog centrado (`centro`) ou
	// gaveta lateral (`direita`, a de preferências).
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';
	import { camadasStore } from '$lib/stores/camadas.store.svelte';

	let {
		aberto,
		onClose,
		titulo,
		subtitulo,
		eyebrow,
		lado = 'centro',
		maxWidthClass = 'sm:max-w-md',
		children,
		footer
	}: {
		aberto: boolean;
		onClose: () => void;
		titulo?: string;
		subtitulo?: string;
		/** Rótulo pequeno acima do título ("Configuração rápida"). */
		eyebrow?: string;
		lado?: 'centro' | 'direita';
		/** Largura máxima no desktop (no celular o sheet ocupa a largura toda). */
		maxWidthClass?: string;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	let painel = $state<HTMLElement | null>(null);

	// Foco entra no painel ao abrir e volta para quem abriu ao fechar — sem isso o
	// teclado continuava atrás do overlay e, ao fechar, caía no topo da página.
	$effect(() => {
		if (!aberto || !painel) return;
		const anterior = document.activeElement as HTMLElement | null;
		painel.focus();
		return () => anterior?.focus?.();
	});

	// Avisa o resto da tela (chat da Darcy fica `inert` atrás do modal).
	$effect(() => {
		if (!aberto) return;
		return camadasStore.abrir();
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={aberto ? handleKeydown : undefined} />

{#if aberto}
	<div
		class="fixed inset-0 z-[var(--z-overlay)] flex items-end justify-center {lado === 'direita'
			? 'sm:items-stretch sm:justify-end'
			: 'sm:items-center'}"
		role="dialog"
		aria-modal="true"
		aria-label={titulo}
	>
		<button
			type="button"
			class="absolute inset-0 bg-black/50 backdrop-blur-[6px] dark:bg-black/65"
			aria-label="Fechar"
			tabindex="-1"
			onclick={onClose}
		></button>

		<div
			bind:this={painel}
			tabindex="-1"
			class="mg-overlay relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[20px] border-x-0 border-b-0 outline-none {maxWidthClass} {lado ===
			'direita'
				? 'sheet-lateral sm:max-h-none sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l'
				: 'sheet-centro sm:mx-4 sm:rounded-[20px] sm:border'}"
			style="padding-bottom: env(safe-area-inset-bottom, 0px);"
		>
			{#if titulo}
				<header class="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
					<div class="min-w-0">
						{#if eyebrow}<span class="mg-eyebrow">{eyebrow}</span>{/if}
						<h2 class="text-lg leading-tight font-semibold text-foreground">{titulo}</h2>
						{#if subtitulo}
							<p class="mt-0.5 truncate text-xs text-muted-foreground">{subtitulo}</p>
						{/if}
					</div>
					<button type="button" onclick={onClose} class="mg-icon-btn" aria-label="Fechar">
						<X class="h-4 w-4" />
					</button>
				</header>
			{/if}

			<div class="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain">
				{@render children()}
			</div>

			{#if footer}
				{@render footer()}
			{/if}
		</div>
	</div>
{/if}

<style>
	.sheet-centro,
	.sheet-lateral {
		animation: subir 220ms ease-out;
	}
	@media (min-width: 640px) {
		.sheet-centro {
			animation: surgir 200ms ease-out;
		}
		.sheet-lateral {
			height: 100dvh;
			animation: deslizar 220ms ease-out;
		}
	}
	@keyframes subir {
		from {
			transform: translateY(100%);
		}
	}
	@keyframes surgir {
		from {
			transform: translateY(12px) scale(0.98);
			opacity: 0;
		}
	}
	@keyframes deslizar {
		from {
			transform: translateX(100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet-centro,
		.sheet-lateral {
			animation: none;
		}
	}
</style>
