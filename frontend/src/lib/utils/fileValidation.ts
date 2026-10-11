/**
 * File validation utilities for PDF upload
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
// MIME vazio acontece no Windows sem programa associado a .pdf e em alguns
// Android; 'application/x-pdf' vem de navegadores/SOs antigos. O que garante que
// é PDF é a assinatura "%PDF-" no começo do arquivo (pré-mortem R39).
const ALLOWED_MIME_TYPES = ['application/pdf', 'application/x-pdf', ''];
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
// O pdf.js tolera lixo (ex.: BOM) antes do cabeçalho, até 1024 bytes.
const PDF_MAGIC_WINDOW = 1024;
const ALLOWED_EXTENSIONS = ['.pdf'];

export interface ValidationResult {
	valid: boolean;
	error?: string;
}

function temAssinaturaPdf(bytes: Uint8Array): boolean {
	for (let i = 0; i + PDF_MAGIC.length <= bytes.length; i++) {
		if (PDF_MAGIC.every((b, k) => bytes[i + k] === b)) return true;
	}
	return false;
}

export async function validatePdfFile(file: File): Promise<ValidationResult> {
	if (!file) {
		return { valid: false, error: 'Nenhum arquivo selecionado.' };
	}

	// Check file extension
	const fileName = file.name.toLowerCase();
	const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
	if (!hasValidExtension) {
		return { valid: false, error: 'Formato inválido. Somente arquivos PDF são aceitos.' };
	}

	// Check MIME type
	if (!ALLOWED_MIME_TYPES.includes(file.type)) {
		return { valid: false, error: 'Formato inválido. Somente arquivos PDF são aceitos.' };
	}

	// Check file size
	if (file.size > MAX_FILE_SIZE) {
		const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
		return {
			valid: false,
			error: `Arquivo muito grande (${sizeMB}MB). O tamanho máximo é 10MB.`
		};
	}

	if (file.size === 0) {
		return { valid: false, error: 'O arquivo está vazio.' };
	}

	// Extensão e MIME não bastam: um .docx renomeado para .pdf passa nos dois
	let inicio: Uint8Array;
	try {
		inicio = new Uint8Array(await file.slice(0, PDF_MAGIC_WINDOW).arrayBuffer());
	} catch {
		return { valid: false, error: 'Não foi possível ler o arquivo. Tente selecioná-lo novamente.' };
	}
	if (!temAssinaturaPdf(inicio)) {
		return {
			valid: false,
			error: 'Formato inválido. O arquivo não é um PDF. Baixe o histórico pelo SIGAA e envie o arquivo .pdf original.'
		};
	}

	return { valid: true };
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
