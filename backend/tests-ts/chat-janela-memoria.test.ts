/**
 * Consistência da memória da Darcy: a janela do prompt conta TURNOS (não itens),
 * mantém o fio da conversa como texto e encurta resultado de tool antigo; a
 * consolidação resume conversa longa em blocos sem pular o começo e nunca apaga
 * a memória por uma resposta vazia do modelo.
 */
import type { AgentInputItem } from "@openai/agents";

jest.mock("../src/supabase_wrapper", () => {
    type Row = Record<string, any>;
    const state: { sessions: Row[]; items: Row[] } = { sessions: [], items: [] };
    function from(table: "chat_sessions" | "chat_items") {
        const rows = () => (table === "chat_sessions" ? state.sessions : state.items);
        return {
            select() {
                const filtros: Array<(r: Row) => boolean> = [];
                let asc = true;
                let limite: number | null = null;
                let single = false;
                const b: any = {
                    eq(c: string, v: any) { filtros.push((r) => r[c] === v); return b; },
                    gt(c: string, v: any) { filtros.push((r) => r[c] > v); return b; },
                    order(_c: string, o: { ascending: boolean }) { asc = o.ascending; return b; },
                    limit(n: number) { limite = n; return b; },
                    maybeSingle() { single = true; return b; },
                    then(resolve: (v: any) => any) {
                        let out = rows()
                            .filter((r) => filtros.every((f) => f(r)))
                            .sort((a, z) => (a.id - z.id) * (asc ? 1 : -1));
                        if (limite !== null) out = out.slice(0, limite);
                        return Promise.resolve(single ? { data: out[0] ?? null, error: null } : { data: out, error: null }).then(resolve);
                    },
                };
                return b;
            },
            update(valores: Row) {
                return {
                    eq(c: string, v: any) {
                        rows().filter((r) => r[c] === v).forEach((r) => Object.assign(r, valores));
                        return Promise.resolve({ error: null });
                    },
                };
            },
        };
    }
    return { SupabaseWrapper: { get: () => ({ from }) }, __state: state };
});
jest.mock("../src/utils/ai_usage_logger", () => ({ logAiUsage: jest.fn() }));

import {
    compactarResultadosAntigos,
    inicioDosUltimosTurnos,
    montarJanela,
    TETO_RESULTADO_ANTIGO_CARACTERES,
} from "../src/services/chat/supabase_session";
import {
    consolidarMemoria,
    dividirEmBlocos,
    limparCacheMemoria,
    MAX_BLOCOS_POR_CONSOLIDACAO,
    TETO_TRECHO_CARACTERES,
} from "../src/services/chat/memoria_aluno";

const { __state: db } = jest.requireMock("../src/supabase_wrapper") as { __state: { sessions: any[]; items: any[] } };

const usuario = (text: string) => ({ role: "user", content: text }) as unknown as AgentInputItem;
const darcy = (text: string) => ({ role: "assistant", content: text }) as unknown as AgentInputItem;
const chamada = () => ({ type: "function_call", name: "t", callId: "c", arguments: "{}" }) as unknown as AgentInputItem;
const resultado = (output: unknown) =>
    ({ type: "function_call_result", name: "t", callId: "c", status: "completed", output }) as unknown as AgentInputItem;

describe("janela do prompt", () => {
    it("conta turnos: cada turno começa numa mensagem do aluno", () => {
        const itens = [darcy("solta"), usuario("a"), chamada(), resultado("x"), darcy("ra"), usuario("b"), darcy("rb")];
        expect(inicioDosUltimosTurnos(itens, 1)).toBe(5);
        expect(inicioDosUltimosTurnos(itens, 2)).toBe(1);
        expect(inicioDosUltimosTurnos(itens, 10)).toBe(1);
        expect(inicioDosUltimosTurnos([darcy("x")], 3)).toBe(1);
    });

    it("turnos antigos viram só pergunta + resposta final; os últimos vão com as tools", () => {
        const itens: AgentInputItem[] = [];
        for (let i = 0; i < 5; i++) itens.push(usuario(`p${i}`), darcy(`vou ver ${i}`), chamada(), resultado("{}"), darcy(`r${i}`));
        const janela = montarJanela(itens, 2) as any[];
        expect(janela.slice(0, 6).map((i) => i.content)).toEqual(["p0", "r0", "p1", "r1", "p2", "r2"]);
        expect(janela.filter((i) => i.type === "function_call")).toHaveLength(2);
        expect(janela[janela.length - 1].content).toBe("r4");
    });

    const grande = "x".repeat(TETO_RESULTADO_ANTIGO_CARACTERES * 5);

    it("encurta resultado de tool de turno anterior e mantém o do turno atual inteiro", () => {
        const out = compactarResultadosAntigos([usuario("a"), resultado(grande), usuario("b"), resultado(grande)]) as any[];
        expect(out[1].output.length).toBeLessThan(grande.length);
        expect(out[1].output).toContain("resumido");
        expect(out[3].output).toBe(grande);
    });

    it("trata output de texto estruturado e não mexe em resultado pequeno", () => {
        const out = compactarResultadosAntigos([
            usuario("a"),
            resultado({ type: "text", text: grande }),
            resultado("curto"),
            usuario("b"),
        ]) as any[];
        expect(out[1].output.text.length).toBeLessThan(grande.length);
        expect(out[2].output).toBe("curto");
    });
});

describe("consolidação", () => {
    const SID = "aluno-1";
    let seq = 0;
    const turno = (p: string, r: string) => {
        db.items.push({ id: ++seq, session_id: SID, conversa_id: "arq", item: { role: "user", content: p } });
        db.items.push({ id: ++seq, session_id: SID, conversa_id: "arq", item: { role: "assistant", content: r } });
    };

    beforeEach(() => {
        db.sessions.length = 0;
        db.items.length = 0;
        db.sessions.push({ session_id: SID, memoria: null, memoria_ate: null });
        seq = 0;
        limparCacheMemoria();
    });

    it("blocos são turnos inteiros dentro do teto", () => {
        const linhas = [usuario("a".repeat(60)), darcy("b".repeat(60)), usuario("c".repeat(60)), darcy("d")].map((item) => ({ item }));
        expect(dividirEmBlocos(linhas, 150).map((b) => b.length)).toEqual([2, 2]);
    });

    it("conversa longa arquivada: o começo também vira memória (em blocos, cursor bloco a bloco)", async () => {
        for (let i = 0; i < 40; i++) turno(`COMECO-${i} ${"p".repeat(500)}`, "r".repeat(500));
        const chamar = jest.fn(async (_p: string) => "- fato");

        await consolidarMemoria(SID, { tudo: true, chamar });

        const prompts = chamar.mock.calls.map((c) => c[0]);
        expect(prompts.length).toBeGreaterThan(1);
        expect(prompts.length).toBeLessThanOrEqual(MAX_BLOCOS_POR_CONSOLIDACAO);
        expect(prompts[0]).toContain("COMECO-0 ");
        expect(prompts.every((p) => p.length < TETO_TRECHO_CARACTERES + 3000)).toBe(true);
        // Cursor no fim de um turno; o que não coube nos blocos fica para a próxima.
        const cursor = db.sessions[0].memoria_ate;
        expect(cursor % 2).toBe(0);
        expect(cursor).toBeLessThan(seq);
    });

    it("cada bloco parte da memória que o bloco anterior produziu", async () => {
        for (let i = 0; i < 40; i++) turno(`p${i} ${"p".repeat(500)}`, "r".repeat(500));
        let k = 0;
        const chamar = jest.fn(async (_p: string) => `- fato ${++k}`);

        await consolidarMemoria(SID, { tudo: true, chamar });

        expect(chamar.mock.calls[1][0]).toContain("- fato 1");
    });

    it("resposta vazia do modelo não apaga a memória que já existia", async () => {
        db.sessions[0].memoria = "- prefere manhã";
        for (let i = 0; i < 3; i++) turno(`p${i}`, `r${i}`);

        await consolidarMemoria(SID, { tudo: true, chamar: async () => "(vazio)" });

        expect(db.sessions[0].memoria).toBe("- prefere manhã");
        expect(db.sessions[0].memoria_ate).toBe(seq);
    });
});
