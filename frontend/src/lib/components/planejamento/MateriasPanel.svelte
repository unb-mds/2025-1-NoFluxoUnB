<script lang="ts">
	import { gradeStore, type MateriaGrade } from '$lib/stores/grade.store.svelte';
	import { unidadeCargaStore } from '$lib/stores/unidade-carga.store.svelte';
	import { horarioLegivel } from '$lib/utils/sigaa';
	import type { Turno } from '$lib/utils/horario-slots';
	import { Plus, Star, X, Lock, TriangleAlert, Sparkles, ChevronRight } from 'lucide-svelte';

	/**
	 * "Suas matérias": a lista que a montagem usa, em chips. O chip mostra a turma
	 * escolhida, e a escolha em si acontece nos detalhes da matéria (`onAbrir`), que
	 * é onde há espaço para professor, vagas e horários.
	 *
	 * A lista é dividida em grupos. Antes era uma coluna só, e o aluno via "um monte
	 * de matéria que nem está na minha grade" sem saber por quê: sugestões que não
	 * couberam, matrícula fora da montagem e matéria sem turma, tudo misturado com o
	 * que de fato está na grade. Só "Na grade" fica aberto; o resto é sob demanda.
	 */
	let {
		onAbrir,
		onAdicionar,
		embutido = false
	}: {
		onAbrir: (codigo: string) => void;
		onAdicionar: () => void;
		/** Dentro de um sheet (celular): sem o cartão e sem o título repetido. */
		embutido?: boolean;
	} = $props();

	const TURNO_NOME: Record<Turno, string> = { M: 'manhã', T: 'tarde', N: 'noite' };

	/**
	 * O que a montagem vai respeitar, numa frase. É o "por que" das escolhas do
	 * solver — sem isto a estrela e os turnos ficam invisíveis depois de marcados.
	 */
	const nota = $derived.by(() => {
		const partes: string[] = [];
		const prioritarias = gradeStore.pool
			.filter((m) => gradeStore.isPrioritaria(m.codigo))
			.map((m) => m.codigo);
		if (prioritarias.length > 0) partes.push(`prioriza ${prioritarias.join(', ')}`);
		if (gradeStore.temFiltroTurno) {
			const turnos = (['M', 'T', 'N'] as const)
				.filter((t) => gradeStore.turnosPermitidos.has(t))
				.map((t) => TURNO_NOME[t]);
			partes.push(`só usa turmas de ${turnos.join(' e ')}`);
		}
		if (gradeStore.temCursando && !gradeStore.incluirCursando) {
			partes.push('deixa de fora o que você já cursa');
		}
		return partes.length > 0 ? `A montagem ${partes.join(', ')}.` : null;
	});

	/** Cada matéria da lista cai em exatamente um grupo, nesta ordem de precedência. */
	const grupos = $derived.by(() => {
		const naGrade: MateriaGrade[] = [];
		const sugestoes: MateriaGrade[] = [];
		const jaCursa: MateriaGrade[] = [];
		const semTurma: MateriaGrade[] = [];
		for (const m of gradeStore.pool) {
			if (gradeStore.turmaSelecionada(m.codigo)) naGrade.push(m);
			else if (!gradeStore.incluirCursando && gradeStore.isCursandoAtual(m.codigo)) jaCursa.push(m);
			else if (m.turmas.length === 0) semTurma.push(m);
			else sugestoes.push(m);
		}
		// Obrigatória primeiro: é o que o aluno procura ao olhar a grade.
		const peso = (m: MateriaGrade) => (m.natureza === 'obrigatoria' ? 0 : m.optatoria ? 1 : 2);
		naGrade.sort((a, b) => peso(a) - peso(b));
		sugestoes.sort((a, b) => peso(a) - peso(b));
		return { naGrade, sugestoes, jaCursa, semTurma };
	});

	/** Etiqueta curta da natureza no chip — sem ela, obrigatória e optativa eram iguais. */
	function rotuloNatureza(m: MateriaGrade): { texto: string; classe: string } | null {
		if (m.natureza === 'obrigatoria')
			return {
				texto: 'Obrigatória',
				classe: 'bg-primary/10 text-primary dark:bg-purple-500/15 dark:text-purple-200'
			};
		if (m.optatoria)
			return {
				texto: 'Optativa · destrava obrigatória',
				classe: 'bg-foreground/5 text-foreground/70'
			};
		if (m.natureza === 'optativa')
			return { texto: 'Optativa', classe: 'bg-foreground/5 text-muted-foreground' };
		if (m.natureza === 'modulo_livre')
			return { texto: 'Módulo livre', classe: 'bg-foreground/5 text-muted-foreground' };
		return null;
	}

	/** Matérias com estrela que não estão na grade, com o motivo. */
	const estrelasFora = $derived(
		[...gradeStore.motivosPrioritarias].map(([codigo, motivo]) => ({ codigo, motivo }))
	);
	const temEstrelas = $derived(gradeStore.temPrioritarias);

	const creditosNaGrade = $derived(grupos.naGrade.reduce((acc, m) => acc + m.creditos, 0));
</script>

{#snippet chip(m: MateriaGrade)}
	{@const cor = gradeStore.corDaMateria(m.codigo)}
	{@const sel = gradeStore.turmaSelecionada(m.codigo)}
	{@const prioritaria = gradeStore.isPrioritaria(m.codigo)}
	{@const rotulo = rotuloNatureza(m)}
	{@const alerta = !!m.avisoPreRequisito || (sel && gradeStore.coReqsFaltando(m.codigo).length > 0)}
	<li
		data-codigo={m.codigo}
		data-turma={sel?.turma.turma ?? ''}
		class="mg-sunken grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] py-1.5 pr-1 pl-2.5"
		onmouseenter={() => gradeStore.setHover(m.codigo)}
		onmouseleave={() => gradeStore.setHover(null)}
	>
		<span class="h-2 w-2 rounded-full {sel ? cor.dot : 'bg-foreground/20'}"></span>
		<button
			type="button"
			onclick={() => onAbrir(m.codigo)}
			class="min-w-0 touch-manipulation py-1 text-left"
			title="Ver turmas e detalhes de {m.codigo}"
		>
			<span class="flex items-center gap-1.5">
				<span class="text-foreground font-mono text-xs font-semibold">{m.codigo}</span>
				{#if rotulo}
					<span class="rounded px-1.5 py-px text-[9px] font-semibold {rotulo.classe}"
						>{rotulo.texto}</span
					>
				{/if}
				{#if gradeStore.isTravada(m.codigo)}
					<Lock class="text-muted-foreground h-3 w-3" aria-label="Turma travada" />
				{/if}
				{#if alerta}
					<TriangleAlert
						class="h-3 w-3 text-amber-700 dark:text-amber-300"
						aria-label="Tem aviso — abra para ver"
					/>
				{/if}
			</span>
			<span class="text-muted-foreground mt-0.5 block truncate text-[11px]">{m.nome}</span>
			<span class="mt-0.5 block truncate text-[10px]">
				{#if sel}
					<span class="text-foreground/70"
						>T. {sel.turma.turma} · {horarioLegivel(sel.turma.horario)}</span
					>
				{:else if m.turmas.length > 0}
					<span class="text-primary font-medium dark:text-purple-300"
						>Escolher turma · {unidadeCargaStore.formatarCurto(m.creditos)}</span
					>
				{/if}
			</span>
		</button>
		<span class="flex items-center">
			<button
				type="button"
				onclick={() => gradeStore.togglePrioridade(m.codigo)}
				aria-pressed={prioritaria}
				aria-label={prioritaria
					? `Tirar prioridade de ${m.codigo}`
					: `Priorizar ${m.codigo} ao montar`}
				title={prioritaria
					? 'Com estrela: entra antes das obrigatórias na próxima montagem. Não é garantia — se nada couber, fica de fora.'
					: 'Dar estrela: prioriza esta matéria na próxima montagem, antes das obrigatórias. Não é garantia.'}
				class="hover:bg-foreground/10 touch-manipulation rounded-md p-1.5 transition-colors {prioritaria
					? 'text-amber-600 dark:text-amber-300'
					: 'text-muted-foreground/60'}"
			>
				<Star class="h-3.5 w-3.5 {prioritaria ? 'fill-current' : ''}" />
			</button>
			<button
				type="button"
				onclick={() => gradeStore.removerMateriaDoPool(m.codigo)}
				aria-label="Remover {m.codigo} da lista"
				title="Remover da lista"
				class="text-muted-foreground/60 touch-manipulation rounded-md p-1.5 transition-colors hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</span>
	</li>
{/snippet}

<!-- Grupo recolhível: título + contagem + uma linha dizendo o que é aquilo. -->
{#snippet grupo(titulo: string, explicacao: string, materias: MateriaGrade[])}
	{#if materias.length > 0}
		<details class="group mt-3">
			<summary
				class="text-foreground flex cursor-pointer list-none items-center gap-1.5 rounded-lg py-1 text-xs font-semibold select-none [&::-webkit-details-marker]:hidden"
			>
				<ChevronRight
					class="text-muted-foreground h-3.5 w-3.5 transition-transform group-open:rotate-90"
				/>
				{titulo}
				<span class="text-muted-foreground font-normal tabular-nums">· {materias.length}</span>
			</summary>
			<p class="text-muted-foreground mt-0.5 mb-2 pl-5 text-[11px] leading-snug">{explicacao}</p>
			<ul class="space-y-2">
				{#each materias as m (m.codigo)}
					{@render chip(m)}
				{/each}
			</ul>
		</details>
	{/if}
{/snippet}

<section
	class={embutido ? '' : 'mg-panel rounded-[18px] p-4'}
	data-tour="materias"
	aria-label="Suas matérias"
>
	{#if !embutido}
		<div class="flex items-center justify-between gap-2">
			<div>
				<span class="mg-eyebrow">Sua lista</span>
				<h2 class="text-foreground text-base font-semibold">Suas matérias</h2>
			</div>
		</div>
	{/if}

	{#if gradeStore.pool.length === 0}
		<p class="text-muted-foreground mt-4 text-xs">
			Nenhuma matéria ainda. “Montar grade” puxa as que faltam na sua matriz, ou adicione uma por
			uma.
		</p>
	{:else}
		<div class={embutido ? '' : 'mt-4'}>
			<p class="text-foreground flex items-baseline justify-between gap-2 text-xs font-semibold">
				<span
					>Na grade <span class="text-muted-foreground font-normal tabular-nums"
						>· {grupos.naGrade.length}</span
					></span
				>
				{#if grupos.naGrade.length > 0}
					<span class="text-muted-foreground text-[11px] font-normal tabular-nums">
						{unidadeCargaStore.formatarCurto(creditosNaGrade)}
					</span>
				{/if}
			</p>
			{#if grupos.naGrade.length > 0}
				<ul class="mt-2 space-y-2">
					{#each grupos.naGrade as m (m.codigo)}
						{@render chip(m)}
					{/each}
				</ul>
			{:else}
				<p class="text-muted-foreground mt-1 text-[11px]">
					Nada na grade ainda. Use “Montar grade” ou abra uma matéria abaixo e escolha a turma.
				</p>
			{/if}
		</div>

		{#if temEstrelas}
			<div
				class="mt-3 rounded-[10px] border border-amber-300 bg-amber-50 p-2.5 text-[11px] leading-relaxed dark:border-amber-400/20 dark:bg-amber-400/5"
			>
				<p class="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
					<Star class="h-3 w-3 fill-current" /> Matérias com estrela
				</p>
				<p class="text-foreground/70 mt-1">
					Entram antes das obrigatórias na próxima montagem, mas não é garantia. Para garantir uma,
					use “Disciplina essencial” em Filtros e preferências.
				</p>
				{#if estrelasFora.length > 0}
					<ul class="mt-1.5 space-y-1">
						{#each estrelasFora as e (e.codigo)}
							<li class="text-foreground/85">
								<span class="font-mono font-semibold">{e.codigo}</span>
								{gradeStore.ultimaMontagem ? 'ficou de fora' : 'ainda não está na grade'}: {e.motivo}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-1.5 font-medium text-emerald-700 dark:text-emerald-300">
						Todas as estrelas estão na grade.
					</p>
				{/if}
			</div>
		{/if}

		{@render grupo(
			'Sugestões fora da grade',
			'O Montador separou estas para você, mas elas não entraram (conflito de horário, turno ou limite de carga). Abra uma para escolher a turma, ou tire da lista no X.',
			grupos.sugestoes
		)}
		{@render grupo(
			'Você já cursa',
			'Planejando o próximo semestre, o que você cursa agora conta como feito e fica fora da grade.',
			grupos.jaCursa
		)}
		{@render grupo(
			'Sem turma neste período',
			'Não há turma ofertada agora, então não dá para pôr na grade.',
			grupos.semTurma
		)}
	{/if}

	<button
		type="button"
		onclick={onAdicionar}
		class="mg-btn text-muted-foreground hover:text-foreground mt-3 w-full border-dashed bg-transparent text-xs"
	>
		<Plus class="h-4 w-4" /> Adicionar matéria
	</button>

	{#if nota}
		<p
			class="bg-primary/10 text-accent-foreground mt-4 flex items-start gap-2 rounded-[10px] p-3 text-[11px] leading-relaxed dark:bg-purple-500/15 dark:text-purple-200"
		>
			<Sparkles class="mt-px h-3.5 w-3.5 shrink-0" />
			<span>{nota}</span>
		</p>
	{/if}
</section>
