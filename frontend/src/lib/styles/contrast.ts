/**
 * Utilitários de contraste (WCAG 2.x) para testar as cores do design system
 * nos dois temas. Usado só em testes: lê os tokens HSL de `app.css`
 * (`:root` = light, `.dark` = dark) e as cores `oklch()` da paleta do Tailwind 4.
 *
 * Mínimos WCAG AA: texto normal ≥ 4,5:1; elementos gráficos/ícones ≥ 3:1.
 */

export type Rgb = [number, number, number]; // 0–255
export type Tema = 'light' | 'dark';
export type Tokens = Record<string, string>; // nome sem "--" → "H S% L%"

export const MIN_TEXTO = 4.5;
export const MIN_GRAFICO = 3;

export function hslParaRgb(h: number, s: number, l: number): Rgb {
	s /= 100;
	l /= 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Aceita o formato dos tokens do app.css: "262 83% 53%". */
export function tokenHslParaRgb(valor: string): Rgb {
	const [h, s, l] = valor
		.trim()
		.split(/\s+/)
		.map((p) => parseFloat(p));
	if ([h, s, l].some((n) => Number.isNaN(n))) throw new Error(`HSL inválido: "${valor}"`);
	return hslParaRgb(h, s, l);
}

/** Converte `oklch(L% C H)` (formato da paleta do Tailwind 4) para sRGB. */
export function oklchParaRgb(valor: string): Rgb {
	const m = valor.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/);
	if (!m) throw new Error(`oklch inválido: "${valor}"`);
	const L = parseFloat(m[1]) / 100;
	const C = parseFloat(m[2]);
	const H = (parseFloat(m[3]) * Math.PI) / 180;
	const a = C * Math.cos(H);
	const b = C * Math.sin(H);
	const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const lin = [
		4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
		-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
		-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
	];
	return lin.map((v) => {
		const c = Math.min(1, Math.max(0, v));
		const srgb = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
		return srgb * 255;
	}) as Rgb;
}

/** Compõe `fg` com opacidade `alpha` sobre `bg` (como `hsl(x / alpha)` no CSS). */
export function misturar(fg: Rgb, alpha: number, bg: Rgb): Rgb {
	return fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as Rgb;
}

export function luminancia([r, g, b]: Rgb): number {
	const lin = (v: number) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function razaoContraste(a: Rgb, b: Rgb): number {
	const la = luminancia(a);
	const lb = luminancia(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Extrai os tokens `--nome: valor;` do primeiro bloco `seletor {` encontrado. */
function tokensDoBloco(css: string, seletor: string): Tokens {
	const inicio = css.search(new RegExp(`(^|\\s)${seletor.replace('.', '\\.')}\\s*\\{`));
	if (inicio < 0) throw new Error(`bloco "${seletor}" não encontrado no CSS`);
	const abre = css.indexOf('{', inicio);
	const fecha = css.indexOf('}', abre);
	const corpo = css.slice(abre + 1, fecha);
	const tokens: Tokens = {};
	for (const m of corpo.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
	return tokens;
}

/** Tokens de cada tema a partir do conteúdo de `src/app.css`. */
export function tokensPorTema(appCss: string): Record<Tema, Tokens> {
	return { light: tokensDoBloco(appCss, ':root'), dark: tokensDoBloco(appCss, '.dark') };
}

/** Paleta do Tailwind 4 (`--color-purple-700: oklch(...)`) a partir de `tailwindcss/theme.css`. */
export function paletaTailwind(themeCss: string): Record<string, Rgb> {
	const cores: Record<string, Rgb> = {};
	for (const m of themeCss.matchAll(/--color-([a-z]+-\d{2,3}):\s*(oklch\([^)]+\));/g)) {
		cores[m[1]] = oklchParaRgb(m[2]);
	}
	return cores;
}
