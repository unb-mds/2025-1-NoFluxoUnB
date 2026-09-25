<script lang="ts">
	import { ArrowRightLeft, GraduationCap } from 'lucide-svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import MudancaCursoModal from '$lib/components/fluxograma/modal/MudancaCursoModal.svelte';
	import DuplaDiplomacaoModal from '$lib/components/fluxograma/modal/DuplaDiplomacaoModal.svelte';

	const store = fluxogramaStore;

	let showMudancaModal = $state(false);
	let showDuplaModal = $state(false);

	function handleMudancaClick() {
		if (store.state.isAnonymous) return;
		showMudancaModal = true;
	}

	function handleDuplaClick() {
		if (store.state.isAnonymous) return;
		showDuplaModal = true;
	}
</script>

<div class="min-w-0 rounded-xl border border-white/10 bg-black/40 p-2.5 backdrop-blur-md sm:p-3">
	<h3 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/50 sm:text-xs">
		Ferramentas
	</h3>
	<div class="space-y-2">
		<button
			onclick={handleMudancaClick}
			disabled={store.state.isAnonymous}
			class="group flex w-full items-center gap-3 rounded-lg border border-white/10 bg-gradient-to-br from-amber-500/10 to-amber-700/5 p-3 text-left transition-all hover:border-amber-500/30 hover:shadow-lg sm:gap-4 sm:rounded-xl sm:p-3.5 disabled:cursor-not-allowed disabled:opacity-50"
		>
			<div class="rounded-full bg-amber-500/20 p-2 sm:p-2.5 {store.state.isAnonymous ? 'opacity-50' : ''}">
				<ArrowRightLeft class="h-5 w-5 text-amber-400 sm:h-6 sm:w-6" />
			</div>
			<div class="min-w-0 flex-1">
				<h4 class="text-xs font-semibold text-white/90 sm:text-sm">Mudança de Curso</h4>
				<p class="mt-0.5 text-[10px] leading-snug text-white/50 sm:text-xs">
					Simule integralização em outro curso
				</p>
			</div>
		</button>
		<button
			onclick={handleDuplaClick}
			disabled={store.state.isAnonymous}
			class="group flex w-full items-center gap-3 rounded-lg border border-white/10 bg-gradient-to-br from-emerald-500/10 to-emerald-700/5 p-3 text-left transition-all hover:border-emerald-500/30 hover:shadow-lg sm:gap-4 sm:rounded-xl sm:p-3.5 disabled:cursor-not-allowed disabled:opacity-50"
		>
			<div class="rounded-full bg-emerald-500/20 p-2 sm:p-2.5 {store.state.isAnonymous ? 'opacity-50' : ''}">
				<GraduationCap class="h-5 w-5 text-emerald-400 sm:h-6 sm:w-6" />
			</div>
			<div class="min-w-0 flex-1">
				<h4 class="text-xs font-semibold text-white/90 sm:text-sm">Dupla Diplomação</h4>
				<p class="mt-0.5 text-[10px] leading-snug text-white/50 sm:text-xs">
					Simule elegibilidade em outro curso
				</p>
			</div>
		</button>
	</div>
</div>

<MudancaCursoModal open={showMudancaModal} onclose={() => (showMudancaModal = false)} />
<DuplaDiplomacaoModal open={showDuplaModal} onclose={() => (showDuplaModal = false)} />
