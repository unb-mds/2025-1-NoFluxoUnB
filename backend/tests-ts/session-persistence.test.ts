/**
 * Fase 1 do orquestrador de chat (docs/chatbot-orquestrador.md), agora sobre o SDK
 * real @openai/agents.
 *
 * 1. Sessão sobrevive a reinício: uma nova instância de SupabaseSession com o mesmo
 *    session_id enxerga o histórico salvo por uma instância anterior.
 * 2. Sessões de usuários diferentes não vazam histórico.
 * 3. Reprodução do cenário do relatório de qualidade: uma pergunta sobre créditos,
 *    feita depois que o transcript já foi carregado do banco (sem o cliente reenviar o
 *    histórico), não deve fazer o agente pedir reenvio — testado através do fluxo real
 *    (SupabaseSession + darcyAgent + run() do SDK), só o client HTTP da Maritaca é
 *    mockado.
 */

process.env.MARITACA_API_KEY = "test-key";

import { Request, Response } from "express";
import type { AgentInputItem } from "@openai/agents";

// ---------------------------------------------------------------------------
// Fake Supabase: substitui SupabaseWrapper por um "banco" em memória que entende
// o subconjunto do query builder usado por SupabaseSession (from().select()
// .eq().order()/.limit()/.maybeSingle(), insert(), update(), delete()) + auth.getUser.
// ---------------------------------------------------------------------------
jest.mock("../src/supabase_wrapper", () => {
    type Row = Record<string, any>;

    const state: { sessions: Row[]; items: Row[] } = { sessions: [], items: [] };
    let itemSeq = 1;

    function tableFrom(table: "chat_sessions" | "chat_items") {
        const rows = table === "chat_sessions" ? state.sessions : state.items;

        return {
            select(cols: string) {
                const filtros: Array<[string, any]> = [];
                let ordenacao: { col: string; ascending: boolean } | null = null;
                let limite: number | null = null;
                let modoSingle: "maybe" | null = null;

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
                        modoSingle = "maybe";
                        return builder;
                    },
                    then(resolve: (v: any) => any) {
                        let resultado = rows.filter((r) => filtros.every(([c, v]) => r[c] === v));
                        if (ordenacao) {
                            const { col, ascending } = ordenacao;
                            resultado = [...resultado].sort((a, b) => {
                                const cmp = String(a[col]).localeCompare(String(b[col]));
                                return ascending ? cmp : -cmp;
                            });
                        }
                        if (limite != null) resultado = resultado.slice(0, limite);
                        if (modoSingle === "maybe") {
                            return resolve({ data: resultado[0] ?? null, error: null });
                        }
                        return resolve({ data: resultado, error: null });
                    },
                };
                void cols;
                return builder;
            },
            insert(payload: Row | Row[]) {
                const linhas = Array.isArray(payload) ? payload : [payload];
                const inseridas = linhas.map((r) => {
                    const row =
                        table === "chat_sessions"
                            ? { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }
                            : { id: itemSeq++, created_at: new Date(Date.now() + itemSeq).toISOString(), ...r };
                    rows.push(row);
                    return row;
                });
                const builder: any = {
                    then(resolve: (v: any) => any) {
                        return resolve({ data: inseridas, error: null });
                    },
                };
                return builder;
            },
            update(payload: Row) {
                const filtros: Array<[string, any]> = [];
                const builder: any = {
                    eq(col: string, val: any) {
                        filtros.push([col, val]);
                        return builder;
                    },
                    then(resolve: (v: any) => any) {
                        rows.forEach((r) => {
                            if (filtros.every(([c, v]) => r[c] === v)) Object.assign(r, payload);
                        });
                        return resolve({ data: null, error: null });
                    },
                };
                return builder;
            },
            delete() {
                const filtros: Array<[string, any]> = [];
                const builder: any = {
                    eq(col: string, val: any) {
                        filtros.push([col, val]);
                        return builder;
                    },
                    then(resolve: (v: any) => any) {
                        const restantes = rows.filter((r) => !filtros.every(([c, v]) => r[c] === v));
                        rows.length = 0;
                        rows.push(...restantes);
                        return resolve({ data: null, error: null });
                    },
                };
                return builder;
            },
        };
    }

    return {
        SupabaseWrapper: {
            get: () => ({
                from: tableFrom,
                auth: {
                    getUser: jest.fn(async (token: string) => {
                        // Convenção de teste: o token É o session_id/uuid do usuário.
                        if (!token) return { data: { user: null }, error: { message: "sem token" } };
                        return { data: { user: { id: token } }, error: null };
                    }),
                },
            }),
        },
    };
});

// ---------------------------------------------------------------------------
// Fake Maritaca: mocka só o client `openai` (chat.completions.create). O resto do
// SDK @openai/agents (Agent, run, OpenAIChatCompletionsModel, conversão de
// mensagens) roda de verdade — é isso que garante que o merge histórico+pergunta
// nova realmente acontece.
// ---------------------------------------------------------------------------
const mockCreate = jest.fn();

// Login/cota fora do escopo deste arquivo (ver darcy-login-cota.test.ts).
jest.mock("../src/utils/ia_acesso", () => require("./utils/ia_acesso_liberado").iaAcessoLiberado());
jest.mock("openai", () => {
    return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
            chat: { completions: { create: mockCreate } },
        })),
    };
});

import { SupabaseSession } from "../src/services/chat/supabase_session";

function itemUsuario(texto: string): AgentInputItem {
    return { type: "message", role: "user", content: texto } as AgentInputItem;
}

function itemAssistente(texto: string): AgentInputItem {
    return {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: texto }],
    } as AgentInputItem;
}

describe("Fase 1 — persistência de sessão de chat (SupabaseSession sobre @openai/agents)", () => {
    it("sessão sobrevive a reinício: nova instância com o mesmo session_id retorna o histórico salvo", async () => {
        const sessionId = "user-100";

        const sessaoAntesDoReinicio = new SupabaseSession(sessionId);
        await sessaoAntesDoReinicio.addItems([
            itemUsuario("Quantas matérias obrigatórias ainda faltam para mim?"),
            itemAssistente("Você já integralizou 180 das 220 horas obrigatórias — faltam 40 horas (~3 matérias)."),
        ]);

        // "Reinício": descarta a instância em memória e cria uma nova para o mesmo session_id.
        const sessaoDepoisDoReinicio = new SupabaseSession(sessionId);
        const historico = await sessaoDepoisDoReinicio.getItems();

        expect(historico).toEqual([
            itemUsuario("Quantas matérias obrigatórias ainda faltam para mim?"),
            itemAssistente("Você já integralizou 180 das 220 horas obrigatórias — faltam 40 horas (~3 matérias)."),
        ]);
    });

    it("sessões de usuários diferentes não vazam histórico uma para a outra", async () => {
        const sessaoUsuarioA = new SupabaseSession("user-201");
        const sessaoUsuarioB = new SupabaseSession("user-202");

        await sessaoUsuarioA.addItems([itemUsuario("mensagem só do usuário A")]);

        const historicoB = await sessaoUsuarioB.getItems();
        expect(historicoB).toEqual([]);
    });
});

import { ChatController } from "../src/controllers/chat_controller";

function criarMockResponse(): Response {
    const res: Partial<Response> = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
    };
    return res as Response;
}

describe("Fase 1 — cenário do relatório de qualidade (não pedir reenvio)", () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it("pergunta sobre créditos após transcript já carregado não pede reenvio", async () => {
        const sessionId = "user-300";

        // Turno anterior: estabelece contexto (carga horária) e é persistido.
        const sessaoAnterior = new SupabaseSession(sessionId);
        await sessaoAnterior.addItems([
            itemUsuario("Qual minha carga horária integralizada até agora?"),
            itemAssistente("Você já integralizou 180 das 220 horas obrigatórias — faltam 40 horas (~3 matérias)."),
        ]);

        // Um LLM real pede reenvio quando recebe uma pergunta de acompanhamento sem o
        // contexto anterior; simulamos esse comportamento aqui pra provar que o SDK +
        // SupabaseSession entregam o histórico completo.
        mockCreate.mockImplementation(async (requestData: any) => {
            const mensagens: Array<{ role: string; content: string }> = requestData.messages;
            const perguntaAtual = mensagens[mensagens.length - 1]?.content ?? "";
            const contextoAnterior = mensagens.slice(0, -1);
            const contextoTemCargaHoraria = contextoAnterior.some((m) =>
                /carga hor[aá]ria|horas obrigat[oó]rias|integraliz/i.test(m.content ?? "")
            );

            const reply =
                /cr[eé]ditos/i.test(perguntaAtual) && !contextoTemCargaHoraria
                    ? "Não tenho esse contexto ainda — pode me reenviar seu histórico acadêmico?"
                    : "Com base no que você já me contou, faltam 40 horas (~3 matérias) para você se formar.";

            return {
                choices: [{ message: { role: "assistant", content: reply } }],
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
            };
        });

        // "Reinício"/nova requisição: o cliente manda só a pergunta nova — o transcript
        // já foi carregado do banco pelo controller via SupabaseSession.
        const req = {
            headers: { authorization: `Bearer ${sessionId}` },
            body: { message: "quantos créditos me faltam para eu me formar?" },
        } as unknown as Request;
        const res = criarMockResponse();

        await ChatController.routes.send.value(req, res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(mockCreate).toHaveBeenCalledTimes(1);

        const mensagensEnviadas = mockCreate.mock.calls[0][0].messages;
        const contextoTemCargaHoraria = mensagensEnviadas.some((m: any) =>
            /carga hor[aá]ria|integraliz/i.test(m.content ?? "")
        );
        expect(contextoTemCargaHoraria).toBe(true);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                reply: expect.not.stringMatching(/reenviar|reenvie/i),
            })
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                reply: expect.stringContaining("40 horas"),
            })
        );
    });
});
