/**
 * pdfPositionExtractor.ts — Position-based discipline extraction
 *
 * Instead of converting PDF → flat text → regex, this module keeps the
 * x, y coordinates from PDF.js and uses them to build a structured table.
 *
 * The SIGAA histórico is fundamentally a table with known column positions.
 * Text items sharing the same Y coordinate belong to the same row.
 * Items in specific X ranges belong to specific columns.
 */

const LOG_PREFIX = '[PDF-PositionExtractor]';

// Re-export for consumers
export interface PositionedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
}

// Must match existing DisciplinaExtraida
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
  valor_texto?: string;
  valores?: Record<string, number>;
}

// ─── Column layout ───

interface ColumnBoundaries {
  periodMax: number;   // items with x < this are period
  symbolMin: number;   // prefix symbols
  symbolMax: number;
  codeMin: number;
  codeMax: number;
  contentMin: number;  // name + professor content
  contentMax: number;
  chMin: number;
  chMax: number;
  turmaMin: number;
  turmaMax: number;
  freqMin: number;
  freqMax: number;
  notaMin: number;
  notaMax: number;
  sitMin: number;
}

const DEFAULT_COLUMNS: ColumnBoundaries = {
  periodMax: 75,
  symbolMin: 75,
  symbolMax: 88,
  codeMin: 88,
  codeMax: 128,
  contentMin: 128,
  contentMax: 410,
  chMin: 410,
  chMax: 440,
  turmaMin: 440,
  turmaMax: 470,
  freqMin: 470,
  freqMax: 502,
  notaMin: 502,
  notaMax: 530,
  sitMin: 530,
};

// ─── Classified row ───

interface ClassifiedRow {
  y: number;
  page: number;
  period: string;
  symbol: string;
  code: string;
  content: string;         // all text items in the content column merged
  contentItems: PositionedTextItem[];  // raw items in content column
  ch: string;
  turma: string;
  freq: string;
  nota: string;
  situacao: string;
  rowType: 'data' | 'name-only' | 'header' | 'metadata' | 'continuation' | 'unknown';
}

// ─── Y-proximity grouping ───

const Y_PROXIMITY_THRESHOLD = 3;

function groupItemsIntoRows(items: PositionedTextItem[]): Map<number, PositionedTextItem[]> {
  const rows = new Map<number, PositionedTextItem[]>();
  if (items.length === 0) return rows;

  const sorted = [...items].sort((a, b) => a.y - b.y);
  let currentKey = sorted[0].y;
  let currentGroup: PositionedTextItem[] = [sorted[0]];
  rows.set(currentKey, currentGroup);

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentKey) <= Y_PROXIMITY_THRESHOLD) {
      currentGroup.push(item);
    } else {
      currentKey = item.y;
      currentGroup = [item];
      rows.set(currentKey, currentGroup);
    }
  }

  return rows;
}

// ─── Column detection ───

function detectColumns(allItems: PositionedTextItem[][]): ColumnBoundaries {
  // Look for header row containing "CH", "Turma", "Freq", "Nota", "Situação"
  for (const pageItems of allItems) {
    const rows = groupItemsIntoRows(pageItems);
    for (const [, rowItems] of rows) {
      const texts = rowItems.map(it => it.text);
      const joined = texts.join(' ');
      if (joined.includes('CH') && (joined.includes('Turma') || joined.includes('Situação'))) {
        // Found header row — extract column positions
        const cols = { ...DEFAULT_COLUMNS };
        for (const item of rowItems) {
          const t = item.text;
          if (t === 'CH') {
            cols.chMin = item.x - 5;
            cols.chMax = item.x + item.width + 15;
            cols.contentMax = item.x - 5;
          } else if (t === 'Turma') {
            cols.turmaMin = item.x - 5;
            cols.turmaMax = item.x + item.width + 10;
          } else if (t.startsWith('Freq') || t === 'Freq') {
            cols.freqMin = item.x - 5;
            cols.freqMax = item.x + 25;  // freq + % on next column
          } else if (t === 'Nota') {
            cols.notaMin = item.x - 5;
            cols.notaMax = item.x + item.width + 10;
          } else if (t === 'Situação') {
            cols.sitMin = item.x - 5;
          }
        }
        console.log(`${LOG_PREFIX} Detected column boundaries from header row`);
        return cols;
      }
    }
  }

  console.log(`${LOG_PREFIX} Using default column boundaries`);
  return DEFAULT_COLUMNS;
}

// ─── Row classification ───

const RE_VALID_STATUS = /^(APR|REP|REPF|REPMF|CANC|DISP|TRANC|MATR|CUMP)$/;
const RE_PERIOD = /^(\d{4}\.?\d?|--)$/;
const RE_CODE = /^[A-Z]{2,}\d{3,}$/;
const RE_PROFESSOR_START = /(?:^|\b)(?:Dr\.|Dra\.|MSc\.|Prof\.)\s/i;
// Nome de disciplina do SIGAA nunca tem "(NNh)": qualquer linha com isso é sobra
// da lista de professores da linha de cima, não importa o tamanho (pré-mortem R36).
const RE_PROFESSOR_HOURS = /\(\d+\s*h\)/;

// Rótulos que também abrem nome de disciplina ("TRABALHO DE CONCLUSÃO DE CURSO 1",
// "ATENÇÃO PRIMÁRIA À SAÚDE", "CURRÍCULO", "CAMPUS MULTIMÍDIA"...) são testados SEM
// o flag /i: no SIGAA o rótulo vem em Title Case e o nome da disciplina em CAIXA
// ALTA. Com /i, 39 disciplinas do catálogo sumiam do histórico (pré-mortem R4).
const RE_METADATA_PATTERNS = [
  /^SIGAA\b/i, /^UnB\b/i, /^DEG\b/i, /^SAA\b/i, /^Campus\b/,
  /^Credenciada\b/i, /^na seção/i, /^Histórico Escolar/i, /^Dados/i,
  /^Nome:/i, /^Data de/i, /^Nacionalidade/i, /^Nº do/i, /^Curso:/i,
  /^Status:/i, /^Índices/i, /^Ênfase/i, /^IRA:/i, /^Currículo/, /^MP:/i,
  /^Reconhecimento/i, /^Ano\s*\/?\s*Período/i, /^Forma de/i,
  /^Período Letivo/i, /^Suspens[õo]es/i, /^Prorrogações/i,
  /^Tipo Saída/i, /^Data da/i, /^Trabalho de/, /^Para verificar/i,
  /^Página/i, /^e o código/i, /^Componentes Curriculares/i,
  /^Código\s+Componente/i, /^Observações/i, /^Atenção/, /^Menções/i,
  /^Equivalências/i, /^Matrícula/i, /^Perfil/i, /^Prazo/i,
  /^Legenda/i, /^SIGLA/i, /^Carga Horária/i, /^Obrigatórias/i, /^Optativos/i,
  /^Complementares/i, /^Total/i, /^Exigido/i, /^Integralizado/i,
  /^Pendente/i, /^Nenhum/i, /^Descrição/, /^INGRESSANTE/i,
  /^Letivo\s+Componente/i, /^\d+\s*períodos?\s*letivos?/i,
  /^Sistema Integrado/i, /^Universidade/, /^Decanato/i, /^Secretaria/i,
  /^Centro de Vivência/i, /^Asa Norte/i, /^CEP\b/i, /^Leonardo\b/i,
  /^Portaria/i, /^ENEM/i,
];

function isMetadataText(text: string): boolean {
  for (const re of RE_METADATA_PATTERNS) {
    if (re.test(text.trim())) return true;
  }
  return false;
}

function classifyRow(
  y: number,
  page: number,
  items: PositionedTextItem[],
  cols: ColumnBoundaries
): ClassifiedRow {
  // Sort left to right
  const sorted = [...items].sort((a, b) => a.x - b.x);

  let period = '';
  let symbol = '';
  let code = '';
  const contentParts: string[] = [];
  const contentItems: PositionedTextItem[] = [];
  let ch = '';
  let turma = '';
  let freq = '';
  let nota = '';
  let situacao = '';

  for (const item of sorted) {
    const x = item.x;
    const t = item.text;

    if (x < cols.periodMax) {
      // Period column — but filter out page numbers, etc.
      if (RE_PERIOD.test(t) || /^\d{4}$/.test(t)) {
        period = period ? period + t : t;
      } else {
        // Might be a period continuation or something else
        if (/^\.\d$/.test(t)) {
          period = period + t;
        }
      }
    } else if (x >= cols.symbolMin && x < cols.symbolMax) {
      // Symbol column
      if (/^[*&#e@§%#]$/.test(t)) {
        symbol = t;
      } else if (RE_CODE.test(t)) {
        code = t;
      }
    } else if (x >= cols.codeMin && x < cols.codeMax) {
      // Code column
      if (RE_CODE.test(t)) {
        code = t;
      } else {
        // Sometimes code isn't perfectly aligned
        contentParts.push(t);
        contentItems.push(item);
      }
    } else if (x >= cols.contentMin && x < cols.contentMax) {
      contentParts.push(t);
      contentItems.push(item);
    } else if (x >= cols.chMin && x < cols.chMax) {
      ch = t;
    } else if (x >= cols.turmaMin && x < cols.turmaMax) {
      // Turma — could also be freq/nota depending on exact alignment
      if (!turma) turma = t;
      else turma += t;
    } else if (x >= cols.freqMin && x < cols.freqMax) {
      if (!freq) freq = t;
      else freq += t;
    } else if (x >= cols.notaMin && x < cols.notaMax) {
      if (!nota) nota = t;
      else nota += t;
    } else if (x >= cols.sitMin) {
      if (!situacao) situacao = t;
      else situacao += t;
    }
  }

  const content = contentParts.join(' ');

  // Determine row type
  let rowType: ClassifiedRow['rowType'] = 'unknown';

  // Check for header
  if (content.includes('Componente') && (content.includes('Curricular') || content.includes('CH'))) {
    rowType = 'header';
  }
  // Check header continuation
  else if (content === 'Letivo' || /^Ano\/?Período$/i.test(content)) {
    rowType = 'header';
  }
  // Check for discipline data row (has period + code + data columns).
  // Vem ANTES do teste de metadata: uma linha com período/código e situação
  // válida é disciplina mesmo que o nome comece com palavra de rótulo.
  else if ((period || code) && RE_VALID_STATUS.test(situacao)) {
    rowType = 'data';
  }
  else if ((period || code) && ch && !situacao) {
    // Might be data with merged situacao into nota
    rowType = 'data';
  }
  // Check if metadata
  else if (isMetadataText(content) || isMetadataText(period + ' ' + content)) {
    rowType = 'metadata';
  }
  // Name-only row: only content column items, no data columns
  else if (content && !period && !code && !ch && !turma && !situacao) {
    // Is this a continuation (professor leftover like "(30h)") or a discipline name?
    if (RE_PROFESSOR_HOURS.test(content)) {
      rowType = 'continuation';
    } else if (RE_PROFESSOR_START.test(content)) {
      rowType = 'continuation';
    } else if (content.length > 2 && /^[A-ZÀ-ÿ(]/.test(content)) {
      rowType = 'name-only';
    } else {
      rowType = 'unknown';
    }
  }

  return { y, page, period, symbol, code, content, contentItems, ch, turma, freq, nota, situacao, rowType };
}

// ─── Name and professor extraction from content ───

function splitContentIntoProfessorAndName(content: string): { name: string; professor: string } {
  if (!content) return { name: '', professor: '' };

  // Check if content starts with professor pattern
  if (RE_PROFESSOR_START.test(content)) {
    return { name: '', professor: content };
  }

  // Check if content has professor embedded after some name text
  // e.g. "SOME NAME Dr. SOMEONE (60h)"
  const profIdx = content.search(/(?:Dr\.|Dra\.|MSc\.|Prof\.)\s/i);
  if (profIdx > 0) {
    return {
      name: content.substring(0, profIdx).trim(),
      professor: content.substring(profIdx).trim(),
    };
  }

  // It's all name
  return { name: content, professor: '' };
}

// ─── Professor name cleanup ───

function cleanProfessorName(raw: string): string {
  if (!raw) return '';

  let cleaned = raw;

  // Handle multi-professor: "Dr. NAME1 (30h), Dr. NAME2 (30h)"
  // Split by comma, clean each, rejoin
  const parts = cleaned.split(/,\s*/);
  const names: string[] = [];

  for (let part of parts) {
    part = part.trim();
    if (!part) continue;

    // Strip title prefix
    part = part.replace(/^(?:Dr\.|Dra\.|MSc\.|Prof\.|PhD\.?|Me\.|Ma\.)\s*/gi, '');

    // Strip (Xh) patterns
    part = part.replace(/\s*\(\d+h\)/g, '');

    // Strip trailing non-alpha (leftover parens, etc.)
    part = part.replace(/[^a-zA-ZÀ-ÿ\s]+$/, '');
    part = part.replace(/^\s*[^a-zA-ZÀ-ÿ]+/, '');
    part = part.replace(/\s{2,}/g, ' ').trim();

    if (part.length > 1) {
      names.push(part);
    }
  }

  return names.join(', ');
}

// ─── Discipline name cleanup ───

function cleanDisciplineName(raw: string): string {
  let cleaned = raw;

  // Remove period prefix if accidentally included
  cleaned = cleaned.replace(/^\d{4}\.\d\s*/, '');
  cleaned = cleaned.replace(/^--\s*/, '');

  // Remove leading non-alpha
  cleaned = cleaned.replace(/^[^a-zA-ZÀ-ÿ0-9]+/, '');
  // Remove trailing non-alpha
  cleaned = cleaned.replace(/[^a-zA-ZÀ-ÿ0-9]+$/, '');

  // Fix missing spaces from PDF.js concatenation
  cleaned = cleaned.replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2');
  cleaned = cleaned.replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2');
  cleaned = cleaned.replace(/(\d)([A-Za-zÀ-ÿ])/g, '$1 $2');

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  return cleaned.trim();
}

// ─── Main extraction ───

export function extractDisciplinasFromPositions(
  pages: PositionedTextItem[][]
): DisciplinaExtraida[] {
  console.log(`${LOG_PREFIX} Starting position-based extraction from ${pages.length} page(s)`);

  const cols = detectColumns(pages);

  // Build classified rows from all pages
  const allRows: ClassifiedRow[] = [];

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageItems = pages[pageIdx];
    const rowGroups = groupItemsIntoRows(pageItems);

    for (const [y, items] of rowGroups) {
      const row = classifyRow(y, pageIdx + 1, items, cols);
      allRows.push(row);
    }
  }

  // Sort: page ascending, Y descending (top-to-bottom in PDF)
  allRows.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return b.y - a.y;
  });

  console.log(`${LOG_PREFIX} Classified ${allRows.length} rows: ${allRows.filter(r => r.rowType === 'data').length} data, ${allRows.filter(r => r.rowType === 'name-only').length} name-only, ${allRows.filter(r => r.rowType === 'continuation').length} continuation`);

  // Walk rows and build disciplines
  const disciplinas: DisciplinaExtraida[] = [];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];

    if (row.rowType !== 'data') continue;

    // ─── This is a discipline data row ───

    // Extract period
    let anoPeriodo = row.period === '--' ? '' : row.period;
    if (anoPeriodo && !/^\d{4}\.\d$/.test(anoPeriodo)) {
      // Try to fix partial period like "2022" → might be missing ".X"
      if (/^\d{4}\.$/.test(anoPeriodo)) {
        anoPeriodo = anoPeriodo + '0';
      }
    }

    const prefixo = row.symbol || '';
    const codigo = row.code;

    // Parse data columns
    const chStr = row.ch.replace(/[^0-9]/g, '');
    const cargaH = parseInt(chStr) || 0;
    const turma = row.turma.replace(/^-+$/, '--');
    const freqRaw = row.freq.replace(/\s/g, '');
    const notaRaw = row.nota.replace(/\s/g, '');
    const situacao = row.situacao.replace(/\s/g, '');

    // Validate status
    if (!RE_VALID_STATUS.test(situacao)) {
      continue; // not a real discipline row
    }

    // Freq and menção
    const frequencia = (freqRaw === '--' || freqRaw === '-' || freqRaw === '---' || !freqRaw) ? null : freqRaw;
    const mencao = (notaRaw === '---' || notaRaw === '-' || notaRaw === '--' || !notaRaw) ? '-' : notaRaw;

    // Parse content column: split into professor + inline name
    const contentSplit = splitContentIntoProfessorAndName(row.content);
    let professor = contentSplit.professor;
    let nome = contentSplit.name;

    // Look at previous rows for the discipline name
    // (the name appears on the line above the data row)
    if (i > 0) {
      // Gather preceding name-only rows that haven't been consumed
      const nameRows: string[] = [];
      let j = i - 1;
      while (j >= 0 && (allRows[j].rowType === 'name-only' || allRows[j].rowType === 'continuation')) {
        if (allRows[j].rowType === 'name-only') {
          nameRows.unshift(allRows[j].content);
        }
        j--;
      }

      if (nameRows.length > 0) {
        // Use the closest name-only rows as the discipline name
        const prevName = nameRows.join(' ');
        if (!nome) {
          nome = prevName;
        } else {
          // If we already have a name from content, the prev row's name is the real one
          // and the content's "name" part might be misclassified professor text
          // Check: does the content start with uppercase words that match a discipline name?
          // If prevName looks like a real discipline name, use it instead
          if (/^[A-ZÀ-ÿ\s]+$/.test(prevName) && prevName.length > 5) {
            nome = prevName;
          }
        }
        // Mark these name-only rows as consumed
        for (let k = i - 1; k >= 0 && (allRows[k].rowType === 'name-only' || allRows[k].rowType === 'continuation'); k--) {
          allRows[k].rowType = 'unknown'; // mark consumed
        }
      }
    }

    // Look at following rows for professor continuation (e.g., "(30h)" on next line)
    for (let j = i + 1; j < allRows.length; j++) {
      if (allRows[j].rowType === 'continuation') {
        professor = professor ? professor + ' ' + allRows[j].content : allRows[j].content;
        allRows[j].rowType = 'unknown'; // consumed
      } else {
        break;
      }
    }

    // Clean up
    nome = cleanDisciplineName(nome);
    professor = cleanProfessorName(professor);

    disciplinas.push({
      tipo_dado: 'Disciplina Regular',
      nome,
      status: situacao,
      mencao,
      creditos: cargaH > 0 ? Math.floor(cargaH / 15) : 0,
      codigo,
      carga_horaria: cargaH,
      ano_periodo: anoPeriodo,
      prefixo,
      professor,
      turma,
      frequencia,
      nota: null,
    });
  }

  console.log(`${LOG_PREFIX} Extracted ${disciplinas.length} disciplines via position-based parsing`);
  return disciplinas;
}
