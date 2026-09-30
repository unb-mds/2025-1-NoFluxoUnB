/**
 * Cores do SubjectCard e das etiquetas que ele renderiza, num só lugar para os
 * testes de contraste (subject-card-colors.test.ts) medirem o que vai para a tela.
 *
 * Tudo sai de tokens do design system (app.css, `:root` = claro e `.dark` =
 * escuro; utilitários registrados no tailwind.config.ts). `token` é o nome da
 * variável CSS — o teste lê o valor dela em cada tema — e `className` precisa
 * ser o literal completo (Tailwind só gera o que acha no fonte). Fundos opacos
 * de propósito: com `/72` o badge de pré-requisito misturava com o card e caía
 * para ~2.5:1 (pré-mortem R28).
 */
import {
	SubjectStatusEnum,
	getStatusLabel,
	type SubjectStatusValue
} from '$lib/types/materia';

/** Cor de fundo sólida + cor do texto por cima, ambas como tokens. */
export interface TokenPair {
	/** Variável CSS do fundo (sem `--`). */
	bg: string;
	/** Variável CSS do texto (sem `--`). */
	fg: string;
	className: string;
}

export interface StatusCardColors extends TokenPair {
	/** Opacidade aplicada ao texto (bloqueado/não iniciado fica mais apagado). */
	textAlpha: number;
	/** Classe do texto principal (já com a opacidade de `textAlpha`). */
	textClass: string;
	/** Opacidade do texto secundário ("libera N"). */
	textSoftAlpha: number;
	/** Classe do texto secundário (já com `textSoftAlpha`). */
	textSoftClass: string;
	/** Variável CSS da borda em repouso; `null` = filete branco translúcido sobre fundo saturado. */
	border: string | null;
	borderClass: string;
}

const SOLID_TEXT = {
	fg: 'status-on-solid',
	textAlpha: 1,
	textClass: 'text-status-on-solid',
	// Opaco: branco a 75% caía para ~3.5:1 no Aprovado e no Disponível.
	textSoftAlpha: 1,
	textSoftClass: 'text-status-on-solid',
	border: null,
	borderClass: 'border-white/10'
} as const;

const LOCKED: StatusCardColors = {
	bg: 'status-locked',
	fg: 'status-locked-foreground',
	className: 'bg-status-locked',
	textAlpha: 0.8,
	textClass: 'text-status-locked-foreground/80',
	textSoftAlpha: 0.75,
	textSoftClass: 'text-status-locked-foreground/75',
	border: 'status-locked-border',
	borderClass: 'border-status-locked-border'
};

/** Fundo, texto e borda do card por status. */
export const STATUS_CARD: Record<SubjectStatusValue, StatusCardColors> = {
	[SubjectStatusEnum.COMPLETED]: { ...SOLID_TEXT, bg: 'status-completed', className: 'bg-status-completed' },
	[SubjectStatusEnum.IN_PROGRESS]: { ...SOLID_TEXT, bg: 'status-in-progress', className: 'bg-status-in-progress' },
	[SubjectStatusEnum.AVAILABLE]: { ...SOLID_TEXT, bg: 'status-available', className: 'bg-status-available' },
	[SubjectStatusEnum.FAILED]: { ...SOLID_TEXT, bg: 'status-failed', className: 'bg-status-failed' },
	[SubjectStatusEnum.LOCKED]: LOCKED,
	[SubjectStatusEnum.NOT_STARTED]: LOCKED
};

/** Opacidade do texto do card: bloqueado/não iniciado fica mais apagado. */
export function statusTextAlpha(status: SubjectStatusValue): number {
	return STATUS_CARD[status].textAlpha;
}

/** Chip de créditos: `bg-black/25` sobre o card, texto com `opacity-90`. */
export const CREDIT_CHIP = { overlayAlpha: 0.25, textOpacity: 0.9 } as const;

/** Badge de pré-requisito (canto inferior esquerdo). */
export const PREREQ_BADGE: Record<'ok' | 'pending', TokenPair> = {
	ok: {
		bg: 'status-prereq-ok',
		fg: 'status-on-solid',
		className: 'bg-status-prereq-ok text-status-on-solid'
	},
	pending: {
		bg: 'status-prereq-pending',
		fg: 'status-on-solid',
		className: 'bg-status-prereq-pending text-status-on-solid'
	}
};

/** Etiquetas de conquista/natureza (canto inferior direito). */
export const TAG_BADGE: Record<
	'equivalencia' | 'aproveitamento' | 'optativa' | 'optatoria' | 'modulo_livre',
	TokenPair
> = {
	equivalencia: {
		bg: 'tag-equivalencia',
		fg: 'tag-equivalencia-foreground',
		className: 'bg-tag-equivalencia text-tag-equivalencia-foreground'
	},
	/** Claro com texto escuro: o verde sumia sobre o card verde de Aprovado. */
	aproveitamento: {
		bg: 'tag-aproveitamento',
		fg: 'tag-aproveitamento-foreground',
		className: 'bg-tag-aproveitamento text-tag-aproveitamento-foreground'
	},
	optativa: {
		bg: 'tag-optativa',
		fg: 'tag-optativa-foreground',
		className: 'bg-tag-optativa text-tag-optativa-foreground'
	},
	optatoria: {
		bg: 'tag-optatoria',
		fg: 'tag-optatoria-foreground',
		className: 'bg-tag-optatoria text-tag-optatoria-foreground'
	},
	modulo_livre: {
		bg: 'tag-modulo-livre',
		fg: 'tag-modulo-livre-foreground',
		className: 'bg-tag-modulo-livre text-tag-modulo-livre-foreground'
	}
};

/**
 * Contornos de destaque do card. Ficam na borda, encostados no fundo da página,
 * então o teste exige >= 3:1 (elemento gráfico) contra o fundo real da página
 * (`--page-background` do PageBackground) nos dois temas.
 */
export interface OutlineColors {
	/** Variável CSS da cor do contorno. */
	token: string;
	/** Opacidade da borda (`border-x/80` → 0.8). */
	borderAlpha: number;
	className: string;
}

export const CARD_OUTLINE: Record<
	'selected' | 'failedHighlight' | 'focus' | 'precursor' | 'descendant' | 'corequisite',
	OutlineColors
> = {
	// Token no claro; no escuro (produção) o `dark:` repõe exatamente o contorno
	// da main (branco a 60%/30% no selecionado, red-300/85 + anel red-400/45 no
	// reprovado em destaque).
	selected: {
		token: 'foreground',
		borderAlpha: 0.65,
		className: 'border-foreground/65 ring-2 ring-foreground/30 dark:border-white/60 dark:ring-white/30'
	},
	failedHighlight: {
		token: 'status-failed-ring',
		borderAlpha: 0.85,
		className:
			'border-status-failed-ring/85 ring-2 ring-status-failed-ring/45 shadow-md shadow-red-700/20 dark:border-red-300/85 dark:ring-red-400/45'
	},
	// Alinhadas a CHAIN_VISUAL (mesma família de cor nas linhas de conexão).
	focus: {
		token: 'chain-focus',
		borderAlpha: 0.8,
		className: 'border-chain-focus/80 ring-2 ring-chain-focus/35 shadow-md'
	},
	precursor: {
		token: 'chain-precursor',
		borderAlpha: 0.8,
		className: 'border-chain-precursor/80 ring-2 ring-chain-precursor/35 shadow-md'
	},
	descendant: {
		token: 'chain-descendant',
		borderAlpha: 0.8,
		className: 'border-chain-descendant/80 ring-2 ring-chain-descendant/35 shadow-md'
	},
	corequisite: {
		token: 'chain-focus',
		borderAlpha: 0.8,
		className: 'border-chain-focus/80 ring-2 ring-chain-focus/32 shadow-md'
	}
};

export interface SubjectCardA11yInput {
	codigo: string;
	nome: string;
	creditos: number;
	status: SubjectStatusValue;
	/** undefined = badge de pré-requisito não aparece (sem pré-req ou visitante). */
	prereqsCompleted?: boolean;
	/** Etiquetas visíveis no card (ex.: "optativa", "concluída por equivalência"). */
	etiquetas?: string[];
}

/**
 * Nome acessível do card. Sem ele o leitor de tela anunciava só código, nome e
 * "Ncr" — o status existia apenas como cor de fundo.
 */
export function subjectCardAriaLabel(p: SubjectCardA11yInput): string {
	const partes = [`${p.codigo} ${p.nome}`, `${p.creditos} créditos`, getStatusLabel(p.status)];
	if (p.prereqsCompleted !== undefined) {
		partes.push(p.prereqsCompleted ? 'pré-requisitos cumpridos' : 'pré-requisitos pendentes');
	}
	for (const e of p.etiquetas ?? []) partes.push(e);
	return partes.join(', ');
}
