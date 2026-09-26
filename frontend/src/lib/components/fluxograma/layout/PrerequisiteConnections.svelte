<script lang="ts">
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { browser } from '$app/environment';
	import {
		classifyChainPrereqStroke,
		getDirectDependentCodes,
		getSubjectChain
	} from '$lib/utils/curriculum-graph';
	import {
		allocateTransitYs,
		assignLanesForGap,
		buildArcPath,
		buildGaps,
		buildRoutedPath,
		findColumnIndex,
		resolveEdgeGeometry,
		type CardBox,
		type ColumnGap,
		type ColumnRect,
		type EdgeGeometry,
		type FarLineInput,
		type FarRouting,
		type Interval
	} from '$lib/utils/prerequisite-routing';

	const store = fluxogramaStore;

	function normSubjectCode(code: string): string {
		return (code || '').trim().toUpperCase();
	}

	interface ConnectionLine extends EdgeGeometry {
		type: 'prerequisite' | 'dependent' | 'corequisite';
		/** Modo diretas (1 nível) e modo cadeia (cadeia transitiva completa) no hover. */
		chainStroke?: 'pre' | 'desc' | 'core';
		isAllMode?: boolean;
		fromCode: string;
		toCode: string;
		/** Só em `forward-far` no modo “todas”: rota ortogonal pelos vãos entre colunas. */
		routing?: FarRouting;
		/** Só em `same-column`: afastamento do “U” para curvas irmãs não se sobreporem. */
		bulge?: number;
	}

	let lines = $state<ConnectionLine[]>([]);
	let svgWidth = $state(0);
	let svgHeight = $state(0);

	interface Props {
		container?: HTMLElement | null;
	}

	let { container = null }: Props = $props();

	/** Invalida follow-ups agendados quando um novo cálculo “principal” roda (evita corridas). */
	let followUpGeneration = 0;
	let followUpRaf1 = 0;
	let followUpRaf2 = 0;
	let followUpTimeout: ReturnType<typeof setTimeout> | null = null;

	function cancelScheduledFollowUps() {
		if (followUpRaf1) cancelAnimationFrame(followUpRaf1);
		if (followUpRaf2) cancelAnimationFrame(followUpRaf2);
		if (followUpTimeout) clearTimeout(followUpTimeout);
		followUpRaf1 = 0;
		followUpRaf2 = 0;
		followUpTimeout = null;
	}

	/**
	 * No modo "todas", `computeAndSetDensity` e as transições de `gap` (flex entre colunas e entre
	 * cards) mudam o layout depois do primeiro paint. Um único rAF mede cedo demais; precisamos
	 * remediar após reflow e após ~300ms (fim da transição CSS).
	 */
	function scheduleFollowUpsAfterDensity() {
		cancelScheduledFollowUps();
		const gen = ++followUpGeneration;
		followUpRaf1 = requestAnimationFrame(() => {
			followUpRaf1 = 0;
			followUpRaf2 = requestAnimationFrame(() => {
				followUpRaf2 = 0;
				if (gen !== followUpGeneration) return;
				calculateConnections(false);
			});
		});
		followUpTimeout = setTimeout(() => {
			followUpTimeout = null;
			if (gen !== followUpGeneration) return;
			calculateConnections(false);
		}, 360);
	}

	// ─── Medição do layout ────────────────────────────────────────────

	interface DiagramLayout {
		columns: ColumnRect[];
		gaps: ColumnGap[];
		/** Código normalizado → card. Códigos repetidos ficam com a ocorrência mais à esquerda. */
		cards: Map<string, CardBox>;
		/** Índice da coluna → faixas verticais ocupadas pelos cards dela. */
		cardIntervalsByColumn: Map<number, Interval[]>;
		bounds: Interval;
	}

	function measureLayout(
		containerEl: HTMLElement,
		containerRect: DOMRect,
		zoom: number
	): DiagramLayout {
		const columns: ColumnRect[] = Array.from(containerEl.querySelectorAll('.semester-column'))
			.map((col) => {
				const r = col.getBoundingClientRect();
				return {
					index: 0,
					left: (r.left - containerRect.left) / zoom,
					right: (r.right - containerRect.left) / zoom,
					top: (r.top - containerRect.top) / zoom,
					bottom: (r.bottom - containerRect.top) / zoom
				};
			})
			.sort((a, b) => a.left - b.left)
			.map((col, i) => ({ ...col, index: i }));

		const cards = new Map<string, CardBox>();
		const cardIntervalsByColumn = new Map<number, Interval[]>();
		let minTop = Infinity;
		let maxBottom = -Infinity;

		for (const el of containerEl.querySelectorAll('[data-subject-code]')) {
			const code = normSubjectCode(el.getAttribute('data-subject-code') ?? '');
			if (!code) continue;
			const r = el.getBoundingClientRect();
			const left = (r.left - containerRect.left) / zoom;
			const right = (r.right - containerRect.left) / zoom;
			const top = (r.top - containerRect.top) / zoom;
			const bottom = (r.bottom - containerRect.top) / zoom;
			const column = columns.length ? findColumnIndex(columns, (left + right) / 2) : 0;

			const box: CardBox = { left, right, top, bottom, centerY: (top + bottom) / 2, column };
			// Mesma matéria em duas colunas (optativa planejada + cursada no histórico): a seta
			// liga a ocorrência mais à esquerda, mantendo a leitura da esquerda para a direita.
			const existing = cards.get(code);
			if (!existing || left < existing.left) cards.set(code, box);

			if (!cardIntervalsByColumn.has(column)) cardIntervalsByColumn.set(column, []);
			cardIntervalsByColumn.get(column)!.push([top, bottom]);
			if (top < minTop) minTop = top;
			if (bottom > maxBottom) maxBottom = bottom;
		}

		return {
			columns,
			gaps: buildGaps(columns),
			cards,
			cardIntervalsByColumn,
			bounds: Number.isFinite(minTop) ? [minTop, maxBottom] : [0, 0]
		};
	}

	// ─── Cálculo principal ────────────────────────────────────────────

	function calculateConnections(allowFollowUp = true) {
		if (!browser || !container) {
			lines = [];
			return;
		}

		const hoveredCode = store.state.hoverPreviewSubjectCode ?? store.state.hoveredSubjectCode;
		const connectionMode = store.state.connectionMode;
		const courseData = store.state.courseData;

		const clear = () => {
			lines = [];
			if (allowFollowUp) {
				followUpGeneration++;
				cancelScheduledFollowUps();
			}
		};

		if (connectionMode === 'off' || !courseData) return clear();
		if ((connectionMode === 'direct' || connectionMode === 'chain') && !hoveredCode) return clear();

		const containerRect = container.getBoundingClientRect();
		svgWidth = container.scrollWidth;
		svgHeight = container.scrollHeight;

		const zoom = store.state.zoomLevel || 1;
		const isAllMode = connectionMode === 'all';
		const layout = measureLayout(container, containerRect, zoom);

		const newLines: ConnectionLine[] = [];

		if (hoveredCode && connectionMode === 'direct') {
			// Só as liberadas DIRETAS (1 nível): uma seta foco→dependente por matéria
			// que tem o foco como pré-requisito imediato (cadeia transitiva completa
			// fica no modo "Cadeia" ou no roadmap por clique-direito/long-press).
			for (const depCode of getDirectDependentCodes(courseData, hoveredCode)) {
				const line = makeLine(layout, hoveredCode, depCode, 'dependent', false);
				if (line) {
					line.chainStroke = 'desc';
					newLines.push(line);
				}
			}
		} else if (hoveredCode && connectionMode === 'chain') {
			// Cadeia topológica completa: pré-requisitos transitivos (pra trás, até chegar no
			// foco) + desbloqueios transitivos (pra frente) + co-requisitos ligados à cadeia.
			const chain = getSubjectChain(courseData, hoveredCode);
			if (chain) {
				const S = chain.chainNodeSet;
				const M = chain.focusCode;
				const P = chain.precursors;
				const D = chain.descendants;

				for (const materia of courseData.materias) {
					const v = normSubjectCode(materia.codigoMateria);
					if (!S.has(v)) continue;
					for (const prereq of materia.preRequisitos ?? []) {
						const u = normSubjectCode(prereq.codigoMateria);
						if (!S.has(u)) continue;
						const stroke = classifyChainPrereqStroke(u, v, M, P, D);
						const line = makeLine(
							layout,
							prereq.codigoMateria,
							materia.codigoMateria,
							stroke === 'desc' ? 'dependent' : 'prerequisite',
							false
						);
						if (line) {
							line.chainStroke = stroke;
							newLines.push(line);
						}
					}
				}

				if (courseData.coRequisitos?.length) {
					const materiaMap = new Map(courseData.materias.map((m) => [m.idMateria, m]));
					const drawnPairs = new Set<string>();
					for (const coReq of courseData.coRequisitos) {
						const fromMateria = materiaMap.get(coReq.idMateria);
						if (!fromMateria) continue;
						const a = normSubjectCode(fromMateria.codigoMateria);
						const b = coReq.codigoMateriaCoRequisito
							? normSubjectCode(coReq.codigoMateriaCoRequisito)
							: '';
						if (!b || !S.has(a) || !S.has(b)) continue;
						const pairKey = [a, b].sort().join('\0');
						if (drawnPairs.has(pairKey)) continue;
						drawnPairs.add(pairKey);
						const line = makeLine(
							layout,
							fromMateria.codigoMateria,
							coReq.codigoMateriaCoRequisito,
							'corequisite',
							false
						);
						if (line) {
							line.chainStroke = 'core';
							newLines.push(line);
						}
					}
				}
			}
		} else if (isAllMode) {
			for (const materia of courseData.materias) {
				for (const prereq of materia.preRequisitos ?? []) {
					const line = makeLine(
						layout,
						prereq.codigoMateria,
						materia.codigoMateria,
						'prerequisite',
						true
					);
					if (line) newLines.push(line);
				}
			}

			if (courseData.coRequisitos) {
				const materiaMap = new Map(courseData.materias.map((m) => [m.idMateria, m]));
				const drawnPairs = new Set<string>();
				for (const coReq of courseData.coRequisitos) {
					const fromMateria = materiaMap.get(coReq.idMateria);
					if (!fromMateria) continue;
					const pairKey = [fromMateria.codigoMateria, coReq.codigoMateriaCoRequisito]
						.sort()
						.join('-');
					if (drawnPairs.has(pairKey)) continue;
					drawnPairs.add(pairKey);
					const line = makeLine(
						layout,
						fromMateria.codigoMateria,
						coReq.codigoMateriaCoRequisito,
						'corequisite',
						true
					);
					if (line) newLines.push(line);
				}
			}

			// Arestas que pulam colunas nunca vão em linha reta por cima dos cards do meio:
			// atravessam por uma faixa livre. Só no modo "Todas" — os vãos largos entre colunas
			// existem justamente para abrir esses corredores. Diretas e Cadeia usam o arco
			// simples (mesmo desenho de sempre): são setas de hover, transitórias, e cruzar
			// perto de um card no meio de uma cadeia longa é aceitável nesse contexto.
			assignFarRouting(newLines, layout);
		}

		assignSameColumnBulges(newLines);
		lines = newLines;

		// Compute per-semester connection density and push to store
		if (isAllMode) {
			computeAndSetDensity(newLines);
			if (allowFollowUp) {
				scheduleFollowUpsAfterDensity();
			}
		} else {
			store.setConnectionDensity(new Map());
			if (allowFollowUp) {
				followUpGeneration++;
				cancelScheduledFollowUps();
			}
		}
	}

	function makeLine(
		layout: DiagramLayout,
		fromCode: string,
		toCode: string,
		type: 'prerequisite' | 'dependent' | 'corequisite',
		isAllMode: boolean
	): ConnectionLine | null {
		const from = normSubjectCode(fromCode);
		const to = normSubjectCode(toCode);
		if (!from || !to || from === to) return null;

		const fromCard = layout.cards.get(from);
		const toCard = layout.cards.get(to);
		if (!fromCard || !toCard) return null;

		return {
			...resolveEdgeGeometry(fromCard, toCard),
			type,
			isAllMode,
			fromCode: from,
			toCode: to
		};
	}

	/**
	 * Rota das arestas que pulam colunas: faixa vertical em cada vão (saída e entrada) e
	 * travessia horizontal numa faixa livre de cards. Só usada no modo "Todas".
	 */
	function assignFarRouting(allLines: ConnectionLine[], layout: DiagramLayout) {
		const cardMargin = 10;
		const { gaps } = layout;
		if (gaps.length === 0) return;

		const far: { line: ConnectionLine; index: number; exitGap: number; entryGap: number }[] = [];
		for (let i = 0; i < allLines.length; i++) {
			const line = allLines[i];
			if (line.shape !== 'forward-far') continue;
			const exitGap = line.sourceCol;
			const entryGap = line.targetCol - 1;
			if (exitGap < 0 || entryGap >= gaps.length || exitGap > entryGap) continue;
			far.push({ line, index: i, exitGap, entryGap });
		}
		if (far.length === 0) return;

		const byExit = new Map<number, { lineIndex: number; y1: number; y2: number }[]>();
		const byEntry = new Map<number, { lineIndex: number; y1: number; y2: number }[]>();
		for (const f of far) {
			const entry = { lineIndex: f.index, y1: f.line.y1, y2: f.line.y2 };
			if (!byExit.has(f.exitGap)) byExit.set(f.exitGap, []);
			byExit.get(f.exitGap)!.push(entry);
			if (!byEntry.has(f.entryGap)) byEntry.set(f.entryGap, []);
			byEntry.get(f.entryGap)!.push(entry);
		}

		const exitLanes = new Map<number, number>();
		for (const [gapIdx, inGap] of byExit) {
			for (const [lineIdx, x] of assignLanesForGap(inGap, gaps[gapIdx])) exitLanes.set(lineIdx, x);
		}
		const entryLanes = new Map<number, number>();
		for (const [gapIdx, inGap] of byEntry) {
			for (const [lineIdx, x] of assignLanesForGap(inGap, gaps[gapIdx])) entryLanes.set(lineIdx, x);
		}

		const transitYs = allocateTransitYs(
			far.map(
				(f): FarLineInput => ({
					lineIndex: f.index,
					sourceCol: f.line.sourceCol,
					targetCol: f.line.targetCol,
					y1: f.line.y1,
					y2: f.line.y2
				})
			),
			layout.cardIntervalsByColumn,
			layout.bounds,
			cardMargin
		);

		for (const f of far) {
			f.line.routing = {
				exitLaneX: exitLanes.get(f.index) ?? gaps[f.exitGap].centerX,
				entryLaneX: entryLanes.get(f.index) ?? gaps[f.entryGap].centerX,
				transitY: transitYs.get(f.index) ?? Math.min(f.line.y1, f.line.y2) - 30
			};
		}
	}

	/** “U”s do mesmo semestre ganham raios diferentes para não virarem uma curva só. */
	function assignSameColumnBulges(allLines: ConnectionLine[]) {
		const perColumn = new Map<number, ConnectionLine[]>();
		for (const line of allLines) {
			if (line.shape !== 'same-column') continue;
			if (!perColumn.has(line.sourceCol)) perColumn.set(line.sourceCol, []);
			perColumn.get(line.sourceCol)!.push(line);
		}
		for (const group of perColumn.values()) {
			group.sort((a, b) => Math.min(a.y1, a.y2) - Math.min(b.y1, b.y2));
			group.forEach((line, i) => {
				line.bulge = 26 + Math.min(i, 4) * 13;
			});
		}
	}

	/**
	 * Count connections per semester and push to the store.
	 * For each line, increment count for both the source and target subject's semester.
	 */
	function computeAndSetDensity(allLines: ConnectionLine[]) {
		// code → semestre exibido (optativa planejada sobrepõe nivel 0 da matriz no mapa)
		const codeToSemester = new Map<string, number>();
		const plannedSem = store.optativaPlanejadaSemestrePorCodigo;
		for (const [sem, subjects] of store.subjectsBySemester) {
			for (const s of subjects) {
				const u = s.codigoMateria.trim().toUpperCase();
				const displaySem = plannedSem.get(u) ?? sem;
				codeToSemester.set(u, displaySem);
			}
		}

		const density = new Map<number, number>();
		for (const line of allLines) {
			const fromSem = codeToSemester.get(line.fromCode);
			const toSem = codeToSemester.get(line.toCode);
			if (fromSem !== undefined) {
				density.set(fromSem, (density.get(fromSem) ?? 0) + 1);
			}
			if (toSem !== undefined) {
				density.set(toSem, (density.get(toSem) ?? 0) + 1);
			}
		}

		store.setConnectionDensity(density);
	}

	// ─── Traçado ──────────────────────────────────────────────────────

	function pathForLine(line: ConnectionLine): string {
		return line.routing ? buildRoutedPath(line, line.routing) : buildArcPath(line, line.bulge);
	}

	// ─── Helpers ──────────────────────────────────────────────────────

	function isLineRelatedToHovered(line: ConnectionLine, hoveredCode: string): boolean {
		const h = normSubjectCode(hoveredCode);
		return line.fromCode === h || line.toCode === h;
	}

	/**
	 * Cores das linhas por tema: os hex vivem em CSS custom properties
	 * (--edge-* / --chain-* em app.css; paleta do modo "todas" no bloco de estilo deste componente).
	 * Light usa tons 600 (≥ 3:1 sobre o fundo claro); .dark mantém os hex históricos.
	 */
	function getStrokeColor(type: 'prerequisite' | 'dependent' | 'corequisite'): string {
		switch (type) {
			case 'prerequisite': return 'var(--edge-prereq)';  // violeta
			case 'dependent': return 'var(--edge-dep)';        // teal
			case 'corequisite': return 'var(--edge-coreq)';    // verde
			default: return 'var(--edge-prereq)';
		}
	}

	function chainStrokeColor(st: 'pre' | 'desc' | 'core'): string {
		switch (st) {
			case 'pre':
				return 'var(--chain-pre)';
			case 'desc':
				return 'var(--chain-desc)';
			case 'core':
				return 'var(--chain-core)';
		}
	}

	/** Paleta harmônica (círculo cromático): 12 cores para pré-requisitos no modo "todas" (valores no bloco de estilo). */
	const PALETTE_PREREQ = Array.from({ length: 12 }, (_, j) => `var(--edge-p${j})`);

	// ─── Reactivity ──────────────────────────────────────────────────

	$effect(() => {
		const _hovered = store.state.hoveredSubjectCode;
		void store.state.hoverPreviewSubjectCode;
		const _mode = store.state.connectionMode;
		const _data = store.state.courseData;
		const el = container;
		const _zoom = store.state.zoomLevel;
		void store.diagramLayoutRevision;

		if (!browser) return;

		let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
		const ro =
			el &&
			new ResizeObserver(() => {
				if (resizeDebounce) clearTimeout(resizeDebounce);
				resizeDebounce = setTimeout(() => {
					resizeDebounce = null;
					calculateConnections(true);
				}, 50);
			});

		if (el && ro) ro.observe(el);

		// Dois frames: aguarda commit de layout do Svelte e primeiras transições de gap/zoom.
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				calculateConnections(true);
			});
		});

		return () => {
			ro?.disconnect();
			if (resizeDebounce) clearTimeout(resizeDebounce);
		};
	});
</script>

{#if lines.length > 0}
	<svg
		class="pointer-events-none absolute left-0 top-0"
		width={svgWidth}
		height={svgHeight}
		style="z-index: 5;"
	>
		<defs>
			<!-- Marcadores por tipo (modo diretas) -->
			<marker
				id="arrow-prereq"
				markerUnits="userSpaceOnUse"
				markerWidth="10"
				markerHeight="8"
				refX="9"
				refY="4"
				orient="auto"
			>
				<polygon points="0 0, 9 4, 0 8" style="fill: var(--edge-prereq);" />
			</marker>
			<marker
				id="arrow-dep"
				markerUnits="userSpaceOnUse"
				markerWidth="10"
				markerHeight="8"
				refX="9"
				refY="4"
				orient="auto"
			>
				<polygon points="0 0, 9 4, 0 8" style="fill: var(--edge-dep);" />
			</marker>
			<marker
				id="arrow-coreq"
				markerUnits="userSpaceOnUse"
				markerWidth="10"
				markerHeight="8"
				refX="9"
				refY="4"
				orient="auto"
			>
				<polygon points="0 0, 9 4, 0 8" style="fill: var(--edge-coreq);" />
			</marker>
			<!-- Modo diretas: liberadas diretas no hover (cores alinhadas ao painel de referência) -->
			<marker
				id="arrow-chain-pre"
				markerUnits="userSpaceOnUse"
				markerWidth="10"
				markerHeight="8"
				refX="9"
				refY="4"
				orient="auto"
			>
				<polygon points="0 0, 9 4, 0 8" style="fill: var(--chain-pre);" />
			</marker>
			<marker
				id="arrow-chain-desc"
				markerUnits="userSpaceOnUse"
				markerWidth="10"
				markerHeight="8"
				refX="9"
				refY="4"
				orient="auto"
			>
				<polygon points="0 0, 9 4, 0 8" style="fill: var(--chain-desc);" />
			</marker>
			<marker
				id="arrow-chain-core"
				markerUnits="userSpaceOnUse"
				markerWidth="10"
				markerHeight="8"
				refX="9"
				refY="4"
				orient="auto"
			>
				<polygon points="0 0, 9 4, 0 8" style="fill: var(--chain-core);" />
			</marker>
			<!-- Paleta para pré-requisitos (modo "todas") — uma cor por seta -->
			{#each PALETTE_PREREQ as paletteColor, j}
				<marker
					id="arrow-palette-{j}"
					markerUnits="userSpaceOnUse"
					markerWidth="10"
					markerHeight="8"
					refX="9"
					refY="4"
					orient="auto"
				>
					<polygon
						points="0 0, 9 4, 0 8"
						style:fill={paletteColor}
						style:fill-opacity="var(--edge-alpha-all)"
					/>
				</marker>
			{/each}
		</defs>

		{#each lines as line, i}
			{@const hoveredCode =
				store.state.hoverPreviewSubjectCode ?? store.state.hoveredSubjectCode}
			{@const isAllMode = store.state.connectionMode === 'all'}
			{@const isDirectChain = !isAllMode && line.chainStroke}
			{@const isAllWithHover = isAllMode && !!hoveredCode}
			{@const isRelated = isAllWithHover && isLineRelatedToHovered(line, hoveredCode)}
			{@const isDimmed = isAllWithHover && !isRelated}
			{@const strokeColor = isDirectChain && line.chainStroke
				? chainStrokeColor(line.chainStroke)
				: isAllMode && line.type === 'prerequisite'
					? PALETTE_PREREQ[i % PALETTE_PREREQ.length]
					: getStrokeColor(line.type)}
			{@const markerUrl = isDirectChain && line.chainStroke
				? line.chainStroke === 'pre'
					? 'url(#arrow-chain-pre)'
					: line.chainStroke === 'desc'
						? 'url(#arrow-chain-desc)'
						: 'url(#arrow-chain-core)'
				: isAllMode && line.type === 'prerequisite'
					? `url(#arrow-palette-${i % PALETTE_PREREQ.length})`
					: line.type === 'prerequisite'
						? 'url(#arrow-prereq)'
						: line.type === 'dependent'
							? 'url(#arrow-dep)'
							: 'url(#arrow-coreq)'}
			<path
				d={pathForLine(line)}
				fill="none"
				style:stroke={strokeColor}
				stroke-width={isRelated ? '3' : isAllMode ? '2.5' : '2'}
				style:stroke-opacity={isDimmed ? '0.2' : isAllMode ? 'var(--edge-alpha-all)' : '0.85'}
				stroke-dasharray={line.type === 'corequisite' ? '8,5' : 'none'}
				marker-end={markerUrl}
				style="transition: stroke-opacity 0.2s ease, stroke-width 0.2s ease;"
			/>
		{/each}
	</svg>
{/if}

<style>
	/*
	 * Paleta do modo "todas" (uma cor por seta). Light: tons 600/700 da mesma matiz,
	 * todos ≥ 3:1 sobre #faf9fe; opacidade um pouco maior porque o fundo é claro.
	 */
	svg {
		--edge-alpha-all: 0.62;
		--edge-p0: #7c3aed; /* violeta */
		--edge-p1: #0284c7; /* azul */
		--edge-p2: #0d9488; /* teal */
		--edge-p3: #059669; /* esmeralda */
		--edge-p4: #4d7c0f; /* lima */
		--edge-p5: #a16207; /* amarelo */
		--edge-p6: #ea580c; /* laranja */
		--edge-p7: #dc2626; /* vermelho */
		--edge-p8: #db2777; /* rosa */
		--edge-p9: #9333ea; /* violeta claro */
		--edge-p10: #4f46e5; /* índigo */
		--edge-p11: #0e7490; /* ciano */
	}

	/* Dark: paleta e opacidade históricas, verbatim */
	:global(.dark) svg {
		--edge-alpha-all: 0.5;
		--edge-p0: #a78bfa;
		--edge-p1: #38bdf8;
		--edge-p2: #2dd4bf;
		--edge-p3: #34d399;
		--edge-p4: #a3e635;
		--edge-p5: #facc15;
		--edge-p6: #fb923c;
		--edge-p7: #f87171;
		--edge-p8: #f472b6;
		--edge-p9: #c084fc;
		--edge-p10: #818cf8;
		--edge-p11: #22d3ee;
	}
</style>
