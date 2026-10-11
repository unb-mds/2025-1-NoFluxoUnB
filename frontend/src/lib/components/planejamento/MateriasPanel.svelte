<script lang="ts">
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { unidadeCargaStore } from '$lib/stores/unidade-carga.store.svelte';
	import { horarioLegivel } from '$lib/utils/sigaa';
	import type { Turno } from '$lib/utils/horario-slots';
	import { Plus, Star, X, Lock, TriangleAlert, Sparkles } from 'lucide-svelte';

	/**
	 * "Suas matérias": a lista que a montagem usa, em chips. Junta o que antes eram
	 * duas colunas (seletor de turmas + resumo): o chip mostra a turma escolhida, e
	 * a escolha em si acontece nos detalhes da matéria (`onAbrir`), que é onde há
	 * espaço para professor, vagas e horários.
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
</script>

<section
	class={embutido ? '' : 'mg-panel rounded-[18px] p-4'}
	data-tour="materias"
	aria-label="Suas matérias"
>
	{#if !embutido}
		<div class="flex items-center justify-between gap-2">
			<div>
				<span class="mg-eyebrow">Curadoria</span>
				<h2 class="text-base font-semibold text-foreground">Suas matérias</h2>
			</div>
			<span
				class="rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-medium text-accent-foreground tabular-nums dark:bg-purple-500/15 dark:text-purple-200"
			>
				{gradeStore.pool.length}
			</span>
		</div>
	{/if}

	{#if gradeStore.pool.length === 0}
		<p class="mt-4 text-xs text-muted-foreground">
			Nenhuma matéria ainda. “Montar grade” puxa as que faltam na sua matriz, ou adicione uma por
			uma.
		</p>
	{:else}
		<ul class="{embutido ? '' : 'mt-4'} space-y-2">
			{#each gradeStore.pool as m (m.codigo)}
				{@const cor = gradeStore.corDaMateria(m.codigo)}
				{@const sel = gradeStore.turmaSelecionada(m.codigo)}
				{@const prioritaria = gradeStore.isPrioritaria(m.codigo)}
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
							<span class="font-mono text-xs font-semibold text-foreground">{m.codigo}</span>
							{#if gradeStore.isTravada(m.codigo)}
								<Lock class="h-3 w-3 text-muted-foreground" aria-label="Turma travada" />
							{/if}
							{#if alerta}
								<TriangleAlert
									class="h-3 w-3 text-amber-700 dark:text-amber-300"
									aria-label="Tem aviso — abra para ver"
								/>
							{/if}
						</span>
						<span class="mt-0.5 block truncate text-[11px] text-muted-foreground">{m.nome}</span>
						<span class="mt-0.5 block truncate text-[10px]">
							{#if sel}
								<span class="text-foreground/70"
									>T. {sel.turma.turma} · {horarioLegivel(sel.turma.horario)}</span
								>
							{:else if m.turmas.length === 0}
								<span class="text-amber-800 dark:text-amber-300/90">Sem turma neste período</span>
							{:else}
								<span class="font-medium text-primary dark:text-purple-300"
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
							title={prioritaria ? 'Prioritária ao montar' : 'Priorizar ao montar'}
							class="touch-manipulation rounded-md p-1.5 transition-colors hover:bg-foreground/10 {prioritaria
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
							class="touch-manipulation rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300"
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	<button
		type="button"
		onclick={onAdicionar}
		class="mg-btn mt-3 w-full border-dashed bg-transparent text-xs text-muted-foreground hover:text-foreground"
	>
		<Plus class="h-4 w-4" /> Adicionar matéria
	</button>

	{#if nota}
		<p
			class="mt-4 flex items-start gap-2 rounded-[10px] bg-primary/10 p-3 text-[11px] leading-relaxed text-accent-foreground dark:bg-purple-500/15 dark:text-purple-200"
		>
			<Sparkles class="mt-px h-3.5 w-3.5 shrink-0" />
			<span>{nota}</span>
		</p>
	{/if}
</section>
