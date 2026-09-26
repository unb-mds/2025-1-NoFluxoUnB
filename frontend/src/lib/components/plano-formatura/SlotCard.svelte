<script lang="ts">
	import type { OptativaSlot, ComplementarSlot } from '$lib/types/plano-formatura';

	interface Props {
		slot: OptativaSlot | ComplementarSlot;
	}

	let { slot }: Props = $props();

	const isOptativa = $derived(slot.tipo === 'optativa_slot');
	const label = $derived(isOptativa ? 'Optativas' : 'Atividades Complementares');
	const icon = $derived(isOptativa ? '📚' : '✓');
</script>

<div
	class="group relative flex flex-col gap-2.5 rounded-lg border border-dashed border-border-strong bg-transparent px-3.5 py-3 transition-all duration-150 hover:bg-muted/60 dark:border-slate-600 dark:hover:bg-transparent dark:hover:brightness-110"
>
	<!-- Header: label + horas -->
	<div class="flex items-center justify-between gap-2">
		<span class="font-mono text-[11px] font-bold tracking-wide text-muted-foreground">
			{icon} {label}
		</span>
		<span class="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-semibold text-foreground/70">
			~{slot.ch}h
		</span>
	</div>

	<!-- Description -->
	{#if slot.descricao}
		<p class="text-[12px] leading-snug text-muted-foreground">
			{slot.descricao}
		</p>
	{/if}
</div>
