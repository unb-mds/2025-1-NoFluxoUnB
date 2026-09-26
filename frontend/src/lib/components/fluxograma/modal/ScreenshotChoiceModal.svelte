<script lang="ts">
	import { X, Camera, Link2 } from 'lucide-svelte';
	import { portal } from '$lib/actions/portal';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
		containerRef: HTMLElement | null;
	}

	let { open, onclose, containerRef }: Props = $props();

	function choose(mode: 'off' | 'all') {
		onclose();
		void fluxogramaStore.saveScreenshot(containerRef, { connectionMode: mode });
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) onclose();
	}

	$effect(() => {
		if (!open || typeof document === 'undefined') return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		data-screenshot-choice-modal
		class="fixed inset-0 z-[5600] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={onclose}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="screenshot-modal-title"
			tabindex="-1"
			class="w-full max-w-md rounded-2xl border border-border bg-card shadow-nofluxoLg backdrop-blur-xl dark:bg-gray-950/98 dark:shadow-2xl"
			onmousedown={(e) => e.stopPropagation()}
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-center justify-between border-b border-border px-4 py-3">
				<h2 id="screenshot-modal-title" class="text-base font-bold text-foreground">Screenshot do fluxograma</h2>
				<button
					type="button"
					onclick={onclose}
					class="rounded-lg p-2 text-muted-foreground hover:bg-foreground/10"
					aria-label="Fechar"
				>
					<X class="h-5 w-5" />
				</button>
			</div>
			<div class="space-y-3 px-4 py-4">
				<p class="text-sm text-muted-foreground">Como você quer exportar a imagem?</p>
				<button
					type="button"
					onclick={() => choose('off')}
					class="flex w-full items-center gap-3 rounded-xl border border-border bg-foreground/5 px-4 py-3 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/10"
				>
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-foreground/90">
						<Camera class="h-5 w-5" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block font-medium text-foreground">Normal</span>
						<span class="mt-0.5 block text-xs text-muted-foreground">Apenas as disciplinas, sem linhas de conexão</span>
					</span>
				</button>
				<button
					type="button"
					onclick={() => choose('all')}
					class="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-left transition-colors hover:border-purple-400/40 hover:bg-primary/15"
				>
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/25 text-accent-foreground dark:text-purple-200">
						<Link2 class="h-5 w-5" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block font-medium text-violet-900 dark:text-purple-100">Com todas as conexões</span>
						<span class="mt-0.5 block text-xs text-accent-foreground dark:text-purple-200/60">
							Pré-requisitos, dependentes e co-requisitos (modo “Todas”)
						</span>
					</span>
				</button>
				<button
					type="button"
					onclick={onclose}
					class="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/5"
				>
					Cancelar
				</button>
			</div>
		</div>
	</div>
{/if}
