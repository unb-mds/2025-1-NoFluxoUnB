<script lang="ts">
	import { browser } from '$app/environment';
	import type { Snippet } from 'svelte';
	import type { CursoModel } from '$lib/types/curso';
	import type { PlanoFormatura } from '$lib/types/plano-formatura';
	import { getDirectPrerequisites } from '$lib/types/curso';

	export interface Props {
		plano: PlanoFormatura;
		curso: CursoModel | null;
		hoveredCode?: string | null;
		children?: Snippet;
	}

	let { plano, curso, hoveredCode, children }: Props = $props();

	interface ConnectionLine {
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		fromCode: string;
		toCode: string;
		sameColumnStack?: boolean;
		routing?: RoutingInfo;
	}

	interface RoutingInfo {
		exitLaneX: number;
		entryLaneX: number;
		transitY: number;
		isAdjacent: boolean;
	}

	interface ColumnGap {
		index: number;
		leftX: number;
		rightX: number;
		centerX: number;
		width: number;
	}

	interface ColumnRect {
		index: number;
		left: number;
		right: number;
	}

	let scrollContainer: HTMLElement | null = $state(null);
	let contentWrapper: HTMLElement | null = $state(null);
	let svgWidth = $state(0);
	let svgHeight = $state(0);
	let lines = $state<ConnectionLine[]>([]);
	let resizeObserver: ResizeObserver | null = null;

	const SAME_COLUMN_DX_PX = 42;
	const LANE_PADDING = 6;
	const TRANSIT_Y_PADDING = 8;

	function normalizeCode(code: string): string {
		return code?.trim().toUpperCase() ?? '';
	}

	function findCardBySubjectCode(containerEl: HTMLElement, code: string): HTMLElement | null {
		const needle = normalizeCode(code);
		if (!needle) return null;
		for (const el of containerEl.querySelectorAll('[data-subject-code]')) {
			const attr = el.getAttribute('data-subject-code');
			if (attr != null && normalizeCode(attr) === needle) return el as HTMLElement;
		}
		return null;
	}

	function collectColumns(containerEl: HTMLElement, containerRect: DOMRect, scrollLeft: number) {
		const cols = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-semester-column]'));
		const rects: ColumnRect[] = cols
			.map((col, i) => {
				const r = col.getBoundingClientRect();
				return {
					index: i,
					left: r.left - containerRect.left + scrollLeft,
					right: r.right - containerRect.left + scrollLeft
				};
			})
			.sort((a, b) => a.left - b.left);

		const gaps: ColumnGap[] = [];
		for (let i = 0; i < rects.length - 1; i++) {
			const leftX = rects[i].right;
			const rightX = rects[i + 1].left;
			gaps.push({
				index: i,
				leftX,
				rightX,
				centerX: (leftX + rightX) / 2,
				width: Math.max(rightX - leftX, 0)
			});
		}

		return { rects, gaps };
	}

	function findColumnIndex(rects: ColumnRect[], cardCenterX: number): number {
		for (let i = 0; i < rects.length; i++) {
			if (cardCenterX >= rects[i].left && cardCenterX <= rects[i].right) return i;
		}
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < rects.length; i++) {
			const center = (rects[i].left + rects[i].right) / 2;
			const dist = Math.abs(cardCenterX - center);
			if (dist < bestDist) {
				bestDist = dist;
				best = i;
			}
		}
		return best;
	}

	function assignLanesForGap(
		linesInGap: { lineIndex: number; y1: number; y2: number }[],
		gap: ColumnGap
	): Map<number, number> {
		const result = new Map<number, number>();
		if (linesInGap.length === 0) return result;

		const sorted = [...linesInGap].sort((a, b) => {
			const midA = (a.y1 + a.y2) / 2;
			const midB = (b.y1 + b.y2) / 2;
			return midA - midB;
		});

		const usableWidth = Math.max(gap.width - LANE_PADDING * 2, 0);
		const count = sorted.length;

		if (count === 1) {
			result.set(sorted[0].lineIndex, gap.centerX);
		} else {
			const spacing = Math.max(usableWidth / (count - 1), LANE_PADDING);
			const startX = gap.centerX - (spacing * (count - 1)) / 2;
			for (let i = 0; i < count; i++) {
				result.set(sorted[i].lineIndex, startX + spacing * i);
			}
		}

		return result;
	}

	function assignRouting(
		allLines: ConnectionLine[],
		rects: ColumnRect[],
		gaps: ColumnGap[]
	) {
		if (gaps.length === 0) return;

		const lineColData = new Map<number, { sourceCol: number; targetCol: number }>();
		for (let i = 0; i < allLines.length; i++) {
			const line = allLines[i];
			const sourceCol = findColumnIndex(rects, line.x1 - 10);
			const targetCol = findColumnIndex(rects, line.x2 + 10);
			const sCol = Math.min(sourceCol, targetCol);
			const tCol = Math.max(sourceCol, targetCol);
			lineColData.set(i, { sourceCol: sCol, targetCol: tCol });
		}

		const exitGapLines = new Map<number, { lineIndex: number; y1: number; y2: number }[]>();
		const entryGapLines = new Map<number, { lineIndex: number; y1: number; y2: number }[]>();

		for (const [lineIdx, data] of lineColData) {
			const line = allLines[lineIdx];
			const exitGapIdx = Math.min(data.sourceCol, gaps.length - 1);
			let entryGapIdx = Math.min(data.targetCol - 1, gaps.length - 1);
			if (data.sourceCol === data.targetCol || entryGapIdx < 0) {
				entryGapIdx = exitGapIdx;
			}
			if (exitGapIdx < 0 || entryGapIdx < 0) continue;

			if (data.targetCol - data.sourceCol <= 1) {
				if (!exitGapLines.has(exitGapIdx)) exitGapLines.set(exitGapIdx, []);
				exitGapLines.get(exitGapIdx)!.push({ lineIndex: lineIdx, y1: line.y1, y2: line.y2 });
			} else {
				if (!exitGapLines.has(exitGapIdx)) exitGapLines.set(exitGapIdx, []);
				exitGapLines.get(exitGapIdx)!.push({ lineIndex: lineIdx, y1: line.y1, y2: line.y2 });
				if (!entryGapLines.has(entryGapIdx)) entryGapLines.set(entryGapIdx, []);
				entryGapLines.get(entryGapIdx)!.push({ lineIndex: lineIdx, y1: line.y1, y2: line.y2 });
			}
		}

		const exitLanes = new Map<number, number>();
		const entryLanes = new Map<number, number>();

		for (const [gapIdx, linesInGap] of exitGapLines) {
			if (gapIdx >= gaps.length) continue;
			const lanes = assignLanesForGap(linesInGap, gaps[gapIdx]);
			for (const [lineIdx, laneX] of lanes) exitLanes.set(lineIdx, laneX);
		}
		for (const [gapIdx, linesInGap] of entryGapLines) {
			if (gapIdx >= gaps.length) continue;
			const lanes = assignLanesForGap(linesInGap, gaps[gapIdx]);
			for (const [lineIdx, laneX] of lanes) entryLanes.set(lineIdx, laneX);
		}

		// Transit Y for non-adjacent lines
		const transitYValues = new Map<number, number>();
		const corridors = new Map<string, { lineIndex: number; y1: number; y2: number }[]>();
		for (const [lineIdx, data] of lineColData) {
			if (data.targetCol - data.sourceCol <= 1) continue;
			const line = allLines[lineIdx];
			const key = `${data.sourceCol}-${data.targetCol}`;
			if (!corridors.has(key)) corridors.set(key, []);
			corridors.get(key)!.push({ lineIndex: lineIdx, y1: line.y1, y2: line.y2 });
		}
		for (const [, linesInCorridor] of corridors) {
			const sorted = [...linesInCorridor].sort((a, b) => {
				const avgA = (a.y1 + a.y2) / 2;
				const avgB = (b.y1 + b.y2) / 2;
				return avgA - avgB;
			});
			const allY = sorted.flatMap((l) => [l.y1, l.y2]);
			const minY = Math.min(...allY);
			const baseTransitY = minY - 30;
			for (let i = 0; i < sorted.length; i++) {
				transitYValues.set(sorted[i].lineIndex, baseTransitY - i * TRANSIT_Y_PADDING);
			}
		}

		for (const [lineIdx, data] of lineColData) {
			const line = allLines[lineIdx];
			const exitGapIdx = Math.min(data.sourceCol, gaps.length - 1);
			let entryGapIdx = Math.min(data.targetCol - 1, gaps.length - 1);
			if (data.sourceCol === data.targetCol || entryGapIdx < 0) {
				entryGapIdx = exitGapIdx;
			}
			const isAdjacent = data.targetCol - data.sourceCol <= 1;
			if (exitGapIdx < 0 || entryGapIdx < 0) continue;

			const exitLaneX = exitLanes.get(lineIdx) ?? gaps[exitGapIdx]?.centerX ?? (line.x1 + line.x2) / 2;
			const entryLaneX = isAdjacent
				? exitLaneX
				: (entryLanes.get(lineIdx) ?? gaps[entryGapIdx]?.centerX ?? (line.x1 + line.x2) / 2);
			const transitY = transitYValues.get(lineIdx) ?? Math.min(line.y1, line.y2) - 30;

			line.routing = { exitLaneX, entryLaneX, transitY, isAdjacent };
		}
	}

	/** "U-bend" suave à direita dos cards usando uma única cúbica. */
	function buildSameColumnStackPath(x1: number, y1: number, x2: number, y2: number): string {
		const outward = 40;
		const midX = Math.max(x1, x2) + outward;
		return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
	}

	/**
	 * Arco fluido + entrada horizontal visível antes da seta.
	 * Estrutura: C midX,(y1+swing)  midX,y2  bx2,y2 → L x2,y2
	 *
	 * cp1.x = cp2.x = midX → sem self-intersection.
	 * cp1.y = y1 + sgnY·swing → saída diagonal; distribui a mudança de direção
	 *   ao longo de todo o arco, evitando o "S abrupto" em conexões íngremes.
	 * cp2.y = y2 → chegada horizontal em bx2, sem kink com o segmento L.
	 * L x2 y2 → 36 px retos garantem que a seta aponte sempre →.
	 */
	function buildCurve(x1: number, y1: number, x2: number, y2: number): string {
		const HORIZ_ENTRY = 36;
		const adxFull = x2 - x1;
		const safeHoriz = Math.max(8, Math.min(HORIZ_ENTRY, adxFull * 0.45));
		const bx2 = x2 - safeHoriz;
		const ady = Math.abs(y2 - y1);
		const sgnY = y2 >= y1 ? 1 : -1;
		const midX = (x1 + bx2) / 2;
		// Swing vertical: cp1 sai em diagonal → arco fluido para conexões íngremes
		const vertSwing = ady * 0.35;
		return `M ${x1} ${y1} C ${midX} ${y1 + sgnY * vertSwing}, ${midX} ${y2}, ${bx2} ${y2} L ${x2} ${y2}`;
	}

	function pathForLine(line: ConnectionLine): string {
		if (line.sameColumnStack) {
			return buildSameColumnStackPath(line.x1, line.y1, line.x2, line.y2);
		}
		return buildCurve(line.x1, line.y1, line.x2, line.y2);
	}

	function updateLines() {
		if (!browser || !scrollContainer || !contentWrapper || !curso || !plano?.plano?.length) {
			lines = [];
			return;
		}

		const containerRect = scrollContainer.getBoundingClientRect();
		const scrollLeft = scrollContainer.scrollLeft;
		const scrollTop = scrollContainer.scrollTop;

		const width = Math.max(contentWrapper.scrollWidth, contentWrapper.clientWidth);
		const height = Math.max(contentWrapper.scrollHeight, contentWrapper.clientHeight);
		svgWidth = width;
		svgHeight = height;

		// Sem hover, nada a desenhar
		if (!hoveredCode) {
			lines = [];
			return;
		}

		const hovered = normalizeCode(hoveredCode);
		const newLines: ConnectionLine[] = [];
		const seen = new Set<string>();

		const collectPair = (sourceCode: string, targetCode: string) => {
			const sNorm = normalizeCode(sourceCode);
			const tNorm = normalizeCode(targetCode);
			const key = `${sNorm}->${tNorm}`;
			if (seen.has(key)) return;

			const sourceEl = findCardBySubjectCode(contentWrapper!, sourceCode);
			const targetEl = findCardBySubjectCode(contentWrapper!, targetCode);
			if (!sourceEl || !targetEl) return;

			seen.add(key);

			const sourceRect = sourceEl.getBoundingClientRect();
			const targetRect = targetEl.getBoundingClientRect();

			const x1 = sourceRect.right - containerRect.left + scrollLeft;
			const y1 = sourceRect.top - containerRect.top + scrollTop + sourceRect.height / 2;
			const x2 = targetRect.left - containerRect.left + scrollLeft;
			const y2 = targetRect.top - containerRect.top + scrollTop + targetRect.height / 2;

			const dy = Math.abs(y2 - y1);
			// sameColumnStack só quando o alvo está à ESQUERDA ou no mesmo x do source
			// (prereq no mesmo semestre ou disposição invertida — não acontece em conexões forward normais)
			const sameColumnStack = x2 <= x1 && dy > 10;

			newLines.push({ x1, y1, x2, y2, fromCode: sNorm, toCode: tNorm, sameColumnStack });
		};

		// Pré-requisitos da matéria hovereada (entrando nela)
		const hoveredPrereqs = getDirectPrerequisites(curso, hovered);
		for (const prereq of hoveredPrereqs) {
			collectPair(prereq.codigoMateria, hovered);
		}

		// Matérias que dependem da hovereada (saindo dela)
		for (const semestre of plano.plano) {
			for (const item of semestre.materias) {
				if (!('codigo' in item)) continue;
				const code = normalizeCode(item.codigo);
				if (code === hovered) continue;
				const prereqs = getDirectPrerequisites(curso, item.codigo);
				if (prereqs.some((p) => normalizeCode(p.codigoMateria) === hovered)) {
					collectPair(hovered, item.codigo);
				}
			}
		}

		// Atribui lanes / roteamento por gap
		const { rects, gaps } = collectColumns(contentWrapper, containerRect, scrollLeft);
		assignRouting(newLines, rects, gaps);

		lines = newLines;
	}

	function scheduleUpdate() {
		if (!browser) return;
		requestAnimationFrame(() => {
			requestAnimationFrame(updateLines);
		});
	}

	$effect(() => {
		// Re-roda quando hoveredCode, plano ou curso mudam
		void hoveredCode;
		void plano;
		void curso;
		if (!browser) return;
		scheduleUpdate();
	});

	function plannerContainer(node: HTMLElement) {
		scrollContainer = node;
		if (browser) {
			resizeObserver = new ResizeObserver(scheduleUpdate);
			resizeObserver.observe(node);
			window.addEventListener('resize', scheduleUpdate);
			node.addEventListener('scroll', scheduleUpdate, { passive: true });
		}
		scheduleUpdate();
		return {
			destroy() {
				if (resizeObserver) resizeObserver.disconnect();
				if (browser) {
					window.removeEventListener('resize', scheduleUpdate);
					node.removeEventListener('scroll', scheduleUpdate);
				}
			}
		};
	}

	function plannerContent(node: HTMLElement) {
		contentWrapper = node;
		if (browser && resizeObserver) resizeObserver.observe(node);
		scheduleUpdate();
		return {
			destroy() {
				if (resizeObserver) resizeObserver.unobserve(node);
			}
		};
	}
</script>

<div class="relative flex flex-1 overflow-x-auto pb-4" use:plannerContainer>
	<div class="relative" style="width: {svgWidth}px; min-width: 100%; height: auto;">
		<svg
			class="pointer-events-none absolute left-0 top-0"
			width={svgWidth}
			height={svgHeight}
			style="z-index: 5;"
		>
			<defs>
				<marker
					id="planner-arrow-prereq"
					markerUnits="userSpaceOnUse"
					markerWidth="10"
					markerHeight="8"
					refX="9"
					refY="4"
					orient="auto"
				>
					<polygon points="0 0, 9 4, 0 8" style="fill: var(--edge-prereq);" />
				</marker>
			</defs>

			{#each lines as line (line.fromCode + '->' + line.toCode)}
				<path
					d={pathForLine(line)}
					fill="none"
					style="stroke: var(--edge-prereq); transition: stroke-opacity 0.15s;"
					stroke-width="2.5"
					stroke-opacity="0.9"
					marker-end="url(#planner-arrow-prereq)"
				/>
			{/each}
		</svg>

		<div class="relative flex gap-4" use:plannerContent>
			{@render children?.()}
		</div>
	</div>
</div>
