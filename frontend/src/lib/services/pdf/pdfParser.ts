/**
 * PDF Parser — Client-side PDF parsing entry point.
 *
 * Orchestrates:
 *   1. Position-based discipline extraction (using x,y coordinates from PDF.js)
 *   2. Regex-based metadata extraction (curso, IRA, MP, suspensões, etc.)
 *   3. Regex-based pending disciplines + equivalências extraction
 *
 * The position-based approach replaces the old regex-only discipline extraction,
 * fixing issues with multi-line professor names and long discipline name wrapping.
 */

import {
	loadPdf,
	extractTextFromPdfDoc,
	extractPositionedItemsFromDoc,
	extractMatriculaFromFilename,
	sanitizeMatriculaFromFilename
} from './pdfExtractor';
import {
	extrairCurso,
	extrairMatrizCurricular,
	extrairMatriculaFromText,
	extrairSuspensoes,
	extrairSemestreAtual,
	extrairCargaHorariaIntegralizada,
	debugCargaHorariaIntegralizada,
	calcularNumeroSemestre,
	extrairDadosAcademicos,
	extrairPeriodoLetivoAtual,
	extrairDisciplinasPendentes,
	type DisciplinaExtraida,
	type EquivalenciaExtraida,
	type DadosAcademicos
} from './pdfDataExtractor';
import { extractDisciplinasFromPositions } from './pdfPositionExtractor';
import { REGEX_IRA_HISTORICO, iraStringParaNumero } from '$lib/utils/ira';

const LOG_PREFIX = '[PDF-Parser]';

export type { DisciplinaExtraida, EquivalenciaExtraida, DadosAcademicos };

export interface ParsedPdfResult {
	message: string;
	filename: string;
	matricula: string;
	curso_extraido: string | null;
	matriz_curricular: string | null;
	media_ponderada: number | null;
	frequencia_geral: null;
	full_text: string;
	extracted_data: DisciplinaExtraida[];
	equivalencias_pdf: EquivalenciaExtraida[];
	semestre_atual: string | null;
	numero_semestre: number | null;
	suspensoes: string[];
	/** CH integralizada (obrigatória, optativa, complementar) da tabela "Carga Horária Integralizada/Pendente" */
	carga_horaria_integralizada: {
		obrigatoria: number;
		optativa: number;
		complementar: number;
		total: number;
	} | null;
}

function parseAnoPeriodo(anoPeriodo: string | null | undefined): { ano: number; periodo: number } | null {
	const s = String(anoPeriodo ?? '').trim();
	const m = s.match(/^(\d{4})\.(\d)$/);
	if (!m) return null;
	return { ano: Number(m[1]), periodo: Number(m[2]) };
}

function compararAnoPeriodo(
	a: string | null | undefined,
	b: string | null | undefined
): number {
	const pa = parseAnoPeriodo(a);
	const pb = parseAnoPeriodo(b);
	if (pa && pb) {
		if (pa.ano !== pb.ano) return pa.ano - pb.ano;
		return pa.periodo - pb.periodo;
	}
	if (pa && !pb) return 1;
	if (!pa && pb) return -1;
	return 0;
}

/**
 * Consolida as tentativas por código de disciplina para persistência.
 *
 * Regras:
 * - TODA aprovação conta (APR/CUMP/DISP), uma por ano/período: disciplinas
 *   repetíveis (extensão, ex. DSC0172 cursada em 2024.1 E 2024.2 para créditos
 *   de optativa) geram uma entrada por semestre cursado. Isso também protege o
 *   aproveitamento (CUMP), que vem SEM período no SIGAA e antes perdia por
 *   recência para um REP/TRANC datado — chegando a apagar a matéria inteira.
 * - MATR mais recente é mantida (cursando agora — inclusive re-matrícula de
 *   repetível já aprovada).
 * - Sem aprovação nem matrícula: mantém só a tentativa mais recente
 *   (ano/período; empate: última no array), e descarta se for TRANC.
 */
function consolidarDisciplinasRegularesParaPersistencia(
	disciplinas: DisciplinaExtraida[]
): DisciplinaExtraida[] {
	const statusDe = (d: DisciplinaExtraida) => String(d.status ?? '').trim().toUpperCase();
	const APROVADA = new Set(['APR', 'CUMP', 'DISP']);

	type WithIndex = { item: DisciplinaExtraida; index: number };
	const porCodigo = new Map<string, WithIndex[]>();
	disciplinas.forEach((item, index) => {
		const codigo = String(item.codigo ?? '')
			.trim()
			.toUpperCase();
		if (!codigo) return;
		if (!porCodigo.has(codigo)) porCodigo.set(codigo, []);
		porCodigo.get(codigo)!.push({ item, index });
	});

	const out: WithIndex[] = [];
	for (const list of porCodigo.values()) {
		const aprovadas = list.filter((w) => APROVADA.has(statusDe(w.item)));
		const periodosVistos = new Set<string>();
		for (const w of aprovadas) {
			const chave = String(w.item.ano_periodo ?? '').trim() || '--';
			if (periodosVistos.has(chave)) continue;
			periodosVistos.add(chave);
			out.push(w);
		}

		const matrs = list.filter((w) => statusDe(w.item) === 'MATR');
		if (matrs.length > 0) {
			const maisRecente = matrs.reduce((a, b) => {
				const cmp = compararAnoPeriodo(a.item.ano_periodo, b.item.ano_periodo);
				return cmp < 0 || (cmp === 0 && b.index > a.index) ? b : a;
			});
			out.push(maisRecente);
		}

		if (aprovadas.length === 0 && matrs.length === 0) {
			const vencedora = list.reduce((a, b) => {
				const cmp = compararAnoPeriodo(a.item.ano_periodo, b.item.ano_periodo);
				return cmp < 0 || (cmp === 0 && b.index > a.index) ? b : a;
			});
			if (statusDe(vencedora.item) !== 'TRANC') out.push(vencedora);
		}
	}

	// Ordem original do extrato — estável para o RPC e para os snapshots.
	return out.sort((a, b) => a.index - b.index).map((w) => w.item);
}

// ─── Regex-based extractors for non-discipline data ───

function extrairEquivalencias(text: string): EquivalenciaExtraida[] {
	const equivalencias: EquivalenciaExtraida[] = [];
	const reEquiv =
		/Cumpriu\s+([A-Z]{2,}\d{3,})\s*-\s*([A-ZÀ-Ÿ\s0-9-]+?)\s*\((\d+)h\)\s*atrav[eé]s\s*de\s*([A-Z]{2,}\d{3,})\s*-\s*([A-ZÀ-Ÿ\s0-9-]+?)\s*\((\d+)h\)/gi;

	let eqMatch: RegExpExecArray | null;
	while ((eqMatch = reEquiv.exec(text)) !== null) {
		equivalencias.push({
			cumpriu: eqMatch[1],
			nome_cumpriu: eqMatch[2].trim(),
			atraves_de: eqMatch[4],
			nome_equivalente: eqMatch[5].trim(),
			ch_cumpriu: eqMatch[3],
			ch_equivalente: eqMatch[6],
		});
	}

	return equivalencias;
}

const MSG_NAO_E_HISTORICO =
	'Este PDF não parece ser um histórico escolar do SIGAA/UnB. ' +
	'Baixe o histórico em SIGAA > Ensino > Emitir Histórico e envie o arquivo gerado.';

/**
 * Assinatura mínima do histórico do SIGAA. Qualquer outro PDF com texto
 * (declaração de matrícula, comprovante, ementa) era "processado com sucesso"
 * com 0 disciplinas e uma matriz inventada (pré-mortem R12). A regra é OR entre
 * marcadores, com espaços opcionais porque o pdf.js às vezes cola as palavras
 * ("ComponentesCurriculares").
 */
function pareceHistoricoSigaa(texto: string): boolean {
	if (/Hist[óo]rico\s*Escolar/i.test(texto)) return true;
	return /Curr[ií]culo\s*:/i.test(texto) && /Componentes\s*Curriculares/i.test(texto);
}

/**
 * Parse a PDF file entirely in the browser.
 * Returns the same structure as the old Python endpoint `POST /upload-pdf`.
 */
export async function parsePdf(file: File): Promise<ParsedPdfResult> {
	console.log(`${LOG_PREFIX} ========================================`);
	console.log(`${LOG_PREFIX} Starting client-side PDF parsing`);
	console.log(`${LOG_PREFIX} File: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);
	console.log(`${LOG_PREFIX} ========================================`);
	const startTime = performance.now();

	// 1. Load PDF once, then extract both text and positioned items from the shared instance
	const pdf = await loadPdf(file);

	const [textoTotal, positionedPages] = await Promise.all([
		extractTextFromPdfDoc(pdf),
		extractPositionedItemsFromDoc(pdf)
	]);

	if (!textoTotal.trim()) {
		console.error(`${LOG_PREFIX} No text extracted from PDF — aborting`);
		throw new Error(
			'Nenhuma informação textual pôde ser extraída do PDF. ' +
				'O PDF pode ser uma imagem de baixa qualidade, estar vazio ou corrompido.'
		);
	}

	if (!pareceHistoricoSigaa(textoTotal)) {
		console.error(`${LOG_PREFIX} Text does not look like a SIGAA histórico — aborting`);
		throw new Error(MSG_NAO_E_HISTORICO);
	}

	console.log(`${LOG_PREFIX} Text extraction done — ${textoTotal.length} chars, ${positionedPages.length} pages of positioned items (${(performance.now() - startTime).toFixed(0)}ms elapsed)`);

	// 2. Matrícula: prioridade do texto do PDF (evita lixo do nome do arquivo, ex.: "231026330 (2)")
	const matriculaFromText = extrairMatriculaFromText(textoTotal);
	const matricula =
		matriculaFromText ??
		sanitizeMatriculaFromFilename(extractMatriculaFromFilename(file.name));
	if (matriculaFromText) {
		console.log(`${LOG_PREFIX} Matrícula extraída do PDF: ${matriculaFromText}`);
	} else if (matricula !== 'desconhecida') {
		console.log(`${LOG_PREFIX} Matrícula do nome do arquivo (sanitizada): ${matricula}`);
	}

	// 3. Position-based discipline extraction (replaces regex)
	const isDetailed = textoTotal.includes('EMENTA:') && /APROVADO\(A\)|REPROVADO\(A\)/.test(textoTotal);
	let disciplinas: DisciplinaExtraida[];

	console.time(`${LOG_PREFIX} disciplineExtraction`);
	if (isDetailed) {
		// Detailed format (with EMENTA, OBJETIVOS) — fall back to regex for this format
		// as it has a completely different layout
		const dados = extrairDadosAcademicos(textoTotal);
		disciplinas = dados.disciplinas.filter(d => d.tipo_dado === 'Disciplina Regular');
		console.log(`${LOG_PREFIX} Used regex fallback for detailed format — ${disciplinas.length} disciplines`);
	} else {
		// Standard format — use position-based extraction
		disciplinas = extractDisciplinasFromPositions(positionedPages);
		console.log(`${LOG_PREFIX} Position-based extraction — ${disciplinas.length} disciplines`);
	}
	disciplinas = consolidarDisciplinasRegularesParaPersistencia(disciplinas);
	console.timeEnd(`${LOG_PREFIX} disciplineExtraction`);

	// 4. Regex-based metadata extraction (these are simple single-line patterns)
	console.time(`${LOG_PREFIX} metadataExtraction`);
	// Extrair matriz primeiro para ancorar o curso ao bloco correto (evitar pegar outro curso no PDF)
	const matrizCurricular = extrairMatrizCurricular(textoTotal);
	let textoParaCurso = textoTotal;
	if (matrizCurricular) {
		// Encontrar a posição do código do currículo no texto (ex.: 8184/1 - 2019.2)
		const codeMatch = matrizCurricular.match(/^(\d+)\//);
		if (codeMatch) {
			const code = codeMatch[1];
			let idx = textoTotal.indexOf(code + '/');
			if (idx === -1) idx = textoTotal.indexOf(matrizCurricular);
			if (idx > 0) {
				// Usar só o trecho até o currículo + margem: curso e "Discente" estão nessa região
				const fim = Math.min(idx + matrizCurricular.length + 400, textoTotal.length);
				textoParaCurso = textoTotal.substring(0, fim);
			}
		}
	}
	const curso = extrairCurso(textoParaCurso);

	// Debug: Log lines around "Discente" and "Curso" to diagnose extraction issues
	if (!curso) {
		const lines = textoTotal.split('\n');
		console.log(`${LOG_PREFIX} [DEBUG] Course extraction failed. First 25 lines of text:`);
		for (let i = 0; i < Math.min(lines.length, 25); i++) {
			console.log(`${LOG_PREFIX} [DEBUG] Line ${i}: "${lines[i]}"`);
		}
	}

	const suspensoes = extrairSuspensoes(textoTotal);

	let ira: number | null = null;
	let iraTextoHistorico: string | null = null;
	const iraMatch = textoTotal.match(REGEX_IRA_HISTORICO);
	if (iraMatch) {
		iraTextoHistorico = iraMatch[1].trim();
		ira = iraStringParaNumero(iraTextoHistorico);
	}

	let mediaPonderada: number | null = null;
	const mpMatch = textoTotal.match(/MP[:\s]+(\d+[.,]\d+)/i);
	if (mpMatch) mediaPonderada = parseFloat(mpMatch[1].replace(',', '.'));
	console.timeEnd(`${LOG_PREFIX} metadataExtraction`);

	// 5. Pending disciplines (regex on flat text — these are in a separate section)
	console.time(`${LOG_PREFIX} pendingDisciplines`);
	// Usa o extrator do pdfDataExtractor, que tolera o cabeçalho colado
	// ("ComponentesCurriculares ObrigatóriosPendentes:29"), "MatriculadoemEquivalente"
	// e o formato detalhado (código na linha da EMENTA). A cópia simplificada que
	// ficava aqui devolvia 0 pendentes nesses layouts (pré-mortem R40).
	const pendentes = extrairDisciplinasPendentes(textoTotal);
	const pendentesDeclarados = textoTotal.match(
		/Componentes\s*Curriculares\s*Obrigat[óo]rios\s*Pendentes:\s*(\d+)/i
	);
	if (pendentesDeclarados && Number(pendentesDeclarados[1]) !== pendentes.length) {
		console.warn(
			`${LOG_PREFIX} Pending disciplines: PDF declares ${pendentesDeclarados[1]}, extracted ${pendentes.length}`
		);
	}
	console.timeEnd(`${LOG_PREFIX} pendingDisciplines`);

	// Histórico sem nenhuma disciplina cursada nem pendente não é um histórico
	// que o fluxograma consiga usar: antes seguia com "sucesso" e 0 disciplinas.
	if (disciplinas.length === 0 && pendentes.length === 0) {
		console.error(`${LOG_PREFIX} No disciplines (regular or pending) found — aborting`);
		throw new Error(MSG_NAO_E_HISTORICO);
	}

	// 6. Equivalências (regex)
	console.time(`${LOG_PREFIX} equivalencias`);
	const equivalencias = extrairEquivalencias(textoTotal);
	console.timeEnd(`${LOG_PREFIX} equivalencias`);

	// 6b. Carga horária integralizada (tabela "Carga Horária Integralizada/Pendente")
	const cargaHorariaIntegralizada = extrairCargaHorariaIntegralizada(textoTotal);

	// 7. Build the full disciplinas array with metadata entries
	const allDisciplinas: DisciplinaExtraida[] = [...disciplinas, ...pendentes];

	// Add status count entry. Conta sobre as disciplinas regulares já
	// consolidadas: contar as siglas no texto inteiro somava a legenda do rodapé
	// (+1 em cada sigla) e cada "Matriculado" da seção de pendentes (pré-mortem R41).
	const countMap: Record<string, number> = {};
	for (const d of disciplinas) {
		const key = String(d.status ?? '').trim().toUpperCase();
		if (key) countMap[key] = (countMap[key] || 0) + 1;
	}
	if (Object.keys(countMap).length > 0) {
		allDisciplinas.push({
			tipo_dado: 'Pendencias',
			nome: '', status: '', mencao: '', creditos: 0, codigo: '', carga_horaria: 0,
			ano_periodo: '', prefixo: '', professor: '', turma: '', frequencia: null, nota: null,
			valores: countMap,
		});
	}

	// Add IRA entry
	if (ira !== null) {
		allDisciplinas.push({
			tipo_dado: 'IRA',
			nome: '', status: '', mencao: '', creditos: 0, codigo: '', carga_horaria: 0,
			ano_periodo: '', prefixo: '', professor: '', turma: '', frequencia: null, nota: null,
			IRA: 'IRA',
			valor: ira,
			valor_texto: iraTextoHistorico ?? undefined,
		});
	}

	const semestreAtual = extrairSemestreAtual(allDisciplinas);
	const periodoReal = extrairPeriodoLetivoAtual(textoTotal);
	const numeroSemestre = periodoReal ?? calcularNumeroSemestre(allDisciplinas);

	const elapsed = (performance.now() - startTime).toFixed(0);
	const regularCount = disciplinas.length;
	const pendingCount = pendentes.length;
	console.log(`${LOG_PREFIX} ========================================`);
	console.log(`${LOG_PREFIX} Parsing complete in ${elapsed}ms`);
	console.log(`${LOG_PREFIX} Course: ${curso ?? '(not found)'}`);
	console.log(`${LOG_PREFIX} Matrix: ${matrizCurricular ?? '(not found)'}`);
	console.log(`${LOG_PREFIX} IRA: ${ira ?? 'N/A'} | MP: ${mediaPonderada ?? 'N/A'}`);
	console.log(`${LOG_PREFIX} Disciplines: ${regularCount} regular, ${pendingCount} pending`);
	console.log(`${LOG_PREFIX} Equivalencies: ${equivalencias.length}`);
	console.log(`${LOG_PREFIX} Semester: ${semestreAtual ?? 'N/A'} (#${numeroSemestre})`);
	if (cargaHorariaIntegralizada) {
		console.log(`${LOG_PREFIX} CH Integralizada: ${JSON.stringify(cargaHorariaIntegralizada)}`);
	} else {
		const debug = debugCargaHorariaIntegralizada(textoTotal);
		console.log(`${LOG_PREFIX} CH Integralizada: (not found)${debug.found ? ` — snippet: "${debug.snippet?.slice(0, 200)}..."` : ' — "Integralizado" não encontrado no texto'}`);
	}
	console.log(`${LOG_PREFIX} ========================================`);

	return {
		message: 'PDF processado com sucesso!',
		filename: file.name,
		matricula,
		curso_extraido: curso,
		matriz_curricular: matrizCurricular,
		media_ponderada: mediaPonderada,
		frequencia_geral: null,
		full_text: textoTotal,
		extracted_data: allDisciplinas,
		equivalencias_pdf: equivalencias,
		semestre_atual: semestreAtual,
		numero_semestre: numeroSemestre,
		suspensoes,
		carga_horaria_integralizada: cargaHorariaIntegralizada
	};
}
