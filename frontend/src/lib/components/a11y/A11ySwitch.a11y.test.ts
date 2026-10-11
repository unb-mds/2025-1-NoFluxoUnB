// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import axe from 'axe-core';
import { Contrast } from 'lucide-svelte';
import A11ySwitch from './A11ySwitch.svelte';

// Contraste de cor é medido no navegador real pelo Playwright (tests-e2e/a11y.spec.ts);
// no jsdom não há layout nem cores computadas, então a regra só gera ruído aqui.
const WCAG_AA = {
	runOnly: { type: 'tag' as const, values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
	rules: { 'color-contrast': { enabled: false } }
};

describe('A11ySwitch — acessibilidade do interruptor', () => {
	it('é um switch com nome e descrição acessíveis e sem violações WCAG 2 A/AA', async () => {
		const onchange = vi.fn();
		const { container, getByRole } = render(A11ySwitch, {
			props: {
				id: 'sw-contraste',
				checked: false,
				label: 'Alto contraste',
				description: 'Texto preto no branco.',
				hint: '1.4.3',
				icon: Contrast,
				onchange
			}
		});

		const sw = getByRole('switch', { name: /alto contraste/i });
		expect(sw.getAttribute('aria-checked')).toBe('false');
		expect(sw.getAttribute('aria-describedby')).toBe('sw-contraste-desc');

		await fireEvent.click(sw);
		expect(onchange).toHaveBeenCalledWith(true);

		const results = await axe.run(container, WCAG_AA);
		expect(results.violations).toEqual([]);
	});
});
