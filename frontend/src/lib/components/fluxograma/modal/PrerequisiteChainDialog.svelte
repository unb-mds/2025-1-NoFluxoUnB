<script lang="ts">
	import type { MateriaModel } from '$lib/types/materia';
	import type { CursoModel } from '$lib/types/curso';
	import { SubjectStatusEnum, getStatusLabel } from '$lib/types/materia';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import {
		getTopologicalPrerequisiteChain,
		getAncestorAndDescendantCodes
	} from '$lib/utils/curriculum-graph';
	import {
		X,
		GitBranch,
		Check,
		AlertTriangle,
		ArrowRight,
		ArrowLeftRight,
		Map as MapIcon
	} from 'lucide-svelte';
	import { portal } from '$lib/actions/portal';

	interface Props {
		materia: MateriaModel;
		courseData: CursoModel;
		onclose?: () => void;
	}

	let { materia, courseData, onclose }: Props = $props();

	const store = fluxogramaStore;
	let status = $derived(store.getSubjectStatus(materia));
	/** Chips transitivos mostram o NOME; tap/click revela o código (hover usa title). */
	let codigoVisivel = $state<string | null>(null);
	function toggleCodigo(key: string) {
		codigoVisivel = codigoVisivel === key ? null : key;
	}

	let canTake = $derived(
		status === SubjectStatusEnum.AVAILABLE ||
			status === SubjectStatusEnum.COMPLETED ||
			status === SubjectStatusEnum.IN_PROGRESS
	);

	let topoChain = $derived(getTopologicalPrerequisiteChain(courseData, materia.codigoMateria));

	let chainDisplay = $derived.by(() => {
		const L = topoChain.layers;
		const code = materia.codigoMateria.trim().toUpperCase();
		if (L.length === 0) {
			const failedTopo = topoChain.totalSccCount > 0;
			return { layers: L, emptyKind: failedTopo ? ('topo_fail' as const) : ('none' as const) };
		}
		if (
			L.length === 1 &&
			L[0].materias.length === 1 &&
			L[0].materias[0].codigoMateria.trim().toUpperCase() === code
		) {
			return { layers: [] as typeof L, emptyKind: 'no_prereq' as const };
		}
		return { layers: L, emptyKind: null };
	});

	let dependents = $derived.by(() => {
		return courseData.materias
			.filter((m) => m.preRequisitos?.some((p) => p.codigoMateria === materia.codigoMateria))
			.sort(
				(a, b) =>
					a.nivel - b.nivel || a.codigoMateria.localeCompare(b.codigoMateria, 'pt-BR')
			);
	});

	const codeMap = $derived.by(
		() => new Map(courseData.materias.map((m) => [m.codigoMateria.trim().toUpperCase(), m]))
	);

	let transitive = $derived.by(() => {
		const { ancestors, descendants } = getAncestorAndDescendantCodes(
			courseData,
			materia.codigoMateria
		);
		const ancList = [...ancestors]
			.map((c) => codeMap.get(c))
			.filter((m): m is MateriaModel => m != null)
			.sort((a, b) => a.nivel - b.nivel || a.codigoMateria.localeCompare(b.codigoMateria, 'pt-BR'));
		const descList = [...descendants]
			.map((c) => codeMap.get(c))
			.filter((m): m is MateriaModel => m != null)
			.sort((a, b) => a.nivel - b.nivel || a.codigoMateria.localeCompare(b.codigoMateria, 'pt-BR'));
		return { ancestors: ancList, descendants: descList };
	});

	function isFocus(m: MateriaModel): boolean {
		return m.codigoMateria.trim().toUpperCase() === materia.codigoMateria.trim().toUpperCase();
	}

	/** Última camada: foco por último (visual “chegada”). */
	function orderLayerMaterias(layerMats: MateriaModel[]): MateriaModel[] {
		const focus = materia.codigoMateria.trim().toUpperCase();
		const rest = layerMats.filter((m) => m.codigoMateria.trim().toUpperCase() !== focus);
		const f = layerMats.find((m) => m.codigoMateria.trim().toUpperCase() === focus);
		return f ? [...rest, f] : layerMats;
	}

	const statusIcons: Record<string, typeof Check> = {
		[SubjectStatusEnum.COMPLETED]: Check,
		[SubjectStatusEnum.IN_PROGRESS]: Check,
		[SubjectStatusEnum.AVAILABLE]: Check,
		[SubjectStatusEnum.FAILED]: AlertTriangle,
		[SubjectStatusEnum.LOCKED]: Check,
		[SubjectStatusEnum.NOT_STARTED]: Check
	};

	const statusColors: Record<string, string> = {
		[SubjectStatusEnum.COMPLETED]: 'text-emerald-700 dark:text-green-400',
		[SubjectStatusEnum.IN_PROGRESS]: 'text-ai',
		[SubjectStatusEnum.AVAILABLE]: 'text-amber-700 dark:text-amber-400',
		[SubjectStatusEnum.FAILED]: 'text-red-700 dark:text-red-400',
		[SubjectStatusEnum.LOCKED]: 'text-muted-foreground',
		[SubjectStatusEnum.NOT_STARTED]: 'text-muted-foreground'
	};

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose?.();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose?.();
	}

	function dragScroll(node: HTMLElement) {
		let activePointerId: number | null = null;
		let startX = 0;
		let lastX = 0;
		let lastT = 0;
		let velocityX = 0;
		let moved = false;
		let inertiaRaf: number | null = null;
		const DRAG_THRESHOLD = 3;
		const FRICTION = 0.92;
		const STOP_VELOCITY = 0.02;

		node.style.cursor = 'grab';
		node.style.scrollBehavior = 'auto';

		const stopInertia = () => {
			if (inertiaRaf != null) {
				cancelAnimationFrame(inertiaRaf);
				inertiaRaf = null;
			}
		};

		const runInertia = () => {
			stopInertia();
			const step = () => {
				velocityX *= FRICTION;
				if (Math.abs(velocityX) < STOP_VELOCITY) {
					inertiaRaf = null;
					return;
				}
				node.scrollLeft -= velocityX * 16;
				inertiaRaf = requestAnimationFrame(step);
			};
			inertiaRaf = requestAnimationFrame(step);
		};

		const onPointerDown = (e: PointerEvent) => {
			if (e.button !== 0) return;
			stopInertia();
			activePointerId = e.pointerId;
			moved = false;
			velocityX = 0;
			startX = e.clientX;
			lastX = e.clientX;
			lastT = performance.now();
			node.setPointerCapture(e.pointerId);
			node.style.cursor = 'grabbing';
		};

		const onPointerMove = (e: PointerEvent) => {
			if (activePointerId !== e.pointerId) return;
			const now = performance.now();
			const dx = e.clientX - lastX;
			const dt = Math.max(1, now - lastT);
			if (Math.abs(e.clientX - startX) > DRAG_THRESHOLD) moved = true;
			node.scrollLeft -= dx;
			velocityX = dx / dt;
			lastX = e.clientX;
			lastT = now;
			if (moved) e.preventDefault();
		};

		const endPointer = (e: PointerEvent) => {
			if (activePointerId !== e.pointerId) return;
			try {
				node.releasePointerCapture(e.pointerId);
			} catch {
				// ignore
			}
			activePointerId = null;
			node.style.cursor = 'grab';
			if (moved) runInertia();
		};

		const onClickCapture = (e: MouseEvent) => {
			if (moved) {
				e.preventDefault();
				e.stopPropagation();
				moved = false;
			}
		};

		node.addEventListener('pointerdown', onPointerDown);
		node.addEventListener('pointermove', onPointerMove);
		node.addEventListener('pointerup', endPointer);
		node.addEventListener('pointercancel', endPointer);
		node.addEventListener('click', onClickCapture, true);

		return {
			destroy() {
				stopInertia();
				node.removeEventListener('pointerdown', onPointerDown);
				node.removeEventListener('pointermove', onPointerMove);
				node.removeEventListener('pointerup', endPointer);
				node.removeEventListener('pointercancel', endPointer);
				node.removeEventListener('click', onClickCapture, true);
			}
		};
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	use:portal
	class="fixed inset-0 z-[2147483647] flex items-start justify-center bg-black/60 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+4.75rem)] backdrop-blur-sm sm:items-center sm:p-4"
	onclick={handleBackdropClick}
>
	<div
		class="relative max-h-[calc(100dvh-5.5rem)] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-nofluxoLg backdrop-blur-xl dark:bg-gray-900/95 dark:shadow-2xl sm:max-h-[90vh]"
		role="dialog"
		aria-modal="true"
		aria-label="Cadeia de pré-requisitos"
	>
		<div class="border-b border-border px-5 py-4 sm:px-6">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0 flex-1">
					<div class="mb-1 flex items-center gap-2">
						<GitBranch class="h-4 w-4 shrink-0 text-ai" />
						<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Cadeia de matérias
						</span>
					</div>
					<h2 class="text-lg font-bold text-foreground sm:text-xl">{materia.nomeMateria}</h2>
					<p class="text-xs text-muted-foreground">{materia.codigoMateria} · {materia.creditos} créditos</p>
				</div>
				<button
					onclick={onclose}
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground/70 transition-colors hover:bg-foreground/20 hover:text-foreground"
					aria-label="Fechar"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>

		<div class="border-b border-border px-5 py-3 sm:px-6">
			<div
				class="flex items-center gap-2 rounded-lg px-3 py-2 {canTake ? 'bg-green-500/10' : 'bg-amber-500/10'}"
			>
				{#if canTake}
					<Check class="h-4 w-4 text-emerald-700 dark:text-green-400" />
					<span class="text-sm font-medium text-emerald-800 dark:text-green-300">Pode cursar esta matéria</span>
				{:else}
					<AlertTriangle class="h-4 w-4 text-amber-700 dark:text-amber-400" />
					<span class="text-sm font-medium text-amber-800 dark:text-amber-300">Pré-requisitos pendentes</span>
				{/if}
			</div>
		</div>

		<div class="max-h-[min(70vh,560px)] overflow-y-auto px-5 py-4 sm:px-6">
			{#if chainDisplay.layers.length > 0}
				<!-- Roadmap: ordem topológica (mesmas cores do diagrama: violeta = pré, âmbar = foco) -->
				<section class="mb-6">
					<div class="mb-3 flex items-center gap-2 text-foreground/70">
						<MapIcon class="h-4 w-4 shrink-0 text-ai" />
						<h3 class="text-xs font-semibold uppercase tracking-wider">
							Roadmap até esta matéria (ordem topológica)
						</h3>
					</div>
					<p class="mb-3 text-[10px] leading-relaxed text-muted-foreground">
						Siga as setas da esquerda para a direita: o que vem antes deve ser cumprido (ou equivalência)
						antes do próximo passo. Co-requisitos na mesma camada ficam ligados por
						<span class="text-cyan-700 dark:text-cyan-400/90">↔</span>.
					</p>

					<div
						use:dragScroll
						class="roadmap-scroll flex min-h-[4.5rem] items-center gap-1 overflow-x-auto rounded-xl border border-primary/20 bg-muted/50 dark:bg-black/25 px-3 py-4 [scrollbar-width:thin]"
					>
						{#each chainDisplay.layers as layer, li}
							{#if li > 0}
								<ArrowRight
									class="h-5 w-5 shrink-0 self-center text-ai/90"
									strokeWidth={2.5}
									aria-hidden="true"
								/>
							{/if}
							<div class="flex shrink-0 items-center gap-1.5">
								{#each orderLayerMaterias(layer.materias) as lm, mi}
									{#if mi > 0}
										{#if layer.isCoReqCluster}
											<ArrowLeftRight
												class="h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-400/85"
												strokeWidth={2.25}
												aria-hidden="true"
											/>
										{:else}
											<ArrowRight
												class="h-4 w-4 shrink-0 text-ai/70"
												strokeWidth={2.25}
												aria-hidden="true"
											/>
										{/if}
									{/if}
									{@const st = store.getSubjectStatus(lm)}
									{@const Icon = statusIcons[st] ?? Check}
									<div
										class="roadmap-pill flex max-w-[11rem] flex-col gap-0.5 rounded-2xl border px-3 py-2 text-left shadow-sm transition-colors sm:max-w-[13rem] {isFocus(lm)
											? 'border-amber-400/55 bg-amber-500/15 ring-1 ring-amber-400/35'
											: 'border-purple-400/45 bg-primary/10 shadow-purple-950/30'}"
									>
										<span
											class="font-mono text-[10px] font-semibold tracking-wide {isFocus(lm)
												? 'text-amber-800 dark:text-amber-200/95'
												: 'text-accent-foreground dark:text-purple-200/90'}"
										>
											{lm.codigoMateria}
										</span>
										<span
											class="line-clamp-2 text-[11px] font-medium leading-snug {isFocus(lm)
												? 'text-amber-950 dark:text-amber-50/95'
												: 'text-foreground/90'}"
										>
											{lm.nomeMateria}
										</span>
										<div class="flex items-center gap-1 text-[9px] opacity-80">
											<Icon class="h-3 w-3 shrink-0 {statusColors[st]}" />
											<span class={isFocus(lm) ? 'text-amber-800 dark:text-amber-200/75' : 'text-accent-foreground dark:text-purple-200/65'}
												>{getStatusLabel(st)}</span
											>
										</div>
										{#if isFocus(lm)}
											<span
												class="mt-0.5 inline-block w-fit rounded bg-amber-500/25 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200/90"
												>Objetivo</span
											>
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</section>
			{:else}
				<p class="mb-6 text-sm text-muted-foreground">
					{#if chainDisplay.emptyKind === 'no_prereq'}
						Nenhum pré-requisito na grade deste curso para montar o roadmap.
					{:else if chainDisplay.emptyKind === 'topo_fail'}
						Não foi possível ordenar a cadeia (grafo condensado inválido).
					{:else}
						Matéria fora da grade carregada.
					{/if}
				</p>
			{/if}

			{#if dependents.length > 0}
				<section class="mb-6">
					<div class="mb-3 flex items-center gap-2 text-foreground/70">
						<GitBranch class="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
						<h3 class="text-xs font-semibold uppercase tracking-wider">
							Depois desta matéria (dependentes diretos)
						</h3>
					</div>
					<p class="mb-3 text-[10px] leading-relaxed text-muted-foreground">
						Fluxo na grade: esta disciplina é pré-requisito das abaixo (cor
						<span class="text-teal-700 dark:text-teal-400/90">teal</span>, como no diagrama).
					</p>
					<div
						use:dragScroll
						class="roadmap-scroll flex min-h-[4rem] items-center gap-1 overflow-x-auto rounded-xl border border-teal-500/25 bg-muted/50 dark:bg-black/20 px-3 py-4 [scrollbar-width:thin]"
					>
						<div
							class="flex max-w-[10rem] shrink-0 flex-col gap-0.5 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-left shadow-sm shadow-amber-950/20 sm:max-w-[12rem]"
						>
							<span class="font-mono text-[10px] font-semibold text-amber-800 dark:text-amber-200/90"
								>{materia.codigoMateria}</span
							>
							<span class="line-clamp-2 text-[11px] font-medium leading-snug text-amber-950 dark:text-amber-50/90"
								>{materia.nomeMateria}</span
							>
							<span class="text-[8px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300/70"
								>Você está aqui</span
							>
						</div>
						<ArrowRight class="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400/90" strokeWidth={2.5} aria-hidden="true" />
						{#each dependents as dep, di}
							{#if di > 0}
								<ArrowRight
									class="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400/75"
									strokeWidth={2.5}
									aria-hidden="true"
								/>
							{/if}
							{@const dst = store.getSubjectStatus(dep)}
							{@const DIcon = statusIcons[dst] ?? Check}
							<div
								class="flex max-w-[11rem] shrink-0 flex-col gap-0.5 rounded-2xl border border-teal-400/45 bg-teal-500/10 px-3 py-2 text-left shadow-sm shadow-teal-950/25 sm:max-w-[13rem]"
							>
								<span class="font-mono text-[10px] font-semibold text-teal-800 dark:text-teal-200/90"
									>{dep.codigoMateria}</span
								>
								<span class="line-clamp-2 text-[11px] font-medium leading-snug text-foreground/90"
									>{dep.nomeMateria}</span
								>
								<div class="flex items-center gap-1 text-[9px] text-teal-800 dark:text-teal-200/70">
									<DIcon class="h-3 w-3 shrink-0 {statusColors[dst]}" />
									<span>{getStatusLabel(dst)} · nív. {dep.nivel}</span>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if transitive.ancestors.length > 0 || transitive.descendants.length > 0}
				<section class="space-y-4 border-t border-border pt-5">
					{#if transitive.ancestors.length > 0}
						<div>
							<h4 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ai/80">
								Precisa cursar antes (transitivo na grade)
							</h4>
							<div class="flex flex-wrap gap-1.5">
								{#each transitive.ancestors as a (a.codigoMateria)}
									<button
										type="button"
										onclick={() => toggleCodigo(`a-${a.codigoMateria}`)}
										class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-purple-400/35 bg-primary/10 px-2.5 py-1 text-left text-[10px] leading-tight text-violet-900 dark:text-purple-100/95 transition-colors hover:bg-primary/20"
										title={a.codigoMateria}
									>
										<span class="truncate">{a.nomeMateria}</span>
										{#if codigoVisivel === `a-${a.codigoMateria}`}
											<span class="shrink-0 font-mono text-accent-foreground dark:text-purple-200/75">{a.codigoMateria}</span>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					{/if}
					{#if transitive.descendants.length > 0}
						<div>
							<h4 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400/85">
								Desbloqueia depois (transitivo na grade)
							</h4>
							<div class="flex flex-wrap gap-1.5">
								{#each transitive.descendants as d (d.codigoMateria)}
									<button
										type="button"
										onclick={() => toggleCodigo(`d-${d.codigoMateria}`)}
										class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-teal-400/35 bg-teal-500/10 px-2.5 py-1 text-left text-[10px] leading-tight text-teal-900 dark:text-teal-100/95 transition-colors hover:bg-teal-500/20"
										title={d.codigoMateria}
									>
										<span class="truncate">{d.nomeMateria}</span>
										{#if codigoVisivel === `d-${d.codigoMateria}`}
											<span class="shrink-0 font-mono text-teal-800 dark:text-teal-200/75">{d.codigoMateria}</span>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</section>
			{/if}
		</div>
	</div>
</div>

<style>
	.roadmap-scroll {
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: none;
		cursor: grab;
		user-select: none;
		touch-action: pan-x;
	}
</style>
