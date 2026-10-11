<script lang="ts">
import { Bot, GraduationCap, Info } from 'lucide-svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { fluxogramaCabecalhoStore as cabecalho } from '$lib/stores/fluxograma-cabecalho.store.svelte';
	import { ROUTES } from '$lib/config/routes';
	import FluxogramaLegendaStatus from '$lib/components/fluxograma/controls/FluxogramaLegendaStatus.svelte';
	import FluxogramViewMenu from '$lib/components/fluxograma/controls/FluxogramViewMenu.svelte';
	import MobileFilterNotice from '$lib/components/fluxograma/controls/MobileFilterNotice.svelte';


	interface Props {
		/** Desktop: mesma barra que Assistente/Planejar; no mobile ficam no header */
		onOpenFluxogramHelp?: () => void;
		showFluxogramViewMenu?: boolean;
	}

	let { onOpenFluxogramHelp, showFluxogramViewMenu = false }: Props = $props();

	/** Botão "Assistente" oculto por enquanto — reative mudando para true */
	const showAssistente = false;

	const store = fluxogramaStore;

	let hasPrimaryActions = $derived(!store.state.isAnonymous);
	let hasViewActions = $derived(!!onOpenFluxogramHelp || showFluxogramViewMenu);
	/** Só ajuda/⚙ sem Assistente/Optativas — esconde barra vazia no mobile */
	let viewOnlyOnDesktop = $derived(!hasPrimaryActions && hasViewActions);
</script>

<!--
	Legenda de status no topo; abaixo: Assistente, Optativas; no desktop também ? e ⚙.
	No mobile, ? e ⚙ continuam no header (FluxogramaHeader).
-->
<!-- Mobile: filtros de optativas/mód. livre começam desativados — avisa como reativar -->
<MobileFilterNotice />

{#if hasPrimaryActions || hasViewActions}
	<div
		class="fluxo-legend flex min-w-0 flex-col gap-2 overflow-visible rounded-xl border border-border px-2.5 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5 [@media(orientation:landscape)_and_(max-height:560px)]:gap-1.5 [@media(orientation:landscape)_and_(max-height:560px)]:px-2 [@media(orientation:landscape)_and_(max-height:560px)]:py-1.5 [@media(orientation:landscape)_and_(max-height:560px)]:sm:gap-2 [@media(orientation:landscape)_and_(max-height:560px)]:sm:px-2 [@media(orientation:landscape)_and_(max-height:560px)]:sm:py-2 [@media(orientation:landscape)_and_(max-height:560px)]:[&>div:first-child]:hidden {viewOnlyOnDesktop
			? 'hidden md:flex'
			: ''} {cabecalho.recolhido ? 'md:!hidden' : ''}"
		style="background: hsl(var(--card) / 0.75); backdrop-filter: blur(14px) saturate(1.3); -webkit-backdrop-filter: blur(14px) saturate(1.3);"
	>
		<FluxogramaLegendaStatus class="border-b border-border pb-2" />

		<div class="flex min-w-0 flex-wrap items-center gap-2 sm:gap-2.5">
		{#if !store.state.isAnonymous}
			<!-- Fluxo principal do produto: o fluxograma mostra onde você está; o
			     Planejador é onde você monta a previsão de formatura e adiciona
			     optativas do seu interesse (com sugestões do Darcy). -->
			<a
				href={ROUTES.PLANO_FORMATURA}
				title="Monte sua previsão de formatura semestre a semestre e adicione optativas do seu interesse, com sugestões do Darcy"
				class="nf-cta-glow inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/60 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-[filter] hover:brightness-110 sm:min-h-0 sm:flex-none sm:justify-center"
			>
				<GraduationCap class="h-3.5 w-3.5 shrink-0" />
				Planejar formatura
			</a>
			{#if showAssistente}
				<a
					href={ROUTES.ASSISTENTE}
					class="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/[0.12] px-3 py-1.5 text-xs font-medium text-primary transition-colors dark:text-purple-200 hover:border-primary/55 hover:bg-primary/[0.22] sm:min-h-0 sm:flex-none sm:justify-center"
				>
					<Bot class="h-3.5 w-3.5 shrink-0" />
					Assistente
				</a>
			{/if}
		{/if}

		<div class="hidden items-center gap-2 md:ml-auto md:flex md:shrink-0">
			{#if onOpenFluxogramHelp}
				<button
					type="button"
					onclick={() => onOpenFluxogramHelp?.()}
					class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-500/35 bg-cyan-500/10 text-cyan-800 backdrop-blur-md transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/20 dark:text-cyan-200"
					style="box-shadow: 0 0 12px rgba(34,211,238,0.12);"
					aria-label="Legenda e regras do fluxograma"
					title="Legenda e regras"
				>
					<Info class="h-[18px] w-[18px]" />
				</button>
			{/if}
			{#if showFluxogramViewMenu}
				<FluxogramViewMenu />
			{/if}
		</div>
		</div>
	</div>
{/if}

<style>
	/* Sombra do painel: discreta no light (token); .dark mantém a receita histórica. */
	.fluxo-legend {
		box-shadow:
			0 0 0 1px hsl(var(--primary) / 0.06),
			var(--nf-shadow-card);
	}
	:global(.dark) .fluxo-legend {
		box-shadow:
			inset 0 1px 0 hsl(0 0% 100% / 0.06),
			0 0 0 1px hsl(var(--primary) / 0.06);
	}
</style>
