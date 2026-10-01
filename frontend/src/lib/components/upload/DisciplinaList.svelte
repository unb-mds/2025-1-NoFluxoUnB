<script lang="ts">
	import { ChevronDown, ChevronUp } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

	interface DisciplinaItem {
		codigo?: string;
		nome?: string;
		nome_materia?: string;
		codigo_materia?: string;
		[key: string]: unknown;
	}

	interface Props {
		title: string;
		items: DisciplinaItem[];
		variant?: 'found' | 'missing' | 'elective';
	}

	let { title, items, variant = 'found' }: Props = $props();

	let expanded = $state(false);

	let headerColor = $derived(
		variant === 'found'
			? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-400'
			: variant === 'missing'
				? 'bg-orange-500/10 text-orange-700 border-orange-500/30 dark:bg-orange-500/20 dark:text-orange-400'
				: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400'
	);

	function toggle() {
		expanded = !expanded;
	}
</script>

<div class="rounded-lg border border-border overflow-hidden dark:border-foreground/5">
	<button
		type="button"
		class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-foreground/5 dark:hover:bg-foreground/5 {headerColor}"
		onclick={toggle}
		aria-expanded={expanded}
	>
		<span class="text-sm font-medium">
			{title} ({items.length})
		</span>
		{#if expanded}
			<ChevronUp class="h-4 w-4" />
		{:else}
			<ChevronDown class="h-4 w-4" />
		{/if}
	</button>

	{#if expanded}
		<div
			class="border-t border-border dark:border-foreground/5"
			transition:slide={{ duration: 200 }}
		>
			{#if items.length === 0}
				<p class="px-4 py-3 text-sm text-muted-foreground">Nenhuma disciplina encontrada.</p>
			{:else}
				<ul class="divide-y divide-border dark:divide-foreground/5">
					{#each items as item}
						<li class="flex min-w-0 items-center gap-2 px-3 py-2 text-xs sm:gap-3 sm:px-4 sm:py-2.5 sm:text-sm">
							<span class="shrink-0 font-mono text-[10px] text-muted-foreground sm:text-xs">
								{item.codigo || item.codigo_materia || '—'}
							</span>
							<span class="min-w-0 truncate text-foreground/85">
								{item.nome || item.nome_materia || 'Disciplina'}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
