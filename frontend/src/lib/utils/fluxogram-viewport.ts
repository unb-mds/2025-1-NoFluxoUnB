/**
 * Queries canônicas do modo compacto do fluxograma — mantidas num único lugar
 * para JS (matchMedia) e store concordarem no mesmo pixel (Tailwind md = 768px,
 * então mobile é <= 767px).
 */
export const FLUXOGRAM_NARROW_QUERY = '(max-width: 767px)';
export const FLUXOGRAM_COMPACT_LANDSCAPE_QUERY =
	'(orientation: landscape) and (max-height: 560px)';

/**
 * Telas estreitas (retrato) ou celular deitado: rolagem nativa + chrome tipo mobile (FAB),
 * mesmo quando a largura passa de 767px em landscape.
 */
export function matchesFluxogramCompactTouchMode(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia(FLUXOGRAM_NARROW_QUERY).matches ||
		window.matchMedia(FLUXOGRAM_COMPACT_LANDSCAPE_QUERY).matches
	);
}

/** Passo horizontal de uma coluna no modo compacto: w-[220px] + gap 3rem (conexões 'direct'). */
export const COMPACT_COLUMN_PITCH = 220 + 48;
/** Menor corpo de texto do card em zoom 1: piso do clamp do código/nome (11px). */
export const CARD_MIN_TEXT_PX = 11;
/** Texto do card não pode ficar abaixo disso na tela (legível no celular sem pinça). */
export const MIN_READABLE_TEXT_PX = 10;
/** Menor zoom inicial no modo compacto: 10/11 ≈ 0.91. */
export const COMPACT_MIN_ZOOM = MIN_READABLE_TEXT_PX / CARD_MIN_TEXT_PX;

export interface InitialZoomInput {
	/** Modo compacto (celular retrato ou deitado) — ver matchesFluxogramCompactTouchMode. */
	compact: boolean;
	clientWidth: number;
	clientHeight: number;
	/** Altura natural (zoom 1) do conteúdo do diagrama; só usada no desktop. */
	naturalH: number;
}

/**
 * Zoom inicial do fluxograma. Desktop: a coluna mais alta cabe inteira na vertical
 * (teto 1.0 — o eixo de navegação é o horizontal). Compacto: tenta caber 2 colunas
 * na largura, mas nunca abaixo de COMPACT_MIN_ZOOM — antes o piso era 0.5 e num
 * celular de 375px o zoom ficava em ~0.64, com código e nome do card em 7–8px
 * (pré-mortem R29). Retorna null quando ainda não há altura para medir.
 */
export function computeInitialZoom({
	compact,
	clientWidth,
	clientHeight,
	naturalH
}: InitialZoomInput): number | null {
	if (compact) {
		return Math.min(1.0, Math.max(COMPACT_MIN_ZOOM, clientWidth / (2 * COMPACT_COLUMN_PITCH)));
	}
	if (naturalH <= 0) return null;
	return Math.min(1.0, clientHeight / naturalH);
}

/**
 * Semestre (nível da matriz) em que o diagrama deve abrir: o primeiro com alguma
 * matéria ainda não concluída — é onde está o que o aluno precisa cursar agora.
 * Colunas vazias são ignoradas; null quando tudo já foi concluído.
 */
export function findFirstPendingSemester(
	columns: ReadonlyArray<{ semester: number; completed: ReadonlyArray<boolean> }>
): number | null {
	// Nível 0 é o pool de optativas: não vira coluna no FluxogramContainer
	// (sortedSemesters filtra k > 0) e quase sempre tem pendência — se entrasse
	// aqui, o Math.min sempre daria 0 e o alvo nunca seria encontrado.
	const pendentes = columns
		.filter((c) => c.semester > 0 && c.completed.some((done) => !done))
		.map((c) => c.semester);
	return pendentes.length > 0 ? Math.min(...pendentes) : null;
}

export interface InitialFocusInput {
	/** Modo compacto (celular retrato ou deitado) — ver matchesFluxogramCompactTouchMode. */
	compact: boolean;
	/** Semestre atual declarado no fluxograma do aluno (ausente para anônimo). */
	semestreAtual: number | null | undefined;
	/** Colunas renderizadas, com o estado de conclusão de cada matéria. */
	columns: ReadonlyArray<{ semester: number; completed: ReadonlyArray<boolean> }>;
}

/**
 * Decide em qual coluna o fluxograma abre — ÚNICA regra de posicionamento
 * inicial (usada por centerFluxogramaViewport nas duas páginas do fluxograma).
 * Retorna o semestre-alvo, ou null para abrir na primeira coluna.
 *
 * - Desktop: null (primeira coluna; o zoom inicial já cabe várias colunas).
 * - Compacto: o semestre atual do aluno, se existir coluna para ele — a pergunta
 *   nº 1 no celular é "onde estou agora?"; sem ele (anônimo, dado ausente ou
 *   semestre fora da matriz), o primeiro nível com matéria pendente (R29).
 */
export function pickInitialFocusSemester({
	compact,
	semestreAtual,
	columns
}: InitialFocusInput): number | null {
	if (!compact) return null;
	if (semestreAtual && columns.some((c) => c.semester === semestreAtual)) return semestreAtual;
	return findFirstPendingSemester(columns);
}
