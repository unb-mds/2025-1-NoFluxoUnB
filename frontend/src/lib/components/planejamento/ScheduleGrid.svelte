<script lang="ts">
	import { browser } from '$app/environment';
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { DIAS_SEMANA, SLOTS_DIA, bitIndex, agruparBlocosDia } from '$lib/utils/horario-slots';
	import { CalendarClock, ChevronsUpDown, LayoutGrid, List } from 'lucide-svelte';
	import HelpTip from '$lib/components/onboarding/HelpTip.svelte';

	// Clicar num bloco abre a troca de turma daquela matéria (na página).
	let { onBlocoClick }: { onBlocoClick: (codigo: string) => void } = $props();

	let mostrarTudo = $state(false);

	/**
	 * No celular a grade semanal fica ilegível: 6 colunas em ~90px com texto de 8px.
	 * Abaixo de `sm` o padrão passa a ser a agenda vertical (um dia por bloco, horário
	 * em destaque); quem quiser a visão semanal troca no rodapé — e a escolha manual
	 * passa a mandar, o resize não a desfaz.
	 */
	const MQ_ESTREITO = '(max-width: 639px)';
	let modo = $state<'grade' | 'agenda'>('grade');
	let modoManual = $state(false);

	$effect(() => {
		if (!browser || modoManual) return;
		const mq = window.matchMedia(MQ_ESTREITO);
		const aplicar = () => {
			if (!modoManual) modo = mq.matches ? 'agenda' : 'grade';
		};
		aplicar();
		mq.addEventListener('change', aplicar);
		return () => mq.removeEventListener('change', aplicar);
	});

	function trocarModo(): void {
		modoManual = true;
		modo = modo === 'grade' ? 'agenda' : 'grade';
	}

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

	/** Agenda: só os dias que têm aula, na ordem da semana. */
	const agendaPorDia = $derived(gridPorDia.filter((c) => c.blocos.length > 0));

	const temAlgo = $derived(gradeStore.ocupacao.size > 0);

	// Turnos com pelo menos um bloco — os vazios são colapsados (a menos que expandido).
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

	/** Linhas visíveis: tudo quando expandido/vazio; senão só turnos usados. */
	const slotsVisiveis = $derived.by(() => {
		if (mostrarTudo || !temAlgo) return SLOTS_DIA.map((slot, i) => ({ slot, orig: i }));
		return SLOTS_DIA.map((slot, i) => ({ slot, orig: i })).filter(({ slot }) =>
			turnosUsados.has(slot.turno)
		);
	});

	/** offset global → linha visível (índice em slotsVisiveis). */
	const linhaVisivel = $derived.by(() => {
		const m = new Map<number, number>();
		slotsVisiveis.forEach(({ orig }, vis) => m.set(orig, vis));
		return m;
	});

	const haTurnoOculto = $derived(temAlgo && slotsVisiveis.length < SLOTS_DIA.length);

	// Dias sem nenhuma aula são colapsados igual aos turnos vazios. É o que faz a grade
	// caber na largura do celular: com 3–4 dias de aula as colunas ficam largas o
	// bastante para ler sem arrastar nada.
	const diasComAula = $derived(
		new Set(gridPorDia.filter((c) => c.blocos.length > 0).map((c) => c.dia.cod))
	);

	const diasVisiveis = $derived.by(() => {
		if (mostrarTudo || !temAlgo) return [...DIAS_SEMANA];
		return DIAS_SEMANA.filter((dia) => diasComAula.has(dia.cod));
	});

	/** cód. do dia → coluna visível (índice em diasVisiveis). */
	const colunaVisivel = $derived.by(() => {
		const m = new Map<string, number>();
		diasVisiveis.forEach((dia, vis) => m.set(dia.cod, vis));
		return m;
	});

	const haDiaOculto = $derived(temAlgo && diasVisiveis.length < DIAS_SEMANA.length);

	/**
	 * Densidade tipográfica pela quantidade de colunas: com poucos dias sobra espaço
	 * para hora e turma; com a semana inteira, só o código cabe — e ainda assim
	 * quebrado em duas linhas (ver `partesCodigo`).
	 */
	const densidade = $derived(
		diasVisiveis.length >= 6 ? 'compacta' : diasVisiveis.length >= 5 ? 'media' : 'ampla'
	);

	/**
	 * "CIC0004" → ["CIC", "0004"]. Em coluna estreita as duas linhas cabem com fonte
	 * legível, enquanto o código inteiro numa linha só seria truncado ou minúsculo.
	 */
	function partesCodigo(codigo: string): [string, string] | null {
		const m = /^([A-Za-z]+)\s*(\d+)$/.exec(codigo.trim());
		return m ? [m[1].toUpperCase(), m[2]] : null;
	}

	// Hint de rolagem só quando a grade realmente transborda — nada de avisar à toa.
	let scroller = $state<HTMLElement | null>(null);
	let transborda = $state(false);

	$effect(() => {
		const el = scroller;
		if (!el) return;
		// Releitura quando muda o que está visível (dias/turnos) ou a largura da tela.
		void diasVisiveis.length;
		void slotsVisiveis.length;
		const medir = () => (transborda = el.scrollWidth - el.clientWidth > 4);
		medir();
		const ro = new ResizeObserver(medir);
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Legenda: matérias com turma selecionada, na ordem do pool.
	const legenda = $derived(gradeStore.pool.filter((m) => gradeStore.selecao.has(m.codigo)));

	function faixaHoraria(offsetStart: number, span: number): string {
		return `${SLOTS_DIA[offsetStart].inicio}–${SLOTS_DIA[offsetStart + span - 1].fim}`;
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
		return h === codigo ? 'ring-2 ring-foreground/50 dark:brightness-110' : 'opacity-30';
	}
</script>

<div
	class="rounded-2xl border border-border bg-card dark:bg-background/80 p-3 sm:p-4"
	id="grade-export"
	data-tour="calendario"
>
	{#if modo === 'grade'}
		<div class="grade-scroll overflow-x-auto" bind:this={scroller}>
			<div
				class="grade-wrap relative grid w-full {densidade}"
				style="grid-template-columns: var(--axis-w) repeat({diasVisiveis.length}, minmax(var(--col-min), 1fr)); grid-template-rows: auto repeat({slotsVisiveis.length}, minmax(var(--row-h), 1fr));"
			>
				<!-- Canto (fixo na horizontal junto com o eixo de horários) -->
				<div class="sticky left-0 z-20 bg-card dark:bg-background" style="grid-column: 1; grid-row: 1;"></div>
				<!-- Cabeçalho de dias -->
				{#each diasVisiveis as dia, di (dia.cod)}
					<div
						class="pb-1.5 text-center text-xs font-semibold tracking-wide text-foreground/70 uppercase"
						style="grid-column: {di + 2}; grid-row: 1;"
					>
						{dia.label}
					</div>
				{/each}

				<!-- Eixo de horários — sticky para não sumir ao rolar a semana no celular -->
				{#each slotsVisiveis as { slot }, vi (slot.label)}
					<div
						class="sticky left-0 z-20 flex flex-col items-end justify-center bg-card dark:bg-background pr-1.5 text-right {slot.modulo ===
						1
							? 'border-t border-border'
							: ''}"
						style="grid-column: 1; grid-row: {vi + 2};"
					>
						<span class="hora-inicio font-semibold text-foreground/70 tabular-nums">{slot.inicio}</span>
						<span class="hora-modulo font-mono text-muted-foreground">{slot.label}</span>
					</div>
				{/each}

				<!-- Células de fundo -->
				{#each diasVisiveis as dia, di (dia.cod)}
					{#each slotsVisiveis as { slot }, vi (slot.label)}
						<div
							class="border-l border-border/60 {slot.modulo === 1
								? 'border-t border-border'
								: ''}"
							style="grid-column: {di + 2}; grid-row: {vi + 2};"
						></div>
					{/each}
				{/each}

				<!-- Blocos das matérias -->
				{#each gridPorDia as coluna (coluna.dia.cod)}
					{@const di = colunaVisivel.get(coluna.dia.cod)}
					{#if di !== undefined}
						{#each coluna.blocos as bloco (bloco.codigo + '-' + bloco.offsetStart)}
							{@const cor = gradeStore.corDaMateria(bloco.codigo)}
							{@const sel = gradeStore.turmaSelecionada(bloco.codigo)}
							{@const linha = linhaVisivel.get(bloco.offsetStart)}
							{@const partes = partesCodigo(bloco.codigo)}
							{#if linha !== undefined}
								<button
									type="button"
									onclick={() => onBlocoClick(bloco.codigo)}
									onmouseenter={() => gradeStore.setHover(bloco.codigo)}
									onmouseleave={() => gradeStore.setHover(null)}
									title="{bloco.codigo} · {faixaHoraria(
										bloco.offsetStart,
										bloco.span
									)} — trocar turma"
									class="m-0.5 flex touch-manipulation flex-col items-start justify-center overflow-hidden rounded-md border px-1 py-1 text-left transition-all hover:scale-[1.02] {cor.cell} {cor.text} {hoverClasses(
										bloco.codigo
									)}"
									style="grid-column: {di + 2}; grid-row: {linha + 2} / span {bloco.span};"
								>
									{#if partes}
										<!-- Coluna estreita (celular): código em duas linhas cabe legível; numa
										     linha só seria truncado ("CIC00…") ou minúsculo. No desktop as partes
										     voltam a ser inline e o código sai inteiro, como antes — daí não haver
										     espaço em branco entre os spans. -->
										<span class="bloco-codigo font-mono leading-none font-bold"
											><span class="cod-parte">{partes[0]}</span><span class="cod-parte"
												>{partes[1]}</span
											></span
										>
									{:else}
										<span class="bloco-codigo truncate font-mono leading-tight font-bold">
											{bloco.codigo}
										</span>
									{/if}
									{#if sel}
										<span class="bloco-turma truncate opacity-80">T. {sel.turma.turma}</span>
									{/if}
									{#if bloco.span > 1}
										<span class="bloco-hora truncate tabular-nums opacity-70">
											{faixaHoraria(bloco.offsetStart, bloco.span)}
										</span>
									{/if}
								</button>
							{/if}
						{/each}
					{/if}
				{/each}
			</div>
		</div>
		{#if transborda}
			<p class="mt-2 text-center text-[10px] text-muted-foreground">
				Arraste para o lado para ver o resto da semana.
			</p>
		{/if}
	{:else if temAlgo}
		<!-- Agenda vertical: um dia por seção, horário em destaque -->
		<div class="space-y-2.5">
			{#each agendaPorDia as coluna (coluna.dia.cod)}
				<section>
					<p
						class="mb-1.5 px-0.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
					>
						{DIA_LONGO[coluna.dia.cod]}
					</p>
					<ul class="space-y-1.5">
						{#each coluna.blocos as bloco (bloco.codigo + '-' + bloco.offsetStart)}
							{@const cor = gradeStore.corDaMateria(bloco.codigo)}
							{@const sel = gradeStore.turmaSelecionada(bloco.codigo)}
							{@const fim = bloco.offsetStart + bloco.span - 1}
							<li>
								<button
									type="button"
									onclick={() => onBlocoClick(bloco.codigo)}
									onmouseenter={() => gradeStore.setHover(bloco.codigo)}
									onmouseleave={() => gradeStore.setHover(null)}
									class="flex w-full touch-manipulation items-stretch gap-2.5 rounded-xl border border-border bg-foreground/[0.03] p-2 text-left transition-colors hover:bg-foreground/[0.07] active:bg-foreground/10 {hoverClasses(
										bloco.codigo
									)}"
								>
									<span class="w-1 shrink-0 rounded-full {cor.dot}"></span>
									<span class="w-[3.4rem] shrink-0 tabular-nums">
										<span class="block text-[13px] font-semibold text-foreground/85"
											>{SLOTS_DIA[bloco.offsetStart].inicio}</span
										>
										<span class="block text-[11px] text-muted-foreground">{SLOTS_DIA[fim].fim}</span>
									</span>
									<span class="min-w-0 flex-1">
										<span class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
											<span class="font-mono text-[13px] font-bold text-foreground/90"
												>{bloco.codigo}</span
											>
											{#if sel}
												<span
													class="rounded-full border border-border bg-foreground/5 px-1.5 py-px text-[10px] text-muted-foreground"
													>T. {sel.turma.turma}</span
												>
											{/if}
											<!-- Módulo SIGAA (M1–M2) na mesma linha do código: numa lista de uma
											     aula por card, cada linha extra custa meia tela de rolagem. -->
											<span class="font-mono text-[10px] text-muted-foreground">
												{faixaModulos(bloco.offsetStart, bloco.span)}
											</span>
										</span>
										<span class="mt-0.5 block truncate text-[11px] leading-snug text-muted-foreground">
											{nomeMateria(bloco.codigo)}
										</span>
									</span>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}

	<!-- Rodapé: legenda + alternar visão + expandir turnos -->
	{#if temAlgo}
		<div
			class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5"
		>
			<div class="flex flex-wrap items-center gap-1.5">
				{#each legenda as m (m.codigo)}
					{@const cor = gradeStore.corDaMateria(m.codigo)}
					<button
						type="button"
						onclick={() => onBlocoClick(m.codigo)}
						onmouseenter={() => gradeStore.setHover(m.codigo)}
						onmouseleave={() => gradeStore.setHover(null)}
						title={m.nome}
						class="inline-flex touch-manipulation items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-2 py-1 text-[10px] font-medium text-foreground/75 transition-colors hover:bg-foreground/10"
					>
						<span class="h-2 w-2 rounded-full {cor.dot}"></span>
						<span class="font-mono">{m.codigo}</span>
					</button>
				{/each}
			</div>
			<div class="flex flex-wrap items-center gap-1.5" data-tour="visualizacao">
				<HelpTip
					side="top"
					title="Formas de ver a grade"
					text="“Agenda” lista as aulas por dia — melhor no celular. “Semana inteira” mostra também os dias e turnos vazios, útil pra achar buracos livres. Clique num bloco colorido pra trocar de turma."
				/>
				<button
					type="button"
					onclick={trocarModo}
					class="inline-flex touch-manipulation items-center gap-1 rounded-full border border-border bg-foreground/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-foreground/10"
				>
					{#if modo === 'grade'}
						<List class="h-3 w-3" /> Ver como agenda
					{:else}
						<LayoutGrid class="h-3 w-3" /> Ver grade semanal
					{/if}
				</button>
				{#if modo === 'grade' && (haTurnoOculto || haDiaOculto || mostrarTudo)}
					<button
						type="button"
						onclick={() => (mostrarTudo = !mostrarTudo)}
						title={mostrarTudo
							? 'Volta a mostrar só os dias e turnos com aula — cabe melhor na tela'
							: 'Mostra a semana inteira, inclusive dias e turnos sem aula'}
						class="inline-flex touch-manipulation items-center gap-1 rounded-full border border-border bg-foreground/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-foreground/10"
					>
						<ChevronsUpDown class="h-3 w-3" />
						{mostrarTudo ? 'Só dias com aula' : 'Ver semana inteira'}
					</button>
				{/if}
			</div>
		</div>
	{:else}
		<p class="mt-3 flex items-center justify-center gap-2 py-6 text-center text-xs text-muted-foreground">
			<CalendarClock class="h-4 w-4" />
			Escolha turmas nas matérias (ou clique em “Montar grade”, no topo) para ver sua grade.
		</p>
	{/if}
</div>

<style>
	/* Rolagem horizontal só existe quando a semana inteira não cabe; nesse caso o
	   gesto tem de ser horizontal de verdade e não puxar a página junto. */
	.grade-scroll {
		touch-action: pan-x pan-y;
		overscroll-behavior-x: contain;
		scrollbar-width: thin;
	}
	.grade-scroll::-webkit-scrollbar {
		height: 4px;
	}
	.grade-scroll::-webkit-scrollbar-thumb {
		background: hsl(var(--foreground) / 0.18);
		border-radius: 999px;
	}
	/* Dark: mesmo branco/0.18 de sempre (o foreground do .dark não é 100% branco). */
	:global(.dark) .grade-scroll::-webkit-scrollbar-thumb {
		background: hsl(0 0% 100% / 0.18);
	}

	/* Linhas mais altas e eixo mais largo no celular — o texto sobe de 8px para 10–11px
	   e só cabe com mais respiro vertical. `--col-min` é o piso da coluna de dia: acima
	   dele as colunas esticam para preencher a largura (sem rolagem); abaixo, a grade
	   transborda e rola. */
	.grade-wrap {
		--row-h: 2.75rem;
		--axis-w: 3.1rem;
		--col-min: 2.6rem;
	}
	/* Semana inteira aberta: o rótulo do módulo (M1) some, então o eixo pode encolher
	   e devolver a largura para os dias — é o que faz os 6 dias caberem num 360px. */
	.grade-wrap.compacta {
		--axis-w: 2.8rem;
	}
	@media (min-width: 640px) {
		.grade-wrap,
		.grade-wrap.compacta {
			--row-h: 2.15rem;
			--axis-w: 3.25rem;
			--col-min: 3.5rem;
		}
	}

	.hora-inicio {
		font-size: 11px;
	}
	.hora-modulo {
		font-size: 9px;
	}

	/*
	 * Densidade pelo número de colunas visíveis — regra só do celular, onde a largura
	 * é disputada. Com poucos dias de aula cabe código + turma; com a semana inteira
	 * aberta, só o código, em vez de espremer tudo em texto ilegível de 7px.
	 *
	 * A faixa de horário dentro do bloco é redundante com o eixo da esquerda e com o
	 * `title`, então no celular ela nunca aparece: o espaço vale mais para o código.
	 */
	.bloco-codigo {
		font-size: 12px;
	}
	.cod-parte {
		display: block;
	}
	@media (min-width: 640px) {
		.cod-parte {
			display: inline;
		}
	}
	.bloco-turma {
		font-size: 10px;
	}
	.bloco-hora {
		display: none;
		font-size: 10px;
	}

	.media .bloco-codigo {
		font-size: 11px;
	}
	.media .bloco-turma {
		font-size: 9px;
	}

	.compacta .bloco-codigo {
		font-size: 10px;
	}
	.compacta .bloco-turma {
		display: none;
	}
	.compacta .hora-inicio {
		font-size: 10px;
	}
	.compacta .hora-modulo {
		display: none;
	}

	/* Desktop tem largura de sobra: volta ao visual de antes, sem densidade. */
	@media (min-width: 640px) {
		.grade-wrap .bloco-codigo {
			font-size: 11px;
		}
		.grade-wrap .bloco-turma {
			display: block;
			font-size: 9px;
		}
		.grade-wrap .bloco-hora {
			display: block;
			font-size: 8px;
		}
		.grade-wrap .hora-inicio {
			font-size: 10px;
		}
		.grade-wrap .hora-modulo {
			display: block;
			font-size: 8px;
		}
	}
</style>
