<script lang="ts">
	import {
		ZoomIn,
		ZoomOut,
		RotateCcw,
		X,
		HelpCircle,
		Maximize2,
		Minimize2,
		GraduationCap,
		Calendar,
		TrendingUp,
		SlidersHorizontal,
		Loader2
	} from 'lucide-svelte';
	import { browser } from '$app/environment';
	import { fluxogramaStore, type ConnectionMode } from '$lib/stores/fluxograma.store.svelte';
	import { getTotalCreditsCompleted } from '$lib/types/user';
	import { isOptativa } from '$lib/types/materia';
	import type { IntegralizacaoResult } from '$lib/types/matriz';
	import { formatarIraParaExibicao } from '$lib/utils/ira';
	import { portal } from '$lib/actions/portal';
	import {
		matchesFluxogramCompactTouchMode,
		FLUXOGRAM_NARROW_QUERY,
		FLUXOGRAM_COMPACT_LANDSCAPE_QUERY
	} from '$lib/utils/fluxogram-viewport';

	interface Props {
		/** Sincronizado com o botão “Legenda e regras” (?) no header */
		helpOpen?: boolean;
		/** Modo foco: expande apenas o container do fluxograma. */
		focusMode?: boolean;
		/** Callback para alternar o modo foco no container pai. */
		toggleFocusMode?: () => void;
		/** Painel de controle mobile — bindable para o botão da barra abaixo do fluxograma. */
		controlsOpen?: boolean;
		integralizacao?: IntegralizacaoResult | null;
		integralizacaoLoading?: boolean;
	}

	let {
		helpOpen = $bindable(false),
		focusMode = false,
		toggleFocusMode,
		controlsOpen = $bindable(false),
		integralizacao = null,
		integralizacaoLoading = false
	}: Props = $props();

	const store = fluxogramaStore;

	let zoomPercent = $derived(Math.round(store.state.zoomLevel * 100));
	/** Campo de zoom digitável — não sobrescreve enquanto o utilizador edita */
	let zoomInputFocused = $state(false);
	let zoomDraft = $state(String(Math.round(store.state.zoomLevel * 100)));

	let courseData = $derived(store.state.courseData);
	let userFluxograma = $derived(store.userFluxograma);

	let totalCredits = $derived.by(() => {
		if (!courseData) return 0;
		if (courseData.totalCreditos != null && courseData.totalCreditos > 0) {
			return courseData.totalCreditos;
		}
		return courseData.materias
			.filter((m) => !isOptativa(m))
			.reduce((sum, m) => sum + m.creditos, 0);
	});

	let completedCredits = $derived.by(() => {
		if (!userFluxograma || !courseData) return 0;
		const creditsMap = new Map(courseData.materias.map((m) => [m.codigoMateria, m.creditos]));
		return getTotalCreditsCompleted(userFluxograma, creditsMap);
	});

	let usaHoras = $derived(!!integralizacao && integralizacao.exigido.chTotal > 0);

	let progressPct = $derived(
		integralizacaoLoading
			? null
			: usaHoras && integralizacao
				? Math.round((integralizacao.realizado.chTotal / integralizacao.exigido.chTotal) * 100)
				: totalCredits > 0
					? Math.round((completedCredits / totalCredits) * 100)
					: 0
	);

	$effect(() => {
		const p = zoomPercent;
		if (!zoomInputFocused) {
			zoomDraft = String(p);
		}
	});

	function applyZoomDraft() {
		const raw = zoomDraft.trim();
		const v = parseInt(raw, 10);
		if (Number.isNaN(v)) {
			zoomDraft = String(zoomPercent);
			return;
		}
		const clamped = Math.min(200, Math.max(30, v));
		store.setZoom(clamped / 100);
		zoomDraft = String(Math.round(store.state.zoomLevel * 100));
	}

	function onZoomDraftInput(e: Event & { currentTarget: HTMLInputElement }) {
		const digits = e.currentTarget.value.replace(/\D/g, '').slice(0, 3);
		zoomDraft = digits;
	}

	function onZoomFieldKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			(e.currentTarget as HTMLInputElement).blur();
		}
	}

	/** Mobile + landscape estreito: FAB e faixa de conexões (evita barra “desktop” em tela deitada). */
	let compactTouch = $state(false);

	/** Semestres com conteúdo — chips de navegação rápida no rodapé mobile. */
	let semesterList = $derived.by(() => {
		const keys = new Set<number>();
		for (const k of store.subjectsBySemester.keys()) if (k > 0) keys.add(k);
		for (const k of store.optativasBySemester.keys()) if (k > 0) keys.add(k);
		for (const k of store.extrasCursadasBySemester.keys()) if (k > 0) keys.add(k);
		return Array.from(keys).sort((a, b) => a - b);
	});

	let semestreAtualAluno = $derived(userFluxograma?.semestreAtual ?? null);

	function scrollToSemester(n: number) {
		const root = document.querySelector<HTMLElement>('[data-fluxogram-scroll-root]');
		const col = root?.querySelector<HTMLElement>(`[data-semester="${n}"]`);
		if (!root || !col) return;
		const rootRect = root.getBoundingClientRect();
		const colRect = col.getBoundingClientRect();
		root.scrollTo({
			left: Math.max(0, root.scrollLeft + (colRect.left - rootRect.left) - 16),
			behavior: 'smooth'
		});
	}

	let overlayChipsEl: HTMLElement | null = $state(null);

	// Ao entrar no modo foco, a faixa de chips abre centralizada no semestre atual.
	$effect(() => {
		const n = semestreAtualAluno;
		void semesterList.length;
		const el = overlayChipsEl;
		if (!el || n == null) return;
		const chip = el.querySelector<HTMLElement>(`[data-chip="${n}"]`);
		if (!chip) return;
		el.scrollLeft = Math.max(0, chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2);
	});

	$effect(() => {
		if (!browser) return;
		const apply = () => {
			compactTouch = matchesFluxogramCompactTouchMode();
		};
		apply();
		const mqNarrow = window.matchMedia(FLUXOGRAM_NARROW_QUERY);
		const mqLand = window.matchMedia(FLUXOGRAM_COMPACT_LANDSCAPE_QUERY);
		mqNarrow.addEventListener('change', apply);
		mqLand.addEventListener('change', apply);
		window.addEventListener('resize', apply);
		return () => {
			mqNarrow.removeEventListener('change', apply);
			mqLand.removeEventListener('change', apply);
			window.removeEventListener('resize', apply);
		};
	});

	$effect(() => {
		if (!compactTouch) {
			controlsOpen = false;
		}
	});

	function selectMode(mode: ConnectionMode) {
		store.setConnectionMode(mode);
	}

	function openHelpFromPanel() {
		controlsOpen = false;
		helpOpen = true;
	}

	function handleToggleFocusMode() {
		toggleFocusMode?.();
	}

	function handleLegendKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			helpOpen = false;
			controlsOpen = false;
			if (focusMode) toggleFocusMode?.();
		}
	}

	$effect(() => {
		if (helpOpen || controlsOpen) {
			const prev = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = prev;
			};
		}
	});
</script>

<svelte:window onkeydown={handleLegendKeydown} />

<!--
	Controles flutuantes sobre o fluxograma.
	Conexões: pill compacta no canto inferior direito (todos os breakpoints).
	Desktop: zoom no canto inferior esquerdo. Mobile: FAB = só zoom (sheet sem duplicar conexões).
-->
<div
	class="pointer-events-none absolute inset-0 z-20"
	aria-hidden="false"
	data-fluxogram-viewport-chrome
>
	<!-- HUD no modo tela cheia -->
	{#if focusMode && courseData && userFluxograma}
		<div
			class="pointer-events-none absolute top-[max(0.75rem,env(safe-area-inset-top,0px))] right-0 left-0 z-[40] flex justify-center {compactTouch
				? 'px-16'
				: ''}"
		>
			<div
				class="pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full border border-border bg-background/80 dark:bg-black/50 px-4 py-2 text-xs backdrop-blur-md sm:text-sm"
			>
				<div class="flex items-center gap-1.5 text-foreground">
					{#if integralizacaoLoading}
						<Loader2 class="h-4 w-4 shrink-0 animate-spin text-emerald-600 dark:text-green-400" />
						<span class="font-medium"
							>— <span class="hidden text-muted-foreground sm:inline">concluído</span></span
						>
					{:else}
						<GraduationCap class="h-4 w-4 text-emerald-600 dark:text-green-400" />
						<span class="font-medium"
							>{progressPct}% <span class="hidden text-muted-foreground sm:inline">concluído</span></span
						>
					{/if}
				</div>
				<div class="h-3 w-px bg-foreground/20"></div>
				<div class="flex items-center gap-1.5 text-foreground">
					<Calendar class="h-4 w-4 text-amber-600 dark:text-amber-400" />
					<span class="font-medium"
						>{userFluxograma.semestreAtual}º
						<span class="hidden text-muted-foreground sm:inline">sem.</span></span
					>
				</div>
				{#if userFluxograma.ira != null}
					<div class="h-3 w-px bg-foreground/20"></div>
					<div class="flex items-center gap-1.5 text-foreground">
						<TrendingUp class="h-4 w-4 text-primary dark:text-purple-400" />
						<span class="font-medium"
							>IRA: {formatarIraParaExibicao(userFluxograma.ira, userFluxograma.iraTexto)}</span
						>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<div
		class="pointer-events-none absolute top-[max(0.75rem,env(safe-area-inset-top,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-[46] {compactTouch
			? 'hidden'
			: ''}"
	>
		<button
			type="button"
			onclick={handleToggleFocusMode}
			class="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-500/35 bg-cyan-500/15 text-cyan-800 shadow-lg backdrop-blur-md transition-colors hover:bg-cyan-500/25 hover:text-cyan-900 dark:text-cyan-100 dark:hover:text-foreground"
			aria-label={focusMode
				? 'Sair do modo foco do fluxograma'
				: 'Entrar no modo foco do fluxograma'}
			title={focusMode ? 'Sair do modo foco' : 'Modo foco'}
		>
			{#if focusMode}
				<Minimize2 class="h-5 w-5" />
			{:else}
				<Maximize2 class="h-5 w-5" />
			{/if}
		</button>
	</div>

	<!-- Desktop: só zoom — canto inferior esquerdo (conexões ficam à direita) -->
	<div
		class="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] left-[max(0.75rem,env(safe-area-inset-left,0px))] z-[30] {compactTouch
			? 'hidden'
			: 'hidden md:block'}"
	>
		<div
			class="nf-chrome-pill pointer-events-auto flex max-w-[calc(100vw-11rem)] items-center gap-1 rounded-full px-2 py-1"
		>
			<div class="flex items-center gap-0.5 rounded-full bg-foreground/5 px-0.5 py-0.5">
				<button
					type="button"
					onclick={() => store.zoomOut()}
					class="rounded-full p-1 text-foreground/70 transition-colors hover:bg-foreground/15 hover:text-foreground"
					aria-label="Diminuir zoom"
				>
					<ZoomOut class="h-4 w-4" />
				</button>
				<input
					type="range"
					min="30"
					max="200"
					value={zoomPercent}
					oninput={(e) => store.setZoom(parseInt(e.currentTarget.value) / 100)}
					class="zoom-slider-desktop mx-1 h-1 w-16 max-w-[5rem] cursor-pointer appearance-none rounded-full bg-foreground/20 sm:w-24"
				/>
				<button
					type="button"
					onclick={() => store.zoomIn()}
					class="rounded-full p-1 text-foreground/70 transition-colors hover:bg-foreground/15 hover:text-foreground"
					aria-label="Aumentar zoom"
				>
					<ZoomIn class="h-4 w-4" />
				</button>
				<label
					class="flex shrink-0 items-center gap-0.5 text-muted-foreground"
					title="Zoom de 30% a 200%. Enter ou clique fora para aplicar"
				>
					<input
						type="text"
						inputmode="numeric"
						autocomplete="off"
						maxlength="3"
						class="w-[2.65rem] rounded border border-border-strong bg-background/80 dark:bg-black/50 px-1 py-0.5 text-center text-[11px] font-medium text-foreground tabular-nums outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 focus:ring-inset"
						value={zoomDraft}
						oninput={onZoomDraftInput}
						onfocus={() => (zoomInputFocused = true)}
						onblur={() => {
							applyZoomDraft();
							zoomInputFocused = false;
						}}
						onkeydown={onZoomFieldKeydown}
						aria-label="Zoom em porcentagem (30 a 200)"
					/>
					<span class="text-[11px]">%</span>
				</label>
				<button
					type="button"
					onclick={() => store.resetZoom()}
					class="rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/15 hover:text-foreground"
					aria-label="Resetar zoom"
				>
					<RotateCcw class="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	</div>

	{#snippet connectionModePill()}
		<div
			class="nf-chrome-pill pointer-events-auto flex shrink-0 flex-nowrap items-center gap-0 rounded-full px-0.5 py-0.5"
			role="group"
			aria-label="Modo de conexões no fluxograma"
		>
			<button
				type="button"
				onclick={() => selectMode('direct')}
				class="rounded-l-full px-1.5 py-1 text-[10px] font-medium sm:px-2 sm:text-[11px] {store
					.state.connectionMode === 'direct'
					? 'bg-accent text-accent-foreground dark:bg-purple-500/45 dark:text-foreground'
					: 'text-foreground/70 hover:bg-foreground/10'}"
			>
				Diretas
			</button>
			<span
				class="flex items-center self-stretch border-x border-border px-0.5 text-[9px] leading-none text-muted-foreground/70"
				>|</span
			>
			<button
				type="button"
				onclick={() => selectMode('chain')}
				title="Cadeia completa: pré-requisitos até chegar na matéria + o que ela libera"
				class="px-1.5 py-1 text-[10px] font-medium sm:px-2 sm:text-[11px] {store.state
					.connectionMode === 'chain'
					? 'bg-accent text-accent-foreground dark:bg-purple-500/45 dark:text-foreground'
					: 'text-foreground/70 hover:bg-foreground/10'}"
			>
				Cadeia
			</button>
			<span
				class="flex items-center self-stretch border-x border-border px-0.5 text-[9px] leading-none text-muted-foreground/70"
				>|</span
			>
			<button
				type="button"
				onclick={() => selectMode('all')}
				class="px-1.5 py-1 text-[10px] font-medium sm:px-2 sm:text-[11px] {store.state
					.connectionMode === 'all'
					? 'bg-accent text-accent-foreground dark:bg-purple-500/45 dark:text-foreground'
					: 'text-foreground/70 hover:bg-foreground/10'}"
			>
				Todas
			</button>
			<button
				type="button"
				onclick={() => selectMode('off')}
				class="rounded-r-full border-l border-border px-1.5 py-1 text-[9px] text-muted-foreground hover:bg-foreground/10 sm:px-2 sm:text-[10px]"
				title="Desligar linhas"
			>
				Off
			</button>
		</div>
	{/snippet}

	<!--
		Mobile / touch compacto: ações principais no rodapé + menu vertical de conexões.
	-->
	{#if compactTouch && focusMode}
		<!-- Modo foco: controles no overlay (não há fluxo de página). Fora dele,
		     a barra de controles vive abaixo do fluxograma (SemesterNavChips). -->
		<!-- Scrim: os cards desvanecem sob os controles do rodapé em vez de ficarem cortados -->
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-40 bg-gradient-to-t from-background/90 via-background/55 to-transparent"
			aria-hidden="true"
		></div>
		<div
			class="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-40 flex flex-col gap-2 pr-[max(0.75rem,env(safe-area-inset-right,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))]"
		>
			<!-- Mapa-índice: chips de semestre — no modo foco ficam no overlay;
			     fora dele vivem no fluxo da página (SemesterNavChips) -->
			{#if focusMode && semesterList.length > 1}
				<div
					bind:this={overlayChipsEl}
					class="semester-chips pointer-events-auto -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
				>
					{#each semesterList as sem (sem)}
						<button
							type="button"
							data-chip={sem}
							onclick={() => scrollToSemester(sem)}
							class="h-9 min-w-[2.5rem] shrink-0 rounded-full border px-2.5 text-xs font-semibold backdrop-blur-md transition-colors active:scale-95 {sem ===
							semestreAtualAluno
								? 'border-primary/70 bg-primary/85 text-primary-foreground shadow-primary/25 shadow-lg'
								: 'border-border bg-background/80 dark:bg-black/45 text-foreground/85'}"
							aria-label="Ir para o semestre {sem}"
						>
							{sem}º
						</button>
					{/each}
				</div>
			{/if}
			<div class="flex items-end justify-between gap-3">
				<div class="pointer-events-auto shrink-0">
					<button
						type="button"
						onclick={() => (controlsOpen = !controlsOpen)}
						class="border-primary/35 bg-primary text-primary-foreground shadow-primary/25 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-transform active:scale-95"
						aria-expanded={controlsOpen}
						aria-label="Painel de controle do fluxograma"
						title="Painel de controle"
					>
						<SlidersHorizontal class="h-5 w-5" />
					</button>
				</div>
				<div
					class="pointer-events-auto flex min-w-0 shrink-0 items-center justify-end gap-2 pb-0.5"
				>
					<button
						type="button"
						onclick={handleToggleFocusMode}
						class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-500/35 bg-cyan-500/15 text-cyan-800 shadow-lg backdrop-blur-md transition-colors active:scale-95 dark:text-cyan-100"
						aria-label={focusMode ? 'Sair do modo foco do fluxograma' : 'Modo foco do fluxograma'}
						title={focusMode ? 'Sair do modo foco' : 'Modo foco'}
					>
						{#if focusMode}
							<Minimize2 class="h-5 w-5" />
						{:else}
							<Maximize2 class="h-5 w-5" />
						{/if}
					</button>
				</div>
			</div>
		</div>
	{:else if !compactTouch}
		<!--
			Desktop: conexões fixas no canto inferior direito (zoom continua à esquerda).
		-->
		<div
			class="pointer-events-none absolute right-[max(0.75rem,env(safe-area-inset-right,0px))] bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] z-[35]"
		>
			{@render connectionModePill()}
		</div>
	{/if}
</div>

<!-- Mobile: painel de controle (portal → body: fora do stacking context z-0 do diagrama) -->
{#if controlsOpen && compactTouch}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		use:portal
		class="fixed inset-0 z-[500] bg-black/55 backdrop-blur-[2px]"
		onclick={() => (controlsOpen = false)}
		role="presentation"
	></div>
	<div
		use:portal
		class="fixed right-0 bottom-0 left-0 z-[510] max-h-[min(72dvh,520px)] overflow-hidden rounded-t-2xl border border-border bg-background/98 shadow-2xl backdrop-blur-xl [@media(orientation:landscape)_and_(max-height:560px)]:max-h-[min(85dvh,100dvh-2rem)]"
		role="dialog"
		aria-modal="true"
		aria-labelledby="fab-tools-title"
	>
		<div class="flex items-center justify-between border-b border-border px-4 py-3">
			<h2 id="fab-tools-title" class="text-sm font-semibold text-foreground">Painel de controle</h2>
			<button
				type="button"
				onclick={() => (controlsOpen = false)}
				class="rounded-lg p-2 text-muted-foreground hover:bg-foreground/10"
				aria-label="Fechar"
			>
				<X class="h-5 w-5" />
			</button>
		</div>
		<div class="max-h-[min(60dvh,440px)] space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
			<div>
				<p class="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Zoom</p>
				<div class="flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-2 py-2">
					<button
						type="button"
						onclick={() => store.zoomOut()}
						class="rounded-lg p-2.5 text-foreground/85 hover:bg-foreground/10"
						aria-label="Diminuir zoom"
					>
						<ZoomOut class="h-5 w-5" />
					</button>
					<input
						type="range"
						min="30"
						max="200"
						value={zoomPercent}
						oninput={(e) => store.setZoom(parseInt(e.currentTarget.value) / 100)}
						class="zoom-slider-mobile h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/20"
					/>
					<button
						type="button"
						onclick={() => store.zoomIn()}
						class="rounded-lg p-2.5 text-foreground/85 hover:bg-foreground/10"
						aria-label="Aumentar zoom"
					>
						<ZoomIn class="h-5 w-5" />
					</button>
					<label
						class="flex shrink-0 items-center gap-1 text-foreground/70"
						title="30 a 200%. Enter ou fora do campo para aplicar"
					>
						<input
							type="text"
							inputmode="numeric"
							autocomplete="off"
							maxlength="3"
							class="w-12 rounded-lg border border-border-strong bg-background/80 dark:bg-black/40 py-1 text-center text-base font-medium text-foreground tabular-nums outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40"
							value={zoomDraft}
							oninput={onZoomDraftInput}
							onfocus={() => (zoomInputFocused = true)}
							onblur={() => {
								applyZoomDraft();
								zoomInputFocused = false;
							}}
							onkeydown={onZoomFieldKeydown}
							aria-label="Zoom em porcentagem (30 a 200)"
						/>
						<span class="text-sm">%</span>
					</label>
					<button
						type="button"
						onclick={() => store.resetZoom()}
						class="rounded-lg p-2 text-muted-foreground hover:bg-foreground/10"
						aria-label="Resetar zoom"
					>
						<RotateCcw class="h-5 w-5" />
					</button>
				</div>
			</div>
			<div>
				<p class="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
					Conexões de pré-requisito
				</p>
				<div class="flex gap-0 overflow-hidden rounded-xl border border-border bg-muted/60">
					{#each [{ mode: 'direct', label: 'Diretas' }, { mode: 'chain', label: 'Cadeia' }, { mode: 'all', label: 'Todas' }, { mode: 'off', label: 'Off' }] as opt, i (opt.mode)}
						<button
							type="button"
							onclick={() => selectMode(opt.mode as ConnectionMode)}
							class="min-h-[44px] flex-1 px-2 text-sm font-medium transition-colors {i > 0
								? 'border-l border-border'
								: ''} {store.state.connectionMode === opt.mode
								? 'bg-accent text-accent-foreground dark:bg-purple-500/35 dark:text-foreground'
								: 'text-foreground/70 hover:bg-foreground/10'}"
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>
			<div>
				<p class="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
					Totais por semestre
				</p>
				<div class="flex gap-0 overflow-hidden rounded-xl border border-border bg-muted/60">
					<button
						type="button"
						onclick={() => store.setDisplayUnit('creditos')}
						class="min-h-[44px] flex-1 px-2 text-sm font-medium transition-colors {store.state
							.displayUnit === 'creditos'
							? 'bg-cyan-500/20 text-cyan-800 dark:bg-cyan-500/25 dark:text-cyan-200'
							: 'text-foreground/70 hover:bg-foreground/10'}"
					>
						Créditos
					</button>
					<button
						type="button"
						onclick={() => store.setDisplayUnit('horas')}
						class="min-h-[44px] flex-1 border-l border-border px-2 text-sm font-medium transition-colors {store
							.state.displayUnit === 'horas'
							? 'bg-cyan-500/20 text-cyan-800 dark:bg-cyan-500/25 dark:text-cyan-200'
							: 'text-foreground/70 hover:bg-foreground/10'}"
					>
						Horas
					</button>
				</div>
			</div>
			<div>
				<p class="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
					Mostrar no fluxograma
				</p>
				<div class="flex flex-col gap-1.5">
					<button
						type="button"
						role="switch"
						aria-checked={store.state.showOptativas}
						onclick={() => store.toggleShowOptativas()}
						class="flex min-h-[44px] items-center justify-between rounded-xl border border-border bg-muted/60 px-3 py-2 text-sm font-medium transition-colors hover:bg-foreground/10"
					>
						<span class="flex items-center gap-2 text-foreground/85">
							Optativas
							<!-- Mesma etiqueta de MateriaNaturezaBadge (fundo sólido nos dois temas) -->
							<span class="rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-medium text-white dark:bg-blue-500/80"
								>opt.</span
							>
						</span>
						<span
							class="relative h-5 w-9 shrink-0 rounded-full transition-colors {store.state
								.showOptativas
								? 'bg-cyan-700 dark:bg-cyan-500/70'
								: 'bg-foreground/20 dark:bg-foreground/15'}"
							aria-hidden="true"
						>
							<span
								class="absolute top-0.5 h-4 w-4 rounded-full bg-card shadow-sm ring-1 ring-border-strong transition-[left] dark:bg-white dark:ring-0 {store.state
									.showOptativas
									? 'left-[18px]'
									: 'left-0.5'}"
							></span>
						</span>
					</button>
					<button
						type="button"
						role="switch"
						aria-checked={store.state.showModulosLivres}
						onclick={() => store.toggleShowModulosLivres()}
						class="flex min-h-[44px] items-center justify-between rounded-xl border border-border bg-muted/60 px-3 py-2 text-sm font-medium transition-colors hover:bg-foreground/10"
					>
						<span class="flex items-center gap-2 text-foreground/85">
							Módulos livres
							<span class="rounded bg-teal-400/90 px-1.5 py-0.5 text-[9px] font-medium text-black"
								>mód. livre</span
							>
						</span>
						<span
							class="relative h-5 w-9 shrink-0 rounded-full transition-colors {store.state
								.showModulosLivres
								? 'bg-cyan-700 dark:bg-cyan-500/70'
								: 'bg-foreground/20 dark:bg-foreground/15'}"
							aria-hidden="true"
						>
							<span
								class="absolute top-0.5 h-4 w-4 rounded-full bg-card shadow-sm ring-1 ring-border-strong transition-[left] dark:bg-white dark:ring-0 {store.state
									.showModulosLivres
									? 'left-[18px]'
									: 'left-0.5'}"
							></span>
						</span>
					</button>
				</div>
			</div>
			<button
				type="button"
				onclick={openHelpFromPanel}
				class="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-800 transition-colors hover:bg-cyan-500/20 dark:text-cyan-200"
			>
				<HelpCircle class="h-4 w-4" />
				Legenda e regras
			</button>
		</div>
	</div>
{/if}

<!-- Modal legenda e regras — portal para body (z-40 da ProgressSummary ficava por cima dentro do flex) -->
{#if helpOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		class="legend-modal-overlay fixed inset-0 z-[520] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
		onclick={(e) => e.target === e.currentTarget && (helpOpen = false)}
		role="presentation"
	>
		<div
			class="flex max-h-[min(90dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="help-modal-title"
		>
			<div class="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
				<h2 id="help-modal-title" class="text-base font-bold text-foreground">Legenda e regras</h2>
				<button
					type="button"
					onclick={() => (helpOpen = false)}
					class="rounded-lg p-2 text-muted-foreground hover:bg-foreground/10"
					aria-label="Fechar"
				>
					<X class="h-5 w-5" />
				</button>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 text-sm">
				<p
					class="mb-4 rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
				>
					<strong class="text-foreground/85">Status</strong> (Aprovado, Matriculado, etc.): as cores
					estão na
					<strong class="text-foreground/90">barra acima do fluxograma</strong>, junto de Planejar
					formatura.
				</p>
				<section class="mt-4 border-t border-border pt-4">
					<h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Etiquetas nos cards
					</h3>
					<!-- Etiquetas: mesmas classes de MateriaNaturezaBadge / SubjectCard (fundo sólido nos dois temas) -->
					<ul class="space-y-1.5 text-foreground/90">
						<li class="flex items-center gap-2">
							<span
								class="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[9px] font-medium text-white dark:bg-blue-500/85"
								>opt.</span
							>
							<span
								>Optativa: não é exigida individualmente, mas conta para a carga horária optativa</span
							>
						</li>
						<li class="flex items-center gap-2">
							<span
								class="shrink-0 rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-medium text-black"
								>optatória</span
							>
							<span>
								Optativa no SIGAA que é <strong class="text-foreground"
									>pré-requisito de obrigatória</strong
								>. Na prática, você vai precisar dela
							</span>
						</li>
						<li class="flex items-center gap-2">
							<span
								class="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground dark:bg-purple-500/90"
								>equiv.</span
							>
							<span>Concluída por equivalência: você cursou outra disciplina que vale por esta</span
							>
						</li>
						<li class="flex items-center gap-2">
							<span
								class="shrink-0 rounded bg-emerald-800 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-50 dark:bg-foreground/95 dark:text-emerald-900"
								>aprov.</span
							>
							<span
								>Aproveitamento de estudos: ganha por disciplina de outra instituição ou curso</span
							>
						</li>
						<li class="flex items-center gap-2">
							<span
								class="shrink-0 rounded bg-teal-400/90 px-1.5 py-0.5 text-[9px] font-medium text-black"
								>mód. livre</span
							>
							<span>
								Cursada fora da matriz do curso (monitoria, eletiva de outro curso). Conta para a
								carga horária de módulo livre
							</span>
						</li>
					</ul>
				</section>
				{#if !store.state.isAnonymous}
					<section class="mt-4 border-t border-border pt-4">
						<h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Indicadores
						</h3>
						<ul class="space-y-1.5 text-foreground/90">
							<li class="flex items-center gap-2">
								<div
									class="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-emerald-50 dark:bg-green-500/80 dark:text-foreground"
								>
									✓
								</div>
								Pré-requisitos cumpridos
							</li>
							<li class="flex items-center gap-2">
								<div
									class="flex h-5 w-5 items-center justify-center rounded-full bg-amber-700 text-[10px] font-bold text-amber-50 dark:bg-amber-500/80 dark:text-foreground"
								>
									!
								</div>
								Falta cumprir pré-requisito
							</li>
							<li class="text-muted-foreground">
								<span class="text-foreground/90">Número</span> = quantas disciplinas dependem desta
							</li>
						</ul>
					</section>
				{/if}
				<section class="mt-4 border-t border-border pt-4">
					<h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Conexões (linhas)
					</h3>
					<p class="mb-2 text-xs text-muted-foreground">
						O modo das linhas é alterado pelo botão <strong class="text-foreground/85">Conexões</strong>
						no rodapé do diagrama (abre a lista com
						<strong class="text-foreground/85">Diretas · Cadeia · Todas · Off</strong>).
					</p>
					<!-- Amostras usam os mesmos tokens --edge-* / --chain-* das linhas SVG -->
					<ul class="space-y-1.5 text-foreground/90">
						<li class="flex items-center gap-2">
							<div class="h-1 w-6 shrink-0 rounded bg-edge-prereq"></div>
							Pré-requisito
						</li>
						<li class="flex items-center gap-2">
							<div class="h-1 w-6 shrink-0 rounded bg-edge-dep"></div>
							Dependente
						</li>
						<li class="flex flex-wrap items-center gap-2">
							<div class="h-0.5 w-6 shrink-0 border-t-2 border-dashed border-edge-coreq"></div>
							<span>
								Co-requisito: aparece no modo
								<strong class="text-foreground/85">Todas</strong>
							</span>
						</li>
					</ul>
					<p class="mt-3 mb-1.5 text-xs text-muted-foreground">
						No modo <strong class="text-foreground/85">Cadeia</strong>, o hover mostra o caminho
						completo até a disciplina e o que ela libera:
					</p>
					<ul class="space-y-1.5 text-foreground/90">
						<li class="flex items-center gap-2">
							<div class="h-1 w-6 shrink-0 rounded bg-chain-pre"></div>
							Pré-requisito (o que precisa cursar antes)
						</li>
						<li class="flex items-center gap-2">
							<div class="h-1 w-6 shrink-0 rounded bg-chain-desc"></div>
							Desbloqueia depois
						</li>
						<li class="flex items-center gap-2">
							<div class="h-1 w-6 shrink-0 rounded bg-chain-core"></div>
							Co-requisito
						</li>
					</ul>
				</section>
				<section class="mt-4 rounded-lg border border-primary/30 bg-primary/10 p-3">
					<h3 class="mb-2 text-xs font-semibold tracking-wide text-accent-foreground uppercase dark:text-purple-300">
						Mobile / toque
					</h3>
					<ul class="space-y-2 text-sm text-foreground/90">
						<li>
							<strong>1 toque</strong> na disciplina (com conexões ativas)
							<strong class="text-foreground">seleciona e destaca as matérias que ela libera</strong> no diagrama.
						</li>
						<li>
							<strong>2º toque</strong> na mesma disciplina abre a
							<strong class="text-foreground">ficha da disciplina</strong> (ementa/detalhes).
						</li>
						<li>
							<strong>Segurar</strong> o dedo no card abre a
							<strong class="text-foreground">cadeia topológica</strong>
							(roadmap da disciplina).
						</li>
						<li><strong>Toque na área vazia</strong> esconde as conexões</li>
						<li class="border-t border-border pt-2 text-foreground/85">
							<strong>Deslizar</strong> com um dedo rola o diagrama e, no fim da área, segue rolando a
							página · Zoom: botão flutuante ou pinça (quando disponível)
						</li>
					</ul>
				</section>
				<section class="mt-4">
					<h3 class="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Desktop</h3>
					<ul class="space-y-1.5 text-foreground/90">
						<li>
							<strong>Conexões diretas:</strong> <strong>hover</strong> destaca as matérias que a
							disciplina libera e
							<strong class="text-foreground">clique esquerdo</strong> abre o
							<strong class="text-foreground">modal da disciplina</strong> (detalhes).
						</li>
						<li>
							<strong>Modo Todas:</strong> <strong>hover</strong> mostra o contexto e
							<strong class="text-foreground">clique esquerdo</strong> abre o modal da disciplina.
						</li>
						<li>
							<strong>Conexões off:</strong> <strong>clique esquerdo</strong> abre direto o modal da disciplina.
						</li>
						<li><strong>Clique direito</strong> abre o roadmap/cadeia topológica da matéria.</li>
					</ul>
				</section>
			</div>
		</div>
	</div>
{/if}

<style>
	.semester-chips {
		scrollbar-width: none;
	}
	.semester-chips::-webkit-scrollbar {
		display: none;
	}
	/* Polegar do slider: primário no light; .dark mantém o lilás histórico (#a78bfa) */
	.zoom-slider-desktop::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: hsl(var(--primary));
		cursor: pointer;
	}
	.zoom-slider-desktop::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: hsl(var(--primary));
		cursor: pointer;
		border: none;
	}
	.zoom-slider-mobile::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: hsl(var(--primary));
		cursor: pointer;
	}
	.zoom-slider-mobile::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: hsl(var(--primary));
		cursor: pointer;
		border: none;
	}
	:global(.dark) .zoom-slider-desktop::-webkit-slider-thumb,
	:global(.dark) .zoom-slider-mobile::-webkit-slider-thumb {
		background: #a78bfa;
	}
	:global(.dark) .zoom-slider-desktop::-moz-range-thumb,
	:global(.dark) .zoom-slider-mobile::-moz-range-thumb {
		background: #a78bfa;
	}
</style>
