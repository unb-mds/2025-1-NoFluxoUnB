/**
 * Acessibilidade do SubjectCard (pré-mortem R28: status não só por cor).
 *
 * As cores do card agora vêm do design system da light-mode (surfaceMap em
 * SubjectCard.svelte); aqui fica só o nome acessível, que leva o status e a
 * situação dos pré-requisitos para quem usa leitor de tela.
 */
import { getStatusLabel, type SubjectStatusValue } from '$lib/types/materia';

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
