/**
 * Atuador de busca de optativas — Fase 2 do orquestrador de chat
 * (docs/chatbot-orquestrador.md).
 *
 * Isolado e testável sozinho de propósito: o relatório de qualidade apontou um bug
 * de filtro não-funcional na busca de optativas do Darcy legado
 * (src/services/agente/tools/materia_tools.ts, buscarMateriasUnb + filtrarPorOfertaAtiva).
 * Isolar esse caminho aqui — reimplementado, não reexportado, pra não acoplar a este
 * atuador a mudanças no Darcy legado — permite testar o filtro por oferta ativa sem
 * o resto do loop de tool-calling em volta.
 */

import { z } from "zod";
import { Agent, tool } from "@openai/agents";
import { SupabaseWrapper } from "../../../supabase_wrapper";
import { SabiaService } from "../../sabia.service";
import { norm } from "../../agente/context";
import { createMaritacaModel } from "../model_provider";
import { candidatosJaCumpridos, cumpridasDoAluno, filtrarJaCursadas } from "./ja_cumpridas";

// Reexportada: os testes deste atuador a importam daqui.
export { filtrarJaCursadas };

type MateriaBusca = { codigo: string; nome: string; similaridade: number };

const sabia = new SabiaService();

/** Mantém só as matérias com turma ofertada no período letivo ativo. */
export async function filtrarPorOfertaAtiva(materias: MateriaBusca[]): Promise<MateriaBusca[]> {
    const codigos = materias.map((m) => norm(m.codigo)).filter(Boolean);
    if (codigos.length === 0) return [];

    const supabase = SupabaseWrapper.get();
    const { data: periodo } = await supabase.rpc("periodo_letivo_atual");
    if (!periodo) return materias; // sem período conhecido → não filtra

    const { data: mats } = await supabase
        .from("materias")
        .select("id_materia, codigo_materia")
        .in("codigo_materia", codigos);
    const idPorCodigo = new Map<string, number>(
        (mats ?? []).map((m: any) => [norm(m.codigo_materia), Number(m.id_materia)])
    );
    const ids = [...idPorCodigo.values()];
    if (ids.length === 0) return [];

    const { data: turmas } = await supabase
        .from("turmas")
        .select("id_materia")
        .eq("ano_periodo", periodo)
        .in("id_materia", ids);
    const idsComOferta = new Set<number>((turmas ?? []).map((t: any) => Number(t.id_materia)));

    return materias.filter((m) => {
        const id = idPorCodigo.get(norm(m.codigo));
        return id != null && idsComOferta.has(id);
    });
}

/**
 * Resolve id_matriz a partir do curriculo_completo do aluno. Self-contained, reimplementado
 * aqui espelhando resolveMatriz em PlanejamentoController.ts (~linhas 562-606) — só que aqui
 * só precisamos do id_matriz, não da linha inteira. Não reexportado de lá pra não acoplar
 * este atuador a mudanças no controller. Nunca lança; degrada pra null em qualquer
 * erro/ausência (chamador trata null como "não filtra por matriz").
 */
async function resolveIdMatriz(curriculoCompleto: string): Promise<number | null> {
    const cc = curriculoCompleto.trim();
    if (!cc) return null;
    try {
        const supabase = SupabaseWrapper.get();

        // Tenta match exato primeiro.
        const { data: exato } = await supabase
            .from("matrizes")
            .select("id_matriz")
            .eq("curriculo_completo", cc)
            .maybeSingle();
        if (exato?.id_matriz != null) return Number(exato.id_matriz);

        // Fallback: prefixo (ex: "8117/-2" -> "8117/-2 - 2018.2").
        if (cc.includes("/")) {
            const prefix = cc.split(" - ")[0]?.trim() ?? cc;
            const { data: rows } = await supabase
                .from("matrizes")
                .select("id_matriz, curriculo_completo")
                .like("curriculo_completo", prefix + "%")
                .order("curriculo_completo")
                .limit(1);
            if (rows && rows.length > 0) return Number(rows[0].id_matriz);
        }
    } catch {
        // Degrada: matriz não resolvida, busca segue sem restrição.
    }
    return null;
}

/**
 * Códigos das optativas (tipo_natureza = 1) cadastradas na matriz do aluno. Dois passos,
 * igual ao padrão de filtrarPorOfertaAtiva acima: id_materia em materias_por_curso,
 * depois codigo_materia em materias. Degrada pra null (= "não filtra") em qualquer erro —
 * nunca derruba a busca. Set vazio (matriz sem optativa cadastrada) é um resultado válido,
 * diferente de null — quem decide se isso conta como "dado incompleto" é o chamador.
 */
async function optativasDaMatriz(idMatriz: number): Promise<Set<string> | null> {
    try {
        const supabase = SupabaseWrapper.get();
        const { data: mpc } = await supabase
            .from("materias_por_curso")
            .select("id_materia")
            .eq("id_matriz", idMatriz)
            .eq("tipo_natureza", 1);
        const ids = (mpc ?? []).map((m: any) => Number(m.id_materia));
        if (ids.length === 0) return new Set<string>();

        const { data: mats } = await supabase
            .from("materias")
            .select("codigo_materia")
            .in("id_materia", ids);
        return new Set<string>((mats ?? []).map((m: any) => norm(m.codigo_materia)));
    } catch {
        return null;
    }
}

export async function buscarOptativas(
    termosBusca: string[],
    apenasComOferta: boolean,
    /**
     * E-mail do aluno. Quando presente, o resultado exclui o que ele já cursou —
     * sem isso a busca semântica sugeria matéria já aprovada (ex.: CIC0004 aparecendo
     * numa busca por "algoritmos" pra quem passou nela). Ausente = chat deslogado.
     */
    email?: string,
    /**
     * curriculo_completo da matriz do aluno. Quando presente, o resultado é restrito às
     * optativas cadastradas nessa matriz — sem isso a busca semântica varre o catálogo
     * inteiro da UnB (~26k linhas) e pode devolver obrigatória de outro curso, rotulada
     * como "optativa". Ausente = chat deslogado ou matriz desconhecida.
     */
    curriculoCompleto?: string
): Promise<string> {
    if (termosBusca.length === 0) {
        return JSON.stringify({ erro: "Informe ao menos um termo de busca." });
    }

    let materias = await sabia.buscarMaterias(termosBusca);

    if (apenasComOferta && materias.length > 0) {
        materias = await filtrarPorOfertaAtiva(materias);
    }

    // Filtra pelas optativas DA MATRIZ do aluno. Degrada sempre pra "não filtra": sem
    // curriculoCompleto, matriz não resolvida, matriz sem optativa cadastrada (dado
    // incompleto, não filtro real — filtrar tudo seria pior que não filtrar) ou
    // qualquer erro de banco. Roda antes do filtro de já-cursadas (mesma posição que
    // apenasComOferta já ocupa hoje) pra que, se o de já-cursadas for o que esvaziar o
    // que sobrou, o aviso dele continue prevalecendo naturalmente.
    let filtrouPorMatriz = false;
    if (curriculoCompleto && materias.length > 0) {
        const idMatriz = await resolveIdMatriz(curriculoCompleto);
        if (idMatriz != null) {
            const optativasSet = await optativasDaMatriz(idMatriz);
            if (optativasSet && optativasSet.size > 0) {
                const antes = materias.length;
                materias = materias.filter((m) => optativasSet.has(norm(m.codigo)));
                filtrouPorMatriz = materias.length < antes;
            }
        }
    }

    let filtrouPorHistorico = false;
    if (email && materias.length > 0) {
        const cumpridas = await cumpridasDoAluno(email);
        const jaCumpridos = await candidatosJaCumpridos(
            materias.map((m) => m.codigo),
            cumpridas
        );
        if (jaCumpridos.size > 0) {
            const antes = materias.length;
            materias = filtrarJaCursadas(materias, jaCumpridos);
            filtrouPorHistorico = materias.length < antes;
        }
    }

    if (materias.length === 0) {
        return JSON.stringify({
            aviso: filtrouPorHistorico
                ? "As optativas encontradas sobre esse tema você já cursou (ou está cursando)."
                : filtrouPorMatriz
                  ? "As optativas encontradas sobre esse tema não fazem parte da sua matriz."
                  : apenasComOferta
                    ? "Nenhuma optativa sobre esse tema tem turma ofertada no período atual."
                    : "Nenhuma optativa encontrada para esse tema.",
            materias: [],
        });
    }
    return JSON.stringify({ materias });
}

export function createOptativasAgent(
    apenasComOferta: boolean = false,
    email?: string,
    curriculoCompleto?: string
): Agent {
    const buscarOptativasTool = tool({
        name: "buscar_optativas",
        description:
            "Busca disciplinas optativas da UnB por tema/assunto usando busca semântica (embeddings).",
        parameters: z.object({
            termos_busca: z
                .array(z.string())
                .min(1)
                .max(4)
                .describe("1 a 4 termos sobre o assunto (termo principal + sinônimos)."),
        }),
        execute: async ({ termos_busca }) =>
            buscarOptativas(termos_busca, apenasComOferta, email, curriculoCompleto),
    });

    return new Agent({
        name: "AtuadorOptativas",
        instructions:
            "Você responde SOMENTE perguntas sobre buscar/sugerir disciplinas optativas por tema ou assunto. " +
            "Sempre use a tool buscar_optativas. Responda em português brasileiro, listando código e nome das " +
            "disciplinas encontradas. A tool já exclui o que o aluno cursou — nunca reintroduza um código que " +
            "não veio dela, e se vier só o campo 'aviso', repasse o aviso sem inventar sugestão.",
        model: createMaritacaModel(),
        tools: [buscarOptativasTool],
    });
}
