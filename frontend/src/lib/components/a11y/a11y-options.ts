import { Contrast, ALargeSmall, CaseSensitive, ZapOff, Eye } from 'lucide-svelte';
import type { A11yKey } from '$lib/stores/a11y';

export interface A11yOption {
	key: A11yKey;
	label: string;
	description: string;
	/** Critério WCAG 2.2 que a opção atende. */
	wcag: string;
	icon: typeof Contrast;
}

/** Lista única usada pelo menu da navbar, pelo drawer mobile e pela página /acessibilidade. */
export const A11Y_OPTIONS: A11yOption[] = [
	{
		key: 'highContrast',
		label: 'Alto contraste',
		description: 'Texto preto no branco (ou branco no preto) e cores de destaque puras. Vale para os dois temas.',
		wcag: '1.4.3 e 1.4.11',
		icon: Contrast
	},
	{
		key: 'largeText',
		label: 'Texto ampliado',
		description: 'Aumenta a fonte base em 12,5% em toda a aplicação, sem quebrar o layout.',
		wcag: '1.4.4 e 1.4.12',
		icon: ALargeSmall
	},
	{
		key: 'readableFont',
		label: 'Fonte de leitura facilitada',
		description: 'Usa a Lexend, desenhada para reduzir o esforço de leitura, inclusive para dislexia.',
		wcag: '1.4.8 (apoio à leitura)',
		icon: CaseSensitive
	},
	{
		key: 'reducedMotion',
		label: 'Reduzir movimento',
		description: 'Desliga animações e transições. Se o sistema já pede isso, o site obedece automaticamente.',
		wcag: '2.3.3',
		icon: ZapOff
	},
	{
		key: 'focusBold',
		label: 'Foco reforçado',
		description: 'Anel de foco mais grosso e com halo, para quem navega pelo teclado.',
		wcag: '2.4.7 e 2.4.13',
		icon: Eye
	}
];
