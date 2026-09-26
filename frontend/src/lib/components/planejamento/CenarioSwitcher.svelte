<script lang="ts">
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { Plus, Pencil, X } from 'lucide-svelte';

	let editingId = $state<string | null>(null);
	let editNome = $state('');

	function startEdit(id: string, nome: string) {
		editingId = id;
		editNome = nome;
	}
	function commitEdit() {
		if (editingId) gradeStore.renomearCenario(editingId, editNome);
		editingId = null;
	}
	function autofocus(node: HTMLInputElement) {
		node.focus();
		node.select();
	}
</script>

<div class="flex flex-wrap items-center gap-1.5">
	{#each gradeStore.grades as c (c.id)}
		{@const ativo = c.id === gradeStore.activeId}
		{#if editingId === c.id}
			<input
				use:autofocus
				bind:value={editNome}
				onblur={commitEdit}
				onkeydown={(e) => e.key === 'Enter' && commitEdit()}
				class="w-28 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-foreground focus:outline-none"
			/>
		{:else}
			<div
				class="flex items-center gap-0.5 rounded-full border px-1 text-xs transition-colors {ativo
					? 'border-primary/40 bg-primary/15 text-accent-foreground'
					: 'border-border bg-foreground/5 text-foreground/70 hover:bg-foreground/10'}"
			>
				<button type="button" onclick={() => gradeStore.selecionarCenario(c.id)} class="touch-manipulation px-2 py-1.5 font-medium">
					{c.nome}
				</button>
				{#if ativo}
					<button type="button" onclick={() => startEdit(c.id, c.nome)} class="touch-manipulation rounded-full p-1.5 hover:bg-foreground/10" aria-label="Renomear cenário">
						<Pencil class="h-3 w-3" />
					</button>
					<button type="button" onclick={() => gradeStore.removerCenario(c.id)} class="touch-manipulation rounded-full p-1.5 hover:bg-foreground/10" aria-label="Excluir cenário">
						<X class="h-3 w-3" />
					</button>
				{/if}
			</div>
		{/if}
	{/each}

	<button
		type="button"
		onclick={() => gradeStore.criarCenario()}
		class="inline-flex items-center gap-1 rounded-full border border-border bg-foreground/5 px-2.5 py-1 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/10"
	>
		<Plus class="h-3.5 w-3.5" /> Novo
	</button>
</div>
