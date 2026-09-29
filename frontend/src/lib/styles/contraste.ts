/**
 * Contraste WCAG 2.x nos dois temas do design system — helper COMPARTILHADO
 * dos testes de tema (não é importado pela aplicação).
 *
 * - Lê os tokens HSL de `src/app.css`: `light` = `:root`; `dark` = `:root`
 *   sobrescrito por `.dark` (a classe fica no <html>, que também casa `:root`).
 * - Resolve classes Tailwind (tokens do design system e paleta do Tailwind),
 *   com `dark:` vencendo no escuro.
 * - Compõe camadas com alfa SOBRE O FUNDO REAL DA PÁGINA: o `--page-background`
 *   que o `PageBackground.svelte` pinta (no escuro, o #050505 de produção), e
 *   também sobre esse fundo com o glow roxo do PageBackground no pico — o
 *   contraste que vale é o pior dos dois. Medir contra `--background` é premissa
 *   falsa: não é ele que aparece atrás do conteúdo.
 *
 * Mínimos AA: texto normal ≥ 4,5:1; gráficos (ícone, anel, borda) ≥ 3:1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import colors from 'tailwindcss/colors';

export type Rgb = readonly [number, number, number];
export type Tema = 'light' | 'dark';
export type Tokens = Record<Tema, Record<string, string>>;
export type Propriedade = 'text' | 'bg' | 'border' | 'stroke' | 'fill' | 'ring' | 'from' | 'to';

export const TEMAS: readonly Tema[] = ['light', 'dark'];
export const MIN_TEXTO = 4.5;
export const MIN_GRAFICO = 3;

// ─── Leitura do CSS ──────────────────────────────────────────────────────────

const SRC = fileURLToPath(new URL('../../', import.meta.url));
/** Lê um arquivo relativo a `frontend/src/`. */
export const lerSrc = (rel: string) => readFileSync(SRC + rel, 'utf8');

const semComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function blocoApos(css: string, seletor: RegExp): string {
	const m = seletor.exec(css);
	if (!m) throw new Error(`bloco ${seletor} não encontrado`);
	const inicio = css.indexOf('{', m.index) + 1;
	let prof = 1;
	let i = inicio;
	for (; i < css.length && prof > 0; i++) {
		if (css[i] === '{') prof++;
		else if (css[i] === '}') prof--;
	}
	return css.slice(inicio, i - 1);
}

function propriedades(bloco: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [, nome, valor] of semComentarios(bloco).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
		out[nome] = valor.trim();
	}
	return out;
}

/** Tokens de cada tema a partir do conteúdo do app.css. */
export function lerTokens(css: string): Tokens {
	const limpo = semComentarios(css);
	const light = propriedades(blocoApos(limpo, /(^|[\s}]):root\s*\{/));
	const dark = { ...light, ...propriedades(blocoApos(limpo, /(^|[\s}])\.dark\s*\{/)) };
	return { light, dark };
}

/** Tokens do app.css real. */
export const TOKENS: Tokens = lerTokens(lerSrc('app.css'));

/** Paleta do Tailwind (hex/oklch), ex. `PALETA.purple['700']`, `PALETA.white`. */
export const PALETA = colors as unknown as Record<string, string | Record<string, string>>;

// ─── Cor ─────────────────────────────────────────────────────────────────────

function hslParaRgb(h: number, s: number, l: number): Rgb {
	s /= 100;
	l /= 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function oklchParaRgb(L: number, C: number, H: number): Rgb {
	const hr = (H * Math.PI) / 180;
	const a = C * Math.cos(hr);
	const b = C * Math.sin(hr);
	const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const lin = [
		4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
		-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
		-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
	];
	const gama = (c: number) => {
		const v = Math.min(1, Math.max(0, c));
		return (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
	};
	return [gama(lin[0]), gama(lin[1]), gama(lin[2])];
}

/** `#rgb`, `#rrggbb`, `rgb(r g b)`/`rgb(r,g,b)`, `oklch(L% C H)` ou token shadcn `H S% L%` → sRGB 0–255. */
export function parseCor(valor: string): Rgb {
	const v = valor.trim();
	let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
	if (m) {
		const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
		const n = parseInt(hex, 16);
		return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
	}
	m = /^rgb\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*\)$/.exec(v);
	if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
	m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(v);
	if (m) return oklchParaRgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
	m = /^(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%$/.exec(v);
	if (m) return hslParaRgb(((Number(m[1]) % 360) + 360) % 360, Number(m[2]), Number(m[3]));
	throw new Error(`cor não suportada: ${valor}`);
}

export function luminancia([r, g, b]: Rgb): number {
	const lin = (v: number) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contraste(a: Rgb, b: Rgb): number {
	const [hi, lo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** `fg` com opacidade `alfa` sobre `bg` opaco (como `hsl(x / alfa)` no CSS). */
export function compor(fg: Rgb, alfa: number, bg: Rgb): Rgb {
	return [0, 1, 2].map((i) => fg[i] * alfa + bg[i] * (1 - alfa)) as unknown as Rgb;
}

/** Cor de um token (`'status-danger'`) no tema; erro se não existir. */
export function token(tema: Tema, nome: string): Rgb {
	const v = TOKENS[tema][nome];
	if (v === undefined) throw new Error(`token --${nome} ausente no tema ${tema}`);
	return parseCor(v);
}

// ─── Classes Tailwind ────────────────────────────────────────────────────────

export interface CorResolvida {
	rgb: Rgb;
	alfa: number;
	classe: string;
}

function corDoNome(nome: string, tema: Tema): Rgb | null {
	const arbitraria = /^\[(.+)\]$/.exec(nome);
	if (arbitraria) return parseCor(arbitraria[1]);
	const tok = TOKENS[tema][nome];
	if (tok && /^-?[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(tok)) return parseCor(tok);
	const m = /^([a-z]+)-(\d{2,3})$/.exec(nome);
	if (m) {
		const familia = PALETA[m[1]];
		return familia && typeof familia === 'object' && familia[m[2]] ? parseCor(familia[m[2]]) : null;
	}
	const simples = PALETA[nome];
	return typeof simples === 'string' ? parseCor(simples) : null;
}

/**
 * Cor efetiva de `prop` numa lista de classes, no tema dado (como o navegador:
 * no escuro `dark:` vence; no claro só vale a classe sem variante). Ignora
 * outras variantes (hover:, sm:…) e utilitários que não são cor (text-sm).
 */
export function resolverClasse(classes: string, prop: Propriedade, tema: Tema): CorResolvida | null {
	const re = new RegExp(
		`^(dark:)?${prop}-((?:\\[[^\\]]+\\])|[a-z]+(?:-[a-z]+)*(?:-\\d{2,3})?)(?:/(\\d+|\\[[\\d.]+\\]))?$`
	);
	let escolhida: CorResolvida | null = null;
	for (const c of classes.split(/\s+/)) {
		const m = re.exec(c);
		if (!m) continue;
		const [, dark, nome, alfaTxt] = m;
		if (dark && tema === 'light') continue;
		const rgb = corDoNome(nome, tema);
		if (!rgb) continue;
		const alfa = alfaTxt
			? alfaTxt.startsWith('[')
				? Number(alfaTxt.slice(1, -1))
				: Number(alfaTxt) / 100
			: 1;
		// `dark:` sempre vence no escuro; entre iguais, a última.
		if (!escolhida || dark || !escolhida.classe.startsWith('dark:')) {
			escolhida = { rgb, alfa, classe: c };
		}
	}
	return escolhida;
}

// ─── Fundo real da página ────────────────────────────────────────────────────

/** Opacidade máxima dos glows do PageBackground, lida do próprio componente. */
export function opacidadeMaxDoGlow(fontePageBackground = lerSrc('lib/components/effects/PageBackground.svelte')): number {
	const estilo = semComentarios(/<style[^>]*>([\s\S]*?)<\/style>/.exec(fontePageBackground)?.[1] ?? '');
	const ops: number[] = [];
	for (const [, seletor, corpo] of estilo.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
		if (!seletor.includes('.nofluxo-bg-glow')) continue;
		const o = /(?:^|;|\s)opacity:\s*([\d.]+)/.exec(corpo);
		if (o) ops.push(Number(o[1]));
	}
	if (!ops.length) throw new Error('PageBackground: opacidade do glow não encontrada');
	return Math.max(...ops);
}

/** Fundo liso da página no tema (`--page-background`). */
export function fundoDaPagina(tema: Tema): Rgb {
	return token(tema, 'page-background');
}

/**
 * Fundos reais atrás do conteúdo: o liso e o do pico do glow roxo
 * (`--primary` × `--page-glow-alpha` × opacidade do elemento).
 */
export function fundosDaPagina(tema: Tema): Rgb[] {
	const liso = fundoDaPagina(tema);
	const alfaGlow = Number(TOKENS[tema]['page-glow-alpha']) * opacidadeMaxDoGlow();
	if (!Number.isFinite(alfaGlow)) throw new Error(`--page-glow-alpha inválido no tema ${tema}`);
	return [liso, compor(token(tema, 'primary'), alfaGlow, liso)];
}

/**
 * Uma camada de fundo: classes Tailwind (usa o `bg-*` efetivo), ou
 * `{ token, alfa }` / `{ cor, alfa }` (cor = hex/oklch/rgb ou Rgb).
 */
export type Camada = string | { token: string; alfa?: number } | { cor: string | Rgb; alfa?: number };

function camadaRgb(camada: Camada, tema: Tema, prop: Propriedade = 'bg'): { rgb: Rgb; alfa: number } | null {
	if (typeof camada === 'string') {
		const r = resolverClasse(camada, prop, tema);
		return r && { rgb: r.rgb, alfa: r.alfa };
	}
	if ('token' in camada) return { rgb: token(tema, camada.token), alfa: camada.alfa ?? 1 };
	const rgb = typeof camada.cor === 'string' ? parseCor(camada.cor) : camada.cor;
	return { rgb, alfa: camada.alfa ?? 1 };
}

/** Compõe as camadas (da mais externa para a mais interna) sobre `base`. */
export function empilhar(tema: Tema, camadas: Camada[], base: Rgb): Rgb {
	let bg = base;
	for (const c of camadas) {
		const r = camadaRgb(c, tema);
		if (r) bg = compor(r.rgb, r.alfa, bg);
	}
	return bg;
}

/** Fundo efetivo sobre a página lisa (sem glow). */
export function fundoEfetivo(tema: Tema, camadas: Camada[] = []): Rgb {
	return empilhar(tema, camadas, fundoDaPagina(tema));
}

/**
 * Pior contraste de `frente` sobre as `camadas` empilhadas no fundo real da
 * página (liso e com glow). `frente` pode ser classes Tailwind (lê `prop`,
 * padrão `text`, e aplica o alfa dela) ou `{ token | cor, alfa }`.
 */
export function piorContraste(
	tema: Tema,
	frente: Camada,
	camadas: Camada[] = [],
	prop: Propriedade = 'text'
): number {
	const fg = camadaRgb(frente, tema, prop);
	if (!fg) throw new Error(`sem cor de ${prop} em ${JSON.stringify(frente)} (${tema})`);
	return Math.min(
		...fundosDaPagina(tema).map((pagina) => {
			const bg = empilhar(tema, camadas, pagina);
			return contraste(compor(fg.rgb, fg.alfa, bg), bg);
		})
	);
}
