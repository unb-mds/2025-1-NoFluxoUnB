

import { REGEX_IRA_HISTORICO, iraStringParaNumero } from '$lib/utils/ira';

const LOG_PREFIX = '[PDF-DataExtractor]';

// ─── Interfaces ───

export interface DisciplinaExtraida {
  tipo_dado: string;
  nome: string;
  status: string;
  mencao: string;
  creditos: number;
  codigo: string;
  carga_horaria: number;
  ano_periodo: string;
  prefixo: string;
  professor: string;
  turma: string;
  frequencia: string | null;
  nota: null;
  observacao?: string;
  IRA?: string;
  valor?: number;
  /** Trecho numérico como no PDF (ex. "4,1234") — exibição fiel, sem arredondar. */
  valor_texto?: string;
  valores?: Record<string, number>;
}

export interface EquivalenciaExtraida {
  cumpriu: string;
  nome_cumpriu: string;
  atraves_de: string;
  nome_equivalente: string;
  ch_cumpriu: string;
  ch_equivalente: string;
}

export interface DadosAcademicos {
  disciplinas: DisciplinaExtraida[];
  equivalencias: EquivalenciaExtraida[];
  curso: string | null;
  matriz_curricular: string | null;
  media_ponderada: number | null;
  ira: number | null;
  semestre_atual: string | null;
  numero_semestre: number | null;
  suspensoes: string[];
}

// ─── Status map for detailed format ───

const SITUACAO_MAP: Record<string, string> = {
  'APROVADO(A)': 'APR',
  'APROVADO': 'APR',
  'REPROVADO(A)': 'REP',
  'REPROVADO': 'REP',
  'CANCELADO(A)': 'CANC',
  'CANCELADO': 'CANC',
  'DISPENSADO(A)': 'DISP',
  'DISPENSADO': 'DISP',
  'TRANCADO(A)': 'TRANC',
  'TRANCADO': 'TRANC',
  'MATRICULADO(A)': 'MATR',
  'MATRICULADO': 'MATR',
  'CUMPRIU': 'CUMP',
};

// ─── Helper functions ───

export function normalizar(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export function limparNomeDisciplina(nome: string): string {
  let cleaned = nome;
  cleaned = cleaned.replace(/^\d{4}\.\d\s*/, '');
  cleaned = cleaned.replace(/^--\s*/, '');
  cleaned = cleaned.replace(/^[^a-zA-ZÀ-ÿ0-9]+/, '');
  cleaned = cleaned.replace(/[^a-zA-ZÀ-ÿ0-9]+$/, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  // Fix missing spaces from PDF.js concatenation:
  // Insert space between a lowercase/accented letter and an uppercase letter: "EAMBIENTE" → "E AMBIENTE"
  cleaned = cleaned.replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2');
  // Insert space between a letter and a digit: "CÁLCULO1" → "CÁLCULO 1", "DIGITAL1" → "DIGITAL 1"
  cleaned = cleaned.replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2');
  // Insert space between a digit and a letter: "1EXPERIMENTAL" → "1 EXPERIMENTAL"
  cleaned = cleaned.replace(/(\d)([A-Za-zÀ-ÿ])/g, '$1 $2');

  return cleaned.trim();
}

export function limparNomeProfessor(nome: string): string {
  let cleaned = nome;
  cleaned = cleaned.replace(
    /^(?:Dr\.|Dra\.|MSc\.|Prof\.|PhD\.?|Me\.|Ma\.)\s*/gi,
    ''
  );
  cleaned = cleaned.replace(/[^a-zA-ZÀ-ÿ\s]+$/, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  return cleaned.trim();
}

// ─── Metadata extractors ───

/**
 * Extrai o nome do curso para comparação com cursos.nome_curso no banco.
 * Retorna o nome normalizado (espaços colapsados, trim) para melhor match.
 */
export function extrairCurso(texto: string): string | null {
  // Normalize line endings for consistent matching
  const normalizedText = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Pattern 0a: Nome do curso na linha logo após "Discente" (ex.: GESTÃO DE POLÍTICAS PÚBLICAS/GPP - BACHARELADO - NOTURNO)
  // Curso: e Currículo: vêm em linhas seguintes, sem o nome repetido
  let m = normalizedText.match(
    /(?:Discente|do\s+Discente)\s*\n\s*([A-ZÀ-ÿ][A-ZÀ-ÿ\s]+)\/[A-Z]+\s*-\s*[A-ZÀ-ÿ\s]+\s*-\s*[A-ZÀ-ÿ]+/i
  );
  if (m) {
    return m[1].trim().replace(/\s{2,}/g, ' ');
  }

  // Pattern 0: Multi-line course name where name appears BEFORE "Curso:" label
  // Example:
  //   Dados do Vínculo do(a) Discente
  //   ENGENHARIA MECATRÔNICA - CONTROLE E AUTOMAÇÃO/FTD - ENGENHEIRO DE CONTROLE E
  //   Curso:
  //   AUTOMAÇÃO - DIURNO
  m = normalizedText.match(
    /(?:Discente|do Discente)\s*\n([A-ZÀ-ÿ][A-ZÀ-ÿ\s-]+)\/[A-Z]+ - [A-ZÀ-ÿ\s]+\nCurso:\s*\n[A-ZÀ-ÿ][A-ZÀ-ÿ\s]+\s+-\s+\w+/i
  );
  if (m) {
    // Return the course name (before the campus code)
    return m[1].trim().replace(/\s{2,}/g, ' ');
  }

  // Pattern 1: "Curso:\n<NAME>/CAMPUS - ..."
  m = normalizedText.match(
    /Curso:\s*\n([A-ZÀ-ÿ][A-ZÀ-ÿ\s]+(?:DE\s+[A-ZÀ-ÿ\s]+)*)\/[A-Z]+ - [A-ZÀ-ÿ\s]+ - [A-ZÀ-ÿ]+/mi
  );
  if (m) return m[1].trim().replace(/\s{2,}/g, ' ');

  // Pattern 2: "Curso:          NAME/CAMPUS-..."
  m = normalizedText.match(
    /Curso:\s+([A-ZÀ-ÿ][A-ZÀ-ÿ\s]+(?:DE\s+[A-ZÀ-ÿ\s]+)*)\/[A-Z]+\s*-/mi
  );
  if (m) return m[1].trim().replace(/\s{2,}/g, ' ');

  // Pattern 3: "Curso: NAME Status:"
  m = normalizedText.match(/Curso[:\s]+([A-ZÀ-Ÿ\s/\\-]+?)(?:\s+Status:|$)/mi);
  if (m) return m[1].trim().replace(/\s{2,}/g, ' ');

  return null;
}

/**
 * Extrai o campo Currículo do histórico (informação principal para achar a estrutura no banco).
 * Formato: código do curso / versão da matriz (ex.: "60810/1", "8150/-2").
 * O ano (ex.: " - 2017.2") é opcional e só visual; a comparação no banco usa só código + versão.
 */
export function extrairMatrizCurricular(texto: string): string | null {
  const normalizedText = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // "Currículo: 60810/1" ou "Currículo:\n60810/1" (código na mesma linha ou na próxima)
  let m = normalizedText.match(/Curr[ií]culo:\s*\n?\s*(\d+\/-?\d+)(?:\s*-\s*\d{4}\.\d)?/mi);
  if (m) return m[1].trim();

  // "Currículo:" em uma linha e "8184/1 - 2019.2" várias linhas depois (layout com labels no meio)
  m = normalizedText.match(/Curr[ií]culo:[\s\S]*?(\d+\/-?\d+)\s*-\s*(\d{4}\.\d)/mi);
  if (m) return `${m[1].trim()} - ${m[2]}`;

  // "Currículo:    6360/1 - 2017.1" (com ano)
  m = normalizedText.match(/Curr[ií]culo:\s*\n?(\d+\/-?\d+)\s*-\s*(\d{4}\.\d)/mi);
  if (m) return `${m[1].trim()} - ${m[2]}`;

  // Sem label: "6360/1 - 2017.1" ou só "60810/1" no texto. Exige 3+ dígitos
  // antes da barra e nada de dígito/barra colado antes: sem isso a data
  // "16/01/1962" do cabeçalho virava a matriz "16/01" (pré-mortem R12).
  m = normalizedText.match(/(?<![\d/])(\d{3,}\/-?\d+)(?:\s*-\s*\d{4}\.\d)?/m);
  if (m) return m[1].trim();

  return null;
}

/**
 * Extrai a matrícula do discente do texto do PDF (histórico escolar SIGAA).
 * Prioridade: usar sempre o valor extraído do conteúdo do PDF para evitar lixo do nome do arquivo (ex.: "231026330 (2)").
 * Padrões: "Matrícula: 231026330", "Matricula 231026330", "Nº do Discente 231026330", etc.
 * Retorna apenas dígitos (8 a 12 dígitos, típico da UnB); null se não encontrar.
 */
export function extrairMatriculaFromText(texto: string): string | null {
  const normalizedText = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Matrícula (com ou sem acento) seguido de : ou espaço e depois só dígitos
  let m = normalizedText.match(/\bMatr[ií]cula\s*:?\s*(\d{8,12})\b/i);
  if (m) return m[1];
  // Nº do Discente / Nº do discente
  m = normalizedText.match(/\bN[º°]\s*do\s+Discente\s*:?\s*(\d{8,12})\b/i);
  if (m) return m[1];
  // Número do discente
  m = normalizedText.match(/\bN[úu]mero\s+do\s+discente\s*:?\s*(\d{8,12})\b/i);
  if (m) return m[1];
  return null;
}

/**
 * Extrai a carga horária integralizada da tabela "Carga Horária Integralizada/Pendente".
 * Localiza a linha "Integralizado" e extrai os valores numéricos das colunas Obrigatórias, Optativos, Complementares.
 * Retorna objeto compatível com a coluna carga_horaria_integralizada da tabela dados_users.
 * Se complementar estiver em branco, assume 0.
 *
 * O PDF da UnB pode extrair a tabela em layout variado:
 * - Título "Carga Horária Integralizada/Pendente" pode vir ANTES ou DEPOIS dos dados
 * - Linhas: Exigido, Integralizado, Pendente (cada uma em linha separada)
 * - Valores em blocos: "630 h\n120 h\n510 h" (coluna) ou "120 h 1110 h 990 h 0 h" (linha)
 */
export function extrairCargaHorariaIntegralizada(texto: string): {
	obrigatoria: number;
	optativa: number;
	complementar: number;
	total: number;
} | null {
	const s = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

	// Estratégia 0 (PRIORITÁRIA): "Integralizado" na MESMA LINHA que os 4 valores
	// Ex: "Integralizado          990 h          120 h          0 h          1110 h"
	// Evita pegar números da linha Exigido quando os valores vêm em linhas separadas
	const linhaIntegral = s.match(/Integralizado\s+(\d+)\s*h\s+(\d+)\s*h\s+(\d+)\s*h\s+(\d+)\s*h/i);
	if (linhaIntegral) {
		const obrigatoria = parseInt(linhaIntegral[1], 10);
		const optativa = parseInt(linhaIntegral[2], 10);
		const complementar = parseInt(linhaIntegral[3], 10);
		const total = parseInt(linhaIntegral[4], 10);
		const soma = obrigatoria + optativa + complementar;
		if (Math.abs(soma - total) <= 10) {
			return { obrigatoria, optativa, complementar, total };
		}
	}
	// Variante: "Integralizado" na linha anterior aos números (sem "Pendente" entre eles)
	const linhaIntegralNext = s.match(/Integralizado\s*\n\s*(\d+)\s*h\s+(\d+)\s*h\s+(\d+)\s*h\s+(\d+)\s*h/i);
	if (linhaIntegralNext) {
		const obrigatoria = parseInt(linhaIntegralNext[1], 10);
		const optativa = parseInt(linhaIntegralNext[2], 10);
		const complementar = parseInt(linhaIntegralNext[3], 10);
		const total = parseInt(linhaIntegralNext[4], 10);
		const soma = obrigatoria + optativa + complementar;
		if (Math.abs(soma - total) <= 10) {
			return { obrigatoria, optativa, complementar, total };
		}
	}

	// Estratégia A: Layout do PDF — Exigido, Integralizado, Pendente (linhas)
	// Valores vêm DEPOIS das 3 linhas. O PDF da UnB extrai POR COLUNA:
	//   Colunas: Optativos(3 vals), Total(3), Obrigatórias(3), Complementares(3)
	//   Integralizado = 2º valor de cada coluna → idx 1, 4, 7, 10
	const matchPendente = s.match(/Exigido\s*\nIntegralizado\s*\nPendente\s*\n/i);
	if (matchPendente && matchPendente.index != null) {
		const idxInicioNumeros = matchPendente.index + matchPendente[0].length;
		const bloco = s.substring(idxInicioNumeros, idxInicioNumeros + 500);
		const numeros = [...bloco.matchAll(/(\d+)\s*h/gi)].map((m) => parseInt(m[1], 10));

		if (numeros.length >= 12) {
			// POR COLUNA (layout real do PDF): Integralizado = idx 1,4,7,10
			const optativa = numeros[1] ?? 0;
			const total = numeros[4] ?? 0;
			const obrigatoria = numeros[7] ?? 0;
			const complementar = numeros[10] ?? 0;
			const soma = obrigatoria + optativa + complementar;
			if (Math.abs(soma - total) <= 10) {
				return { obrigatoria, optativa, complementar, total: total || soma };
			}
		}
		if (numeros.length >= 8) {
			// Fallback: ordem por LINHA (Exigido, Integralizado, Pendente) → Integralizado = idx 4,5,6,7
			// Colunas: Obrigatórias, Optativos, Complementares, Total
			const obrig = numeros[4] ?? 0;
			const opt = numeros[5] ?? 0;
			const compl = numeros[6] ?? 0;
			const total = numeros[7] ?? 0;
			const soma = obrig + opt + compl;
			if (Math.abs(soma - total) <= 10) {
				return { obrigatoria: obrig, optativa: opt, complementar: compl, total: total || soma };
			}
		}
	}

	// Fallback: mesmo padrão (sem "Exigido" explícito antes)
	const matchIntegral = s.match(/\nIntegralizado\s*\nPendente\s*\n/i);
	if (matchIntegral && matchIntegral.index != null) {
		const idxInicio = matchIntegral.index + matchIntegral[0].length;
		const bloco = s.substring(idxInicio, idxInicio + 500);
		const numeros = [...bloco.matchAll(/(\d+)\s*h/gi)].map((m) => parseInt(m[1], 10));
		if (numeros.length >= 12) {
			// POR COLUNA: Integralizado = idx 1,4,7,10
			const optativa = numeros[1] ?? 0;
			const total = numeros[4] ?? 0;
			const obrigatoria = numeros[7] ?? 0;
			const complementar = numeros[10] ?? 0;
			const soma = obrigatoria + optativa + complementar;
			if (Math.abs(soma - total) <= 10) {
				return { obrigatoria, optativa, complementar, total: total || soma };
			}
		}
		if (numeros.length >= 8) {
			// Fallback por LINHA: idx 4,5,6,7 = obrig, opt, compl, total
			const obrig = numeros[4] ?? 0, opt = numeros[5] ?? 0, compl = numeros[6] ?? 0, total = numeros[7] ?? 0;
			const soma = obrig + opt + compl;
			if (Math.abs(soma - total) <= 10) {
				return { obrigatoria: obrig, optativa: opt, complementar: compl, total: total || soma };
			}
		}
	}

	// Estratégia B: "Integralizado" seguido de números (formato tradicional)
	// NÃO capturar se "Pendente" aparecer antes dos números — isso indicaria layout
	// Exigido/Integralizado/Pendente em linhas separadas com números depois (Exigido primeiro)
	const blocoMatch = s.match(/Integralizad[oa](?:(?!Pendente)[\s\S]){0,300}?(\d+)\s*h[\s\S]{0,150}?(\d+)\s*h[\s\S]{0,150}?(\d+)\s*h(?:\s*[\s\S]{0,150}?(\d+)\s*h)?/i);
	if (blocoMatch) {
		const obrigatoria = parseInt(blocoMatch[1], 10);
		const optativa = parseInt(blocoMatch[2], 10);
		const complementar = parseInt(blocoMatch[3], 10);
		const total = blocoMatch[4] ? parseInt(blocoMatch[4], 10) : obrigatoria + optativa + complementar;
		const soma = obrigatoria + optativa + complementar;
		if (Math.abs(soma - total) <= 10) {
			return { obrigatoria, optativa, complementar, total };
		}
	}

	// Estratégia C: Buscar bloco entre "Integralizado" e o próximo rótulo da tabela.
	// Só aceita se a soma bater com o total; antes somava os 3 primeiros números sem
	// validar e, com Complementares em branco, cruzava para a linha seguinte e
	// devolvia um total inventado (pré-mortem R18). Sem validação → null.
	const blocoIntegral = s.match(
		/Integralizado\s*\n([\s\S]{0,400}?)(?=Carga Horária|Legenda|Complementares|Pendente|Exigido|$)/i
	);
	if (blocoIntegral) {
		const nums = [...blocoIntegral[1].matchAll(/(\d+)\s*h/gi)].map((m) => parseInt(m[1], 10));
		if (nums.length >= 4) {
			const [obrigatoria, optativa, complementar, total] = nums;
			if (Math.abs(obrigatoria + optativa + complementar - total) <= 10) {
				return { obrigatoria, optativa, complementar, total };
			}
		} else if (nums.length === 3) {
			// Complementares em branco: obrigatória, optativa e total
			const [obrigatoria, optativa, total] = nums;
			if (Math.abs(obrigatoria + optativa - total) <= 10) {
				return { obrigatoria, optativa, complementar: 0, total };
			}
		}
	}

	return null;
}

/**
 * Versão com log para debug — use temporariamente se a extração falhar.
 * Exemplo: console.log(debugCargaHorariaIntegralizada(fullText));
 */
export function debugCargaHorariaIntegralizada(texto: string): { found: boolean; snippet?: string } {
	const idx = texto.search(/[Ii]ntegralizad[oa]|ntegralizado/i);
	if (idx < 0) return { found: false };
	const snippet = texto.substring(Math.max(0, idx - 30), idx + 350);
	return { found: true, snippet };
}

export function extrairSuspensoes(texto: string): string[] {
  const m = texto.match(/Suspens[õo]es:\s+(.+)/i);
  if (m) {
    const val = m[1].trim();
    if (/nenhum/i.test(val)) return [];
    const periods = val.match(/\d{4}\.\d/g);
    return periods || [];
  }
  return [];
}

export function extrairPeriodoLetivoAtual(texto: string): number | null {
  const m = texto.match(/Per[íi]odo Letivo Atual:\s*(\d+)/i);
  if (m) {
    return parseInt(m[1], 10);
  }
  return null;
}

export function extrairSemestreAtual(
  disciplinas: DisciplinaExtraida[]
): string | null {
  const semestres: string[] = [];
  for (const d of disciplinas) {
    if (d.status === 'MATR' && d.ano_periodo && /^\d{4}\.\d$/.test(d.ano_periodo)) {
      semestres.push(d.ano_periodo);
    }
  }
  if (semestres.length === 0) return null;
  semestres.sort((a, b) => {
    const [ya, sa] = a.split('.').map(Number);
    const [yb, sb] = b.split('.').map(Number);
    return ya !== yb ? ya - yb : sa - sb;
  });
  return semestres[semestres.length - 1];
}

export function calcularNumeroSemestre(
  disciplinas: DisciplinaExtraida[]
): number {
  const validStatuses = new Set(['APR', 'DISP', 'REP', 'REPF', 'REPMF', 'CUMP']);
  const uniqueSemesters = new Set<string>();
  for (const d of disciplinas) {
    // Só semestres regulares (.1/.2): o SIGAA não conta verão (.3/.4) no
    // Período Letivo Atual, e isto é o fallback para quando ele falta (pré-mortem R37).
    if (validStatuses.has(d.status) && /^\d{4}\.[12]$/.test(d.ano_periodo)) {
      uniqueSemesters.add(d.ano_periodo);
    }
  }
  const count = uniqueSemesters.size;
  return count > 0 ? count + 1 : 1;
}

// ─── Helpers for name/professor line detection ───

/** Full metadata exclusion pattern — used both for skipping data lines and for prevLine name checks */
const RE_METADATA_LINE_CI =
  /^(SIGAA|UnB|DEG|SAA|Credenciada|na seção|Histórico|Dados|Nome:|Data de|Nacionalidade|Nº do|Curso:|Status:|Índices|Ênfase|IRA:|Reconhecimento|Ano \/|Forma de|Período Letivo Atual|Suspensões|Prorrogações|Tipo Saída|Data de Saída|Data da|Componentes Curriculares|Ano\/Período|Letivo\s+Componente|Legenda|SIGLA|Para verificar|Página|e o código|Carga Horária|Obrigatórias|Exigido|Integralizado|Pendente\s|Código\s+Componente|Observações|Menções|Equivalências|Matrícula|Perfil|INGRESSANTE|Optativos|Complementares|Total|REP\s|REPF\s|REPMF\s|TRANC\s|CUMP\s|APR\s|CANC\s|DISP\s|MATR\s|Nenhum|Fecha|Turma|Frequência|\d+\s*h\s*$)/i;

/**
 * Rótulos que também abrem nome de disciplina ("TRABALHO DE CONCLUSÃO DE CURSO 1",
 * "ATENÇÃO PRIMÁRIA À SAÚDE", "CURRÍCULO", "CAMPUS MULTIMÍDIA"): sem /i, porque no
 * SIGAA o rótulo vem em Title Case e o nome da disciplina em CAIXA ALTA (pré-mortem R4).
 */
const RE_METADATA_LINE_CS = /^(Campus|Currículo|Trabalho|Atenção|Descrição)/;

function isMetadataLine(line: string): boolean {
  return RE_METADATA_LINE_CI.test(line) || RE_METADATA_LINE_CS.test(line);
}

/** Detects professor lines: starts with Dr./Dra./MSc./Prof. or contains "(XXh)" pattern */
function isProfessorLine(line: string): boolean {
  if (/^(?:Dr\.|Dra\.|MSc\.|Prof\.)\s/i.test(line)) return true;
  if (/\(\d+h\)/i.test(line)) return true;
  // Raw name followed by (Xh) — e.g. "HARINEIDE MADEIRA MACEDO (12h), Dra."
  if (/^[A-ZÀ-ÿ][A-ZÀ-ÿ\s.,]+\(\d+h\)/i.test(line)) return true;
  return false;
}

/** Checks if a line is a valid candidate for a discipline name (for i-1 / i-2 lookup) */
function isValidNameLine(
  line: string,
  reDataLine: RegExp,
  reSituacao: RegExp
): boolean {
  if (line.length <= 2) return false;
  if (!/^[A-ZÀ-ÿ]/.test(line)) return false;
  if (reDataLine.test(line)) return false;
  if (reSituacao.test(line)) return false;
  if (isMetadataLine(line)) return false;
  if (/^\d{4}\.\d/.test(line)) return false;
  if (isProfessorLine(line)) return false;
  // Skip lines that look like pending discipline entries: "CODE  NAME  CH h" or "CODE-NAME..."
  if (/^[A-Z]{2,}\d{3,}[\s-]+[A-ZÀ-ÿ]/.test(line)) return false;
  // Skip lines with only dashes/symbols
  if (/^[-–—*#&@§%\s]+$/.test(line)) return false;
  // Skip lines that contain period + hours pattern (e.g. "2023.2 15h")
  if (/\d{4}\.\d\s+\d+\s*h/i.test(line)) return false;
  return true;
}

// ─── Core discipline extraction (Formats A/B/C) ───

/**
 * Single-regex approach for data lines. Matches:
 *   "2019.1  * CIC0004          90    AA   92,0  MM   APR"
 *   "2021.1  * CIC0004ALGORITMOS E PROG...  90    AA  100,0  SS   APR"
 *   "--   * FGA0221INTELIGÊNCIA ARTIFICIAL  60    --    --    -   CUMP"
 *   "2022.2  & CIC0004Dr. GIOVANNI...(90h)  90    08   --    -   TRANC"
 */
function extrairDisciplinasDaLinha(
  _text: string,
  linhas: string[]
): DisciplinaExtraida[] {
  const disciplinas: DisciplinaExtraida[] = [];
  const usedLines = new Set<number>();

  const reSituacao = /\b(APR|REP|REPF|REPMF|CANC|DISP|TRANC|MATR|CUMP)\b/;

  // Main regex: period, symbols, code, middle, CH, turma, freq, nota, situacao
  const reDataLine =
    /^(\d{4}\.?\d?|--)\s+([*&#e@§%]*)\s*([A-Z]{2,}\d{3,})(.*?)\s{2,}(\d{2,3})\s+(\S{1,4})\s+(\d{1,3}[,.]?\d*|--)\s+(SS|MS|MM|MI|II|SR|-{1,3})\s+(APR|REP|REPF|REPMF|CANC|DISP|TRANC|MATR|CUMP)\b/;

  // NEW: Format with professor + data on separate line:
  // "Dr. NAME (XXh)  CH  TURMA  FREQ  NOTA  SITUACAO"
  const reProfessorDataLine =
    /^((?:Dr\.|Dra\.|MSc\.|Prof\.)\s+[A-ZÀ-ÿ][A-ZÀ-ÿ\s.,]+(?:\([0-9]+h\))?(?:\s*,\s*(?:Dr\.|Dra\.|MSc\.|Prof\.)\s+[A-ZÀ-ÿ][A-ZÀ-ÿ\s.,]+\([0-9]+h\))*)\s+(\d{2,3})\s+(\S{1,4})\s+(\d{1,3}[,.]?\d*|--)\s+(SS|MS|MM|MI|II|SR|-{1,3})\s+(APR|REP|REPF|REPMF|CANC|DISP|TRANC|MATR|CUMP)\b/;

  // Regex to match period+code+name line (without trailing data)
  const reNameLine = /^(\d{4}\.?\d?|--)\s+([*&#e@§%]*)\s*([A-Z]{2,}\d{3,})\s+([A-ZÀ-ÿ][A-ZÀ-ÿ\s0-9-]+?)\s*$/;

  for (let i = 0; i < linhas.length; i++) {
    if (usedLines.has(i)) continue;
    const line = linhas[i];

    // Skip header/footer/legend lines
    if (isMetadataLine(line.trim())) {
      continue;
    }

    // Try main format first
    let match = line.match(reDataLine);
    if (match) {
      const [
        ,
        periodo,
        prefixo,
        codigo,
        middleText,
        chStr,
        turma,
        freq,
        nota,
        situacao,
      ] = match;

      usedLines.add(i);

      // Determine discipline name and professor
      let nome = '';
      let professor = '';

      const middleTrimmed = middleText.trim();

      if (middleTrimmed) {
        // Check for embedded professor (Format C): "Dr. NAME(XXh)"
        const profMatch = middleTrimmed.match(
          /^((?:Dr\.|Dra\.|MSc\.|Prof\.)\s+[A-ZÀ-ÿ][A-ZÀ-ÿ\s.]+?)\s*\((\d+)h\)/i
        );
        if (profMatch) {
          professor = limparNomeProfessor(profMatch[1]);
          const afterProf = middleTrimmed.substring(profMatch[0].length).trim();
          if (afterProf) nome = afterProf;
        } else if (/^(?:Dr\.|Dra\.|MSc\.|Prof\.)/i.test(middleTrimmed)) {
          // Professor name without (Xh) — treat as professor, not name
          professor = middleTrimmed;
        } else {
          // middleText is the discipline name (Format B)
          nome = middleTrimmed;
        }
      }

      // If no name found, look at previous lines (Format A or C with name above)
      // Try i-1 first; if it's a professor line, try i-2 (professor between name and data)
      if (!nome && i > 0) {
        const prevLine = linhas[i - 1].trim();

        if (isValidNameLine(prevLine, reDataLine, reSituacao)) {
          nome = prevLine;
          usedLines.add(i - 1);
        } else if (isProfessorLine(prevLine) && i > 1) {
          // Professor is between name and data line — try i-2
          if (!professor) professor = prevLine;
          usedLines.add(i - 1);
          const prevPrevLine = linhas[i - 2].trim();
          if (isValidNameLine(prevPrevLine, reDataLine, reSituacao)) {
            nome = prevPrevLine;
            usedLines.add(i - 2);
          }
        }
      }

      // Check for multi-professor format in middle text
      if (!nome && middleTrimmed) {
        const multiProfMatch = middleTrimmed.match(
          /^((?:(?:Dr\.|Dra\.|MSc\.|Prof\.)\s+[A-ZÀ-ÿ][A-ZÀ-ÿ\s.]+?\s*\(\d+h\)(?:\s*,\s*)?)+)/i
        );
        if (multiProfMatch) {
          professor = multiProfMatch[1].trim();
        }
      }

      // Check line after for professor (Format A)
      if (!professor && i + 1 < linhas.length && !usedLines.has(i + 1)) {
        const nextLine = linhas[i + 1].trim();
        const profLineMatch = nextLine.match(
          /^((?:Dr\.|Dra\.|MSc\.|Prof\.)\s+[A-ZÀ-ÿ][A-ZÀ-ÿ\s.,]+(?:\(\d+h\)(?:\s*,\s*(?:Dr\.|Dra\.|MSc\.|Prof\.)\s+[A-ZÀ-ÿ][A-ZÀ-ÿ\s.,]+\(\d+h\))*)?)/i
        );
        if (profLineMatch) {
          professor = profLineMatch[1].trim();
          usedLines.add(i + 1);
        }
      }

      // Clean up name
      nome = limparNomeDisciplina(nome);

      // Handle menção
      const mencao = nota === '---' || nota === '-' ? '-' : nota;

      // Parse carga horaria
      const cargaH = parseInt(chStr) || 0;

      // Normalize periodo
      let anoPeriodo = periodo === '--' ? '' : periodo;
      if (anoPeriodo && !/^\d{4}\.\d$/.test(anoPeriodo)) {
        // Período truncado ("2022."): desconhecido, não "2022.0" (pré-mortem R37)
        if (/^\d{4}\.$/.test(anoPeriodo)) {
          anoPeriodo = '';
        }
      }

      disciplinas.push({
        tipo_dado: 'Disciplina Regular',
        nome,
        status: situacao,
        mencao,
        creditos: cargaH > 0 ? Math.floor(cargaH / 15) : 0,
        codigo,
        carga_horaria: cargaH,
        ano_periodo: anoPeriodo,
        prefixo: prefixo || '',
        professor: limparNomeProfessor(professor),
        turma,
        frequencia: freq !== '--' ? freq : null,
        nota: null,
      });
      continue;
    }

    // NEW: Try professor+data on separate line (Format E)
    // Check if current line is "period+code+name" and next is "professor+data"
    const nameMatch = line.match(reNameLine);
    if (nameMatch && i + 1 < linhas.length && !usedLines.has(i + 1)) {
      const [, periodo, prefixo, codigo, nomePrevio] = nameMatch;
      const nextLine = linhas[i + 1].trim();
      const profDataMatch = nextLine.match(reProfessorDataLine);

      if (profDataMatch) {
        const [, professorText, chStr, turma, freq, nota, situacao] = profDataMatch;

        usedLines.add(i);
        usedLines.add(i + 1);

        const nome = limparNomeDisciplina(nomePrevio);
        const professor = limparNomeProfessor(professorText);
        const mencao = nota === '---' || nota === '-' ? '-' : nota;
        const cargaH = parseInt(chStr) || 0;

        let anoPeriodo = periodo === '--' ? '' : periodo;
        if (anoPeriodo && !/^\d{4}\.\d$/.test(anoPeriodo)) {
          // Período truncado ("2022."): desconhecido, não "2022.0" (pré-mortem R37)
          if (/^\d{4}\.$/.test(anoPeriodo)) {
            anoPeriodo = '';
          }
        }

        disciplinas.push({
          tipo_dado: 'Disciplina Regular',
          nome,
          status: situacao,
          mencao,
          creditos: cargaH > 0 ? Math.floor(cargaH / 15) : 0,
          codigo,
          carga_horaria: cargaH,
          ano_periodo: anoPeriodo,
          prefixo: prefixo || '',
          professor,
          turma,
          frequencia: freq !== '--' ? freq : null,
          nota: null,
        });
      }
    }
  }

  return disciplinas;
}

// ─── Detailed format extraction (Format D) ───

/**
 * Extract disciplines from DETAILED format (with EMENTA, OBJETIVOS, etc.)
 */
function extrairDisciplinasDetalhado(
  _text: string,
  linhas: string[]
): DisciplinaExtraida[] {
  const disciplinas: DisciplinaExtraida[] = [];

  const reDetailed =
    /^([A-ZÀ-ÿ][A-ZÀ-ÿ\s0-9-]+?)\s{2,}(\d{2,3})\s+(APROVADO\(A\)|REPROVADO\(A\)|CANCELADO\(A\)|DISPENSADO\(A\)|TRANCADO\(A\)|MATRICULADO\(A\)|CUMPRIU|APROVADO|REPROVADO)/i;

  const rePeriodCode =
    /^(\d{4}\.\d)\s*([*&#e@§%]*)\s*([A-Z]{2,}\d{3,})/;

  for (let i = 0; i < linhas.length; i++) {
    const match = linhas[i].match(reDetailed);
    if (!match) continue;

    const [, nome, chStr, situacaoLong] = match;
    const status = SITUACAO_MAP[situacaoLong.toUpperCase()] || situacaoLong;
    const cargaH = parseInt(chStr) || 0;

    // Search forward for the period+code line (within next ~60 lines)
    let codigo = '';
    let anoPeriodo = '';
    let prefixo = '';

    for (let j = i + 1; j < Math.min(i + 60, linhas.length); j++) {
      const pcMatch = linhas[j].match(rePeriodCode);
      if (pcMatch) {
        anoPeriodo = pcMatch[1];
        prefixo = pcMatch[2] || '';
        codigo = pcMatch[3];
        break;
      }
      // Stop if we hit the next discipline header
      if (reDetailed.test(linhas[j])) break;
    }

    disciplinas.push({
      tipo_dado: 'Disciplina Regular',
      nome: limparNomeDisciplina(nome),
      status,
      mencao: '-', // detailed format doesn't show menção
      creditos: cargaH > 0 ? Math.floor(cargaH / 15) : 0,
      codigo,
      carga_horaria: cargaH,
      ano_periodo: anoPeriodo,
      prefixo,
      professor: '',
      turma: '',
      frequencia: null,
      nota: null,
    });
  }

  return disciplinas;
}

// ─── Pending disciplines extraction ───

/**
 * Extract pending disciplines from "Componentes Curriculares Obrigatórios Pendentes" section.
 */
export function extrairDisciplinasPendentes(text: string): DisciplinaExtraida[] {
  const disciplinas: DisciplinaExtraida[] = [];

  // Find ALL occurrences of the pending header (handles page breaks and concatenated text)
  const pendRegex = /Componentes\s*Curriculares\s*Obrigat[óo]rios\s*Pendentes:\s*(\d+)/gi;
  const allMatches = [...text.matchAll(pendRegex)];
  if (allMatches.length === 0) return disciplinas;

  // Detect if pending section uses detailed format (with EMENTA sections)
  const isDetailedPending = (() => {
    const firstIdx = (allMatches[0].index ?? 0) + allMatches[0][0].length;
    const sample = text.substring(firstIdx, firstIdx + 2000);
    return /EMENTA:/i.test(sample);
  })();

  const seenCodes = new Set<string>();

  for (const pendMatch of allMatches) {
    const pendIdx = (pendMatch.index ?? 0) + pendMatch[0].length;
    const pendSection = text.substring(pendIdx);
    const linhas = pendSection.split('\n');

    // Skip header lines ("Código    Componente Curricular    CH")
    const reHeader = /^C[óo]digo\s+Componente/i;
    let started = false;

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const trimmed = linha.trim();

      if (reHeader.test(trimmed)) {
        started = true;
        continue;
      }
      if (!started) continue;

      // Stop at next section markers (with optional missing spaces for concatenated text)
      if (
        /^(Observa[çc][õo]es|Equival[êe]ncias|Para\s*verificar|Aten[çc][ãa]o|SIGAA|Componentes\s*Curriculares)/i.test(
          trimmed
        )
      ) {
        break;
      }

      // Skip page break noise lines
      if (
        /^(Página|e o\s*c[óo]digo|UnB|DEG|SAA|Campus|Credenciada|na seção|Hist[óo]rico|Nome:\s|Matr[ií]cula)/i.test(
          trimmed
        )
      ) {
        continue;
      }

      if (isDetailedPending) {
        // Detailed format: NAME  CH h (then EMENTA + code on subsequent lines)
        const detMatch = trimmed.match(
          /^([A-ZÀ-ÿ][A-ZÀ-ÿ\s0-9-]+?)\s{2,}(\d{1,3})\s*h\s*$/
        );
        if (detMatch) {
          const [, nome, chStr] = detMatch;
          // Skip CADEIA entries and headers
          if (/^CADEIA/i.test(nome.trim())) continue;
          if (/^C[óo]digo/i.test(nome.trim())) continue;

          // Search forward for code in EMENTA lines
          let codigo = '';
          for (
            let j = i + 1;
            j < Math.min(i + 40, linhas.length);
            j++
          ) {
            const codeLine = linhas[j].trim();
            // Check for discipline code at start of line
            const codeMatch = codeLine.match(/^([A-Z]{2,}\d{3,})/);
            if (codeMatch) {
              codigo = codeMatch[1];
              break;
            }
            // Check for ENADE
            if (/^ENADE$/i.test(codeLine)) {
              codigo = 'ENADE';
              break;
            }
            // Check for dash (CADEIA code)
            if (/^-$/.test(codeLine)) {
              codigo = '-';
              break;
            }
            // Stop if we hit another discipline header or section marker
            if (
              /^[A-ZÀ-ÿ][A-ZÀ-ÿ\s0-9-]+?\s{2,}\d{1,3}\s*h\s*$/.test(
                codeLine
              )
            )
              break;
            if (
              /^(Observa|Equival[êe]ncias|Para\s*verificar|Aten)/i.test(
                codeLine
              )
            )
              break;
          }

          if (!codigo || codigo === '-') continue; // skip CADEIA and no-code
          if (seenCodes.has(codigo) && codigo !== 'ENADE') continue;
          seenCodes.add(codigo);

          disciplinas.push({
            tipo_dado: 'Disciplina Pendente',
            nome: limparNomeDisciplina(nome),
            status: 'PENDENTE',
            mencao: '-',
            creditos: Math.floor(parseInt(chStr) / 15),
            codigo: codigo === 'ENADE' ? 'ENADE' : codigo,
            carga_horaria: parseInt(chStr),
            ano_periodo: '',
            prefixo: '',
            professor: '',
            turma: '',
            frequencia: null,
            nota: null,
          });
        }
      } else {
        // Simple format: CODE  NAME  [Matriculado|Matriculado em Equivalente]  CH h
        const m = linha.match(
          /^\s*([A-Z]{2,}\d{3,}|ENADE|-)\s+(.+?)\s+(?:(Matriculado(?:\s+em\s+Equivalente)?)\s+)?(\d+)\s*h/i
        );
        if (m) {
          let [, codigo, nome, matriculado, chStr] = m;
          if (codigo === '-') continue; // Skip "CADEIA DE SELETIVIDADE" entries

          // Skip professor lines that accidentally match
          if (/^(?:Dr\.|Dra\.|MSc\.|Prof\.)\s/i.test(nome.trim())) continue;
          if (/\(\d+h\)/i.test(nome)) continue;

          // Handle concatenated Matriculado in name (e.g. "NAMEMatriculadoemEquivalente")
          if (!matriculado) {
            const matrMatch = nome.match(
              /\s*(Matriculado(?:\s*em\s*Equivalente)?)\s*$/i
            );
            if (matrMatch) {
              nome = nome.substring(0, nome.length - matrMatch[0].length);
              matriculado = matrMatch[1];
            }
          }

          if (seenCodes.has(codigo) && codigo !== 'ENADE') continue;
          seenCodes.add(codigo);

          disciplinas.push({
            tipo_dado: 'Disciplina Pendente',
            nome: limparNomeDisciplina(nome),
            status: matriculado ? 'MATR' : 'PENDENTE',
            mencao: '-',
            creditos: Math.floor(parseInt(chStr) / 15),
            codigo: codigo === 'ENADE' ? 'ENADE' : codigo,
            carga_horaria: parseInt(chStr),
            ano_periodo: '',
            prefixo: '',
            professor: '',
            turma: '',
            frequencia: null,
            nota: null,
            ...(matriculado ? { observacao: matriculado } : {}),
          });
        }
      }
    }
  }

  return disciplinas;
}

// ─── Equivalências extraction ───

function extrairEquivalencias(text: string): EquivalenciaExtraida[] {
  const equivalencias: EquivalenciaExtraida[] = [];
  const reEquiv =
    /Cumpriu\s*([A-Z]{2,}\d{3,})\s*-\s*([A-ZÀ-Ÿ\s0-9-]+?)\s*\((\d+)h\)\s*atrav[eé]s\s*de\s*([A-Z]{2,}\d{3,})\s*-\s*([A-ZÀ-Ÿ\s0-9-]+?)\s*\((\d+)h\)/gi;

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

// ─── Main extraction function ───

export function extrairDadosAcademicos(textoTotal: string): DadosAcademicos {
  console.log(`${LOG_PREFIX} === STARTING ACADEMIC DATA EXTRACTION ===`);
  console.log(
    `${LOG_PREFIX} Input: ${textoTotal.length} chars, ${textoTotal.split('\n').length} lines`
  );

  const linhas = textoTotal.split('\n');

  // ─── Metadata ───
  const curso = extrairCurso(textoTotal);
  const matrizCurricular = extrairMatrizCurricular(textoTotal);
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

  console.log(`${LOG_PREFIX} [CURSO] ${curso ?? '(not found)'}`);
  console.log(`${LOG_PREFIX} [MATRIZ] ${matrizCurricular ?? '(not found)'}`);
  console.log(`${LOG_PREFIX} [IRA] ${ira ?? '(not found)'}`);
  console.log(`${LOG_PREFIX} [MP] ${mediaPonderada ?? '(not found)'}`);
  console.log(
    `${LOG_PREFIX} [SUSPENSÕES] ${suspensoes.length > 0 ? suspensoes.join(', ') : '(none)'}`
  );

  // ─── Detect format type ───
  const isDetailed =
    textoTotal.includes('EMENTA:') &&
    /APROVADO\(A\)|REPROVADO\(A\)/.test(textoTotal);
  console.log(
    `${LOG_PREFIX} [FORMAT] ${isDetailed ? 'DETAILED (with EMENTA)' : 'SIMPLE'}`
  );

  // ─── Extract disciplines ───
  let disciplinas: DisciplinaExtraida[];

  if (isDetailed) {
    disciplinas = extrairDisciplinasDetalhado(textoTotal, linhas);
  } else {
    disciplinas = extrairDisciplinasDaLinha(textoTotal, linhas);
  }

  const regularCount = disciplinas.length;
  console.log(
    `${LOG_PREFIX} [DISCIPLINAS] Found ${regularCount} regular disciplines`
  );

  // ─── Pending disciplines ───
  const pendentes = extrairDisciplinasPendentes(textoTotal);
  disciplinas.push(...pendentes);
  console.log(
    `${LOG_PREFIX} [PENDENTES] Found ${pendentes.length} pending disciplines`
  );

  // ─── Equivalências ───
  const equivalencias = extrairEquivalencias(textoTotal);
  console.log(
    `${LOG_PREFIX} [EQUIVALENCIAS] Found ${equivalencias.length} equivalencies`
  );

  // ─── Status counts ───
  const countMap: Record<string, number> = {};
  const rePendencias = /\b(APR|CANC|DISP|MATR|REP|REPF|REPMF|TRANC|CUMP)\b/gi;
  let statMatch: RegExpExecArray | null;
  while ((statMatch = rePendencias.exec(textoTotal)) !== null) {
    const key = statMatch[1].toUpperCase();
    countMap[key] = (countMap[key] || 0) + 1;
  }
  if (Object.keys(countMap).length > 0) {
    disciplinas.push({
      tipo_dado: 'Pendencias',
      nome: '',
      status: '',
      mencao: '',
      creditos: 0,
      codigo: '',
      carga_horaria: 0,
      ano_periodo: '',
      prefixo: '',
      professor: '',
      turma: '',
      frequencia: null,
      nota: null,
      valores: countMap,
    });
  }

  // ─── IRA entry ───
  if (ira !== null) {
    disciplinas.push({
      tipo_dado: 'IRA',
      nome: '',
      status: '',
      mencao: '',
      creditos: 0,
      codigo: '',
      carga_horaria: 0,
      ano_periodo: '',
      prefixo: '',
      professor: '',
      turma: '',
      frequencia: null,
      nota: null,
      IRA: 'IRA',
      valor: ira,
      valor_texto: iraTextoHistorico ?? undefined,
    });
  }

  // ─── Semester ───
  const semestreAtual = extrairSemestreAtual(disciplinas);
  const numeroSemestre = calcularNumeroSemestre(disciplinas);

  console.log(
    `${LOG_PREFIX} [SEMESTRE] Current: ${semestreAtual ?? '(not found)'}, Number: ${numeroSemestre}`
  );
  console.log(
    `${LOG_PREFIX} === EXTRACTION COMPLETE: ${disciplinas.length} total items ===`
  );

  return {
    disciplinas,
    equivalencias,
    curso,
    matriz_curricular: matrizCurricular,
    media_ponderada: mediaPonderada,
    ira,
    semestre_atual: semestreAtual,
    numero_semestre: numeroSemestre,
    suspensoes,
  };
}
