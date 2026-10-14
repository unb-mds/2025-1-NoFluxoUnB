/**
 * Estado do Montador de Grade persistido por aluno + período (tabela
 * `grade_montador`): as abas/cenários, o pool e as preferências da tela.
 *
 * Os limites vivem AQUI (servidor), não só na tela — o banco é gratuito e finito:
 * no máximo MAX_CENARIOS cenários e MAX_BYTES por estado. Períodos além de "atual +
 * anterior" são só sinalizados (`periodosParaApagar`); quem apaga é o aluno.
 */
import { SupabaseWrapper } from "../../supabase_wrapper";

export const MAX_CENARIOS = 6;
export const MAX_BYTES = 8 * 1024;
const MAX_POOL = 200;
const MAX_NOME = 40;
const ORIGENS = ["usuario", "opcao-solver", "darcy"] as const;
const TURNOS = ["M", "T", "N"] as const;
const RE_PERIODO = /^\d{4}\.[1-4]$/;
const RE_CODIGO = /^[A-Z0-9]{3,12}$/;

export type OrigemCenario = (typeof ORIGENS)[number];

export interface CenarioPersistido {
    id: string;
    nome: string;
    selecao: Record<string, number>;
    origem: OrigemCenario;
}

export interface EstadoGrade {
    grades: CenarioPersistido[];
    activeId: string | null;
    pool: string[];
    prioritarias: string[];
    turnos: Array<(typeof TURNOS)[number]>;
    dispensadas: string[];
    incluirCursando: boolean;
}

export type ResultadoValidacao = { ok: true; estado: EstadoGrade } | { ok: false; status: 400 | 413; erro: string };

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function codigos(v: unknown, max: number): string[] | null {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > max) return null;
    const out: string[] = [];
    for (const c of v) {
        if (typeof c !== "string") return null;
        const cod = c.trim().toUpperCase();
        if (!RE_CODIGO.test(cod)) return null;
        if (!out.includes(cod)) out.push(cod);
    }
    return out;
}

/** Valida e NORMALIZA o que o cliente mandou. Nunca confia no formato do localStorage. */
export function validarEstadoGrade(bruto: unknown): ResultadoValidacao {
    const falha = (erro: string, status: 400 | 413 = 400): ResultadoValidacao => ({ ok: false, status, erro });
    if (!ehObjeto(bruto)) return falha("estado inválido");

    if (!Array.isArray(bruto.grades)) return falha("grades inválido");
    if (bruto.grades.length > MAX_CENARIOS) {
        return falha(`Limite de ${MAX_CENARIOS} grades por semestre. Apague uma para criar outra.`);
    }
    const grades: CenarioPersistido[] = [];
    const ids = new Set<string>();
    for (const g of bruto.grades) {
        if (!ehObjeto(g) || typeof g.id !== "string" || !g.id || g.id.length > 64) return falha("cenário inválido");
        if (ids.has(g.id)) return falha("cenário duplicado");
        ids.add(g.id);
        const nome = typeof g.nome === "string" ? g.nome.trim().slice(0, MAX_NOME) : "";
        if (!ehObjeto(g.selecao)) return falha("seleção inválida");
        const selecao: Record<string, number> = {};
        for (const [cod, idTurma] of Object.entries(g.selecao)) {
            const c = cod.trim().toUpperCase();
            if (!RE_CODIGO.test(c) || typeof idTurma !== "number" || !Number.isInteger(idTurma) || idTurma <= 0) {
                return falha("seleção inválida");
            }
            selecao[c] = idTurma;
        }
        const origem = (ORIGENS as readonly unknown[]).includes(g.origem) ? (g.origem as OrigemCenario) : "usuario";
        grades.push({ id: g.id, nome: nome || "Grade", selecao, origem });
    }

    const pool = codigos(bruto.pool, MAX_POOL);
    const prioritarias = codigos(bruto.prioritarias, MAX_POOL);
    // `removidas` é o nome antigo do campo (linhas já gravadas e clientes em cache).
    const dispensadas = codigos(bruto.dispensadas ?? bruto.removidas, MAX_POOL);
    if (!pool || !prioritarias || !dispensadas) return falha("lista de matérias inválida");

    const turnosBrutos = Array.isArray(bruto.turnos) ? bruto.turnos : [...TURNOS];
    const turnos = TURNOS.filter((t) => turnosBrutos.includes(t));

    const activeId =
        typeof bruto.activeId === "string" && ids.has(bruto.activeId) ? bruto.activeId : (grades[0]?.id ?? null);

    const estado: EstadoGrade = {
        grades,
        activeId,
        pool,
        prioritarias,
        turnos: turnos.length > 0 ? turnos : [...TURNOS],
        dispensadas,
        incluirCursando: bruto.incluirCursando !== false,
    };
    if (Buffer.byteLength(JSON.stringify(estado), "utf8") > MAX_BYTES) {
        return falha("Estado da grade grande demais.", 413);
    }
    return { ok: true, estado };
}

export function periodoValido(p: unknown): p is string {
    return typeof p === "string" && RE_PERIODO.test(p);
}

/** "2026.1" → "2025.2"; "2026.2" → "2026.1" (a UnB usa .1 e .2; .3/.4 são verão). */
export function periodoAnterior(p: string): string {
    const [ano, sem] = p.split(".").map(Number);
    return sem > 1 ? `${ano}.${sem - 1}` : `${ano - 1}.2`;
}

/**
 * Períodos fora da regra "atual + anterior". NADA é apagado automaticamente: o app só
 * oferece baixar/apagar (diálogo de troca de semestre) e o aluno decide.
 */
export function periodosParaApagar(existentes: string[], atual: string): string[] {
    const manter = new Set([atual, periodoAnterior(atual)]);
    return existentes.filter((p) => periodoValido(p) && !manter.has(p) && p < atual);
}

export type ResultadoSalvar =
    | { ok: true; versao: number }
    | { ok: false; conflito: true; estado: EstadoGrade; versao: number }
    | { ok: false; conflito?: false; status: number; erro: string };

export async function lerEstadoGrade(
    idUser: string | number,
    periodo: string
): Promise<{ estado: EstadoGrade; versao: number } | null> {
    const { data, error } = await SupabaseWrapper.get()
        .from("grade_montador")
        .select("estado, versao")
        .eq("id_user", idUser)
        .eq("ano_periodo", periodo)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    // O que está no banco já passou por `validarEstadoGrade`; revalida por defesa (linha editada à mão).
    const v = validarEstadoGrade((data as any).estado);
    if (!v.ok) return null;
    return { estado: v.estado, versao: Number((data as any).versao) };
}

/**
 * Grava com concorrência otimista. `versaoBase` = versão que o cliente leu (0 = nunca leu /
 * linha nova). Conflito devolve o estado do servidor para o cliente reconciliar.
 */
export async function salvarEstadoGrade(
    idUser: string | number,
    periodo: string,
    estado: EstadoGrade,
    versaoBase: number
): Promise<ResultadoSalvar> {
    const db = SupabaseWrapper.get();
    const atual = await lerEstadoGrade(idUser, periodo);

    if (!atual) {
        const { error } = await db
            .from("grade_montador")
            .insert({ id_user: idUser, ano_periodo: periodo, estado, versao: 1 });
        if (error) {
            // Corrida: outra aba inseriu entre a leitura e o insert.
            const agora = await lerEstadoGrade(idUser, periodo);
            if (agora) return { ok: false, conflito: true, estado: agora.estado, versao: agora.versao };
            return { ok: false, status: 500, erro: error.message };
        }
        return { ok: true, versao: 1 };
    }

    if (atual.versao !== versaoBase) {
        return { ok: false, conflito: true, estado: atual.estado, versao: atual.versao };
    }
    const { data, error } = await db
        .from("grade_montador")
        .update({ estado, versao: atual.versao + 1, updated_at: new Date().toISOString() })
        .eq("id_user", idUser)
        .eq("ano_periodo", periodo)
        .eq("versao", atual.versao)
        .select("versao");
    if (error) return { ok: false, status: 500, erro: error.message };
    if (!data || data.length === 0) {
        const agora = await lerEstadoGrade(idUser, periodo);
        if (agora) return { ok: false, conflito: true, estado: agora.estado, versao: agora.versao };
        return { ok: false, status: 500, erro: "Falha ao salvar a grade." };
    }
    return { ok: true, versao: atual.versao + 1 };
}

/** Quais períodos o aluno tem salvos (para o diálogo de troca de semestre). */
export async function listarPeriodosGrade(
    idUser: string | number
): Promise<Array<{ periodo: string; cenarios: number }>> {
    const { data, error } = await SupabaseWrapper.get()
        .from("grade_montador")
        .select("ano_periodo, estado")
        .eq("id_user", idUser);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[])
        .map((r) => ({
            periodo: String(r.ano_periodo),
            cenarios: Array.isArray(r.estado?.grades) ? r.estado.grades.length : 0,
        }))
        .sort((a, b) => (a.periodo < b.periodo ? 1 : -1));
}

export async function apagarPeriodoGrade(idUser: string | number, periodo: string): Promise<void> {
    const { error } = await SupabaseWrapper.get()
        .from("grade_montador")
        .delete()
        .eq("id_user", idUser)
        .eq("ano_periodo", periodo);
    if (error) throw new Error(error.message);
}
