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
import { Agent, run, tool, OutputGuardrailTripwireTriggered } from "@openai/agents";
import type { OutputGuardrail } from "@openai/agents";
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
import { slotMaskFromHorario, type ErroMontagem, type OpcaoGrade } from "../../../utils/horario_slots";
import { createMaritacaModel } from "../model_provider";
import type { PlanoInput } from "../../../types/planejamento";
import { montarGrade, type ParametrosMontador, type TurmaOferta } from "../../grade/montador_grade.service";

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
 * brutos retornados pela última chamada às tools nesta closure (uma por agente/request —
 * createGradeAgent é sempre chamado de novo por requisição) e rejeita qualquer código (ou
 * par código:turma) citado na tag [MONTAR_GRADE|...] que não esteja entre eles. Como o
 * filtro/solver já é 100% determinístico (bitmask + branch-and-bound, nunca passa pela
 * IA), qualquer citação fora da lista só pode ser alucinação do agente — não uma matéria
 * que "quase" cabe.
 *
 * EVOLUÇÃO (Fase 3 — montador-de-grade-resilient-muffin.md): antes só validava `codigo`
 * contra `CandidatoGrade[]` (recomendar_por_horario_livre). Agora também valida pares
 * `codigo:idTurma` contra as `OpcaoGrade[]` realmente devolvidas por `montar_grade` — a
 * tool nova que resolve a grade de verdade no backend, então citar uma turma que não está
 * em NENHUMA opção retornada é tão alucinação quanto citar um código fora dos candidatos.
 * Cada token do marcador decide sozinho qual conjunto valida: com ':idTurma' é par (contra
 * `getUltimasOpcoes`), sem ':' é código solto (contra `getUltimosCandidatos`, comportamento
 * antigo intacto).
 *
 * extrairCitacoesDaTag usa a flag global (/g) e varre TODA ocorrência da tag na resposta —
 * uma resposta pode, em teoria, conter mais de um [MONTAR_GRADE|...] e cada uma precisa
 * ser verificada, não só a primeira.
 *
 * Escopo: este guardrail verifica só a resposta do sub-agente AtuadorGrade (o que roda
 * dentro de createGradeAgent/runGradeComRevisao, abaixo). O orquestrador que compõe a
 * resposta final ao usuário (orquestrador_agent.ts, createOrquestradorAgent) não tem
 * outputGuardrails próprios e, em tese, poderia compor uma tag [MONTAR_GRADE|...] com uma
 * citação não verificada por este revisor. Isso é um limite de escopo conhecido e aceito,
 * não um bug: a APLICAÇÃO real da seleção não depende mais do texto (ver `opcaoGrade`
 * estruturado, propagado por `runGradeComRevisao`/`chat_controller.ts`) — o texto é só
 * narração, então uma citação não verificada no pior caso confunde a frase, nunca aplica
 * um conflito de horário real.
 */
interface CitacaoGrade {
    codigo: string;
    /** `null` = citação antiga, só código (recomendar_por_horario_livre). */
    idTurma: number | null;
}

function extrairCitacoesDaTag(texto: string): CitacaoGrade[] {
    const citacoes: CitacaoGrade[] = [];
    const regex = /\[MONTAR_GRADE\|([^|\]]*)\|?[^\]]*\]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(texto)) !== null) {
        for (const tokenRaw of (m[1] ?? "").split(",")) {
            const token = tokenRaw.trim();
            if (!token) continue;
            const [codigoRaw, idTurmaRaw] = token.split(":");
            const codigo = (codigoRaw ?? "").trim().toUpperCase();
            if (!codigo) continue;
            const idTurmaNum = idTurmaRaw !== undefined && idTurmaRaw.trim() !== "" ? Number(idTurmaRaw.trim()) : NaN;
            citacoes.push({ codigo, idTurma: Number.isFinite(idTurmaNum) ? idTurmaNum : null });
        }
    }
    return citacoes;
}

function criarRevisorHorario(
    getUltimosCandidatos: () => CandidatoGrade[] | null,
    getUltimasOpcoes: () => OpcaoGrade<TurmaOferta>[] | null
): OutputGuardrail {
    return {
        name: "revisor_horario_grade",
        execute: async ({ agentOutput }) => {
            const texto = typeof agentOutput === "string" ? agentOutput : JSON.stringify(agentOutput);
            const citacoes = extrairCitacoesDaTag(texto);

            // Nada citado (resposta puramente conversacional) — nada pra verificar, aprova.
            // Verificação de citação vem SEMPRE antes da checagem de candidatos/opções: se a
            // resposta citar algo sem a tool ter rodado nesta execução (ambos ainda null),
            // isso NÃO é "nada a verificar" — é uma citação não verificada, e deve ser tratada
            // como inválida (mesmo caminho de rejeição abaixo).
            if (citacoes.length === 0) {
                return { tripwireTriggered: false, outputInfo: null };
            }

            const candidatos = getUltimosCandidatos();
            const codigosValidos = new Set((candidatos ?? []).map((c) => c.codigo));

            const opcoes = getUltimasOpcoes();
            const paresValidos = new Set<string>();
            for (const opcao of opcoes ?? []) {
                for (const [codigo, turma] of opcao.resultado.selecao) {
                    paresValidos.add(`${codigo}:${turma.turma.id_turmas}`);
                }
            }

            const citacaoInvalida = citacoes.find((c) =>
                c.idTurma !== null ? !paresValidos.has(`${c.codigo}:${c.idTurma}`) : !codigosValidos.has(c.codigo)
            );

            if (citacaoInvalida) {
                const rotulo =
                    citacaoInvalida.idTurma !== null
                        ? `${citacaoInvalida.codigo} (turma ${citacaoInvalida.idTurma})`
                        : citacaoInvalida.codigo;
                const motivo =
                    citacaoInvalida.idTurma !== null
                        ? opcoes
                            ? `A resposta cita ${rotulo}, que não está em nenhuma das opções de grade realmente montadas.`
                            : `A resposta cita ${rotulo} sem antes ter chamado a tool montar_grade — nada foi verificado.`
                        : candidatos
                          ? `A resposta prioriza ${rotulo}, que não está entre os candidatos que cabem no horário livre.`
                          : `A resposta cita ${rotulo} sem antes ter chamado a tool recomendar_por_horario_livre — nada foi verificado.`;
                return {
                    tripwireTriggered: true,
                    outputInfo: { motivo },
                };
            }
            return { tripwireTriggered: false, outputInfo: null };
        },
    };
}

// ─── Fase 3 — tool `montar_grade` (Darcy usa a Facade do backend) ───────────────

/** O que sobrevive do `OpcaoGrade` completo pro contrato `/chat/send` — Fase 3 do plano. */
export interface OpcaoGradeResumo {
    estrategia: string;
    selecao: Array<{ codigo: string; idTurma: number }>;
}

const ESTRATEGIA_PARA_NOME: Record<string, string> = {
    menos_dias: "Menos dias com aula",
    menos_furos: "Menos furos entre aulas",
    semana_equilibrada: "Semana equilibrada",
};

function resumirOpcao(opcao: OpcaoGrade<TurmaOferta>): OpcaoGradeResumo {
    return {
        estrategia: opcao.estrategia,
        selecao: [...opcao.resultado.selecao.entries()].map(([codigo, t]) => ({
            codigo,
            idTurma: t.turma.id_turmas,
        })),
    };
}

/** Texto curto e narrável pra cada tipo de `ErroMontagem` — usado no JSON que a tool devolve pro LLM. */
function formatarErroEssencial(erro: ErroMontagem): string {
    switch (erro.tipo) {
        case "ESSENCIAL_SEM_VAGA":
            return `${erro.chave} não tem NENHUMA turma ofertada neste período.`;
        case "ESSENCIAL_FORA_DO_TURNO":
            return `${erro.chave} só tem turma fora dos turnos pedidos (turnos com oferta real: ${erro.turnosComOferta.join(", ") || "nenhum"}).`;
        case "ESSENCIAL_PRE_REQUISITO":
            return `${erro.chave} tem pré-requisito pendente: ${erro.pendencias.join(", ")}.`;
        case "ESSENCIAL_CONFLITO":
            return `${erro.chave} colide de horário com: ${erro.colideCom.join(", ") || "outra matéria travada"}.`;
        default:
            return `${(erro as ErroMontagem).chave} não pôde ser alocada.`;
    }
}

/** Resumo de UMA opção, formato pequeno o bastante pro LLM narrar sem estourar contexto. */
function formatarOpcaoParaLlm(opcao: OpcaoGrade<TurmaOferta>) {
    return {
        estrategia: opcao.estrategia,
        metricas: {
            diasComAula: opcao.metricas.diasComAula,
            minutosDeLacuna: opcao.metricas.minutosDeLacuna,
            horasTotais: opcao.metricas.horasTotais,
            professorEssencialAtendido: opcao.metricas.professorEssencialAtendido,
        },
        materias: [...opcao.resultado.selecao.entries()].map(([codigo, t]) => ({
            codigo,
            idTurma: t.turma.id_turmas,
            turma: t.turma.turma,
            docente: t.turma.docente,
            horario: t.turma.horario,
        })),
        naoAlocadas: opcao.resultado.naoAlocadas,
        truncado: opcao.resultado.truncado,
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
    let ultimasOpcoes: OpcaoGrade<TurmaOferta>[] | null = null;
    let ultimaOpcaoEscolhida: OpcaoGradeResumo | null = null;

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

    const montarGradeTool = tool({
        name: "montar_grade",
        description:
            "Monta/rearranja a grade horária completa do aluno com o solver determinístico do backend (branch-and-bound, sem conflito de horário). Use para pedidos de MONTAR ou REARRANJAR a grade — priorizando uma matéria ESSENCIAL, restringindo turnos e/ou pedindo um professor específico. Devolve até 6 opções já resolvidas, com métricas reais (dias com aula, minutos de furo, se o professor pedido foi atendido).",
        parameters: z.object({
            escopo: z
                .enum(["periodo_atual", "todas_pendentes"])
                .optional()
                .describe("periodo_atual = só matérias do nível atual/atrasadas + optativas; todas_pendentes = qualquer pendente desbloqueada. Padrão: periodo_atual."),
            turnos: z
                .array(z.enum(["M", "T", "N"]))
                .optional()
                .describe("Turnos permitidos (M=manhã, T=tarde, N=noite). Omitido/vazio = sem restrição."),
            essencial: z
                .string()
                .optional()
                .describe("Código da matéria que NUNCA pode ficar de fora quando existe alguma turma viável para ela (ex.: 'FGA0060')."),
            docente: z
                .string()
                .optional()
                .describe("Nome do professor preferido PARA A MATÉRIA ESSENCIAL — é só preferência de desempate, nunca filtro: a essencial nunca fica de fora só por causa de professor."),
            incluirCursando: z
                .boolean()
                .optional()
                .describe("false = monta como se o aluno não estivesse cursando nada agora (libera horário/créditos das matrículas atuais). Padrão: true."),
            estrategia: z
                .enum(["menos_dias", "menos_furos", "semana_equilibrada"])
                .optional()
                .describe("Qual das opções retornadas destacar como a escolhida. Padrão: a 1ª opção devolvida."),
        }),
        execute: async ({ escopo, turnos, essencial, docente, incluirCursando, estrategia }) => {
            const params: ParametrosMontador = {
                email,
                curriculoCompleto,
                escopo: escopo ?? "periodo_atual",
                turnosPermitidos: turnos && turnos.length > 0 ? turnos : undefined,
                essencial: essencial || undefined,
                professorPreferidoEssencial: docente || undefined,
                incluirCursando: incluirCursando ?? undefined,
            };

            let resultado: Awaited<ReturnType<typeof montarGrade>>;
            try {
                resultado = await montarGrade(params);
            } catch (err) {
                ultimasOpcoes = null;
                ultimaOpcaoEscolhida = null;
                const msg = err instanceof Error ? err.message : String(err);
                return JSON.stringify({ erro: msg });
            }

            ultimasOpcoes = resultado.opcoes;

            const nomeEscolhido = estrategia ? ESTRATEGIA_PARA_NOME[estrategia] : undefined;
            const opcaoEscolhida =
                (nomeEscolhido && resultado.opcoes.find((o) => o.estrategia === nomeEscolhido)) ||
                resultado.opcoes[0] ||
                null;
            ultimaOpcaoEscolhida = opcaoEscolhida ? resumirOpcao(opcaoEscolhida) : null;

            return JSON.stringify({
                opcoes: resultado.opcoes.map(formatarOpcaoParaLlm),
                escolhida: opcaoEscolhida?.estrategia ?? null,
                errosEssencial: resultado.erros.map(formatarErroEssencial),
            });
        },
    });

    const agent = new Agent({
        name: "AtuadorGrade",
        instructions:
            "Você responde pedidos de preencher horário livre / buraco na grade E pedidos de MONTAR/REARRANJAR a grade inteira, ambos dentro do Montador de Grade. " +
            "Pra preencher um horário livre específico: use a tool recomendar_por_horario_livre — nunca cite uma matéria que não veio dela. " +
            "Se a lista de candidatos vier vazia, diga que não achou nada que caiba nesse horário, sem inventar código. " +
            "CO-REQUISITOS: se um candidato vier com 'coRequisitos' não-vazio, essas matérias têm que ser cursadas NO MESMO semestre — " +
            "avise o aluno numa frase (ex: 'FGA0007 exige FGA0006 junto') e, se ele aceitar, inclua TODAS no marcador, nunca só uma. " +
            "CÓDIGO OFERTADO: se um candidato vier com 'codigoOfertado', a matéria mudou de código e a turma está publicada sob esse outro — " +
            "avise numa frase (ex: 'CIC0151 hoje é ofertada como FGA0158, é nesse código que você se matricula'). " +
            "No marcador [MONTAR_GRADE|...] deste caminho use SEMPRE o campo 'codigo' solto (sem ':'), nunca o 'codigoOfertado'. " +
            "Se o aluno topar montar/priorizar, confirme em uma frase curta e inclua no final [MONTAR_GRADE|CODIGOS] com os códigos escolhidos. " +
            "\n\nPra MONTAR/REARRANJAR A GRADE INTEIRA (matéria essencial, turno, professor, ou só 'monta minha grade'): use a tool montar_grade — " +
            "ela já resolve o conflito de horário de verdade, o resultado é GARANTIDAMENTE ótimo (nunca uma prévia). " +
            "Se 'errosEssencial' vier não-vazio, explique o motivo real ao aluno (ex.: 'FGA0060 não tem turma ofertada' ou 'colide com FGA0010') " +
            "em vez de dizer genericamente que não coube. Ao narrar uma opção, cite MÉTRICAS REAIS dela — dias com aula, quantos minutos de furo, " +
            "e se o professor pedido foi atendido ('professorEssencialAtendido') — nunca prometa 'vou tentar encaixar': o resultado já está pronto. " +
            "Se pediu professor e ele não coube em nenhuma turma, diga isso citando a métrica, mas a matéria essencial nunca fica de fora só por causa " +
            "de professor — professor é preferência de desempate, não filtro. " +
            "Confirme a opção escolhida ('escolhida') em uma frase curta e inclua no final [MONTAR_GRADE|CODIGO:IDTURMA,CODIGO:IDTURMA,...] com CADA " +
            "par código:idTurma exatamente como veio em 'materias' da opção escolhida — nunca invente um idTurma, nunca omita o ':idTurma'. " +
            "Responda em português brasileiro, direto e conciso.",
        model: createMaritacaModel(),
        tools: [recomendarTool, montarGradeTool],
        outputGuardrails: [criarRevisorHorario(() => ultimosCandidatos, () => ultimasOpcoes)],
    });

    (agent as AgentComOpcaoGrade).obterUltimaOpcaoGrade = () => ultimaOpcaoEscolhida;
    return agent;
}

/**
 * Extensão não-invasiva de `Agent` pra carregar a `OpcaoGrade` que a tool `montar_grade`
 * calculou por cima da closure privada de `createGradeAgent` — sem isso o resultado
 * estruturado fica preso lá dentro e nunca chega em `chat_controller.ts` (Fase 3 do
 * plano). `createGradeAgent` continua devolvendo `Agent` puro (mesma assinatura de
 * sempre — nenhum teste/consumidor existente quebra), só ganha essa propriedade extra
 * atrás de um cast. `obterOpcaoGradeDoAgente` é o jeito seguro de ler de fora.
 */
export interface AgentComOpcaoGrade extends Agent {
    obterUltimaOpcaoGrade?: () => OpcaoGradeResumo | null;
}

export function obterOpcaoGradeDoAgente(agent: Agent): OpcaoGradeResumo | null {
    return (agent as AgentComOpcaoGrade).obterUltimaOpcaoGrade?.() ?? null;
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

/** Retorno de `runGradeComRevisao` — Fase 3: a resposta em texto + a `OpcaoGrade` estruturada, quando a tool `montar_grade` rodou. */
export interface RespostaGradeComRevisao {
    reply: string;
    opcaoGrade?: OpcaoGradeResumo;
}

/**
 * Roda o atuador e, se o revisor reprovar a resposta (código/par código:turma fora do
 * verificado), reexecuta UMA vez com o motivo da reprovação injetado no prompt. Se a
 * reexecução TAMBÉM for reprovada (reprovou duas vezes seguidas), escalona pra resposta
 * padrão em vez de devolver algo não verificado ou estourar erro pro usuário — nunca
 * tenta uma terceira vez.
 *
 * `opcaoGrade` (Fase 3 — contrato `/chat/send`) só vem preenchido quando a tool
 * `montar_grade` de fato rodou E a resposta passou pelo revisor — nos dois caminhos de
 * escalonamento (reprovou 2x) `opcaoGrade` fica ausente de propósito: nunca propaga uma
 * seleção associada a um texto que o revisor rejeitou.
 */
export async function runGradeComRevisao(agent: Agent, input: string): Promise<RespostaGradeComRevisao> {
    try {
        const resultado = await run(agent, input);
        return { reply: String(resultado.finalOutput ?? ""), opcaoGrade: obterOpcaoGradeDoAgente(agent) ?? undefined };
    } catch (erro) {
        if (!(erro instanceof OutputGuardrailTripwireTriggered)) throw erro;

        const motivo = motivoDaReprovacaoGrade(erro);
        try {
            const resultadoCorrigido = await run(
                agent,
                `${input}\n\n[Revisão automática] Sua resposta anterior foi rejeitada: ${motivo}. ` +
                    "Responda de novo, citando só o que veio das tools (códigos de recomendar_por_horario_livre, ou pares código:idTurma de montar_grade)."
            );
            return {
                reply: String(resultadoCorrigido.finalOutput ?? ""),
                opcaoGrade: obterOpcaoGradeDoAgente(agent) ?? undefined,
            };
        } catch (segundoErro) {
            if (!(segundoErro instanceof OutputGuardrailTripwireTriggered)) throw segundoErro;
            return { reply: RESPOSTA_ESCALONAMENTO_GRADE };
        }
    }
}
