/**
 * Contexto compartilhado do agente conversacional (planejador + assistente).
 *
 * Tipos e helpers que as tools e o loop de conversa consomem. Extraído de
 * planejador_agente.service.ts para permitir que os dois chats (aba Planejamento
 * e aba Assistente) reusem o mesmo Tool Registry.
 *
 * Design: docs/chat-agente-planejador-spec.md
 */

import { gerarPlanoCompletov2 } from "../plano_formatura.service";
import type {
    MateriaInput,
    PlanoFormaturav2,
    PreferenciasPlano,
    MateriaPlano,
} from "../../types/planejamento";
import type { LlmUsage } from "../../utils/ai_usage_logger";

// =========================================================
// Tipos Públicos
// =========================================================

export interface MensagemChat {
    role: "user" | "assistant";
    content: string;
}

export interface RestricoesPlanoInternas {
    adiar: string[];
    priorizar: string[];
    limitesPersonalizados: Record<number, number>;
    /** Optativas que o aluno escolheu adicionar ao plano (codigos normalizados). */
    adicionar: string[];
    /** Semestre escolhido por optativa adicionada (codigo -> indice no plano). */
    adicionarEm: Record<string, number>;
}

/**
 * Contexto do agente — materiais para regenerar plano com restrições atualizadas.
 *
 * Os campos de plano (`materias`, `idCurso`, cargas, `codigosComOferta`) são
 * OPCIONAIS: a aba Assistente sem login/plano usa um contexto "leve" e o registry
 * esconde as tools que dependem de plano (ver `hasPlanoContext`).
 */
export interface AgenteContexto {
    materias: MateriaInput[];
    cargaHorariaIntegralizada: any;
    exigidaMatriz: any;
    fluxogramaAtual: string | null | undefined;
    idUser: string;
    idCurso: string;
    numeroPeriodo: number;
    preferencias: PreferenciasPlano;
    restricoes: RestricoesPlanoInternas;
    codigosComOferta: Set<string>;
    /**
     * Quando true, tools de recomendação (buscar_materias_unb) devolvem só matérias
     * com turma ofertada no período ativo. Ligado pelo chat embutido no Montador de
     * Grade (body.contexto === 'montador'); o /assistente comum deixa desligado.
     */
    apenasComOferta?: boolean;
}

export interface AgenteResultado {
    reply: string;
    plano?: PlanoFormaturav2;
    restricoes: RestricoesPlanoInternas;
    /** Uso de tokens por chamada ao LLM (tracking de custo no dashboard admin). */
    usage?: LlmUsage[];
    /**
     * True quando a resposta saiu sem chamar o LLM (comando direto, ex.
     * `/turmas COD`): não é uso de IA — não loga em ai_usage_log nem gasta cota.
     */
    semLlm?: boolean;
}

export interface LlmMessage {
    role: string;
    content: string | null;
    tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
    }>;
}

export type ChamarLlmFn = (
    messages: any[],
    tools: any[]
) => Promise<LlmMessage>;

// =========================================================
// Helpers compartilhados
// =========================================================

export function norm(codigo: string): string {
    return (codigo || "").trim().toUpperCase();
}

/**
 * O contexto tem um plano de formatura utilizável? (aluno logado com currículo
 * e matérias faltantes). As tools que geram/mutam plano só aparecem quando true.
 */
export function hasPlanoContext(ctx: AgenteContexto): boolean {
    return Array.isArray(ctx.materias) && ctx.materias.length > 0 && !!ctx.idCurso;
}

/**
 * Contexto "leve" — sem plano de formatura. Usado pela aba Assistente quando o
 * aluno não está logado ou não tem plano: `hasPlanoContext` retorna false e o
 * registry expõe só as tools genéricas.
 */
export function criarContextoLeve(idUser: string = ""): AgenteContexto {
    return {
        materias: [],
        cargaHorariaIntegralizada: { total: 0, obrigatoria: 0, optativa: 0, complementar: 0 },
        exigidaMatriz: { total: 0, obrigatoria: 0, optativa: 0, complementar: 0 },
        fluxogramaAtual: null,
        idUser,
        idCurso: "",
        numeroPeriodo: 0,
        preferencias: { limiteCreditos: 24, objetivo: "equilibrado", trabalha: false },
        restricoes: { adiar: [], priorizar: [], limitesPersonalizados: {}, adicionar: [], adicionarEm: {} },
        codigosComOferta: new Set(),
    };
}

export function gerarPlanoDoContexto(ctx: AgenteContexto): PlanoFormaturav2 {
    return gerarPlanoCompletov2(
        ctx.idUser,
        ctx.idCurso,
        ctx.numeroPeriodo,
        ctx.cargaHorariaIntegralizada,
        ctx.exigidaMatriz,
        ctx.fluxogramaAtual,
        ctx.materias,
        {
            ...ctx.preferencias,
            restricoes: {
                adiar: ctx.restricoes.adiar,
                priorizar: ctx.restricoes.priorizar,
                limitesPersonalizados: ctx.restricoes.limitesPersonalizados,
                adicionar: ctx.restricoes.adicionar,
                adicionarEm: ctx.restricoes.adicionarEm,
            },
        },
        ctx.codigosComOferta
    );
}

export function resumoDoPlano(plano: PlanoFormaturav2, ctx: AgenteContexto): Record<string, any> {
    const criticas = plano.plano
        .flatMap((s) => s.materias)
        .filter((m) => "critica" in m && (m as MateriaPlano).critica)
        .map((m) => (m as MateriaPlano).codigo);

    // Créditos/horas restantes AUTORITATIVOS (degree audit): vêm direto de
    // matrizes.ch_total_exigida − dados_users.carga_horaria_integralizada.total.
    // Exposto pronto para o LLM NÃO reconstruir somando cargaPorSemestre na mão.
    // ch_* está em horas; créditos = horas ÷ 15 (padrão UnB).
    const exig = ctx.exigidaMatriz || {};
    const integ = ctx.cargaHorariaIntegralizada || {};
    const chRestanteTotalHoras = Math.max(0, Number(exig.total || 0) - Number(integ.total || 0));

    // Optativas que o aluno adicionou e onde cada uma caiu no plano — sem isto o
    // modelo respondia "nenhuma optativa adicionada" mesmo com o plano cheio delas.
    const optativasAdicionadas = ctx.restricoes.adicionar.map((cod) => {
        const sem = plano.plano.find((s) =>
            s.materias.some((m) => "codigo" in m && norm((m as MateriaPlano).codigo) === cod)
        );
        const mat = sem?.materias.find(
            (m) => "codigo" in m && norm((m as MateriaPlano).codigo) === cod
        ) as MateriaPlano | undefined;
        return {
            codigo: cod,
            nome: mat?.nome ?? null,
            semestreIndice: sem?.indice ?? null,
            semestreLabel: sem?.semestre ?? null,
        };
    });

    // Horas de optativas reservadas como SLOTS genéricos: espaço garantido no
    // plano, mas o aluno ainda não escolheu as matérias — pendência real.
    const chOptativaReservadaEmSlots = plano.plano
        .flatMap((s) => s.materias)
        .filter((m) => "tipo" in m && (m as { tipo?: string }).tipo === "optativa_slot")
        .reduce((acc, m) => acc + (Number((m as { ch?: number }).ch) || 0), 0);

    return {
        semestresRestantes: plano.semestresRestantes,
        formaturaEstimada: plano.formaturaEstimada ?? null,
        materiasCriticas: criticas,
        materiasNaoAlocadas: plano.materiasNaoAlocadas,
        optativasAdicionadas,
        chOptativaReservadaEmSlots,
        creditosRestantesTotais: Math.ceil(chRestanteTotalHoras / 15),
        chRestanteTotalHoras,
        chObrigatoriaFaltante: plano.chObrigatoriaFaltante,
        chOptativaFaltante: plano.chOptativaFaltante,
        chComplementarFaltante: plano.chComplementarFaltante,
        cargaPorSemestre: plano.plano.map((s) => ({
            indice: s.indice,
            numeroSemestre: ctx.numeroPeriodo + s.indice + 1,
            semestreLabel: s.semestre,
            creditos: s.creditos,
        })),
    };
}
