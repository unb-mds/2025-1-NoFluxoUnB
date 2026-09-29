/**
 * Contraste WCAG 2.x entre cores sRGB em hex (#rrggbb). Usado nos testes de
 * acessibilidade das cores do fluxograma (texto normal pede >= 4.5:1, AA).
 */

export type Rgb = readonly [number, number, number];

export const WCAG_AA_NORMAL_TEXT = 4.5;

export function hexToRgb(hex: string): Rgb {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) throw new Error(`cor hex inválida: ${hex}`);
	const n = parseInt(m[1], 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Luminância relativa (WCAG 2.x, sRGB linearizado). */
export function relativeLuminance(rgb: Rgb): number {
	const [r, g, b] = rgb.map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste entre duas cores opacas (1 a 21). */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
	const la = relativeLuminance(typeof a === 'string' ? hexToRgb(a) : a);
	const lb = relativeLuminance(typeof b === 'string' ? hexToRgb(b) : b);
	const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
	return (hi + 0.05) / (lo + 0.05);
}

/** Cor resultante de `fg` com opacidade `alpha` sobre `bg` opaco (ex.: `text-white/80`). */
export function blend(fg: Rgb | string, alpha: number, bg: Rgb | string): Rgb {
	const f = typeof fg === 'string' ? hexToRgb(fg) : fg;
	const k = typeof bg === 'string' ? hexToRgb(bg) : bg;
	return [0, 1, 2].map((i) => Math.round(f[i] * alpha + k[i] * (1 - alpha))) as unknown as Rgb;
}

/** Elementos gráficos (bordas, anéis, ícones que carregam informação): >= 3:1, AA. */
export const WCAG_AA_NON_TEXT = 3;

/**
 * Converte o valor de um token HSL do design system (`"262 83% 53%"`, formato
 * shadcn usado em app.css) para sRGB 0–255.
 */
export function hslToRgb(value: string): Rgb {
	const m = /^\s*(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(value);
	if (!m) throw new Error(`token HSL inválido: ${value}`);
	const h = (((parseFloat(m[1]) % 360) + 360) % 360) / 360;
	const s = parseFloat(m[2]) / 100;
	const l = parseFloat(m[3]) / 100;
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const canal = (t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	return [canal(h + 1 / 3), canal(h), canal(h - 1 / 3)].map((v) => Math.round(v * 255)) as unknown as Rgb;
}

function customProps(block: string): Record<string, string> {
	const out: Record<string, string> = {};
	const semComentarios = block.replace(/\/\*[\s\S]*?\*\//g, '');
	for (const m of semComentarios.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
	return out;
}

function blockAfter(css: string, selector: RegExp): string {
	const m = selector.exec(css);
	if (!m) throw new Error(`bloco ${selector} não encontrado`);
	const start = css.indexOf('{', m.index) + 1;
	let depth = 1;
	let i = start;
	for (; i < css.length && depth > 0; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}') depth--;
	}
	return css.slice(start, i - 1);
}

/**
 * Tokens de cada tema a partir do app.css: `light` = `:root`, `dark` = `:root`
 * sobrescrito por `.dark` (a classe fica no `<html>`, que também casa `:root`).
 */
export function readThemeTokens(css: string): { light: Record<string, string>; dark: Record<string, string> } {
	const light = customProps(blockAfter(css, /(^|[\s}]):root\s*\{/));
	const dark = { ...light, ...customProps(blockAfter(css, /(^|[\s}])\.dark\s*\{/)) };
	return { light, dark };
}
