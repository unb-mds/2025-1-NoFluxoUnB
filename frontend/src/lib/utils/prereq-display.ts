import type { PreRequisitoModel } from '$lib/types/curso';
import { getLogicalCodeGroups, type LogicalCodeGroups } from '$lib/utils/expressao-logica';

/**
 * Como a aba "Pré-requisitos" da ficha exibe uma linha de `pre_requisitos`:
 * - `groups`: forma disjuntiva (cada grupo é uma "Opção", itens internos ligados por E);
 * - `raw`: há expressão mas não deu para interpretar — mostra o texto cru em vez de um card vazio;
 * - `single`: linha legada sem expressão, só `codigoMateriaRequisito`.
 */
export type PrereqDisplay =
	| { kind: 'groups'; groups: LogicalCodeGroups }
	| { kind: 'raw'; text: string }
	| { kind: 'single'; code: string };

/**
 * Antes o modal só interpretava a regra quando havia `expressaoOriginal`: uma linha com
 * expressao_logica "A OU B" e texto NULL caía no ramo legado e mostrava só A
 * (pré-mortem R59). A expressão lógica sozinha já basta para montar as opções.
 */
export function getPrereqDisplay(
	pr: Pick<PreRequisitoModel, 'codigoMateriaRequisito' | 'expressaoOriginal' | 'expressaoLogica'>
): PrereqDisplay {
	const original = pr.expressaoOriginal?.trim() || null;
	if (original || pr.expressaoLogica != null) {
		const groups = getLogicalCodeGroups(pr.expressaoLogica, original);
		if (groups.length > 0) return { kind: 'groups', groups };
		return { kind: 'raw', text: original ?? pr.codigoMateriaRequisito ?? '' };
	}
	return { kind: 'single', code: pr.codigoMateriaRequisito ?? '' };
}
