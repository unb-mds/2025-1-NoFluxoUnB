/**
 * Cabeçalho do fluxograma recolhido — preferência de exibição no desktop.
 *
 * Recolhido, o card do curso vira uma faixa só (voltar, nome, matriz e ações) e
 * a legenda some: o diagrama ganha a altura que os dois cards ocupavam. A
 * legenda continua no botão (i). Vale para as duas páginas do fluxograma e
 * fica salvo no navegador. No celular não muda nada (lá o cabeçalho já é
 * compacto e a rolagem é da página).
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'nofluxo:fluxograma-cabecalho-recolhido';

function inicial(): boolean {
	if (!browser) return false;
	try {
		return localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

let recolhido = $state(inicial());

export const fluxogramaCabecalhoStore = {
	get recolhido(): boolean {
		return recolhido;
	},
	alternar(): void {
		recolhido = !recolhido;
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, recolhido ? '1' : '0');
		} catch {
			/* sem localStorage: vale só nesta visita */
		}
	}
};
