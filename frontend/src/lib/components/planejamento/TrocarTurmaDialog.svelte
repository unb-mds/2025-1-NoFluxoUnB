<script lang="ts">
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import TurmaOption from './TurmaOption.svelte';
	import ResponsiveSheet from '$lib/components/ui/ResponsiveSheet.svelte';
	import { Ban, Trash2 } from 'lucide-svelte';

	// codigo != null → diálogo aberto para trocar a turma daquela matéria.
	let { codigo, onClose }: { codigo: string | null; onClose: () => void } = $props();

	const materia = $derived(codigo ? (gradeStore.pool.find((m) => m.codigo === codigo) ?? null) : null);
	let feedback = $state<string | null>(null);

	// Limpa o aviso ao abrir/trocar de matéria.
	$effect(() => {
		void codigo;
		feedback = null;
	});

	function escolher(idTurma: number) {
		if (!codigo) return;
		if (gradeStore.turmaSelecionada(codigo)?.turma.id_turmas === idTurma) {
			gradeStore.removerTurma(codigo);
			feedback = null;
			return;
		}
		const r = gradeStore.selecionarTurma(codigo, idTurma);
		feedback = r.ok ? null : r.conflitaCom ? `Conflita com ${r.conflitaCom}.` : 'Não foi possível inserir.';
	}
</script>

{#if materia}
	<ResponsiveSheet aberto={true} {onClose} titulo={materia.codigo} subtitulo={materia.nome}>
		{#if feedback}
			<p class="flex items-center gap-1.5 border-b border-red-300 bg-red-50 px-4 py-2 text-xs text-red-800 dark:border-red-300/20 dark:bg-red-500/10 dark:text-red-200">
				<Ban class="h-3.5 w-3.5 shrink-0" />{feedback}
			</p>
		{/if}

		<div class="max-h-[60dvh] space-y-1.5 overflow-y-auto p-3">
			{#if materia.turmas.length === 0}
				<p class="py-6 text-center text-xs text-muted-foreground">Sem turma ofertada neste período.</p>
			{:else}
				{#each materia.turmas as tg (tg.turma.id_turmas)}
					<TurmaOption codigo={materia.codigo} {tg} onToggle={() => escolher(tg.turma.id_turmas)} />
				{/each}
			{/if}
		</div>

		{#snippet footer()}
			{#if gradeStore.turmaSelecionada(materia.codigo)}
				<footer class="border-t border-border px-3 py-2.5">
					<button
						type="button"
						onclick={() => { gradeStore.removerTurma(materia.codigo); onClose(); }}
						class="inline-flex items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/10"
					>
						<Trash2 class="h-3.5 w-3.5" /> Remover da grade
					</button>
				</footer>
			{/if}
		{/snippet}
	</ResponsiveSheet>
{/if}
