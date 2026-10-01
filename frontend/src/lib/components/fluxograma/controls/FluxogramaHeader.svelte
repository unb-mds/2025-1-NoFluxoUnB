<script lang="ts">
	import { ArrowLeft, Camera, RefreshCw, Home, LayoutGrid, Info } from 'lucide-svelte';
	import FluxogramViewMenu from '$lib/components/fluxograma/controls/FluxogramViewMenu.svelte';
	import ScreenshotChoiceModal from '$lib/components/fluxograma/modal/ScreenshotChoiceModal.svelte';
	import { goto } from '$app/navigation';
	import { ROUTES } from '$lib/config/routes';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { fluxogramaService } from '$lib/services/fluxograma.service';
	import { authStore } from '$lib/stores/auth';
	import { toast } from 'svelte-sonner';
	import { parseCurriculoCompleto } from '$lib/types/matriz';

	interface Props {
		courseName: string;
		matrizCurricular?: string;
		/** Ex.: Bacharelado, Licenciatura — vem da tabela cursos.tipo_curso */
		tipoCurso?: string | null;
		/** Diurno / Noturno — vem de cursos.turno (ou inferido do currículo). Não exibe se vazio. */
		turno?: string | null;
		/** Lista de matrizes do mesmo curso para o seletor "Trocar matriz" */
		matrizes?: Array<{ curriculoCompleto: string; status?: string | null }>;
		curriculoCompletoAtual?: string | null;
		onMatrizChange?: (curriculoCompleto: string) => void;
		containerRef?: HTMLElement | null;
		/** Mostra botão "Voltar ao meu fluxograma" quando está vendo outro curso (simulação) */
		showBackToMyFluxogram?: boolean;
		/** Menu ⚙ (Créditos/Horas) — no mobile no header; no desktop na barra Assistente/Optativas */
		showFluxogramViewMenu?: boolean;
		onOpenFluxogramHelp?: () => void;
	}

	let {
		courseName,
		matrizCurricular = '',
		tipoCurso = null,
		turno = null,
		matrizes = [],
		curriculoCompletoAtual = null,
		onMatrizChange,
		containerRef = null,
		showBackToMyFluxogram = false,
		showFluxogramViewMenu = false,
		onOpenFluxogramHelp
	}: Props = $props();

	const store = fluxogramaStore;
	let showConfirmDelete = $state(false);
	let isDeleting = $state(false);
	let screenshotChoiceOpen = $state(false);

	function formatMatrizLabel(cc: string) {
		const p = parseCurriculoCompleto(cc);
		return `${p.codigoCurso}/${p.versao}${p.ano ? ` - ${p.ano}` : ''}`;
	}

	function formatTurnoBadge(t: string | null | undefined): string {
		if (!t?.trim()) return '';
		const u = t.trim().toUpperCase();
		if (u === 'NOTURNO') return 'Noturno';
		if (u === 'DIURNO') return 'Diurno';
		return t.trim();
	}

	let turnoLabel = $derived(formatTurnoBadge(turno));

	let matrizAtualInfo = $derived(matrizes.find((m) => m.curriculoCompleto === curriculoCompletoAtual));
	let statusLabel = $derived(matrizAtualInfo?.status);

	function handleBack() {
		goto(ROUTES.FLUXOGRAMAS);
	}

	function handleScreenshot() {
		screenshotChoiceOpen = true;
	}

	async function handleReupload() {
		const user = authStore.getUser();
		if (!user) return;

		isDeleting = true;
		try {
			await fluxogramaService.deleteFluxograma(user.idUser);
			toast.success('Fluxograma removido. Envie seu histórico novamente.');
			await goto(ROUTES.UPLOAD_HISTORICO);
		} catch {
			toast.error('Erro ao remover fluxograma.');
		} finally {
			isDeleting = false;
			showConfirmDelete = false;
		}
	}

	function handleBackToMyFluxogram() {
		goto(ROUTES.MEU_FLUXOGRAMA);
	}
</script>

<!--
	Mobile: título em cima; ações em grade 2×2.
	Desktop (md+): uma única faixa — título à esquerda, matriz + reenviar + câmera alinhados à direita na mesma linha.
-->
<header
	class="fluxo-header min-w-0 overflow-visible rounded-2xl border border-border p-3 px-4"
	style="background: hsl(var(--card) / 0.85); backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4); border-color: hsl(var(--border) / 0.9);"
>
	<div
		class="flex w-full max-w-full min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-3"
	>
		<div class="flex min-w-0 flex-1 flex-col gap-0 md:min-w-0">
			<div class="flex min-w-0 items-center gap-1.5 sm:gap-2">
				<button
					onclick={handleBack}
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60 text-foreground/70 backdrop-blur-md transition-all duration-150 hover:border-primary/40 hover:bg-primary/20 hover:text-foreground sm:h-9 sm:w-9"
					aria-label="Voltar"
				>
					<ArrowLeft class="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
				</button>
				<div class="min-w-0 flex-1 overflow-hidden">
					<h1 class="truncate text-base font-black leading-tight text-foreground sm:text-lg md:text-xl lg:text-2xl">{courseName}</h1>
					<div class="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
						{#if tipoCurso?.trim()}
							<span
								class="inline-flex shrink-0 items-center rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground/90 backdrop-blur-sm"
							>
								{tipoCurso.trim()}
							</span>
						{/if}
						{#if turnoLabel}
							<span
								class="inline-flex shrink-0 items-center rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 backdrop-blur-sm dark:text-amber-200/95"
								style="box-shadow: 0 0 8px rgba(251,191,36,0.15);"
								title="Turno"
							>
								{turnoLabel}
							</span>
						{/if}
						{#if statusLabel}
							<span
								class="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium backdrop-blur-sm {statusLabel.toLowerCase() === 'ativa' || statusLabel.toLowerCase() === 'ativo' ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 shadow-[0_0_8px_rgba(16,185,129,0.15)] dark:text-emerald-200/95' : 'border-rose-500/35 bg-rose-500/10 text-rose-800 shadow-[0_0_8px_rgba(244,63,94,0.15)] dark:text-rose-200/95'}"
								title="Status da Matriz"
							>
								{statusLabel.toUpperCase()}
							</span>
						{/if}
						{#if matrizCurricular}
							<p class="min-w-0 truncate text-xs text-muted-foreground sm:text-sm">{matrizCurricular}</p>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!--
			Mobile: coluna — matriz / voltar em largura total; Reenviar + câmera na mesma fileira (evita câmera “solta” na grade 2×2).
			md+: flex em linha (md:contents repassa filhos ao flex pai).
		-->
		<div
			class="flex w-full min-w-0 shrink-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-end md:gap-2"
		>
			{#if matrizes.length > 1 && onMatrizChange}
				<div
					class="flex min-w-0 w-full max-w-full flex-row items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-1 backdrop-blur-sm md:w-auto md:gap-2 md:rounded-full md:px-3 md:py-1.5"
					title="Trocar matriz"
				>
					<LayoutGrid class="h-3 w-3 shrink-0 text-muted-foreground md:h-4 md:w-4" aria-hidden="true" />
					<select
						class="min-w-0 flex-1 rounded border-0 bg-foreground/5 py-0.5 pr-5 pl-1 text-[10px] leading-tight text-foreground/90 focus:bg-foreground/10 focus:ring-1 focus:ring-cyan-700/60 focus:outline-none md:max-w-[180px] md:flex-none md:py-1 md:pr-7 md:pl-2 md:text-xs dark:focus:ring-cyan-500/40 [&>option]:bg-popover [&>option]:text-popover-foreground"
						aria-label="Trocar matriz"
						value={curriculoCompletoAtual ?? matrizCurricular ?? ''}
						onchange={(e) => onMatrizChange((e.target as HTMLSelectElement).value)}
					>
						{#each matrizes as m}
							<option value={m.curriculoCompleto}>{formatMatrizLabel(m.curriculoCompleto)}</option>
						{/each}
					</select>
					<span class="hidden shrink-0 text-xs text-muted-foreground md:inline">Trocar matriz</span>
				</div>
			{/if}
			{#if showBackToMyFluxogram}
				<button
					onclick={handleBackToMyFluxogram}
					class="inline-flex w-full items-center justify-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/20 px-2 py-1.5 text-center text-[10px] font-medium leading-snug text-cyan-800 backdrop-blur-md transition-colors hover:bg-cyan-500/30 hover:text-cyan-900 md:w-auto dark:text-cyan-200 dark:hover:text-cyan-100 md:rounded-full md:px-4 md:py-2 md:text-sm"
				>
					<Home class="h-3 w-3 shrink-0 md:h-4 md:w-4" />
					<span>Voltar ao meu fluxograma</span>
				</button>
			{/if}
			{#if !store.state.isAnonymous}
				{#if showConfirmDelete}
					<div
						class="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 backdrop-blur-md md:w-auto md:gap-2 md:rounded-full md:px-3 md:py-2"
					>
						<span class="text-[10px] text-red-700 md:text-xs dark:text-red-300">Tem certeza?</span>
						<button
							onclick={handleReupload}
							disabled={isDeleting}
							class="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
						>
							{isDeleting ? 'Removendo...' : 'Sim'}
						</button>
						<button
							onclick={() => (showConfirmDelete = false)}
							class="rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/20"
						>
							Não
						</button>
					</div>
				{/if}
			{/if}
			{#if !store.state.isAnonymous && !showConfirmDelete}
				<div class="flex w-full min-w-0 flex-row items-center gap-2 md:contents">
					<!-- Legenda e Créditos/Horas: no desktop ficam na barra Assistente/Optativas -->
					<div class="flex items-center gap-2 md:hidden">
						{#if onOpenFluxogramHelp}
							<button
								type="button"
								onclick={() => onOpenFluxogramHelp?.()}
								class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-500/35 bg-cyan-500/10 text-cyan-800 backdrop-blur-md transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/20 dark:text-cyan-200"
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
					<button
						onclick={() => (showConfirmDelete = true)}
						class="inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1.5 text-[10px] font-medium text-muted-foreground backdrop-blur-md transition-all duration-150 hover:border-foreground/20 hover:bg-foreground/10 hover:text-foreground md:h-10 md:w-auto md:flex-none md:rounded-full md:px-4 md:py-2 md:text-sm"
					>
						<RefreshCw class="h-3 w-3 md:h-4 md:w-4" />
						<span class="hidden md:inline">Enviar Novamente</span>
						<span class="md:hidden">Reenviar</span>
					</button>
					<button
						type="button"
						onclick={handleScreenshot}
						class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60 text-foreground/80 backdrop-blur-md transition-all duration-150 hover:border-primary/35 hover:bg-primary/15 hover:text-foreground md:h-10 md:w-10"
						aria-label="Capturar screenshot do fluxograma"
						title="Screenshot"
					>
						<Camera class="h-[18px] w-[18px] md:h-5 md:w-5" />
					</button>
				</div>
			{:else}
				<div class="flex w-full justify-end gap-2 md:contents">
					<div class="flex items-center gap-2 md:hidden">
						{#if onOpenFluxogramHelp}
							<button
								type="button"
								onclick={() => onOpenFluxogramHelp?.()}
								class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-500/35 bg-cyan-500/10 text-cyan-800 backdrop-blur-md transition-colors hover:border-cyan-400/50 hover:bg-cyan-500/20 dark:text-cyan-200"
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
					<button
						type="button"
						onclick={handleScreenshot}
						class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/60 text-foreground/80 backdrop-blur-md transition-all duration-150 hover:border-primary/35 hover:bg-primary/15 hover:text-foreground md:h-10 md:w-10"
						aria-label="Capturar screenshot do fluxograma"
						title="Screenshot"
					>
						<Camera class="h-[18px] w-[18px] md:h-5 md:w-5" />
					</button>
				</div>
			{/if}
		</div>
	</div>

	<ScreenshotChoiceModal
		open={screenshotChoiceOpen}
		onclose={() => (screenshotChoiceOpen = false)}
		containerRef={containerRef}
	/>
</header>

<style>
	/* Sombra do header: discreta no light (token); .dark mantém o valor histórico. */
	.fluxo-header {
		box-shadow:
			0 0 0 1px hsl(var(--primary) / 0.07),
			var(--nf-shadow-card);
	}
	:global(.dark) .fluxo-header {
		box-shadow:
			inset 0 1px 0 hsl(0 0% 100% / 0.07),
			inset 1px 0 0 hsl(0 0% 100% / 0.04),
			0 0 0 1px hsl(var(--primary) / 0.07),
			0 8px 24px hsl(0 0% 0% / 0.3);
	}
</style>
