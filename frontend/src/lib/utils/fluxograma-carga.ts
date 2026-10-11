/**
 * Qual matriz abrir em /meu-fluxograma/[courseName]. Usado no carregamento
 * inicial e no "Tentar novamente", para o retry não cair na matriz padrão.
 */
export type CargaFluxograma =
	| { tipo: 'curriculo'; valor: string; anonymous: boolean }
	| { tipo: 'nome'; valor: string; anonymous: boolean };

type UsuarioComFluxo = {
	dadosFluxograma?: { nomeCurso?: string | null; matrizCurricular?: string | null } | null;
} | null;

function normalizarChaveNome(valor: string | null | undefined): string {
	return (valor ?? '').trim().toLowerCase();
}

export function escolherCargaFluxograma(
	user: UsuarioComFluxo | undefined,
	courseName: string,
	matrizParam: string | null
): CargaFluxograma | null {
	if (!courseName) return null;
	const anonymous = !user?.dadosFluxograma;
	const matrizDoAluno = user?.dadosFluxograma?.matrizCurricular?.trim();
	const mesmoCurso =
		!!matrizDoAluno &&
		normalizarChaveNome(user?.dadosFluxograma?.nomeCurso) === normalizarChaveNome(courseName);

	if (mesmoCurso) {
		// 1) É o curso da própria pessoa e já temos a matriz dela (veio do histórico) — usa direto.
		return { tipo: 'curriculo', valor: matrizDoAluno!, anonymous };
	}
	if (matrizParam?.trim()) {
		// 2) Veio de um card específico em /fluxogramas — respeita a escolha.
		return { tipo: 'curriculo', valor: matrizParam.trim(), anonymous };
	}
	// 3) Sem contexto — carrega uma matriz padrão; a pessoa pode trocar
	//    pelo seletor "Trocar matriz" que já existe no header.
	return { tipo: 'nome', valor: courseName, anonymous };
}
