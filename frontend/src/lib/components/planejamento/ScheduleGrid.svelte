<script lang="ts">
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { DIAS_SEMANA, SLOTS_DIA, bitIndex, agruparBlocosDia } from '$lib/utils/horario-slots';
	import { CalendarClock, ChevronRight, ChevronsUpDown } from 'lucide-svelte';

	/**
	 * A semana da grade ativa. `grade` é a visão semanal do desktop (dias em
	 * colunas, módulos SIGAA em linhas); `agenda` é a lista por dia do celular,
	 * onde seis colunas em 360px ficariam ilegíveis. Quem escolhe é a view — ela já
	 * sabe se está no layout compacto. Clicar num bloco abre os detalhes da matéria.
	 */
	let {
		onBlocoClick,
		modo = 'grade'
	}: { onBlocoClick: (codigo: string) => void; modo?: 'grade' | 'agenda' } = $props();

	let mostrarTudo = $state(false);

	const DIA_LONGO: Record<string, string> = {
		'2': 'Segunda',
		'3': 'Terça',
		'4': 'Quarta',
		'5': 'Quinta',
		'6': 'Sexta',
		'7': 'Sábado'
	};

	// Para cada dia, os blocos contínuos (módulos consecutivos da mesma matéria).
	const gridPorDia = $derived.by(() =>
		DIAS_SEMANA.map((dia) => {
			const codigos = SLOTS_DIA.map((slot) =>
				gradeStore.ocupacao.get(bitIndex(dia.cod, slot.offset))
			);
			return { dia, blocos: agruparBlocosDia(codigos) };
		})
	);

	const temAlgo = $derived(gradeStore.ocupacao.size > 0);

	// Turnos sem aula somem (a menos que o aluno peça a semana inteira): com os 16
	// módulos sempre à mostra, a grade de quem só estuda de manhã vira dois terços
	// de linhas vazias.
	const turnosUsados = $derived.by(() => {
		const usados = new Set<'M' | 'T' | 'N'>();
		for (const coluna of gridPorDia) {
			for (const bloco of coluna.blocos) {
				for (let i = bloco.offsetStart; i < bloco.offsetStart + bloco.span; i++) {
					usados.add(SLOTS_DIA[i].turno);
				}
			}
		}
		return usados;
	});

	const slotsVisiveis = $derived.by(() => {
		const todos = SLOTS_DIA.map((slot, i) => ({ slot, orig: i }));
		if (mostrarTudo || !temAlgo) return todos;
		return todos.filter(({ slot }) => turnosUsados.has(slot.turno));
	});

	/** offset global → linha visível (índice em slotsVisiveis). */
	const linhaVisivel = $derived.by(() => {
		const m = new Map<number, number>();
		slotsVisiveis.forEach(({ orig }, vis) => m.set(orig, vis));
		return m;
	});

	// Segunda a sexta sempre; sábado só quando tem aula (ou com a semana inteira).
	const diasVisiveis = $derived(
		DIAS_SEMANA.filter(
			(dia) =>
				dia.cod !== '7' ||
				mostrarTudo ||
				gridPorDia.some((c) => c.dia.cod === '7' && c.blocos.length > 0)
		)
	);

	const colunaVisivel = $derived.by(() => {
		const m = new Map<string, number>();
		diasVisiveis.forEach((dia, vis) => m.set(dia.cod, vis));
		return m;
	});

	const haOculto = $derived(temAlgo && slotsVisiveis.length < SLOTS_DIA.length);

	/** Agenda: só os dias que têm aula, na ordem da semana. */
	const agendaPorDia = $derived(gridPorDia.filter((c) => c.blocos.length > 0));

	function aulas(n: number): string {
		return n === 1 ? '1 aula' : `${n} aulas`;
	}
	function faixaHoraria(offsetStart: number, span: number): string {
		return `${SLOTS_DIA[offsetStart].inicio} – ${SLOTS_DIA[offsetStart + span - 1].fim}`;
	}
	function faixaModulos(offsetStart: number, span: number): string {
		const ini = SLOTS_DIA[offsetStart].label;
		const fim = SLOTS_DIA[offsetStart + span - 1].label;
		return ini === fim ? ini : `${ini}–${fim}`;
	}
	function nomeMateria(codigo: string): string {
		return gradeStore.pool.find((m) => m.codigo === codigo)?.nome ?? codigo;
	}
	function hoverClasses(codigo: string): string {
		const h = gradeStore.hoverCodigo;
		if (!h) return '';
		return h === codigo ? 'ring-2 ring-foreground/40' : 'opacity-35';
	}
</script>

{#if !temAlgo}
	<div class="mg-sunken flex flex-col items-center gap-2 rounded-xl px-4 py-12 text-center">
		<CalendarClock class="h-5 w-5 text-muted-foreground" />
		<p class="text-sm font-medium text-foreground/80">Sua semana aparece aqui</p>
		<p class="max-w-xs text-xs text-muted-foreground">
			Use “Montar grade” para a gente encaixar tudo sem conflito, ou adicione matérias e escolha as
			turmas manualmente.
		</p>
	</div>
{:else if modo === 'grade'}
	<div class="mg-sunken overflow-x-auto rounded-xl">
		<div
			class="grid min-w-[34rem]"
			style="grid-template-columns: 3.4rem repeat({diasVisiveis.length}, minmax(0, 1fr)); grid-template-rows: 2.75rem repeat({slotsVisiveis.length}, minmax(2.15rem, auto));"
		>
			<div
				class="flex items-center justify-center border-b border-border text-[10px] tracking-wide text-muted-foreground uppercase"
				style="grid-column: 1; grid-row: 1;"
			>
				Horário
			</div>
			{#each diasVisiveis as dia, di (dia.cod)}
				{@const n = gridPorDia.find((c) => c.dia.cod === dia.cod)?.blocos.length ?? 0}
				<div
					class="flex flex-col items-center justify-center gap-0.5 border-b border-l border-border"
					style="grid-column: {di + 2}; grid-row: 1;"
				>
					<span class="text-[11px] font-semibold tracking-wide text-foreground/85 uppercase"
						>{dia.label}</span
					>
					<span class="text-[10px] text-muted-foreground">{n > 0 ? aulas(n) : 'livre'}</span>
				</div>
			{/each}

			{#each slotsVisiveis as { slot }, vi (slot.label)}
				<div
					class="flex flex-col items-center justify-start pt-1.5 text-center {slot.modulo === 1 &&
					vi > 0
						? 'border-t border-border'
						: ''}"
					style="grid-column: 1; grid-row: {vi + 2};"
				>
					<span class="text-[10px] font-semibold text-foreground/70 tabular-nums">{slot.inicio}</span>
					<span class="font-mono text-[9px] text-muted-foreground">{slot.label}</span>
				</div>
				{#each diasVisiveis as dia, di (dia.cod)}
					<div
						class="border-l border-border/70 {slot.modulo === 1 && vi > 0
							? 'border-t border-t-border'
							: ''}"
						style="grid-column: {di + 2}; grid-row: {vi + 2};"
					></div>
				{/each}
			{/each}

			{#each gridPorDia as coluna (coluna.dia.cod)}
				{@const di = colunaVisivel.get(coluna.dia.cod)}
				{#if di !== undefined}
					{#each coluna.blocos as bloco (bloco.codigo + '-' + bloco.offsetStart)}
						{@const cor = gradeStore.corDaMateria(bloco.codigo)}
						{@const linha = linhaVisivel.get(bloco.offsetStart)}
						{#if linha !== undefined}
							<button
								type="button"
								onclick={() => onBlocoClick(bloco.codigo)}
								onmouseenter={() => gradeStore.setHover(bloco.codigo)}
								onmouseleave={() => gradeStore.setHover(null)}
								title="{bloco.codigo} · {nomeMateria(bloco.codigo)} · {faixaHoraria(
									bloco.offsetStart,
									bloco.span
								)}"
								class="z-10 m-1 flex min-w-0 touch-manipulation flex-col items-start overflow-hidden rounded-lg border p-1.5 text-left transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 {cor.cell} {cor.text} {hoverClasses(
									bloco.codigo
								)}"
								style="grid-column: {di + 2}; grid-row: {linha + 2} / span {bloco.span};"
							>
								<span class="font-mono text-[11px] leading-tight font-bold">{bloco.codigo}</span>
								<span class="mt-0.5 w-full truncate text-[10px] leading-tight opacity-80"
									>{nomeMateria(bloco.codigo)}</span
								>
								{#if bloco.span > 1}
									<span class="mt-auto pt-0.5 text-[9px] tabular-nums opacity-70"
										>{faixaHoraria(bloco.offsetStart, bloco.span)}</span
									>
								{/if}
							</button>
						{/if}
					{/each}
				{/if}
			{/each}
		</div>
	</div>
	{#if haOculto || mostrarTudo}
		<button
			type="button"
			onclick={() => (mostrarTudo = !mostrarTudo)}
			class="mt-2 inline-flex touch-manipulation items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground/80"
		>
			<ChevronsUpDown class="h-3 w-3" />
			{mostrarTudo ? 'Só os turnos com aula' : 'Ver todos os horários'}
		</button>
	{/if}
{:else}
	<div class="space-y-5">
		{#each agendaPorDia as coluna (coluna.dia.cod)}
			<section>
				<div class="mb-2 flex items-center justify-between px-0.5">
					<p class="text-[11px] font-semibold tracking-[0.12em] text-foreground/70 uppercase">
						{DIA_LONGO[coluna.dia.cod]}
					</p>
					<span class="text-[11px] text-muted-foreground">{aulas(coluna.blocos.length)}</span>
				</div>
				<ul class="space-y-2">
					{#each coluna.blocos as bloco (bloco.codigo + '-' + bloco.offsetStart)}
						{@const cor = gradeStore.corDaMateria(bloco.codigo)}
						<li>
							<button
								type="button"
								onclick={() => onBlocoClick(bloco.codigo)}
								class="mg-panel relative grid min-h-16 w-full touch-manipulation grid-cols-[3.25rem_minmax(0,1fr)_auto_auto] items-center gap-2.5 overflow-hidden rounded-xl py-2.5 pr-3 pl-4 text-left"
							>
								<span class="absolute inset-y-3 left-0 w-[3px] rounded-r {cor.dot}"></span>
								<span class="text-[13px] font-semibold text-foreground tabular-nums"
									>{SLOTS_DIA[bloco.offsetStart].inicio}</span
								>
								<span class="min-w-0">
									<span class="block font-mono text-xs font-bold text-foreground">{bloco.codigo}</span>
									<span class="mt-0.5 block truncate text-[11px] text-muted-foreground"
										>{nomeMateria(bloco.codigo)}</span
									>
								</span>
								<span class="font-mono text-[10px] text-muted-foreground"
									>{faixaModulos(bloco.offsetStart, bloco.span)}</span
								>
								<ChevronRight class="h-4 w-4 text-muted-foreground/70" />
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}
