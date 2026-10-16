/**
 * Regressão: menu "⋯", diálogos e a gaveta "Filtros e preferências" ficavam ATRÁS do
 * painel da Darcy (chat z-100 > sheet z-95 > menu/diálogo z-50). A ordem agora vem de
 * tokens em app.css; estes testes travam a ordem e quem usa qual camada.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = join(__dirname, '..', '..');
const ler = (rel: string) => readFileSync(join(raiz, rel), 'utf8');
const token = (css: string, nome: string) =>
	Number(new RegExp(String.raw`--${nome}:\s*(\d+)`).exec(css)?.[1]);

describe('camadas (z-index)', () => {
	const css = ler('app.css');

	it('botão do chat < painel do chat < overlays, e o tour fica acima de tudo', () => {
		const fab = token(css, 'z-fab');
		const chat = token(css, 'z-chat');
		const overlay = token(css, 'z-overlay');
		expect(fab).toBeLessThan(chat);
		expect(chat).toBeLessThan(overlay);
		// O tour (OnboardingTour.svelte: z-index 120/130) precisa continuar acima.
		expect(overlay).toBeLessThan(120);
	});

	it.each([
		'lib/components/ui/ResponsiveSheet.svelte',
		'lib/components/ui/dropdown-menu/dropdown-menu-content.svelte',
		'lib/components/ui/dropdown-menu/dropdown-menu-sub-content.svelte',
		'lib/components/ui/dialog/dialog-content.svelte',
		'lib/components/ui/dialog/dialog-overlay.svelte',
		'lib/components/ui/tooltip/tooltip-content.svelte'
	])('%s usa a camada de overlay (nada de z-index fixo abaixo do chat)', (arq) => {
		const src = ler(arq);
		expect(src).toContain('z-[var(--z-overlay)]');
		expect(src).not.toMatch(/z-\[95\]/);
	});

	it('o chat e o botão da Darcy usam as camadas do chat', () => {
		const chat = ler('lib/components/planejamento/AssistenteChatFab.svelte');
		expect(chat).toContain('z-[var(--z-chat)]');
		expect(chat).toContain('z-[var(--z-fab)]');
		expect(chat).not.toMatch(/z-\[(90|100)\]/);
	});
});
