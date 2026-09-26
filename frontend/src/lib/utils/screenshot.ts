/**
 * Screenshot utility — captura um elemento DOM como PNG e faz o download.
 * Usa html2canvas-pro (suporta oklab/oklch do Tailwind v4), com fallback nativo.
 */

const PADDING = 32;
const BORDER_RADIUS = 12;
/** Fundo histórico do PNG no tema escuro — mantido idêntico ao original. */
const BG_COLOR_DARK = '#0a0a0f';
/** Fundo do PNG no tema claro: hex de `--background` (255 71% 99%) do app.css. */
const BG_COLOR_LIGHT = '#fcfbfe';

/**
 * Fundo opaco do PNG segue o tema ativo (classe `.dark` no <html>), como
 * MontadorGradeView e PlanoFormaturaView: fundo preto sob texto escuro (light)
 * saía ilegível.
 */
function resolveBackgroundColor(): string {
	return document.documentElement.classList.contains('dark') ? BG_COLOR_DARK : BG_COLOR_LIGHT;
}

export async function captureScreenshot(
	element: HTMLElement,
	filename = 'fluxograma.png'
): Promise<void> {
	try {
		const bgColor = resolveBackgroundColor();
		let html2canvas: ((el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>) | null = null;
		try {
			const mod = await import('html2canvas-pro');
			html2canvas = mod.default ?? mod;
		} catch {
			// html2canvas não instalado — usa fallback
		}

		let canvas: HTMLCanvasElement;

		if (html2canvas) {
			// Resolução: 3x para texto nítido, limitado pelo tamanho máximo de canvas
			const rect = element.getBoundingClientRect();
			const MAX_CANVAS_DIM = 12000;
			const scale = Math.max(2, Math.min(3, MAX_CANVAS_DIM / Math.max(rect.width, rect.height, 1)));

			canvas = await html2canvas(element, {
				backgroundColor: bgColor,
				scale,
				useCORS: true,
				logging: false,
				allowTaint: false,
				onclone: (doc: Document, clonedEl: HTMLElement) => {
					clonedEl.style.overflow = 'visible';
					clonedEl.style.background = bgColor;
					// html2canvas pinta box-shadow/backdrop-filter como manchas claras
					// ("escudo" em volta dos cards) — zera tudo no clone para a
					// captura sair limpa; só afeta a imagem, não a tela real.
					const style = doc.createElement('style');
					style.textContent = `
						*, *::before, *::after {
							box-shadow: none !important;
							text-shadow: none !important;
							filter: none !important;
							backdrop-filter: none !important;
							-webkit-backdrop-filter: none !important;
						}
					`;
					doc.head.appendChild(style);
				}
			});
			canvas = addPaddingAndRoundedCorners(canvas, bgColor);
		} else {
			canvas = await captureWithSvgFallback(element, bgColor);
		}

		downloadCanvas(canvas, filename);
	} catch (error) {
		console.error('Screenshot failed:', error);
		throw new Error('Não foi possível capturar a imagem do fluxograma.');
	}
}

async function captureWithSvgFallback(element: HTMLElement, bgColor: string): Promise<HTMLCanvasElement> {
	const rect = element.getBoundingClientRect();
	const width = Math.round(rect.width);
	const height = Math.round(rect.height);

	const clone = element.cloneNode(true) as HTMLElement;
	const styles = getComputedStyle(element);
	clone.style.width = `${width}px`;
	clone.style.height = `${height}px`;
	clone.style.overflow = 'visible';
	clone.style.background = styles.background || bgColor;

	const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${clone.outerHTML}</div></foreignObject></svg>`;
	const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
	const url = URL.createObjectURL(svgBlob);

	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = (width + PADDING * 2) * 2;
			canvas.height = (height + PADDING * 2) * 2;
			const ctx = canvas.getContext('2d')!;
			ctx.fillStyle = bgColor;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.scale(2, 2);
			ctx.drawImage(img, PADDING, PADDING);
			URL.revokeObjectURL(url);
			resolve(canvas);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Falha ao renderizar screenshot'));
		};
		img.src = url;
	});
}

function addPaddingAndRoundedCorners(source: HTMLCanvasElement, bgColor: string): HTMLCanvasElement {
	const pad = PADDING * 2;
	const w = source.width + pad;
	const h = source.height + pad;

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d')!;

	ctx.fillStyle = bgColor;
	if (typeof ctx.roundRect === 'function') {
		ctx.beginPath();
		ctx.roundRect(0, 0, w, h, BORDER_RADIUS * 2);
		ctx.fill();
	} else {
		ctx.fillRect(0, 0, w, h);
	}
	ctx.drawImage(source, PADDING, PADDING);

	return canvas;
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
	const link = document.createElement('a');
	link.download = filename;
	link.href = canvas.toDataURL('image/png');
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}
