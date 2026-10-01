<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import FluxogramaHeader from '$lib/components/fluxograma/controls/FluxogramaHeader.svelte';
	import FluxogramaLegendControls from '$lib/components/fluxograma/controls/FluxogramaLegendControls.svelte';
	import FluxogramViewportChrome from '$lib/components/fluxograma/layout/FluxogramViewportChrome.svelte';
	import SemesterNavChips from '$lib/components/fluxograma/layout/SemesterNavChips.svelte';
	import FluxogramContainer from '$lib/components/fluxograma/layout/FluxogramContainer.svelte';
	import ProgressSummarySection from '$lib/components/fluxograma/dashboard/ProgressSummarySection.svelte';
	import SubjectDetailsModal from '$lib/components/fluxograma/modal/SubjectDetailsModal.svelte';
		import OptativasAdicionadasSection from '$lib/components/fluxograma/dashboard/OptativasAdicionadasSection.svelte';
	import ProgressToolsSection from '$lib/components/fluxograma/dashboard/ProgressToolsSection.svelte';
	import PrerequisiteChainDialog from '$lib/components/fluxograma/modal/PrerequisiteChainDialog.svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { matchesFluxogramCompactTouchMode } from '$lib/utils/fluxogram-viewport';
	import { getIntegralizacao } from '$lib/services/integralizacao.service';
	import { supabaseDataService } from '$lib/services/supabase-data.service';
	import { goto } from '$app/navigation';
	import { ROUTES } from '$lib/config/routes';
	import { onMount, tick } from 'svelte';
	import { Upload, Loader2, AlertTriangle, Info } from 'lucide-svelte';
	import { type MateriaModel } from '$lib/types/materia';
	import type { IntegralizacaoResult } from '$lib/types/matriz';

	const store = fluxogramaStore;

	let containerRef: HTMLElement | null = $state(null);
	let fluxogramaViewportRef: HTMLElement | null = $state(null);
	let selectedSubject = $state<MateriaModel | null>(null);
	let chainDialogSubject = $state<MateriaModel | null>(null);
	let integralizacao = $state<IntegralizacaoResult | null>(null);
	let integralizacaoLoading = $state(false);
	let matrizes = $state<Array<{ curriculoCompleto: string; status?: string | null }>>([]);
	/** Modal “Legenda e regras” (ícone ? no header) */
	let fluxogramHelpOpen = $state(false);
	let fluxogramaFocusMode = $state(false);
	let fluxogramaControlsOpen = $state(false);

	let userFluxograma = $derived(store.userFluxograma);
	let courseName = $derived(userFluxograma?.nomeCurso ?? '');
	/** Currículo salvo no casamento (ex.: "60810/1") — mesma regra do casar-disciplinas para achar a matriz. */
	let matrizCurricular = $derived((userFluxograma as { matrizCurricular?: string } | null)?.matrizCurricular ?? '');
	let curriculoCompletoAtual = $derived(store.state.courseData?.curriculoCompleto ?? null);
	let resolvedMatrizCurricular = $state<string | null>(null);


	$effect(() => {
		const course = store.state.courseData;
		const fluxo = userFluxograma;
		const cc = course?.curriculoCompleto;
		void store.diagramLayoutRevision;
		if (!cc || !fluxo) {
			if (course?.idCurso && !cc) {
				supabaseDataService.getMatrizesByCurso(course.idCurso).then((m) => {
					matrizes = m.map((x) => ({ curriculoCompleto: x.curriculoCompleto, status: x.status }));
				});
			}
			integralizacao = null;
			integralizacaoLoading = false;
			return;
		}
		integralizacaoLoading = true;
		getIntegralizacao({
			curriculoCompleto: cc,
			dadosFluxograma: fluxo,
			cargaHorariaIntegralizada: store.cargaHorariaIntegralizada,
			equivalencias: course?.equivalencias
		}).then((r) => {
			integralizacao = r;
			integralizacaoLoading = false;
		});
		if (course?.idCurso) {
			supabaseDataService.getMatrizesByCurso(course.idCurso).then((m) => {
				matrizes = m.map((x) => ({ curriculoCompleto: x.curriculoCompleto, status: x.status }));
			});
		}
	});

	onMount(() => {
		// Mesma regra do casamento: priorizar curriculo (codigo/versao) para achar a matriz correta
		const loadInitialMatrix = async () => {
			if (matrizCurricular?.trim()) {
				// Fiel à matriz curricular do histórico enviado — não substitui pela matriz
				// "ativa" mais recente do curso, mesmo que a matriz do aluno esteja inativa.
				let resolvedCurriculo = matrizCurricular.trim();
				try {
					const resolvedMatriz = await supabaseDataService.getMatrizByCurriculoCompleto(resolvedCurriculo);
					if (resolvedMatriz) {
						resolvedCurriculo = resolvedMatriz.curriculoCompleto;
						resolvedMatrizCurricular = resolvedCurriculo;
					}
				} catch (e) {
					console.warn('Erro ao verificar status da matriz:', e);
					resolvedMatrizCurricular = resolvedCurriculo;
				}
				await store.loadCourseDataByCurriculoCompleto(resolvedCurriculo, false);
			} else if (courseName) {
				await store.loadCourseData(courseName, false);
			}
		};

		loadInitialMatrix();

		return () => {
			store.reset();
		};
	});

	async function handleMatrizChange(curriculoCompleto: string) {
		await store.loadCourseDataByCurriculoCompleto(curriculoCompleto, false);
		if (userFluxograma) {
			integralizacaoLoading = true;
			try {
				const r = await getIntegralizacao({
					curriculoCompleto,
					dadosFluxograma: userFluxograma,
					cargaHorariaIntegralizada: store.cargaHorariaIntegralizada,
					equivalencias: store.state.courseData?.equivalencias
				});
				integralizacao = r;
			} finally {
				integralizacaoLoading = false;
			}
		}
	}

	function handleSubjectClick(materia: MateriaModel) {
		chainDialogSubject = null;
		selectedSubject = materia;
		store.setSelectedSubject(materia.codigoMateria);
	}

	function handleSubjectOpenChain(materia: MateriaModel) {
		selectedSubject = null;
		store.setSelectedSubject(null);
		chainDialogSubject = materia;
	}

	function closeSubjectModal() {
		selectedSubject = null;
		store.setSelectedSubject(null);
	}

	function handleSubjectLongPress(materia: MateriaModel) {
		chainDialogSubject = materia;
	}

	function closeChainDialog() {
		chainDialogSubject = null;
	}

	function centerFluxogramaViewport() {
		const viewport = fluxogramaViewportRef;
		if (!viewport) return;
		const scrollRoot = viewport.querySelector<HTMLElement>('[data-fluxogram-scroll-root]');
		if (!scrollRoot) return;
		const columns = [...scrollRoot.querySelectorAll<HTMLElement>('.semester-column')];
		if (columns.length === 0) {
			scrollRoot.scrollLeft = 0;
			return;
		}
		const margemEsquerda = Math.max(16, Math.round(scrollRoot.clientWidth * 0.08));
		// Mobile: abre no semestre atual do aluno — a pergunta nº 1 é "onde estou agora?"
		const semestreAtual = store.userFluxograma?.semestreAtual;
		let alvo: HTMLElement | null = null;
		if (semestreAtual && matchesFluxogramCompactTouchMode()) {
			alvo = scrollRoot.querySelector<HTMLElement>(`[data-semester="${semestreAtual}"]`);
		}
		if (!alvo) {
			alvo = [...columns].sort((a, b) => a.offsetLeft - b.offsetLeft)[0];
		}
		// getBoundingClientRect independe da mecânica do zoom (CSS zoom vs transform)
		const rootRect = scrollRoot.getBoundingClientRect();
		const alvoRect = alvo.getBoundingClientRect();
		const targetLeft = scrollRoot.scrollLeft + (alvoRect.left - rootRect.left) - margemEsquerda;
		scrollRoot.scrollLeft = Math.max(0, targetLeft);
	}

	function scheduleCenterFluxogramaViewport(): () => void {
		let cancelled = false;
		const timers: ReturnType<typeof setTimeout>[] = [];
		const run = () => {
			if (cancelled) return;
			centerFluxogramaViewport();
		};
		requestAnimationFrame(run);
		timers.push(setTimeout(run, 220));
		timers.push(setTimeout(run, 520));
		return () => {
			cancelled = true;
			for (const t of timers) clearTimeout(t);
		};
	}

	$effect(() => {
		if (fluxogramaFocusMode) {
			const prev = document.body.style.overflow;
			document.body.dataset.fluxogramaFocusMode = 'true';
			document.body.style.overflow = 'hidden';
			return () => {
				delete document.body.dataset.fluxogramaFocusMode;
				document.body.style.overflow = prev;
			};
		}
		delete document.body.dataset.fluxogramaFocusMode;
	});

	// Mobile: primeiro paint já posicionado no semestre atual do aluno (fora do modo foco).
	let didInitialMobileCenter = false;
	$effect(() => {
		if (didInitialMobileCenter) return;
		if (!store.state.courseData) return;
		void store.diagramLayoutRevision;
		if (!store.userFluxograma) return;
		if (!matchesFluxogramCompactTouchMode()) {
			didInitialMobileCenter = true;
			return;
		}
		didInitialMobileCenter = true;
		requestAnimationFrame(() => scheduleCenterFluxogramaViewport());
	});

	$effect(() => {
		if (!fluxogramaFocusMode) return;
		void store.diagramLayoutRevision;
		let cancel = false;
		let cancelSchedule: (() => void) | null = null;
		(async () => {
			await tick();
			if (cancel) return;
			requestAnimationFrame(() => {
				if (cancel) return;
				cancelSchedule = scheduleCenterFluxogramaViewport();
			});
		})();
		return () => {
			cancel = true;
			cancelSchedule?.();
		};
	});
</script>

<PageMeta
	title="Meu Fluxograma"
	description="Visualize e gerencie seu progresso acadêmico na UnB"
	noIndex={true}
/>

<PageBackground />

<div
	class="relative z-10 container mx-auto w-full min-w-0 max-w-full px-3 pb-2 sm:px-4 sm:pb-3 [@media(orientation:landscape)_and_(max-height:560px)]:px-2 [@media(orientation:landscape)_and_(max-height:560px)]:pb-1 [@media(orientation:landscape)_and_(max-height:560px)]:sm:px-3 [@media(orientation:landscape)_and_(max-height:560px)]:sm:pb-2"
>
	{#if store.state.loading}
		<div class="flex flex-col items-center justify-center gap-4 py-20">
			<Loader2 class="h-10 w-10 animate-spin text-ai" />
			<p class="text-sm text-muted-foreground">Carregando fluxograma...</p>
		</div>
	{:else if store.state.error}
		<div class="mx-auto max-w-md rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center backdrop-blur-md">
			<AlertTriangle class="mx-auto mb-3 h-8 w-8 text-red-700 dark:text-red-400" />
			<h2 class="mb-2 text-lg font-semibold text-foreground">Erro ao carregar fluxograma</h2>
			<p class="mb-4 text-sm text-red-700 dark:text-red-300/80">{store.state.error}</p>
			<div class="flex flex-col items-center gap-3">
				<button
					onclick={() =>
						matrizCurricular?.trim()
							? store.loadCourseDataByCurriculoCompleto(matrizCurricular.trim())
							: courseName && store.loadCourseData(courseName)
					}
					class="rounded-full bg-foreground/10 px-6 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/20"
				>
					Tentar novamente
				</button>
				<button
					onclick={() => goto(ROUTES.UPLOAD_HISTORICO)}
					class="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-2 text-sm font-semibold text-white transition-transform dark:from-blue-500 dark:to-blue-700 hover:scale-105"
				>
					<Upload class="h-4 w-4" />
					Enviar histórico novamente
				</button>
			</div>
		</div>
	{:else if !userFluxograma}
		<div class="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center backdrop-blur-md dark:bg-background/80">
			<Upload class="mx-auto mb-3 h-8 w-8 text-ai" />
			<h2 class="mb-2 text-lg font-semibold text-foreground">Nenhum Fluxograma Encontrado</h2>
			<p class="mb-4 text-sm text-muted-foreground">
				Importe seu histórico acadêmico para gerar seu fluxograma personalizado.
			</p>
			<button
				onclick={() => goto(ROUTES.UPLOAD_HISTORICO)}
				class="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-3 font-semibold text-white transition-transform dark:from-blue-500 dark:to-blue-700 hover:scale-105"
			>
				<Upload class="h-4 w-4" />
				Importar Histórico
			</button>
		</div>
	{:else if store.state.courseData}
		<!--
			Optativas planejadas: só aparece com itens (componente interno); no topo para destaque.
			Bloco principal: viewport — rolagem do diagrama fica dentro do fluxograma.
		-->
		<div class="flex flex-col gap-2 pb-6">
			{#if !fluxogramaFocusMode && (store.precisaSalvarPerfil || store.optativasAdicionadas.length > 0)}
				<div class="relative z-50 shrink-0">
					<OptativasAdicionadasSection />
				</div>
			{/if}
			<div
				class="{fluxogramaFocusMode
					? 'fluxograma-focus-shell fixed inset-0 z-[2147483000] flex min-h-0 flex-col overflow-hidden rounded-none'
					: 'flex min-h-0 flex-col gap-2 [overflow-anchor:none] md:h-[calc(100dvh-3.75rem)] md:max-h-[calc(100dvh-3.75rem)] md:overflow-hidden [@media(orientation:landscape)_and_(max-height:560px)]:h-[calc(100dvh-0.5rem)] [@media(orientation:landscape)_and_(max-height:560px)]:max-h-[calc(100dvh-0.5rem)] [@media(orientation:landscape)_and_(max-height:560px)]:overflow-hidden [@media(orientation:landscape)_and_(max-height:560px)]:gap-0.5'}"
			>
				{#if !fluxogramaFocusMode}
					<div
						class="shrink-0 space-y-3 sm:space-y-3.5 md:space-y-4 [@media(orientation:landscape)_and_(max-height:560px)]:space-y-1.5 [@media(orientation:landscape)_and_(max-height:560px)]:sm:space-y-2"
					>
						{#if curriculoCompletoAtual && (resolvedMatrizCurricular || matrizCurricular) && curriculoCompletoAtual !== (resolvedMatrizCurricular || matrizCurricular)}
							<div class="flex animate-in fade-in slide-in-from-top-2 items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 backdrop-blur-md">
								<Info class="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
								<div class="min-w-0 flex-1">
									<h3 class="text-sm font-semibold text-amber-800 dark:text-amber-300">Você está simulando uma matriz diferente</h3>
									<p class="mt-0.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200/80">
										Sua matriz original (<strong>{matrizCurricular}</strong>) pode estar inativa ou você escolheu visualizar outra grade. O fluxograma abaixo corresponde à matriz <strong>{curriculoCompletoAtual}</strong>.
									</p>
								</div>
							</div>
						{/if}
						<FluxogramaHeader
							courseName={store.state.courseData.nomeCurso}
							matrizCurricular={store.state.courseData.matrizCurricular}
							tipoCurso={store.state.courseData.tipoCurso}
							turno={store.state.courseData.turno}
							{matrizes}
							{curriculoCompletoAtual}
							onMatrizChange={handleMatrizChange}
							{containerRef}
							showFluxogramViewMenu={true}
							onOpenFluxogramHelp={() => (fluxogramHelpOpen = true)}
						/>
						<FluxogramaLegendControls
							showFluxogramViewMenu={true}
							onOpenFluxogramHelp={() => (fluxogramHelpOpen = true)}
						/>
					</div>
				{/if}

				<!-- z-0: diagrama na base; modais ficam em z-[500]+ e a faixa de progresso em z-40 para não ficarem sob o transform dos cards -->
				<div
					class="relative z-0 h-[calc(100dvh-9.5rem)] shrink-0 overflow-hidden md:h-auto md:min-h-0 md:flex-1 md:shrink md:basis-0 [@media(orientation:landscape)_and_(max-height:560px)]:h-auto [@media(orientation:landscape)_and_(max-height:560px)]:min-h-0 [@media(orientation:landscape)_and_(max-height:560px)]:flex-1 [@media(orientation:landscape)_and_(max-height:560px)]:shrink [@media(orientation:landscape)_and_(max-height:560px)]:basis-0"
					bind:this={fluxogramaViewportRef}
				>
					<FluxogramContainer
						onSubjectClick={handleSubjectClick}
						onSubjectOpenChain={handleSubjectOpenChain}
						onSubjectLongPress={handleSubjectLongPress}
						focusMode={fluxogramaFocusMode}
						bind:bind_container={containerRef}
					/>
					<FluxogramViewportChrome
						bind:helpOpen={fluxogramHelpOpen}
						bind:controlsOpen={fluxogramaControlsOpen}
						focusMode={fluxogramaFocusMode}
						toggleFocusMode={() => (fluxogramaFocusMode = !fluxogramaFocusMode)}
						{integralizacao}
						{integralizacaoLoading}
					/>
				</div>

				<!-- Mobile: barra de controles + navegação por semestre abaixo do fluxograma -->
				{#if !fluxogramaFocusMode}
					<SemesterNavChips
						onOpenControls={() => (fluxogramaControlsOpen = true)}
						onToggleFocus={() => (fluxogramaFocusMode = !fluxogramaFocusMode)}
						focusMode={fluxogramaFocusMode}
					/>
				{/if}
			</div>

			{#if !fluxogramaFocusMode && !store.state.isAnonymous}
				<div class="relative z-40 shrink-0 space-y-4 border-t border-border pt-4">
					<ProgressSummarySection
						courseData={store.state.courseData}
						userFluxograma={store.userFluxograma}
						{integralizacao}
						integralizacaoLoading={integralizacaoLoading}
						{matrizes}
						{curriculoCompletoAtual}
						onMatrizChange={handleMatrizChange}
					/>
					<ProgressToolsSection />
				</div>
			{:else if !fluxogramaFocusMode}
				<div class="relative z-40 border-t border-border pt-4">
					<ProgressSummarySection
						courseData={store.state.courseData}
						userFluxograma={store.userFluxograma}
						{integralizacao}
						integralizacaoLoading={integralizacaoLoading}
						{matrizes}
						{curriculoCompletoAtual}
						onMatrizChange={handleMatrizChange}
					/>
				</div>
			{/if}
		</div>

		<!-- Subject details modal -->
		{#if selectedSubject && store.state.courseData}
			<SubjectDetailsModal
				materia={selectedSubject}
				courseData={store.state.courseData}
				onclose={closeSubjectModal}
			/>
		{/if}

		<!-- Prerequisite chain dialog -->
		{#if chainDialogSubject && store.state.courseData}
			<PrerequisiteChainDialog
				materia={chainDialogSubject}
				courseData={store.state.courseData}
				onclose={closeChainDialog}
			/>
		{/if}
	{/if}
</div>
