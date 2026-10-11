<script lang="ts">
	import { vagaAssinaturasStore } from '$lib/stores/vaga-assinaturas.store.svelte';
	import { Bell, BellOff, Loader2 } from 'lucide-svelte';
	import type { TurmaOferta } from '$lib/services/turmas.service';

	/**
	 * "Avisar quando abrir vaga" para uma turma. Deriva tudo do
	 * `vagaAssinaturasStore` — o chamador só passa a turma.
	 *
	 * Não se renderiza sozinho quando não faz sentido (turma com vaga, ou
	 * assinaturas ainda não carregadas), então dá para usar sem `{#if}` em volta.
	 */
	let { turma }: { turma: TurmaOferta } = $props();

	const mostrar = $derived(vagaAssinaturasStore.podeSeguir(turma));
	const seguindo = $derived(
		vagaAssinaturasStore.isSeguindo(turma.id_materia, turma.turma, turma.ano_periodo)
	);
	const busy = $derived(
		vagaAssinaturasStore.isBusy(turma.id_materia, turma.turma, turma.ano_periodo)
	);
</script>

{#if mostrar}
	<button
		type="button"
		disabled={busy}
		onclick={() => vagaAssinaturasStore.toggle(turma.id_materia, turma.turma, turma.ano_periodo)}
		class="inline-flex touch-manipulation items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 {seguindo
			? 'border-primary/45 bg-primary/15 text-accent-foreground hover:bg-primary/25'
			: 'border-border bg-muted/60 text-muted-foreground hover:bg-muted'}"
	>
		{#if busy}
			<Loader2 class="h-3 w-3 animate-spin" />
		{:else if seguindo}
			<Bell class="h-3 w-3" />
		{:else}
			<BellOff class="h-3 w-3" />
		{/if}
		{seguindo ? 'Seguindo — aviso quando abrir vaga' : 'Avisar quando abrir vaga'}
	</button>
{/if}
