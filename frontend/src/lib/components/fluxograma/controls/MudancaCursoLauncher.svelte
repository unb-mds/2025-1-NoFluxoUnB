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

<button
	type="button"
	onclick={handleMudancaClick}
	disabled={store.state.isAnonymous}
	class="group inline-flex items-center gap-2.5 rounded-full border border-amber-500/40 bg-gradient-to-br from-amber-500/20 to-amber-700/10 px-4 py-2 text-left shadow-sm transition-all hover:border-amber-400/60 hover:from-amber-500/30 hover:to-amber-700/15 hover:shadow-md disabled:cursor-not-allowed dark:hover:shadow-lg disabled:opacity-50"
	title="Simule integralização em outro curso"
>
	<span class="rounded-full bg-amber-500/25 p-1.5 {store.state.isAnonymous ? 'opacity-50' : ''}">
		<ArrowRightLeft class="h-4 w-4 text-amber-700 sm:h-5 sm:w-5 dark:text-amber-300" />
	</span>
	<span class="min-w-0">
		<span class="block text-xs font-semibold text-foreground sm:text-sm">Mudança de Curso</span>
		<span class="block text-[10px] leading-snug text-muted-foreground sm:text-xs"
			>Simule integralização em outro curso</span
		>
	</span>
</button>

<MudancaCursoModal open={showMudancaModal} onclose={() => (showMudancaModal = false)} />
