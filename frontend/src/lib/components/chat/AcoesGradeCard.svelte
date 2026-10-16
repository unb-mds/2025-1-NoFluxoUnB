<script lang="ts">
	/**
	 * Card de diff das mudanças que a Darcy propôs na grade aberta (`acoesGrade`).
	 * Nada muda sem o clique do aluno; depois de aplicar, "Desfazer" volta a grade.
	 * Só a resposta mais recente aplica (`viva`) — numa antiga a grade já pode
	 * ter mudado e a proposta não vale mais.
	 */
	import {
		Plus,
		Minus,
		ArrowLeftRight,
		Star,
		Sun,
		Bookmark,
		Eraser,
		Undo2,
		Check
	} from 'lucide-svelte';
	import type { AcaoGradeChat } from '$lib/types/plano-formatura';
	import type { ResultadoAcoesChat } from '$lib/utils/chat-acoes';
	import { descreverAcao, type SinalAcao } from '$lib/utils/acoes-grade';

	let {
		acoes,
		viva,
		nomeDe,
		aplicar
	}: {
		acoes: AcaoGradeChat[];
		viva: boolean;
		nomeDe: (codigo: string) => string | undefined;
		aplicar: (acoes: AcaoGradeChat[]) => Promise<ResultadoAcoesChat>;
	} = $props();

	type Estado = 'pendente' | 'aplicando' | 'aplicado' | 'descartado' | 'desfeito';
	let estado = $state<Estado>('pendente');
	let resultado = $state<ResultadoAcoesChat | null>(null);

	const linhas = $derived(acoes.map((a) => descreverAcao(a, nomeDe)));

	const ICONE: Record<SinalAcao, typeof Plus> = {
		mais: Plus,
		menos: Minus,
		troca: ArrowLeftRight,
		estrela: Star,
		turno: Sun,
		cenario: Bookmark,
		limpar: Eraser,
		desfazer: Undo2
	};
	const COR: Record<SinalAcao, string> = {
		mais: 'text-emerald-700 dark:text-emerald-300',
		menos: 'text-rose-700 dark:text-rose-300',
		troca: 'text-sky-700 dark:text-sky-300',
		estrela: 'text-amber-700 dark:text-amber-300',
		turno: 'text-indigo-700 dark:text-indigo-300',
		cenario: 'text-indigo-700 dark:text-indigo-300',
		limpar: 'text-rose-700 dark:text-rose-300',
		desfazer: 'text-sky-700 dark:text-sky-300'
	};

	async function onAplicar() {
		if (estado !== 'pendente') return;
		estado = 'aplicando';
		try {
			resultado = await aplicar(acoes);
			estado = 'aplicado';
		} catch {
			estado = 'pendente';
		}
	}

	async function onDesfazer() {
		if (!resultado) return;
		await resultado.desfazer();
		estado = 'desfeito';
	}
</script>

<div
	class="border-border bg-card/80 my-2 w-full max-w-[88%] min-w-0 overflow-hidden rounded-2xl border shadow-sm max-sm:max-w-full dark:border-white/10 dark:bg-white/5"
>
	<p
		class="text-muted-foreground border-border border-b px-4 py-2 text-[11px] font-bold tracking-widest uppercase dark:border-white/10 dark:text-white/55"
	>
		{#if estado === 'aplicado'}Aplicado na grade{:else if estado === 'descartado'}Descartado{:else if estado === 'desfeito'}Desfeito{:else}Mudanças
			propostas{/if}
	</p>

	<ul
		class="space-y-2 px-4 py-3 {estado === 'descartado' || estado === 'desfeito'
			? 'opacity-50'
			: ''}"
	>
		{#each linhas as l}
			{@const Icone = ICONE[l.sinal]}
			<li class="flex min-w-0 items-start gap-2.5 text-[13.5px]">
				<Icone class="mt-0.5 h-4 w-4 shrink-0 {COR[l.sinal]}" />
				<span class="min-w-0">
					<span class="text-foreground block font-medium break-words dark:text-white/90"
						>{l.texto}</span
					>
					{#if l.detalhe}
						<span class="text-muted-foreground block text-[12px] break-words dark:text-white/55"
							>{l.detalhe}</span
						>
					{/if}
				</span>
			</li>
		{/each}
	</ul>

	{#if estado === 'aplicado' && resultado && resultado.falhas.length > 0}
		<ul class="text-status-warning space-y-1 px-4 pb-2 text-[12px]">
			{#each resultado.falhas as f}<li>Não deu: {f}</li>{/each}
		</ul>
	{/if}

	<div class="flex gap-2 px-4 pb-4">
		{#if estado === 'pendente' || estado === 'aplicando'}
			<button
				type="button"
				disabled={!viva || estado === 'aplicando'}
				onclick={onAplicar}
				class="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-600/60 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40 max-sm:min-h-12 dark:border-emerald-500/40 dark:bg-emerald-600/20 dark:text-emerald-50 dark:hover:bg-emerald-600/40"
			>
				<Check class="h-4 w-4" />
				{estado === 'aplicando' ? 'Aplicando…' : 'Aplicar'}
			</button>
			<button
				type="button"
				disabled={!viva || estado === 'aplicando'}
				onclick={() => (estado = 'descartado')}
				class="border-border text-foreground hover:bg-muted inline-flex min-h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 max-sm:min-h-12 dark:border-white/15 dark:text-white/85 dark:hover:bg-white/10"
			>
				Descartar
			</button>
		{:else if estado === 'aplicado'}
			<button
				type="button"
				onclick={onDesfazer}
				class="border-border text-foreground hover:bg-muted inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-4 text-sm font-medium transition-colors max-sm:min-h-12 dark:border-white/15 dark:text-white/85 dark:hover:bg-white/10"
			>
				<Undo2 class="h-4 w-4" /> Desfazer
			</button>
		{/if}
	</div>
	{#if !viva && estado === 'pendente'}
		<p class="text-muted-foreground px-4 pb-3 text-[11.5px] dark:text-white/50">
			Proposta antiga — peça de novo à Darcy se ainda quiser.
		</p>
	{/if}
</div>
