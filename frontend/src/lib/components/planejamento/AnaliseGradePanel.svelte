<script lang="ts">
	import type { Snippet } from 'svelte';
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { unidadeCargaStore } from '$lib/stores/unidade-carga.store.svelte';
	import { DIAS_SEMANA, SLOTS_DIA, bitIndex, agruparBlocosDia } from '$lib/utils/horario-slots';
	import { Check, Clock, CalendarDays, TriangleAlert, Info } from 'lucide-svelte';
	import HelpTip from '$lib/components/onboarding/HelpTip.svelte';

	/**
	 * Visão rápida da grade ativa: uma nota, o que falta para se formar
	 * (`situacao`, o `SituacaoPanel` embutido) e as métricas que a explicam. Tudo
	 * medido na grade que está na tela — nada aqui é estimativa.
	 */
	let {
		limiteCreditos,
		avisos = [],
		embutido = false,
		situacao
	}: {
		limiteCreditos: number;
		/** Diagnósticos já em português (essencial que não coube etc.). */
		avisos?: string[];
		/** Dentro de um sheet (celular): sem o cartão e sem o título repetido. */
		embutido?: boolean;
		situacao?: Snippet;
	} = $props();

	/** Pausa regular entre pares de módulos (09:50→10:00) — não conta como janela. */
	const INTERVALO_REGULAR_MIN = 10;
	/**
	 * Acima disto não é tempo parado no campus, é período livre (manhã de aula e
	 * noite de aula deixam a tarde inteira para outra coisa).
	 */
	const JANELA_MAX_MIN = 180;

	function minutos(hhmm: string): number {
		const [h, m] = hhmm.split(':').map(Number);
		return h * 60 + m;
	}

	const semana = $derived.by(() => {
		let dias = 0;
		let janelaMin = 0;
		for (const dia of DIAS_SEMANA) {
			const blocos = agruparBlocosDia(
				SLOTS_DIA.map((s) => gradeStore.ocupacao.get(bitIndex(dia.cod, s.offset)))
			);
			if (blocos.length === 0) continue;
			dias++;
			for (let i = 1; i < blocos.length; i++) {
				const anterior = blocos[i - 1];
				const fim = SLOTS_DIA[anterior.offsetStart + anterior.span - 1].fim;
				const gap = minutos(SLOTS_DIA[blocos[i].offsetStart].inicio) - minutos(fim);
				if (gap > INTERVALO_REGULAR_MIN && gap <= JANELA_MAX_MIN) janelaMin += gap;
			}
		}
		return { dias, janelaHoras: Math.round((janelaMin / 60) * 10) / 10 };
	});

	const naoCouberam = $derived(gradeStore.ultimaMontagem?.naoAlocadas ?? []);
	const acima = $derived(gradeStore.creditosSelecionados > limiteCreditos);
	const coReqs = $derived(
		[...gradeStore.selecao.keys()].filter((c) => gradeStore.coReqsFaltando(c).length > 0)
	);
	const vazia = $derived(gradeStore.selecao.size === 0);

	/**
	 * 100 menos o que pesa na semana do aluno: janela entre aulas, matéria que
	 * ficou de fora, carga acima do limite, co-requisito sem par. A fórmula está no
	 * HelpTip ao lado — nota sem explicação seria enfeite.
	 */
	const nota = $derived(
		vazia
			? null
			: Math.max(
					0,
					Math.min(
						100,
						Math.round(
							100 -
								semana.janelaHoras * 4 -
								naoCouberam.length * 8 -
								(acima ? 10 : 0) -
								coReqs.length * 5
						)
					)
				)
	);

	function nomeMateria(codigo: string): string {
		return gradeStore.pool.find((m) => m.codigo === codigo)?.nome ?? codigo;
	}
	function horas(h: number): string {
		return `${h.toLocaleString('pt-BR')}h`;
	}
</script>

<section
	class={embutido ? '' : 'mg-panel rounded-[18px] p-4'}
	data-tour="analise"
	aria-label="Análise da grade"
>
	<div class="flex items-center justify-between gap-2">
		{#if !embutido}
			<div>
				<span class="mg-eyebrow">Visão rápida</span>
				<h2 class="text-base font-semibold text-foreground">Análise da grade</h2>
			</div>
		{/if}
		{#if nota !== null}
			<span class="flex items-center gap-1 {embutido ? 'mb-3' : ''}">
				<span
					class="rounded-lg border px-2 py-1 text-[10px] text-muted-foreground {nota >= 80
						? 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/5'
						: 'border-amber-200 bg-amber-50 dark:border-amber-300/25 dark:bg-amber-400/5'}"
				>
					<strong
						class="mr-0.5 text-sm tabular-nums {nota >= 80
							? 'text-emerald-700 dark:text-emerald-300'
							: 'text-amber-700 dark:text-amber-300'}">{nota}</strong
					>/100
				</span>
				<HelpTip
					side="left"
					title="Como a nota é calculada"
					text="Parte de 100 e desconta: 4 pontos por hora de janela entre aulas, 8 por matéria que não coube, 10 se a carga passar do seu limite e 5 por co-requisito fora da grade."
				/>
			</span>
		{/if}
	</div>

	{#if situacao}
		<div class={embutido ? '' : 'mt-4'}>{@render situacao()}</div>
	{/if}

	{#if !vazia}
		<ul class="mt-2">
			{#if naoCouberam.length === 0}
				<li class="flex gap-2.5 border-t border-border px-0.5 py-2.5">
					<span
						class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
					>
						<Check class="h-3.5 w-3.5" />
					</span>
					<p>
						<strong class="block text-xs font-semibold text-foreground">Sem conflitos</strong>
						<small class="block text-[11px] text-muted-foreground">Todas as turmas são compatíveis</small>
					</p>
				</li>
			{:else}
				<li class="flex gap-2.5 border-t border-border px-0.5 py-2.5">
					<span
						class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
					>
						<TriangleAlert class="h-3.5 w-3.5" />
					</span>
					<p class="min-w-0">
						<strong class="block text-xs font-semibold text-foreground">
							{naoCouberam.length === 1 ? '1 matéria não coube' : `${naoCouberam.length} matérias não couberam`}
						</strong>
						<small class="block text-[11px] text-muted-foreground">
							{naoCouberam.map(nomeMateria).join(', ')} — por horário, turno ou limite de carga.
						</small>
					</p>
				</li>
			{/if}

			<li class="flex gap-2.5 border-t border-border px-0.5 py-2.5">
				<span
					class="grid h-6 w-6 shrink-0 place-items-center rounded-md {semana.janelaHoras <= 2
						? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
						: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'}"
				>
					<Clock class="h-3.5 w-3.5" />
				</span>
				<p>
					<strong class="block text-xs font-semibold text-foreground">
						{semana.janelaHoras === 0 ? 'Sem janelas' : `${horas(semana.janelaHoras)} de janelas`}
					</strong>
					<small class="block text-[11px] text-muted-foreground">
						{semana.janelaHoras <= 2 ? 'Boa distribuição semanal' : 'Tempo parado entre aulas no mesmo dia'}
					</small>
				</p>
			</li>

			<li class="flex gap-2.5 border-t border-border px-0.5 py-2.5">
				<span
					class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary dark:bg-purple-400/10 dark:text-purple-300"
				>
					<CalendarDays class="h-3.5 w-3.5" />
				</span>
				<p>
					<strong class="block text-xs font-semibold text-foreground">
						{semana.dias === 1 ? '1 dia com aula' : `${semana.dias} dias com aula`}
					</strong>
					<small class="block text-[11px] {acima ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}">
						{unidadeCargaStore.formatar(gradeStore.creditosSelecionados)}
						{acima ? `— acima do seu limite de ${unidadeCargaStore.formatar(limiteCreditos)}` : 'no semestre'}
					</small>
				</p>
			</li>

			{#each coReqs as c (c)}
				<li class="flex gap-2.5 border-t border-border px-0.5 py-2.5">
					<span
						class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
					>
						<TriangleAlert class="h-3.5 w-3.5" />
					</span>
					<p class="min-w-0">
						<strong class="block text-xs font-semibold text-foreground">Co-requisito fora da grade</strong>
						<small class="block text-[11px] text-muted-foreground">
							{c} pede {gradeStore.coReqsFaltando(c).join(', ')} no mesmo semestre.
						</small>
					</p>
				</li>
			{/each}
		</ul>
	{/if}

	{#each avisos as aviso (aviso)}
		<p
			class="mt-2 flex items-start gap-2 rounded-lg border border-border bg-foreground/[0.03] px-2.5 py-2 text-[11px] text-muted-foreground"
		>
			<Info class="mt-px h-3.5 w-3.5 shrink-0" />{aviso}
		</p>
	{/each}
</section>
