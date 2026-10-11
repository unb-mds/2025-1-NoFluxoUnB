/**
 * Utilitários para rodar o parser de histórico no Node (Vitest).
 *
 * O `pdfExtractor` importa `pdfjs-dist`, cujo build padrão depende de DOMMatrix e
 * de um worker servido pelo site. Nos testes, o `vi.mock('pdfjs-dist', ...)`
 * troca pelo build legacy (que roda no Node com worker "fake"), assim o
 * `loadPdf` real — inclusive o tratamento de erro — é exercitado.
 *
 * Trazido do pré-mortem de 27/09/2026 (upload-historico/harness.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fábrica para `vi.mock('pdfjs-dist', pdfjsNode)`. */
export async function pdfjsNode() {
	const m = await import('pdfjs-dist/legacy/build/pdf.mjs');
	// GlobalWorkerOptions próprio: o loadPdf aponta workerSrc para um arquivo do
	// site (/pdf.worker.polyfilled.mjs) que não existe no Node.
	return { ...m, GlobalWorkerOptions: { workerSrc: '' } };
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

/**
 * Pasta com históricos REAIS de alunos, usada só para regressão local. Nunca é
 * versionada (LGPD): os testes que dependem dela são pulados quando ela não
 * existe ou está vazia. Pode ser trocada via HISTORICOS_REAIS_DIR.
 */
export const HISTORICOS_REAIS_DIR = process.env.HISTORICOS_REAIS_DIR ?? path.join(REPO_ROOT, 'test_historicos');

export function listarHistoricosReais(): string[] {
	try {
		return fs
			.readdirSync(HISTORICOS_REAIS_DIR)
			.filter((f) => f.toLowerCase().endsWith('.pdf'))
			.map((f) => path.join(HISTORICOS_REAIS_DIR, f));
	} catch {
		return [];
	}
}

export function fileFromPath(p: string, name?: string): File {
	return new File([fs.readFileSync(p)], name ?? path.basename(p), { type: 'application/pdf' });
}

/** Silencia os console.log/time do parser (muito verbosos) durante os testes. */
export function silenciarLogsDoParser() {
	console.log = () => {};
	console.time = () => {};
	console.timeEnd = () => {};
	console.error = () => {};
	console.warn = () => {};
}
