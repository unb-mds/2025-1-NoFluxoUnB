/**
 * Motor 2 — Servico de geracao da cadeia de formatura personalizada.
 *
 * Funcoes puras (sem IO/DB) que recebem as materias faltantes e devolvem
 * um plano semestre a semestre. O controller eh responsavel por buscar
 * as materias faltantes no banco e chamar `gerarPlano`.
 *
 * Spec: docs/motor2.md
 */

import {
    parseExpressaoLogicaFromDb,
    satisfazExpressaoLogica,
    getCodigosFromExpressaoLogica,
    getSubstitutosFromExpressaoLogica,
    type ExpressaoLogicaRecursiva,
} from "../utils/expressao_logica";
import type {
    MateriaInput,
    MateriaPlano,
    PlanoFormatura,
    PlanoInput,
    PreferenciasPlano,
    SemestrePlano,
    PlanoFormaturav2,
    OptativaSlot,
    ComplementarSlot,
    CargaIntegralizada,
} from "../types/planejamento";

// =============================================================
// Constantes do scoring
// =============================================================

const SCORE_OBRIGATORIA = 3;
const SCORE_PESO_DIRETO = 2;
const SCORE_PESO_INDIRETO = 1;
const SCORE_ATRASADA = 2;

// Top 30% dos scores -> critica (alem do criterio de atrasada).
const PERC_CRITICA = 0.3;

// =============================================================
// Projeção Temporal — Semestres e Datas
// =============================================================

/**
 * Calcula o semestre atual com base na data do sistema ("2026.1" ou "2026.2").
 *
 * Espelha exatamente a RPC `periodo_letivo_atual` do banco (jan–jun = .1,
 * jul–dez = .2), por isso serve de fallback pra ela em resolverPeriodoAtivo.
 */
export function calcularSemestreAtualStr(): string {
    const now = new Date();
    const mes = now.getMonth() + 1; // 1-12
    return `${now.getFullYear()}.${mes <= 6 ? 1 : 2}`;
}

/**
 * Avança N semestres a partir de uma string base.
 * Ex: avancarSemestres("2026.1", 1) → "2026.2"
 *     avancarSemestres("2026.2", 1) → "2027.1"
 */
function avancarSemestres(base: string, n: number): string {
    const parts = base.split('.');
    let ano = Number(parts[0]);
    let per = Number(parts[1]);
    for (let i = 0; i < n; i++) {
        if (per === 1) { per = 2; } else { per = 1; ano += 1; }
    }
    return `${ano}.${per}`;
}

// Guard-rail contra loops infinitos no greedy.
const MAX_SEMESTRES = 40;

// =============================================================
// Util interno
// =============================================================

function norm(codigo: string): string {
    return (codigo || "").trim().toUpperCase();
}

function parseExprOrNull(raw: unknown): ExpressaoLogicaRecursiva | null {
    if (raw == null) return null;
    if (typeof raw === "object" && raw !== null && "condicoes" in (raw as object)) {
        return raw as ExpressaoLogicaRecursiva;
    }
    return parseExpressaoLogicaFromDb(raw);
}

function isAtrasada(mat: MateriaInput, semestreAtual: number): boolean {
    return mat.nivel > 0 && mat.nivel < semestreAtual;
}

/**
 * Converte Créditos em Carga Horária (1 crédito = 15h)
 */
function creditosParaHoras(creditos: number): number {
    return (creditos || 0) * 15;
}

function getHorasSafely(materia: Partial<MateriaInput> & { creditos?: number; carga_horaria?: number }): number {
    if (materia.carga_horaria != null) return materia.carga_horaria;
    return creditosParaHoras(materia.creditos ?? 4);
}

/**
 * Retorna os créditos de uma matéria. Faz fallback usando carga_horaria se necessário.
 */
function getCreditosSafely(materia: Partial<MateriaInput> & { creditos?: number; carga_horaria?: number }): number {
    if (materia.creditos) return materia.creditos;
    if (materia.carga_horaria) return Math.ceil(materia.carga_horaria / 15);
    return 4; // Valor padrão genérico UnB
}

// =============================================================
// 1) Grafo reverso de dependencias
// =============================================================

export function buildReverseDependencyGraph(
    materias: MateriaInput[]
): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    for (const m of materias) {
        graph.set(norm(m.codigo), new Set());
    }

    for (const m of materias) {
        const expr = parseExprOrNull(m.preRequisitos);
        if (!expr) continue;
        const codigosPreReq = getCodigosFromExpressaoLogica(expr).map(norm);
        for (const pr of codigosPreReq) {
            if (!graph.has(pr)) graph.set(pr, new Set());
            graph.get(pr)!.add(norm(m.codigo));
        }
    }

    return graph;
}

// =============================================================
// 2) Dependentes transitivos
// =============================================================

export function computeTransitiveDependents(
    codigo: string,
    graph: Map<string, Set<string>>
): number {
    const visitados = new Set<string>();
    const fila: string[] = [];
    const start = norm(codigo);

    const diretos = graph.get(start) ?? new Set<string>();
    for (const d of diretos) fila.push(d);

    while (fila.length > 0) {
        const cur = fila.shift()!;
        if (visitados.has(cur)) continue;
        visitados.add(cur);
        const filhos = graph.get(cur) ?? new Set<string>();
        for (const f of filhos) {
            if (!visitados.has(f) && f !== start) fila.push(f);
        }
    }

    return visitados.size;
}

// =============================================================
// 3) Score
// =============================================================

export function calcularScore(
    materia: MateriaInput,
    desbloqueiaDireto: number,
    desbloqueiaIndireto: number,
    semestreAtual: number,
    codigosComOferta?: Set<string>
): number {
    let score = 0;
    if (materia.obrigatoria) score += SCORE_OBRIGATORIA;
    score += SCORE_PESO_DIRETO * desbloqueiaDireto;
    score += SCORE_PESO_INDIRETO * desbloqueiaIndireto;
    if (isAtrasada(materia, semestreAtual)) score += SCORE_ATRASADA;

    // Bônus/Penalidade para optativas com base em oferta real
    const isOptativa = materia.tipo_natureza === 1;
    if (isOptativa && codigosComOferta) {
        const temOferta = codigosComOferta.has(norm(materia.codigo));
        if (temOferta) {
            // Bônus alto para optativas com oferta confirmada
            score += 5;
        } else {
            // Penalidade para optativas sem oferta (reduz drasticamente a prioridade)
            score = Math.max(0, score - 10);
        }
    }

    return score;
}

// =============================================================
// 4) isDesbloqueada
// =============================================================

/**
 * Expande o conjunto de materias cumpridas com as satisfeitas por EQUIVALENCIA.
 *
 * Regra (docs/unb-domain.md: "CUMP = cumprido por equivalencia — conta, desbloqueia
 * pre-requisitos"): se o que o aluno cursou satisfaz a expressao de equivalencia de Y,
 * entao Y conta como cumprida. Vale para os dois usos: nao recomendar Y de novo e
 * liberar quem depende de Y como pre-requisito.
 *
 * Uma materia pode ter varias linhas de equivalencia (curriculos/vigencias diferentes)
 * e basta UMA ser satisfeita — mesma leitura do checkEquivalencies em
 * fluxograma_controller.ts, que resolve isso na montagem do fluxograma mas so para
 * obrigatorias; aqui vale para qualquer materia da matriz.
 *
 * PASSE UNICO, de proposito: so o que o aluno cursou DE VERDADE satisfaz uma
 * equivalencia — uma materia marcada por equivalencia nao realimenta a expansao. Ou
 * seja, A=B e B=C NAO implica A=C. Equivalencia na UnB e tabela explicita, nao relacao
 * transitiva: a secretaria nao aceita a cadeia so porque os dois pares existem. Essa e
 * tambem a semantica do checkEquivalencies (fluxograma_controller.ts), que compara
 * sempre contra as disciplinas realmente integralizadas.
 *
 * Medido em 60 alunos reais: realimentar a cadeia inflaria o resultado em 30%
 * (406 -> 583 materias), mexendo em 24 dos 60 — inferencia que nao se sustenta.
 *
 * Nao muta o Set recebido.
 */
export function expandirCumpridasComEquivalencias(
    materias: MateriaInput[],
    cumpridas: Set<string>
): Set<string> {
    const base = new Set<string>();
    for (const c of cumpridas) base.add(norm(c));

    const expandido = new Set<string>(base);
    for (const m of materias) {
        const cod = norm(m.codigo);
        if (!cod || expandido.has(cod)) continue;

        const exprs = Array.isArray(m.equivalencias) ? m.equivalencias : [];
        for (const raw of exprs) {
            const expr = parseExprOrNull(raw);
            if (!expr) continue;
            // Compara contra `base` (cursado de verdade), nunca contra `expandido`.
            if (satisfazExpressaoLogica(expr, base)) {
                expandido.add(cod);
                break;
            }
        }
    }

    return expandido;
}

// =============================================================
// 4b) Oferta por equivalencia (codigo antigo na matriz, turma no codigo novo)
// =============================================================

/**
 * Mapeia cada materia da matriz para os codigos que podem SUBSTITUI-LA na busca por
 * oferta em `turmas`.
 *
 * Quando uma materia muda de codigo, a matriz continua com o antigo mas a turma e
 * publicada sob o novo. Caso real (matriz 693, Eng. de Software): CIC0151 nao tem
 * turma, mas suas equivalentes CIC0197 / FGA0158 tem.
 *
 * Direcao DIRETA apenas: so as linhas de `equivalencias` cuja origem e a propria
 * materia. A leitura inversa ("outra materia declara esta como equivalente, logo
 * cursar aquela vale por esta") e inferencia, nao fato registrado — medido em
 * producao, so 46% dos pares 1:1 tem o inverso cadastrado.
 *
 * Usa getSubstitutosFromExpressaoLogica, entao ramos "E" nao geram substituto: os
 * codigos ali so valem cursados juntos, e uma turma isolada nao cobre a materia.
 *
 * Spec: docs/superpowers/specs/2026-08-03-equivalencias-oferta-turmas-design.md
 */
export function construirSubstitutosPorCodigo(
    materias: MateriaInput[]
): Map<string, string[]> {
    const mapa = new Map<string, string[]>();

    for (const m of materias) {
        const cod = norm(m.codigo);
        if (!cod) continue;

        const exprs = Array.isArray(m.equivalencias) ? m.equivalencias : [];
        const substitutos = new Set<string>(mapa.get(cod) ?? []);
        for (const raw of exprs) {
            const expr = parseExprOrNull(raw);
            if (!expr) continue;
            for (const s of getSubstitutosFromExpressaoLogica(expr)) {
                // Uma materia nao substitui a si mesma.
                if (s !== cod) substitutos.add(s);
            }
        }

        if (substitutos.size > 0) mapa.set(cod, [...substitutos]);
    }

    return mapa;
}

/**
 * Expande o conjunto de codigos com oferta real: uma materia da matriz tambem conta
 * como ofertada quando algum codigo que a substitui tem turma no periodo.
 *
 * PASSE UNICO, igual a expandirCumpridasComEquivalencias (commit 7e7075f4): compara
 * sempre contra a oferta REAL, nunca contra o conjunto ja expandido. A <= B e B <= C
 * nao implica A <= C — equivalencia na UnB e tabela explicita, nao relacao transitiva.
 *
 * Nao muta o Set recebido.
 */
export function expandirOfertaComEquivalencias(
    substitutosPorCodigo: Map<string, string[]>,
    codigosComOfertaPropria: Set<string>
): Set<string> {
    const base = new Set<string>();
    for (const c of codigosComOfertaPropria) base.add(norm(c));

    const expandido = new Set<string>(base);
    for (const [codigoRaw, substitutos] of substitutosPorCodigo) {
        const cod = norm(codigoRaw);
        if (!cod || expandido.has(cod)) continue;
        // Compara contra `base` (oferta real), nunca contra `expandido`.
        if (substitutos.some((s) => base.has(norm(s)))) expandido.add(cod);
    }

    return expandido;
}

export function isDesbloqueada(
    materia: MateriaInput,
    completedCodes: Set<string>
): boolean {
    const expr = parseExprOrNull(materia.preRequisitos);
    if (!expr) return true;
    const normCompleted = new Set<string>();
    for (const c of completedCodes) normCompleted.add(norm(c));
    return satisfazExpressaoLogica(expr, normCompleted);
}

// =============================================================
// 5) Distribuicao gulosa por semestres
// =============================================================

interface MateriaComScore {
    materia: MateriaInput;
    score: number;
    desbloqueiaDireto: number;
    desbloqueiaIndireto: number;
}

function precomputarScores(
    materias: MateriaInput[],
    semestreAtual: number,
    codigosComOferta?: Set<string>
): Map<string, MateriaComScore> {
    const graph = buildReverseDependencyGraph(materias);
    const out = new Map<string, MateriaComScore>();
    for (const m of materias) {
        const cod = norm(m.codigo);
        const diretos = (graph.get(cod) ?? new Set()).size;
        const indiretos = Math.max(0, computeTransitiveDependents(cod, graph) - diretos);
        const score = calcularScore(m, diretos, indiretos, semestreAtual, codigosComOferta);
        out.set(cod, {
            materia: m,
            score,
            desbloqueiaDireto: diretos,
            desbloqueiaIndireto: indiretos,
        });
    }
    return out;
}

export function distribuirPorSemestres(
    materias: MateriaInput[],
    completedCodes: Set<string>,
    preferencias: PreferenciasPlano,
    numeroPeriodo: number,
    codigosComOferta?: Set<string>,
    chOptativaFaltante?: number,
    semestreBaseStr?: string,  // ex: "2026.1" — usado para preencher labelSemestre de cada coluna
    // Quantos semestres calendario a frente de semestreBaseStr o plano deve comecar.
    // 1 quando o aluno ja esta com MATR no semestre corrente (semestre corrente ja "gasto"),
    // 0 quando o semestre corrente ainda esta livre (sem matriculas publicadas ainda) —
    // nesse caso o plano deve preencher o proprio semestre corrente, nao pular pro seguinte.
    offsetSemestre: number = 1
): SemestrePlano[] {
    if (materias.length === 0) return [];

    const scores = precomputarScores(materias, numeroPeriodo, codigosComOferta);
    const restantes = new Set<string>(materias.map((m) => norm(m.codigo)));
    const cumulados = new Set<string>();
    for (const c of completedCodes) cumulados.add(norm(c));

    // Restrições: codigos normalizados (trim + uppercase)
    const adiarSet = new Set((preferencias.restricoes?.adiar ?? []).map(norm));
    const priorizarSet = new Set((preferencias.restricoes?.priorizar ?? []).map(norm));

    const semestres: SemestrePlano[] = [];
    let indiceSemestre = 0;

    // Se há optativas faltantes, reservar espaço proporcional por semestre
    // Isso garante que haja espaço livre em distribuirSlots
    const horasReservadaParaOptativa = chOptativaFaltante && chOptativaFaltante > 0
        ? Math.min(60, Math.ceil(chOptativaFaltante / 5))  // Reservar ~1/5 do faltante por semestre, máx 60h
        : 0;

    while (restantes.size > 0 && indiceSemestre < MAX_SEMESTRES) {
        // Verificar se há limite personalizado para este semestre
        const customLimit = preferencias.restricoes?.limitesPersonalizados?.[indiceSemestre];
        const creditosBase = customLimit !== undefined ? customLimit : preferencias.limiteCreditos;

        const limiteHorasPorSemestre = creditosBase * 15;
        const limiteEfetivoSemestre = Math.max(120, limiteHorasPorSemestre - horasReservadaParaOptativa);

        const candidatas: MateriaComScore[] = [];
        let adiadasNesteSemestre = 0;
        for (const cod of restantes) {
            const info = scores.get(cod)!;
            if (isDesbloqueada(info.materia, cumulados)) {
                if (adiarSet.has(cod)) {
                    adiarSet.delete(cod);
                    adiadasNesteSemestre++;
                    continue;
                }
                candidatas.push(info);
            }
        }

        if (candidatas.length === 0) {
            // Se só não há candidatas porque matérias foram adiadas neste semestre,
            // criar semestre vazio e seguir — as adiadas voltam no próximo índice.
            if (adiadasNesteSemestre > 0) {
                semestres.push({
                    indice: indiceSemestre,
                    tipo: indiceSemestre === 0 ? "recomendado" : "estimado",
                    semestre: semestreBaseStr ? avancarSemestres(semestreBaseStr, indiceSemestre + offsetSemestre) : undefined,
                    creditos: 0,
                    _horasInternas: 0,
                    materias: [],
                });
                indiceSemestre++;
                continue;
            }
            break;
        }

        candidatas.sort((a, b) => {
            // Restrição: priorizar força pro topo (antes de score)
            const aPri = priorizarSet.has(norm(a.materia.codigo)) ? 1 : 0;
            const bPri = priorizarSet.has(norm(b.materia.codigo)) ? 1 : 0;
            if (aPri !== bPri) return bPri - aPri;
            if (b.score !== a.score) return b.score - a.score;
            if (a.materia.nivel !== b.materia.nivel) return a.materia.nivel - b.materia.nivel;
            return a.materia.codigo.localeCompare(b.materia.codigo);
        });

        const escolhidas: MateriaComScore[] = [];
        let horasUsadas = 0;
        let dificuldadeUsada = 0;
        const LIMITE_DIFICULDADE = 35; // Teto de dificuldade por semestre

        // Usar limiteEfetivo para reservar espaço para optativas, ou usar limite normal
        const limiteHoras = horasReservadaParaOptativa > 0
            ? Math.min(limiteEfetivoSemestre, 480)
            : Math.min(limiteHorasPorSemestre, 480);

        // B4: Mapa para lookup rápido de matérias por código
        const materiasPorCodigo = new Map<string, MateriaInput>();
        for (const m of materias) {
            materiasPorCodigo.set(norm(m.codigo), m);
        }

        for (const c of candidatas) {
            // Skip if already chosen in this semester
            if (!restantes.has(norm(c.materia.codigo))) continue;

            const horas = getHorasSafely(c.materia);

            // B4: Verificar co-requisitos
            const coReqExpr = parseExprOrNull(c.materia.coRequisitos);
            let coReqCodigos: string[] = [];
            if (coReqExpr) {
                coReqCodigos = getCodigosFromExpressaoLogica(coReqExpr).map(norm);
            }

            // B4: Calcular horas e dificuldade totais necessárias (candidata + todos os co-requisitos)
            let horasNeeded = horas;
            let diffNeeded = c.materia.dificuldadeEstimada || 4;
            const coReqsDisponiveis: { codigo: string; materia: MateriaInput; horas: number, diff: number }[] = [];

            for (const coReqCod of coReqCodigos) {
                if (restantes.has(coReqCod)) {
                    const coReqMateria = materiasPorCodigo.get(coReqCod);
                    if (coReqMateria) {
                        const horasCoReq = getHorasSafely(coReqMateria);
                        const diffCoReq = coReqMateria.dificuldadeEstimada || 4;
                        coReqsDisponiveis.push({ codigo: coReqCod, materia: coReqMateria, horas: horasCoReq, diff: diffCoReq });
                        horasNeeded += horasCoReq;
                        diffNeeded += diffCoReq;
                    }
                }
            }

            const isPriorizada = priorizarSet.has(norm(c.materia.codigo));
            const budgetDificuldadePermite = isPriorizada || (dificuldadeUsada + diffNeeded <= LIMITE_DIFICULDADE) || escolhidas.length === 0;

            // B4: Tentar alocar candidata + todos os co-requisitos juntos
            if (horasUsadas + horasNeeded <= limiteHoras && budgetDificuldadePermite) {
                // Adicionar candidata
                escolhidas.push(c);
                horasUsadas += horas;
                dificuldadeUsada += (c.materia.dificuldadeEstimada || 4);

                // Adicionar todos os co-requisitos
                for (const coReq of coReqsDisponiveis) {
                    const coReqScore = scores.get(coReq.codigo);
                    if (coReqScore) {
                        escolhidas.push(coReqScore);
                        horasUsadas += coReq.horas;
                        dificuldadeUsada += coReq.diff;
                    }
                }
            }
            // FALLBACK: Tentar alocar candidata SOLO se co-requisitos não cabem
            else if (horasUsadas + horas <= limiteHoras && (isPriorizada || dificuldadeUsada + (c.materia.dificuldadeEstimada || 4) <= LIMITE_DIFICULDADE || escolhidas.length === 0)) {
                escolhidas.push(c);
                horasUsadas += horas;
                dificuldadeUsada += (c.materia.dificuldadeEstimada || 4);
                // Co-requisitos ficarão em restantes para próximo semestre
            }
        }

        if (escolhidas.length === 0) {
            const menor = [...candidatas].sort((a, b) => getHorasSafely(a.materia) - getHorasSafely(b.materia))[0];
            escolhidas.push(menor);
            horasUsadas = getHorasSafely(menor.materia);
        }

        // Calcular threshold de crítica: top 30% do score máximo
        const maxScore = Math.max(...escolhidas.map((e) => e.score), 0);
        const scoreThreshold = maxScore * 0.7; // Top 30% = score >= 70% do máximo

        const materiasPlano: MateriaPlano[] = escolhidas.map((e) => {
            // Matéria é crítica se:
            // 1. Score >= threshold (top 30%), OU
            // 2. Está atrasada (nivel < semestre_atual)
            const isCritica = e.score >= scoreThreshold || (e.materia.nivel > 0 && e.materia.nivel < numeroPeriodo);

            return {
                codigo: norm(e.materia.codigo),
                nome: e.materia.nome,
                creditos: getCreditosSafely(e.materia),
                critica: isCritica,
                desbloqueiaDireto: e.desbloqueiaDireto,
                desbloqueiaIndireto: e.desbloqueiaIndireto,
                score: e.score,
                motivo: isCritica
                    ? (e.materia.nivel < numeroPeriodo ? "pendente há tempo, alta prioridade" : "alta prioridade")
                    : (!e.materia.obrigatoria ? "optativa escolhida por você" : ""),
                dificuldadeEstimada: e.materia.dificuldadeEstimada,
                motivoDificuldade: e.materia.motivoDificuldade,
                optativa: e.materia.obrigatoria ? undefined : true
            };
        });

        semestres.push({
            indice: indiceSemestre,
            tipo: indiceSemestre === 0 ? "recomendado" : "estimado",
            // +1 porque o primeiro semestre do plano é o PRÓXIMO (não o atual)
            semestre: semestreBaseStr ? avancarSemestres(semestreBaseStr, indiceSemestre + offsetSemestre) : undefined,
            creditos: Math.ceil(horasUsadas / 15),
            _horasInternas: horasUsadas,  // NOVO: guardar valor exato em horas para evitar perda de precisão
            materias: materiasPlano,
        });

        for (const e of escolhidas) {
            const cod = norm(e.materia.codigo);
            restantes.delete(cod);
            cumulados.add(cod);
        }

        indiceSemestre++;
    }

    return semestres;
}

// =============================================================
// 6) Marcacao de criticas + motivos textuais
// =============================================================

function calcularThresholdCritica(scoresOrdenados: number[]): number {
    if (scoresOrdenados.length === 0) return Number.POSITIVE_INFINITY;
    const sorted = [...scoresOrdenados].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * (1 - PERC_CRITICA));
    const clamped = Math.min(sorted.length - 1, Math.max(0, idx));
    return sorted[clamped];
}

function montarMotivo(m: MateriaPlano, atrasada: boolean): string {
    const partes: string[] = [];
    if (m.desbloqueiaDireto > 0) {
        const total = m.desbloqueiaDireto + m.desbloqueiaIndireto;
        partes.push(`desbloqueia ${total} materia${total !== 1 ? "s" : ""}`);
    }
    if (atrasada) partes.push("esta atrasada");
    if (partes.length === 0) partes.push("alocada para manter ritmo de formatura");
    return partes.join(" e ");
}

// =============================================================
// 7) gerarPlano (orquestracao Motor 1 Legado)
// =============================================================

export function gerarPlano(input: PlanoInput): PlanoFormatura {
    const materias = input.materiasFaltantes ?? [];
    const completedSet = new Set<string>(input.completedCodes.map(norm));

    const semestres = distribuirPorSemestres(
        materias,
        completedSet,
        input.preferencias,
        input.numeroPeriodo
    );

    if (semestres.length > 0) {
        const todosScores: number[] = [];
        for (const s of semestres) for (const m of s.materias) if ('score' in m) todosScores.push((m as any).score);
        const threshold = calcularThresholdCritica(todosScores);

        const nivelByCodigo = new Map<string, number>();
        for (const m of materias) nivelByCodigo.set(norm(m.codigo), m.nivel);

        for (const s of semestres) {
            for (const m of s.materias as MateriaPlano[]) {
                if (!m.codigo) continue;
                const nivel = nivelByCodigo.get(m.codigo) ?? 0;
                const atrasada = nivel > 0 && nivel < input.numeroPeriodo;
                m.critica = atrasada || m.score >= threshold;
                m.motivo = montarMotivo(m, atrasada);
            }
        }
    }

    const alocadas = new Set<string>();
    for (const s of semestres) for (const m of s.materias) if ('codigo' in m) alocadas.add((m as any).codigo);
    
    const naoAlocadas: string[] = [];
    for (const m of materias) {
        const cod = norm(m.codigo);
        if (!alocadas.has(cod)) naoAlocadas.push(cod);
    }
    naoAlocadas.sort();

    return {
        semestresRestantes: semestres.length,
        plano: semestres,
        materiasNaoAlocadas: naoAlocadas,
    };
}

// =============================================================
// 8) Motor 2 v2 — gerarPlanoCompletov2
// =============================================================

export interface DisciplinaFluxo {
    codigo: string;
    status?: "APR" | "REP" | "MATR" | null;
    ano_periodo?: string;
    tipo_dado?: string;
    nome?: string;
    creditos?: number;
    /** Turma da matrícula real (MATR), como o histórico SIGAA registra (ex.: "01"). */
    turma?: string;
    /** Professor da matrícula real (MATR), como o histórico SIGAA registra. */
    professor?: string;
}

/**
 * Extrai do fluxograma_atual do aluno as matérias concluídas (APR/CUMP) e as em
 * curso (MATR). Exportada para as tools do agente consultarem o histórico real.
 */
export function parseFluxograma(fluxograma_atual_str: string | null | undefined): {
    completed: Set<string>;
    currentSemester: DisciplinaFluxo[];
} {
    const completed = new Set<string>();
    const currentSemester: DisciplinaFluxo[] = [];

    if (!fluxograma_atual_str) {
        return { completed, currentSemester };
    }

    try {
        let fluxogramaData: any;
        if (typeof fluxograma_atual_str === "string") {
            fluxogramaData = JSON.parse(fluxograma_atual_str);
        } else {
            fluxogramaData = fluxograma_atual_str;
        }

        const dadosFluxograma = fluxogramaData.dados_fluxograma;
        if (!Array.isArray(dadosFluxograma)) {
            return { completed, currentSemester };
        }

        for (const semestre of dadosFluxograma) {
            if (!Array.isArray(semestre)) continue;

            for (const disc of semestre) {
                if (!disc || typeof disc !== "object") continue;

                const codigo = norm(disc.codigo);
                if (!codigo) continue;

                const status = disc.status?.toUpperCase();

                if (status === "APR" || status === "CUMP") {
                    completed.add(codigo);
                } else if (status === "MATR") {
                    currentSemester.push({
                        codigo,
                        status: "MATR",
                        ano_periodo: disc.ano_periodo,
                        tipo_dado: disc.tipo_dado,
                        nome: disc.nome,
                        creditos: disc.creditos,
                        turma: typeof disc.turma === "string" && disc.turma.trim() ? disc.turma.trim() : undefined,
                        professor:
                            typeof disc.professor === "string" && disc.professor.trim()
                                ? disc.professor.trim()
                                : undefined,
                    });
                }
            }
        }
    } catch (err) {
        console.error("Erro ao parsear fluxograma_atual:", err);
    }

    return { completed, currentSemester };
}

function isEstagioOuTCC(materia: MateriaInput): boolean {
    const nomeLower = (materia.nome || "").toLowerCase();
    return (
        nomeLower.includes("estág") ||
        nomeLower.includes("tcc") ||
        nomeLower.includes("trabalho de conclus") ||
        nomeLower.includes("trabalho de graduação") ||
        nomeLower.includes("projeto final") ||
        nomeLower.includes("monografia")
    );
}

/**
 * Distribui slots de optativa e complementar nos semestres futuros.
 * Trabalha com a matemática convertendo o espaço do semestre para Horas para
 * evitar estourar o limite de créditos do plano.
 *
 * NOTA CRÍTICA: Usa _horasInternas (valor exato em horas) quando disponível para
 * evitar arredondamento duplo (horas→creditos→horas). Sem isso, cada semestre perde
 * ~3-14h de espaço due ao Math.ceil repetido. Fallback para creditosParaHoras()
 * mantém compatibilidade com dados legados.
 */
function distribuirSlots(
    semestres: SemestrePlano[],
    chOptativaFaltante: number,
    chComplementarFaltante: number,
    limiteCreditosMax: number,
    limitesPersonalizados?: Record<number, number>
): {
    semestres: SemestrePlano[];
    optativaAlocada: number;
    complementarAlocado: number;
} {
    let optativaAlocada = 0;
    let complementarAlocado = 0;

    console.log(`\n[distribuirSlots] Starting with ${semestres.length} semesters, need ${chOptativaFaltante}h optativas, ${chComplementarFaltante}h complementar`);

    for (let semIdx = 0; semIdx < semestres.length; semIdx++) {
        const semestre = semestres[semIdx];
        
        // Verificar se há limite personalizado para este semestre
        const customLimit = limitesPersonalizados?.[semIdx];
        const creditosBase = customLimit !== undefined ? customLimit : limiteCreditosMax;
        const limiteHorasMax = Math.min(creditosBase * 15, 480);

        // Usar _horasInternas se disponível para evitar reconversão que causa perda de precisão
        let horasUsadasNoSemestre = (semestre as any)._horasInternas ?? creditosParaHoras(semestre.creditos);
        let espacoDisponivelHoras = limiteHorasMax - horasUsadasNoSemestre;

        console.log(`  [Semestre ${semIdx}] Horas usadas: ${horasUsadasNoSemestre}h, espaço disponível: ${espacoDisponivelHoras}h`);

        if (espacoDisponivelHoras <= 0) {
            console.log(`    → Sem espaço, pulando`);
            continue;
        }

        // 1) Aloca slots de Optativas
        if (optativaAlocada < chOptativaFaltante) {
            const chParaAlocar = Math.min(chOptativaFaltante - optativaAlocada, espacoDisponivelHoras);
            console.log(`    → Optativa: faltam ${chOptativaFaltante - optativaAlocada}h, espaço ${espacoDisponivelHoras}h, vou alocar ${chParaAlocar}h`);
            if (chParaAlocar > 0) {
                const slot: OptativaSlot = {
                    tipo: "optativa_slot",
                    ch: chParaAlocar,
                    descricao: `Slot de Optativa (~${chParaAlocar}h)`
                };
                (semestre.materias as any[]).push(slot);
                horasUsadasNoSemestre += chParaAlocar;
                semestre.creditos += Math.ceil(chParaAlocar / 15);
                if ((semestre as any)._horasInternas) {
                    (semestre as any)._horasInternas += chParaAlocar;  // Manter _horasInternas sincronizado
                }
                optativaAlocada += chParaAlocar;
                console.log(`      ✓ Alocado ${chParaAlocar}h optativa (total acumulado: ${optativaAlocada}h)`);
            }
        } else {
            console.log(`    → Todas optativas já alocadas (${optativaAlocada}h)`);
        }

        // 2) Aloca slots de Atividades Complementares
        let espacoRestanteHoras = limiteHorasMax - horasUsadasNoSemestre;
        if (complementarAlocado < chComplementarFaltante) {
            const chParaAlocarComp = Math.min(chComplementarFaltante - complementarAlocado, espacoRestanteHoras);
            console.log(`    → Complementar: faltam ${chComplementarFaltante - complementarAlocado}h, espaço ${espacoRestanteHoras}h, vou alocar ${chParaAlocarComp}h`);
            if (chParaAlocarComp > 0) {
                const slot: ComplementarSlot = {
                    tipo: "complementar_slot",
                    ch: chParaAlocarComp,
                    descricao: `Atividades Complementares (~${chParaAlocarComp}h)`
                };
                (semestre.materias as any[]).push(slot);
                semestre.creditos += Math.ceil(chParaAlocarComp / 15);
                if ((semestre as any)._horasInternas) {
                    (semestre as any)._horasInternas += chParaAlocarComp;  // Manter _horasInternas sincronizado
                }
                complementarAlocado += chParaAlocarComp;
                console.log(`      ✓ Alocado ${chParaAlocarComp}h complementar (total acumulado: ${complementarAlocado}h)`);
            }
        } else if (chComplementarFaltante > 0) {
            console.log(`    → Todas complementares já alocadas (${complementarAlocado}h)`);
        }
    }

    console.log(`[distribuirSlots] Final: optativaAlocada=${optativaAlocada}h, complementarAlocado=${complementarAlocado}h\n`);
    return { semestres, optativaAlocada, complementarAlocado };
}

function getEarliestValidSemester(
    materia: MateriaInput,
    semestres: SemestrePlano[],
    completedCodes: Set<string>
): number {
    const expr = parseExprOrNull(materia.preRequisitos);
    if (!expr) return 0;

    const currentCumulados = new Set<string>();
    for (const c of completedCodes) currentCumulados.add(norm(c));

    for (let k = 0; k < semestres.length; k++) {
        if (satisfazExpressaoLogica(expr, currentCumulados)) {
            return k;
        }
        for (const m of semestres[k].materias) {
            if (typeof m === 'object' && 'codigo' in m) {
                currentCumulados.add(norm(m.codigo));
            }
        }
    }

    if (satisfazExpressaoLogica(expr, currentCumulados)) {
        return semestres.length;
    }
    return semestres.length; // Fallback
}

function distribuirObrigatorias(
    obrigatorias: MateriaInput[],
    completedCodes: Set<string>,
    preferencias: PreferenciasPlano,
    numeroPeriodo: number,
    codigosComOferta?: Set<string>,
    chOptativaFaltante?: number,
    semestreBaseStr?: string,  // propagado para distribuirPorSemestres para preencher labelSemestre
    offsetSemestre: number = 1  // ver distribuirPorSemestres — 1 se ja ha MATR no semestre corrente, 0 se nao
): {
    semestres: SemestrePlano[];
    naoAlocadas: string[];
} {
    const regular = obrigatorias.filter((m) => !isEstagioOuTCC(m));
    const estagioTCC = obrigatorias.filter((m) => isEstagioOuTCC(m));

    let semestres = distribuirPorSemestres(
        regular,
        completedCodes,
        preferencias,
        numeroPeriodo,
        codigosComOferta,
        chOptativaFaltante,
        semestreBaseStr,  // propagar para preencher semestre em cada SemestrePlano
        offsetSemestre
    );

    // Se há estágio/TCC mas nenhum semestre foi criado, criar semestre vazio receptor
    if (estagioTCC.length > 0 && semestres.length === 0) {
        semestres.push({
            indice: 0,
            tipo: "estimado",
            semestre: semestreBaseStr ? avancarSemestres(semestreBaseStr, offsetSemestre) : undefined,
            creditos: 0,
            materias: [],
        });
    }

    // Ordenar estágio/TCC por nome para tentar garantir TCC 1 antes de TCC 2 (se nomes ajudarem)
    const estagioTCCOrdenado = [...estagioTCC].sort((a, b) =>
        (a.nome || "").localeCompare(b.nome || "")
    );

    const estagioTCCRestantes = new Set<string>(
        estagioTCCOrdenado.map((m) => norm(m.codigo))
    );

    // Novo loop de alocação garantindo respeito aos pré-requisitos!
    // Regra: Tentar alocar nos últimos semestres absolutos, mas NUNCA antes do earliestValid
    for (let idx = 0; idx < estagioTCCOrdenado.length; idx++) {
        const materia = estagioTCCOrdenado[idx];
        const cod = norm(materia.codigo);

        if (!estagioTCCRestantes.has(cod)) continue;

        // Descobrimos qual é o primeiro semestre em que essa matéria está desbloqueada
        const earliestValid = getEarliestValidSemester(materia, semestres, completedCodes);
        const creditosMateria = getCreditosSafely(materia);

        // Queremos empurrar para os últimos semestres (ex: penúltimo), mas não antes do que é permitido!
        let targetIdx = Math.max(semestres.length - 2, earliestValid);

        // Garantir que targetIdx é válido e semestres existem até lá
        while (targetIdx >= semestres.length) {
            const novoIndice = semestres.length;
            semestres.push({
                indice: novoIndice,
                tipo: "estimado",
                semestre: semestreBaseStr ? avancarSemestres(semestreBaseStr, novoIndice + offsetSemestre) : undefined,
                creditos: 0,
                _horasInternas: 0,
                materias: [],
            });
        }

        // BUG FIX 1: Se adicionar TCC/Estágio ultrapassa limiteCreditos, criar novo semestre e mover pra ele
        // Mas APENAS se o semestre alvo já tiver matérias (para não criar semestres infinitos vazios se a matéria for gigante)
        if (semestres[targetIdx].creditos + creditosMateria > preferencias.limiteCreditos && semestres[targetIdx].materias.length > 0) {
            console.log(`  [TCC/Estágio] Semestre ${targetIdx} atingiria ${semestres[targetIdx].creditos + creditosMateria} cr (limite: ${preferencias.limiteCreditos}), movendo para o próximo`);

            targetIdx++;
            if (targetIdx >= semestres.length) {
                const novoIndice = semestres.length;
                semestres.push({
                    indice: novoIndice,
                    tipo: "estimado",
                    semestre: semestreBaseStr ? avancarSemestres(semestreBaseStr, novoIndice + offsetSemestre) : undefined,
                    creditos: 0,
                    _horasInternas: 0,
                    materias: [],
                });
            }
        }

        const mPlano: MateriaPlano = {
            codigo: cod,
            nome: materia.nome,
            creditos: creditosMateria,
            critica: true,
            desbloqueiaDireto: 0,
            desbloqueiaIndireto: 0,
            score: 100,
            motivo: montarMotivo({ codigo: cod, nome: materia.nome, creditos: creditosMateria, critica: true, desbloqueiaDireto: 0, desbloqueiaIndireto: 0, score: 100, motivo: "" } as MateriaPlano, false),
            dificuldadeEstimada: materia.dificuldadeEstimada,
            motivoDificuldade: materia.motivoDificuldade
        };

        (semestres[targetIdx].materias as any[]).push(mPlano);
        semestres[targetIdx].creditos += creditosMateria;
        const horasMateria = getHorasSafely(materia);
        if ((semestres[targetIdx] as any)._horasInternas != null) {
            (semestres[targetIdx] as any)._horasInternas += horasMateria;
        }
        estagioTCCRestantes.delete(cod);
    }

    const naoAlocadas = Array.from(estagioTCCRestantes).sort();
    return { semestres, naoAlocadas };
}

export function gerarPlanoCompletov2(
    _idUser: string,
    _idCurso: string,
    semestreAtual: number,
    cargaHorariaIntegralizada: CargaIntegralizada,
    exigidaMatriz: CargaIntegralizada,
    fluxogramaAtualJson: string | null | undefined,
    materias: MateriaInput[],
    preferencias?: PreferenciasPlano,
    codigosComOferta?: Set<string>
): PlanoFormaturav2 {
    
    const prefs: PreferenciasPlano = preferencias ?? {
        limiteCreditos: 24,
        objetivo: "equilibrado",
        trabalha: false,
    };

    // Log informações sobre optativas com oferta real
    if (codigosComOferta && codigosComOferta.size > 0) {
        const optativasComOferta = materias.filter(m => m.tipo_natureza === 1 && codigosComOferta.has(norm(m.codigo)));
        const optativasSemOferta = materias.filter(m => m.tipo_natureza === 1 && !codigosComOferta.has(norm(m.codigo)));
        console.log(`\n[Motor2 v2] Optativas com oferta real: ${optativasComOferta.length} (${optativasComOferta.map(m => m.codigo).join(', ')})`);
        console.log(`[Motor2 v2] Optativas SEM oferta real: ${optativasSemOferta.length} (${optativasSemOferta.map(m => m.codigo).join(', ')})`);
    }

    const { completed, currentSemester } = parseFluxograma(fluxogramaAtualJson);

    // Mapeamento preciso da Carga Horária das disciplinas MATR 
    const horasSemestreAtual = {
        obrigatoria: 0,
        optativa: 0,
        complementar: 0,
    };

    for (const m of currentSemester) {
        const matInfo = materias.find(mat => norm(mat.codigo) === norm(m.codigo));
        const chMateria = matInfo ? getHorasSafely(matInfo) : creditosParaHoras(m.creditos ?? 4);

        if (matInfo?.obrigatoria) {
            horasSemestreAtual.obrigatoria += chMateria;
        } else {
            horasSemestreAtual.optativa += chMateria;
        }
    }

    // Calcula CH faltante real = Exigida - Feita - Em Curso
    const chFaltante = {
        total: Math.max(0, exigidaMatriz.total - cargaHorariaIntegralizada.total),
        obrigatoria: Math.max(0,
            exigidaMatriz.obrigatoria
            - cargaHorariaIntegralizada.obrigatoria
            - horasSemestreAtual.obrigatoria  // B2: abater CH obrigatória em andamento
        ),
        optativa: Math.max(0, exigidaMatriz.optativa - cargaHorariaIntegralizada.optativa - horasSemestreAtual.optativa),
        complementar: Math.max(0, exigidaMatriz.complementar - cargaHorariaIntegralizada.complementar)
    };

    // Log estratégia de alocação com espaço reservado
    console.log(`\n[Motor2 v2] Estratégia de alocação: Reservando espaço para ${chFaltante.optativa}h de optativas`);
    const horasReservadaPorSemestre = chFaltante.optativa > 0
        ? Math.min(60, Math.ceil(chFaltante.optativa / 5))
        : 0;
    console.log(`[Motor2 v2] Espaço reservado por semestre: ~${horasReservadaPorSemestre}h`);
    console.log(`[Motor2 v2] Limite efetivo para obrigatórias: ${prefs.limiteCreditos * 15 - horasReservadaPorSemestre}h/semestre\n`);

    // B1: Criar completedPlusMatr que inclui matérias concluídas E em andamento (MATR)
    const completedPlusMatrBase = new Set(completed);
    for (const m of currentSemester) {
        completedPlusMatrBase.add(norm(m.codigo));
    }

    // Equivalência: matéria satisfeita por algo que o aluno já cursou conta como
    // cumprida — não entra no plano de novo e libera quem depende dela. O fluxograma
    // só pré-resolve isso para obrigatórias (fluxograma_controller.checkEquivalencies),
    // então sem esta expansão as optativas equivalentes escapavam.
    const completedPlusMatr = expandirCumpridasComEquivalencias(materias, completedPlusMatrBase);

    const materiasFaltantes = materias.filter((m) => !completedPlusMatr.has(norm(m.codigo)));

    // Optativas que o aluno pediu para ADICIONAR (via chat) entram na alocacao como
    // materias concretas, no mesmo pipeline das obrigatorias; a CH delas abate a
    // reserva de slots e a CH optativa faltante mais abaixo.
    const adicionadas = new Set((prefs.restricoes?.adicionar ?? []).map(norm));
    const obrigatorias = materiasFaltantes.filter(
        (m) => m.obrigatoria || adicionadas.has(norm(m.codigo))
    );

    // Calcular semestre atual como string "2026.1" para preencher labels das colunas
    const semestreBaseStr = calcularSemestreAtualStr();

    // Se o aluno já tem MATR no semestre corrente, o semestre corrente já está "gasto"
    // (aparece à parte em resultado.semestreAtual) e o plano deve começar no seguinte.
    // Se não há MATR (ex: início de período, turmas/matrículas ainda não publicadas),
    // o semestre corrente ainda está livre e o plano deve preenchê-lo — senão o aluno
    // perde um semestre inteiro no planejamento.
    const offsetSemestre = currentSemester.length > 0 ? 1 : 0;

    const { semestres, naoAlocadas } = distribuirObrigatorias(
        obrigatorias,
        completedPlusMatr,  // B1: usar completedPlusMatr em vez de completed
        prefs,
        semestreAtual,
        codigosComOferta,
        chFaltante.optativa,  // Passar horas faltantes de optativas para reservar espaço
        semestreBaseStr,      // Projeção temporal: preencher SemestrePlano.semestre
        offsetSemestre
    );

    // Optativas com semestre escolhido pelo aluno (adicionarEm): move o card para o
    // indice pedido. So move para FRENTE do que o alocador escolheu — para tras
    // esbarraria em pre-requisitos/limite de creditos que o alocador ja respeitou.
    const adicionarEm = prefs.restricoes?.adicionarEm ?? {};
    for (const [codRaw, alvoRaw] of Object.entries(adicionarEm)) {
        const cod = norm(codRaw);
        if (!adicionadas.has(cod) || semestres.length === 0) continue;
        const alvo = Math.min(Math.max(0, Math.floor(alvoRaw)), semestres.length - 1);
        const origemIdx = semestres.findIndex((s) =>
            s.materias.some((m) => "codigo" in m && norm(m.codigo) === cod)
        );
        if (origemIdx < 0 || alvo <= origemIdx) continue;
        const origem = semestres[origemIdx];
        const pos = origem.materias.findIndex((m) => "codigo" in m && norm((m as MateriaPlano).codigo) === cod);
        const [mPlano] = origem.materias.splice(pos, 1) as MateriaPlano[];
        const destino = semestres[alvo];
        destino.materias.push(mPlano);
        const matInfo = materias.find((x) => norm(x.codigo) === cod);
        const horasReais = matInfo ? getHorasSafely(matInfo) : creditosParaHoras(mPlano.creditos);
        origem.creditos -= mPlano.creditos;
        destino.creditos += mPlano.creditos;
        if (origem._horasInternas != null) origem._horasInternas -= horasReais;
        if (destino._horasInternas != null) destino._horasInternas += horasReais;
    }

    // CH das optativas adicionadas que de fato entraram no plano: cobre parte da
    // CH optativa faltante, entao os slots genericos reservam so o restante.
    let chOptativaConcreta = 0;
    if (adicionadas.size > 0) {
        for (const sem of semestres) {
            for (const m of sem.materias) {
                if ("codigo" in m && m.codigo && adicionadas.has(norm(m.codigo))) {
                    const matInfo = materias.find((x) => norm(x.codigo) === norm(m.codigo));
                    if (matInfo && !matInfo.obrigatoria) {
                        chOptativaConcreta += matInfo.carga_horaria ?? creditosParaHoras(getCreditosSafely(matInfo));
                    }
                }
            }
        }
    }

    const { semestres: semestresComSlots, optativaAlocada, complementarAlocado } = distribuirSlots(
        semestres,
        Math.max(0, chFaltante.optativa - chOptativaConcreta),
        chFaltante.complementar,
        prefs.limiteCreditos,
        prefs.restricoes?.limitesPersonalizados
    );

    const chOptativaRestante = Math.max(0, chFaltante.optativa - chOptativaConcreta - optativaAlocada);
    const chComplementarRestante = Math.max(0, chFaltante.complementar - complementarAlocado);

    // Calcula quantas obrigatórias conseguimos alocar (CH em horas)
    let chObrigatoriaAlocada = 0;
    for(const sem of semestresComSlots) {
        for(const m of sem.materias) {
            if('codigo' in m && m.codigo) {
                const matInfo = materias.find(x => norm(x.codigo) === norm(m.codigo));
                if(matInfo?.obrigatoria) {
                    chObrigatoriaAlocada += matInfo.carga_horaria ?? creditosParaHoras(getCreditosSafely(matInfo));
                }
            }
        }
    }

    // ========== DEBUG: Verify hours calculation ==========
    console.log('\n========== [Motor2] HOURS CALCULATION AUDIT ==========');
    console.log('REQUIRED vs COMPLETED:');
    console.log(`  Total:        ${cargaHorariaIntegralizada.total}/${exigidaMatriz.total}h`);
    console.log(`  Obrigatória:  ${cargaHorariaIntegralizada.obrigatoria}/${exigidaMatriz.obrigatoria}h`);
    console.log(`  Optativa:     ${cargaHorariaIntegralizada.optativa}/${exigidaMatriz.optativa}h`);
    console.log(`  Complementar: ${cargaHorariaIntegralizada.complementar}/${exigidaMatriz.complementar}h`);

    console.log('\nIN-PROGRESS (MATR):');
    console.log(`  Obrigatória (MATR): ${horasSemestreAtual.obrigatoria}h`);
    console.log(`  Optativa (MATR):    ${horasSemestreAtual.optativa}h`);
    console.log(`  MATR subjects (${currentSemester.length}): ${currentSemester.map(m => `${m.codigo}(${m.creditos || 4}cr)`).join(', ')}`);

    console.log('\nCALCULATED SHORTAGE (Required - Completed - In-Progress):');
    console.log(`  Obrigatória faltante: ${exigidaMatriz.obrigatoria} - ${cargaHorariaIntegralizada.obrigatoria} - ${horasSemestreAtual.obrigatoria} = ${chFaltante.obrigatoria}h`);
    console.log(`  Optativa faltante:    ${exigidaMatriz.optativa} - ${cargaHorariaIntegralizada.optativa} - ${horasSemestreAtual.optativa} = ${chFaltante.optativa}h`);
    console.log(`  Complementar faltante: ${exigidaMatriz.complementar} - ${cargaHorariaIntegralizada.complementar} - 0 = ${chFaltante.complementar}h`);

    console.log('\nALLOCATED IN PLAN:');
    console.log(`  Obrigatória alocada: ${chObrigatoriaAlocada}h`);
    console.log(`  Optativa alocada:    ${optativaAlocada}h`);
    console.log(`  Complementar alocado: ${complementarAlocado}h`);

    console.log('\nREMAINING AFTER PLAN:');
    console.log(`  Obrigatória restante: ${chFaltante.obrigatoria - chObrigatoriaAlocada}h`);
    console.log(`  Optativa restante:    ${chOptativaRestante}h`);
    console.log(`  Complementar restante: ${chComplementarRestante}h`);

    console.log('\nPLAN SUMMARY:');
    console.log(`  Semesters generated: ${semestresComSlots.length}`);
    console.log(`  Total non-allocated: ${naoAlocadas.length} subjects (${naoAlocadas.join(', ')})`);
    console.log('=====================================================\n');

    const resultado: PlanoFormaturav2 = {
        semestreAtual: currentSemester.length > 0 ? {
            tipo: "em_curso",
            materias: currentSemester.map((m) => {
                const matInfo = materias.find(x => norm(x.codigo) === norm(m.codigo));
                return {
                    codigo: m.codigo,
                    nome: matInfo?.nome || m.nome || m.codigo,
                    creditos: getCreditosSafely(matInfo ?? { creditos: 4 }),
                    status: "MATR",
                };
            }),
        } : undefined,
        semestresRestantes: semestresComSlots.length,
        formaturaEstimada: semestresComSlots.length > 0
            ? semestresComSlots[semestresComSlots.length - 1].semestre
            : undefined,
        plano: semestresComSlots,
        materiasNaoAlocadas: naoAlocadas,
        chObrigatoriaFaltante: Math.max(0, chFaltante.obrigatoria - chObrigatoriaAlocada),
        chOptativaFaltante: chOptativaRestante,
        chComplementarFaltante: chComplementarRestante,
        integralizacao: {
            horasIntegralizadas: cargaHorariaIntegralizada.total,
            horasEmCurso:
                horasSemestreAtual.obrigatoria +
                horasSemestreAtual.optativa +
                horasSemestreAtual.complementar,
            horasExigidasTotal: exigidaMatriz.total,
        },
    };

    return resultado;
}