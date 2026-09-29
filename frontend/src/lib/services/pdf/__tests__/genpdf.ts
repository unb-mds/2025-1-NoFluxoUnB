/**
 * Gerador mínimo de PDF (Helvetica, WinAnsi/latin1) com texto posicionado, para os
 * testes do parser de histórico. Serve para montar fixtures SINTÉTICAS: nenhum PDF
 * de aluno real entra no repositório (LGPD). As colunas de `dataRow` foram medidas
 * num histórico real do SIGAA, então o position extractor enxerga a mesma tabela.
 *
 * Trazido do pré-mortem de 27/09/2026 (upload-historico/genpdf.ts).
 */
import crypto from 'node:crypto';

export type Item = { x: number; y: number; t: string };

function esc(s: string) {
	return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Monta um PDF com uma página por array de itens. `encrypt` gera um PDF que pede senha. */
export function makePdf(pages: Item[][], opts: { encrypt?: boolean } = {}): Uint8Array {
	const objs: string[] = [];
	const add = (s: string) => {
		objs.push(s);
		return objs.length;
	};
	const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
	const pagesId = objs.length + 1 + pages.length * 2; // id reservado para o nó /Pages
	const kids: number[] = [];
	for (const items of pages) {
		const content =
			'BT /F1 8 Tf ' + items.map((i) => `1 0 0 1 ${i.x} ${i.y} Tm (${esc(i.t)}) Tj`).join(' ') + ' ET';
		const c = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
		kids.push(
			add(
				`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`
			)
		);
	}
	const p = add(`<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
	if (p !== pagesId) throw new Error('pages id mismatch');
	const cat = add(`<< /Type /Catalog /Pages ${p} 0 R >>`);
	let enc = 0;
	const id = crypto.randomBytes(16).toString('hex');
	if (opts.encrypt) {
		const rnd = () => '<' + crypto.randomBytes(32).toString('hex') + '>';
		enc = add(`<< /Filter /Standard /V 1 /R 2 /O ${rnd()} /U ${rnd()} /P -4 >>`);
	}
	let out = '%PDF-1.4\n';
	const offs: number[] = [];
	objs.forEach((o, i) => {
		offs.push(Buffer.byteLength(out, 'latin1'));
		out += `${i + 1} 0 obj\n${o}\nendobj\n`;
	});
	const xref = Buffer.byteLength(out, 'latin1');
	out +=
		`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
		offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
	out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R ${enc ? `/Encrypt ${enc} 0 R` : ''} /ID [<${id}><${id}>] >>\nstartxref\n${xref}\n%%EOF\n`;
	return new Uint8Array(Buffer.from(out, 'latin1'));
}

/**
 * Linha de dados da tabela de componentes. Colunas reais medidas no PDF do SIGAA:
 * período 41.3, símbolo 77, código 91, nome 129, CH 417, turma 451, freq 476,
 * nota 508, situação 538.
 */
export function dataRow(
	y: number,
	o: { per: string; code: string; name?: string; ch: string; sit: string; nota?: string; sym?: string }
): Item[] {
	const r: Item[] = [
		{ x: 41.3, y, t: o.per },
		{ x: 91, y, t: o.code },
		{ x: 417.1, y, t: o.ch },
		{ x: 451.1, y, t: '01' },
		{ x: 476.2, y, t: '100,0' },
		{ x: 508.8, y, t: o.nota ?? 'MS' },
		{ x: 538.3, y, t: o.sit }
	];
	if (o.name) r.push({ x: 129, y, t: o.name });
	if (o.sym) r.push({ x: 77, y, t: o.sym });
	return r;
}

/** Cabeçalho mínimo de um histórico do SIGAA (título, curso, currículo, índices, colunas). */
export const header = (y: number): Item[] => [
	{ x: 34, y: y + 84, t: 'Histórico Escolar' },
	{ x: 34, y: y + 60, t: 'Curso: ENGENHARIA DE SOFTWARE/FGA - BACHARELADO - DIURNO' },
	{ x: 34, y: y + 48, t: 'Currículo: 6360/1 - 2017.1' },
	{ x: 34, y: y + 36, t: 'IRA: 4.0000         MP: 4.0000' },
	{ x: 41, y: y + 12, t: 'Ano/Período' },
	{ x: 91, y: y + 12, t: 'Componente Curricular' },
	{ x: 417, y: y + 12, t: 'CH' },
	{ x: 451, y: y + 12, t: 'Turma' },
	{ x: 476, y: y + 12, t: 'Freq %' },
	{ x: 508, y: y + 12, t: 'Nota' },
	{ x: 538, y: y + 12, t: 'Situação' }
];

/** Embrulha as páginas num File como o navegador entregaria no upload. */
export function pdfFile(pages: Item[][], opts: { encrypt?: boolean } = {}, name = 'historico_200000000.pdf'): File {
	return new File([makePdf(pages, opts) as BlobPart], name, { type: 'application/pdf' });
}
