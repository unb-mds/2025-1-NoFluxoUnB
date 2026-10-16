/**
 * Há algum overlay modal (bottom sheet/gaveta do Montador) aberto?
 *
 * Serve para o resto da tela saber que está "atrás" de um modal: o chat flutuante da
 * Darcy fica `inert` (sem foco de teclado nem leitor de tela) enquanto um modal está
 * aberto — o z-index sozinho resolve o visual, mas não impedia o Tab de cair no chat
 * por trás do overlay.
 *
 * ATENÇÃO: `abrir()` é chamado de dentro de `$effect`. Por isso só ESCREVE em estado
 * reativo — a contagem é uma variável comum. Ler o próprio $state ali (`n += 1`) faz o
 * efeito depender do que ele mesmo altera, reexecutar em laço e desregistrar o modal
 * logo depois de registrar (a gaveta travava e os botões deixavam de responder).
 *
 * Ordem das camadas (z-index) vive em `app.css` (`--z-fab` < `--z-chat` < `--z-overlay`).
 */
function createCamadasStore() {
	let contagem = 0; // não reativo de propósito
	let temModal = $state(false);
	return {
		get temModal(): boolean {
			return temModal;
		},
		/** Registra um modal aberto; devolve a função que o desregistra. */
		abrir(): () => void {
			contagem += 1;
			temModal = true;
			let fechado = false;
			return () => {
				if (fechado) return;
				fechado = true;
				contagem = Math.max(0, contagem - 1);
				temModal = contagem > 0;
			};
		}
	};
}

export const camadasStore = createCamadasStore();
