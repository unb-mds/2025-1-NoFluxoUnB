import { SubjectStatusEnum, type MateriaModel } from '$lib/types/materia';
import { matchesFluxogramCompactTouchMode, pickInitialFocusSemester } from './fluxogram-viewport';

/** O que o posicionamento inicial precisa do fluxogramaStore. */
export interface FluxogramFocusSource {
	readonly userFluxograma: { semestreAtual?: number | null } | null | undefined;
	readonly subjectsBySemester: ReadonlyMap<number, MateriaModel[]>;
	getSubjectStatus(materia: MateriaModel): string;
}

/**
 * Rola o diagrama até a coluna escolhida por pickInitialFocusSemester (ou a
 * primeira coluna). Único mecanismo de posicionamento inicial do fluxograma —
 * FluxogramContainer só aplica o zoom inicial, não rola.
 */
export function centerFluxogramaViewport(
	viewport: HTMLElement | null | undefined,
	source: FluxogramFocusSource
): void {
	if (!viewport) return;
	const scrollRoot = viewport.querySelector<HTMLElement>('[data-fluxogram-scroll-root]');
	if (!scrollRoot) return;
	const columns = [...scrollRoot.querySelectorAll<HTMLElement>('.semester-column')];
	if (columns.length === 0) {
		scrollRoot.scrollLeft = 0;
		return;
	}
	const margemEsquerda = Math.max(16, Math.round(scrollRoot.clientWidth * 0.08));
	const semestreAlvo = pickInitialFocusSemester({
		compact: matchesFluxogramCompactTouchMode(),
		semestreAtual: source.userFluxograma?.semestreAtual,
		columns: [...source.subjectsBySemester.entries()].map(([semester, materias]) => ({
			semester,
			completed: materias.map(
				(m) => source.getSubjectStatus(m) === SubjectStatusEnum.COMPLETED
			)
		}))
	});
	let alvo: HTMLElement | null = null;
	if (semestreAlvo != null) {
		alvo = scrollRoot.querySelector<HTMLElement>(`[data-semester="${semestreAlvo}"]`);
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

/**
 * Reaplica o posicionamento em rAF, 220ms e 520ms (layout/zoom inicial ainda
 * assentando). Devolve a função de cancelamento.
 */
export function scheduleCenterFluxogramaViewport(
	getViewport: () => HTMLElement | null | undefined,
	source: FluxogramFocusSource
): () => void {
	let cancelled = false;
	const timers: ReturnType<typeof setTimeout>[] = [];
	const run = () => {
		if (cancelled) return;
		centerFluxogramaViewport(getViewport(), source);
	};
	requestAnimationFrame(run);
	timers.push(setTimeout(run, 220));
	timers.push(setTimeout(run, 520));
	return () => {
		cancelled = true;
		for (const t of timers) clearTimeout(t);
	};
}
