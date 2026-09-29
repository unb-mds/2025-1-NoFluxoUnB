/**
 * Atuador de integralização/créditos — Fase 2 do orquestrador de chat
 * (docs/chatbot-orquestrador.md).
 *
 * Isolado e testável sozinho: só sabe responder sobre progresso de integralização
 * do aluno autenticado (percentual concluído, carga horária, obrigatórias
 * pendentes), lendo `historicos_usuarios` — a mesma tabela que a tool
 * `consultar_historico_aluno` do Darcy legado já usa (src/services/agente/tools/aluno_tools.ts)
 * — sem depender do pipeline pesado de contexto de plano (AgenteContexto).
 */

import { z } from "zod";
import { Agent, tool, OutputGuardrailTripwireTriggered } from "@openai/agents";
import type { OutputGuardrail, RunContext } from "@openai/agents";
import { runSubAgente } from "../sub_run";
import { SupabaseWrapper } from "../../../supabase_wrapper";
import { createMaritacaModel } from "../model_provider";

async function resolveIdUserPorEmail(email: string): Promise<string | null> {
    const { data, error } = await SupabaseWrapper.get()
        .from("users")
        .select("id_user")
        .eq("email", email)
        .maybeSingle();

    if (error || !data?.id_user) return null;
    return String(data.id_user);
}

export async function consultarIntegralizacao(email: string): Promise<string> {
    const idUser = await resolveIdUserPorEmail(email);
    if (!idUser) {
        return JSON.stringify({ erro: "Não encontrei o cadastro deste usuário." });
    }

    const { data, error } = await SupabaseWrapper.get()
        .from("historicos_usuarios")
        .select(
            "percentual_conclusao, carga_horaria_integralizada, total_obrigatorias, total_obrigatorias_concluidas, total_obrigatorias_pendentes"
        )
        .eq("id_user", idUser)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        return JSON.stringify({ erro: "Falha ao consultar integralização." });
    }
    if (!data) {
        return JSON.stringify({ aviso: "Nenhum histórico encontrado para este aluno ainda." });
    }

    return JSON.stringify({
        percentualConclusao: data.percentual_conclusao ?? null,
        cargaHorariaIntegralizada: data.carga_horaria_integralizada ?? null,
        obrigatorias: {
            total: data.total_obrigatorias ?? null,
            concluidas: data.total_obrigatorias_concluidas ?? null,
            pendentes: data.total_obrigatorias_pendentes ?? null,
        },
    });
}

/**
 * Fase 3 — revisor numérico (docs/chatbot-orquestrador.md): guarda o resultado bruto
 * da última chamada à tool nesta closure (uma por agente/request — createIntegralizacaoAgent
 * é sempre chamado de novo por requisição) e compara com os números citados na
 * resposta final do agente. Heurística simples: todo número >1 na resposta precisa
 * aparecer literalmente nos dados consultados; senão, é tratado como possível
 * alucinação e o guardrail dispara.
 */
function criarRevisorNumerico(getUltimoResultadoTool: () => string | null): OutputGuardrail {
    return {
        name: "revisor_numerico_integralizacao",
        execute: async ({ agentOutput }) => {
            const ultimoResultadoTool = getUltimoResultadoTool();
            if (!ultimoResultadoTool) {
                return { tripwireTriggered: false, outputInfo: null };
            }

            const texto = typeof agentOutput === "string" ? agentOutput : JSON.stringify(agentOutput);
            const numerosNaResposta = new Set((texto.match(/\d+/g) ?? []).map(Number));
            const numerosNosDados = new Set((ultimoResultadoTool.match(/\d+/g) ?? []).map(Number));

            const numeroInventado = [...numerosNaResposta].find((n) => n > 1 && !numerosNosDados.has(n));
            if (numeroInventado !== undefined) {
                return {
                    tripwireTriggered: true,
                    outputInfo: {
                        motivo: `A resposta menciona o número ${numeroInventado}, que não aparece nos dados consultados (${ultimoResultadoTool}).`,
                    },
                };
            }
            return { tripwireTriggered: false, outputInfo: null };
        },
    };
}

export function createIntegralizacaoAgent(email: string): Agent {
    let ultimoResultadoTool: string | null = null;

    const consultarIntegralizacaoTool = tool({
        name: "consultar_integralizacao",
        description:
            "Consulta o progresso de integralização REAL do aluno autenticado: percentual concluído, carga horária integralizada e obrigatórias pendentes.",
        parameters: z.object({}),
        execute: async () => {
            const resultado = await consultarIntegralizacao(email);
            ultimoResultadoTool = resultado;
            return resultado;
        },
    });

    return new Agent({
        name: "AtuadorIntegralizacao",
        instructions:
            "Você responde SOMENTE perguntas sobre integralização, créditos, carga horária ou progresso do aluno. " +
            "Sempre use a tool consultar_integralizacao antes de responder — nunca invente números. " +
            "Responda em português brasileiro, direto e conciso.",
        model: createMaritacaModel(),
        tools: [consultarIntegralizacaoTool],
        outputGuardrails: [criarRevisorNumerico(() => ultimoResultadoTool)],
    });
}

/**
 * Resposta padrão de escalonamento da Fase 4 — nunca inventa nem repassa um número
 * que não sobreviveu ao revisor duas vezes seguidas.
 */
export const RESPOSTA_ESCALONAMENTO_FASE4 =
    "Não tenho certeza dos números pra essa pergunta agora — confira a integralização exata na tela de Fluxograma.";

function motivoDaReprovacao(erro: OutputGuardrailTripwireTriggered<any>): string {
    return (
        (erro.result.output.outputInfo as { motivo?: string } | null)?.motivo ??
        "a resposta não bateu com os dados consultados"
    );
}

/**
 * Fase 3 — roda o atuador e, se o revisor reprovar a resposta (alucinação numérica),
 * reexecuta UMA vez com o motivo da reprovação injetado no prompt.
 *
 * Fase 4 (condicional — docs/chatbot-orquestrador.md) — integralização é a categoria de
 * alto risco citada no plano (é matemática, não deveria ter margem de erro), então o
 * segundo gatilho da Fase 4 já vale sempre aqui. Só falta o primeiro: se a REEXECUÇÃO
 * também for reprovada pelo revisor (reprovou duas vezes seguidas), escalona pra
 * resposta padrão em vez de devolver um número não verificado ou estourar erro pro
 * usuário. Não roda em toda mensagem — só no caminho raro em que a 1ª tentativa já
 * falhou a revisão.
 */
export async function runIntegralizacaoComRevisao(
    agent: Agent,
    input: string,
    pai?: RunContext<unknown>
): Promise<string> {
    try {
        const resultado = await runSubAgente(agent, input, pai);
        return String(resultado.finalOutput ?? "");
    } catch (erro) {
        if (!(erro instanceof OutputGuardrailTripwireTriggered)) throw erro;

        const motivo = motivoDaReprovacao(erro);
        try {
            const resultadoCorrigido = await runSubAgente(
                agent,
                `${input}\n\n[Revisão automática] Sua resposta anterior foi rejeitada: ${motivo}. ` +
                    "Responda de novo, usando exatamente os números retornados pela tool consultar_integralizacao.",
                pai
            );
            return String(resultadoCorrigido.finalOutput ?? "");
        } catch (segundoErro) {
            if (!(segundoErro instanceof OutputGuardrailTripwireTriggered)) throw segundoErro;
            // Fase 4: reprovou duas vezes seguidas — escalona em vez de insistir de novo.
            return RESPOSTA_ESCALONAMENTO_FASE4;
        }
    }
}
