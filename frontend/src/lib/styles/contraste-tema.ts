/**
 * Contraste WCAG 2.x das classes Tailwind nos dois temas do design system.
 *
 * Lê os tokens HSL de `app.css` (`:root` = claro, `.dark` = escuro) e a paleta do
 * Tailwind (oklch/hex) e resolve uma lista de classes como o navegador faria:
 * no tema escuro a variante `dark:` vence; no claro vale só a classe sem variante.
 * Usado pelos testes de tema — não é importado pela aplicação.
 */

export type Rgb = readonly [number, number, number];
export type Tema = 'light' | 'dark';
export type Tokens = Record<Tema, Record<string, string>>;
export type Paleta = Record<string, string | Record<string, string>>;
export type Propriedade = 'text' | 'bg' | 'border' | 'stroke';

/** Texto normal (AA). */
export const MIN_TEXTO = 4.5;
/** Componentes gráficos: ícones, anel de progresso, bordas de status (WCAG 1.4.11). */
export const MIN_GRAFICO = 3;

/** Extrai `--nome: valor;` dos blocos `:root { }` e `.dark { }` do app.css. */
export function lerTokens(css: string): Tokens {
	const bloco = (seletor: RegExp): Record<string, string> => {
		const m = seletor.exec(css);
		if (!m) throw new Error(`bloco ${seletor} não encontrado no app.css`);
		const corpo = css.slice(m.index + m[0].length, css.indexOf('}', m.index));
		const out: Record<string, string> = {};
		for (const [, nome, valor] of corpo.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
			out[nome] = valor.trim();
		}
		return out;
	};
	return { light: bloco(/:root\s*\{/), dark: bloco(/\n\s*\.dark\s*\{/) };
}

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

/** Converte `#rgb`, `#rrggbb`, `oklch(L% C H)` ou `H S% L%` (token shadcn) em sRGB 0–255. */
export function parseCor(valor: string): Rgb {
	const v = valor.trim();
	let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
	if (m) {
		const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
		const n = parseInt(hex, 16);
		return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
	}
	m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(v);
	if (m) return oklchParaRgb(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
	m = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(v);
	if (m) return hslParaRgb(Number(m[1]), Number(m[2]), Number(m[3]));
	throw new Error(`cor não suportada: ${valor}`);
}

function luminancia([r, g, b]: Rgb): number {
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

/** `fg` com opacidade `alfa` sobre `bg` opaco. */
export function compor(fg: Rgb, alfa: number, bg: Rgb): Rgb {
	return [0, 1, 2].map((i) => fg[i] * alfa + bg[i] * (1 - alfa)) as unknown as Rgb;
}

export interface CorResolvida {
	rgb: Rgb;
	alfa: number;
	classe: string;
}

/**
 * Cor efetiva de `prop` numa lista de classes, no tema dado. Ignora classes com
 * outras variantes (hover:, sm:...) e utilitários que não são cor (text-sm, border-2).
 */
export function resolverClasse(
	classes: string,
	prop: Propriedade,
	tema: Tema,
	tokens: Tokens,
	paleta: Paleta
): CorResolvida | null {
	const re = new RegExp(`^(dark:)?${prop}-([a-z]+(?:-[a-z]+)*(?:-\\d{2,3})?)(?:/(\\d+|\\[[\\d.]+\\]))?$`);
	let escolhida: CorResolvida | null = null;
	for (const c of classes.split(/\s+/)) {
		const m = re.exec(c);
		if (!m) continue;
		const [, dark, nome, alfaTxt] = m;
		if (dark && tema === 'light') continue;
		const rgb = corDoNome(nome, tema, tokens, paleta);
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

function corDoNome(nome: string, tema: Tema, tokens: Tokens, paleta: Paleta): Rgb | null {
	const token = tokens[tema][nome];
	if (token && /^[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(token)) return parseCor(token);
	const m = /^([a-z]+)-(\d{2,3})$/.exec(nome);
	if (m) {
		const familia = paleta[m[1]];
		if (familia && typeof familia === 'object' && familia[m[2]]) return parseCor(familia[m[2]]);
		return null;
	}
	const simples = paleta[nome];
	return typeof simples === 'string' ? parseCor(simples) : null;
}

/**
 * Fundo efetivo: o `--background` do tema com cada camada (`bg-...`) composta por
 * cima, da mais externa para a mais interna.
 */
export function fundoEfetivo(
	camadas: string[],
	tema: Tema,
	tokens: Tokens,
	paleta: Paleta
): Rgb {
	let bg = parseCor(tokens[tema].background);
	for (const camada of camadas) {
		const cor = resolverClasse(camada, 'bg', tema, tokens, paleta);
		if (cor) bg = compor(cor.rgb, cor.alfa, bg);
	}
	return bg;
}
