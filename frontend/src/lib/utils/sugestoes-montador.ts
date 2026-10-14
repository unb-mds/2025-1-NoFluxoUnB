/**
 * Sugestões iniciais do chat no Montador, a partir do estado da grade — no
 * celular é o caminho principal (digitar é caro). Cada uma vira um pedido que
 * cai numa tool da Darcy (montar_grade, analisar_turmas_na_grade,
 * propor_mudancas_grade).
 */

export interface SugestaoChat {
	prefix: string;
	badge?: string;
	suffix?: string;
	message: string;
	populateOnly?: boolean;
}

export interface SituacaoMontador {
	/** Matérias na grade (com turma). */
	naGrade: number;
	/** O que ficou de fora na última montagem automática. */
	naoAlocadas: string[];
	/** Dias com aula (rótulos "Seg"…"Sáb"). */
	diasComAula: string[];
	cenarios: number;
	/** A grade foi gerada só com obrigatórias — o que sobrou de horário é para optativa. */
	soObrigatorias?: boolean;
}

/** Até 3 sugestões que dependem da grade de agora, mais úteis primeiro. */
export function sugestoesDoMontador(
	s: SituacaoMontador,
	nomeDe: (codigo: string) => string | undefined = () => undefined
): SugestaoChat[] {
	const out: SugestaoChat[] = [];
	const [fora] = s.naoAlocadas;
	if (fora) {
		out.push({
			prefix: 'Por que',
			badge: nomeDe(fora) ?? fora,
			suffix: 'ficou de fora?',
			message: `Por que ${fora} ficou de fora da grade? Tem alguma turma que caiba?`
		});
	}
	if (s.naGrade === 0) {
		out.push({ prefix: 'Monta minha', badge: 'grade', message: 'Monte minha grade' });
		return out;
	}
	if (s.soObrigatorias) {
		// Cai em `recomendar_por_horario_livre`: já lista optativas que cabem no
		// horário que sobrou, com pré-requisito cumprido e por afinidade com o histórico.
		out.push({
			prefix: 'Sugerir',
			badge: 'optativas',
			suffix: 'pro horário livre',
			message: 'Que optativas cabem nos horários livres da minha grade?'
		});
	}
	if (s.diasComAula.includes('Sex')) {
		out.push({
			prefix: 'Grade',
			badge: 'sem sexta',
			message: 'Rearranje minha grade sem aula na sexta-feira'
		});
	}
	out.push({
		prefix: 'Quero',
		badge: 'menos furos',
		message: 'Rearranje minha grade com menos furos entre as aulas'
	});
	if (s.cenarios > 1) {
		out.push({
			prefix: 'Comparar',
			badge: 'cenários',
			message: 'Compare os meus cenários de grade: dias com aula, furos e créditos'
		});
	}
	return out.slice(0, 3);
}
