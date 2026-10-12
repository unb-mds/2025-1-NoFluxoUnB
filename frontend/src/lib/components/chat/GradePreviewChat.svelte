<script lang="ts">
	/**
	 * Mini-grade da Darcy dentro do chat: a semana da opção que o solver montou,
	 * as métricas reais e, quando o backend devolveu mais de uma opção, abas para
	 * comparar (menos dias × menos furos × equilibrada) antes de aplicar.
	 *
	 * Layout por largura do CONTÊINER (o painel flutuante do desktop também é
	 * estreito): estreito = lista por dia (dia vazio aparece como "livre");
	 * largo (`@md`) = grade compacta dias × módulos.
	 */
	import { CalendarPlus, ArrowUpRight, CalendarDays, Clock, Hourglass } from 'lucide-svelte';
	import type { OpcaoGradeChat } from '$lib/types/plano-formatura';
	import { SLOTS_DIA } from '$lib/utils/horario-slots';
	import { formatHoraCompacta } from '$lib/utils/sigaa';
	import {
		formatarMinutos,
		montarSemanaPreview,
		rotuloCurtoEstrategia
	} from '$lib/utils/grade-preview';

	let {
		opcoes,
		inicial = 0,
		modo,
		nomeDe,
		rotulo,
		onAplicar
	}: {
		/** Opções com `detalhes` (horários); a 1ª aba aberta é `inicial`. */
		opcoes: OpcaoGradeChat[];
		inicial?: number;
		/** 'aplicar' no Montador; 'abrir' leva ao Montador. */
		modo: 'aplicar' | 'abrir';
		nomeDe: (codigo: string) => string | undefined;
		rotulo: (opcao: OpcaoGradeChat) => string;
		onAplicar: (opcao: OpcaoGradeChat) => void;
	} = $props();

	let escolhida = $state(0);
	$effect.pre(() => {
		escolhida = Math.min(Math.max(inicial, 0), opcoes.length - 1);
	});

	const opcao = $derived(opcoes[escolhida] ?? opcoes[0]);
	const detalhes = $derived(opcao.detalhes ?? []);
	const semana = $derived(montarSemanaPreview(detalhes));
	const turmaDe = $derived(new Map(detalhes.map((d) => [d.codigo, d])));

	// Cor por matéria (ordem da seleção), com par claro/escuro.
	const CORES = [
		'border-indigo-500/40 bg-indigo-500/15 text-indigo-900 dark:text-indigo-100',
		'border-emerald-500/40 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100',
		'border-amber-500/50 bg-amber-500/20 text-amber-900 dark:text-amber-100',
		'border-rose-500/40 bg-rose-500/15 text-rose-900 dark:text-rose-100',
		'border-sky-500/40 bg-sky-500/15 text-sky-900 dark:text-sky-100',
		'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-900 dark:text-fuchsia-100'
	];
	const indiceCor = $derived(new Map(opcao.selecao.map((s, i) => [s.codigo, i])));
	const cor = (codigo: string) => CORES[(indiceCor.get(codigo) ?? 0) % CORES.length];

	const nome = (codigo: string) => nomeDe(codigo) ?? codigo;
	const linhasGrade = $derived(Math.max(0, semana.slotMax - semana.slotMin + 1));
</script>

<div
	class="border-border bg-card/80 @container my-2 w-full max-w-[88%] min-w-0 overflow-hidden rounded-2xl border shadow-sm max-sm:max-w-full dark:border-white/10 dark:bg-white/5"
>
	{#if opcoes.length > 1}
		<!-- Abas do comparador: rolam na horizontal no celular -->
		<div
			class="border-border flex snap-x gap-1 overflow-x-auto border-b px-2 pt-2 dark:border-white/10"
			role="tablist"
			aria-label="Opções de grade"
		>
			{#each opcoes as o, i}
				<button
					type="button"
					role="tab"
					aria-selected={i === escolhida}
					onclick={() => (escolhida = i)}
					class="min-h-9 shrink-0 snap-start rounded-t-lg border-b-2 px-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors max-sm:min-h-11 {i ===
					escolhida
						? 'border-primary text-foreground dark:border-indigo-400 dark:text-white'
						: 'text-muted-foreground hover:text-foreground border-transparent dark:text-white/55 dark:hover:text-white'}"
				>
					{rotuloCurtoEstrategia(o.estrategia)}
				</button>
			{/each}
		</div>
	{/if}

	<div class="space-y-3 p-3 sm:p-4">
		{#if opcao.metricas}
			{@const m = opcao.metricas}
			<div class="flex flex-wrap gap-1.5 text-[12px]">
				<span
					class="bg-foreground/5 text-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium dark:bg-white/10 dark:text-white/90"
				>
					<CalendarDays class="h-3.5 w-3.5" />
					{m.diasComAula}
					{m.diasComAula === 1 ? 'dia' : 'dias'} com aula
				</span>
				<span
					class="bg-foreground/5 text-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium dark:bg-white/10 dark:text-white/90"
				>
					<Hourglass class="h-3.5 w-3.5" />
					{m.minutosDeLacuna === 0 ? 'sem furos' : `${formatarMinutos(m.minutosDeLacuna)} de furo`}
				</span>
				<span
					class="bg-foreground/5 text-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium dark:bg-white/10 dark:text-white/90"
				>
					<Clock class="h-3.5 w-3.5" />
					{formatarMinutos(m.horasTotais * 60)}/semana
				</span>
			</div>
		{/if}

		<!-- Estreito: lista por dia -->
		<div class="divide-border divide-y @md:hidden dark:divide-white/10">
			{#each semana.dias as dia}
				<div class="flex gap-3 py-1.5">
					<span
						class="text-muted-foreground w-9 shrink-0 pt-1 text-[12px] font-bold dark:text-white/60"
						>{dia.label}</span
					>
					{#if dia.blocos.length === 0}
						<span class="text-muted-foreground pt-1 text-[12px] italic dark:text-white/50"
							>livre</span
						>
					{:else}
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							{#each dia.blocos as b}
								{@const t = turmaDe.get(b.codigo)}
								<div
									class="flex min-w-0 items-baseline gap-2 rounded-lg border px-2 py-1 text-[12.5px] {cor(
										b.codigo
									)}"
									title={t?.docente ?? undefined}
								>
									<span class="shrink-0 font-mono text-[11.5px] tabular-nums"
										>{formatHoraCompacta(b.inicio)}–{formatHoraCompacta(b.fim)}</span
									>
									<span class="min-w-0 truncate font-semibold">{nome(b.codigo)}</span>
									{#if t?.turma}
										<span class="ml-auto shrink-0 text-[11px] opacity-75">T{t.turma}</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Largo: grade compacta (só a faixa de módulos com aula) -->
		{#if linhasGrade > 0}
			<div
				class="hidden gap-px text-[11px] @md:grid"
				style="grid-template-columns: 2.6rem repeat({semana.dias
					.length}, minmax(0, 1fr)); grid-template-rows: 1.4rem repeat({linhasGrade}, 1.35rem);"
			>
				{#each semana.dias as dia, di}
					<div
						class="text-muted-foreground text-center font-bold dark:text-white/60"
						style="grid-column: {di + 2}; grid-row: 1;"
					>
						{dia.label}
					</div>
				{/each}
				{#each Array.from({ length: linhasGrade }, (_, i) => semana.slotMin + i) as slot, ri}
					<div
						class="text-muted-foreground pr-1 text-right font-mono text-[10px] leading-[1.35rem] tabular-nums dark:text-white/45"
						style="grid-column: 1; grid-row: {ri + 2};"
					>
						{formatHoraCompacta(SLOTS_DIA[slot].inicio)}
					</div>
				{/each}
				{#each semana.dias as dia, di}
					{#each dia.blocos as b}
						{@const t = turmaDe.get(b.codigo)}
						<div
							class="m-px flex min-w-0 flex-col overflow-hidden rounded-md border px-1 py-0.5 leading-tight {cor(
								b.codigo
							)}"
							style="grid-column: {di + 2}; grid-row: {b.slotInicio -
								semana.slotMin +
								2} / span {b.span};"
							title="{nome(b.codigo)}{t?.turma ? ` · T${t.turma}` : ''}{t?.docente
								? ` · ${t.docente}`
								: ''}"
						>
							<span class="truncate font-semibold">{nome(b.codigo)}</span>
							{#if b.span > 1}
								<span class="truncate opacity-75"
									>{formatHoraCompacta(b.inicio)}–{formatHoraCompacta(b.fim)}</span
								>
							{/if}
						</div>
					{/each}
				{/each}
			</div>
		{/if}

		{#if semana.semHorario.length > 0}
			<p class="text-muted-foreground text-[12px] dark:text-white/55">
				Sem horário fixo: {semana.semHorario.map(nome).join(', ')}
			</p>
		{/if}

		<button
			type="button"
			onclick={() => onAplicar(opcao)}
			class="flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-emerald-600/60 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 active:scale-[0.99] max-sm:min-h-12 dark:border-emerald-500/40 dark:bg-emerald-600/20 dark:text-emerald-50 dark:hover:bg-emerald-600/40"
		>
			{#if modo === 'abrir'}
				<ArrowUpRight class="h-4 w-4 shrink-0" />
			{:else}
				<CalendarPlus class="h-4 w-4 shrink-0" />
			{/if}
			<span class="truncate">{rotulo(opcao)}</span>
		</button>
	</div>
</div>
