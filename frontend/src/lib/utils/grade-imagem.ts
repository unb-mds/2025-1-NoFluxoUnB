/**
 * Versão compacta da grade em PNG — só a semana (sem a tabela de turmas), pensada
 * para mandar no WhatsApp/e-mail ou usar de papel de parede. Desenhada a partir do
 * mesmo `ModeloGradePdf` do PDF, em tema claro, num <canvas> (sem html2canvas: sai
 * igual em qualquer tela e não depende do que está visível).
 *
 * `layoutGradePng` é puro (testável); `gerarGradePng` só desenha.
 */
import { SLOTS_DIA } from '$lib/utils/horario-slots';
import { corPdf, nomeLegivel, type ModeloGradePdf } from '$lib/utils/grade-pdf';

/** Resolução 2x: nítido em tela retina sem estourar o tamanho do arquivo. */
const ESCALA = 2;
const LARGURA_BASE = 760;
const MARGEM = 20;
const COL_HORA = 46;
const CAB_TOPO = 62;
const CAB_DIA = 28;
const RODAPE = 30;
const LINHA_MIN = 34;
const LINHA_MAX = 46;

export interface LayoutPng {
	largura: number;
	altura: number;
	colHora: number;
	colDia: number;
	linhaAlt: number;
	topoGrade: number;
}

export function layoutGradePng(modelo: ModeloGradePdf): LayoutPng {
	const dias = Math.max(1, modelo.dias.length);
	const colDia = (LARGURA_BASE - 2 * MARGEM - COL_HORA) / dias;
	// Poucos horários: linhas mais altas, para o texto respirar. Muitos: compacta.
	const linhas = Math.max(1, modelo.linhas.length);
	const linhaAlt = Math.max(LINHA_MIN, Math.min(LINHA_MAX, 420 / linhas));
	const topoGrade = CAB_TOPO + CAB_DIA;
	return {
		largura: LARGURA_BASE,
		altura: Math.ceil(topoGrade + linhas * linhaAlt + RODAPE + MARGEM / 2),
		colHora: COL_HORA,
		colDia,
		linhaAlt,
		topoGrade
	};
}

export function nomeArquivoGradePng(periodo: string | null, titulo: string): string {
	const slug = titulo
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	const p = periodo ? `-${periodo.replace('.', '-')}` : '';
	return `grade${p}${slug ? `-${slug}` : ''}.png`;
}

/** Corta `texto` com "…" para caber em `largura` px. */
function caber(ctx: CanvasRenderingContext2D, texto: string, largura: number): string {
	if (ctx.measureText(texto).width <= largura) return texto;
	let s = texto;
	while (s.length > 1 && ctx.measureText(`${s}…`).width > largura) s = s.slice(0, -1).trimEnd();
	return `${s}…`;
}

export async function gerarGradePng(modelo: ModeloGradePdf, nomeArquivo: string): Promise<File> {
	const L = layoutGradePng(modelo);
	const canvas = document.createElement('canvas');
	canvas.width = L.largura * ESCALA;
	canvas.height = L.altura * ESCALA;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('canvas indisponível');
	ctx.scale(ESCALA, ESCALA);
	const fonte = (peso: number | 'bold', px: number) =>
		`${peso === 'bold' ? '700' : peso} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

	// Fundo + cabeçalho
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, L.largura, L.altura);
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = '#18181b';
	ctx.font = fonte('bold', 20);
	ctx.fillText(caber(ctx, modelo.titulo, L.largura - 2 * MARGEM - 120), MARGEM, MARGEM + 18);
	const n = modelo.materias.length;
	const resumo = [
		modelo.periodo ? `Período ${modelo.periodo}` : null,
		`${n} ${n === 1 ? 'matéria' : 'matérias'}`,
		`${modelo.creditos} créditos`
	]
		.filter(Boolean)
		.join('  ·  ');
	ctx.fillStyle = '#71717a';
	ctx.font = fonte(400, 12);
	ctx.fillText(resumo, MARGEM, MARGEM + 38);
	ctx.textAlign = 'right';
	ctx.fillStyle = '#18181b';
	ctx.font = fonte('bold', 13);
	ctx.fillText('NoFluxo UnB', L.largura - MARGEM, MARGEM + 18);
	ctx.textAlign = 'left';

	// Cabeçalho dos dias
	const x0 = MARGEM + L.colHora;
	ctx.fillStyle = '#f4f4f5';
	ctx.fillRect(MARGEM, CAB_TOPO, L.largura - 2 * MARGEM, CAB_DIA);
	ctx.fillStyle = '#18181b';
	ctx.font = fonte('bold', 12);
	ctx.textAlign = 'center';
	modelo.dias.forEach((dia, i) => {
		ctx.fillText(dia.label, x0 + L.colDia * i + L.colDia / 2, CAB_TOPO + 18);
	});
	ctx.textAlign = 'left';

	// Linhas de horário
	const primeira = modelo.linhas[0] ?? 0;
	const yDoSlot = (s: number) => L.topoGrade + (s - primeira) * L.linhaAlt;
	modelo.linhas.forEach((s, i) => {
		const slot = SLOTS_DIA[s];
		const y = yDoSlot(s);
		const troca = i > 0 && SLOTS_DIA[modelo.linhas[i - 1]].turno !== slot.turno;
		ctx.strokeStyle = troca ? '#a1a1aa' : '#e4e4e7';
		ctx.lineWidth = troca ? 1 : 0.6;
		ctx.beginPath();
		ctx.moveTo(MARGEM, y);
		ctx.lineTo(L.largura - MARGEM, y);
		ctx.stroke();
		ctx.fillStyle = '#71717a';
		ctx.font = fonte(400, 10);
		ctx.fillText(slot.inicio, MARGEM + 4, y + 13);
	});
	const fim = yDoSlot(primeira + modelo.linhas.length);
	ctx.strokeStyle = '#e4e4e7';
	ctx.lineWidth = 0.6;
	ctx.beginPath();
	ctx.moveTo(MARGEM, fim);
	ctx.lineTo(L.largura - MARGEM, fim);
	for (let i = 0; i <= modelo.dias.length; i++) {
		const x = x0 + L.colDia * i;
		ctx.moveTo(x, CAB_TOPO);
		ctx.lineTo(x, fim);
	}
	ctx.stroke();

	// Blocos
	const porCodigo = new Map(modelo.materias.map((m) => [m.codigo, m]));
	modelo.dias.forEach((dia, i) => {
		for (const bloco of dia.blocos) {
			const m = porCodigo.get(bloco.codigo);
			if (!m) continue;
			const cor = corPdf(m.cor);
			const bx = x0 + L.colDia * i + 2;
			const by = yDoSlot(bloco.offsetStart) + 2;
			const bw = L.colDia - 4;
			const bh = bloco.span * L.linhaAlt - 4;
			ctx.fillStyle = cor.fundo;
			ctx.beginPath();
			ctx.roundRect(bx, by, bw, bh, 5);
			ctx.fill();
			ctx.fillStyle = cor.faixa;
			ctx.fillRect(bx, by, 3.5, bh);

			const tx = bx + 9;
			const maxW = bw - 14;
			ctx.fillStyle = cor.texto;
			ctx.font = fonte('bold', 12);
			ctx.fillText(caber(ctx, m.codigo, maxW), tx, by + 15);
			if (bh >= 36) {
				ctx.font = fonte(400, 10.5);
				ctx.fillText(caber(ctx, nomeLegivel(m.nome), maxW), tx, by + 29);
			}
			if (bh >= 52) {
				ctx.font = fonte(400, 10);
				ctx.fillStyle = cor.texto;
				ctx.fillText(caber(ctx, `Turma ${m.turma.turma}`, maxW), tx, by + 43);
			}
		}
	});

	// Rodapé
	ctx.fillStyle = '#a1a1aa';
	ctx.font = fonte(400, 10);
	ctx.textAlign = 'center';
	ctx.fillText('no-fluxo.com', L.largura / 2, L.altura - 10);

	const blob: Blob = await new Promise((ok, erro) =>
		canvas.toBlob((b) => (b ? ok(b) : erro(new Error('toBlob falhou'))), 'image/png')
	);
	return new File([blob], nomeArquivo, { type: 'image/png' });
}
