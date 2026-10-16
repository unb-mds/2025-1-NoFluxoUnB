/** Só para teste: o mesmo $effect que a `ResponsiveSheet` usa, com `aberto` reativo de verdade. */
export function montarEfeitoDaGaveta(store: { abrir: () => () => void }) {
	let aberto = $state(false);
	let execucoes = 0;
	const limpar = $effect.root(() => {
		$effect(() => {
			execucoes++;
			if (!aberto) return;
			return store.abrir();
		});
	});
	return {
		abrir: () => (aberto = true),
		fechar: () => (aberto = false),
		get execucoes() {
			return execucoes;
		},
		limpar
	};
}

/** O padrão que travava a gaveta: contador $state lido E escrito dentro do efeito. */
export function storeIngenuo() {
	let n = $state(0);
	return {
		get temModal() {
			return n > 0;
		},
		abrir() {
			n += 1;
			return () => {
				n -= 1;
			};
		}
	};
}
