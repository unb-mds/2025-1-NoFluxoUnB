<script lang="ts">
	// `ui/sheet/` (a subpasta shadcn-svelte ao lado desta) existe no código mas tem
	// zero imports reais — é código morto, não usar. Este componente extrai o padrão
	// que já está em produção (bottom sheet no mobile / dialog centrado no desktop,
	// feito à mão em TrocarTurmaDialog.svelte) para reuso genérico — ex. o painel de
	// parâmetros do Montador de Grade pode usar isto em vez de recriar o overlay.
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';

	let {
		aberto,
		onClose,
		titulo,
		subtitulo,
		maxWidthClass = 'max-w-md',
		children,
		footer
	}: {
		aberto: boolean;
		onClose: () => void;
		titulo?: string;
		subtitulo?: string;
		/** Classe Tailwind de largura máxima do painel (default: max-w-md, igual ao TrocarTurmaDialog). */
		maxWidthClass?: string;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={aberto ? handleKeydown : undefined} />

{#if aberto}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
		<button type="button" class="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Fechar" onclick={onClose}></button>

		<div
			class="relative z-10 max-h-[85dvh] w-full {maxWidthClass} overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-2xl"
		>
			{#if titulo}
				<header class="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
					<div class="min-w-0">
						<h2 class="font-mono text-sm font-bold text-white">{titulo}</h2>
						{#if subtitulo}
							<p class="truncate text-xs text-white/55">{subtitulo}</p>
						{/if}
					</div>
					<button type="button" onclick={onClose} class="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Fechar">
						<X class="h-4 w-4" />
					</button>
				</header>
			{/if}

			{@render children()}

			{#if footer}
				{@render footer()}
			{/if}
		</div>
	</div>
{/if}
