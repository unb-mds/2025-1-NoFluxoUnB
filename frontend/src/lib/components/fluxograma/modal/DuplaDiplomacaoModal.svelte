<script lang="ts">
	import { X, Search, Loader2 } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { ROUTES } from '$lib/config/routes';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { fluxogramaService } from '$lib/services/fluxograma.service';
	import { supabaseDataService } from '$lib/services/supabase-data.service';
	import type { MinimalCursoModel } from '$lib/types/curso';
	import { portal } from '$lib/actions/portal';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	const store = fluxogramaStore;

	let searchQuery = $state('');
	let cursos = $state<MinimalCursoModel[]>([]);
	let loadingCursos = $state(false);
	let navigating = $state(false);

	function normalizeSearchText(value: string | null | undefined): string {
		return (value ?? '')
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/ç/g, 'c')
			.replace(/Ç/g, 'C')
			.toLowerCase()
			.trim()
			.replace(/\s+/g, ' ');
	}

	const cursosFiltrados = $derived.by(() => {
		if (!searchQuery.trim()) return cursos;
		const q = normalizeSearchText(searchQuery);
		return cursos.filter(
			(c) =>
				normalizeSearchText(c.nomeCurso).includes(q) ||
				(c.tipoCurso && normalizeSearchText(c.tipoCurso).includes(q)) ||
				(c.turno && normalizeSearchText(c.turno).includes(q)) ||
				(c.matrizCurricular && normalizeSearchText(c.matrizCurricular).includes(q))
		);
	});

	function formatTurno(turno: string | null | undefined): string {
		if (!turno) return '';
		const t = turno.toUpperCase();
		if (t === 'NOTURNO') return 'Noturno';
		if (t === 'DIURNO') return 'Diurno';
		return turno;
	}

	$effect(() => {
		if (open) {
			loadCursos();
			const prev = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = prev;
				searchQuery = '';
			};
		}
	});

	async function loadCursos() {
		loadingCursos = true;
		try {
			cursos = await fluxogramaService.getAllCursos();
		} catch (e) {
			console.error('Erro ao carregar cursos:', e);
			cursos = [];
		} finally {
			loadingCursos = false;
		}
	}

	async function handleSelectCurso(curso: MinimalCursoModel) {
		if (!store.userFluxograma) return;

		navigating = true;
		onclose();

		try {
			let curriculoCompleto = curso.matrizCurricular?.trim();
			if (!curriculoCompleto) {
				const matrizes = await supabaseDataService.getMatrizesByCurso(curso.idCurso);
				curriculoCompleto = matrizes[0]?.curriculoCompleto ?? '';
			}

			// Navega para a tela do fluxograma do curso pretendido, sinalizando modo dupla diplomação
			// (?modo=dupla) para o banner de requisitos saber qual serviço de elegibilidade chamar.
			const params = new URLSearchParams({ modo: 'dupla' });
			if (curriculoCompleto) params.set('matriz', curriculoCompleto);
			const url = `${ROUTES.meuFluxograma(curso.nomeCurso)}?${params.toString()}`;
			await goto(url);
		} catch (e) {
			console.error('Erro ao navegar:', e);
		} finally {
			navigating = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- Portal → body: mesmo comportamento do modal Legenda / Créditos (blur em tela inteira) -->
	<div
		use:portal
		class="fixed inset-0 z-[5500] flex items-center justify-center overflow-hidden bg-black/60 p-4 backdrop-blur-sm sm:p-4"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && onclose()}
	>
		<div class="dupla-modal-box" role="dialog" aria-modal="true" aria-label="Dupla Diplomação">
			<div class="dupla-modal-header">
				<h2 class="text-base font-bold text-white sm:text-lg">Dupla Diplomação</h2>
				<button
					type="button"
					onclick={onclose}
					class="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
					aria-label="Fechar"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Mesmo padrão do modal de integralização: topo fixo + área com scroll -->
			<div class="dupla-modal-body">
				<div class="dupla-modal-body-top">
					<p class="mb-4 text-xs text-white/50">
						Selecione o curso pretendido para simular sua elegibilidade à dupla diplomação. Suas matérias concluídas
						serão casadas com o currículo desse curso.
					</p>

					<div
						class="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-emerald-100/85"
					>
						<p class="font-medium text-emerald-200/95">Ao simular dupla diplomação</p>
						<p class="mt-1 text-white/60">
							Analisamos três indicativos com base no seu histórico e no curso pretendido: você ser
							<strong class="text-white/78">provável formando</strong> no curso atual, integralizar
							<strong class="text-white/78">≥ 70%</strong> da CH do curso pretendido (fórmula usada) e ter
							<strong class="text-white/78">IRA ≥ 3,0</strong>. Confira sempre o edital vigente e o PPC oficial.
						</p>
					</div>

					<div class="relative mb-4">
						<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
						<input
							type="search"
							placeholder="Pesquisar por nome, tipo (ex.: Bacharelado, Licenciatura) ou currículo..."
							bind:value={searchQuery}
							class="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-emerald-500/50 focus:outline-none"
						/>
					</div>
				</div>

				<div class="dupla-modal-scroll">
					{#if loadingCursos}
						<div class="flex flex-col items-center justify-center gap-3 py-12">
							<Loader2 class="h-8 w-8 animate-spin text-emerald-400" />
							<p class="text-sm text-white/60">Carregando cursos...</p>
						</div>
					{:else}
						<div class="space-y-1">
							{#each cursosFiltrados as curso}
								<button
									type="button"
									onclick={() => handleSelectCurso(curso)}
									disabled={navigating}
									class="flex w-full flex-col items-stretch gap-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 hover:border-emerald-500/30 disabled:opacity-50"
								>
									<div class="flex items-start justify-between gap-2">
										<span class="font-medium text-white/90">{curso.nomeCurso}</span>
										<span class="shrink-0 text-xs text-emerald-400">Ver fluxograma →</span>
									</div>
									<p class="text-xs">
										<span class="text-white/50">Tipo:</span>
										<span class="ml-1 font-medium {curso.tipoCurso ? 'text-cyan-300' : 'text-white/40'}">
											{curso.tipoCurso || '—'}
										</span>
									</p>
									{#if curso.turno}
										<p class="text-xs text-white/50">
											<span class="text-white/40">Turno:</span>
											<span class="ml-1 text-emerald-300/90">{formatTurno(curso.turno)}</span>
										</p>
									{/if}
									{#if curso.matrizCurricular}
										<p class="min-w-0 truncate text-xs text-white/50" title={curso.matrizCurricular}>
											<span class="text-white/40">Currículo:</span>
											<span class="ml-1">{curso.matrizCurricular}</span>
										</p>
									{/if}
								</button>
							{/each}
							{#if cursosFiltrados.length === 0}
								<p class="py-8 text-center text-sm text-white/50">
									{searchQuery.trim() ? 'Nenhum curso encontrado.' : 'Nenhum curso disponível.'}
								</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Alinhado ao .modal-box / .modal-scroll-area de ProgressSummarySection (integralização) */
	.dupla-modal-box {
		position: relative;
		display: flex;
		min-height: 0;
		width: 100%;
		max-width: 42rem;
		max-height: min(92vh, calc(100dvh - 2rem));
		flex-direction: column;
		overflow: hidden;
		border-radius: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(17, 24, 39, 0.95);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(24px);
	}
	.dupla-modal-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(17, 24, 39, 0.95);
		padding: 0.75rem 1rem;
	}
	@media (min-width: 640px) {
		.dupla-modal-header {
			padding: 1rem 1.5rem;
		}
	}
	.dupla-modal-body {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
	}
	.dupla-modal-body-top {
		flex-shrink: 0;
		padding: 1rem 1rem 0;
	}
	@media (min-width: 640px) {
		.dupla-modal-body-top {
			padding: 1rem 1.5rem 0;
		}
	}
	.dupla-modal-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		padding: 1rem;
	}
	@media (min-width: 640px) {
		.dupla-modal-scroll {
			padding: 1rem 1.5rem 1.5rem;
		}
	}
</style>
