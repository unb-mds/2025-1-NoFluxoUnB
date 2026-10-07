/**
 * Casamento entre a matrícula real do histórico SIGAA e a oferta de turmas do
 * montador — extraído da página do montador para ser testável e reusável.
 *
 * O histórico traz, para cada matéria com status MATR, a turma em que o aluno
 * de fato se matriculou (`DadosMateria.turma`). Quando essa matrícula é do
 * mesmo período da oferta carregada, dá para pré-selecionar a turma real no
 * calendário em vez de deixar a matéria solta.
 */
import { isMateriaCurrent, type DadosFluxogramaUser } from '$lib/types/user';

/**
 * Visão mínima de uma matéria do pool que o casamento precisa — estruturalmente
 * compatível com `MateriaGrade` sem acoplar este módulo ao store.
 */
export interface MateriaComTurmas {
	codigo: string;
	turmas: Array<{
		turma: { id_turmas: number; turma: string; docente?: string | null };
		codigoOfertado?: string;
	}>;
}

/** Nome comparável: sem acento, caixa alta, espaços colapsados. */
function normNome(s: string | null | undefined): string {
	return (s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.replace(/\s+/g, ' ')
		.toUpperCase();
}

/** "01" e "1" são a mesma turma — o SIGAA ora zera à esquerda, ora não. */
export function mesmaTurma(a: string, b: string): boolean {
	const norm = (s: string) =>
		s
			.trim()
			.toUpperCase()
			.replace(/^0+(?=\d)/, '');
	return norm(a) === norm(b);
}

/**
 * Turma real (do histórico SIGAA) por código de matéria matriculada agora.
 * Só vale quando o período da matrícula é o mesmo da oferta carregada — a
 * turma "01" de outro semestre pode ter horário completamente diferente.
 */
export function turmasReaisDoHistorico(
	dados: DadosFluxogramaUser | null | undefined,
	periodoAtivo: string
): Map<string, string> {
	const mapa = new Map<string, string>();
	for (const semestre of dados?.dadosFluxograma ?? []) {
		for (const dm of semestre) {
			const turma = dm.turma?.trim();
			if (!turma || !isMateriaCurrent(dm)) continue;
			if ((dm.anoPeriodo ?? '').trim() !== periodoAtivo) continue;
			mapa.set(dm.codigoMateria.trim().toUpperCase(), turma);
		}
	}
	return mapa;
}

/**
 * Professor da matrícula real por código de matéria matriculada agora — mesma
 * regra de período de `turmasReaisDoHistorico`. É o plano B do casamento quando
 * o código da turma não bate com a oferta (ou o histórico não o trouxe).
 */
export function professoresReaisDoHistorico(
	dados: DadosFluxogramaUser | null | undefined,
	periodoAtivo: string
): Map<string, string> {
	const mapa = new Map<string, string>();
	for (const semestre of dados?.dadosFluxograma ?? []) {
		for (const dm of semestre) {
			const professor = dm.professor?.trim();
			if (!professor || !isMateriaCurrent(dm)) continue;
			if ((dm.anoPeriodo ?? '').trim() !== periodoAtivo) continue;
			mapa.set(dm.codigoMateria.trim().toUpperCase(), professor);
		}
	}
	return mapa;
}

/**
 * Turma da oferta que corresponde à matrícula real da matéria, ou `null` se o
 * histórico não tem essa matrícula (ou a turma dele não existe na oferta). A
 * matrícula em equivalente casa pelo `codigoOfertado` da turma — o histórico
 * registra o código em que o aluno de fato se matriculou.
 *
 * Sem casamento pelo código da turma, tenta pelo professor do histórico — mas só
 * aceita quando ele aponta UMA turma: com duas do mesmo professor, chutar uma
 * seria trocar a matrícula do aluno por palpite.
 */
export function encontrarTurmaReal(
	materia: MateriaComTurmas,
	reais: ReadonlyMap<string, string>,
	professores?: ReadonlyMap<string, string>
): number | null {
	const chaveDe = (t: MateriaComTurmas['turmas'][number]) =>
		(t.codigoOfertado ?? materia.codigo).trim().toUpperCase();

	const alvo = materia.turmas.find((t) => {
		const real = reais.get(chaveDe(t));
		return !!real && mesmaTurma(t.turma.turma, real);
	});
	if (alvo) return alvo.turma.id_turmas;

	if (!professores) return null;
	const doProfessor = materia.turmas.filter((t) => {
		const prof = normNome(professores.get(chaveDe(t)));
		if (!prof) return false;
		return (t.turma.docente ?? '').split(',').some((d) => {
			const nome = normNome(d);
			return nome.length > 0 && (nome.includes(prof) || prof.includes(nome));
		});
	});
	return doProfessor.length === 1 ? doProfessor[0].turma.id_turmas : null;
}
