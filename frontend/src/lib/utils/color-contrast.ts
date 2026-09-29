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
