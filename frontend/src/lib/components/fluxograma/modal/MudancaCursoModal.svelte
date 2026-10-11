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
			.replace(/[\u0300-\u036f]/g, '')
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

			// Navega para a tela do fluxograma do curso selecionado.
			// A página carrega o curso e calcula integralização usando os dados do usuário (casar matérias).
			const url = curriculoCompleto
				? `${ROUTES.meuFluxograma(curso.nomeCurso)}?matriz=${encodeURIComponent(curriculoCompleto)}`
				: ROUTES.meuFluxograma(curso.nomeCurso);
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
		<div class="mudanca-modal-box" role="dialog" aria-modal="true" aria-label="Mudança de curso">
			<div class="mudanca-modal-header">
				<h2 class="text-base font-bold text-foreground sm:text-lg">Mudança de Curso</h2>
				<button
					type="button"
					onclick={onclose}
					class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
					aria-label="Fechar"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Mesmo padrão do modal de integralização: topo fixo + área com scroll -->
			<div class="mudanca-modal-body">
				<div class="mudanca-modal-body-top">
					<p class="mb-4 text-xs text-muted-foreground">
						Selecione um curso para ver seu progresso como se estivesse nele. Suas matérias concluídas serão casadas com o currículo do curso.
					</p>

					<div
						class="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-amber-900 dark:text-amber-100/85"
					>
						<p class="font-medium text-amber-800 dark:text-amber-200/95">Ao simular mudança de curso</p>
						<p class="mt-1 text-muted-foreground">
							<strong class="text-foreground/80">Curso de origem:</strong> você precisa ter todos os obrigatórios dos dois primeiros
							períodos aprovados e consolidados na matriz atual (consulte o PPC oficial). Optativas e reprovações não entram.
						</p>
						<p class="mt-1 text-muted-foreground">
							<strong class="text-foreground/80">Curso pretendido:</strong> costuma-se exigir pelo menos <strong>360&nbsp;h</strong> em obrigatórias
							e/ou optativas do destino, também consolidadas até a data de análise. Depois da simulação, abrimos esse indicativo
							com seus dados daqui.
						</p>
					</div>

					<div class="relative mb-4">
						<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<input
							type="search"
							placeholder="Pesquisar por nome, tipo (ex.: Bacharelado, Licenciatura) ou currículo..."
							bind:value={searchQuery}
							class="w-full rounded-lg border border-border-strong bg-foreground/5 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-500/50 focus:outline-none dark:placeholder:text-foreground/40"
						/>
					</div>
				</div>

				<div class="mudanca-modal-scroll">
					{#if loadingCursos}
						<div class="flex flex-col items-center justify-center gap-3 py-12">
							<Loader2 class="h-8 w-8 animate-spin text-amber-700 dark:text-amber-400" />
							<p class="text-sm text-muted-foreground">Carregando cursos...</p>
						</div>
					{:else}
						<div class="space-y-1">
							{#each cursosFiltrados as curso}
								<button
									type="button"
									onclick={() => handleSelectCurso(curso)}
									disabled={navigating}
									class="flex w-full flex-col items-stretch gap-1 rounded-lg border border-border bg-foreground/5 px-4 py-3 text-left transition-colors hover:bg-foreground/10 hover:border-amber-500/30 disabled:opacity-50"
								>
									<div class="flex items-start justify-between gap-2">
										<span class="font-medium text-foreground/90">{curso.nomeCurso}</span>
										<span class="shrink-0 text-xs text-amber-700 dark:text-amber-400">Ver fluxograma →</span>
									</div>
									<p class="text-xs">
										<span class="text-muted-foreground">Tipo:</span>
										<span class="ml-1 font-medium {curso.tipoCurso ? 'text-cyan-800 dark:text-cyan-300' : 'text-muted-foreground'}">
											{curso.tipoCurso || '—'}
										</span>
									</p>
									{#if curso.turno}
										<p class="text-xs text-muted-foreground">
											<span class="text-muted-foreground">Turno:</span>
											<span class="ml-1 text-amber-800 dark:text-amber-300/90">{formatTurno(curso.turno)}</span>
										</p>
									{/if}
									{#if curso.matrizCurricular}
										<p class="min-w-0 truncate text-xs text-muted-foreground" title={curso.matrizCurricular}>
											<span class="text-muted-foreground">Currículo:</span>
											<span class="ml-1">{curso.matrizCurricular}</span>
										</p>
									{/if}
								</button>
							{/each}
							{#if cursosFiltrados.length === 0}
								<p class="py-8 text-center text-sm text-muted-foreground">
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
	.mudanca-modal-box {
		position: relative;
		display: flex;
		min-height: 0;
		width: 100%;
		max-width: 42rem;
		max-height: min(92vh, calc(100dvh - 2rem));
		flex-direction: column;
		overflow: hidden;
		border-radius: 0.75rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		box-shadow: var(--nf-shadow-card-lg);
		backdrop-filter: blur(24px);
	}
	:global(.dark) .mudanca-modal-box {
		border-color: rgba(255, 255, 255, 0.1);
		background: rgba(17, 24, 39, 0.95);
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}
	.mudanca-modal-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		padding: 0.75rem 1rem;
	}
	:global(.dark) .mudanca-modal-header {
		border-bottom-color: rgba(255, 255, 255, 0.1);
		background: rgba(17, 24, 39, 0.95);
	}
	@media (min-width: 640px) {
		.mudanca-modal-header {
			padding: 1rem 1.5rem;
		}
	}
	.mudanca-modal-body {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		overflow: hidden;
	}
	.mudanca-modal-body-top {
		flex-shrink: 0;
		padding: 1rem 1rem 0;
	}
	@media (min-width: 640px) {
		.mudanca-modal-body-top {
			padding: 1rem 1.5rem 0;
		}
	}
	.mudanca-modal-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		padding: 1rem;
	}
	@media (min-width: 640px) {
		.mudanca-modal-scroll {
			padding: 1rem 1.5rem 1.5rem;
		}
	}
</style>
