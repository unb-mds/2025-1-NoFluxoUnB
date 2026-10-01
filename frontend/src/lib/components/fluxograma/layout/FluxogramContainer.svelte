<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { MateriaModel } from '$lib/types/materia';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import {
		matchesFluxogramCompactTouchMode,
		FLUXOGRAM_NARROW_QUERY,
		FLUXOGRAM_COMPACT_LANDSCAPE_QUERY
	} from '$lib/utils/fluxogram-viewport';
	import SemesterColumn from '$lib/components/fluxograma/layout/SemesterColumn.svelte';
	import PrerequisiteConnections from '$lib/components/fluxograma/layout/PrerequisiteConnections.svelte';

	interface Props {
		onSubjectClick?: (materia: MateriaModel) => void;
		onSubjectOpenChain?: (materia: MateriaModel) => void;
		onSubjectLongPress?: (materia: MateriaModel) => void;
		bind_container?: HTMLElement | null;
		focusMode?: boolean;
	}

	let {
		onSubjectClick,
		onSubjectOpenChain,
		onSubjectLongPress,
		bind_container = $bindable(null),
		focusMode = false
	}: Props =
		$props();

	const store = fluxogramaStore;

	let containerRef: HTMLElement | null = $state(null);
	let innerRef: HTMLElement | null = $state(null);

	// Pan/drag state
	let isDragging = $state(false);
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let scrollStartX = $state(0);
	let scrollStartY = $state(0);

	// Touch state
	let lastTouchX = $state(0);
	let lastTouchY = $state(0);
	/** Origem do toque — deslocamento ACUMULADO decide tap vs. arrasto (não delta por evento). */
	let touchOriginX = $state(0);
	let touchOriginY = $state(0);
	let initialPinchDistance = $state(0);
	let initialPinchZoom = $state(0);
	/** Pinça em andamento: ancora o zoom no ponto do gesto e pausa o snap por semestre. */
	let pinchActive = $state(false);
	let pinchMidX = 0;
	let pinchMidY = 0;
	let pinchScrollStartX = 0;
	let pinchScrollStartY = 0;
	let touchMoved = $state(false);
	/** Mobile: toque iniciou em um card — atrasa scroll para permitir tap/long-press */
	let touchStartedOnCard = $state(false);

	/**
	 * Em telas estreitas, rolagem com 1 dedo fica nativa (overflow) para encadear com a página
	 * e não “prender” o gesto no diagrama. Desktop mantém pan customizado no fundo.
	 */
	let useNativeTouchScroll = $state(false);

	$effect(() => {
		if (!browser) return;
		const apply = () => {
			useNativeTouchScroll = matchesFluxogramCompactTouchMode();
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

	// Semestres: apenas colunas nivel >= 1 da matriz + semestres onde há optativa planejada (sem coluna “pool” nivel 0).
	let sortedSemesters = $derived.by(() => {
		const keys = new Set<number>();
		for (const k of store.subjectsBySemester.keys()) {
			if (k > 0) keys.add(k);
		}
		for (const k of store.optativasBySemester.keys()) {
			if (k > 0) keys.add(k);
		}
		for (const k of store.extrasCursadasBySemester.keys()) {
			if (k > 0) keys.add(k);
		}
		return Array.from(keys).sort((a, b) => a - b);
	});

	/** Só arrasta pelo “fundo” — não rouba clique dos cards nem de controles. */
	function isPanStartTarget(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el) return false;
		if (el.closest('.subject-card')) return false;
		if (el.closest('button, a, input, select, textarea, [role="button"]')) return false;
		return true;
	}

	function endWindowPan() {
		window.removeEventListener('mousemove', handleWindowMouseMove);
		window.removeEventListener('mouseup', handleWindowMouseUp);
		isDragging = false;
		if (containerRef) containerRef.style.cursor = 'grab';
	}

	function handleWindowMouseMove(e: MouseEvent) {
		if (!isDragging || !containerRef) return;
		e.preventDefault();
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		containerRef.scrollLeft = scrollStartX - dx;
		containerRef.scrollTop = scrollStartY - dy;
	}

	function handleWindowMouseUp() {
		endWindowPan();
	}

	function handleMouseDown(e: MouseEvent) {
		if (e.button !== 0 || !containerRef || !isPanStartTarget(e.target)) return;
		e.preventDefault();
		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		scrollStartX = containerRef.scrollLeft;
		scrollStartY = containerRef.scrollTop;
		containerRef.style.cursor = 'grabbing';
		window.addEventListener('mousemove', handleWindowMouseMove);
		window.addEventListener('mouseup', handleWindowMouseUp);
	}

	function handleMouseUp() {
		endWindowPan();
	}

	function handleWheel(e: WheelEvent) {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			const delta = e.deltaY > 0 ? -0.05 : 0.05;
			store.setZoom(store.state.zoomLevel + delta);
		}
	}

	function handleTouchStart(e: TouchEvent) {
		if (e.touches.length === 1) {
			const target = e.target as HTMLElement;
			touchStartedOnCard = !!target.closest('.subject-card');
			touchMoved = false;
			if (!useNativeTouchScroll) {
				// Se toque em card, não inicia scroll — permite tap/long-press
				isDragging = !touchStartedOnCard;
			} else {
				isDragging = false;
			}
			lastTouchX = e.touches[0].clientX;
			lastTouchY = e.touches[0].clientY;
			touchOriginX = e.touches[0].clientX;
			touchOriginY = e.touches[0].clientY;
			if (containerRef) {
				scrollStartX = containerRef.scrollLeft;
				scrollStartY = containerRef.scrollTop;
			}
		} else if (e.touches.length === 2 && containerRef) {
			isDragging = false;
			const dx = e.touches[0].clientX - e.touches[1].clientX;
			const dy = e.touches[0].clientY - e.touches[1].clientY;
			initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
			initialPinchZoom = store.state.zoomLevel;
			// Âncora: ponto médio dos dedos relativo ao container — o conteúdo sob os dedos fica sob os dedos.
			const rect = containerRef.getBoundingClientRect();
			pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
			pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
			pinchScrollStartX = containerRef.scrollLeft;
			pinchScrollStartY = containerRef.scrollTop;
			pinchActive = true;
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (e.touches.length === 1) {
			const dxTouch = Math.abs(e.touches[0].clientX - touchOriginX);
			const dyTouch = Math.abs(e.touches[0].clientY - touchOriginY);
			if (dxTouch > 6 || dyTouch > 6) touchMoved = true;
		}
		if (useNativeTouchScroll && e.touches.length === 1) {
			lastTouchX = e.touches[0].clientX;
			lastTouchY = e.touches[0].clientY;
			return;
		}
		if (e.touches.length === 1) {
			// Se toque começou em card e usuário moveu, habilita scroll (só desktop / pan customizado)
			if (touchStartedOnCard) {
				const dx = Math.abs(e.touches[0].clientX - lastTouchX);
				const dy = Math.abs(e.touches[0].clientY - lastTouchY);
				if (dx > 8 || dy > 8) {
					touchStartedOnCard = false;
					isDragging = true;
					if (containerRef) {
						scrollStartX = containerRef.scrollLeft;
						scrollStartY = containerRef.scrollTop;
					}
				}
			}
			if (isDragging && containerRef) {
				const ddx = lastTouchX - e.touches[0].clientX;
				const ddy = lastTouchY - e.touches[0].clientY;
				containerRef.scrollLeft += ddx;
				containerRef.scrollTop += ddy;
				lastTouchX = e.touches[0].clientX;
				lastTouchY = e.touches[0].clientY;
			}
		} else if (e.touches.length === 2 && containerRef) {
			// Listener non-passive: preventDefault impede o pinch nativo da página — o diagrama é o único dono do gesto.
			e.preventDefault();
			const dx = e.touches[0].clientX - e.touches[1].clientX;
			const dy = e.touches[0].clientY - e.touches[1].clientY;
			const distance = Math.sqrt(dx * dx + dy * dy);
			const scale = distance / initialPinchDistance;
			store.setZoom(initialPinchZoom * scale);
			const ratio = store.state.zoomLevel / initialPinchZoom;
			containerRef.scrollLeft = (pinchScrollStartX + pinchMidX) * ratio - pinchMidX;
			containerRef.scrollTop = (pinchScrollStartY + pinchMidY) * ratio - pinchMidY;
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		isDragging = false;
		touchStartedOnCard = false;
		if (e.touches.length < 2) pinchActive = false;
		const target = e.target as HTMLElement;
		const endedOnCard = !!target.closest('.subject-card');
		const isBackgroundTap = !endedOnCard && !touchMoved;
		// Só esconde conexões em "tap no vazio"; não esconder após pan/arraste.
		if (isBackgroundTap) {
			store.setHoveredSubject(null);
		}
		touchMoved = false;
	}

	// touchmove precisa ser non-passive para o preventDefault do pinch funcionar
	// (handlers de markup do Svelte são passivos para touchmove).
	$effect(() => {
		const el = containerRef;
		if (!el) return;
		el.addEventListener('touchmove', handleTouchMove, { passive: false });
		return () => el.removeEventListener('touchmove', handleTouchMove);
	});

	/**
	 * Zoom inicial adaptativo (one-shot por montagem): desktop ajusta para a coluna
	 * mais alta caber inteira na vertical (teto 1.0 — eixo de navegação é o horizontal);
	 * modo compacto mira ~2 colunas visíveis na largura. Precisa rodar ANTES do efeito
	 * de reancoragem e atualizar `prevZoomForAnchor`, senão a fórmula do centro com
	 * scroll (0,0) deslocaria o viewport no primeiro frame.
	 */
	let initialZoomApplied = false;
	$effect(() => {
		if (initialZoomApplied) return;
		const scroller = containerRef;
		const inner = innerRef;
		if (!scroller || !inner || sortedSemesters.length === 0) return;
		let target: number;
		if (useNativeTouchScroll) {
			const pitch = 220 + 48; // w-[220px] da coluna + gap 3rem (mobile usa conexões 'direct')
			target = Math.min(0.8, Math.max(0.5, scroller.clientWidth / (2 * pitch)));
		} else {
			// getBoundingClientRect reflete o CSS zoom; dividir pelo zoom vigente dá o tamanho natural
			const naturalH = inner.getBoundingClientRect().height / store.state.zoomLevel;
			if (naturalH <= 0) return;
			target = Math.min(1.0, scroller.clientHeight / naturalH);
		}
		initialZoomApplied = true;
		store.applyAdaptiveZoom(target);
		prevZoomForAnchor = store.state.zoomLevel; // valor já clampado pelo store
	});

	/**
	 * Zoom vindo do slider/botões (fora do pinch): reancora o scroll no centro do
	 * viewport para a região visível não "fugir" — com CSS zoom o scrollWidth/Height
	 * acompanham a escala, então basta reescalar pela razão novo/velho.
	 */
	let prevZoomForAnchor = store.state.zoomLevel;
	$effect(() => {
		const z = store.state.zoomLevel;
		const el = containerRef;
		if (!el || z === prevZoomForAnchor) {
			prevZoomForAnchor = z;
			return;
		}
		const ratio = z / prevZoomForAnchor;
		prevZoomForAnchor = z;
		if (pinchActive) return; // pinça ancora no ponto do gesto
		const cx = el.scrollLeft + el.clientWidth / 2;
		const cy = el.scrollTop + el.clientHeight / 2;
		el.scrollLeft = cx * ratio - el.clientWidth / 2;
		el.scrollTop = cy * ratio - el.clientHeight / 2;
	});

	// Sync bind_container
	$effect(() => {
		bind_container = innerRef;
	});

	onDestroy(() => {
		endWindowPan();
	});
</script>

<!-- Pan/zoom/toque no wrapper: sem elemento nativo equivalente. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={containerRef}
	data-fluxogram-scroll-root
	class="fluxogram-container relative h-full min-h-0 w-full flex-1 select-none overflow-auto [overflow-anchor:none] {focusMode
		? 'rounded-2xl border border-primary/24 bg-background/[0.93] shadow-[0_0_0_1px_rgba(124,58,237,0.11),0_16px_48px_hsl(var(--foreground)/0.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(124,58,237,0.11),0_0_14px_rgba(124,58,237,0.12),0_16px_48px_rgba(0,0,0,0.52)]'
		: 'rounded-xl border border-border bg-card/70 dark:bg-background/30'} {useNativeTouchScroll
		? 'overscroll-y-auto [overscroll-behavior-x:contain]'
		: ''}"
	style:cursor="grab"
	style:touch-action={useNativeTouchScroll ? 'pan-x pan-y' : 'none'}
	style:-webkit-overflow-scrolling={useNativeTouchScroll ? 'touch' : undefined}
	style:scroll-snap-type={useNativeTouchScroll && !pinchActive ? 'x proximity' : undefined}
	role="application"
	aria-label="Fluxograma interativo — arraste o fundo para mover"
	onmousedown={handleMouseDown}
	onmouseup={handleMouseUp}
	onwheel={handleWheel}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
>
	<div
		bind:this={innerRef}
		class="relative inline-flex {focusMode
			? 'p-[max(18vh,6rem)] pb-[max(24vh,8rem)]'
			: 'p-4 pb-[6.5rem] pt-4 md:pb-14'}"
		style="gap: {store.state.connectionMode === 'all' && !useNativeTouchScroll
			? '6rem'
			: '3rem'}; zoom: {store.state.zoomLevel}; transition: gap 0.3s ease;"
	>
		<!-- Prerequisite connection lines -->
		<PrerequisiteConnections container={innerRef} />

		<!-- Semester columns -->
		{#each sortedSemesters as semester (semester)}
			{@const subjects = store.subjectsBySemester.get(semester) ?? []}
			{@const optRaw = store.optativasBySemester.get(semester) ?? []}
			{@const codesInCol = new Set(
				subjects.map((m) => m.codigoMateria.trim().toUpperCase())
			)}
			{@const optPlanned = optRaw.filter((o) =>
				!codesInCol.has(o.materia.codigoMateria.trim().toUpperCase())
			)}
			{@const extrasCursadas = store.extrasCursadasBySemester.get(semester) ?? []}
			<SemesterColumn
				{semester}
				{subjects}
				optPlanned={optPlanned}
				{extrasCursadas}
				{onSubjectClick}
				{onSubjectOpenChain}
				{onSubjectLongPress}
			/>
		{/each}
	</div>
</div>
