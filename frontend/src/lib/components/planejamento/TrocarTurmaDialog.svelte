<script lang="ts">
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import TurmaOption from './TurmaOption.svelte';
	import { X, Ban, Trash2 } from 'lucide-svelte';

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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if materia}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
		<button type="button" class="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Fechar" onclick={onClose}></button>

		<div class="relative z-10 max-h-[85dvh] w-full max-w-md overflow-hidden rounded-t-2xl border border-border bg-card dark:bg-background shadow-2xl sm:rounded-2xl">
			<header class="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
				<div class="min-w-0">
					<h2 class="font-mono text-sm font-bold text-foreground">{materia.codigo}</h2>
					<p class="truncate text-xs text-muted-foreground">{materia.nome}</p>
				</div>
				<button type="button" onclick={onClose} class="rounded-lg p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground" aria-label="Fechar">
					<X class="h-4 w-4" />
				</button>
			</header>

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

			{#if gradeStore.turmaSelecionada(materia.codigo)}
				<footer class="border-t border-border px-3 py-2.5">
					<button
						type="button"
						onclick={() => { gradeStore.removerTurma(materia!.codigo); onClose(); }}
						class="inline-flex items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/10"
					>
						<Trash2 class="h-3.5 w-3.5" /> Remover da grade
					</button>
				</footer>
			{/if}
		</div>
	</div>
{/if}
