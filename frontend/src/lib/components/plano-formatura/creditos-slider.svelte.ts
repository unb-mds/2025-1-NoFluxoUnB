/**
 * Estado do slider de créditos/semestre do plano de formatura.
 *
 * O valor escolhido aparece na hora (`exibido`), mas o recálculo do plano (chamada
 * à API) só roda depois de `atrasoMs` sem mexer. Se o aluno mexe de novo enquanto
 * um recálculo está em andamento, o novo valor fica pendente e é aplicado quando
 * ele termina — antes era descartado.
 */
export interface CreditosSliderOpcoes {
	/** Valor confirmado (o que o plano usa hoje). */
	atual: () => number;
	/** Aplica o valor (salva preferências e recalcula o plano). */
	aplicar: (valor: number) => Promise<void>;
	min: number;
	max: number;
	atrasoMs?: number;
}

export function criarCreditosSlider(opcoes: CreditosSliderOpcoes) {
	const atrasoMs = opcoes.atrasoMs ?? 400;
	let preview = $state<number | null>(null);
	let aplicando = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function aplicarPendente(): Promise<void> {
		if (aplicando) return; // o finally reaplica o que ficou pendente
		const valor = preview;
		if (valor === null) return;
		if (valor === opcoes.atual()) {
			preview = null;
			return;
		}
		aplicando = true;
		try {
			await opcoes.aplicar(valor);
		} finally {
			aplicando = false;
			if (preview !== null && preview !== valor) await aplicarPendente();
			else preview = null;
		}
	}

	return {
		/** Valor a mostrar no slider, na caixa e nas horas. */
		get exibido() {
			return preview ?? opcoes.atual();
		},
		/** Há valor escolhido ainda não refletido no plano (aguardando ou recalculando). */
		get ocupado() {
			return aplicando || preview !== null;
		},
		alterar(valor: number) {
			if (!Number.isFinite(valor)) return;
			preview = Math.min(opcoes.max, Math.max(opcoes.min, Math.round(valor)));
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				void aplicarPendente();
			}, atrasoMs);
		}
	};
}
