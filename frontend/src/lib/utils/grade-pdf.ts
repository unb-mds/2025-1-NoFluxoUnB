/**
 * PDF da grade do Montador — desenhado a partir dos DADOS da seleção, não de um
 * print da tela. Sai vetorial (texto nítido e selecionável), sempre em tema claro,
 * do mesmo jeito em qualquer tamanho de tela, e com o que o aluno precisa para se
 * matricular: a semana em blocos e, embaixo, a tabela de turmas (código, turma,
 * docente, horário, sala, créditos).
 *
 * `montarModeloGradePdf` é puro (testável); `gerarGradePdf` só desenha; a entrega
 * fica com `compartilharArquivo` (celular) ou `baixarArquivo`.
 */
import type { TurmaOferta } from '$lib/services/turmas.service';
import { DIAS_SEMANA, SLOTS_DIA, agruparBlocosDia, type BlocoDia } from '$lib/utils/horario-slots';
import { horarioLegivel, formatLocalCompacto } from '$lib/utils/sigaa';

export interface MateriaPdf {
	codigo: string;
	nome: string;
	creditos: number;
	turma: TurmaOferta;
	mask: bigint;
	/** Código sob o qual a turma está publicada, quando difere do da matriz. */
	codigoOfertado?: string;
	/** Índice da cor da matéria na tela (`gradeStore.corDaMateria`). */
	cor: number;
}

export interface ModeloGradePdf {
	titulo: string;
	periodo: string | null;
	creditos: number;
	materias: MateriaPdf[];
	/** Colunas: Seg–Sex sempre; Sáb só se alguma aula cai no sábado. */
	dias: Array<{ cod: string; label: string; blocos: BlocoDia[] }>;
	/** Índices em `SLOTS_DIA` das linhas desenhadas (do 1º ao último horário usado). */
	linhas: number[];
	/** Matérias sem horário definido (aparecem só na tabela). */
	semHorario: string[];
}

/**
 * Cores das matérias em RGB — mesma ordem de `MATERIA_CORES` (grade.store), na
 * versão clara: fundo 100, faixa 600/700, texto 900.
 */
const CORES: ReadonlyArray<{ fundo: string; faixa: string; texto: string }> = [
	{ fundo: '#f3e8ff', faixa: '#9333ea', texto: '#581c87' }, // purple
	{ fundo: '#e0f2fe', faixa: '#0284c7', texto: '#0c4a6e' }, // sky
	{ fundo: '#d1fae5', faixa: '#059669', texto: '#064e3b' }, // emerald
	{ fundo: '#fef3c7', faixa: '#b45309', texto: '#78350f' }, // amber
	{ fundo: '#fce7f3', faixa: '#db2777', texto: '#831843' }, // pink
	{ fundo: '#cffafe', faixa: '#0891b2', texto: '#164e63' }, // cyan
	{ fundo: '#ffedd5', faixa: '#ea580c', texto: '#7c2d12' }, // orange
	{ fundo: '#ccfbf1', faixa: '#0d9488', texto: '#134e4a' } // teal
];

export function corPdf(indice: number) {
	return CORES[((indice % CORES.length) + CORES.length) % CORES.length];
}

const MINUSCULAS = new Set([
	'de',
	'da',
	'do',
	'das',
	'dos',
	'e',
	'em',
	'a',
	'à',
	'às',
	'ao',
	'aos',
	'o',
	'para',
	'com',
	'na',
	'no'
]);
const ROMANOS = /^(i{1,3}|iv|v|vi{0,3}|ix|x)$/i;

/** "CÁLCULO 1" → "Cálculo 1"; "INTRODUÇÃO A CIÊNCIA DA COMPUTAÇÃO" → "Introdução a Ciência da Computação". */
export function nomeLegivel(nome: string): string {
	return nome
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.map((p, i) => {
			if (ROMANOS.test(p)) return p.toUpperCase();
			if (i > 0 && MINUSCULAS.has(p)) return p;
			return p.charAt(0).toUpperCase() + p.slice(1);
		})
		.join(' ');
}

/**
 * As fontes padrão do PDF só cobrem Latin-1 (acentos do português cabem); o resto
 * — travessão, reticências, aspas curvas — viraria lixo na página.
 */
export function textoPdf(texto: string): string {
	return texto
		.normalize('NFC')
		.replace(/[–—]/g, '-')
		.replace(/…/g, '...')
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/[^\n -ÿ]/g, '');
}

export function montarModeloGradePdf(entrada: {
	titulo: string;
	periodo: string | null;
	materias: MateriaPdf[];
}): ModeloGradePdf {
	const materias = [...entrada.materias].sort((a, b) => a.codigo.localeCompare(b.codigo));

	const ocupacao = DIAS_SEMANA.map((dia, d) =>
		SLOTS_DIA.map((slot) => {
			const bit = 1n << BigInt(d * 16 + slot.offset);
			return materias.find((m) => (m.mask & bit) !== 0n)?.codigo ?? null;
		})
	);

	const usadas = SLOTS_DIA.map((_, s) => ocupacao.some((dia) => dia[s] !== null));
	const primeira = usadas.indexOf(true);
	const ultima = usadas.lastIndexOf(true);
	const linhas =
		primeira === -1 ? [] : Array.from({ length: ultima - primeira + 1 }, (_, i) => primeira + i);

	const dias = DIAS_SEMANA.map((dia, d) => ({
		...dia,
		blocos: agruparBlocosDia(ocupacao[d].slice(primeira, ultima + 1)).map((b) => ({
			...b,
			offsetStart: b.offsetStart + primeira
		}))
	})).filter((dia) => dia.cod !== '7' || dia.blocos.length > 0);

	return {
		titulo: entrada.titulo,
		periodo: entrada.periodo,
		creditos: materias.reduce((t, m) => t + (m.creditos || 0), 0),
		materias,
		dias: primeira === -1 ? dias.filter((d) => d.cod !== '7') : dias,
		linhas,
		semHorario: materias.filter((m) => m.mask === 0n).map((m) => m.codigo)
	};
}

export function nomeArquivoGradePdf(periodo: string | null, titulo: string): string {
	const slug = titulo
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	const p = periodo ? `-${periodo.replace('.', '-')}` : '';
	return `grade${p}${slug ? `-${slug}` : ''}.pdf`;
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

const MARGEM = 12;
const COR_TEXTO = '#18181b';
const COR_SUAVE = '#71717a';
const COR_LINHA = '#e4e4e7';
const COR_FUNDO_CAB = '#f4f4f5';
/** Altura de uma linha da tabela de turmas (mm) — usada também para planejar a folha. */
const ALTURA_LINHA_TABELA = 6;

/** Encurta `texto` até caber em `largura` com "..." no fim. */
function reticencias(doc: { getTextWidth: (t: string) => number }, texto: string, largura: number) {
	let s = texto.trimEnd();
	while (s.length > 1 && doc.getTextWidth(`${s}...`) > largura) s = s.slice(0, -1).trimEnd();
	return `${s}...`;
}

export async function gerarGradePdf(modelo: ModeloGradePdf): Promise<File> {
	const [{ jsPDF }, { autoTable }] = await Promise.all([
		import('jspdf'),
		import('jspdf-autotable')
	]);
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
	const largura = doc.internal.pageSize.getWidth();
	const altura = doc.internal.pageSize.getHeight();
	const t = textoPdf;

	// ── Cabeçalho ──────────────────────────────────────────────────────────────
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(16);
	doc.setTextColor(COR_TEXTO);
	doc.text(t(modelo.titulo), MARGEM, MARGEM + 5);

	const n = modelo.materias.length;
	const resumo = [
		modelo.periodo ? `Período ${modelo.periodo}` : null,
		`${n} ${n === 1 ? 'matéria' : 'matérias'}`,
		`${modelo.creditos} créditos`
	]
		.filter(Boolean)
		.join('  ·  ');
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(9.5);
	doc.setTextColor(COR_SUAVE);
	doc.text(t(resumo), MARGEM, MARGEM + 11);

	const geradoEm = new Intl.DateTimeFormat('pt-BR', {
		dateStyle: 'short',
		timeStyle: 'short'
	}).format(new Date());
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(10);
	doc.setTextColor(COR_TEXTO);
	doc.text('NoFluxo UnB', largura - MARGEM, MARGEM + 5, { align: 'right' });
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(8);
	doc.setTextColor(COR_SUAVE);
	doc.text(t(`no-fluxo.com  ·  gerado em ${geradoEm}`), largura - MARGEM, MARGEM + 11, {
		align: 'right'
	});

	let y = MARGEM + 17;
	// Altura que a tabela de turmas vai pedir (cabeçalho + linhas + total), para a
	// semana encolher e as duas caberem na mesma folha quando der.
	// Código ofertado diferente ocupa duas linhas na célula; a nota de "sem horário", uma.
	const linhasDuplas = modelo.materias.filter((m) => m.codigoOfertado).length;
	const alturaTabela =
		(modelo.materias.length + 2) * ALTURA_LINHA_TABELA +
		linhasDuplas * 3 +
		(modelo.semHorario.length > 0 ? 6 : 0) +
		2;
	const rodape = MARGEM + 4;

	// ── Semana ─────────────────────────────────────────────────────────────────
	if (modelo.linhas.length > 0) {
		const colHora = 18;
		const cabDia = 7;
		const colDia = (largura - 2 * MARGEM - colHora) / modelo.dias.length;
		// Cada módulo entre 5 e 9 mm: o que sobrar da folha depois da tabela. Se nem
		// com 6 mm couber, a tabela vai inteira para a folha seguinte.
		const espaco = altura - rodape - y - cabDia - 7 - alturaTabela;
		const alturaLinha = Math.max(5, Math.min(9, espaco / modelo.linhas.length));
		const topoGrade = y + cabDia;
		const primeira = modelo.linhas[0];
		const yDoSlot = (s: number) => topoGrade + (s - primeira) * alturaLinha;

		// Cabeçalho dos dias
		doc.setFillColor(COR_FUNDO_CAB);
		doc.rect(MARGEM, y, largura - 2 * MARGEM, cabDia, 'F');
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(8.5);
		doc.setTextColor(COR_TEXTO);
		modelo.dias.forEach((dia, i) => {
			doc.text(dia.label, MARGEM + colHora + colDia * i + colDia / 2, y + 4.8, { align: 'center' });
		});

		// Linhas de horário (com divisória mais forte na troca de turno)
		modelo.linhas.forEach((s, i) => {
			const slot = SLOTS_DIA[s];
			const ly = yDoSlot(s);
			const trocaTurno = i > 0 && SLOTS_DIA[modelo.linhas[i - 1]].turno !== slot.turno;
			doc.setDrawColor(trocaTurno ? '#a1a1aa' : COR_LINHA);
			doc.setLineWidth(trocaTurno ? 0.35 : 0.2);
			doc.line(MARGEM, ly, largura - MARGEM, ly);
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(7);
			doc.setTextColor(COR_SUAVE);
			doc.text(`${slot.inicio}`, MARGEM + 1.5, ly + Math.min(3.4, alturaLinha / 2 + 1));
			if (alturaLinha >= 7.5) {
				doc.setFontSize(6);
				doc.text(slot.label, MARGEM + 1.5, ly + 6.4);
			}
		});
		const fimGrade = yDoSlot(primeira + modelo.linhas.length);
		doc.setDrawColor(COR_LINHA);
		doc.setLineWidth(0.2);
		doc.line(MARGEM, fimGrade, largura - MARGEM, fimGrade);
		for (let i = 0; i <= modelo.dias.length; i++) {
			const x = MARGEM + colHora + colDia * i;
			doc.line(x, y, x, fimGrade);
		}

		// Blocos das matérias
		const porCodigo = new Map(modelo.materias.map((m) => [m.codigo, m]));
		modelo.dias.forEach((dia, i) => {
			for (const bloco of dia.blocos) {
				const m = porCodigo.get(bloco.codigo);
				if (!m) continue;
				const cor = corPdf(m.cor);
				const bx = MARGEM + colHora + colDia * i + 0.8;
				const by = yDoSlot(bloco.offsetStart) + 0.6;
				const bw = colDia - 1.6;
				const bh = bloco.span * alturaLinha - 1.2;
				doc.setFillColor(cor.fundo);
				doc.roundedRect(bx, by, bw, bh, 1.2, 1.2, 'F');
				doc.setFillColor(cor.faixa);
				doc.rect(bx, by, 1.2, bh, 'F');

				const tx = bx + 2.6;
				const larguraTexto = bw - 3.6;
				let ty = by + 3.6;
				const limite = by + bh - 1;
				doc.setTextColor(cor.texto);
				doc.setFont('helvetica', 'bold');
				doc.setFontSize(7.5);
				doc.text(`${m.codigoOfertado ?? m.codigo}  T${m.turma.turma}`, tx, ty);
				ty += 3.3;
				doc.setFont('helvetica', 'normal');
				doc.setFontSize(7);
				const nomeLinhas = doc.splitTextToSize(t(nomeLegivel(m.nome)), larguraTexto) as string[];
				for (let k = 0; k < nomeLinhas.length && ty <= limite; k++) {
					// Última linha que cabe, com nome sobrando: termina em "..." para não
					// parecer que o nome acaba ali.
					const corta = k < nomeLinhas.length - 1 && ty + 3 > limite;
					doc.text(corta ? reticencias(doc, nomeLinhas[k], larguraTexto) : nomeLinhas[k], tx, ty);
					ty += 3;
				}
				const sala = formatLocalCompacto(m.turma.local);
				if (sala && ty + 0.4 <= limite) {
					doc.setFontSize(6.5);
					doc.text(doc.splitTextToSize(t(sala), larguraTexto)[0] as string, tx, ty + 0.4);
				}
			}
		});

		y = fimGrade + 7;
		// Tabela partida com uma linha no pé da folha é pior que começar na próxima.
		if (y + alturaTabela > altura - rodape) {
			doc.addPage();
			y = MARGEM;
		}
	}

	// ── Tabela de turmas ───────────────────────────────────────────────────────
	autoTable(doc, {
		startY: y,
		// Linha com nome longo pode passar da estimativa: começa na folha seguinte em vez de partir.
		pageBreak: 'avoid',
		margin: { left: MARGEM, right: MARGEM, top: MARGEM, bottom: MARGEM + 4 },
		head: [['', 'Código', 'Matéria', 'Turma', 'Docente', 'Horário', 'Local', 'Créd.']],
		body: modelo.materias.map((m) => [
			'',
			m.codigoOfertado ? `${m.codigoOfertado}\n(${m.codigo})` : m.codigo,
			t(nomeLegivel(m.nome)),
			m.turma.turma,
			t(m.turma.docente ? nomeLegivel(m.turma.docente) : 'A definir'),
			t(horarioLegivel(m.turma.horario)),
			t(formatLocalCompacto(m.turma.local) || 'A definir'),
			String(m.creditos)
		]),
		foot: [['', '', 'Total', '', '', '', '', String(modelo.creditos)]],
		theme: 'plain',
		styles: {
			font: 'helvetica',
			fontSize: 8,
			textColor: COR_TEXTO,
			cellPadding: { top: 1.2, bottom: 1.2, left: 1.8, right: 1.8 },
			minCellHeight: ALTURA_LINHA_TABELA,
			valign: 'middle'
		},
		headStyles: { fillColor: COR_FUNDO_CAB, fontStyle: 'bold', fontSize: 8 },
		footStyles: { fontStyle: 'bold', fillColor: COR_FUNDO_CAB },
		columnStyles: {
			// Só a faixa de cor: sem padding, senão o texto vazio quebra linha e a dobra a altura.
			0: { cellWidth: 3, cellPadding: 0 },
			1: { cellWidth: 22, font: 'courier', fontStyle: 'bold' },
			2: { cellWidth: 62 },
			3: { cellWidth: 13, halign: 'center' },
			4: { cellWidth: 46 },
			6: { cellWidth: 44 },
			7: { cellWidth: 12, halign: 'right' }
		},
		bodyStyles: { lineColor: COR_LINHA, lineWidth: { bottom: 0.2 } },
		didDrawCell: (data) => {
			if (data.section !== 'body' || data.column.index !== 0) return;
			const m = modelo.materias[data.row.index];
			if (!m) return;
			doc.setFillColor(corPdf(m.cor).faixa);
			doc.rect(data.cell.x + 0.6, data.cell.y + 1.2, 1.6, data.cell.height - 2.4, 'F');
		}
	});

	if (modelo.semHorario.length > 0) {
		const fim =
			(doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
		doc.setFont('helvetica', 'italic');
		doc.setFontSize(8);
		doc.setTextColor(COR_SUAVE);
		doc.text(
			t(`Sem horário definido na oferta (não aparece na semana): ${modelo.semHorario.join(', ')}.`),
			MARGEM,
			Math.min(fim + 5, altura - MARGEM - 2)
		);
	}

	// ── Rodapé ─────────────────────────────────────────────────────────────────
	const paginas = doc.getNumberOfPages();
	for (let p = 1; p <= paginas; p++) {
		doc.setPage(p);
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(7);
		doc.setTextColor(COR_SUAVE);
		doc.text(
			t('Confira vagas e horários no SIGAA antes da matrícula: a oferta pode mudar.'),
			MARGEM,
			altura - MARGEM + 4
		);
		if (paginas > 1) {
			doc.text(`${p}/${paginas}`, largura - MARGEM, altura - MARGEM + 4, { align: 'right' });
		}
	}

	return new File([doc.output('blob')], nomeArquivoGradePdf(modelo.periodo, modelo.titulo), {
		type: 'application/pdf'
	});
}

// ---------------------------------------------------------------------------
// Entrega
// ---------------------------------------------------------------------------

/** Download comum por link — o que o desktop e o Android tratam bem. */
export function baixarArquivo(arquivo: File): void {
	const url = URL.createObjectURL(arquivo);
	const link = document.createElement('a');
	link.href = url;
	link.download = arquivo.name;
	link.click();
	// Revogar na hora cancela o download em alguns navegadores.
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Abre o PDF no visualizador do navegador (no iOS, a tela de pré-visualização).
 * Devolve `false` se a nova aba foi bloqueada.
 */
export function abrirArquivo(arquivo: File): boolean {
	const url = URL.createObjectURL(arquivo);
	const aba = window.open(url, '_blank');
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
	return aba !== null;
}

export function podeCompartilharArquivo(arquivo: File): boolean {
	return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [arquivo] });
}

/**
 * Folha de compartilhamento do sistema (Salvar em Arquivos, WhatsApp, imprimir).
 * No celular é o caminho que funciona onde o download por link falha (iOS, PWA,
 * navegador interno de app).
 *
 * - `'sem-gesto'`: o navegador (Safari) já não considera o toque como recente — por
 *   isso o arquivo deve estar pronto ANTES do toque que chama esta função.
 * - `'falhou'`: outro erro; vale cair para `baixarArquivo`.
 */
export async function compartilharArquivo(
	arquivo: File,
	titulo: string
): Promise<'ok' | 'cancelado' | 'sem-gesto' | 'falhou'> {
	try {
		await navigator.share({ files: [arquivo], title: titulo });
		return 'ok';
	} catch (e) {
		const nome = (e as { name?: string })?.name;
		if (nome === 'AbortError') return 'cancelado';
		if (nome === 'NotAllowedError') return 'sem-gesto';
		return 'falhou';
	}
}
