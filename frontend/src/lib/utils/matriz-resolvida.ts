/**
 * Matriz a gravar no fluxograma do aluno depois do casamento.
 *
 * O PDF traz a matriz sem o ano ("8117/-2"), que é ambígua quando o curso tem
 * duas matrizes com a mesma versão — é justamente o caso do COURSE_SELECTION.
 * O RPC casar_disciplinas devolve em `matriz_curricular` o curriculo_completo
 * da matriz que ele usou (inclusive a que o aluno escolheu no modal). Gravar o
 * valor do PDF perdia essa escolha: ao reabrir o fluxograma, a matriz era
 * resolvida de novo a partir do texto ambíguo (pré-mortem 27/09/2026, R5).
 */
export function matrizResolvidaParaSalvar(
	casarResponse: { matriz_curricular?: unknown } | null | undefined,
	matrizDoPdf: string | null | undefined
): string {
	const resolvida = casarResponse?.matriz_curricular;
	if (typeof resolvida === 'string' && resolvida.trim()) return resolvida.trim();
	return (matrizDoPdf ?? '').trim();
}
