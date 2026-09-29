/**
 * Contraste light/dark dos componentes do Darcy (login, rodinha de uso, card de
 * limite, pedido de mais perguntas, painel de aprovação), do card "Darcy hoje" e
 * dos cards novos do dashboard admin (sem preço, saúde do log de IA, suporte).
 *
 * Regra do produto: o que existe no escuro tem que funcionar no claro. Aqui:
 *  1. os tokens HSL são lidos do app.css (`:root` = claro, `.dark` = escuro)
 *     pelo helper compartilhado (lib/styles/contraste.ts), e cada combinação
 *     texto/fundo usada nesses componentes — empilhada sobre o fundo REAL da
 *     página (--page-background, liso e no glow) — tem que dar ≥ 4,5:1 (texto)
 *     ou ≥ 3:1 (anel, ícones de status) nos DOIS temas;
 *  2. os arquivos desses componentes não podem usar cor fixa que só funciona
 *     num tema (text-white, bg-zinc-950, stroke-sky-400, rgba(255,…), hex…)
 *     sem o par `dark:` — é o que quebra quando alguém volta a usar a cor
 *     "que fica bonita no escuro".
 */
import { describe, expect, it } from 'vitest';
import { TOKEN_RODINHA } from '$lib/utils/darcy-cota';
import {
	TOKENS as TOKENS_POR_TEMA,
	contraste,
	lerSrc as ler,
	piorContraste,
	token,
	type Camada,
	type Rgb as RGB,
	type Tema as TemaHelper
} from './contraste';

// ─── Tokens do app.css (helper compartilhado) ────────────────────────────────

type Tema = 'claro' | 'escuro';
const DO_HELPER: Record<Tema, TemaHelper> = { claro: 'light', escuro: 'dark' };
const TOKENS: Record<Tema, Record<string, string>> = {
	claro: TOKENS_POR_TEMA.light,
	escuro: TOKENS_POR_TEMA.dark
};
const TEMAS: Tema[] = ['claro', 'escuro'];

/** Cor opaca de um token no tema. */
function cor(tema: Tema, nome: string): RGB {
	return token(DO_HELPER[tema], nome);
}

/** `token` ou `token/alfa` (ex. 'status-danger/0.1') como camada. */
function camada(spec: string): Camada {
	const [nome, alfa] = spec.split('/');
	return { token: nome, alfa: alfa === undefined ? 1 : Number(alfa) };
}

/**
 * Pior contraste de `frente` sobre `fundo` (e `base` por baixo dele), tudo
 * empilhado no fundo REAL da página (--page-background liso e no glow).
 */
function medir(tema: Tema, frente: string, fundo: string, base?: string): number {
	const camadas = [...(base ? [camada(base)] : []), camada(fundo)];
	return piorContraste(DO_HELPER[tema], camada(frente), camadas);
}

// ─── Cor real de um seletor no <style> de um componente ──────────────────────

/** Conteúdo do <style> de um .svelte. */
function estiloDe(rel: string): string {
	return /<style[^>]*>([\s\S]*?)<\/style>/.exec(ler(rel))?.[1] ?? '';
}

/** Token de `color: hsl(var(--token))` na regra cujo seletor é exatamente `seletor`. */
function tokenDaRegra(estilo: string, seletor: string): string | undefined {
	const semComentario = estilo.replace(/\/\*[\s\S]*?\*\//g, '');
	for (const m of semComentario.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
		const seletores = m[1].split(',').map((x) => x.trim().replace(/\s+/g, ' '));
		if (!seletores.includes(seletor)) continue;
		const c = /(?:^|;|\s)color:\s*hsl\(var\(--([\w-]+)\)\)/.exec(m[2]);
		if (c) return c[1];
	}
	return undefined;
}

/**
 * Cor do texto de `.classe` nos dois temas, lida do CSS do componente:
 * claro = `.classe`, escuro = `:global(.dark) .classe` (ou o do claro).
 */
function corDaClasse(rel: string, classe: string): Record<Tema, string> {
	const estilo = estiloDe(rel);
	const claro = tokenDaRegra(estilo, `.${classe}`);
	if (!claro) throw new Error(`${rel}: .${classe} sem color: hsl(var(--token))`);
	return { claro, escuro: tokenDaRegra(estilo, `:global(.dark) .${classe}`) ?? claro };
}

const PAGINA_DASHBOARD = 'routes/(protected)/admin/dashboard/+page.svelte';
const SUPORTE_CARD = 'lib/components/admin/dashboard/SuporteCard.svelte';

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
		onde: 'card "Darcy hoje": "Ver pedidos nos tickets" (CSS da página)',
		frente: corDaClasse(PAGINA_DASHBOARD, 'ticket-link'),
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
		onde: 'suporte: "Ver todos os tickets" (CSS do SuporteCard)',
		frente: corDaClasse(SUPORTE_CARD, 'link'),
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
		const r = medir(tema, frenteDo(frente), fundo, base);
		expect(r, `${frente} sobre ${fundo}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
	});

	it.each(GRAFICO)('gráfico ≥ 3:1 — $onde', ({ frente, fundo, base }) => {
		const r = medir(tema, frenteDo(frente), fundo, base);
		expect(r, `${frente} sobre ${fundo}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
	});
});

describe('links do dashboard lidos do CSS real', () => {
	it('o leitor acha a cor de cada tema no <style>, com token dos dois temas', () => {
		for (const par of [corDaClasse(PAGINA_DASHBOARD, 'ticket-link'), corDaClasse(SUPORTE_CARD, 'link')]) {
			for (const tema of TEMAS) expect(TOKENS[tema][par[tema]], `${tema}: --${par[tema]}`).toBeDefined();
		}
	});

	it('lê a regra do escuro separada da do claro', () => {
		const css = '.x { color: hsl(var(--primary)); } :global(.dark) .x { color: hsl(var(--ai)); }';
		expect(tokenDaRegra(css, '.x')).toBe('primary');
		expect(tokenDaRegra(css, ':global(.dark) .x')).toBe('ai');
	});

	it('sem o override do escuro, o --primary não passa de 4,5:1 sobre o card', () => {
		const semDark = '.x { color: hsl(var(--primary)); }';
		expect(tokenDaRegra(semDark, ':global(.dark) .x')).toBeUndefined();
		expect(contraste(cor('escuro', 'primary'), cor('escuro', 'card'))).toBeLessThan(4.5);
	});
});

describe('por que não dá para voltar a sky/amber/rose-400 fixos', () => {
	it('os tons -400 do anel antigo não chegam a 3:1 sobre o fundo claro da página', () => {
		for (const hex of ['#38bdf8' /* sky-400 */, '#fbbf24' /* amber-400 */]) {
			expect(piorContraste('light', { cor: hex })).toBeLessThan(3);
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
