/**
 * Sub-execução de um atuador dentro de uma tool do orquestrador, com o uso de
 * tokens somado ao run do orquestrador.
 *
 * `agent.asTool()` já compartilha o RunContext (e o `usage`) com o run pai. Os
 * atuadores com revisor (integralização, grade) não usam asTool: chamam `run()`
 * de novo no wrapper de revisão, e cada `run()` sem `context` cria um RunContext
 * novo — os tokens do sabia-4 dessas sub-execuções (inclusive a reexecução
 * depois de o revisor reprovar) sumiam do ai_usage_log do chat-send.
 *
 * Aqui cada sub-execução roda num RunContext próprio (não herda aprovações nem
 * toolInput do pai) e, ao terminar — com sucesso ou lançando, ex.: o
 * OutputGuardrailTripwireTriggered do revisor, que só dispara depois de o
 * modelo ter respondido e cobrado —, o usage dela é somado ao do pai.
 */

import { run, RunContext } from "@openai/agents";
import type { Agent, RunResult } from "@openai/agents";

export async function runSubAgente(
    agent: Agent<any, any>,
    input: string,
    pai?: RunContext<unknown>
): Promise<RunResult<unknown, Agent<any, any>>> {
    const contexto = new RunContext<unknown>();
    try {
        return await run(agent, input, { context: contexto });
    } finally {
        pai?.usage.add(contexto.usage);
    }
}
