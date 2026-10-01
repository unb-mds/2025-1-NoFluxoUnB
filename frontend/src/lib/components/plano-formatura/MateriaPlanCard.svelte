<script lang="ts">
	import type { MateriaPlano } from '$lib/types/plano-formatura';
	import { Flame, ArrowUpRight, BrainCircuit, Sparkles } from 'lucide-svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	interface Props {
		materia: MateriaPlano;
		/** Tipo do semestre pai — para estilo de destaque do próximo semestre. */
		tipoSemestre?: 'recomendado' | 'estimado';
		/** Código da matéria sendo hovereada para destacar setas de pré-requisito. */
		hoveredCode?: string | null;
		/** Callback para enviar ação diretamente ao chat (botões rápidos). */
		onChatAction?: (msg: string) => void;
		/** Unidade de exibição dos créditos. */
		displayUnit?: 'creditos' | 'horas';
	}

	let { materia, tipoSemestre = 'estimado', hoveredCode = $bindable(), onChatAction, displayUnit = 'creditos' }: Props = $props();

	const isRecomendado = $derived(tipoSemestre === 'recomendado');

	/**
	 * Superfície + faixa lateral por tipo. Light: pastel azul + faixa azul-600 no
	 * recomendado, card branco + faixa border-strong no estimado. Dark: valores
	 * históricos (#161625 e #185FA5 / slate-600) preservados via dark:.
	 */
	const borderClass = $derived(
		isRecomendado
			? 'border-l-blue-600 bg-blue-50 dark:border-l-[#185FA5] dark:bg-[#161625]'
			: 'border-l-border-strong bg-card dark:border-l-slate-600 dark:bg-[#161625]'
	);

	function handleMouseEnter() {
		hoveredCode = materia.codigo;
	}

	function handleMouseLeave() {
		hoveredCode = null;
	}
</script>

<div
	role="group"
	data-subject-code={materia.codigo}
	class="group relative flex flex-col gap-2.5 rounded-lg border border-border border-l-4 px-3.5 py-3 shadow-nofluxo transition-all duration-150 hover:brightness-[0.98] dark:border-foreground/10 dark:shadow-none dark:hover:brightness-110 {borderClass}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<!-- Header: código + créditos -->
	<div class="flex items-center justify-between gap-2">
		<span class="font-mono text-[12px] font-black tracking-widest text-foreground">
			{materia.codigo}
		</span>
		<div class="flex items-center gap-1.5">
			{#if materia.optativa}
				<span
					class="rounded bg-blue-700 px-1.5 py-0.5 text-[9px] font-medium text-white dark:bg-blue-500/85"
					title="Optativa adicionada por você: conta para a carga horária optativa"
				>opt.</span>
			{/if}
			<span class="rounded-full bg-foreground/10 px-2.5 py-0.5 text-[10px] font-bold text-foreground">
				{displayUnit === 'horas' ? `${materia.creditos * 15}h` : `${materia.creditos} cr`}
			</span>
		</div>
	</div>

	<!-- Body: nome da matéria -->
	<p class="text-[14px] font-bold leading-tight text-foreground line-clamp-3">
		{materia.nome}
	</p>

	<!-- Footer: badges + motivo -->
	<div class="flex flex-wrap items-center justify-between gap-2 mt-1">
		<p class="text-[11px] leading-snug text-muted-foreground line-clamp-2 flex-1 font-medium">
			{materia.motivo}
		</p>

		<div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
			{#if materia.dificuldadeEstimada != null}
				{@const diff = materia.dificuldadeEstimada}
				{@const diffLabel = diff >= 8 ? 'Alta' : diff >= 5 ? 'Média' : 'Baixa'}
				{@const diffColor = diff >= 8 ? 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400' : diff >= 5 ? 'bg-amber-500/10 text-amber-800 border-amber-500/20 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20 dark:text-emerald-400'}
				
				<Tooltip.Provider>
					<Tooltip.Root>
						<Tooltip.Trigger>
							<div class="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide border {diffColor}">
								<BrainCircuit class="h-2.5 w-2.5" />
								Dif: {diffLabel}
							</div>
						</Tooltip.Trigger>
						<Tooltip.Content class="max-w-[250px] border border-border bg-popover text-popover-foreground p-3 shadow-nofluxoLg z-50 dark:border-slate-700 dark:bg-[#161625] dark:shadow-xl">
							<p class="text-[12px] font-bold mb-1">Dificuldade: {diffLabel} ({diff}/10)</p>
							<p class="text-[11px] text-muted-foreground leading-snug dark:text-slate-300">{materia.motivoDificuldade || "Avaliação automática."}</p>
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			{/if}

			{#if materia.critica}
				<span class="flex items-center gap-0.5 rounded-full bg-[#993C1D] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
					<Flame class="h-2.5 w-2.5" />
					Crítica
				</span>
			{/if}

			{#if materia.desbloqueia_direto > 0}
				<span class="flex items-center gap-0.5 rounded-full bg-teal-600/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-teal-800 dark:text-teal-300">
					<ArrowUpRight class="h-2.5 w-2.5" />
					{materia.desbloqueia_direto} mat.
				</span>
			{/if}
		</div>
	</div>

	<!-- Quick Actions: no hover aparecem flutuando; no toque viram parte do card -->
	{#if onChatAction}
		<div class="quick-actions absolute -bottom-3 left-1/2 -translate-x-1/2 shadow-nofluxoLg bg-popover border border-border-strong rounded-full dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)] dark:bg-[#1e1e2d] dark:border-slate-600 overflow-hidden z-[100]">
			<button 
				type="button"
				onclick={(e) => { e.stopPropagation(); onChatAction?.(`/turmas ${materia.codigo}`); }}
				class="px-3 py-1.5 text-[10px] font-bold text-foreground/80 hover:bg-foreground/10 hover:text-foreground transition-colors border-r border-border-strong dark:border-slate-600 flex items-center gap-1 cursor-pointer"
			>
				<Sparkles class="w-3 h-3 text-indigo-600 dark:text-indigo-400" /> Turmas
			</button>
			<button
				type="button"
				onclick={(e) => { e.stopPropagation(); onChatAction?.(`Adie a matéria ${materia.codigo}`); }}
				class="px-3 py-1.5 text-[10px] font-bold text-foreground/80 hover:bg-foreground/10 hover:text-foreground transition-colors cursor-pointer {materia.optativa ? 'border-r border-border-strong dark:border-slate-600' : ''}"
			>
				Adiar
			</button>
			{#if materia.optativa}
				<button
					type="button"
					onclick={(e) => { e.stopPropagation(); onChatAction?.(`Quero remover a optativa ${materia.codigo} do meu plano`); }}
					class="px-3 py-1.5 text-[10px] font-bold text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:text-red-300/80 dark:hover:text-red-200 transition-colors cursor-pointer"
				>
					Remover
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.quick-actions {
		display: none;
	}
	.group:hover .quick-actions {
		display: flex;
	}

	/*
	 * Em telas de toque não existe "passar o mouse": as ações rápidas ficavam
	 * inalcançáveis. Aqui elas saem do overlay e entram no fluxo do card.
	 */
	@media (hover: none) {
		.quick-actions {
			position: static;
			display: flex;
			align-self: center;
			margin-top: 0.25rem;
			transform: none;
			translate: none;
		}
	}
</style>
