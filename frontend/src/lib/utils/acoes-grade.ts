/**
 * Texto do card de mudanças que a Darcy propõe na grade (`acoesGrade`): uma
 * linha por ação, com o sinal do diff (+ / − / ↔ …) e o horário legível.
 */
import type { AcaoGradeChat } from '$lib/types/plano-formatura';
import { horarioLegivel } from './sigaa';

export type SinalAcao = 'mais' | 'menos' | 'troca' | 'estrela' | 'turno' | 'cenario' | 'limpar';

export interface LinhaAcao {
	sinal: SinalAcao;
	texto: string;
	/** Turma + horário, quando a ação escolhe turma. */
	detalhe?: string;
	/** Ação que apaga coisa — o card pede atenção. */
	destrutiva?: boolean;
}

const NOME_TURNO = { M: 'manhã', T: 'tarde', N: 'noite' } as const;

function detalheTurma(turma?: string, horario?: string | null): string | undefined {
	if (!turma && !horario) return undefined;
	const partes = [turma ? `Turma ${turma}` : '', horario ? horarioLegivel(horario) : ''];
	return partes.filter(Boolean).join(' · ');
}

export function descreverAcao(
	acao: AcaoGradeChat,
	nomeDe: (codigo: string) => string | undefined
): LinhaAcao {
	const nome = (c: string) => nomeDe(c) ?? c;
	switch (acao.tipo) {
		case 'adicionar':
			return {
				sinal: 'mais',
				texto: acao.idTurma
					? `Adicionar ${nome(acao.codigo)}`
					: `Pôr ${nome(acao.codigo)} na lista`,
				detalhe: detalheTurma(acao.turma, acao.horario)
			};
		case 'remover':
			return { sinal: 'menos', texto: `Tirar ${nome(acao.codigo)}`, destrutiva: true };
		case 'trocarTurma':
			return {
				sinal: 'troca',
				texto: `Trocar turma de ${nome(acao.codigo)}`,
				detalhe: detalheTurma(acao.turma, acao.horario)
			};
		case 'priorizar':
			return { sinal: 'estrela', texto: `Priorizar ${nome(acao.codigo)}` };
		case 'turnos':
			return {
				sinal: 'turno',
				texto: `Só ${acao.turnos.map((t) => NOME_TURNO[t]).join(' e ')}`
			};
		case 'criarCenario':
			return { sinal: 'cenario', texto: `Salvar como cenário "${acao.nome}"` };
		case 'limpar':
			return { sinal: 'limpar', texto: 'Limpar a grade', destrutiva: true };
	}
}
