<script lang="ts">
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { unidadeCargaStore } from '$lib/stores/unidade-carga.store.svelte';
	import { horarioLegivel } from '$lib/utils/sigaa';
	import { X, ListChecks, TriangleAlert } from 'lucide-svelte';
	import HelpTip from '$lib/components/onboarding/HelpTip.svelte';

	// `compacto` = coluna única (celular): o resumo já vem rotulado pela aba, então
	// o "4 ·" da sequência do desktop viraria numeração mentindo sobre a ordem.
	let { compacto = false }: { compacto?: boolean } = $props();

	function nomeMateria(codigo: string): string {
		return gradeStore.pool.find((m) => m.codigo === codigo)?.nome ?? codigo;
	}
	function creditosMateria(codigo: string): number {
		return gradeStore.pool.find((m) => m.codigo === codigo)?.creditos ?? 0;
	}
</script>

<section class="rounded-2xl border border-border bg-card dark:bg-background/80 p-3" data-tour="resumo">
	<header class="mb-2.5 flex items-center justify-between border-b border-border pb-2">
		<p
			class="flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-foreground/80 uppercase"
		>
			<ListChecks class="h-3.5 w-3.5" />
			{compacto ? 'Resumo' : '4 · Resumo'}
			<HelpTip
				title="Sua grade em lista"
				text="Tudo que está no calendário aparece aqui com turma, professor e horário. Passe o mouse para destacar a matéria na grade e use o X para tirá-la."
			/>
		</p>
		<span
			class="rounded-full border border-border bg-foreground/5 px-2 py-0.5 text-[10px] text-muted-foreground"
		>
			{unidadeCargaStore.formatar(gradeStore.creditosSelecionados)}
		</span>
	</header>

	{#if gradeStore.selecao.size === 0}
		<p class="py-6 text-center text-xs text-muted-foreground">Nenhuma matéria na grade ainda.</p>
	{:else}
		<ul class="space-y-2">
			{#each [...gradeStore.selecao] as [codigo, tg] (codigo)}
				{@const cor = gradeStore.corDaMateria(codigo)}
				{@const coReqsFaltando = gradeStore.coReqsFaltando(codigo)}
				<li
					class="flex items-start gap-2 rounded-xl border border-border bg-muted/50 dark:bg-black/20 px-2.5 py-2"
					onmouseenter={() => gradeStore.setHover(codigo)}
					onmouseleave={() => gradeStore.setHover(null)}
				>
					<span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full {cor.dot}"></span>
					<div class="min-w-0 flex-1">
						<p class="flex items-baseline gap-1.5">
							<span class="font-mono text-xs font-semibold text-foreground/90">{codigo}</span>
							<span class="text-[10px] text-muted-foreground"
								>T. {tg.turma.turma} · {unidadeCargaStore.formatarCurto(
									creditosMateria(codigo)
								)}</span
							>
						</p>
						<p class="truncate text-[11px] text-muted-foreground">{nomeMateria(codigo)}</p>
						<p class="truncate text-[10px] text-muted-foreground">{horarioLegivel(tg.turma.horario)}</p>
						{#if coReqsFaltando.length > 0}
							<p class="mt-0.5 flex items-start gap-1 text-[10px] font-medium text-amber-800 dark:text-amber-300/90">
								<TriangleAlert class="mt-px h-3 w-3 shrink-0" />
								<span>Co-requisito fora da grade: {coReqsFaltando.join(', ')}</span>
							</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={() => gradeStore.removerTurma(codigo)}
						class="touch-manipulation rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground/80"
						aria-label="Tirar {codigo} da grade"
					>
						<X class="h-4 w-4" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
