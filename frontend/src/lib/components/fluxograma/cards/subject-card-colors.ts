/**
 * Cores do SubjectCard e das etiquetas que ele renderiza, num só lugar para os
 * testes de contraste (subject-card-colors.test.ts) medirem o que vai para a tela.
 *
 * `className` precisa ser o literal completo (Tailwind só gera o que acha no
 * fonte); `hex` é a mesma cor, usada no cálculo WCAG. Fundos opacos de propósito:
 * com `/72` o badge de pré-requisito misturava com o card e caía para ~2.5:1
 * (pré-mortem R28).
 */
import {
	SubjectStatusEnum,
	getStatusLabel,
	type SubjectStatusValue
} from '$lib/types/materia';

export interface SolidColor {
	hex: string;
	className: string;
}

/** Fundo do card por status (texto branco por cima). */
export const STATUS_CARD_BG: Record<SubjectStatusValue, SolidColor> = {
	[SubjectStatusEnum.COMPLETED]: { hex: '#1f7a43', className: 'bg-[#1f7a43]' },
	[SubjectStatusEnum.IN_PROGRESS]: { hex: '#6b2fcf', className: 'bg-[#6b2fcf]' },
	[SubjectStatusEnum.AVAILABLE]: { hex: '#a8671a', className: 'bg-[#a8671a]' },
	[SubjectStatusEnum.FAILED]: { hex: '#991b1b', className: 'bg-[#991b1b]' },
	[SubjectStatusEnum.LOCKED]: { hex: '#161625', className: 'bg-[#161625]' },
	[SubjectStatusEnum.NOT_STARTED]: { hex: '#161625', className: 'bg-[#161625]' }
};

/** Opacidade do texto branco do card: bloqueado/não iniciado fica mais apagado. */
export function statusTextAlpha(status: SubjectStatusValue): number {
	return status === SubjectStatusEnum.LOCKED || status === SubjectStatusEnum.NOT_STARTED ? 0.8 : 1;
}

/** Chip de créditos: `bg-black/25` sobre o card, texto com `opacity-90`. */
export const CREDIT_CHIP = { overlayAlpha: 0.25, textOpacity: 0.9 } as const;

/** Badge de pré-requisito (canto inferior esquerdo), texto branco. */
export const PREREQ_BADGE: Record<'ok' | 'pending', SolidColor> = {
	ok: { hex: '#166534', className: 'bg-[#166534]' },
	pending: { hex: '#92400e', className: 'bg-[#92400e]' }
};

/** Etiquetas de conquista/natureza (canto inferior direito). */
export const TAG_BADGE: Record<
	'equivalencia' | 'optativa' | 'optatoria' | 'modulo_livre',
	SolidColor & { text: '#ffffff' | '#000000' }
> = {
	equivalencia: { hex: '#7e22ce', className: 'bg-[#7e22ce] text-white', text: '#ffffff' },
	optativa: { hex: '#1d4ed8', className: 'bg-[#1d4ed8] text-white', text: '#ffffff' },
	optatoria: { hex: '#f59e0b', className: 'bg-[#f59e0b] text-black', text: '#000000' },
	modulo_livre: { hex: '#2dd4bf', className: 'bg-[#2dd4bf] text-black', text: '#000000' }
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
