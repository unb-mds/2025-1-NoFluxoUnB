<script lang="ts">
	import type { CursoModel } from '$lib/types/curso';
	import type { IntegralizacaoResult } from '$lib/types/matriz';
	import { isOptativa } from '$lib/types/materia';
	import type { DadosFluxogramaUser } from '$lib/types/user';
	import { getTotalCreditsCompleted, getCurrentSubjectCodes } from '$lib/types/user';
	import { GraduationCap, Calendar, X, Loader2 } from 'lucide-svelte';
	import { formatarIraParaExibicao, IRA_NAO_ENCONTRADO } from '$lib/utils/ira';
	import IntegralizacaoSection from '$lib/components/fluxograma/dashboard/IntegralizacaoSection.svelte';
	import { portal } from '$lib/actions/portal';

	interface Props {
		courseData: CursoModel;
		userFluxograma: DadosFluxogramaUser | null;
		integralizacao?: IntegralizacaoResult | null;
		integralizacaoLoading?: boolean;
		matrizes?: Array<{ curriculoCompleto: string }>;
		curriculoCompletoAtual?: string | null;
		onMatrizChange?: (curriculoCompleto: string) => void;
	}

	let {
		courseData,
		userFluxograma,
		integralizacao,
		integralizacaoLoading = false,
		matrizes = [],
		curriculoCompletoAtual = null,
		onMatrizChange
	}: Props = $props();

	let showChModal = $state(false);

	let totalCredits = $derived.by(() => {
		if (courseData.totalCreditos != null && courseData.totalCreditos > 0) {
			return courseData.totalCreditos;
		}
		return courseData.materias
			.filter((m) => !isOptativa(m))
			.reduce((sum, m) => sum + m.creditos, 0);
	});

	let completedCredits = $derived.by(() => {
		if (!userFluxograma) return 0;
		const creditsMap = new Map(courseData.materias.map((m) => [m.codigoMateria, m.creditos]));
		return getTotalCreditsCompleted(userFluxograma, creditsMap);
	});

	let progressLabel = $derived(
		integralizacaoLoading ? 'Carregando...' : integralizacao ? 'Carga horária (SIGAA)' : 'Créditos'
	);
	let progressValue = $derived(
		integralizacaoLoading
			? '—'
			: integralizacao && integralizacao.exigido.chTotal > 0
				? `${integralizacao.realizado.chTotal.toLocaleString('pt-BR')}h / ${integralizacao.exigido.chTotal.toLocaleString('pt-BR')}h`
				: `${completedCredits}/${totalCredits}`
	);
	let progressPct = $derived(
		integralizacaoLoading
			? null
			: integralizacao && integralizacao.exigido.chTotal > 0
				? Math.round((integralizacao.realizado.chTotal / integralizacao.exigido.chTotal) * 100)
				: totalCredits > 0
					? Math.round((completedCredits / totalCredits) * 100)
					: null
	);
	let progressSublabel = $derived(
		integralizacaoLoading ? 'aguarde' : integralizacao ? 'horas integralizadas' : 'créditos integralizados'
	);

	let currentSemester = $derived(userFluxograma?.semestreAtual ?? 1);

	/** CH das disciplinas matriculadas (MATR): simulação de +Xh se aprovado em todas. */
	let simulacaoMatr = $derived.by(() => {
		if (!userFluxograma || !courseData || !integralizacao || integralizacao.exigido.chTotal <= 0) return null;
		const matrCodes = getCurrentSubjectCodes(userFluxograma);
		if (matrCodes.size === 0) return null;
		const codigoToCreditos = new Map(
			courseData.materias.map((m) => [m.codigoMateria.trim().toUpperCase(), m.creditos])
		);
		let chHoras = 0;
		for (const code of matrCodes) {
			const cr = codigoToCreditos.get(code?.trim().toUpperCase() ?? '');
			if (cr != null && cr > 0) chHoras += Math.round(cr * 15);
		}
		if (chHoras <= 0) return null;
		return {
			chMatriculadas: chHoras,
			totalSimulado: integralizacao.realizado.chTotal + chHoras
		};
	});

	let podeAbrirModal = $derived(!!integralizacao && !integralizacaoLoading);

	function circleProgress(percent: number, radius: number) {
		const circumference = 2 * Math.PI * radius;
		const offset = circumference - (percent / 100) * circumference;
		return { circumference, offset };
	}

	let circleData = $derived(
		progressPct != null ? circleProgress(progressPct, 28) : null
	);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') showChModal = false;
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) showChModal = false;
	}

	// Bloquear scroll do body quando o modal está aberto
	$effect(() => {
		if (showChModal) {
			const prev = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = prev;
			};
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if userFluxograma}
	<!-- Um card: integralização | semestre (dividido por borda) -->
	<div
		class="flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur-md sm:flex-row"
	>
		<button
			type="button"
			onclick={() => (podeAbrirModal ? (showChModal = true) : null)}
			class="min-w-0 flex-1 border-b border-white/10 p-4 text-left transition-colors sm:border-r sm:border-b-0 sm:p-5 {!podeAbrirModal
				? 'cursor-default'
				: 'cursor-pointer hover:bg-black/30'}"
			title={podeAbrirModal ? 'Ver detalhes da carga horária' : undefined}
		>
			<div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
				<div class="flex min-w-0 items-center gap-3 sm:gap-4">
					<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-500/20 sm:h-14 sm:w-14">
						{#if integralizacaoLoading}
							<Loader2 class="h-6 w-6 animate-spin text-green-400 sm:h-7 sm:w-7" />
						{:else if progressPct != null && circleData}
							<div class="relative h-12 w-12 sm:h-14 sm:w-14">
								<svg class="h-12 w-12 -rotate-90 sm:h-14 sm:w-14" viewBox="0 0 64 64" aria-hidden="true">
									<circle
										cx="32"
										cy="32"
										r="28"
										stroke="rgba(255,255,255,0.12)"
										stroke-width="5"
										fill="none"
									/>
									<circle
										cx="32"
										cy="32"
										r="28"
										stroke="#22c55e"
										stroke-width="5"
										fill="none"
										stroke-linecap="round"
										stroke-dasharray={circleData.circumference}
										stroke-dashoffset={circleData.offset}
										class="transition-all duration-600"
									/>
								</svg>
								<div class="absolute inset-0 flex items-center justify-center">
									<span class="text-sm font-bold text-white sm:text-base">{progressPct}%</span>
								</div>
							</div>
						{:else}
							<GraduationCap class="h-6 w-6 text-green-400 sm:h-7 sm:w-7" />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-1.5 text-green-400">
							<span class="text-xs font-semibold uppercase tracking-wider">{progressLabel}</span>
						</div>
						<p class="text-xs text-white/50">{progressSublabel}</p>
						{#if podeAbrirModal}
							<p class="mt-1 text-xs text-cyan-400 sm:mt-1.5">Clique para ver detalhes</p>
						{/if}
					</div>
				</div>
				<div class="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:justify-end sm:gap-3">
					<div class="min-w-0 flex-1 text-left sm:flex-none sm:text-right">
						<p class="truncate text-sm font-semibold text-white sm:text-base">{progressValue}</p>
						<p class="text-xs text-white/50">{progressSublabel}</p>
						{#if simulacaoMatr}
							{@const pctSimulado =
								integralizacao && integralizacao.exigido.chTotal > 0
									? Math.round((simulacaoMatr.totalSimulado / integralizacao.exigido.chTotal) * 100)
									: null}
							<div
								class="mt-2 flex flex-col items-start gap-1 sm:items-end"
								title="Se você for aprovado em todas as disciplinas em que está matriculado neste semestre, sua integralização passará a ser {simulacaoMatr.totalSimulado.toLocaleString('pt-BR')}h ({pctSimulado}%)."
							>
								<div
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-cyan-400/50 bg-cyan-500/10 md:h-11 md:w-11"
								>
									<span class="text-xs font-bold text-cyan-200 sm:text-sm">
										{pctSimulado ?? '—'}%
									</span>
								</div>
								<span class="max-w-[11rem] text-left text-[10px] leading-tight text-white/50 sm:text-right sm:text-xs"
									>Próx. sem. (se aprovado)</span
								>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</button>

		<div
			class="flex shrink-0 flex-col justify-center bg-black/20 p-4 sm:w-[min(42%,13.5rem)] sm:p-5"
			role="region"
			aria-label="Semestre e IRA"
		>
			<div class="flex items-center gap-1.5 text-amber-400">
				<Calendar class="h-4 w-4 shrink-0" />
				<span class="text-xs font-semibold uppercase tracking-wider">Semestre atual</span>
			</div>
			<p class="mt-2 text-2xl font-bold text-white sm:text-3xl">{currentSemester}º</p>
			<p class="text-xs text-white/50">semestre</p>
			<div class="mt-2 rounded-lg bg-white/5 px-2.5 py-1.5 sm:mt-3">
				{#if formatarIraParaExibicao(userFluxograma.ira, userFluxograma.iraTexto)}
					<span class="text-xs text-white/50">IRA: </span>
					<span class="text-sm font-semibold text-white sm:text-base"
						>{formatarIraParaExibicao(userFluxograma.ira, userFluxograma.iraTexto)}</span
					>
				{:else}
					<span class="text-xs text-white/50">{IRA_NAO_ENCONTRADO}</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- Modal Carga Horária — portal → body (igual Legenda / Créditos: blur em tela inteira) -->
	{#if showChModal && integralizacao}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			use:portal
			class="fixed inset-0 z-[5500] flex items-center justify-center overflow-hidden bg-black/60 p-4 backdrop-blur-sm sm:p-4"
			role="presentation"
			onclick={handleBackdropClick}
		>
			<div
				class="modal-box"
				role="dialog"
				aria-modal="true"
				aria-label="Detalhes da carga horária"
			>
				<div class="modal-header">
					<h2 class="text-base font-bold text-white sm:text-lg">Carga Horária (SIGAA)</h2>
					<button
						type="button"
						onclick={() => (showChModal = false)}
						class="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
						aria-label="Fechar"
					>
						<X class="h-5 w-5" />
					</button>
				</div>
				<div class="modal-scroll-area">
					<IntegralizacaoSection
						{integralizacao}
						{matrizes}
						curriculoCompletoAtual={curriculoCompletoAtual ?? integralizacao.curriculoCompleto}
						onMatrizChange={onMatrizChange}
						simulacaoMatr={simulacaoMatr}
					/>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	.modal-box {
		position: relative;
		display: flex;
		flex-direction: column;
		max-height: min(92vh, calc(100dvh - 2rem));
		width: 100%;
		max-width: 42rem;
		overflow: hidden;
		border-radius: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(17, 24, 39, 0.95);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(24px);
	}
	.modal-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(17, 24, 39, 0.95);
		padding: 0.75rem 1rem;
	}
	@media (min-width: 640px) {
		.modal-header { padding: 1rem 1.5rem; }
	}
	.modal-scroll-area {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		padding: 1rem;
	}
	@media (min-width: 640px) {
		.modal-scroll-area { padding: 1.5rem; }
	}
</style>
