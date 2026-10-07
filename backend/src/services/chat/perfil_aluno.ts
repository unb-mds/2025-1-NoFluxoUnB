/**
 * Perfil acadêmico do aluno para a Darcy única — o bloco que entra na janela de
 * contexto de TODA mensagem, montado no servidor a partir do banco.
 *
 * O que entra aqui e o que fica para tool é decisão de produto, documentada em
 * docs/darcy-unificada.md: no contexto, o que é pequeno, estável na conversa e
 * necessário para quase toda resposta; em tool, o que é grande ou específico de
 * uma matéria. E nunca: e-mail, matrícula, nome completo, dados de outro aluno —
 * `PerfilAluno` nem carrega esses campos, então o render não tem como vazá-los.
 *
 * Nada aqui vem do cliente: currículo, concluídas e preferências são lidos de
 * `dados_users`/`historicos_usuarios`/`preferencias_grade`. O cliente só informa
 * em que tela está (ver `superficie.ts`).
 */

import { SupabaseWrapper } from "../../supabase_wrapper";
import { montarDadosPlano, resolverPeriodoAtivo } from "../../controllers/PlanejamentoController";
import {
    parseFluxograma,
    isDesbloqueada,
    expandirCumpridasComEquivalencias,
} from "../plano_formatura.service";
import {
    gerarPlanoDoContexto,
    resumoDoPlano,
    norm,
    type AgenteContexto,
    type RestricoesPlanoInternas,
} from "../agente/context";
import type { MateriaPlano, PlanoInput, PreferenciasPlano } from "../../types/planejamento";
import type { EstadoSuperficie, Superficie } from "./superficie";
import { resolveIdUserPorEmail } from "./aluno_identidade";
import { lerPerfilEmCache, guardarPerfilEmCache } from "./perfil_cache";

// =========================================================
// Tipos
// =========================================================

export interface MatriculaEmCurso {
    codigo: string;
    nome: string | null;
    /** Turma e professor da matrícula real — só quando é do período ativo. */
    turma: string | null;
    professor: string | null;
}

export interface PendenteDesbloqueada {
    codigo: string;
    nome: string;
    nivel: number;
    creditos: number;
}

export interface PreferenciaGrade {
    codigo: string;
    turnos: string[];
    docente: string | null;
}

export interface PerfilAluno {
    idUser: string;
    /** `null` = aluno ainda sem histórico enviado; o resto do perfil fica vazio. */
    curriculoCompleto: string | null;
    curso: string | null;
    semestreAtual: number;
    periodoAtivo: string;
    ira: number | null;
    integralizacao: {
        percentualPorHoras: number;
        /** Horas feitas / exigidas por natureza. */
        feitas: { total: number; obrigatoria: number; optativa: number; complementar: number };
        exigidas: { total: number; obrigatoria: number; optativa: number; complementar: number };
    };
    emCurso: MatriculaEmCurso[];
    concluidas: string[];
    pendentesDesbloqueadas: PendenteDesbloqueada[];
    plano: {
        semestresRestantes: number;
        formaturaEstimada: string | null;
        proximoSemestre: Array<{ codigo: string; nome: string; creditos: number }>;
        materiasCriticas: string[];
        materiasNaoAlocadas: string[];
    } | null;
    preferencias: { limiteCreditos: number; objetivo: string; trabalha: boolean };
    restricoes: { adiar: string[]; priorizar: string[]; adicionar: string[] };
    preferenciasGrade: PreferenciaGrade[];
    /**
     * Contexto das tools de plano (Motor 2). `null` sem histórico. É compartilhado
     * pelo cache: quem for mutá-lo (tools de plano) usa `clonarContexto` antes.
     */
    ctx: AgenteContexto | null;
}

// =========================================================
// Cache (módulo próprio — ver perfil_cache.ts)
// =========================================================

export { invalidarPerfilAluno, limparCachePerfis } from "./perfil_cache";

/** Hash curto e estável (djb2) — só para comparar assinaturas, não é segurança. */
function hashTexto(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

// =========================================================
// Montagem
// =========================================================

function numeroOu(v: unknown, padrao: number): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : padrao;
}

/** Semestre do aluno: o do histórico; senão `dados_users.semestre_atual` se for um número de semestre. */
function resolverSemestre(numeroSemestre: unknown, semestreAtual: unknown): number {
    const doHistorico = Number(numeroSemestre);
    if (Number.isInteger(doHistorico) && doHistorico > 0) return doHistorico;
    const doUsuario = Number(semestreAtual);
    if (Number.isInteger(doUsuario) && doUsuario > 0 && doUsuario < 30) return doUsuario;
    return 1;
}

function restricoesInternas(raw: unknown): RestricoesPlanoInternas {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const lista = (v: unknown) =>
        Array.isArray(v) ? v.filter((c): c is string => typeof c === "string").map(norm) : [];
    const mapa = (v: unknown): Record<string, number> =>
        v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {};
    return {
        adiar: lista(r.adiar),
        priorizar: lista(r.priorizar),
        adicionar: lista(r.adicionar),
        adicionarEm: mapa(r.adicionarEm),
        limitesPersonalizados: mapa(r.limitesPersonalizados) as unknown as Record<number, number>,
    };
}

/** Cópia profunda o bastante para as tools de plano mutarem sem sujar o cache. */
export function clonarContexto(ctx: AgenteContexto): AgenteContexto {
    return {
        ...ctx,
        materias: [...ctx.materias],
        preferencias: { ...ctx.preferencias },
        restricoes: {
            adiar: [...ctx.restricoes.adiar],
            priorizar: [...ctx.restricoes.priorizar],
            adicionar: [...ctx.restricoes.adicionar],
            adicionarEm: { ...ctx.restricoes.adicionarEm },
            limitesPersonalizados: { ...ctx.restricoes.limitesPersonalizados },
        },
    };
}

function perfilVazio(idUser: string, periodoAtivo: string): PerfilAluno {
    const zero = { total: 0, obrigatoria: 0, optativa: 0, complementar: 0 };
    return {
        idUser,
        curriculoCompleto: null,
        curso: null,
        semestreAtual: 1,
        periodoAtivo,
        ira: null,
        integralizacao: { percentualPorHoras: 0, feitas: { ...zero }, exigidas: { ...zero } },
        emCurso: [],
        concluidas: [],
        pendentesDesbloqueadas: [],
        plano: null,
        preferencias: { limiteCreditos: 24, objetivo: "equilibrado", trabalha: false },
        restricoes: { adiar: [], priorizar: [], adicionar: [] },
        preferenciasGrade: [],
        ctx: null,
    };
}

/**
 * Perfil do aluno do e-mail autenticado, ou `null` se não há cadastro. Lê sempre
 * os dados baratos (para a assinatura de cache) e só recalcula o pesado (matriz,
 * Motor 2) quando eles mudaram ou o TTL venceu.
 */
export async function montarPerfilAluno(email: string): Promise<PerfilAluno | null> {
    const idUser = await resolveIdUserPorEmail(email);
    if (!idUser) return null;

    const supabase = SupabaseWrapper.get();
    const [dadosRes, historicoRes, prefGradeRes, periodoAtivo] = await Promise.all([
        supabase
            .from("dados_users")
            .select("semestre_atual, fluxograma_atual, preferencias_plano, carga_horaria_integralizada")
            .eq("id_user", idUser)
            .maybeSingle(),
        supabase
            .from("historicos_usuarios")
            .select("matriz_curricular, curso_extraido, ira, numero_semestre, created_at")
            .eq("id_user", idUser)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabase.from("preferencias_grade").select("codigo_materia, turnos, docente").eq("id_user", idUser),
        resolverPeriodoAtivo(supabase),
    ]);

    const dadosUser = (dadosRes as any)?.data ?? null;
    const historico = (historicoRes as any)?.data ?? null;
    const prefGradeRows = ((prefGradeRes as any)?.data ?? []) as Array<Record<string, unknown>>;

    const impressao = hashTexto(
        JSON.stringify([
            dadosUser?.semestre_atual ?? null,
            dadosUser?.preferencias_plano ?? null,
            dadosUser?.carga_horaria_integralizada ?? null,
            hashTexto(String(dadosUser?.fluxograma_atual ?? "")),
            historico?.created_at ?? null,
            historico?.matriz_curricular ?? null,
            prefGradeRows,
            periodoAtivo,
        ])
    );

    const emCache = lerPerfilEmCache<PerfilAluno>(idUser, impressao);
    if (emCache) return emCache;

    const perfil = await calcularPerfil(idUser, periodoAtivo, dadosUser, historico, prefGradeRows);
    guardarPerfilEmCache(idUser, impressao, perfil);
    return perfil;
}

async function calcularPerfil(
    idUser: string,
    periodoAtivo: string,
    dadosUser: Record<string, any> | null,
    historico: Record<string, any> | null,
    prefGradeRows: Array<Record<string, unknown>>
): Promise<PerfilAluno> {
    const perfil = perfilVazio(idUser, periodoAtivo);
    perfil.preferenciasGrade = prefGradeRows
        .filter((r) => typeof r.codigo_materia === "string")
        .map((r) => ({
            codigo: norm(String(r.codigo_materia)),
            turnos: Array.isArray(r.turnos) ? (r.turnos as unknown[]).map(String) : [],
            docente: typeof r.docente === "string" && r.docente.trim() ? r.docente.trim() : null,
        }));

    const curriculoCompleto = String(historico?.matriz_curricular ?? "").trim();
    if (!dadosUser || !curriculoCompleto) return perfil;

    perfil.curriculoCompleto = curriculoCompleto;
    perfil.curso = typeof historico?.curso_extraido === "string" ? historico.curso_extraido.trim() || null : null;
    perfil.ira = historico?.ira != null && Number.isFinite(Number(historico.ira)) ? Number(historico.ira) : null;
    perfil.semestreAtual = resolverSemestre(historico?.numero_semestre, dadosUser.semestre_atual);

    // `preferencias` ausente: montarDadosPlano usa as salvas em dados_users.
    const { dados } = await montarDadosPlano(idUser, {
        curriculoCompleto,
        completedCodes: [],
        numeroPeriodo: perfil.semestreAtual,
    } as unknown as PlanoInput);

    const { completed, currentSemester } = parseFluxograma(dadosUser.fluxograma_atual);
    perfil.concluidas = [...completed].sort();
    perfil.emCurso = currentSemester.map((m) => {
        const doPeriodo = !m.ano_periodo || String(m.ano_periodo).trim() === periodoAtivo;
        return {
            codigo: norm(m.codigo),
            nome: m.nome ?? null,
            turma: doPeriodo ? m.turma ?? null : null,
            professor: doPeriodo ? m.professor ?? null : null,
        };
    });

    if (!dados) return perfil;

    const prefs: PreferenciasPlano = dados.preferencias;
    perfil.preferencias = {
        limiteCreditos: numeroOu(prefs.limiteCreditos, 24),
        objetivo: prefs.objetivo,
        trabalha: Boolean(prefs.trabalha),
    };
    const restricoes = restricoesInternas(prefs.restricoes);
    perfil.restricoes = { adiar: restricoes.adiar, priorizar: restricoes.priorizar, adicionar: restricoes.adicionar };

    const ctx: AgenteContexto = {
        materias: dados.materiasMapeadas,
        cargaHorariaIntegralizada: dados.cargaHorariaIntegralizada,
        exigidaMatriz: dados.exigidaMatriz,
        fluxogramaAtual: dados.fluxogramaAtual,
        idUser: dados.idUser,
        idCurso: dados.idCurso,
        numeroPeriodo: dados.numeroPeriodo,
        preferencias: { limiteCreditos: prefs.limiteCreditos, objetivo: prefs.objetivo, trabalha: prefs.trabalha },
        restricoes,
        codigosComOferta: dados.codigosComOferta,
    };
    perfil.ctx = ctx;

    const feitas = {
        total: numeroOu(dados.cargaHorariaIntegralizada.total, 0),
        obrigatoria: numeroOu(dados.cargaHorariaIntegralizada.obrigatoria, 0),
        optativa: numeroOu(dados.cargaHorariaIntegralizada.optativa, 0),
        complementar: numeroOu(dados.cargaHorariaIntegralizada.complementar, 0),
    };
    const exigidas = {
        total: numeroOu(dados.exigidaMatriz.total, 0),
        obrigatoria: numeroOu(dados.exigidaMatriz.obrigatoria, 0),
        optativa: numeroOu(dados.exigidaMatriz.optativa, 0),
        complementar: numeroOu(dados.exigidaMatriz.complementar, 0),
    };
    perfil.integralizacao = {
        feitas,
        exigidas,
        percentualPorHoras: exigidas.total > 0 ? Math.round((feitas.total / exigidas.total) * 100) : 0,
    };

    // Próximas obrigatórias: pendentes cujo pré-requisito fecha contando o que ele
    // cursa agora (MATR) — mesma regra do Motor 2 e do montador.
    const emCursoSet = new Set(perfil.emCurso.map((m) => m.codigo));
    const aprovadas = expandirCumpridasComEquivalencias(ctx.materias, new Set(completed));
    const cumpridas = expandirCumpridasComEquivalencias(ctx.materias, new Set([...completed, ...emCursoSet]));
    perfil.pendentesDesbloqueadas = ctx.materias
        .filter((m) => m.obrigatoria)
        .filter((m) => !aprovadas.has(norm(m.codigo)) && !emCursoSet.has(norm(m.codigo)))
        .filter((m) => isDesbloqueada(m, cumpridas))
        .sort((a, b) => (a.nivel || 99) - (b.nivel || 99) || a.codigo.localeCompare(b.codigo))
        .map((m) => ({ codigo: norm(m.codigo), nome: m.nome, nivel: m.nivel, creditos: m.creditos }));

    try {
        const plano = gerarPlanoDoContexto(ctx);
        const resumo = resumoDoPlano(plano, ctx);
        const primeiro = plano.plano[0];
        perfil.plano = {
            semestresRestantes: plano.semestresRestantes,
            formaturaEstimada: plano.formaturaEstimada ?? null,
            proximoSemestre: (primeiro?.materias ?? [])
                .filter((m): m is MateriaPlano => "codigo" in m)
                .map((m) => ({ codigo: m.codigo, nome: m.nome, creditos: m.creditos })),
            materiasCriticas: resumo.materiasCriticas ?? [],
            materiasNaoAlocadas: plano.materiasNaoAlocadas ?? [],
        };
    } catch {
        // Sem plano a Darcy ainda tem o resto do perfil; consultar_plano reporta o erro.
        perfil.plano = null;
    }

    return perfil;
}

// =========================================================
// Render
// =========================================================

/** Teto do bloco de perfil no prompt (~2.5k tokens). */
export const TETO_PERFIL_CARACTERES = 10_000;

/** "A, B, C (+N)" — corta listas longas para caberem no teto. */
function lista(itens: string[], max: number): string {
    if (itens.length === 0) return "nenhuma";
    const visiveis = itens.slice(0, max);
    const resto = itens.length - visiveis.length;
    return resto > 0 ? `${visiveis.join(", ")} (+${resto})` : visiveis.join(", ");
}

function horas(feito: number, exigido: number): string {
    return `${feito}/${exigido}h (faltam ${Math.max(0, exigido - feito)}h)`;
}

function renderEstado(superficie: Superficie, estado: EstadoSuperficie | undefined): string {
    if (superficie === "montador" && estado?.tipo === "montador") {
        const codigos = estado.grade.map((g) => g.codigo);
        return [
            "## Tela atual: Montador de Grade",
            `- Grade aberta: ${lista(codigos, 15)} (${estado.creditos} créditos)`,
            `- Turnos permitidos: ${estado.turnos.length > 0 ? estado.turnos.join(", ") : "todos"}`,
            `- Matérias em curso na grade: ${estado.incluirCursando ? "incluídas" : "fora (aluno pediu sem elas)"}`,
        ].join("\n");
    }
    if (superficie === "plano") {
        const foco = estado?.tipo === "plano" && estado.semestreFoco != null ? ` (semestre em foco: índice ${estado.semestreFoco})` : "";
        return `## Tela atual: Plano de Formatura${foco}`;
    }
    return "## Tela atual: Assistente (conversa geral)";
}

/**
 * Texto do bloco "Perfil do aluno" para o prompt. Nunca contém e-mail, matrícula
 * nem nome completo — o perfil não carrega esses campos.
 */
export function renderizarPerfil(
    perfil: PerfilAluno | null,
    superficie: Superficie,
    estado?: EstadoSuperficie,
    teto: number = TETO_PERFIL_CARACTERES
): string {
    const estadoTxt = renderEstado(superficie, estado);
    if (!perfil || !perfil.curriculoCompleto) {
        return [
            "## Perfil do aluno",
            "O aluno ainda não enviou o histórico acadêmico, então não há dados dele. Se a pergunta depender",
            "do histórico (créditos, o que falta, plano, grade), oriente a enviar o histórico na tela de upload.",
            "",
            estadoTxt,
        ].join("\n");
    }

    const montar = (maxConcluidas: number, maxPendentes: number): string => {
        const i = perfil.integralizacao;
        const linhas: string[] = [
            "## Perfil do aluno (dados reais do banco — use antes de chamar tool)",
            `- Curso: ${perfil.curso ?? "não informado"} | Matriz: ${perfil.curriculoCompleto}`,
            `- Semestre atual: ${perfil.semestreAtual}º | Período letivo: ${perfil.periodoAtivo}`,
            `- IRA: ${perfil.ira ?? "não informado"} | Integralização por horas: ${i.percentualPorHoras}%`,
            `- Horas: total ${horas(i.feitas.total, i.exigidas.total)}; obrigatória ${horas(i.feitas.obrigatoria, i.exigidas.obrigatoria)}; optativa ${horas(i.feitas.optativa, i.exigidas.optativa)}; módulo livre/complementar ${horas(i.feitas.complementar, i.exigidas.complementar)}`,
        ];

        const emCurso = perfil.emCurso.map((m) => {
            const turma = m.turma ? ` turma ${m.turma}` : "";
            const prof = m.professor ? ` (${m.professor})` : "";
            return `${m.codigo}${m.nome ? ` ${m.nome}` : ""}${turma}${prof}`;
        });
        linhas.push(`- Em curso agora (matrícula real; nunca troque a turma): ${lista(emCurso, 12)}`);
        linhas.push(
            `- Concluídas (${perfil.concluidas.length}; nunca recomende de novo): ${lista(perfil.concluidas, maxConcluidas)}`
        );
        const pendentes = perfil.pendentesDesbloqueadas.map((m) => `${m.codigo} ${m.nome} (nível ${m.nivel}, ${m.creditos}cr)`);
        linhas.push(`- Obrigatórias já liberadas para cursar: ${lista(pendentes, maxPendentes)}`);

        if (perfil.plano) {
            const p = perfil.plano;
            linhas.push(
                `- Plano de formatura: ${p.semestresRestantes} semestres restantes, formatura estimada ${p.formaturaEstimada ?? "sem estimativa"}`
            );
            linhas.push(
                `- Próximo semestre recomendado pelo plano: ${lista(p.proximoSemestre.map((m) => `${m.codigo} ${m.nome}`), 10)}`
            );
            if (p.materiasCriticas.length > 0) linhas.push(`- Matérias críticas (travam a formatura): ${lista(p.materiasCriticas, 10)}`);
            if (p.materiasNaoAlocadas.length > 0) linhas.push(`- Não couberam no plano: ${lista(p.materiasNaoAlocadas, 10)}`);
        } else {
            linhas.push("- Plano de formatura: não foi possível gerar agora (use consultar_plano se precisar)");
        }

        const pr = perfil.preferencias;
        linhas.push(
            `- Preferências: até ${pr.limiteCreditos} créditos/semestre, objetivo ${pr.objetivo}, ${pr.trabalha ? "trabalha/estagia" : "não trabalha"}`
        );
        const r = perfil.restricoes;
        if (r.adiar.length + r.priorizar.length + r.adicionar.length > 0) {
            linhas.push(
                `- Restrições do plano: adiar ${lista(r.adiar, 10)}; priorizar ${lista(r.priorizar, 10)}; optativas adicionadas ${lista(r.adicionar, 10)}`
            );
        }
        if (perfil.preferenciasGrade.length > 0) {
            const pg = perfil.preferenciasGrade.map(
                (p) => `${p.codigo}${p.turnos.length ? ` turnos ${p.turnos.join("")}` : ""}${p.docente ? ` prof. ${p.docente}` : ""}`
            );
            linhas.push(`- Preferências de turma salvas: ${lista(pg, 10)}`);
        }

        linhas.push("", estadoTxt);
        return linhas.join("\n");
    };

    // Encolhe primeiro as listas mais longas; o corte bruto é a última rede.
    for (const [c, p] of [[200, 25], [80, 15], [30, 10], [10, 5]] as const) {
        const texto = montar(c, p);
        if (texto.length <= teto) return texto;
    }
    return montar(5, 3).slice(0, teto);
}
