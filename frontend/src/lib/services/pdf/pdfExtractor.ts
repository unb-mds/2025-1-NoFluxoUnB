import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const LOG_PREFIX = '[PDF-Extractor]';

let pdfjsLoaded = false;

/**
 * Dynamically imports pdfjs-dist so it is never evaluated during SSR
 * (the library references DOMMatrix at module scope, which doesn't exist in Node).
 *
 * Uses worker from static folder (copied by postinstall) — avoids 404s in production
 * caused by Vite's file hashing and cache mismatches.
 */
/**
 * Use a local worker wrapper that polyfills Uint8Array.prototype.toHex/fromHex
 * before loading the real pdf.worker.min.mjs. This fixes crashes on browsers
 * that don't yet support these newer JS APIs (e.g. older Chrome/Edge).
 */
const PDFJS_WORKER_SRC = '/pdf.worker.polyfilled.mjs';

async function getPdfjs() {
	const pdfjs = await import('pdfjs-dist');
	if (!pdfjsLoaded) {
		pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
		pdfjsLoaded = true;
	}
	return pdfjs;
}

/** Threshold in points for grouping text items into the same line by Y proximity. */
const Y_PROXIMITY_THRESHOLD = 3;

/** Distance in points beyond which a space is inserted between items. */
const SPACE_GAP_THRESHOLD = 10;

/** Estimated width per character in points (for fallback width calculation). */
const CHAR_WIDTH_ESTIMATE = 6;

/** Maximum number of spaces inserted for a single gap. */
const MAX_SPACES = 10;

export interface PositionedTextItem {
	text: string;
	x: number;
	y: number;
	width: number;
}

/**
 * Groups text items into lines based on Y-position proximity.
 * Items within `Y_PROXIMITY_THRESHOLD` points of each other are considered
 * to be on the same line.
 *
 * Optimized: sorts items by Y first for O(n log n) instead of O(n*m).
 */
function groupItemsIntoLines(items: PositionedTextItem[]): Map<number, PositionedTextItem[]> {
	const lines = new Map<number, PositionedTextItem[]>();
	if (items.length === 0) return lines;

	const sorted = [...items].sort((a, b) => a.y - b.y);
	let currentKey = sorted[0].y;
	let currentGroup: PositionedTextItem[] = [sorted[0]];
	lines.set(currentKey, currentGroup);

	for (let i = 1; i < sorted.length; i++) {
		const item = sorted[i];
		if (Math.abs(item.y - currentKey) <= Y_PROXIMITY_THRESHOLD) {
			currentGroup.push(item);
		} else {
			currentKey = item.y;
			currentGroup = [item];
			lines.set(currentKey, currentGroup);
		}
	}

	return lines;
}

/**
 * Reconstructs a single line of text from a set of items sorted by X position.
 * Inserts spaces between items when the horizontal gap exceeds
 * `SPACE_GAP_THRESHOLD` points, matching the Python backend logic:
 *   spaces = max(1, int((x - lastX) / 6)), capped at 10.
 */
function reconstructLine(items: PositionedTextItem[]): string {
	// Sort items left-to-right by X position
	items.sort((a, b) => a.x - b.x);

	let result = '';
	let lastX = -Infinity;

	for (const item of items) {
		if (lastX > -Infinity && item.x > lastX + SPACE_GAP_THRESHOLD) {
			const gap = item.x - lastX;
			const spaceCount = Math.min(Math.max(1, Math.floor(gap / CHAR_WIDTH_ESTIMATE)), MAX_SPACES);
			result += ' '.repeat(spaceCount);
		}

		result += item.text;

		// Estimate end position: use actual width if available, otherwise estimate
		const textWidth = item.width > 0 ? item.width : item.text.length * CHAR_WIDTH_ESTIMATE;
		lastX = item.x + textWidth;
	}

	return result;
}

/**
 * Extract PositionedTextItem[] from a single PDF page's text content.
 */
function extractItemsFromTextContent(textContent: { items: unknown[] }): PositionedTextItem[] {
	const items: PositionedTextItem[] = [];
	for (const item of textContent.items) {
		if (!('str' in (item as Record<string, unknown>))) continue;
		const textItem = item as TextItem;
		const text = textItem.str.trim();
		if (!text) continue;
		items.push({
			text,
			x: textItem.transform[4],
			y: textItem.transform[5],
			width: textItem.width
		});
	}
	return items;
}

/**
 * Traduz o erro do pdf.js para uma mensagem em pt-BR. O uploadStore mostra
 * err.message direto no toast, e antes o aluno via "No password given" ou
 * "Invalid PDF structure" (pré-mortem R38).
 */
export function mensagemErroPdfjs(err: unknown): string {
	const name = (err as { name?: string } | null)?.name ?? '';
	switch (name) {
		case 'PasswordException':
			return 'Este PDF está protegido por senha. Baixe o histórico novamente pelo SIGAA, sem senha, e tente de novo.';
		case 'InvalidPDFException':
		case 'FormatError':
			return 'O arquivo não é um PDF válido ou está corrompido. Baixe o histórico novamente pelo SIGAA.';
		default:
			return 'Não foi possível ler o PDF. Baixe o histórico novamente pelo SIGAA e tente de novo.';
	}
}

/**
 * Load a PDF file once and return the PDFDocumentProxy.
 * This should be called once and the result passed to both
 * extractTextFromPdfDoc and extractPositionedItemsFromDoc.
 */
export async function loadPdf(file: File): Promise<PDFDocumentProxy> {
	console.time(`${LOG_PREFIX} loadPdf`);
	const pdfjs = await getPdfjs();
	const arrayBuffer = await file.arrayBuffer();
	let pdf: PDFDocumentProxy;
	try {
		pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
	} catch (err) {
		console.error(`${LOG_PREFIX} pdf.js failed to open the file`, err);
		throw new Error(mensagemErroPdfjs(err));
	} finally {
		console.timeEnd(`${LOG_PREFIX} loadPdf`);
	}
	console.log(`${LOG_PREFIX} PDF loaded — ${pdf.numPages} page(s), ${(file.size / 1024).toFixed(1)} KB`);
	return pdf;
}

/**
 * Extracts structured text from an already-loaded PDF document,
 * reconstructing lines by sorting text items by vertical then horizontal position.
 *
 * Pages are loaded concurrently for better performance.
 */
export async function extractTextFromPdfDoc(pdf: PDFDocumentProxy): Promise<string> {
	console.time(`${LOG_PREFIX} extractText`);

	// Load all pages concurrently
	const pagePromises = Array.from({ length: pdf.numPages }, (_, i) =>
		pdf.getPage(i + 1).then(page => page.getTextContent().then(tc => ({ tc, num: i + 1 })))
	);
	const pagesData = await Promise.all(pagePromises);

	// Store lines as [y, text, pageNum] to avoid interleaving across pages
	const allLines: [number, string, number][] = [];

	for (const { tc, num } of pagesData) {
		const items = extractItemsFromTextContent(tc);
		console.log(`${LOG_PREFIX} Page ${num}: ${tc.items.length} raw → ${items.length} text items`);

		const lineGroups = groupItemsIntoLines(items);

		for (const [y, lineItems] of lineGroups.entries()) {
			const lineText = reconstructLine(lineItems);
			if (lineText.trim()) {
				allLines.push([y, lineText, num]);
			}
		}
	}

	// Sort lines: page ascending first, then Y descending within each page
	allLines.sort((a, b) => {
		if (a[2] !== b[2]) return a[2] - b[2]; // page ascending
		return b[0] - a[0]; // Y descending (top to bottom)
	});

	const result = allLines.map(([, text]) => text).join('\n');
	console.timeEnd(`${LOG_PREFIX} extractText`);
	console.log(`${LOG_PREFIX} Text extraction complete — ${allLines.length} lines, ${result.length} chars`);
	return result;
}

/**
 * Extracts positioned text items from an already-loaded PDF document,
 * one array per page. Pages are loaded concurrently.
 */
export async function extractPositionedItemsFromDoc(pdf: PDFDocumentProxy): Promise<PositionedTextItem[][]> {
	console.time(`${LOG_PREFIX} extractPositionedItems`);

	const pagePromises = Array.from({ length: pdf.numPages }, (_, i) =>
		pdf.getPage(i + 1).then(page => page.getTextContent().then(tc => ({ tc, num: i + 1 })))
	);
	const pagesData = await Promise.all(pagePromises);

	// Sort by page number to maintain order
	pagesData.sort((a, b) => a.num - b.num);

	const pages: PositionedTextItem[][] = pagesData.map(({ tc }) => extractItemsFromTextContent(tc));

	console.timeEnd(`${LOG_PREFIX} extractPositionedItems`);
	return pages;
}

// ─── Legacy wrappers (kept for backwards compatibility if needed) ───

export async function extractTextFromPdf(file: File): Promise<string> {
	const pdf = await loadPdf(file);
	return extractTextFromPdfDoc(pdf);
}

export async function extractPositionedItems(file: File): Promise<PositionedTextItem[][]> {
	const pdf = await loadPdf(file);
	return extractPositionedItemsFromDoc(pdf);
}

/**
 * Extracts a matrícula (student ID) from a PDF filename.
 *
 * Expects filenames in the format `prefix_MATRICULA.pdf`.
 * Returns `'desconhecida'` if the pattern doesn't match.
 */
export function extractMatriculaFromFilename(filename: string): string {
	if (filename.includes('_')) {
		try {
			return filename.split('_')[1].split('.')[0];
		} catch {
			return 'desconhecida';
		}
	}
	return 'desconhecida';
}

/**
 * Sanitiza matrícula vinda do nome do arquivo para evitar lixo como "231026330 (2)", "231026330 - cópia", etc.
 * Mantém só dígitos se parecer matrícula (8–12 dígitos); caso contrário retorna a string limpa (sem sufixos entre parênteses/cópia).
 */
export function sanitizeMatriculaFromFilename(raw: string): string {
	if (!raw || raw === 'desconhecida') return raw;
	// Remove sufixos comuns do Windows/explorer: " (2)", " - cópia", " (1).pdf" já foi cortado
	const cleaned = raw.replace(/\s*\(\d+\)\s*$/i, '').replace(/\s*-\s*c[óo]pia\s*$/i, '').trim();
	// Se sobrou só dígitos (8–12), use como matrícula limpa
	const onlyDigits = cleaned.replace(/\D/g, '');
	if (onlyDigits.length >= 8 && onlyDigits.length <= 12) return onlyDigits;
	// Senão retorna o texto sem os sufixos de cópia
	return cleaned || raw;
}
