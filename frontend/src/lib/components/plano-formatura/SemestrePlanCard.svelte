<script lang="ts">
	import type { SemestrePlano } from '$lib/types/plano-formatura';
	import MateriaPlanCard from './MateriaPlanCard.svelte';
	import SlotCard from './SlotCard.svelte';
	import { CalendarDays, BookOpen } from 'lucide-svelte';

	interface Props {
		semestre: SemestrePlano;
		/** Índice 0-based para determinar se é o próximo semestre (index === 0). */
		index: number;
		/** Unidade de exibição: 'creditos' ou 'horas'. */
		displayUnit?: 'creditos' | 'horas';
		/** Semestre atual do aluno (para calcular N+1, N+2, etc). */
		semestreAtual?: number;
		/** Código da matéria sendo hovereada para destacar setas de pré-requisito. */
		hoveredCode?: string | null;
	}

	let { semestre, index, displayUnit = 'creditos', semestreAtual = 1, hoveredCode = $bindable() }: Props = $props();

	const isFirst = $derived(index === 0);
	const isRecomendado = $derived(semestre.tipo === 'recomendado');

	/** Número do semestre: semestreAtual + index + 1 (pois começa depois do atual) */
	const numeroSemestre = $derived(semestreAtual + index + 1);

	/** Label do header: "Semestre [N+X] (Recomendado)" ou "Semestre [N+X] (Estimado)" */
	const headerLabel = $derived(
		`Semestre ${numeroSemestre} (${isRecomendado ? 'Recomendado' : 'Estimado'})`
	);

	/** Calcula a carga horária usando _horasInternas se disponível, senão converte créditos. */
	const totalHoras = $derived(
		semestre._horasInternas ?? Math.ceil(semestre.creditos * 15)
	);

	/** Exibição de carga — usa horas se selecionado, senão créditos. */
	const displayValue = $derived(
		displayUnit === 'horas' ? totalHoras : semestre.creditos
	);
	const displayLabel = $derived(displayUnit === 'horas' ? 'h' : 'créditos');

	const containerClass = $derived(
		isFirst
			? 'border-blue-500/50 bg-card shadow-nofluxo dark:bg-foreground/[0.03] dark:shadow-[0_0_0_1px_hsl(220_80%_60%/0.15),0_4px_24px_hsl(220_80%_40%/0.15)]'
			: 'border-border bg-card dark:bg-foreground/[0.02]'
	);

	const headerBg = $derived(
		isFirst
			? 'bg-blue-600/10 border-b border-blue-500/20'
			: 'bg-muted/60 border-b border-border'
	);

	const tagClass = $derived(
		isRecomendado
			? 'bg-blue-600/20 text-blue-800 ring-1 ring-blue-500/30 dark:text-blue-300'
			: 'bg-muted text-muted-foreground ring-1 ring-border'
	);

	const creditBadgeClass = $derived(
		isFirst
			? 'bg-blue-600/20 text-blue-800 ring-1 ring-blue-500/30 dark:text-blue-200'
			: 'bg-muted text-muted-foreground ring-1 ring-border'
	);
</script>

<div
	data-semester-column
	class="flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-2xl border {containerClass}"
>
	<!-- Header -->
	<div class="{headerBg} px-4 py-3.5">
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<CalendarDays class="h-4 w-4 {isFirst ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}" />
				<span class="text-sm font-semibold {isFirst ? 'text-foreground' : 'text-foreground/70'}">
					{headerLabel}
				</span>
			</div>
		</div>
		{#if semestre.semestre}
			<div class="mt-1.5 text-[11px] text-muted-foreground">
				{semestre.semestre}
			</div>
		{/if}

		<!-- Stats row -->
		<div class="mt-2.5 flex items-center gap-3">
			<div class="flex items-center gap-1.5">
				<span class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold {creditBadgeClass}">
					{displayValue} {displayLabel}
				</span>
			</div>
			<div class="flex items-center gap-1 text-[11px] text-muted-foreground">
				<BookOpen class="h-3 w-3" />
				<span>{semestre.materias.length} disciplinas</span>
			</div>
		</div>
	</div>

	<!-- Matérias list — scrollable -->
	<div class="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
		{#if semestre.materias.length === 0}
			<div class="flex flex-1 items-center justify-center py-8">
				<p class="text-center text-xs text-muted-foreground dark:text-foreground/25 leading-relaxed">
					Nenhuma matéria<br/>obrigatória pendente
				</p>
			</div>
		{:else}
			{#each semestre.materias as item, idx ('codigo' in item ? item.codigo : `slot-${item.tipo}-${idx}`)}
				{#if 'codigo' in item}
					<MateriaPlanCard materia={item} tipoSemestre={semestre.tipo} bind:hoveredCode />
				{:else}
					<SlotCard slot={item} />
				{/if}
			{/each}
		{/if}
	</div>
</div>
