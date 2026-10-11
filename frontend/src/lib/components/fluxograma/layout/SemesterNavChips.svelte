<script lang="ts">
	import { browser } from '$app/environment';
	import { SlidersHorizontal, Maximize2, Minimize2 } from 'lucide-svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import {
		matchesFluxogramCompactTouchMode,
		FLUXOGRAM_NARROW_QUERY,
		FLUXOGRAM_COMPACT_LANDSCAPE_QUERY
	} from '$lib/utils/fluxogram-viewport';

	/**
	 * Barra de controles mobile no fluxo da página (logo abaixo do fluxograma):
	 * painel de ajustes + navegação por semestre + modo foco. Nada flutua sobre
	 * os cards — no modo foco os controles voltam ao overlay (FluxogramViewportChrome).
	 */

	interface Props {
		/** Abre o painel de controle (zoom, conexões, filtros). */
		onOpenControls?: () => void;
		/** Alterna o modo foco do fluxograma. */
		onToggleFocus?: () => void;
		focusMode?: boolean;
	}

	let { onOpenControls, onToggleFocus, focusMode = false }: Props = $props();

	const store = fluxogramaStore;

	/** Mesma condição do chrome compacto (mobile + landscape estreito). */
	let compactTouch = $state(false);

	$effect(() => {
		if (!browser) return;
		const apply = () => {
			compactTouch = matchesFluxogramCompactTouchMode();
		};
		apply();
		const mqNarrow = window.matchMedia(FLUXOGRAM_NARROW_QUERY);
		const mqLand = window.matchMedia(FLUXOGRAM_COMPACT_LANDSCAPE_QUERY);
		mqNarrow.addEventListener('change', apply);
		mqLand.addEventListener('change', apply);
		window.addEventListener('resize', apply);
		return () => {
			mqNarrow.removeEventListener('change', apply);
			mqLand.removeEventListener('change', apply);
			window.removeEventListener('resize', apply);
		};
	});

	let semesterList = $derived.by(() => {
		const keys = new Set<number>();
		for (const k of store.subjectsBySemester.keys()) if (k > 0) keys.add(k);
		for (const k of store.optativasBySemester.keys()) if (k > 0) keys.add(k);
		for (const k of store.extrasCursadasBySemester.keys()) if (k > 0) keys.add(k);
		return Array.from(keys).sort((a, b) => a - b);
	});

	let semestreAtualAluno = $derived(store.userFluxograma?.semestreAtual ?? null);

	function scrollToSemester(n: number) {
		const root = document.querySelector<HTMLElement>('[data-fluxogram-scroll-root]');
		const col = root?.querySelector<HTMLElement>(`[data-semester="${n}"]`);
		if (!root || !col) return;
		const rootRect = root.getBoundingClientRect();
		const colRect = col.getBoundingClientRect();
		root.scrollTo({
			left: Math.max(0, root.scrollLeft + (colRect.left - rootRect.left) - 16),
			behavior: 'smooth'
		});
	}

	let navEl: HTMLElement | null = $state(null);

	// A faixa abre com o chip do semestre atual centralizado — o diagrama também abre nele.
	$effect(() => {
		const n = semestreAtualAluno;
		void semesterList.length;
		const el = navEl;
		if (!el || n == null) return;
		const chip = el.querySelector<HTMLElement>(`[data-chip="${n}"]`);
		if (!chip) return;
		el.scrollLeft = Math.max(0, chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2);
	});
</script>

{#if compactTouch}
	<div class="flex items-center gap-2 py-1.5">
		{#if onOpenControls}
			<button
				type="button"
				onclick={onOpenControls}
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95"
				aria-label="Painel de controle do fluxograma"
				title="Painel de controle"
			>
				<SlidersHorizontal class="h-5 w-5" />
			</button>
		{/if}

		{#if semesterList.length > 1}
			<nav
				bind:this={navEl}
				class="semester-chips -my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1"
				aria-label="Ir para um semestre do fluxograma"
			>
				{#each semesterList as sem (sem)}
					<button
						type="button"
						data-chip={sem}
						onclick={() => scrollToSemester(sem)}
						class="h-9 min-w-[2.5rem] shrink-0 rounded-full border px-2.5 text-xs font-semibold transition-colors active:scale-95 {sem === semestreAtualAluno
							? 'border-primary/70 bg-primary/85 text-primary-foreground shadow-lg shadow-primary/25'
							: 'border-border bg-foreground/5 text-foreground/85'}"
						aria-label="Ir para o semestre {sem}"
					>
						{sem}º
					</button>
				{/each}
			</nav>
		{:else}
			<div class="min-w-0 flex-1"></div>
		{/if}

		{#if onToggleFocus}
			<button
				type="button"
				onclick={onToggleFocus}
				class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-500/35 bg-cyan-500/15 text-cyan-800 shadow-lg transition-colors active:scale-95 dark:text-cyan-100"
				aria-label={focusMode ? 'Sair do modo foco do fluxograma' : 'Modo foco do fluxograma'}
				title={focusMode ? 'Sair do modo foco' : 'Modo foco'}
			>
				{#if focusMode}
					<Minimize2 class="h-5 w-5" />
				{:else}
					<Maximize2 class="h-5 w-5" />
				{/if}
			</button>
		{/if}
	</div>
{/if}

<style>
	.semester-chips {
		scrollbar-width: none;
	}

	.semester-chips::-webkit-scrollbar {
		display: none;
	}
</style>
