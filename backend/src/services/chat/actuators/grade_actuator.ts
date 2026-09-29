/**
 * Atuador de recomendação por horário livre — Fase 2 (extensão) do orquestrador
 * de chat (docs/chatbot-orquestrador.md), spec em
 * docs/superpowers/specs/2026-07-30-recomendacao-horario-livre-design.md.
 *
 * O filtro de horário em si é sempre determinístico (bitmask) — a comparação de
 * máscaras nunca passa pela IA. (Nota: `montarDadosPlano`, chamado por esta função,
 * pode disparar lazy-load de dificuldade via IA para matérias sem `dificuldade_estimada`
 * — efeito colateral herdado, fora do escopo deste filtro.)
 * Coerência temática (Task 7) é só ranking por cima do que já passou aqui.
 *
 * NOTA sobre o schema de `turmas`: a tabela só tem `id_materia` (sem
 * `codigo_materia` denormalizado) — confirmado em
 * PlanejamentoController.ts (a query "3. Busca materias com oferta real em
 * turmas" seleciona só `id_materia`) e no padrão já usado por
 * `filtrarPorOfertaAtiva` (optativas_actuator.ts), que resolve código →
 * id_materia via a tabela `materias` antes de consultar `turmas`. Este
 * atuador segue o mesmo padrão de dois passos.
 */
import { z } from "zod";
import { Agent, tool, OutputGuardrailTripwireTriggered } from "@openai/agents";
import type { OutputGuardrail, RunContext } from "@openai/agents";
import { runSubAgente } from "../sub_run";
import { SupabaseWrapper } from "../../../supabase_wrapper";
import { montarDadosPlano } from "../../../controllers/PlanejamentoController";
import {
    parseFluxograma,
    isDesbloqueada,
    expandirCumpridasComEquivalencias,
    construirSubstitutosPorCodigo,
} from "../../plano_formatura.service";
import {
    getCodigosFromExpressaoLogica,
    parseExpressaoLogicaFromDb,
    type ExpressaoLogicaRecursiva,
} from "../../../utils/expressao_logica";
import { slotMaskFromHorario } from "../../../utils/horario_slots";
import { createMaritacaModel } from "../model_provider";
import type { PlanoInput } from "../../../types/planejamento";

export interface CandidatoGrade {
    codigo: string;
    nome: string;
    creditos: number;
    obrigatoria: boolean;
    nivel: number;
    /**
     * Co-requisitos que ainda precisam entrar JUNTO nesta grade (já filtrados os que
     * o aluno cumpriu ou já alocou). Vazio = pode ser adicionada sozinha.
     */
    coRequisitos?: string[];
    /**
     * Código sob o qual a turma foi realmente ofertada, quando difere do código da
     * matriz (matéria que mudou de código). É NESSE código que o aluno se matricula.
     * Indefinido quando a turma é do próprio código.
     */
    codigoOfertado?: string;
}

const PLANO_INPUT_PADRAO: Omit<PlanoInput, "curriculoCompleto"> = {
    completedCodes: [],
    numeroPeriodo: 1,
    preferencias: { limiteCreditos: 24, objetivo: "equilibrado", trabalha: false },
};

function norm(codigo: string): string {
    return (codigo || "").trim().toUpperCase();
}

/**
 * Aceita tanto a expressão já desserializada ({condicoes, operador}) quanto o formato
 * cru do banco. Mesma lógica do helper homônimo em plano_formatura.service.ts, que é
 * privado lá — reimplementado aqui pra manter o atuador self-contained, seguindo a
 * convenção já usada neste arquivo (ver resolveIdUserPorEmail).
 */
function parseExprOrNull(raw: unknown): ExpressaoLogicaRecursiva | null {
    if (raw == null) return null;
    if (typeof raw === "object" && raw !== null && "condicoes" in (raw as object)) {
        return raw as ExpressaoLogicaRecursiva;
    }
    return parseExpressaoLogicaFromDb(raw);
}

/**
 * resolveIdUserPorEmail — reimplementado aqui, não reexportado de
 * integralizacao_actuator.ts, seguindo o padrão de duplicação já aceito no
 * restante do pipeline (ver `filtrarPorOfertaAtiva` em optativas_actuator.ts:
 * "reimplementado aqui — não reexportado do Darcy legado"). Mantém este
 * atuador self-contained.
 */
async function resolveIdUserPorEmail(email: string): Promise<string | null> {
    const { data, error } = await SupabaseWrapper.get()
        .from("users")
        .select("id_user")
        .eq("email", email)
        .maybeSingle();
    if (error || !data?.id_user) return null;
    return String(data.id_user);
}

function parseEmbeddingVector(raw: unknown): number[] | null {
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.map(Number) : null;
        } catch {
            return null;
        }
    }
    return null;
}

/** Vetor médio das matérias já concluídas — "perfil temático" do aluno. */
async function calcularVetorPerfil(completedCodes: string[]): Promise<number[] | null> {
    if (completedCodes.length === 0) return null;
    const { data, error } = await SupabaseWrapper.get()
        .from("materias_vetorizadas")
        .select("codigo_materia, embedding")
        .in("codigo_materia", completedCodes);
    if (error || !data) return null;

    const vetores = (data as any[])
        .map((r) => parseEmbeddingVector(r.embedding))
        .filter((v): v is number[] => v !== null && v.length > 0);
    if (vetores.length === 0) return null;

    const dim = vetores[0].length;
    const soma = new Array(dim).fill(0);
    for (const v of vetores) for (let i = 0; i < dim; i++) soma[i] += v[i] ?? 0;
    return soma.map((s) => s / vetores.length);
}

function cosineSimilarity(a: number[], b: number[]): number {
    const dim = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < dim; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * codigo_materia -> similaridade de cosseno (-1..1) contra vetorPerfil, calculada em JS
 * só para `codigosCandidatos` — a lista pequena (~6) já filtrada pelo horário livre, NUNCA
 * uma busca no universo inteiro de materias_vetorizadas (~26k linhas). Substitui a antiga
 * `buscarSimilaridades` via RPC `match_materias`: pedir o top-100 global e procurar os
 * candidatos ali dentro era estatisticamente quase sempre 0 (candidatos são uma fração
 * ínfima de 26k linhas), tornando o ranking por afinidade temática um no-op silencioso.
 * Degrada pra Map vazio em qualquer falha — nunca derruba um candidato que já passou pelo
 * filtro de horário, só perde o ranking por afinidade (cai pra ordem neutra).
 */
async function calcularSimilaridadesCandidatos(
    vetorPerfil: number[],
    codigosCandidatos: string[]
): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();
    if (codigosCandidatos.length === 0) return mapa;
    try {
        const { data, error } = await SupabaseWrapper.get()
            .from("materias_vetorizadas")
            .select("codigo_materia, embedding")
            .in("codigo_materia", codigosCandidatos);
        if (error || !data) return mapa;
        for (const item of data as any[]) {
            const cod = norm(String(item.codigo_materia ?? ""));
            const vetor = parseEmbeddingVector(item.embedding);
            if (!cod || !vetor || vetor.length === 0) continue;
            mapa.set(cod, cosineSimilarity(vetorPerfil, vetor));
        }
    } catch {
        // Degrada graciosamente — ranking cai pro neutro, horário livre não é afetado.
    }
    return mapa;
}

export async function recomendarPorHorarioLivre(
    email: string,
    curriculoCompleto: string,
    freeMaskStr: string,
    periodoAtivo: string,
    /**
     * Códigos já alocados na grade que o aluno está montando nesta tela. São do
     * MESMO semestre da recomendação, então: (a) não podem ser recomendados de novo
     * e (b) NÃO satisfazem pré-requisito de nenhuma outra — só um co-requisito
     * funcionaria assim. Diferente de MATR, que é do semestre corrente e estará
     * concluída antes do semestre alvo.
     */
    codigosNaGrade: string[] = []
): Promise<{ candidatos: CandidatoGrade[] } | { erro: string }> {
    const idUser = await resolveIdUserPorEmail(email);
    if (!idUser) return { erro: "Não encontrei o cadastro deste usuário." };

    const freeMask = BigInt(freeMaskStr || "0");
    if (freeMask === 0n) {
        return { candidatos: [] };
    }

    const { dados, error } = await montarDadosPlano(idUser, { ...PLANO_INPUT_PADRAO, curriculoCompleto });
    if (error || !dados) {
        return { erro: error ?? "Não foi possível carregar o currículo do aluno." };
    }

    const { completed, currentSemester } = parseFluxograma(dados.fluxogramaAtual);

    // "Cumpridas" para efeito de pré-requisito = aprovadas ∪ em curso (MATR).
    // MATR entra porque é do semestre corrente e estará concluída antes do semestre
    // que o aluno está montando — mesma regra que o Motor 2 usa (completedPlusMatr
    // em gerarPlanoCompletov2). O que NÃO entra aqui é codigosNaGrade: aquilo é do
    // mesmo semestre da recomendação e não pode liberar pré-requisito.
    const cumpridasBase = new Set(completed);
    for (const m of currentSemester) cumpridasBase.add(norm(m.codigo));

    // Equivalência: se o que o aluno cursou satisfaz a equivalência de Y, Y conta como
    // cumprida — não recomenda de novo e libera quem depende dela. O fluxograma só
    // pré-resolve equivalência de obrigatórias, então optativas equivalentes só são
    // pegas aqui.
    const cumpridas = expandirCumpridasComEquivalencias(dados.materiasMapeadas, cumpridasBase);

    const naGrade = new Set(codigosNaGrade.map(norm));

    const elegiveis = dados.materiasMapeadas.filter((m) => {
        const cod = norm(m.codigo);
        // Já cursada/cursando, ou já alocada na grade em construção → não recomenda.
        // (Vale também para optativas: antes o ramo delas só olhava a oferta, então
        // uma optativa já aprovada voltava a ser sugerida.)
        if (cumpridas.has(cod) || naGrade.has(cod)) return false;
        // Pré-requisito é filtro DURO: sem ele o aluno não consegue se matricular,
        // então recomendar seria sugerir algo inviável.
        if (!isDesbloqueada(m, cumpridas)) return false;
        return m.obrigatoria || dados.codigosComOferta.has(cod);
    });
    if (elegiveis.length === 0) return { candidatos: [] };

    const codigos = elegiveis.map((m) => norm(m.codigo));

    // Equivalência na busca por OFERTA (diferente da busca por cumprimento acima):
    // quando a matéria muda de código, a matriz continua com o antigo mas a turma é
    // publicada sob o novo (ex. CIC0151 → CIC0197/FGA0158). Sem isso ela nunca vira
    // candidata, mesmo tendo turma que cabe no horário livre.
    // Spec: docs/superpowers/specs/2026-08-03-equivalencias-oferta-turmas-design.md
    const substitutosPorCodigo = construirSubstitutosPorCodigo(elegiveis);
    const matrizPorSubstituto = new Map<string, string[]>();
    for (const [codMatriz, substitutos] of substitutosPorCodigo) {
        for (const s of substitutos) {
            const lista = matrizPorSubstituto.get(s) ?? [];
            lista.push(codMatriz);
            matrizPorSubstituto.set(s, lista);
        }
    }

    // Passo 1: código -> id_materia (turmas não tem codigo_materia direto). Inclui os
    // substitutos, que estão FORA da matriz e portanto fora de `codigos`.
    const supabase = SupabaseWrapper.get();
    const codigosParaResolver = [...new Set([...codigos, ...matrizPorSubstituto.keys()])];
    const { data: materiasRows, error: erroMaterias } = await supabase
        .from("materias")
        .select("id_materia, codigo_materia")
        .in("codigo_materia", codigosParaResolver);

    if (erroMaterias) {
        return { erro: "Não foi possível resolver as matérias do currículo." };
    }

    const idPorCodigo = new Map<string, number>(
        (materiasRows ?? []).map((m: any) => [norm(m.codigo_materia), Number(m.id_materia)])
    );
    const codigoPorId = new Map<number, string>([...idPorCodigo.entries()].map(([cod, id]) => [id, cod]));
    const ids = [...idPorCodigo.values()];
    if (ids.length === 0) return { candidatos: [] };

    // Passo 2: turmas do período ativo para esses id_materia.
    const { data: turmas, error: erroTurmas } = await supabase
        .from("turmas")
        .select("id_materia, horario")
        .eq("ano_periodo", periodoAtivo)
        .in("id_materia", ids);

    if (erroTurmas || !turmas) {
        return { erro: "Não foi possível consultar as turmas do período." };
    }

    const codigosDaMatriz = new Set(codigos);

    // Substituto é FALLBACK, não alternativa: se a matéria ainda é ofertada no próprio
    // código neste período, é nele que o aluno se matricula — mesmo que o horário dessa
    // turma seja pior. Por isso a checagem é "tem QUALQUER turma própria no período",
    // não "tem turma própria que cabe no livre". Medido em produção: 1.396 pares têm
    // oferta nos DOIS códigos (coexistem em vez de renomeados).
    const temOfertaPropriaNoPeriodo = new Set<string>();
    for (const t of turmas as any[]) {
        const cod = codigoPorId.get(Number(t.id_materia));
        if (cod && codigosDaMatriz.has(cod)) temOfertaPropriaNoPeriodo.add(cod);
    }

    // Turma do próprio código da matéria, já filtrada pelo horário livre.
    const ofertaPropria = new Set<string>();
    // Código da matriz -> código do substituto cuja turma cabe (primeiro que casar).
    const ofertaViaSubstituto = new Map<string, string>();

    for (const t of turmas as any[]) {
        const cod = codigoPorId.get(Number(t.id_materia));
        if (!cod) continue;
        const turmaMask = slotMaskFromHorario(t.horario);
        if ((turmaMask & freeMask) !== turmaMask) continue;

        // Um código pode ser as duas coisas ao mesmo tempo (matéria da matriz E
        // substituta de outra), então os dois ramos são avaliados, não excludentes.
        if (codigosDaMatriz.has(cod)) ofertaPropria.add(cod);
        for (const codMatriz of matrizPorSubstituto.get(cod) ?? []) {
            if (temOfertaPropriaNoPeriodo.has(codMatriz)) continue;
            if (!ofertaViaSubstituto.has(codMatriz)) ofertaViaSubstituto.set(codMatriz, cod);
        }
    }

    const codigosComTurmaNoLivre = new Set<string>([
        ...ofertaPropria,
        ...ofertaViaSubstituto.keys(),
    ]);

    /** Só preenche quando a turma vem de um código diferente do da matriz. */
    function codigoOfertadoDe(cod: string): string | undefined {
        if (ofertaPropria.has(cod)) return undefined;
        return ofertaViaSubstituto.get(cod);
    }

    // Ranking por coerência temática (Task 7 / Fix 1): perfil = média dos embeddings das
    // matérias já concluídas; similaridade calculada em JS (cosseno) só para as optativas
    // candidatas que já passaram no filtro de horário acima — nunca busca no universo
    // inteiro de materias_vetorizadas. Só afeta a ORDEM entre optativas já elegíveis pelo
    // filtro de horário — nunca filtra.
    const codigosCandidatosOptativas = elegiveis
        .filter((m) => !m.obrigatoria && codigosComTurmaNoLivre.has(norm(m.codigo)))
        .map((m) => norm(m.codigo));
    const codigosCompletos = [...completed];
    const vetorPerfil = await calcularVetorPerfil(codigosCompletos);
    const similaridades = vetorPerfil
        ? await calcularSimilaridadesCandidatos(vetorPerfil, codigosCandidatosOptativas)
        : new Map<string, number>();

    // Co-requisitos: "deve cursar NO MESMO semestre, não antes" (docs/unb-domain.md).
    // Um co-requisito está resolvido se já foi cumprido, se já está alocado nesta
    // grade, ou se ele mesmo é candidato viável — nesse caso as duas entram juntas.
    // Se não for nenhum dos três, a matéria não é matriculável e sai da lista.
    // Checagem de um nível só (não recursiva), igual ao Motor 2.
    const disponivelParaCoRequisito = new Set<string>([
        ...cumpridas,
        ...naGrade,
        ...codigosComTurmaNoLivre,
    ]);
    const coRequisitosPendentesPor = new Map<string, string[]>();

    function coRequisitosResolvidos(m: (typeof elegiveis)[number]): boolean {
        const expr = parseExprOrNull(m.coRequisitos);
        if (!expr) return true;
        const codigos = getCodigosFromExpressaoLogica(expr).map(norm);
        if (codigos.some((c) => !disponivelParaCoRequisito.has(c))) return false;
        // Os que ainda não estão cumpridos/na grade precisam entrar JUNTO — o agente
        // avisa o aluno, senão ele adiciona uma só e a matrícula é recusada.
        coRequisitosPendentesPor.set(
            norm(m.codigo),
            codigos.filter((c) => !cumpridas.has(c) && !naGrade.has(c))
        );
        return true;
    }

    // Fix 4: dedupe por código antes do slice — a mesma matéria pode em tese aparecer em
    // dois níveis de materiasMapeadas (ex.: currículos com duplicação de nível); sem isso
    // ela ocuparia duas das seis vagas finais consigo mesma. Mantém a 1ª ocorrência.
    const codigosVistos = new Set<string>();
    const candidatos: CandidatoGrade[] = elegiveis
        .filter((m) => codigosComTurmaNoLivre.has(norm(m.codigo)))
        .filter((m) => coRequisitosResolvidos(m))
        .filter((m) => {
            const cod = norm(m.codigo);
            if (codigosVistos.has(cod)) return false;
            codigosVistos.add(cod);
            return true;
        })
        .map((m) => ({
            codigo: norm(m.codigo),
            nome: m.nome,
            creditos: m.creditos,
            obrigatoria: m.obrigatoria,
            nivel: m.nivel,
            coRequisitos: coRequisitosPendentesPor.get(norm(m.codigo)) ?? [],
            codigoOfertado: codigoOfertadoDe(norm(m.codigo)),
        }))
        .sort((a, b) => {
            if (a.obrigatoria !== b.obrigatoria) return a.obrigatoria ? -1 : 1;
            if (a.obrigatoria) return a.nivel - b.nivel;
            return (similaridades.get(b.codigo) ?? 0) - (similaridades.get(a.codigo) ?? 0);
        })
        .slice(0, 6);

    return { candidatos };
}

/**
 * Fase 3 — revisor de horário (docs/chatbot-orquestrador.md): guarda os candidatos
 * brutos retornados pela última chamada à tool nesta closure (uma por agente/request —
 * createGradeAgent é sempre chamado de novo por requisição) e rejeita qualquer código
 * citado na tag [MONTAR_GRADE|...] que não esteja entre eles. Como o filtro de horário
 * já é 100% determinístico (bitmask, nunca passa pela IA), qualquer código fora da lista
 * só pode ser alucinação do agente — não uma matéria que "quase" cabe.
 *
 * extrairCodigosDaTag usa a flag global (/g) e varre TODA ocorrência da tag na resposta —
 * uma resposta pode, em teoria, conter mais de um [MONTAR_GRADE|...] e cada uma precisa
 * ser verificada, não só a primeira.
 *
 * Escopo: este guardrail verifica só a resposta do sub-agente AtuadorGrade (o que roda
 * dentro de createGradeAgent/runGradeComRevisao, abaixo). O orquestrador que compõe a
 * resposta final ao usuário (orquestrador_agent.ts, createOrquestradorAgent) não tem
 * outputGuardrails próprios e, em tese, poderia compor uma tag [MONTAR_GRADE|...] com um
 * código não verificado por este revisor. Isso é um limite de escopo conhecido e aceito,
 * não um bug: o montador de grade do frontend faz backtracking sem conflito de horário de
 * qualquer forma, então um código não verificado no pior caso fica sem alocar — nunca gera
 * um conflito real de horário.
 */
function extrairCodigosDaTag(texto: string): string[] {
    const codigos: string[] = [];
    const regex = /\[MONTAR_GRADE\|([^|\]]*)\|?[^\]]*\]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(texto)) !== null) {
        codigos.push(
            ...(m[1] ?? "")
                .split(",")
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean)
        );
    }
    return codigos;
}

function criarRevisorHorario(getUltimosCandidatos: () => CandidatoGrade[] | null): OutputGuardrail {
    return {
        name: "revisor_horario_grade",
        execute: async ({ agentOutput }) => {
            const texto = typeof agentOutput === "string" ? agentOutput : JSON.stringify(agentOutput);
            const codigosCitados = extrairCodigosDaTag(texto);

            // Nada citado (resposta puramente conversacional) — nada pra verificar, aprova.
            // Verificação de citação vem SEMPRE antes da checagem de candidatos: se a
            // resposta citar um código sem a tool ter rodado nesta execução (candidatos
            // ainda null), isso NÃO é "nada a verificar" — é uma citação não verificada,
            // e deve ser tratada como código inválido (mesmo caminho de rejeição abaixo).
            if (codigosCitados.length === 0) {
                return { tripwireTriggered: false, outputInfo: null };
            }

            const candidatos = getUltimosCandidatos();
            const codigosValidos = new Set((candidatos ?? []).map((c) => c.codigo));
            const codigoInvalido = codigosCitados.find((c) => !codigosValidos.has(c));

            if (codigoInvalido) {
                const motivo = candidatos
                    ? `A resposta prioriza ${codigoInvalido}, que não está entre os candidatos que cabem no horário livre.`
                    : `A resposta cita ${codigoInvalido} sem antes ter chamado a tool recomendar_por_horario_livre — nada foi verificado.`;
                return {
                    tripwireTriggered: true,
                    outputInfo: { motivo },
                };
            }
            return { tripwireTriggered: false, outputInfo: null };
        },
    };
}

export function createGradeAgent(
    email: string,
    curriculoCompleto: string,
    freeMaskStr: string,
    periodoAtivo: string,
    codigosNaGrade: string[] = []
): Agent {
    let ultimosCandidatos: CandidatoGrade[] | null = null;

    const recomendarTool = tool({
        name: "recomendar_por_horario_livre",
        description: "Lista matérias (obrigatórias pendentes e optativas com oferta) cuja turma cabe inteira no horário livre atual do aluno, já com pré-requisitos cumpridos, ordenadas por afinidade com o que ele já cursou.",
        parameters: z.object({}),
        execute: async () => {
            const resultado = await recomendarPorHorarioLivre(email, curriculoCompleto, freeMaskStr, periodoAtivo, codigosNaGrade);
            ultimosCandidatos = "candidatos" in resultado ? resultado.candidatos : [];
            return JSON.stringify(resultado);
        },
    });

    return new Agent({
        name: "AtuadorGrade",
        instructions:
            "Você responde SOMENTE pedidos de preencher horário livre / buraco na grade do Montador de Grade. " +
            "Sempre use a tool recomendar_por_horario_livre antes de responder — nunca cite uma matéria que não veio dela. " +
            "Se a lista de candidatos vier vazia, diga que não achou nada que caiba nesse horário, sem inventar código. " +
            "CO-REQUISITOS: se um candidato vier com 'coRequisitos' não-vazio, essas matérias têm que ser cursadas NO MESMO semestre — " +
            "avise o aluno numa frase (ex: 'FGA0007 exige FGA0006 junto') e, se ele aceitar, inclua TODAS no marcador, nunca só uma. " +
            "CÓDIGO OFERTADO: se um candidato vier com 'codigoOfertado', a matéria mudou de código e a turma está publicada sob esse outro — " +
            "avise numa frase (ex: 'CIC0151 hoje é ofertada como FGA0158, é nesse código que você se matricula'). " +
            "No marcador [MONTAR_GRADE|...] use SEMPRE o campo 'codigo', nunca o 'codigoOfertado'. " +
            "Se o aluno topar montar/priorizar, confirme em uma frase curta e inclua no final [MONTAR_GRADE|CODIGOS] com os códigos escolhidos. " +
            "Responda em português brasileiro, direto e conciso.",
        model: createMaritacaModel(),
        tools: [recomendarTool],
        outputGuardrails: [criarRevisorHorario(() => ultimosCandidatos)],
    });
}

/**
 * Resposta padrão de escalonamento — nunca inventa nem repassa um código que não
 * sobreviveu ao revisor duas vezes seguidas.
 */
export const RESPOSTA_ESCALONAMENTO_GRADE =
    "Não achei nada certeiro pro seu horário livre agora — dá uma olhada nas optativas manualmente na lista ao lado.";

function motivoDaReprovacaoGrade(erro: OutputGuardrailTripwireTriggered<any>): string {
    return (
        (erro.result.output.outputInfo as { motivo?: string } | null)?.motivo ??
        "a resposta citou algo que não cabe no horário livre"
    );
}

/**
 * Roda o atuador e, se o revisor reprovar a resposta (código fora dos candidatos),
 * reexecuta UMA vez com o motivo da reprovação injetado no prompt. Se a reexecução
 * TAMBÉM for reprovada (reprovou duas vezes seguidas), escalona pra resposta padrão
 * em vez de devolver um código não verificado ou estourar erro pro usuário — nunca
 * tenta uma terceira vez.
 */
export async function runGradeComRevisao(
    agent: Agent,
    input: string,
    pai?: RunContext<unknown>
): Promise<string> {
    try {
        const resultado = await runSubAgente(agent, input, pai);
        return String(resultado.finalOutput ?? "");
    } catch (erro) {
        if (!(erro instanceof OutputGuardrailTripwireTriggered)) throw erro;

        const motivo = motivoDaReprovacaoGrade(erro);
        try {
            const resultadoCorrigido = await runSubAgente(
                agent,
                `${input}\n\n[Revisão automática] Sua resposta anterior foi rejeitada: ${motivo}. ` +
                    "Responda de novo, citando só códigos que vieram da tool recomendar_por_horario_livre.",
                pai
            );
            return String(resultadoCorrigido.finalOutput ?? "");
        } catch (segundoErro) {
            if (!(segundoErro instanceof OutputGuardrailTripwireTriggered)) throw segundoErro;
            return RESPOSTA_ESCALONAMENTO_GRADE;
        }
    }
}
