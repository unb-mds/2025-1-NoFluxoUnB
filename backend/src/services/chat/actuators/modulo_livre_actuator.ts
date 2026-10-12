/**
 * Atuador de busca de módulo livre — extensão do orquestrador de chat
 * (docs/chatbot-orquestrador.md), irmão de optativas_actuator.ts.
 *
 * Módulo livre = qualquer matéria do catálogo da UnB cujo codigo_materia NÃO
 * aparece em materias_por_curso pra id_matriz do aluno, em NENHUMA
 * tipo_natureza (nem obrigatória=0, nem optativa=1). A busca semântica
 * (SabiaService.buscarMaterias) varre o catálogo inteiro, então pode devolver
 * uma matéria que é da matriz do aluno — este atuador filtra isso fora, senão
 * "módulo livre" reapresentaria a própria obrigatória/optativa do curso.
 *
 * Isolado e self-contained de propósito, mesma convenção já estabelecida em
 * optativas_actuator.ts ("reimplementado, não reexportado, pra não acoplar
 * este atuador a mudanças" no arquivo de origem) e em grade_actuator.ts
 * (resolveIdUserPorEmail): norm(), o filtro de oferta ativa e o filtro de
 * já-cursadas são reimplementados aqui em vez de importados de
 * optativas_actuator.ts.
 */

import { z } from "zod";
import { Agent, tool } from "@openai/agents";
import { SupabaseWrapper } from "../../../supabase_wrapper";
import { SabiaService } from "../../sabia.service";
import { createMaritacaModel } from "../model_provider";
import { candidatosJaCumpridos, cumpridasDoAluno, filtrarJaCursadas } from "./ja_cumpridas";

type MateriaBusca = { codigo: string; nome: string; similaridade: number };

const sabia = new SabiaService();

function norm(codigo: string): string {
    return (codigo || "").trim().toUpperCase();
}

interface IdMatrizRow {
    id_matriz: number;
}

/**
 * Resolve id_matriz a partir de curriculoCompleto — mesma lógica de
 * resolveMatriz em PlanejamentoController.ts (match exato, depois fallback
 * por prefixo quando o valor contém "/", ex: "8117/-2" -> "8117/-2 - 2018.2"),
 * reimplementada aqui porque este atuador só precisa do id_matriz, não do
 * resto da linha de matrizes.
 *
 * Nunca lança — degrada pra null em qualquer erro/ausência, mesmo contrato
 * de resolveIdMatriz em optativas_actuator.ts.
 */
async function resolveIdMatriz(curriculoCompleto: string): Promise<number | null> {
    const cc = curriculoCompleto.trim();
    if (!cc) return null;

    try {
        const supabase = SupabaseWrapper.get();

        const { data: exato } = await supabase
            .from("matrizes")
            .select("id_matriz")
            .eq("curriculo_completo", cc)
            .maybeSingle();
        if (exato) return Number((exato as IdMatrizRow).id_matriz);

        if (cc.includes("/")) {
            const prefix = cc.split(" - ")[0]?.trim() ?? cc;
            const { data: rows } = await supabase
                .from("matrizes")
                .select("id_matriz")
                .like("curriculo_completo", prefix + "%")
                .order("curriculo_completo")
                .limit(1);
            if (rows && rows.length > 0) return Number((rows[0] as IdMatrizRow).id_matriz);
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Todos os códigos que pertencem à matriz do aluno — obrigatórias E
 * optativas juntas (as DUAS naturezas de materias_por_curso, sem filtro de
 * tipo_natureza desta vez): módulo livre é definido por exclusão TOTAL da
 * matriz, não só das obrigatórias. Mesmo padrão de dois passos (vínculo ->
 * materias) usado em filtrarPorOfertaAtiva de optativas_actuator.ts.
 *
 * Propositalmente NÃO degrada pra Set vazio em erro — diferente do resto do
 * arquivo. Um Set vazio aqui faria a exclusão de módulo livre não excluir
 * nada, deixando escapar obrigatória/optativa da própria matriz do aluno
 * como se fosse módulo livre. Deixa a exceção propagar; buscarModuloLivre
 * trata isso devolvendo o erro padrão em vez de seguir com um filtro
 * indefinido.
 */
async function codigosDaMatriz(idMatriz: number): Promise<Set<string>> {
    const supabase = SupabaseWrapper.get();
    const { data: vinculos } = await supabase
        .from("materias_por_curso")
        .select("id_materia")
        .eq("id_matriz", idMatriz);

    const idsMaterias = [...new Set((vinculos ?? []).map((v: any) => Number(v.id_materia)))];
    if (idsMaterias.length === 0) return new Set();

    const { data: mats } = await supabase
        .from("materias")
        .select("id_materia, codigo_materia")
        .in("id_materia", idsMaterias);

    return new Set((mats ?? []).map((m: any) => norm(m.codigo_materia)));
}

/** Mantém só as matérias com turma ofertada no período letivo ativo. */
async function filtrarPorOfertaAtiva(materias: MateriaBusca[]): Promise<MateriaBusca[]> {
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
 * O que a busca de módulo livre encontrou — ou por que não encontrou nada.
 *
 * Existe porque a busca passou a ter dois consumidores com necessidades opostas:
 * a tool do chat quer texto para o LLM repassar, e o endpoint do Montador quer
 * uma lista que vira botão "Incluir" na tela. `buscarModuloLivre` continua
 * devolvendo JSON string (o contrato que o agente espera) serializando isto.
 */
export interface ResultadoModuloLivre {
    materias: MateriaBusca[];
    /** Explicação para lista vazia — texto pronto para mostrar ao aluno. */
    aviso?: string;
    /** Falha que impede a busca (matriz não resolvida, catálogo indisponível). */
    erro?: string;
}

export async function sugerirModuloLivre(
    termosBusca: string[],
    apenasComOferta: boolean,
    /**
     * E-mail do aluno. Quando presente, o resultado exclui o que ele já
     * cursou — mesmo motivo de optativas_actuator.ts (buscarOptativas).
     */
    email: string | undefined,
    /**
     * OBRIGATÓRIO (diferente de buscarOptativas): módulo livre não faz
     * sentido sem saber a matriz do aluno — é ela que define o que EXCLUIR
     * (tudo que já é obrigatória ou optativa do curso).
     */
    curriculoCompleto: string
): Promise<ResultadoModuloLivre> {
    if (termosBusca.length === 0) {
        return { materias: [], erro: "Informe ao menos um termo de busca." };
    }

    const idMatriz = await resolveIdMatriz(curriculoCompleto);
    if (idMatriz == null) {
        return {
            materias: [],
            erro: "Não foi possível identificar a matriz curricular do aluno para calcular o módulo livre.",
        };
    }

    let codigosMatriz: Set<string>;
    try {
        codigosMatriz = await codigosDaMatriz(idMatriz);
    } catch {
        // Falha ao consultar materias_por_curso/materias: não dá pra saber o
        // que excluir com segurança, então recusa em vez de arriscar vazar
        // matéria da própria matriz do aluno como "módulo livre".
        return {
            materias: [],
            erro: "Não foi possível calcular a matriz curricular do aluno para o módulo livre agora.",
        };
    }

    let materias = await sabia.buscarMaterias(termosBusca);

    // Módulo livre = fora da matriz do aluno (nem obrigatória, nem optativa).
    materias = materias.filter((m) => !codigosMatriz.has(norm(m.codigo)));

    if (apenasComOferta && materias.length > 0) {
        materias = await filtrarPorOfertaAtiva(materias);
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
        return {
            materias: [],
            aviso: filtrouPorHistorico
                ? "As matérias de módulo livre encontradas sobre esse tema você já cursou (ou está cursando)."
                : apenasComOferta
                  ? "Nenhuma matéria de módulo livre sobre esse tema tem turma ofertada no período atual."
                  : "Nenhuma matéria de módulo livre encontrada para esse tema.",
        };
    }
    return { materias };
}

/**
 * Mesma busca, serializada — é o contrato que a tool do agente espera receber.
 *
 * Mantida com a assinatura e o formato de saída de sempre para o chat não mudar
 * de comportamento por causa do endpoint novo.
 */
export async function buscarModuloLivre(
    termosBusca: string[],
    apenasComOferta: boolean,
    email: string | undefined,
    curriculoCompleto: string
): Promise<string> {
    const r = await sugerirModuloLivre(termosBusca, apenasComOferta, email, curriculoCompleto);
    if (r.erro) return JSON.stringify({ erro: r.erro });
    if (r.aviso) return JSON.stringify({ aviso: r.aviso, materias: [] });
    return JSON.stringify({ materias: r.materias });
}

export function createModuloLivreAgent(
    apenasComOferta: boolean,
    email: string | undefined,
    curriculoCompleto: string
): Agent {
    const buscarModuloLivreTool = tool({
        name: "buscar_modulo_livre",
        description:
            "Busca disciplinas de módulo livre (fora da matriz do curso, obrigatória ou optativa) por área de interesse.",
        parameters: z.object({
            termos_busca: z
                .array(z.string())
                .min(1)
                .max(4)
                .describe("1 a 4 termos sobre a área de interesse (termo principal + sinônimos)."),
        }),
        execute: async ({ termos_busca }) =>
            buscarModuloLivre(termos_busca, apenasComOferta, email, curriculoCompleto),
    });

    return new Agent({
        name: "AtuadorModuloLivre",
        instructions:
            "Você responde SOMENTE perguntas sobre buscar/sugerir disciplinas de módulo livre (matérias de fora " +
            "da matriz do curso do aluno — nem obrigatória, nem optativa) por área de interesse. Sempre use a " +
            "tool buscar_modulo_livre. Responda em português brasileiro, listando código e nome das disciplinas " +
            "encontradas. A tool já exclui matérias da matriz do aluno e o que ele já cursou — nunca reintroduza " +
            "um código que não veio dela, e se vier só o campo 'aviso', repasse o aviso sem inventar sugestão.",
        model: createMaritacaModel(),
        tools: [buscarModuloLivreTool],
    });
}
