<script lang="ts">
	import type { MateriaModel } from '$lib/types/materia';
	import { LIMITE_CREDITOS_MAX, LIMITE_CREDITOS_MIN } from '$lib/types/plano-formatura';
	import { planoFormaturaStore } from '$lib/stores/plano-formatura.store.svelte';
	import { unidadeCargaStore } from '$lib/stores/unidade-carga.store.svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { authStore } from '$lib/stores/auth';
	import PlannerSvelteFlow from './PlannerSvelteFlow.svelte';
	import SemesterColumn from '../fluxograma/layout/SemesterColumn.svelte';
	import SemestrePlanCard from './SemestrePlanCard.svelte';
	import RestricoesChips from './RestricoesChips.svelte';
	import SemestreAtualColumn from './SemestreAtualColumn.svelte';
	import PlannerChatPanel from './PlannerChatPanel.svelte';
	import PlannerPrerequisiteConnections from './PlannerPrerequisiteConnections.svelte';
	import { fade, scale } from 'svelte/transition';
	import { backOut, cubicOut } from 'svelte/easing';
	import {
		GraduationCap,
		Settings,
		RefreshCw,
		Loader2,
		AlertTriangle,
		BookOpenCheck,
		X,
		Bot,
		Download,
		Sparkles,
		Minus
	} from 'lucide-svelte';
	import html2canvas from 'html2canvas-pro';

	let isChangingCredits = $state(false);
	// Preferência compartilhada com o montador de grade e persistida no navegador.
	let displayUnit = $derived(unidadeCargaStore.unidade);
	let hoveredCode = $state<string | null>(null);
	let isChatOpen = $state(false);
	let authState = $derived($authStore);

	let chatW = $state(384);
	let chatH = $state(550);
	let chatX = $state(0);
	let chatY = $state(0);
	let chatPositioned = $state(false);
	let isMobile = $state(false);

	$effect(() => {
		if (typeof window !== 'undefined') {
			const checkMobile = () => isMobile = window.innerWidth < 768;
			checkMobile();
			window.addEventListener('resize', checkMobile);
			return () => window.removeEventListener('resize', checkMobile);
		}
	});

	function resetChat() {
		// Abre generoso: texto de resposta fica confortável sem o aluno precisar
		// redimensionar. Limitado pela janela para não estourar telas menores.
		// Também é o "restaurar": volta exatamente ao tamanho/posição de abertura.
		chatW = Math.min(520, window.innerWidth - 48);
		chatH = Math.min(760, window.innerHeight - 120);
		chatX = window.innerWidth - chatW - 24;
		chatY = window.innerHeight - chatH - 24;
	}

	// Minimizar = voltar ao botão flutuante do bot. Tamanho e posição ficam
	// guardados, então reabrir volta onde estava.
	function fecharChat() {
		isChatOpen = false;
	}

	// ─── Redimensionar pelo canto superior esquerdo ──────────────────────────
	// O resize:both nativo só existe no canto inferior direito; esta alça cresce
	// a janela para cima/esquerda compensando a posição.
	const CHAT_MIN_W = 320;
	const CHAT_MIN_H = 380;

	function startResizeTopLeft(e: MouseEvent) {
		if (isMobile) return;
		e.preventDefault();
		e.stopPropagation();
		let px = e.clientX;
		let py = e.clientY;

		function move(ev: MouseEvent) {
			const dx = ev.clientX - px;
			const dy = ev.clientY - py;
			px = ev.clientX;
			py = ev.clientY;
			const novoW = Math.max(CHAT_MIN_W, chatW - dx);
			const novoH = Math.max(CHAT_MIN_H, chatH - dy);
			chatX += chatW - novoW;
			chatY += chatH - novoH;
			chatW = novoW;
			chatH = novoH;
		}

		function up() {
			window.removeEventListener('mousemove', move);
			window.removeEventListener('mouseup', up);
		}

		window.addEventListener('mousemove', move);
		window.addEventListener('mouseup', up);
	}

	$effect(() => {
		if (isChatOpen && !chatPositioned && typeof window !== 'undefined') {
			resetChat();
			chatPositioned = true;
		}
	});

	// Mensagens de usuário disparadas fora da view (ex.: interesses informados no
	// onboarding) abrem o chat — senão a resposta do Darcy AI chega com o painel
	// fechado e o aluno nem fica sabendo.
	let ultimaContagemChat = 0;
	$effect(() => {
		const msgs = planoFormaturaStore.chatMessages;
		if (msgs.length > ultimaContagemChat && msgs[msgs.length - 1]?.role === 'user' && !isChatOpen) {
			isChatOpen = true;
		}
		ultimaContagemChat = msgs.length;
	});

	function draggable(node: HTMLElement) {
		let x = 0;
		let y = 0;

		function handleMousedown(e: MouseEvent) {
			if (isMobile) return;
			
			const target = e.target as HTMLElement;
			// Only drag if clicking the header with class 'chat-drag-handle'
			if (!target.closest('.chat-drag-handle')) return;

			x = e.clientX;
			y = e.clientY;
			
			window.addEventListener('mousemove', handleMousemove);
			window.addEventListener('mouseup', handleMouseup);
		}

		function handleMousemove(e: MouseEvent) {
			const dx = e.clientX - x;
			const dy = e.clientY - y;
			x = e.clientX;
			y = e.clientY;
			chatX += dx;
			chatY += dy;
		}

		function handleMouseup() {
			window.removeEventListener('mousemove', handleMousemove);
			window.removeEventListener('mouseup', handleMouseup);
		}

		node.addEventListener('mousedown', handleMousedown);

		// Observer para manter o tamanho sincronizado com o resize: both nativo
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				if (entry.target === node) {
					chatW = (entry.target as HTMLElement).offsetWidth;
					chatH = (entry.target as HTMLElement).offsetHeight;
				}
			}
		});
		ro.observe(node);

		return {
			destroy() {
				node.removeEventListener('mousedown', handleMousedown);
				ro.disconnect();
			}
		};
	}

	// Debounce para o slider de créditos — evita chamar API a cada tick
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	function debouncedLimiteChange(value: number) {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => handleCreditChange(value), 400);
	}

	async function handleCreditChange(limite: number) {
		if (isChangingCredits) return;
		isChangingCredits = true;
		try {
			await planoFormaturaStore.setLimiteCreditos(limite);
		} finally {
			isChangingCredits = false;
		}
	}

	function handleRefresh() {
		planoFormaturaStore.gerar();
	}

	function handleAjustar() {
		planoFormaturaStore.openOnboarding();
	}

	function handleChatAction(msg: string) {
		isChatOpen = true;
		setTimeout(() => {
			planoFormaturaStore.enviarMensagem(msg);
		}, 100);
	}

	let isExporting = $state(false);

	async function handleExportPDF() {
		if (isExporting) return;
		isExporting = true;
		try {
			const element = document.querySelector('.svelte-flow') as HTMLElement;
			if (!element) return;

			// Oculta UI desnecessária temporariamente
			const controls = document.querySelector('.svelte-flow__controls') as HTMLElement;
			if (controls) controls.style.display = 'none';

			// Fundo do PDF acompanha o tema: valor do canvas no dark, --background no light.
			const isDark = document.documentElement.classList.contains('dark');
			const canvas = await html2canvas(element, {
				scale: 2,
				backgroundColor: isDark ? '#090c12' : '#faf9fe',
				useCORS: true,
				logging: false
			});
			
			if (controls) controls.style.display = '';

			const imgData = canvas.toDataURL('image/jpeg', 0.95);
			
			// @ts-ignore
			const { jsPDF } = await import('https://esm.sh/jspdf@2.5.1');
			
			const pdf = new jsPDF({
				orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
				unit: 'px',
				format: [canvas.width, canvas.height]
			});
			
			pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
			pdf.save('Meu_Plano_Formatura.pdf');
		} catch (error) {
			console.error("Erro ao exportar PDF:", error);
		} finally {
			isExporting = false;
		}
	}

	/** Total de matérias críticas em todos os semestres. */
	const totalCriticas = $derived(
		planoFormaturaStore.plano?.plano.reduce(
			(acc, sem) => acc + sem.materias.filter((m) => 'codigo' in m && m.critica).length,
			0
		) ?? 0
	);

	/** Total de créditos optativos pendentes — estimado do plano. */
	const hasOptativasPendentes = $derived(
		planoFormaturaStore.status === 'success' && planoFormaturaStore.plano !== null
	);

	/**
	 * Horas de optativas que o plano NÃO cobre. Enquanto for > 0 o aluno não
	 * integraliza a matriz — o banner vira aviso pedindo para adicionar optativas.
	 */
	const chOptativaNaoCoberta = $derived.by(() => {
		const p = planoFormaturaStore.plano;
		if (!p || !('chOptativaFaltante' in p)) return 0;
		return Math.max(0, Math.round(p.chOptativaFaltante));
	});

	/**
	 * Horas de optativas RESERVADAS como slots genéricos: o plano guardou o
	 * espaço, mas o aluno ainda não escolheu quais matérias cursar — sem escolher,
	 * essas horas continuam pendentes de verdade.
	 */
	const chOptativaEmSlots = $derived.by(() => {
		const p = planoFormaturaStore.plano as { plano?: { materias?: unknown[] }[] } | null;
		if (!p?.plano) return 0;
		let total = 0;
		for (const s of p.plano) {
			for (const m of s.materias ?? []) {
				const item = m as { tipo?: string; ch?: number };
				if (item?.tipo === 'optativa_slot') total += Number(item.ch) || 0;
			}
		}
		return Math.round(total);
	});

	/** Semestre atual do aluno (ex: 3, 4, etc). */
	const semestreAtual = $derived(authState.user?.dadosFluxograma?.semestreAtual ?? 1);

	/** Matérias MATR (em curso) — dados já enriquecidos do backend. */
	const materiasMATR = $derived.by(() => {
		if (!planoFormaturaStore.plano) {
			console.log('[PlanoFormaturaView] No plano in store');
			return [];
		}

		// Type guard: verificar se é PlanoFormaturav2 (tem semestreAtual)
		const planoV2 = planoFormaturaStore.plano as any;
		if (!('semestreAtual' in planoV2)) {
			console.log('[PlanoFormaturaView] Plano is not v2 (no semestreAtual)');
			return [];
		}

		if (!planoV2.semestreAtual) {
			console.log('[PlanoFormaturaView] semestreAtual is null/undefined');
			return [];
		}

		if (!planoV2.semestreAtual.materias) {
			console.log('[PlanoFormaturaView] semestreAtual.materias is null/undefined');
			return [];
		}

		console.log(`[PlanoFormaturaView] Found ${planoV2.semestreAtual.materias.length} MATR disciplines`, planoV2.semestreAtual.materias);
		return planoV2.semestreAtual.materias;
	});
</script>

<div class="flex h-full gap-0 bg-background text-foreground dark:bg-[#090c12]">
	<!-- Main content (plano scroll area).
	     No mobile a página rola normalmente: o canvas do plano tem altura limitada e
	     captura o toque só dentro dele, então precisa sobrar página rolável em volta. -->
	<div class="flex-1 flex flex-col gap-4 px-3 py-4 overflow-y-auto sm:gap-5 sm:px-6 sm:py-6 lg:overflow-hidden">

	<!-- ─── Page header ──────────────────────────────────────────────────── -->
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<div class="flex items-center gap-2.5">
				<div class="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600/20">
					<GraduationCap class="h-4.5 w-4.5 text-blue-700 dark:text-blue-400" />
				</div>
				<h1 class="text-xl font-bold tracking-tight text-foreground">Plano de Formatura</h1>
			</div>
			<p class="mt-1.5 text-sm text-muted-foreground">
				Sequência personalizada de matérias para você se formar.
			</p>
		</div>

		<div class="flex w-full items-center gap-2 sm:w-auto">
			<button
				type="button"
				onclick={handleExportPDF}
				disabled={isExporting}
				class="flex flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-border bg-foreground/5 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:bg-foreground/10 hover:text-foreground/85 disabled:opacity-40 sm:flex-none sm:py-1.5"
			>
				{#if isExporting}
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
				{:else}
					<Download class="h-3.5 w-3.5" />
				{/if}
				<span class="hidden sm:inline">Exportar PDF</span>
				<span class="sm:hidden">PDF</span>
			</button>
			<button
				type="button"
				onclick={handleAjustar}
				class="flex flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-border bg-foreground/5 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:bg-foreground/10 hover:text-foreground/85 sm:flex-none sm:py-1.5"
			>
				<Settings class="h-3.5 w-3.5" />
				Preferências
			</button>
			<button
				type="button"
				onclick={handleRefresh}
				disabled={planoFormaturaStore.status === 'loading'}
				class="flex flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-border bg-foreground/5 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:bg-foreground/10 hover:text-foreground/85 disabled:opacity-40 sm:flex-none sm:py-1.5"
			>
				<RefreshCw class="h-3.5 w-3.5 {planoFormaturaStore.status === 'loading' ? 'animate-spin' : ''}" />
				Atualizar
			</button>
		</div>
	</div>

	<!-- ─── Summary stats ────────────────────────────────────────────────── -->
	{#if planoFormaturaStore.status === 'success' && planoFormaturaStore.plano}
		<div class="grid grid-cols-3 gap-2 sm:gap-3" transition:fade={{ duration: 200 }}>
			<!-- Formatura estimada -->
			<div class="rounded-xl border border-blue-500/20 bg-blue-600/8 px-2.5 py-2.5 sm:px-4 sm:py-3.5">
				<p class="text-[10px] font-medium uppercase tracking-wider text-blue-700 dark:text-blue-400/70 sm:text-[11px]">Formatura</p>
				<p class="mt-1 text-lg font-bold text-blue-900 dark:text-blue-200 sm:text-xl">
					{planoFormaturaStore.formaturaEstimada ?? '—'}
				</p>
				<p class="mt-0.5 text-[10px] leading-tight text-blue-800/80 dark:text-blue-400/45">semestre previsto</p>
			</div>

			<!-- Semestres restantes -->
			<div class="rounded-xl border border-border bg-muted/60 px-2.5 py-2.5 sm:px-4 sm:py-3.5">
				<p class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[11px]">Semestres</p>
				<p class="mt-1 text-lg font-bold text-foreground/85 sm:text-xl">
					{planoFormaturaStore.semestresRestantes ?? '—'}
				</p>
				<p class="mt-0.5 text-[10px] leading-tight text-muted-foreground dark:text-foreground/30">restantes até formatura</p>
			</div>

			<!-- Matérias críticas -->
			<div class="rounded-xl border border-orange-500/20 bg-orange-600/8 px-2.5 py-2.5 sm:px-4 sm:py-3.5">
				<p class="text-[10px] font-medium uppercase tracking-wider text-orange-800 dark:text-orange-400/70 sm:text-[11px]">Críticas</p>
				<p class="mt-1 text-lg font-bold text-orange-900 dark:text-orange-200 sm:text-xl">{totalCriticas}</p>
				<p class="mt-0.5 text-[10px] leading-tight text-orange-800 dark:text-orange-400/45">matérias estratégicas</p>
			</div>
		</div>
	{/if}

	<!-- ─── Credit limit toggle ───────────────────────────────────────────── -->
	<div class="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
		<div class="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3">
			<span class="shrink-0 text-xs font-medium text-muted-foreground">
				<span class="hidden sm:inline">Créditos / semestre:</span>
				<span class="sm:hidden">Créditos:</span>
			</span>
			<input
				type="range"
				min={LIMITE_CREDITOS_MIN}
				max={LIMITE_CREDITOS_MAX}
				step={1}
				disabled={isChangingCredits}
				value={planoFormaturaStore.preferencias.limiteCreditos}
				oninput={(e) => debouncedLimiteChange(Number((e.target as HTMLInputElement).value))}
				class="min-w-0 flex-1 accent-blue-500 disabled:opacity-40 sm:w-36 sm:flex-none"
			/>
			<div class="flex items-center gap-1">
				<input
					type="number"
					min={8}
					max={40}
					disabled={isChangingCredits}
					value={planoFormaturaStore.preferencias.limiteCreditos}
					onchange={(e) => debouncedLimiteChange(Number((e.target as HTMLInputElement).value))}
					class="w-12 bg-card border border-border-strong rounded px-1.5 py-0.5 text-xs font-semibold text-foreground/90 dark:bg-[#161625] dark:border-foreground/10 text-right focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
				/>
				<span class="text-xs font-semibold tabular-nums text-foreground/70">
					cr <span class="text-muted-foreground">({planoFormaturaStore.preferencias.limiteCreditos * 15}h)</span>
				</span>
			</div>
		</div>

		<!-- Display unit toggle -->
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => unidadeCargaStore.set('creditos')}
				class="touch-manipulation rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:py-1.5
					{displayUnit === 'creditos'
						? 'border border-blue-500/60 bg-blue-600/20 text-blue-800 ring-1 ring-blue-500/30 dark:text-blue-200'
						: 'border border-border bg-muted/60 text-muted-foreground hover:border-border-strong hover:bg-muted hover:text-foreground/75'}"
			>
				Créditos
			</button>
			<button
				type="button"
				onclick={() => unidadeCargaStore.set('horas')}
				class="touch-manipulation rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:py-1.5
					{displayUnit === 'horas'
						? 'border border-blue-500/60 bg-blue-600/20 text-blue-800 ring-1 ring-blue-500/30 dark:text-blue-200'
						: 'border border-border bg-muted/60 text-muted-foreground hover:border-border-strong hover:bg-muted hover:text-foreground/75'}"
			>
				Horas
			</button>
		</div>
	</div>

	<!-- Restrições ativas -->
	{#if planoFormaturaStore.restricoes.adiar.length > 0 || planoFormaturaStore.restricoes.priorizar.length > 0}
		<div class="rounded-xl border border-border bg-muted/60 backdrop-blur-xl px-4 py-3 dark:border-foreground/5 dark:bg-black/20 dark:shadow-inner">
			<p class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Restrições ativas</p>
			<RestricoesChips />
		</div>
	{/if}

	<!-- ─── Loading state ────────────────────────────────────────────────── -->
	{#if planoFormaturaStore.status === 'loading'}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 py-16" transition:fade={{ duration: 150 }}>
			<div class="flex h-12 w-12 items-center justify-center rounded-full border border-blue-500/30 bg-blue-600/10">
				<Loader2 class="h-6 w-6 animate-spin text-blue-700 dark:text-blue-400" />
			</div>
			<p class="text-sm text-muted-foreground">Gerando seu plano de formatura…</p>
		</div>

	<!-- ─── Error state ───────────────────────────────────────────────────── -->
	{:else if planoFormaturaStore.status === 'error'}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 py-16" transition:fade={{ duration: 150 }}>
			<div class="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-600/10">
				<AlertTriangle class="h-6 w-6 text-amber-700 dark:text-amber-400" />
			</div>
			<div class="text-center">
				<p class="text-sm font-medium text-foreground/70">Não foi possível gerar o plano</p>
				<p class="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">
					{planoFormaturaStore.error ?? 'Verifique se seu histórico está importado e tente novamente.'}
				</p>
			</div>
			<button
				type="button"
				onclick={handleRefresh}
				class="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/15 hover:text-foreground/90"
			>
				<RefreshCw class="h-4 w-4" />
				Tentar novamente
			</button>
		</div>

	<!-- ─── Idle state ────────────────────────────────────────────────────── -->
	{:else if planoFormaturaStore.status === 'idle'}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 py-16" transition:fade={{ duration: 150 }}>
			<div class="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/60">
				<GraduationCap class="h-6 w-6 text-muted-foreground" />
			</div>
			<p class="text-sm text-muted-foreground">Configurando seu plano…</p>
		</div>

	<!-- ─── Success: horizontal scroll of semester cards ──────────────────── -->
	{:else if planoFormaturaStore.status === 'success' && planoFormaturaStore.plano}
		<div class="flex flex-1 flex-col gap-4 lg:overflow-hidden" transition:fade={{ duration: 200 }}>

			<!-- Aviso de optativas: vira alerta quando o plano não bate as horas optativas -->
			{#if hasOptativasPendentes}
				{#if chOptativaNaoCoberta > 0}
					<div class="flex flex-wrap items-center gap-2.5 rounded-xl border border-red-500/25 bg-red-600/8 px-4 py-3">
						<AlertTriangle class="h-4 w-4 shrink-0 text-red-700 dark:text-red-400" />
						<p class="min-w-[200px] flex-1 text-xs text-red-900/80 leading-relaxed dark:text-red-200/80">
							Faltam <strong class="text-red-900 dark:text-red-200">{chOptativaNaoCoberta}h de optativas</strong> fora do plano.
							Adicione optativas para bater as horas e conseguir se formar.
						</p>
						<button
							type="button"
							onclick={() => handleChatAction(`Preciso completar ${chOptativaNaoCoberta}h de optativas para me formar. Me pergunte meus interesses dentro da minha área e sugira optativas da UnB que combinem com eles e batam essas horas.`)}
							class="flex shrink-0 touch-manipulation items-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 px-3 py-1.5 text-xs font-medium text-pink-700 transition-colors hover:border-pink-500/50 hover:bg-pink-500/20 dark:text-pink-300"
						>
							<Sparkles class="h-3.5 w-3.5" />
							Escolher com o Darcy AI
						</button>
					</div>
				{:else if chOptativaEmSlots > 0}
					<div class="flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-600/10 px-4 py-3">
						<AlertTriangle class="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
						<p class="min-w-[200px] flex-1 text-xs text-amber-900/80 leading-relaxed dark:text-amber-200/80">
							Faltam <strong class="text-amber-900 dark:text-amber-200">{chOptativaEmSlots}h de optativas</strong> para escolher:
							o plano reservou o espaço nos semestres, mas as matérias ainda não foram definidas.
							Escolha com o Darcy AI para bater as horas e se formar.
						</p>
						<button
							type="button"
							onclick={() => handleChatAction(`Preciso escolher ${chOptativaEmSlots}h de optativas para completar meu plano. Me pergunte meus interesses dentro da minha área e sugira matérias optativas da UnB que combinem com eles.`)}
							class="flex shrink-0 touch-manipulation items-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 px-3 py-1.5 text-xs font-medium text-pink-700 transition-colors hover:border-pink-500/50 hover:bg-pink-500/20 dark:text-pink-300"
						>
							<Sparkles class="h-3.5 w-3.5" />
							Escolher com o Darcy AI
						</button>
					</div>
				{:else}
					<div class="flex flex-wrap items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-600/8 px-4 py-3">
						<BookOpenCheck class="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
						<p class="min-w-[200px] flex-1 text-xs text-emerald-900/80 leading-relaxed dark:text-emerald-200/70">
							O plano cobre as matérias <strong class="text-emerald-900 dark:text-emerald-200/90">obrigatórias</strong> e as horas de optativas
							já estão atendidas pelas suas escolhas. Ainda dá para trocar: converse com o Darcy AI.
						</p>
						<button
							type="button"
							onclick={() => handleChatAction('Me ajude a revisar as optativas do meu plano: sugira alternativas da UnB que combinem com meus interesses.')}
							class="flex shrink-0 touch-manipulation items-center gap-1.5 rounded-lg border border-pink-500/30 bg-pink-500/10 px-3 py-1.5 text-xs font-medium text-pink-700 transition-colors hover:border-pink-500/50 hover:bg-pink-500/20 dark:text-pink-300"
						>
							<Sparkles class="h-3.5 w-3.5" />
							Revisar optativas
						</button>
					</div>
				{/if}
			{/if}

			<!-- Fluxo interativo Svelte Flow (Substitui scroll horizontal antigo) -->
			<PlannerSvelteFlow 
				plano={planoFormaturaStore.plano} 
				curso={fluxogramaStore.state.courseData} 
				{materiasMATR}
				{semestreAtual}
				onChatAction={handleChatAction}
				{displayUnit}
			/>

			{#if planoFormaturaStore.plano.plano.length === 0 && materiasMATR.length === 0}
				<div class="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
					<GraduationCap class="h-10 w-10 text-muted-foreground/60" />
					<p class="text-sm text-muted-foreground">
							Nenhum semestre no plano — você pode estar prestes a se formar!
						</p>
					</div>
				{/if}
		</div>
	{/if}
	</div>

	<!-- Chat panel (floating fixed) -->
	{#if isChatOpen}
		<div 
			class="fixed z-[100] flex flex-col bg-background/95 sm:bg-background/80 backdrop-blur-3xl overflow-hidden border border-border shadow-nofluxoLg origin-bottom-right dark:bg-[#090c12]/90 dark:sm:bg-[#090c12]/60 dark:border-foreground/10 dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]
				{isMobile ? 'bottom-0 left-0 right-0 w-full h-[85vh] rounded-t-3xl rounded-b-none' : 'rounded-2xl'}" 
			style={isMobile
				? ''
				: `left: ${chatX}px; top: ${chatY}px; width: ${chatW}px; height: ${chatH}px; resize: both;`}
			use:draggable
			in:scale={{ start: 0.6, duration: 400, easing: backOut }}
			out:scale={{ start: 0.8, duration: 200, easing: cubicOut }}
		>
			{#if !isMobile}
				<!-- Alça de redimensionar no canto superior esquerdo (espelho do resize nativo) -->
				<div
					class="group/resize absolute top-0 left-0 z-50 h-6 w-6 cursor-nwse-resize"
					onmousedown={startResizeTopLeft}
					role="presentation"
					title="Redimensionar"
				>
					<div class="absolute top-1.5 left-1.5 h-2.5 w-2.5 rounded-tl border-t-2 border-l-2 border-foreground/25 transition-colors group-hover/resize:border-foreground/60"></div>
				</div>
			{/if}
			<div class="absolute top-4 right-4 z-50 flex items-center gap-1">
				{#if !isMobile}
					<button
						type="button"
						onclick={resetChat}
						class="p-1 rounded-md text-muted-foreground hover:text-foreground/80 hover:bg-foreground/5 transition-colors cursor-pointer"
						aria-label="Restaurar tamanho e posição"
						title="Restaurar tamanho e posição"
					>
						<RefreshCw class="h-4 w-4" />
					</button>
					<button
						type="button"
						onclick={fecharChat}
						class="p-1 rounded-md text-muted-foreground hover:text-foreground/80 hover:bg-foreground/5 transition-colors cursor-pointer"
						aria-label="Minimizar chat"
						title="Minimizar chat"
					>
						<Minus class="h-4 w-4" />
					</button>
				{/if}
				<button
					type="button"
					onclick={fecharChat}
					class="p-1 rounded-md text-muted-foreground hover:text-foreground/80 hover:bg-foreground/5 transition-colors cursor-pointer"
					aria-label="Fechar chat"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			<PlannerChatPanel />
		</div>
	{/if}

	<!-- Floating Toggle Button -->
	{#if !isChatOpen}
		<button
			type="button"
			onclick={() => isChatOpen = true}
			class="fixed z-[90] flex items-center justify-center bg-card/90 backdrop-blur-md shadow-nofluxoLg transition-all duration-300 hover:bg-muted hover:scale-105 active:scale-95 cursor-pointer border border-pink-500/50 hover:border-pink-600 dark:bg-[#1e1e24]/80 dark:shadow-[0_8px_30px_rgba(236,72,153,0.3)] dark:hover:bg-[#2a2a32] dark:hover:border-pink-400
				{isMobile ? 'bottom-4 right-4 h-14 w-14 rounded-full' : 'bottom-6 right-6 h-12 w-12 rounded-xl'}"
			aria-label="Toggle IA"
			in:scale={{ start: 0.5, duration: 400, easing: backOut, delay: 100 }}
			out:scale={{ start: 0.5, duration: 200, easing: cubicOut }}
		>
			<Bot class="{isMobile ? 'h-7 w-7' : 'h-6 w-6'} text-pink-600 dark:text-pink-400" />
		</button>
	{/if}
</div>

<style>
	:global(.overflow-x-auto::-webkit-scrollbar) {
		height: 4px;
	}
	:global(.overflow-x-auto::-webkit-scrollbar-track) {
		background: transparent;
	}
	:global(.overflow-x-auto::-webkit-scrollbar-thumb) {
		background: hsl(var(--foreground) / 0.12);
		border-radius: 999px;
	}
	:global(.overflow-x-auto::-webkit-scrollbar-thumb:hover) {
		background: hsl(var(--foreground) / 0.2);
	}
</style>
