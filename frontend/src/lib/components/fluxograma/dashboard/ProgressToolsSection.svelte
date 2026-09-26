<script lang="ts">
	import { ArrowRightLeft } from 'lucide-svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import MudancaCursoModal from '$lib/components/fluxograma/modal/MudancaCursoModal.svelte';

	const store = fluxogramaStore;

	let showMudancaModal = $state(false);

	function handleMudancaClick() {
		if (store.state.isAnonymous) return;
		showMudancaModal = true;
	}
</script>

<div class="min-w-0 rounded-xl border border-border bg-background/80 dark:bg-black/40 p-2.5 backdrop-blur-md sm:p-3">
	<h3 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
		Ferramentas
	</h3>
	<button
		onclick={handleMudancaClick}
		disabled={store.state.isAnonymous}
		class="group flex w-full items-center gap-3 rounded-lg border border-border bg-gradient-to-br from-amber-500/10 to-amber-700/5 p-3 text-left transition-all hover:border-amber-500/30 hover:shadow-md sm:gap-4 dark:hover:shadow-lg sm:rounded-xl sm:p-3.5 disabled:cursor-not-allowed disabled:opacity-50"
	>
		<div class="rounded-full bg-amber-500/20 p-2 sm:p-2.5 {store.state.isAnonymous ? 'opacity-50' : ''}">
			<ArrowRightLeft class="h-5 w-5 text-amber-700 sm:h-6 sm:w-6 dark:text-amber-400" />
		</div>
		<div class="min-w-0 flex-1">
			<h4 class="text-xs font-semibold text-foreground/90 sm:text-sm">Mudança de Curso</h4>
			<p class="mt-0.5 text-[10px] leading-snug text-muted-foreground sm:text-xs">
				Simule integralização em outro curso
			</p>
		</div>
	</button>
</div>

<MudancaCursoModal open={showMudancaModal} onclose={() => (showMudancaModal = false)} />
