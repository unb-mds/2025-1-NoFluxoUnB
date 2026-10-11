import { describe, expect, it } from 'vitest';
import { validatePdfFile } from './fileValidation';

/**
 * Validação do arquivo no dropzone, antes do pdf.js (pré-mortem R39).
 * O navegador nem sempre informa o MIME (Windows sem leitor de PDF associado,
 * alguns Android), e o MIME que ele informa vem só da extensão.
 */

const PDF_MINIMO = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n';
const arquivo = (conteudo: string, nome: string, type: string) =>
	new File([conteudo], nome, { type });

describe('validatePdfFile', () => {
	it('aceita PDF quando o navegador não informa MIME', async () => {
		expect(await validatePdfFile(arquivo(PDF_MINIMO, 'historico.pdf', ''))).toEqual({ valid: true });
	});

	it('aceita MIME application/x-pdf', async () => {
		expect(await validatePdfFile(arquivo(PDF_MINIMO, 'historico.pdf', 'application/x-pdf'))).toEqual({ valid: true });
	});

	it('aceita lixo curto (BOM) antes do cabeçalho %PDF-, como o pdf.js', async () => {
		const r = await validatePdfFile(arquivo('﻿' + PDF_MINIMO, 'historico.pdf', 'application/pdf'));
		expect(r.valid).toBe(true);
	});

	it('rejeita arquivo que não é PDF mesmo com extensão .pdf e MIME application/pdf', async () => {
		const r = await validatePdfFile(arquivo('PK\u0003\u0004not-a-pdf', 'historico.pdf', 'application/pdf'));
		expect(r.valid).toBe(false);
		expect(r.error).toMatch(/não é um PDF/);
	});

	it('continua rejeitando extensão errada, MIME de outro tipo e arquivo vazio', async () => {
		expect((await validatePdfFile(arquivo(PDF_MINIMO, 'historico.txt', 'text/plain'))).valid).toBe(false);
		expect((await validatePdfFile(arquivo(PDF_MINIMO, 'historico.pdf', 'image/png'))).valid).toBe(false);
		const vazio = await validatePdfFile(arquivo('', 'historico.pdf', 'application/pdf'));
		expect(vazio.error).toMatch(/vazio/);
	});
});
