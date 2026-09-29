/**
 * Tokens canônicos do tema e fundo real da página.
 *
 * Produção é só dark (app.html fixa `class="dark"`): aqui se prova que o dark
 * NÃO mudou (--page-background = #050505, glow 0.45 × 0.22) e que o light tem
 * fundo de página próprio, com os tokens de status valendo nos dois temas
 * medidos sobre o fundo real (o que o PageBackground pinta), não sobre --background.
 */
import { describe, expect, it } from 'vitest';
import {
	MIN_GRAFICO,
	MIN_TEXTO,
	TEMAS,
	TOKENS,
	compor,
	contraste,
	fundoDaPagina,
	fundosDaPagina,
	lerSrc,
	lerTokens,
	opacidadeMaxDoGlow,
	parseCor,
	piorContraste,
	resolverClasse,
	token
} from './contraste';

const appCss = lerSrc('app.css');
const pageBackground = lerSrc('lib/components/effects/PageBackground.svelte');
const tailwind = lerSrc('../tailwind.config.ts');
const arred = (rgb: readonly number[]) => rgb.map((v) => Math.round(v));

describe('produção (dark) não mudou', () => {
	it('--page-background do .dark é exatamente o #050505 que o PageBackground pintava', () => {
		expect(arred(fundoDaPagina('dark'))).toEqual([5, 5, 5]);
		expect(arred(fundoDaPagina('dark'))).toEqual(arred(parseCor('#050505')));
	});

	it('glow do PageBackground no .dark: --primary a 0.45 com opacidade 0.22/0.18', () => {
		expect(TOKENS.dark['page-glow-alpha']).toBe('0.45');
		expect(opacidadeMaxDoGlow()).toBe(0.22);
		expect(pageBackground).toMatch(/opacity:\s*0\.18/);
	});

	it('o PageBackground usa os tokens, sem cor de fundo fixa', () => {
		expect(pageBackground).toMatch(/\.nofluxo-bg\s*\{[^}]*background:\s*hsl\(var\(--page-background\)\);/);
		expect(pageBackground).toMatch(
			/\.nofluxo-bg-glow\s*\{[^}]*background:\s*hsl\(var\(--primary\) \/ var\(--page-glow-alpha\)\);/
		);
		const estilo = /<style[^>]*>([\s\S]*?)<\/style>/.exec(pageBackground)![1];
		expect(estilo.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
	});
});

describe('tema claro tem fundo de página claro', () => {
	it('--page-background do :root é o --background claro', () => {
		expect(TOKENS.light['page-background']).toBe(TOKENS.light.background);
	});

	it.each(TEMAS)('muted-foreground sobre a página real (lisa e no glow) ≥ 4,5:1 — %s', (tema) => {
		expect(piorContraste(tema, { token: 'muted-foreground' })).toBeGreaterThanOrEqual(MIN_TEXTO);
		expect(piorContraste(tema, { token: 'foreground' })).toBeGreaterThanOrEqual(MIN_TEXTO);
	});
});

// ─── Conjunto canônico de tokens de status ───────────────────────────────────

const STATUS_GENERICOS = ['status-success', 'status-warning', 'status-danger', 'status-info'];
const CANONICOS = [
	'page-background',
	'page-glow-alpha',
	...STATUS_GENERICOS,
	'status-completed',
	'status-in-progress',
	'status-available',
	'status-failed',
	'status-failed-ring',
	'status-on-solid',
	'status-prereq-ok',
	'status-prereq-pending',
	'status-locked',
	'status-locked-foreground',
	'status-locked-border',
	'tag-equivalencia',
	'tag-equivalencia-foreground',
	'tag-aproveitamento',
	'tag-aproveitamento-foreground',
	'tag-optativa',
	'tag-optativa-foreground',
	'tag-optatoria',
	'tag-optatoria-foreground',
	'tag-modulo-livre',
	'tag-modulo-livre-foreground',
	'chain-focus',
	'chain-precursor',
	'chain-descendant'
];

describe('tokens canônicos (um nome por conceito, nos dois temas)', () => {
	const soDoBloco = (seletor: RegExp) => {
		const css = appCss.replace(/\/\*[\s\S]*?\*\//g, '');
		const m = seletor.exec(css)!;
		const ini = css.indexOf('{', m.index) + 1;
		return css.slice(ini, css.indexOf('}', ini));
	};
	const blocos = {
		':root': soDoBloco(/(^|[\s}]):root\s*\{/),
		'.dark': soDoBloco(/(^|[\s}])\.dark\s*\{/)
	};

	it.each(CANONICOS)('--%s definido uma única vez em :root e em .dark', (nome) => {
		for (const [seletor, corpo] of Object.entries(blocos)) {
			const n = corpo.match(new RegExp(`--${nome}\\s*:`, 'g'))?.length ?? 0;
			expect(n, `${seletor} --${nome}`).toBe(1);
		}
	});

	it('nenhum token --status-*/--tag-*/--chain-* fora do conjunto canônico', () => {
		const extras = [...appCss.matchAll(/--((?:status|tag|chain)-[\w-]+)\s*:/g)]
			.map((m) => m[1])
			.filter((n) => !CANONICOS.includes(n));
		expect(extras).toEqual([]);
	});

	it.each(CANONICOS.filter((n) => n !== 'page-glow-alpha'))(
		'tailwind.config expõe --%s como cor',
		(nome) => {
			expect(tailwind).toContain(`'hsl(var(--${nome}) / <alpha-value>)'`);
		}
	);
});

describe.each(TEMAS)('tokens de status genéricos — tema %s, sobre o fundo real', (tema) => {
	it.each(STATUS_GENERICOS)('%s como texto: página, card e tinta /10–/18 sobre o card', (nome) => {
		const f = { token: nome };
		expect(piorContraste(tema, f)).toBeGreaterThanOrEqual(MIN_TEXTO);
		expect(piorContraste(tema, f, ['bg-card'])).toBeGreaterThanOrEqual(MIN_TEXTO);
		for (const alfa of [0.1, 0.18]) {
			expect(piorContraste(tema, f, ['bg-card', { token: nome, alfa }])).toBeGreaterThanOrEqual(
				MIN_TEXTO
			);
		}
	});

	it.each(STATUS_GENERICOS)('%s como gráfico (anel) sobre o trilho --border ≥ 3:1', (nome) => {
		expect(contraste(token(tema, nome), token(tema, 'border'))).toBeGreaterThanOrEqual(MIN_GRAFICO);
	});
});

// ─── O helper ────────────────────────────────────────────────────────────────

describe('helper de contraste', () => {
	it('mede como a WCAG', () => {
		expect(contraste(parseCor('#fff'), parseCor('#000'))).toBeCloseTo(21, 5);
		expect(arred(parseCor('0 0% 100%'))).toEqual([255, 255, 255]);
		expect(arred(parseCor('oklch(100% 0 0)'))).toEqual([255, 255, 255]);
		expect(arred(compor([255, 255, 255], 0.5, [0, 0, 0]))).toEqual([128, 128, 128]);
	});

	it('dark = :root sobrescrito por .dark', () => {
		const t = lerTokens(':root { --a: 1 0% 0%; --b: 2 0% 0%; } .dark { --a: 3 0% 0%; }');
		expect(t.dark).toEqual({ a: '3 0% 0%', b: '2 0% 0%' });
	});

	it('resolve classes: dark: vence no escuro, alfa, tokens e paleta', () => {
		expect(resolverClasse('text-green-700 dark:text-green-400', 'text', 'light')!.classe).toBe(
			'text-green-700'
		);
		expect(resolverClasse('dark:text-green-400 text-green-700', 'text', 'dark')!.classe).toBe(
			'dark:text-green-400'
		);
		expect(resolverClasse('bg-card/80 text-sm', 'bg', 'dark')!.alfa).toBeCloseTo(0.8);
		expect(resolverClasse('text-sm font-bold', 'text', 'dark')).toBeNull();
	});

	it('o fundo do dark é a página real (#050505), o do claro é branco; glow pesa nos dois', () => {
		for (const tema of TEMAS) {
			const [liso, glow] = fundosDaPagina(tema);
			expect(contraste(liso, glow)).toBeGreaterThan(1);
		}
	});

	it('sanidade: cor que só funciona no escuro reprova sobre a página clara', () => {
		expect(piorContraste('light', 'text-white')).toBeLessThan(MIN_GRAFICO);
		expect(piorContraste('light', 'text-green-400')).toBeLessThan(MIN_GRAFICO);
		expect(piorContraste('dark', 'text-white')).toBeGreaterThan(MIN_TEXTO);
	});
});
