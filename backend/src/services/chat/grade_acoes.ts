/**
 * Ações da Darcy sobre a grade aberta no Montador (Fase 3 do plano do chat).
 *
 * A Darcy NÃO mexe na grade sozinha: a tool `propor_mudancas_grade` valida cada
 * ação contra a grade real (turma existe, é da matéria certa, não colide de
 * horário) e o que passar vira `acoesGrade` na resposta do `/chat/send`. O app
 * desenha um card de diff e só aplica no clique do aluno (com "Desfazer").
 *
 * `analisar_turmas_na_grade` responde "por que X não cabe?" / "tem outra turma de
 * X que encaixa?": para cada turma da matéria, com quem ela colide na grade atual.
 *
 * Contrato em `docs/darcy-unificada.md` ("Ações sobre a grade").
 */

import { tool } from "@openai/agents";
import { z } from "zod";
import { SupabaseWrapper } from "../../supabase_wrapper";
import { norm } from "../agente/context";
import { marcadorTurma } from "../agente/tools/materia_tools";
import { hasConflict, slotMaskFromHorario, turmaRespeitaTurnos, type Turno } from "../../utils/horario_slots";
import type { EstadoMontador } from "./superficie";

// ─── Contrato ────────────────────────────────────────────────────────────────

/** Turma e horário da turma escolhida — só para o card do app mostrar o diff. */
interface ExibicaoTurma {
    turma?: string;
    horario?: string | null;
}

export type AcaoGrade =
    | ({ tipo: "adicionar"; codigo: string; idTurma?: number } & ExibicaoTurma)
    | { tipo: "remover"; codigo: string }
    | ({ tipo: "trocarTurma"; codigo: string; idTurma: number } & ExibicaoTurma)
    | { tipo: "priorizar"; codigo: string }
    | { tipo: "turnos"; turnos: Turno[] }
    | { tipo: "criarCenario"; nome: string }
    | { tipo: "limpar" };

/** Turma com o que a validação e o card precisam. */
export interface TurmaInfo {
    idTurma: number;
    codigo: string;
    turma: string;
    docente: string | null;
    horario: string | null;
    vagasSobrando: number | null;
}

export interface ResultadoSimulacao {
    /** Ações que passaram, na ordem — é o que vai para o app. */
    aceitas: AcaoGrade[];
    rejeitadas: Array<{ acao: AcaoGrade; motivo: string }>;
    /** Grade como ficaria depois das aceitas (código → turma). */
    gradeFinal: TurmaInfo[];
}

// ─── Validação (pura) ────────────────────────────────────────────────────────

const TURNOS: ReadonlySet<string> = new Set(["M", "T", "N"]);

/** Quem na grade colide com `alvo` (ignorando a própria matéria). */
export function colisoes(alvo: TurmaInfo, grade: Iterable<TurmaInfo>): string[] {
    const mask = slotMaskFromHorario(alvo.horario);
    if (mask === 0n) return [];
    const out: string[] = [];
    for (const t of grade) {
        if (t.codigo === alvo.codigo) continue;
        if (hasConflict(mask, slotMaskFromHorario(t.horario))) out.push(t.codigo);
    }
    return out;
}

/**
 * Aplica as ações em sequência numa cópia da grade e devolve o que passou.
 * Uma ação rejeitada não derruba as outras (o aluno vê o motivo no texto).
 */
export function simularAcoes(
    gradeAtual: readonly TurmaInfo[],
    pool: readonly string[],
    acoes: readonly AcaoGrade[],
    turmasPorId: ReadonlyMap<number, TurmaInfo>
): ResultadoSimulacao {
    const grade = new Map(gradeAtual.map((t) => [t.codigo, t]));
    const naLista = new Set([...pool, ...grade.keys()]);
    const aceitas: AcaoGrade[] = [];
    const rejeitadas: ResultadoSimulacao["rejeitadas"] = [];
    const rejeitar = (acao: AcaoGrade, motivo: string) => rejeitadas.push({ acao, motivo });

    /** Turma `idTurma` existe, é de `codigo` e cabe na grade? Devolve o motivo se não. */
    const checarTurma = (codigo: string, idTurma: number): TurmaInfo | string => {
        const t = turmasPorId.get(idTurma);
        if (!t) return `turma ${idTurma} não existe neste período`;
        if (t.codigo !== codigo) return `a turma ${idTurma} é de ${t.codigo}, não de ${codigo}`;
        const colide = colisoes(t, grade.values());
        if (colide.length > 0) return `turma ${t.turma} de ${codigo} colide com ${colide.join(", ")}`;
        return t;
    };

    for (const bruta of acoes) {
        const acao = normalizarAcao(bruta);
        if (!acao) {
            rejeitar(bruta, "ação malformada");
            continue;
        }
        switch (acao.tipo) {
            case "adicionar": {
                if (grade.has(acao.codigo)) {
                    rejeitar(acao, `${acao.codigo} já está na grade`);
                    break;
                }
                if (acao.idTurma === undefined) {
                    naLista.add(acao.codigo);
                    aceitas.push(acao);
                    break;
                }
                const r = checarTurma(acao.codigo, acao.idTurma);
                if (typeof r === "string") rejeitar(acao, r);
                else {
                    grade.set(acao.codigo, r);
                    naLista.add(acao.codigo);
                    aceitas.push({ ...acao, turma: r.turma, horario: r.horario });
                }
                break;
            }
            case "trocarTurma": {
                const atual = grade.get(acao.codigo);
                if (!atual) {
                    rejeitar(acao, `${acao.codigo} não está na grade (use adicionar)`);
                    break;
                }
                if (atual.idTurma === acao.idTurma) {
                    rejeitar(acao, `${acao.codigo} já está nessa turma`);
                    break;
                }
                const r = checarTurma(acao.codigo, acao.idTurma);
                if (typeof r === "string") rejeitar(acao, r);
                else {
                    grade.set(acao.codigo, r);
                    aceitas.push({ ...acao, turma: r.turma, horario: r.horario });
                }
                break;
            }
            case "remover": {
                if (!naLista.has(acao.codigo)) {
                    rejeitar(acao, `${acao.codigo} não está na grade nem na lista`);
                    break;
                }
                grade.delete(acao.codigo);
                naLista.delete(acao.codigo);
                aceitas.push(acao);
                break;
            }
            case "priorizar": {
                if (!naLista.has(acao.codigo)) rejeitar(acao, `${acao.codigo} não está na lista do Montador`);
                else aceitas.push(acao);
                break;
            }
            case "turnos": {
                const fora = [...grade.values()]
                    .filter((t) => !turmaRespeitaTurnos(slotMaskFromHorario(t.horario), new Set(acao.turnos)))
                    .map((t) => t.codigo);
                if (fora.length > 0) {
                    rejeitar(acao, `${fora.join(", ")} têm aula fora desses turnos — remova ou troque de turma antes`);
                } else aceitas.push(acao);
                break;
            }
            case "limpar":
                grade.clear();
                aceitas.push(acao);
                break;
            case "criarCenario":
                aceitas.push(acao);
                break;
        }
    }
    return { aceitas, rejeitadas, gradeFinal: [...grade.values()] };
}

/** Saneia o que o modelo mandou (códigos em maiúsculas, ids inteiros, turnos válidos). */
export function normalizarAcao(a: AcaoGrade): AcaoGrade | null {
    const codigo = "codigo" in a && typeof a.codigo === "string" ? norm(a.codigo) : "";
    const id = "idTurma" in a && a.idTurma !== undefined ? Number(a.idTurma) : undefined;
    const idOk = id === undefined || (Number.isInteger(id) && id > 0);
    switch (a.tipo) {
        case "adicionar":
            return codigo && idOk ? { tipo: "adicionar", codigo, ...(id !== undefined ? { idTurma: id } : {}) } : null;
        case "trocarTurma":
            return codigo && id !== undefined && idOk ? { tipo: "trocarTurma", codigo, idTurma: id } : null;
        case "remover":
        case "priorizar":
            return codigo ? { tipo: a.tipo, codigo } : null;
        case "turnos": {
            const turnos = [...new Set((a.turnos ?? []).filter((t) => TURNOS.has(t)))] as Turno[];
            return turnos.length > 0 ? { tipo: "turnos", turnos } : null;
        }
        case "criarCenario": {
            const nome = String(a.nome ?? "").trim().slice(0, 40);
            return nome ? { tipo: "criarCenario", nome } : null;
        }
        case "limpar":
            return { tipo: "limpar" };
        default:
            return null;
    }
}

// ─── Banco ───────────────────────────────────────────────────────────────────

interface LinhaTurma {
    id_turmas: number;
    id_materia: number;
    turma: string | null;
    docente: string | null;
    horario: string | null;
    local?: string | null;
    vagas_ofertadas?: number | null;
    vagas_ocupadas?: number | null;
    vagas_sobrando: number | null;
    ano_periodo?: string | null;
}

const COLUNAS_TURMA =
    "id_turmas, id_materia, turma, docente, horario, local, vagas_ofertadas, vagas_ocupadas, vagas_sobrando, ano_periodo";

function paraInfo(t: LinhaTurma, codigo: string): TurmaInfo {
    return {
        idTurma: Number(t.id_turmas),
        codigo,
        turma: t.turma ?? "?",
        docente: t.docente,
        horario: t.horario,
        vagasSobrando: t.vagas_sobrando,
    };
}

/** Turmas por id (grade aberta + ids citados pela Darcy), já com o código da matéria. */
export async function carregarTurmasPorIds(ids: readonly number[]): Promise<Map<number, TurmaInfo>> {
    const unicos = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
    if (unicos.length === 0) return new Map();
    const supabase = SupabaseWrapper.get();
    const { data: turmas } = await supabase.from("turmas").select(COLUNAS_TURMA).in("id_turmas", unicos);
    const linhas = (turmas ?? []) as LinhaTurma[];
    const idsMateria = [...new Set(linhas.map((t) => Number(t.id_materia)))];
    const { data: materias } = idsMateria.length
        ? await supabase.from("materias").select("id_materia, codigo_materia").in("id_materia", idsMateria)
        : { data: [] as any[] };
    const codigoPorMateria = new Map<number, string>(
        ((materias ?? []) as any[]).map((m) => [Number(m.id_materia), norm(m.codigo_materia)])
    );
    const out = new Map<number, TurmaInfo>();
    for (const t of linhas) {
        const codigo = codigoPorMateria.get(Number(t.id_materia));
        if (codigo) out.set(Number(t.id_turmas), paraInfo(t, codigo));
    }
    return out;
}

/** Turmas de uma matéria no período (linhas cruas, para card e análise). */
async function carregarTurmasDaMateria(codigo: string, periodo: string): Promise<LinhaTurma[] | null> {
    const supabase = SupabaseWrapper.get();
    const { data: materia } = await supabase
        .from("materias")
        .select("id_materia")
        .eq("codigo_materia", codigo)
        .maybeSingle();
    if (!materia) return null;
    let q = supabase.from("turmas").select(COLUNAS_TURMA).eq("id_materia", (materia as any).id_materia);
    if (periodo) q = q.eq("ano_periodo", periodo);
    const { data } = await q.limit(30);
    return (data ?? []) as LinhaTurma[];
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const esquemaAcao = z.object({
    tipo: z.enum(["adicionar", "remover", "trocarTurma", "priorizar", "turnos", "criarCenario", "limpar"]),
    codigo: z.string().optional().describe("Código da matéria (ABC1234). Obrigatório exceto em turnos/criarCenario/limpar."),
    idTurma: z
        .number()
        .int()
        .optional()
        .describe("id_turmas — obrigatório em trocarTurma; opcional em adicionar (sem ele a matéria só entra na lista)."),
    turnos: z.array(z.enum(["M", "T", "N"])).optional().describe("Só em 'turnos': turnos permitidos."),
    nome: z.string().optional().describe("Só em 'criarCenario': nome do cenário."),
});

/** Esquema plano do zod (o LLM manda campos soltos) → `AcaoGrade` tipada. */
function deEsquema(a: z.infer<typeof esquemaAcao>): AcaoGrade {
    switch (a.tipo) {
        case "adicionar":
            return { tipo: "adicionar", codigo: a.codigo ?? "", ...(a.idTurma !== undefined ? { idTurma: a.idTurma } : {}) };
        case "trocarTurma":
            return { tipo: "trocarTurma", codigo: a.codigo ?? "", idTurma: a.idTurma ?? 0 };
        case "remover":
        case "priorizar":
            return { tipo: a.tipo, codigo: a.codigo ?? "" };
        case "turnos":
            return { tipo: "turnos", turnos: a.turnos ?? [] };
        case "criarCenario":
            return { tipo: "criarCenario", nome: a.nome ?? "" };
        default:
            return { tipo: "limpar" };
    }
}

/** Resposta das tools fora do Montador (sem grade aberta não há o que validar). */
export const SEM_GRADE_ABERTA = JSON.stringify({
    erro: "Essa ação precisa da grade aberta no Montador de Grade. Oriente o aluno a abrir o Montador (ou use montar_grade, que funciona de qualquer tela).",
});

/**
 * As duas tools de ação na grade. Ficam registradas em TODA tela (a Darcy é uma
 * só e a conversa atravessa telas — mesmo conjunto de tools em qualquer
 * superfície); sem `estado` do Montador, respondem `SEM_GRADE_ABERTA`.
 * `registrar` recebe as ações aceitas da última proposta (vira `acoesGrade`).
 */
export function criarToolsAcoesGrade(
    estado: EstadoMontador | null,
    periodoAtivo: string,
    registrar: (acoes: AcaoGrade[]) => void
) {
    const idsDaGrade = estado?.grade.map((g) => g.idTurma) ?? [];

    const propor = tool({
        name: "propor_mudancas_grade",
        description:
            "Propõe mudanças PONTUAIS na grade aberta no Montador (adicionar/remover matéria, trocar turma, priorizar, mudar turnos, criar cenário, limpar). " +
            "Valida cada ação contra a grade real (turma existe, é da matéria, não colide). As aceitas viram um card com 'Aplicar' para o aluno — nada muda sem o clique dele. " +
            "Para rearranjar a grade INTEIRA use montar_grade, não esta.",
        parameters: z.object({ acoes: z.array(esquemaAcao).min(1).max(12) }),
        execute: async ({ acoes }) => {
            if (!estado) return SEM_GRADE_ABERTA;
            const tipadas = acoes.map(deEsquema);
            const idsCitados = tipadas.flatMap((a) => ("idTurma" in a && a.idTurma ? [a.idTurma] : []));
            const turmas = await carregarTurmasPorIds([...idsDaGrade, ...idsCitados]);
            const gradeAtual = estado.grade.flatMap((g) => turmas.get(g.idTurma) ?? []);
            const r = simularAcoes(gradeAtual, estado.pool ?? [], tipadas, turmas);
            registrar(r.aceitas);
            return JSON.stringify({
                aceitas: r.aceitas,
                rejeitadas: r.rejeitadas.map((x) => ({ acao: x.acao, motivo: x.motivo })),
                gradeDepois: r.gradeFinal.map((t) => ({ codigo: t.codigo, turma: t.turma, horario: t.horario })),
                instrucao_llm:
                    r.aceitas.length > 0
                        ? "O app mostra as mudanças aceitas num card com 'Aplicar'/'Descartar'. Diga em 1-2 frases o que muda e por quê; explique cada rejeitada com o motivo real. Não repita a lista de horários."
                        : "Nada foi aceito: explique ao aluno o motivo de cada rejeitada e, se fizer sentido, sugira alternativa (ex.: analisar_turmas_na_grade).",
            });
        },
    });

    const analisar = tool({
        name: "analisar_turmas_na_grade",
        description:
            "Para UMA matéria, lista as turmas do período dizendo quais cabem na grade aberta e, das que não cabem, com quais matérias colidem e se estão fora dos turnos permitidos. " +
            "Use para 'por que X não coube?', 'tem outra turma de X?', 'troca X pra uma turma de manhã'. Também avisa turma lotada.",
        parameters: z.object({ codigo: z.string().describe("Código da matéria (ABC1234).") }),
        execute: async ({ codigo }) => {
            if (!estado) return SEM_GRADE_ABERTA;
            const cod = norm(codigo);
            const linhas = await carregarTurmasDaMateria(cod, periodoAtivo);
            if (linhas === null) return JSON.stringify({ erro: `Matéria ${cod} não encontrada.` });
            if (linhas.length === 0) return JSON.stringify({ codigo: cod, turmas: [], aviso: "Sem turma ofertada neste período." });
            const turmasGrade = await carregarTurmasPorIds(idsDaGrade);
            const grade = [...turmasGrade.values()];
            const turnos = new Set<Turno>(estado.turnos);
            const turmas = linhas.map((l) => {
                const info = paraInfo(l, cod);
                const colideCom = colisoes(info, grade);
                const foraDoTurno = !turmaRespeitaTurnos(slotMaskFromHorario(info.horario), turnos);
                const lotada = l.vagas_sobrando !== null && l.vagas_sobrando <= 0;
                const cabe = colideCom.length === 0 && !foraDoTurno;
                return {
                    idTurma: info.idTurma,
                    turma: info.turma,
                    docente: info.docente,
                    horario: info.horario,
                    cabe,
                    colideCom,
                    foraDoTurno,
                    lotada,
                    ...(cabe
                        ? {
                              marcador: marcadorTurma({
                                  turma: info.turma,
                                  docente: info.docente || "A definir",
                                  horario: info.horario || "?",
                                  local: l.local || "?",
                                  vagas: `${l.vagas_ocupadas ?? "?"}/${l.vagas_ofertadas ?? "?"}`,
                                  periodo: l.ano_periodo || "",
                                  codigo: cod,
                                  idTurma: info.idTurma,
                              }),
                          }
                        : {}),
                };
            });
            return JSON.stringify({
                codigo: cod,
                naGrade: estado.grade.some((g) => g.codigo === cod),
                turmas,
                instrucao_llm:
                    "Explique em poucas palavras quais cabem e, das que não cabem, o motivo real (colide com X / fora do turno). Para as que cabem, copie o 'marcador' literalmente (vira card com 'Usar esta turma'). Turma lotada: avise, mas não esconda.",
            });
        },
    });

    return [propor, analisar];
}
