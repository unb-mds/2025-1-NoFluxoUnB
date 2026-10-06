<script lang="ts">
	/**
	 * Legenda das cores de status dos cards. Mesmos tons da faixa lateral do
	 * SubjectCard: no light ≥ 3:1 sobre o fundo claro; o par dark: preserva as
	 * cores históricas do tema escuro. Usada na barra da legenda, no cabeçalho
	 * recolhido e na tela cheia do fluxograma.
	 */
	import { SubjectStatusEnum, getStatusLabel } from '$lib/types/materia';

	interface Props {
		/** Versão menor para faixas apertadas (cabeçalho recolhido, tela cheia). */
		compacta?: boolean;
		class?: string;
	}

	let { compacta = false, class: classe = '' }: Props = $props();

	const itens = [
		{ label: getStatusLabel(SubjectStatusEnum.COMPLETED), color: 'bg-emerald-600 dark:bg-green-500' },
		{ label: getStatusLabel(SubjectStatusEnum.IN_PROGRESS), color: 'bg-violet-600 dark:bg-purple-500' },
		{ label: getStatusLabel(SubjectStatusEnum.AVAILABLE), color: 'bg-amber-600 dark:bg-orange-500' },
		{ label: getStatusLabel(SubjectStatusEnum.FAILED), color: 'bg-red-600 dark:bg-red-500' },
		{ label: getStatusLabel(SubjectStatusEnum.LOCKED), color: 'bg-border-strong dark:bg-gray-500' }
	];
</script>

<div
	class="flex flex-wrap items-center {compacta ? 'gap-x-2.5 gap-y-1' : 'gap-x-3 gap-y-1.5'} {classe}"
	role="group"
	aria-label="Legenda de status das disciplinas no fluxograma"
>
	{#each itens as item}
		<span
			class="inline-flex items-center gap-1.5 leading-tight font-medium text-foreground/95 {compacta
				? 'text-[11px]'
				: 'text-xs'}"
		>
			<span
				class="shrink-0 {compacta ? 'h-2.5 w-2.5 rounded-[3px]' : 'h-3 w-3 rounded-md'} {item.color}"
				aria-hidden="true"
			></span>
			{item.label}
		</span>
	{/each}
</div>
