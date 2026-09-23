import { test, expect, devices } from '@playwright/test';

/**
 * REPRO temporário — "Limpar a grade" não funciona no mobile.
 *
 * Usa o harness `/dev/grade-mobile` (pool falso, sem auth nem backend), que já
 * existe justamente para exercitar o layout compacto.
 *
 * Roda um CONTROLE junto: se o toque em OUTRO item do mesmo menu funciona, a
 * falha é do "Limpar"; se nenhum item responde, o problema é o menu/trigger — e
 * se nem o controle passa, é a automação que não consegue tocar, não o app.
 */

const MOBILE = { ...devices['Pixel 5'] };

/** Texto do contador de créditos do cabeçalho compacto, ex. "10/24". */
async function creditos(page: import('@playwright/test').Page): Promise<string> {
	return (await page.locator('[data-tour="creditos"]').first().innerText()).trim();
}

async function abrirMenu(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('button', { name: 'Mais ações da grade' }).tap();
	await expect(page.getByRole('menu')).toBeVisible();
}

/**
 * "Montar grade" agora abre o wizard de 2 passos (bottom sheet no compacto) em vez
 * de montar direto — encher a grade pra estes reprós precisa completar o fluxo:
 * abrir, gerar opções e aplicar a primeira.
 */
async function montarGradeCompleta(page: import('@playwright/test').Page): Promise<void> {
	await page.getByRole('button', { name: /Montar grade/ }).tap();
	const gerar = page.getByRole('button', { name: /Gerar opções/i });
	await gerar.waitFor({ state: 'visible', timeout: 10_000 });
	await gerar.tap();
	const opcao = page
		.getByRole('button', { name: /Menos dias|Menos lacunas|Semana equilibrada/i })
		.first();
	await opcao.waitFor({ state: 'visible', timeout: 20_000 });
	await opcao.tap();
}

test.use(MOBILE);

test.describe('repro: limpar grade no mobile', () => {
	test.beforeEach(async ({ page }) => {
		// O harness fica atrás do guard global; entra como visitante (mesmo truque
		// dos outros e2e do repo).
		await page.addInitScript(() => {
			localStorage.setItem('nofluxo_anonimo', 'true');
			// Mata o tour de boas-vindas — ele abre um overlay sobre o cabeçalho.
			localStorage.setItem('nofluxo:tour:montador-grade-v1', 'done');
		});
		await page.context().addCookies([
			{ name: 'nofluxo_anonimo', value: 'true', url: 'http://localhost:5173' }
		]);
		await page.goto('/dev/grade-mobile', { waitUntil: 'networkidle' });
		await expect(
			page.getByRole('heading', { name: 'Montador de Grade', exact: true })
		).toBeVisible();
	});

	test('layout compacto está ativo (senão o repro testa a tela errada)', async ({ page }) => {
		// O botão "..." só existe no ramo compacto.
		await expect(page.getByRole('button', { name: 'Mais ações da grade' })).toBeVisible();
		// E o botão "Limpar" solto (ramo desktop) NÃO deve existir.
		await expect(page.getByRole('button', { name: /^Limpar$/ })).toHaveCount(0);
	});

	test('CONTROLE: tocar em "Como funciona" no mesmo menu responde', async ({ page }) => {
		await abrirMenu(page);
		await page.getByRole('menuitem', { name: 'Como funciona' }).tap();
		// Prova positiva de que o toque no item disparou o handler: o tour abriu.
		await expect(page.getByRole('heading', { name: /Bem-vindo ao Montador/ })).toBeVisible();
		await page.screenshot({ path: 'test-results/repro-controle-tour.png' });
	});

	test('ALVO: tocar em "Limpar a grade" zera os créditos', async ({ page }) => {
		// Enche a grade primeiro.
		await montarGradeCompleta(page);
		await expect
			.poll(async () => await creditos(page), { timeout: 15_000 })
			.not.toMatch(/^0\//);

		const antes = await creditos(page);
		console.log('[REPRO] créditos antes de limpar =', antes);

		await abrirMenu(page);
		await page.getByRole('menuitem', { name: 'Limpar a grade' }).tap();
		await expect(page.getByRole('menu')).toBeHidden();

		await page.waitForTimeout(500);
		const depois = await creditos(page);
		console.log('[REPRO] créditos depois de limpar =', depois);
		await page.screenshot({ path: 'test-results/repro-depois-limpar.png' });

		expect(depois).toMatch(/^0\//);
	});
});

/**
 * Variantes: o repro base passou, então o que falha no aparelho real tem que
 * estar numa condição que ele não cobre. Cada teste abaixo muda UMA variável.
 */
test.describe('repro: variantes', () => {
	async function preparar(
		page: import('@playwright/test').Page,
		opts: { matarTour: boolean }
	): Promise<void> {
		await page.addInitScript((matar: boolean) => {
			localStorage.setItem('nofluxo_anonimo', 'true');
			if (matar) localStorage.setItem('nofluxo:tour:montador-grade-v1', 'done');
		}, opts.matarTour);
		await page.context().addCookies([
			{ name: 'nofluxo_anonimo', value: 'true', url: 'http://localhost:5173' }
		]);
		await page.goto('/dev/grade-mobile', { waitUntil: 'networkidle' });
	}

	test('VARIANTE A: tour de boas-vindas ABERTO por cima', async ({ page }) => {
		await preparar(page, { matarTour: false });
		// O tour auto-abre 500ms depois de montar.
		await page.waitForTimeout(1500);
		const tourAberto = await page
			.getByRole('heading', { name: /Bem-vindo ao Montador/ })
			.isVisible()
			.catch(() => false);
		console.log('[VARIANTE-A] tour aberto?', tourAberto);

		// Só o primeiro toque (abrir o wizard) — o objetivo desta variante é ver se o
		// toque atravessa o tour aberto, não completar a montagem.
		await page.getByRole('button', { name: /Montar grade/ }).tap({ force: true });
		await page.waitForTimeout(1000);
		console.log(
			'[VARIANTE-A] wizard abriu (passo "Gerar opções" visível)?',
			await page
				.getByRole('button', { name: /Gerar opções/i })
				.isVisible()
				.catch(() => false)
		);
		await page.screenshot({ path: 'test-results/variante-a-tour-aberto.png' });
	});

	test('VARIANTE B: viewport estreito (360x640)', async ({ page }) => {
		await preparar(page, { matarTour: true });
		await page.setViewportSize({ width: 360, height: 640 });
		await expect(
			page.getByRole('heading', { name: 'Montador de Grade', exact: true })
		).toBeVisible();

		await montarGradeCompleta(page);
		await expect.poll(async () => await creditos(page), { timeout: 15_000 }).not.toMatch(/^0\//);
		console.log('[VARIANTE-B] antes =', await creditos(page));

		await abrirMenu(page);
		const item = page.getByRole('menuitem', { name: 'Limpar a grade' });
		const box = await item.boundingBox();
		console.log('[VARIANTE-B] boundingBox do item =', JSON.stringify(box));
		await page.screenshot({ path: 'test-results/variante-b-menu-aberto.png' });
		await item.tap();
		await page.waitForTimeout(500);
		console.log('[VARIANTE-B] depois =', await creditos(page));
	});

	test('VARIANTE C: página rolada até o fim antes de abrir o menu', async ({ page }) => {
		await preparar(page, { matarTour: true });
		await montarGradeCompleta(page);
		await expect.poll(async () => await creditos(page), { timeout: 15_000 }).not.toMatch(/^0\//);
		console.log('[VARIANTE-C] antes =', await creditos(page));

		await page.mouse.wheel(0, 4000);
		await page.waitForTimeout(300);
		await abrirMenu(page);
		await page.getByRole('menuitem', { name: 'Limpar a grade' }).tap();
		await page.waitForTimeout(500);
		console.log('[VARIANTE-C] depois =', await creditos(page));
		await page.screenshot({ path: 'test-results/variante-c-rolado.png' });
	});
});
