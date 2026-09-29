/**
 * Contraste light/dark dos componentes do Darcy (login, rodinha de uso, card de
 * limite, pedido de mais perguntas, painel de aprovação), do card "Darcy hoje" e
 * dos cards novos do dashboard admin (sem preço, saúde do log de IA, suporte).
 *
 * Regra do produto: o que existe no escuro tem que funcionar no claro. Aqui:
 *  1. os tokens HSL são lidos do app.css (`:root` = claro, `.dark` = escuro) e
 *     cada combinação texto/fundo usada nesses componentes tem que dar ≥ 4,5:1
 *     (texto) ou ≥ 3:1 (anel, ícones de status) nos DOIS temas;
 *  2. os arquivos desses componentes não podem usar cor fixa que só funciona
 *     num tema (text-white, bg-zinc-950, stroke-sky-400, rgba(255,…), hex…)
 *     sem o par `dark:` — é o que quebra quando alguém volta a usar a cor
 *     "que fica bonita no escuro".
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKEN_RODINHA } from '$lib/utils/darcy-cota';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const ler = (rel: string) => readFileSync(SRC + rel, 'utf8');

// ─── Tokens do app.css ───────────────────────────────────────────────────────

type HSL = [number, number, number];
type Tema = 'claro' | 'escuro';

function blocoDoSeletor(css: string, seletor: RegExp): string {
	const m = seletor.exec(css);
	if (!m) throw new Error(`seletor ${seletor} não encontrado no app.css`);
	const inicio = css.indexOf('{', m.index) + 1;
	return css.slice(inicio, css.indexOf('}', inicio));
}

function lerTokens(bloco: string): Record<string, HSL> {
	const tokens: Record<string, HSL> = {};
	for (const m of bloco.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;/g)) {
		tokens[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
	}
	return tokens;
}

const appCss = ler('app.css');
const TOKENS: Record<Tema, Record<string, HSL>> = {
	claro: lerTokens(blocoDoSeletor(appCss, /^\s*:root\s*\{/m)),
	escuro: lerTokens(blocoDoSeletor(appCss, /^\s*\.dark\s*\{/m))
};
const TEMAS: Tema[] = ['claro', 'escuro'];

// ─── Cor / contraste (WCAG 2.x) ──────────────────────────────────────────────

type RGB = [number, number, number];

function hslParaRgb([h, s, l]: HSL): RGB {
	const sat = s / 100;
	const lum = l / 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = sat * Math.min(lum, 1 - lum);
	const f = (n: number) => lum - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function hexParaRgb(hex: string): RGB {
	const n = parseInt(hex.replace('#', ''), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminancia([r, g, b]: RGB): number {
	const c = (v: number) => {
		const x = v / 255;
		return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function contraste(a: RGB, b: RGB): number {
	const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}

/** `token` ou `token/alfa` (ex. 'status-danger/0.1') sobre `base` → RGB final. */
function cor(tema: Tema, spec: string, base?: string): RGB {
	const [nome, alfaTxt] = spec.split('/');
	const hsl = TOKENS[tema][nome];
	if (!hsl) throw new Error(`token --${nome} não existe no tema ${tema}`);
	const rgb = hslParaRgb(hsl);
	const alfa = alfaTxt === undefined ? 1 : Number(alfaTxt);
	if (alfa === 1) return rgb;
	if (!base) throw new Error(`${spec} tem alfa e precisa de uma base`);
	const fundo = cor(tema, base);
	return rgb.map((v, i) => v * alfa + fundo[i] * (1 - alfa)) as RGB;
}

// ─── Combinações usadas nos componentes ──────────────────────────────────────

interface Par {
	onde: string;
	/** Token do texto/traço; objeto quando o componente usa um token por tema. */
	frente: string | Record<Tema, string>;
	/** Fundo: token, ou `token/alfa` sobre `base`. */
	fundo: string;
	base?: string;
}

const TEXTO: Par[] = [
	// Modais (Dialog.Content = bg-background)
	{ onde: 'modal: título/texto', frente: 'foreground', fundo: 'background' },
	{ onde: 'modal: descrição, legendas', frente: 'muted-foreground', fundo: 'background' },
	{ onde: 'botão primário (Entrar, Enviar pedido)', frente: 'primary-foreground', fundo: 'primary' },
	{
		onde: 'botão primário no hover',
		frente: 'primary-foreground',
		fundo: 'primary/0.9',
		base: 'background'
	},
	{ onde: 'botão secundário no hover', frente: 'foreground', fundo: 'muted' },
	{
		onde: 'opção de pedido selecionada',
		frente: 'foreground',
		fundo: 'primary/0.1',
		base: 'background'
	},
	{ onde: 'asterisco / erro no pedido', frente: 'status-danger', fundo: 'background' },
	// Card de limite, painel de aprovação, card "Darcy hoje" (bg-card)
	{ onde: 'card: texto', frente: 'card-foreground', fundo: 'card' },
	{ onde: 'card: texto secundário', frente: 'muted-foreground', fundo: 'card' },
	{
		onde: 'card "Darcy hoje": "Ver pedidos nos tickets"',
		frente: { claro: 'primary', escuro: 'ai' },
		fundo: 'card'
	},
	{ onde: 'card de limite: "Pedir mais perguntas"', frente: 'primary-foreground', fundo: 'primary' },
	{ onde: 'painel: campo', frente: 'foreground', fundo: 'background' },
	{ onde: 'painel: erro', frente: 'status-danger', fundo: 'card' },
	{ onde: 'painel: Aprovar', frente: 'status-success', fundo: 'status-success/0.1', base: 'card' },
	{
		onde: 'painel: Aprovar (hover)',
		frente: 'status-success',
		fundo: 'status-success/0.18',
		base: 'card'
	},
	{ onde: 'painel: Recusar', frente: 'status-danger', fundo: 'status-danger/0.1', base: 'card' },
	{
		onde: 'painel: Recusar (hover)',
		frente: 'status-danger',
		fundo: 'status-danger/0.18',
		base: 'card'
	},
	{ onde: 'painel: <option>', frente: 'popover-foreground', fundo: 'popover' },
	// Dashboard admin (bg-card): alerta de modelo sem preço / log parado,
	// taxa de falha alta, backlog aguardando o suporte, "sem preço" por modelo
	{
		onde: 'dashboard: texto do alerta sem preço / log parado',
		frente: 'card-foreground',
		fundo: 'status-warning/0.1',
		base: 'card'
	},
	{ onde: 'dashboard: "sem preço" na lista por modelo', frente: 'status-warning', fundo: 'card' },
	{ onde: 'saúde do log: taxa de falha alta', frente: 'status-danger', fundo: 'card' },
	{ onde: 'suporte: aguardando o suporte', frente: 'status-warning', fundo: 'card' },
	{
		onde: 'suporte: "Ver todos os tickets"',
		frente: { claro: 'primary', escuro: 'ai' },
		fundo: 'card'
	},
	// Tooltip da rodinha
	{ onde: 'rodinha: tooltip', frente: 'popover-foreground', fundo: 'popover' }
];

const GRAFICO: Par[] = [
	...Object.values(TOKEN_RODINHA).flatMap((token) => [
		{ onde: `rodinha: anel ${token} × disco`, frente: token, fundo: 'card' },
		{ onde: `rodinha: anel ${token} × trilho`, frente: token, fundo: 'border' }
	]),
	{
		onde: 'card de limite: ícone da lua',
		frente: 'status-danger',
		fundo: 'status-danger/0.1',
		base: 'card'
	},
	{
		onde: 'card de limite: ícone de pausa',
		frente: 'status-warning',
		fundo: 'status-warning/0.1',
		base: 'card'
	},
	{ onde: 'modal: ícone do Darcy', frente: 'primary', fundo: 'primary/0.1', base: 'background' },
	{
		onde: 'dashboard: ícone do alerta sem preço / log parado',
		frente: 'status-warning',
		fundo: 'status-warning/0.1',
		base: 'card'
	},
	{ onde: 'pedido enviado: ícone', frente: 'status-success', fundo: 'background' },
	{ onde: 'pedido: borda do radio', frente: 'muted-foreground', fundo: 'background' },
	{ onde: 'pedido: radio marcado', frente: 'primary', fundo: 'primary/0.1', base: 'background' }
];

describe('tokens do app.css', () => {
	it('lê os dois temas', () => {
		expect(Object.keys(TOKENS.claro).length).toBeGreaterThan(15);
		expect(Object.keys(TOKENS.escuro).length).toBeGreaterThan(15);
	});

	it.each(['status-info', 'status-warning', 'status-danger', 'status-success'])(
		'--%s existe em :root e em .dark',
		(token) => {
			expect(TOKENS.claro[token]).toBeDefined();
			expect(TOKENS.escuro[token]).toBeDefined();
		}
	);
});

describe.each(TEMAS)('contraste no tema %s', (tema) => {
	const frenteDo = (f: Par['frente']) => (typeof f === 'string' ? f : f[tema]);

	it.each(TEXTO)('texto ≥ 4,5:1 — $onde', ({ frente, fundo, base }) => {
		const r = contraste(cor(tema, frenteDo(frente)), cor(tema, fundo, base));
		expect(r, `${frente} sobre ${fundo}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
	});

	it.each(GRAFICO)('gráfico ≥ 3:1 — $onde', ({ frente, fundo, base }) => {
		const r = contraste(cor(tema, frenteDo(frente)), cor(tema, fundo, base));
		expect(r, `${frente} sobre ${fundo}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
	});
});

describe('por que não dá para voltar a sky/amber/rose-400 fixos', () => {
	it('os tons -400 do anel antigo não chegam a 3:1 sobre o fundo claro', () => {
		const branco = cor('claro', 'background');
		for (const hex of ['#38bdf8' /* sky-400 */, '#fbbf24' /* amber-400 */]) {
			expect(contraste(hexParaRgb(hex), branco)).toBeLessThan(3);
		}
	});
});

// ─── Guarda contra cor fixa de um tema só ────────────────────────────────────

const ARQUIVOS = [
	'lib/components/chat/DarcyLoginModal.svelte',
	'lib/components/chat/DarcyUsoRing.svelte',
	'lib/components/chat/DarcyLimiteCard.svelte',
	'lib/components/chat/DarcyPedidoMaisPerguntas.svelte',
	'lib/components/tickets/DarcyPedidoAdminPanel.svelte',
	'lib/components/admin/dashboard/IaSemPrecoAlerta.svelte',
	'lib/components/admin/dashboard/IaSaudeLogCard.svelte',
	'lib/components/admin/dashboard/SuporteCard.svelte'
];

const PALETA =
	'white|black|zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTIL = 'text|bg|border|stroke|fill|ring|ring-offset|placeholder|accent|from|via|to|outline|divide|shadow';
const CLASSE_PALETA = new RegExp(
	`(^|[\\s"'{:])((?:dark:)?(?:[\\w-]+:)*)(${UTIL})-(${PALETA})(?:-\\d{2,3})?(?:\\/\\d+)?(?=[\\s"'}]|$)`,
	'g'
);

function partes(fonte: string) {
	const estilo = /<style[^>]*>([\s\S]*?)<\/style>/.exec(fonte)?.[1] ?? '';
	const marcacao = fonte.replace(/<style[^>]*>[\s\S]*?<\/style>/, '');
	return { estilo, marcacao };
}

describe.each(ARQUIVOS)('%s não usa cor de um tema só', (arquivo) => {
	const { estilo, marcacao } = partes(ler(arquivo));

	it('classes de paleta do Tailwind só com par light/dark na mesma linha', () => {
		const problemas: string[] = [];
		for (const linha of marcacao.split('\n')) {
			for (const m of linha.matchAll(CLASSE_PALETA)) {
				const [, , variantes, util, paleta] = m;
				if (variantes.includes('dark:')) continue;
				// Branco/preto não têm par que faça sentido: use token.
				const temPar =
					paleta !== 'white' &&
					paleta !== 'black' &&
					new RegExp(`dark:(?:[\\w-]+:)*${util}-`).test(linha);
				if (!temPar) problemas.push(m[0].replace(/^[\s"'{:]/, ''));
			}
		}
		expect(problemas, 'use tokens (text-foreground, bg-card, text-status-danger…)').toEqual([]);
	});

	it('sem cor arbitrária em classe (bg-[#…], text-[rgb(…)])', () => {
		expect(marcacao.match(/-\[(?:#|rgb|hsl\(\d)[^\]]*\]/g) ?? []).toEqual([]);
	});

	it('<style> só com hsl(var(--token))', () => {
		const semComentario = estilo.replace(/\/\*[\s\S]*?\*\//g, '');
		const fixas =
			semComentario.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\((?!var\()|\b(?:white|black)\b(?!-)/gi) ??
			[];
		expect(fixas).toEqual([]);
	});

	it('todo token usado existe nos dois temas', () => {
		const usados = new Set<string>();
		for (const m of marcacao.matchAll(
			/\b(?:text|bg|border|stroke|fill|ring|ring-offset|placeholder)-(status-\w+|primary(?:-foreground)?|card(?:-foreground)?|popover(?:-foreground)?|muted(?:-foreground)?|foreground|background|border|input|ring)\b/g
		)) {
			usados.add(m[1]);
		}
		for (const m of estilo.matchAll(/var\(--([\w-]+)\)/g)) usados.add(m[1]);
		for (const token of usados) {
			expect(TOKENS.claro[token], `--${token} em :root`).toBeDefined();
			expect(TOKENS.escuro[token], `--${token} em .dark`).toBeDefined();
		}
	});
});
