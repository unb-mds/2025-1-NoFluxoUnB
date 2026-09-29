/**
 * Dispara um carregamento assíncrono a partir de um `$effect` e devolve a função
 * de cancelamento (para ser o cleanup do effect).
 *
 * - `carregar` roda de forma síncrona, então o que ele lê continua rastreado pelo effect;
 * - depois de cancelado, nenhum callback roda: a resposta de uma execução antiga
 *   do effect não sobrescreve a da mais recente;
 * - erro nunca vira unhandled rejection e `fim` sempre roda (spinner não fica preso).
 */
export function iniciarCarregamento<T>(
	carregar: () => Promise<T>,
	cb: { ok: (valor: T) => void; erro?: (e: unknown) => void; fim?: () => void }
): () => void {
	let cancelado = false;
	let promessa: Promise<T>;
	try {
		promessa = carregar();
	} catch (e) {
		promessa = Promise.reject(e);
	}
	promessa
		.then((valor) => {
			if (!cancelado) cb.ok(valor);
		})
		.catch((e) => {
			if (cancelado) return;
			if (cb.erro) cb.erro(e);
			else console.error(e);
		})
		.finally(() => {
			if (!cancelado) cb.fim?.();
		});
	return () => {
		cancelado = true;
	};
}
