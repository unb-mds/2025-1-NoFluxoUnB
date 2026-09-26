import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Varredura axe (WCAG 2 A/AA + 2.2 AA) nas rotas públicas, nos dois temas e com alto
 * contraste ligado. Cobre também os mecanismos de teclado: skip link e foco no <main>.
 */
const ROTAS = ['/', '/login', '/fluxogramas', '/acessibilidade'] as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa'];

for (const tema of ['light', 'dark'] as const) {
	test.describe(`tema ${tema}`, () => {
		test.use({
			storageState: undefined
		});

		for (const rota of ROTAS) {
			test(`axe sem violações em ${rota}`, async ({ page }) => {
				await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
				await page.goto(rota);
				await page.waitForLoadState('networkidle');
				const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
				expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
			});
		}
	});
}

test('alto contraste ligado: home sem violações e tokens sobrescritos', async ({ page }) => {
	await page.addInitScript(() => {
		localStorage.setItem('theme', 'light');
		localStorage.setItem('nofluxo_a11y', JSON.stringify({ highContrast: true }));
	});
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await expect(page.locator('html')).toHaveClass(/a11y-high-contrast/);
	const fg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim());
	expect(fg).toBe('0 0% 0%');
	const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test('skip link é o primeiro foco e leva ao conteúdo principal', async ({ page }) => {
	await page.goto('/fluxogramas');
	await page.waitForLoadState('networkidle');
	await page.keyboard.press('Tab');
	const skip = page.locator('a.skip-link');
	await expect(skip).toBeFocused();
	await expect(skip).toBeInViewport();
	await skip.press('Enter');
	await expect(page.locator('#main-content')).toBeFocused();
});

test('página /acessibilidade: interruptores com role=switch persistem a escolha', async ({ page }) => {
	await page.goto('/acessibilidade');
	await page.waitForLoadState('networkidle');
	const sw = page.getByRole('switch', { name: /texto ampliado/i });
	await expect(sw).toHaveAttribute('aria-checked', 'false');
	await sw.click();
	await expect(sw).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('html')).toHaveClass(/a11y-large-text/);
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.locator('html')).toHaveClass(/a11y-large-text/);
	await expect(page.getByRole('switch', { name: /texto ampliado/i })).toHaveAttribute('aria-checked', 'true');
});
