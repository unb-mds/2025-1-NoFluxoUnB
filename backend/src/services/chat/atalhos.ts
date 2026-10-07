/**
 * Atalhos do `/chat/send` que respondem sem chamar o modelo.
 *
 * `/turmas COD` vem dos botões do Plano de Formatura ("ver turmas"): a resposta é
 * só a lista de turmas, então gastar uma chamada ao LLM não acrescenta nada.
 * Porte do bypass do loop legado (`planejador_agente.service.ts`, `conversar`),
 * com a mesma saída.
 */

import type { AgentInputItem } from "@openai/agents";
import { consultarTurmasMateria } from "../agente/tools/materia_tools";

/** A mensagem é um atalho `/turmas`? Devolve o código, ou `null`. */
export function codigoDoAtalhoTurmas(message: string): string | null {
    const m = message.trim();
    if (!m.toLowerCase().startsWith("/turmas ")) return null;
    const codigo = m.substring(8).trim().toUpperCase();
    return codigo || null;
}

/** Resposta do atalho `/turmas COD` — mesmo texto do loop legado. */
export async function responderAtalhoTurmas(codigo: string): Promise<string> {
    const turmasData = JSON.parse(await consultarTurmasMateria({ codigo }));
    if (turmasData.erro) return String(turmasData.erro);
    const periodoStr = turmasData.periodo ? ` (${turmasData.periodo})` : "";
    return (
        `Aqui estão as turmas que encontrei para **${turmasData.codigo} - ${turmasData.nome_materia}**${periodoStr}:\n\n` +
        (turmasData.turmas_recentes ?? []).join("\n")
    );
}

/**
 * Itens de sessão de uma troca respondida fora do modelo — no mesmo formato que o
 * SDK grava, para a troca aparecer no `/chat/historico` e servir de contexto às
 * próximas mensagens.
 */
export function itensDaTroca(pergunta: string, resposta: string): AgentInputItem[] {
    return [
        { role: "user", content: pergunta },
        {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: resposta }],
        },
    ] as AgentInputItem[];
}
