/**
 * IRA no histórico SIGAA costuma vir com várias casas decimais (ex.: 4,1234).
 * Guardamos o texto original do PDF em `valor_texto` / `ira_texto` / `iraTexto` para exibir
 * exatamente como no documento, sem arredondamento de `toFixed(1|2)`.
 *
 * O RPC Postgres `casar_disciplinas` pode ser estendido para devolver `ira_texto` em
 * `dados_validacao`; até lá, o cliente mescla `valor_texto` do `extracted_data` ao salvar.
 */

/** Padrão amplo: parte inteira + separador + parte decimal (como no PDF). */
export const REGEX_IRA_HISTORICO = /IRA[:\s]+(\d+[.,]\d+)/i;

/**
 * Converte o trecho capturado do PDF (ex. "4,1234" ou "4.1234") em número,
 * sem alterar o valor — só normaliza o separador decimal.
 */
export function iraStringParaNumero(raw: string): number | null {
	const n = parseFloat(raw.replace(',', '.').trim());
	return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza o IRA vindo de JSON/banco/RPC. Ausente ou não numérico vira `null`
 * (e não 0), para a UI poder dizer "IRA não encontrado" em vez de "IRA: 0".
 */
export function iraOuNull(valor: unknown): number | null {
	if (valor == null) return null;
	if (typeof valor === 'string') {
		if (valor.trim() === '') return null;
		return iraStringParaNumero(valor);
	}
	const n = Number(valor);
	return Number.isFinite(n) ? n : null;
}

export const IRA_NAO_ENCONTRADO = 'IRA não encontrado';

/**
 * Exibe o IRA: prioriza o texto exatamente como no histórico; senão formata o número
 * com vírgula (pt-BR), sem forçar arredondamento a 1 ou 2 casas.
 */
export function formatarIraParaExibicao(
	ira: number | null | undefined,
	textoHistorico?: string | null
): string {
	if (textoHistorico != null && String(textoHistorico).trim() !== '') {
		return String(textoHistorico).trim();
	}
	if (ira == null || !Number.isFinite(ira)) return '';
	const s = ira.toString();
	if (s.includes('e') || s.includes('E')) {
		return ira.toLocaleString('pt-BR', {
			minimumFractionDigits: 1,
			maximumFractionDigits: 12,
			useGrouping: false
		});
	}
	return s.replace('.', ',');
}
