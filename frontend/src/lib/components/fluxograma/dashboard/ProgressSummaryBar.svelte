<script lang="ts">
	import type { CursoModel } from '$lib/types/curso';
	import type { IntegralizacaoResult } from '$lib/types/matriz';
	import { isOptativa } from '$lib/types/materia';
	import type { DadosFluxogramaUser } from '$lib/types/user';
	import { getTotalCreditsCompleted } from '$lib/types/user';
	import { GraduationCap, Calendar, Loader2 } from 'lucide-svelte';
	import { formatarIraParaExibicao } from '$lib/utils/ira';

	interface Props {
		courseData: CursoModel | null;
		userFluxograma: DadosFluxogramaUser | null;
		integralizacao?: IntegralizacaoResult | null;
		integralizacaoLoading?: boolean;
	}

	let {
		courseData,
		userFluxograma,
		integralizacao,
		integralizacaoLoading = false
	}: Props = $props();

	let totalCredits = $derived.by(() => {
		if (!courseData) return 0;
		if (courseData.totalCreditos != null && courseData.totalCreditos > 0) {
			return courseData.totalCreditos;
		}
		return courseData.materias
			.filter((m) => !isOptativa(m))
			.reduce((sum, m) => sum + m.creditos, 0);
	});

	let completedCredits = $derived.by(() => {
		if (!userFluxograma || !courseData) return 0;
		const creditsMap = new Map(courseData.materias.map((m) => [m.codigoMateria, m.creditos]));
		return getTotalCreditsCompleted(userFluxograma, creditsMap);
	});

	let usaHoras = $derived(!!integralizacao && integralizacao.exigido.chTotal > 0);

	let progressValue = $derived(
		integralizacaoLoading
			? '—'
			: usaHoras && integralizacao
				? `${integralizacao.realizado.chTotal.toLocaleString('pt-BR')}h / ${integralizacao.exigido.chTotal.toLocaleString('pt-BR')}h`
				: `${completedCredits}/${totalCredits} cr`
	);

	let progressPct = $derived(
		integralizacaoLoading
			? null
			: usaHoras && integralizacao
				? Math.round((integralizacao.realizado.chTotal / integralizacao.exigido.chTotal) * 100)
				: totalCredits > 0
					? Math.round((completedCredits / totalCredits) * 100)
					: null
	);

	let currentSemester = $derived(userFluxograma?.semestreAtual ?? null);
</script>

{#if userFluxograma}
	<div
		class="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden text-xs sm:text-sm"
		aria-label="Resumo de progresso"
	>
		<span
			class="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-background/80 dark:bg-black/40 px-3 py-1 text-foreground/80 backdrop-blur-md"
		>
			{#if integralizacaoLoading}
				<Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600 dark:text-green-400" />
			{:else}
				<GraduationCap class="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-green-400" />
			{/if}
			<span class="truncate font-semibold text-foreground">{progressValue}</span>
			{#if progressPct != null}
				<span class="text-muted-foreground">· {progressPct}%</span>
			{/if}
		</span>

		{#if currentSemester != null}
			<span
				class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 dark:bg-black/40 px-3 py-1 text-foreground/80 backdrop-blur-md"
			>
				<Calendar class="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
				<span class="font-semibold text-foreground">{currentSemester}º</span>
				<span class="text-muted-foreground">semestre</span>
			</span>
		{/if}

		{#if userFluxograma.ira != null}
			<span
				class="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 dark:bg-black/40 px-3 py-1 text-foreground/80 backdrop-blur-md"
			>
				<span class="text-muted-foreground">IRA</span>
				<span class="font-semibold text-foreground"
					>{formatarIraParaExibicao(userFluxograma.ira, userFluxograma.iraTexto)}</span
				>
			</span>
		{/if}
	</div>
{/if}
