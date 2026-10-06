/**
 * Fase 3 do orquestrador de chat (docs/chatbot-orquestrador.md): revisor numérico.
 *
 * 1. Guardrail dispara quando a resposta menciona um número que não está nos dados
 *    consultados pela tool (reprodução do exemplo do plano: "faltam 20 créditos"
 *    quando o banco diz outra coisa).
 * 2. runIntegralizacaoComRevisao reexecuta o atuador com o motivo da reprovação
 *    injetado no prompt, e a segunda tentativa (que usa o número certo) passa.
 */

process.env.MARITACA_API_KEY = "test-key";

import { run, OutputGuardrailTripwireTriggered, RunContext } from "@openai/agents";

type Row = Record<string, any>;
const db: { users: Row[]; historicos_usuarios: Row[] } = { users: [], historicos_usuarios: [] };

function tableFrom(table: keyof typeof db) {
    const rows = db[table];
    return {
        select(_cols: string) {
            const filtros: Array<[string, any]> = [];
            let ordenacao: { col: string; ascending: boolean } | null = null;
            let limite: number | null = null;
            let modoSingle = false;
            const builder: any = {
                eq(col: string, val: any) {
                    filtros.push([col, val]);
                    return builder;
                },
                order(col: string, opts: { ascending: boolean }) {
                    ordenacao = { col, ascending: opts.ascending };
                    return builder;
                },
                limit(n: number) {
                    limite = n;
                    return builder;
                },
                maybeSingle() {
                    modoSingle = true;
                    return builder;
                },
                then(resolve: (v: any) => any) {
                    // eslint-disable-next-line eqeqeq
                    let resultado = rows.filter((r) => filtros.every(([c, v]) => r[c] == v));
                    if (ordenacao) {
                        const { col, ascending } = ordenacao;
                        resultado = [...resultado].sort((a, b) => {
                            const cmp = String(a[col]).localeCompare(String(b[col]));
                            return ascending ? cmp : -cmp;
                        });
                    }
                    if (limite != null) resultado = resultado.slice(0, limite);
                    if (modoSingle) return resolve({ data: resultado[0] ?? null, error: null });
                    return resolve({ data: resultado, error: null });
                },
            };
            return builder;
        },
    };
}

jest.mock("../src/supabase_wrapper", () => ({
    SupabaseWrapper: { get: () => ({ from: (t: string) => tableFrom(t as keyof typeof db) }) },
}));

const mockCreate = jest.fn();
jest.mock("openai", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } })),
}));

import {
    createIntegralizacaoAgent,
    runIntegralizacaoComRevisao,
    RESPOSTA_ESCALONAMENTO_FASE4,
} from "../src/services/chat/actuators/integralizacao_actuator";

beforeEach(() => {
    mockCreate.mockReset();
    db.users.length = 0;
    db.historicos_usuarios.length = 0;
    db.users.push({ email: "aluno@unb.br", id_user: 42 });
    db.historicos_usuarios.push({
        id_user: 42,
        created_at: "2026-06-01T00:00:00.000Z",
        percentual_conclusao: 65,
        carga_horaria_integralizada: { total: 2400 },
        total_obrigatorias: 40,
        total_obrigatorias_concluidas: 32,
        total_obrigatorias_pendentes: 8,
    });
});

/** Sempre chama a tool na 1ª vez; na 2ª chamada (já com resultado de tool), devolve `resposta`. */
function mockLlmComRespostaFinal(resposta: string) {
    mockCreate.mockImplementation(async (requestData: any) => {
        const jaTemResultadoDeTool = requestData.messages.some((m: any) => m.role === "tool");
        if (!jaTemResultadoDeTool) {
            return {
                choices: [
                    {
                        message: {
                            role: "assistant",
                            content: null,
                            tool_calls: [
                                { id: "call_1", type: "function", function: { name: "consultar_integralizacao", arguments: "{}" } },
                            ],
                        },
                    },
                ],
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            };
        }
        return {
            choices: [{ message: { role: "assistant", content: resposta } }],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        };
    });
}

describe("Fase 3 — Revisor numérico (guardrail)", () => {
    it("dispara o guardrail quando a resposta cita um número que não está nos dados (alucinação)", async () => {
        mockLlmComRespostaFinal("Faltam 20 créditos pra você se formar.");

        const agente = createIntegralizacaoAgent("aluno@unb.br");

        await expect(run(agente, "quantos créditos faltam?")).rejects.toThrow(OutputGuardrailTripwireTriggered);
    });

    it("não dispara quando a resposta só usa números que estão nos dados consultados", async () => {
        mockLlmComRespostaFinal("Você já concluiu 65% da integralização — faltam 8 obrigatórias.");

        const agente = createIntegralizacaoAgent("aluno@unb.br");
        const resultado = await run(agente, "quantos créditos faltam?");

        expect(String(resultado.finalOutput)).toContain("65%");
    });
});

describe("Fase 3 — runIntegralizacaoComRevisao (reexecução com motivo da reprovação)", () => {
    it("reexecuta o atuador injetando o motivo da reprovação, e a segunda tentativa passa", async () => {
        let chamada = 0;
        mockCreate.mockImplementation(async (requestData: any) => {
            const jaTemResultadoDeTool = requestData.messages.some((m: any) => m.role === "tool");
            if (!jaTemResultadoDeTool) {
                chamada++;
                return {
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: null,
                                tool_calls: [
                                    { id: `call_${chamada}`, type: "function", function: { name: "consultar_integralizacao", arguments: "{}" } },
                                ],
                            },
                        },
                    ],
                    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
                };
            }

            // 1ª "rodada" completa (run #1) alucina um número; run #2 (reexecução,
            // com o motivo da reprovação injetado no input) responde certo.
            const mencionaMotivoDeRevisao = requestData.messages.some((m: any) =>
                /Revis[aã]o autom[aá]tica/i.test(m.content ?? "")
            );
            const resposta = mencionaMotivoDeRevisao
                ? "Você já concluiu 65% da integralização — faltam 8 obrigatórias."
                : "Faltam 20 créditos pra você se formar.";

            return {
                choices: [{ message: { role: "assistant", content: resposta } }],
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            };
        });

        const agente = createIntegralizacaoAgent("aluno@unb.br");
        const respostaFinal = await runIntegralizacaoComRevisao(agente, "quantos créditos faltam?");

        expect(respostaFinal).toContain("65%");
        expect(respostaFinal).not.toContain("20 créditos");

        // Prova que a reexecução realmente injetou o motivo da reprovação no prompt.
        const algumaChamadaMencionouMotivo = mockCreate.mock.calls.some(([req]) =>
            req.messages.some((m: any) => /Revis[aã]o autom[aá]tica/i.test(m.content ?? ""))
        );
        expect(algumaChamadaMencionouMotivo).toBe(true);
    });
});

describe("Fase 4 — escalonamento condicional (reprovou duas vezes seguidas)", () => {
    it("quando a reexecução TAMBÉM aluciona um número, escalona pra resposta padrão em vez de devolver dado não verificado", async () => {
        // Tanto a 1ª tentativa quanto a reexecução citam um número que não está nos dados.
        mockLlmComRespostaFinal("Faltam 20 créditos pra você se formar.");

        const agente = createIntegralizacaoAgent("aluno@unb.br");
        const respostaFinal = await runIntegralizacaoComRevisao(agente, "quantos créditos faltam?");

        expect(respostaFinal).toBe(RESPOSTA_ESCALONAMENTO_FASE4);
        expect(respostaFinal).not.toContain("20 créditos");
    });

    it("não escalona (nem gasta a 2ª chamada) quando a 1ª tentativa já passa no revisor — sem custo extra no caminho comum", async () => {
        mockLlmComRespostaFinal("Você já concluiu 65% da integralização — faltam 8 obrigatórias.");

        const agente = createIntegralizacaoAgent("aluno@unb.br");
        const respostaFinal = await runIntegralizacaoComRevisao(agente, "quantos créditos faltam?");

        expect(respostaFinal).toContain("65%");
        // 1 chamada de tool-call + 1 chamada de resposta final = 2, nenhuma reexecução.
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });
});

describe("custo das sub-execuções no run do orquestrador (ai_usage_log do chat-send)", () => {
    // Cada chamada do mock custa 5 + 5 = 10 tokens (mockLlmComRespostaFinal).
    it("soma no RunContext do pai as duas execuções quando o revisor reprova e reexecuta", async () => {
        mockLlmComRespostaFinal("Faltam 20 créditos pra você se formar."); // reprova 2x → escalona

        const pai = new RunContext<unknown>();
        const agente = createIntegralizacaoAgent("aluno@unb.br");
        await runIntegralizacaoComRevisao(agente, "quantos créditos faltam?", pai);

        // 2 execuções × (tool call + resposta) = 4 chamadas pagas, todas no pai
        // (antes: 0 — cada run() criava um RunContext novo e o usage sumia).
        expect(mockCreate).toHaveBeenCalledTimes(4);
        expect(pai.usage.requests).toBe(4);
        expect(pai.usage.inputTokens).toBe(20);
        expect(pai.usage.outputTokens).toBe(20);
    });

    it("caminho comum (aprovado de primeira) soma só a execução feita", async () => {
        mockLlmComRespostaFinal("Você já concluiu 65% da integralização — faltam 8 obrigatórias.");

        const pai = new RunContext<unknown>();
        await runIntegralizacaoComRevisao(createIntegralizacaoAgent("aluno@unb.br"), "quantos créditos faltam?", pai);

        expect(pai.usage.requests).toBe(2);
        expect(pai.usage.totalTokens).toBe(20);
    });
});
