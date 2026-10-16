/**
 * Envio da grade por e-mail e WhatsApp.
 *
 * Navegador nenhum anexa arquivo por `mailto:`/`wa.me` — o anexo só vai pela folha
 * de compartilhamento do sistema (`navigator.share({ files })`, que lista WhatsApp,
 * Gmail etc. no celular). Onde ela não existe (desktop), baixamos o arquivo e abrimos
 * o app com um texto-resumo pronto: o aluno só anexa o que acabou de baixar.
 */
import { horarioLegivel } from '$lib/utils/sigaa';
import { nomeLegivel, type ModeloGradePdf } from '$lib/utils/grade-pdf';

/** Resumo em texto puro: cabe no corpo de e-mail e na mensagem do WhatsApp. */
export function resumoTextoGrade(modelo: ModeloGradePdf): string {
	const n = modelo.materias.length;
	const cab = [
		modelo.titulo,
		[
			modelo.periodo ? `Período ${modelo.periodo}` : null,
			`${n} ${n === 1 ? 'matéria' : 'matérias'}`,
			`${modelo.creditos} créditos`
		]
			.filter(Boolean)
			.join(' · ')
	];
	const linhas = modelo.materias.map((m) => {
		const horario = m.mask === 0n ? 'sem horário definido' : horarioLegivel(m.turma.horario ?? '');
		return `• ${m.codigo} ${nomeLegivel(m.nome)} — turma ${m.turma.turma}, ${horario}`;
	});
	return [...cab, '', ...linhas, '', 'Feito no NoFluxo UnB — no-fluxo.com'].join('\n');
}

export function urlEmail(assunto: string, corpo: string): string {
	return `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

export function urlWhatsapp(texto: string): string {
	return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
