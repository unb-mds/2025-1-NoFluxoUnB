/**
 * Superfície da Darcy única — em que tela o aluno está conversando e o estado
 * dela naquele momento. É o ÚNICO dado sobre o aluno que vem do cliente: tudo o
 * mais (currículo, concluídas, preferências) o backend lê do banco.
 *
 * Contrato do `POST /chat/send` — ver docs/darcy-unificada.md.
 */

export type Superficie = "assistente" | "plano" | "montador";
export type Turno = "M" | "T" | "N";

export interface EstadoMontador {
    tipo: "montador";
    /** Grade aberta na tela: matéria → turma escolhida. */
    grade: Array<{ codigo: string; idTurma: number }>;
    creditos: number;
    turnos: Turno[];
    incluirCursando: boolean;
    /** freeMask (bigint de 96 bits) serializado em string decimal. */
    horarioLivre: string;
}

export interface EstadoPlano {
    tipo: "plano";
    semestreFoco?: number;
}

export interface EstadoAssistente {
    tipo: "assistente";
}

export type EstadoSuperficie = EstadoMontador | EstadoPlano | EstadoAssistente;

export interface CorpoChat {
    message: string;
    superficie: Superficie;
    estado: EstadoSuperficie;
}

const SUPERFICIES: ReadonlySet<string> = new Set(["assistente", "plano", "montador"]);
const TURNOS: ReadonlySet<string> = new Set(["M", "T", "N"]);

/** Semana inteira livre (96 slots) — ponto de partida fora do Montador. */
export const MASCARA_SEMANA_LIVRE = ((1n << 96n) - 1n).toString();

function ehObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function horarioLivreValido(v: unknown): string | null {
    if (typeof v !== "string" || !/^\d+$/.test(v.trim())) return null;
    return v.trim();
}

function parseEstadoMontador(raw: Record<string, unknown>): EstadoMontador {
    const grade = Array.isArray(raw.grade)
        ? raw.grade
              .filter(ehObjeto)
              .filter((g) => typeof g.codigo === "string" && Number.isFinite(Number(g.idTurma)))
              .map((g) => ({ codigo: String(g.codigo).trim().toUpperCase(), idTurma: Number(g.idTurma) }))
        : [];
    const turnos = Array.isArray(raw.turnos)
        ? raw.turnos.filter((t): t is Turno => typeof t === "string" && TURNOS.has(t))
        : [];
    return {
        tipo: "montador",
        grade,
        creditos: Number.isFinite(Number(raw.creditos)) ? Number(raw.creditos) : 0,
        turnos,
        incluirCursando: raw.incluirCursando !== false,
        horarioLivre: horarioLivreValido(raw.horarioLivre) ?? MASCARA_SEMANA_LIVRE,
    };
}

/**
 * Lê o body do `/chat/send`. Aceita o formato novo (`superficie` + `estado`) e,
 * na transição, o antigo do chat do Montador (`contexto:'montador'`,
 * `horarioLivre`, `codigosNaGrade`), mapeado para `superficie:'montador'`.
 * `curriculoCompleto`/`planoInput` do cliente são ignorados de propósito.
 *
 * Devolve `{ error }` quando falta a mensagem.
 */
export function parseCorpoChat(body: unknown): CorpoChat | { error: string } {
    const b = ehObjeto(body) ? body : {};
    const message = typeof b.message === "string" ? b.message.trim() : "";
    if (!message) return { error: "O campo 'message' é obrigatório." };

    if (typeof b.superficie === "string" && SUPERFICIES.has(b.superficie)) {
        const superficie = b.superficie as Superficie;
        const estadoRaw = ehObjeto(b.estado) ? b.estado : {};
        if (superficie === "montador") return { message, superficie, estado: parseEstadoMontador(estadoRaw) };
        if (superficie === "plano") {
            const foco = Number(estadoRaw.semestreFoco);
            return {
                message,
                superficie,
                estado: { tipo: "plano", ...(Number.isFinite(foco) && foco >= 0 ? { semestreFoco: Math.floor(foco) } : {}) },
            };
        }
        return { message, superficie, estado: { tipo: "assistente" } };
    }

    // Formato antigo (chat do Montador antes da Darcy única).
    if (b.contexto === "montador" || horarioLivreValido(b.horarioLivre)) {
        const grade = Array.isArray(b.codigosNaGrade)
            ? b.codigosNaGrade
                  .filter((c): c is string => typeof c === "string")
                  .map((codigo) => ({ codigo: codigo.trim().toUpperCase(), idTurma: 0 }))
            : [];
        return {
            message,
            superficie: "montador",
            estado: parseEstadoMontador({ grade, turnos: b.turnos, horarioLivre: b.horarioLivre }),
        };
    }

    return { message, superficie: "assistente", estado: { tipo: "assistente" } };
}
