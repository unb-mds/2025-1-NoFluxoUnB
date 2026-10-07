/**
 * Marcadores interativos da Darcy (docs/darcy-unificada.md, "Ações no chat"):
 * [TURMA] com 9 campos (tool e atalho /turmas) e [MONTAR_GRADE] canônico gerado
 * a partir da opcaoGrade, gravado na sessão como texto final.
 */

process.env.MARITACA_API_KEY = "test-key";

// ---------------------------------------------------------------------------
// Fake Supabase mínimo: select/eq/order/limit/single/maybeSingle + insert/update/
// delete, rpc e auth.getUser.
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let proximoId = 1;
const tabela = (nome: string): Row[] => (db[nome] ??= []);

function tableFrom(nome: string) {
    const filtros: Array<(r: Row) => boolean> = [];
    let ordem: { col: string; asc: boolean } | null = null;
    let limite: number | null = null;
    let single = false;
    let op: { t: "select" } | { t: "update"; v: Row } | { t: "delete" } = { t: "select" };
    const exec = () => {
        const rows = tabela(nome);
        if (op.t === "delete") {
            db[nome] = rows.filter((r) => !filtros.every((f) => f(r)));
            return { data: null, error: null };
        }
        if (op.t === "update") {
            const v = op.v;
            for (const r of rows) if (filtros.every((f) => f(r))) Object.assign(r, v);
            return { data: null, error: null };
        }
        let out = rows.filter((r) => filtros.every((f) => f(r)));
        if (ordem) {
            const { col, asc } = ordem;
            out = [...out].sort((a, b) => (String(a[col]).localeCompare(String(b[col]))) * (asc ? 1 : -1));
        }
        if (limite != null) out = out.slice(0, limite);
        return single ? { data: out[0] ?? null, error: out[0] ? null : { message: "not found" } } : { data: out, error: null };
    };
    const b: any = {
        select: () => b,
        update: (v: Row) => ((op = { t: "update", v }), b),
        delete: () => ((op = { t: "delete" }), b),
        insert: async (v: Row | Row[]) => {
            for (const x of Array.isArray(v) ? v : [v]) tabela(nome).push({ id: proximoId, created_at: String(proximoId++).padStart(8, "0"), ...x });
            return { data: null, error: null };
        },
        // eslint-disable-next-line eqeqeq
        eq: (c: string, v: any) => (filtros.push((r) => r[c] == v), b),
        order: (c: string, o: { ascending: boolean }) => ((ordem = { col: c, asc: o.ascending }), b),
        limit: (n: number) => ((limite = n), b),
        single: () => ((single = true), b),
        maybeSingle: () => ((single = true), b),
        then: (resolve: (v: any) => any) => {
            const r = exec();
            // maybeSingle não erra quando não acha.
            return resolve(single && r.error ? { data: null, error: null } : r);
        },
    };
    return b;
}

jest.mock("../src/supabase_wrapper", () => ({
    SupabaseWrapper: {
        get: () => ({
            from: (t: string) => tableFrom(t),
            rpc: async () => ({ data: "2026.2", error: null }),
            auth: {
                getUser: async (token: string) =>
                    token === "token-valido"
                        ? { data: { user: { id: "auth-uuid-1", email: "aluno@unb.br" } }, error: null }
                        : { data: { user: null }, error: { message: "inválido" } },
            },
        }),
    },
}));

// Orquestrador e perfil simulados: o teste é do controller, não do modelo.
const efeitosMock = jest.fn();
jest.mock("../src/services/chat/orquestrador_agent", () => ({
    createOrquestradorAgent: () => ({ name: "fake" }),
    obterEfeitosDoOrquestrador: () => efeitosMock(),
}));
jest.mock("../src/services/chat/perfil_aluno", () => ({
    montarPerfilAluno: async () => null,
}));

const runMock = jest.fn();
jest.mock("@openai/agents", () => {
    const real = jest.requireActual("@openai/agents");
    return { ...real, run: (...args: any[]) => runMock(...args) };
});

import { canonicalizarResposta, marcadorGradePronta } from "../src/services/chat/marcadores";
import { marcadorTurma, consultarTurmasMateria } from "../src/services/agente/tools/materia_tools";
import { responderAtalhoTurmas } from "../src/services/chat/atalhos";
import { ChatController } from "../src/controllers/chat_controller";

function fakeRes() {
    const res: any = { statusCode: 0, body: undefined };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: unknown) => ((res.body = b), res);
    return res;
}

// "9 campos" do contrato = a tag TURMA + 8 valores (turma..idTurma).
const RE_TURMA_9 = /^\[TURMA\|([^|\]]*\|){7}[^|\]]*\]$/;

beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k];
    proximoId = 1;
    efeitosMock.mockReset();
    runMock.mockReset();
});

describe("[MONTAR_GRADE] canônico", () => {
    const opcao = { estrategia: "menos_dias", selecao: [{ codigo: "fga0242", idTurma: 11 }, { codigo: "MAT0026", idTurma: 7 }] };

    it("gera COD:ID em maiúsculas, sem outros campos", () => {
        expect(marcadorGradePronta(opcao)).toBe("[MONTAR_GRADE|FGA0242:11,MAT0026:7]");
    });

    it("remove o marcador do modelo (mesmo errado) e anexa o canônico no fim", () => {
        const doModelo = "Montei sua grade com 2 dias de aula.\n\n[MONTAR_GRADE|FGA0242:99|M,T|FGA0242=Fulano|0]\nQualquer coisa me chama.";
        const final = canonicalizarResposta(doModelo, opcao);
        expect(final).not.toContain("FGA0242:99");
        expect(final.match(/\[MONTAR_GRADE\|/g)).toHaveLength(1);
        expect(final.endsWith("[MONTAR_GRADE|FGA0242:11,MAT0026:7]")).toBe(true);
        expect(final).toContain("Qualquer coisa me chama.");
    });

    it("sem opcaoGrade o texto do modelo fica intacto (inclusive sugestão só com códigos)", () => {
        const t = "Cabe FGA0242 na segunda.\n[MONTAR_GRADE|FGA0242]";
        expect(canonicalizarResposta(t, null)).toBe(t);
    });

    it("opcaoGrade vazia não apaga nada", () => {
        const t = "texto [MONTAR_GRADE|FGA0242]";
        expect(canonicalizarResposta(t, { estrategia: "x", selecao: [] })).toBe(t);
    });
});

describe("[TURMA] com 9 campos", () => {
    it("marcadorTurma monta os 9 campos e neutraliza | e ] dentro dos valores", () => {
        const m = marcadorTurma({
            turma: "B",
            docente: "RAFAEL | MORGADO",
            horario: "24M12",
            local: "FGA - I8]",
            vagas: "30/40",
            periodo: "",
            codigo: "IFD0171",
            idTurma: 123,
        });
        expect(m).toMatch(RE_TURMA_9);
        expect(m).toBe("[TURMA|B|RAFAEL   MORGADO|24M12|FGA - I8|30/40||IFD0171|123]");
    });

    function semearTurmas() {
        tabela("materias").push({ id_materia: 5, codigo_materia: "IFD0171", nome_materia: "Física 1" });
        tabela("turmas").push({
            id_turmas: 321,
            id_materia: 5,
            turma: "B",
            docente: "RAFAEL MORGADO",
            horario: "24M12",
            local: "PJC BT 12",
            vagas_ofertadas: 40,
            vagas_ocupadas: 30,
            ano_periodo: "2026.2",
        });
    }

    it("a tool consultar_turmas_materia emite [TURMA] com código e id_turmas", async () => {
        semearTurmas();
        const out = JSON.parse(await consultarTurmasMateria({ codigo: "ifd0171" }));
        expect(out.turmas_recentes).toEqual(["[TURMA|B|RAFAEL MORGADO|24M12|PJC BT 12|30/40|2026.2|IFD0171|321]"]);
        expect(out.instrucao_llm).toContain("COPIE E COLE EXATAMENTE");
    });

    it("o atalho /turmas sai com o mesmo marcador de 9 campos", async () => {
        semearTurmas();
        const reply = await responderAtalhoTurmas("IFD0171");
        expect(reply).toContain("[TURMA|B|RAFAEL MORGADO|24M12|PJC BT 12|30/40|2026.2|IFD0171|321]");
    });
});

describe("/chat/send grava o texto final na sessão", () => {
    it("reply e /chat/historico trazem o [MONTAR_GRADE] canônico, não o do modelo", async () => {
        const textoModelo = "Pronto, ficou em 3 dias.\n[MONTAR_GRADE|FGA0242:1]";
        // Simula o SDK: grava pergunta + resposta do modelo na sessão e devolve o texto.
        runMock.mockImplementation(async (_agent: unknown, message: string, opts: { session: any }) => {
            await opts.session.addItems([
                { role: "user", content: message },
                { type: "function_call", name: "montar_grade", callId: "c1", arguments: "{}" },
                { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: textoModelo }] },
            ]);
            return { finalOutput: textoModelo, state: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } };
        });
        efeitosMock.mockReturnValue({
            opcaoGrade: { estrategia: "menos_dias", selecao: [{ codigo: "FGA0242", idTurma: 11 }] },
            plano: null,
            restricoes: null,
        });

        const res = fakeRes();
        await ChatController.routes.send.value(
            { headers: { authorization: "Bearer token-valido" }, body: { message: "monta minha grade", superficie: "plano" } } as any,
            res
        );
        expect(res.statusCode).toBe(200);
        expect(res.body.reply).toBe("Pronto, ficou em 3 dias.\n\n[MONTAR_GRADE|FGA0242:11]");
        expect(res.body.opcaoGrade.selecao).toEqual([{ codigo: "FGA0242", idTurma: 11 }]);

        const hist = fakeRes();
        await ChatController.routes.historico.value({ headers: { authorization: "Bearer token-valido" } } as any, hist);
        expect(hist.body.mensagens).toEqual([
            { role: "user", content: "monta minha grade" },
            { role: "assistant", content: res.body.reply },
        ]);
    });

    it("sem opcaoGrade a resposta e a sessão ficam como o modelo escreveu", async () => {
        const textoModelo = "Quer que eu adie?\n[BOTAO|Sim, adiar|Adie a matéria MAT0026]";
        runMock.mockImplementation(async (_a: unknown, message: string, opts: { session: any }) => {
            await opts.session.addItems([
                { role: "user", content: message },
                { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: textoModelo }] },
            ]);
            return { finalOutput: textoModelo, state: { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } } };
        });
        efeitosMock.mockReturnValue({ opcaoGrade: null, plano: null, restricoes: null });

        const res = fakeRes();
        await ChatController.routes.send.value(
            { headers: { authorization: "Bearer token-valido" }, body: { message: "tá pesado", superficie: "plano" } } as any,
            res
        );
        expect(res.body.reply).toBe(textoModelo);
    });
});
