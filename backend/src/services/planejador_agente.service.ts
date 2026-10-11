/**
 * Serviço do Agente Planejador — Executa ferramentas (tools) e loop de tool calling
 * com a API da Maritaca (compatible com OpenAI). Modelo em config/maritaca.ts.
 *
 * Responsabilidades:
 *   - Executores das 4 tools: consultar_plano, simular_cenario, ajustar_carga, mover_materia
 *   - Loop de tool calling: chamadas à Maritaca, coleta de resultados, feedback
 *   - Guard-rails: máx 5 iterações, histórico truncado em 20 mensagens
 *   - Normalização de códigos (trim + uppercase)
 *
 * Spec: docs/chat-agente-planejador-spec.md
 * Design: docs/chat-agente-planejador-design.md (status: aprovado 2026-07-04)
 */

import { createControllerLogger } from "../utils/controller_logger";
import { MARITACA_URL, MARITACA_MODELS } from "../config/maritaca";
import { MaritacaSemCreditosError, isMaritacaSemCreditos } from "../config/maritaca_errors";
import type { PlanoFormaturav2 } from "../types/planejamento";
import {
    type MensagemChat,
    type AgenteContexto,
    type AgenteResultado,
    type LlmMessage,
    type ChamarLlmFn,
} from "./agente/context";
import { anexarUsageParcial, type LlmUsage } from "../utils/ai_usage_logger";
import { montarSystemPrompt } from "./agente/system_prompt";
import { consultarTurmasMateria } from "./agente/tools/materia_tools";
import { defaultRegistry } from "./agente/tools";

// Re-exports para compatibilidade com quem importa do service (controllers, testes).
export type {
    MensagemChat,
    RestricoesPlanoInternas,
    AgenteContexto,
    AgenteResultado,
    LlmMessage,
    ChamarLlmFn,
} from "./agente/context";

const logger = createControllerLogger("PlanejadorAgenteService", "conversar");

// =========================================================
// Constantes
// =========================================================

const MAX_ITERACOES = 5;
const MAX_HISTORICO = 20;

/** Prefixo do comando direto que responde sem LLM (consulta de turmas no banco). */
const COMANDO_TURMAS = "/turmas ";

/**
 * True quando a última mensagem do aluno é um comando direto respondido sem
 * LLM (`/turmas COD`). Os controllers usam isso para não gastar cota nem
 * registrar uso de IA — antes essas respostas iam para o ai_usage_log como
 * model 'desconhecido' com 0 tokens (~1s, o tempo da consulta ao banco).
 */
export function ehComandoDireto(historico: MensagemChat[]): boolean {
    const ultima = historico.slice(-MAX_HISTORICO).slice().reverse().find((m) => m.role === "user");
    return !!ultima && ultima.content.trim().toLowerCase().startsWith(COMANDO_TURMAS);
}

// =========================================================
// Executor de Tools — thin wrapper sobre o Tool Registry compartilhado.
// Mantido para compatibilidade (testes e chamadas internas via /planejamento/chat).
// =========================================================

export async function executarTool(
    nome: string,
    args: Record<string, unknown>,
    ctx: AgenteContexto
): Promise<{ resultado: string; planoAtualizado?: PlanoFormaturav2 }> {
    return defaultRegistry.execute(nome, args, ctx);
}

// =========================================================
// Serviço do Agente (Loop de Tool Calling)
// =========================================================

export class PlanejadorAgenteService {
    private chamarLlm: ChamarLlmFn;
    // Uso de tokens acumulado ao longo do loop de tool calling de UMA
    // chamada a conversar() — resetado no início dela (tracking de custo no
    // dashboard admin). Só é preenchido quando o LLM é o Maritaca de verdade
    // (this.chamarLlmMaritaca); um chamarLlm injetado (testes) não populariza.
    private usageCalls: LlmUsage[] = [];

    constructor(chamarLlm?: ChamarLlmFn) {
        this.chamarLlm = chamarLlm || this.chamarLlmMaritaca.bind(this);
    }

    isAvailable(): boolean {
        return !!process.env.MARITACA_API_KEY;
    }

    private async chamarLlmMaritaca(
        messages: any[],
        tools: any[]
    ): Promise<LlmMessage> {
        const apiKey = process.env.MARITACA_API_KEY;
        if (!apiKey) throw new Error("MARITACA_API_KEY não configurada");

        const response = await fetch(MARITACA_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Key ${apiKey}`,
            },
            // NÃO enviar web_search: a Maritaca ignora as tools quando ele está
            // ligado — tool_calls volta null e o modelo inventa que a ferramenta
            // falhou. As tools são o núcleo deste agente, então elas ganham.
            body: JSON.stringify({
                model: MARITACA_MODELS.AGENTE,
                messages,
                tools,
                tool_choice: "auto"
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            // Conta sem saldo: erro tratado (503 amigável no controller), não um 500 genérico.
            if (response.status === 403 && isMaritacaSemCreditos(err)) {
                throw new MaritacaSemCreditosError(
                    `Maritaca API error: ${response.status} ${err}`
                );
            }
            throw new Error(
                `Maritaca API error: ${response.status} ${err}`
            );
        }

        const data = (await response.json()) as any;
        const choice = data.choices?.[0];
        if (!choice) throw new Error("Nenhuma resposta do LLM");

        const u = data.usage;
        if (!u) {
            // Sem `usage` na resposta: registra a chamada mesmo assim, com o
            // modelo certo (0 tokens), em vez de sumir ou virar 'desconhecido'.
            logger.warn("Resposta da Maritaca sem `usage` — chamada registrada com 0 tokens");
            this.usageCalls.push({
                model: MARITACA_MODELS.AGENTE,
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            });
        } else {
            const prompt_tokens = u.prompt_tokens ?? 0;
            const completion_tokens = u.completion_tokens ?? 0;
            // Mesma ressalva já vista no agente Sabiá (mcp_agent/api_producao.py):
            // a Maritaca às vezes não preenche total_tokens — recalcula da soma.
            const total_tokens = u.total_tokens ?? (prompt_tokens + completion_tokens);
            this.usageCalls.push({
                model: MARITACA_MODELS.AGENTE,
                prompt_tokens,
                completion_tokens,
                total_tokens,
            });
        }

        return choice.message as LlmMessage;
    }

    async conversar(
        historico: MensagemChat[],
        ctx: AgenteContexto
    ): Promise<AgenteResultado> {
        // Reseta o acumulador de tokens desta chamada (tracking de custo).
        this.usageCalls = [];
        try {
            return await this.conversarSemReset(historico, ctx);
        } catch (erro) {
            // O que já foi cobrado antes da falha vai junto do erro: o
            // controller loga com success=false (ver usageParcialDoErro).
            throw anexarUsageParcial(erro, this.usageCalls);
        }
    }

    private async conversarSemReset(
        historico: MensagemChat[],
        ctx: AgenteContexto
    ): Promise<AgenteResultado> {
        // Truncar histórico nas últimas MAX_HISTORICO mensagens
        const historicoTruncado = historico.slice(-MAX_HISTORICO);

        // Interceptar comandos diretos (Bypass do LLM)
        const lastUserMsg = historicoTruncado.slice().reverse().find(m => m.role === "user");
        if (ehComandoDireto(historicoTruncado) && lastUserMsg) {
            const codigo = lastUserMsg.content.trim().substring(8).trim().toUpperCase();
            const turmasJson = await consultarTurmasMateria({ codigo });
            const turmasData = JSON.parse(turmasJson);

            if (turmasData.erro) {
                return {
                    reply: turmasData.erro,
                    restricoes: ctx.restricoes,
                    usage: this.usageCalls,
                    semLlm: true,
                };
            }

            const periodoStr = turmasData.periodo ? ` (${turmasData.periodo})` : '';
            const reply = `Aqui estão as turmas que encontrei para **${turmasData.codigo} - ${turmasData.nome_materia}**${periodoStr}:\n\n` + turmasData.turmas_recentes.join('\n');
            return {
                reply,
                restricoes: ctx.restricoes,
                usage: this.usageCalls,
                semLlm: true,
            };
        }

        const systemPrompt = montarSystemPrompt(ctx);

        // Tools do registry compartilhado, filtradas pelo contexto: as que dependem
        // de plano ficam ocultas quando o contexto é leve (ex: aba Assistente sem login).
        const tools = defaultRegistry.schemasFor(ctx);

        // Montar mensagens para o LLM
        let mensagensLlm: any[] = [
            { role: "system", content: systemPrompt },
            ...historicoTruncado.map((m) => ({
                role: m.role,
                content: m.content,
            })),
        ];

        let planoAtualizado: PlanoFormaturav2 | undefined;
        let iteracao = 0;

        // Loop de tool calling
        while (iteracao < MAX_ITERACOES) {
            iteracao++;

            logger.info(
                `[Iteração ${iteracao}] Chamando LLM com ${mensagensLlm.length} mensagens`
            );

            // Chamar LLM
            const resposta = await this.chamarLlm(mensagensLlm, tools);

            // Se conteúdo direto, não há tool call — retornar resposta
            if (resposta.content && !resposta.tool_calls) {
                logger.info(
                    `[Iteração ${iteracao}] Resposta final (sem tool call): ${resposta.content.slice(0, 50)}...`
                );
                return {
                    reply: resposta.content,
                    plano: planoAtualizado,
                    restricoes: ctx.restricoes,
                    usage: this.usageCalls,
                };
            }

            // Se há tool calls, executar
            if (resposta.tool_calls && resposta.tool_calls.length > 0) {
                // Adicionar resposta do assistente ao histórico
                mensagensLlm.push({
                    role: "assistant",
                    content: resposta.content,
                    tool_calls: resposta.tool_calls.map((tc) => ({
                        id: tc.id,
                        type: "function",
                        function: {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    })),
                });

                // Executar cada tool
                for (const toolCall of resposta.tool_calls) {
                    const nome = toolCall.function.name;
                    let args: Record<string, unknown> = {};
                    try {
                        args = JSON.parse(toolCall.function.arguments);
                    } catch {
                        args = {};
                    }

                    logger.info(
                        `[Iteração ${iteracao}] Executando tool: ${nome} com args: ${JSON.stringify(args)}`
                    );

                    const { resultado, planoAtualizado: novoPlano } = await executarTool(
                        nome,
                        args,
                        ctx
                    );
                    if (novoPlano) {
                        planoAtualizado = novoPlano;
                    }

                    // Adicionar resultado como mensagem de tool
                    mensagensLlm.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: resultado,
                    });
                }

                // Continuar o loop
                continue;
            }

            // Caso anômalo: resposta sem conteúdo e sem tool calls
            logger.warn(`[Iteração ${iteracao}] Resposta anômala do LLM`);
            return {
                reply: "Desculpe, não consegui processar sua pergunta.",
                plano: planoAtualizado,
                restricoes: ctx.restricoes,
                usage: this.usageCalls,
            };
        }

        // Guard-rail: máximo de iterações atingido
        logger.warn(
            `[Agente] Máximo de iterações (${MAX_ITERACOES}) atingido`
        );
        return {
            reply: `Desculpe, não consegui concluir sua solicitação após ${MAX_ITERACOES} tentativas. Tente reformular sua pergunta.`,
            plano: planoAtualizado,
            restricoes: ctx.restricoes,
            usage: this.usageCalls,
        };
    }
}
