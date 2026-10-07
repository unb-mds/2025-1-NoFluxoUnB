/**
 * Darcy única (docs/darcy-unificada.md): perfil do aluno no prompt, canal lateral
 * do plano, janela da sessão, compatibilidade do body antigo e o atalho /turmas.
 */

process.env.MARITACA_API_KEY = "test-key";

import { run } from "@openai/agents";

// ---------------------------------------------------------------------------
// Fake Supabase genérico: select/eq/in/order/limit/maybeSingle + insert/update/
// delete, auth.getUser e rpc. Comparação frouxa em eq, como o Postgres faz com
// bigint vindo como string.
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let proximoId = 1;

function tabela(nome: string): Row[] {
    if (!db[nome]) db[nome] = [];
    return db[nome];
}

function tableFrom(nome: string) {
    const filtros: Array<(r: Row) => boolean> = [];
    let ordenacao: { col: string; ascending: boolean } | null = null;
    let limite: number | null = null;
    let single = false;
    let operacao: { tipo: "select" } | { tipo: "update"; valores: Row } | { tipo: "delete" } = { tipo: "select" };

    const executar = () => {
        const rows = tabela(nome);
        if (operacao.tipo === "delete") {
            db[nome] = rows.filter((r) => !filtros.every((f) => f(r)));
            return { data: null, error: null };
        }
        if (operacao.tipo === "update") {
            for (const r of rows) if (filtros.every((f) => f(r))) Object.assign(r, operacao.valores);
            return { data: null, error: null };
        }
        let out = rows.filter((r) => filtros.every((f) => f(r)));
        if (ordenacao) {
            const { col, ascending } = ordenacao;
            out = [...out].sort((a, b) => {
                const va = a[col];
                const vb = b[col];
                const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
                return ascending ? cmp : -cmp;
            });
        }
        if (limite != null) out = out.slice(0, limite);
        return single ? { data: out[0] ?? null, error: null } : { data: out, error: null };
    };

    const builder: any = {
        select: () => builder,
        update: (valores: Row) => ((operacao = { tipo: "update", valores }), builder),
        delete: () => ((operacao = { tipo: "delete" }), builder),
        insert: async (valores: Row | Row[]) => {
            const lista = Array.isArray(valores) ? valores : [valores];
            // created_at crescente garante a ordem cronológica no fake.
            for (const v of lista) tabela(nome).push({ id: proximoId, created_at: String(proximoId++).padStart(8, "0"), ...v });
            return { data: null, error: null };
        },
        // eslint-disable-next-line eqeqeq
        eq: (col: string, val: any) => (filtros.push((r) => r[col] == val), builder),
        in: (col: string, vals: any[]) => (filtros.push((r) => vals.some((v) => v == r[col])), builder),
        order: (col: string, opts: { ascending: boolean }) => ((ordenacao = { col, ascending: opts.ascending }), builder),
        limit: (n: number) => ((limite = n), builder),
        maybeSingle: () => ((single = true), builder),
        then: (resolve: (v: any) => any) => resolve(executar()),
    };
    return builder;
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

const montarDadosPlanoMock = jest.fn();
jest.mock("../src/controllers/PlanejamentoController", () => ({
    montarDadosPlano: (...args: any[]) => montarDadosPlanoMock(...args),
    resolverPeriodoAtivo: async () => "2026.2",
}));

const consultarTurmasMock = jest.fn();
jest.mock("../src/services/agente/tools/materia_tools", () => {
    const real = jest.requireActual("../src/services/agente/tools/materia_tools");
    return { ...real, consultarTurmasMateria: (...args: any[]) => consultarTurmasMock(...args) };
});

const mockCreate = jest.fn();
jest.mock("openai", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } })),
}));

import { montarPerfilAluno, renderizarPerfil, limparCachePerfis, type PerfilAluno } from "../src/services/chat/perfil_aluno";
import { createOrquestradorAgent, obterEfeitosDoOrquestrador } from "../src/services/chat/orquestrador_agent";
import { parseCorpoChat } from "../src/services/chat/superficie";
import { SupabaseSession, aparaInicioDaJanela, mensagensVisiveis } from "../src/services/chat/supabase_session";
import { ChatController } from "../src/controllers/chat_controller";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const OBRIGATORIA = (codigo: string, nivel: number, preRequisitos: unknown = null) => ({
    codigo,
    nome: `Matéria ${codigo}`,
    creditos: 4,
    nivel,
    obrigatoria: true,
    tipo_natureza: 0,
    carga_horaria: 60,
    preRequisitos,
    coRequisitos: null,
});

function semearAluno() {
    tabela("users").push({ id_user: 42, email: "aluno@unb.br", nome_completo: "Fulano de Tal Silva" });
    tabela("dados_users").push({
        id_user: 42,
        semestre_atual: 4,
        fluxograma_atual: JSON.stringify({
            dados_fluxograma: [
                [
                    { codigo: "FGA0001", status: "APR" },
                    { codigo: "IFD0171", status: "MATR", ano_periodo: "2026.2", turma: "B", professor: "RAFAEL MORGADO", nome: "Física 1" },
                ],
            ],
        }),
        preferencias_plano: { limiteCreditos: 20, objetivo: "equilibrado", trabalha: true },
        carga_horaria_integralizada: { total: 600 },
    });
    tabela("historicos_usuarios").push({
        id_user: 42,
        created_at: "2026-08-01",
        matriz_curricular: "8117/-2 - 2018.2",
        curso_extraido: "ENGENHARIA DE SOFTWARE",
        matricula: "200012345",
        ira: 4.1,
        numero_semestre: 4,
    });
    montarDadosPlanoMock.mockResolvedValue({
        dados: {
            idUser: "42",
            idCurso: "1",
            numeroPeriodo: 4,
            preferencias: { limiteCreditos: 20, objetivo: "equilibrado", trabalha: true },
            cargaHorariaIntegralizada: { total: 600, obrigatoria: 500, optativa: 100, complementar: 0 },
            exigidaMatriz: { total: 3000, obrigatoria: 2400, optativa: 400, complementar: 200 },
            fluxogramaAtual: tabela("dados_users")[0].fluxograma_atual,
            materiasMapeadas: [
                OBRIGATORIA("FGA0001", 1),
                OBRIGATORIA("FGA0002", 2, { condicoes: ["FGA0001"], operador: "E" }),
                OBRIGATORIA("FGA0003", 3, { condicoes: ["FGA0099"], operador: "E" }),
            ],
            codigosComOferta: new Set(["FGA0002", "FGA0003"]),
        },
    });
}

function respostaTexto(texto: string) {
    return { choices: [{ message: { role: "assistant", content: texto } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
}
function respostaTool(nome: string, args: Record<string, unknown>) {
    return {
        choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: nome, arguments: JSON.stringify(args) } }] } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
}

function fakeRes() {
    const res: any = { statusCode: 0, body: undefined };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: unknown) => ((res.body = b), res);
    return res;
}

beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k];
    proximoId = 1;
    limparCachePerfis();
    montarDadosPlanoMock.mockReset();
    consultarTurmasMock.mockReset();
    mockCreate.mockReset();
});

// ---------------------------------------------------------------------------
describe("perfil do aluno no contexto", () => {
    it("monta o perfil a partir do banco e o render traz os dados reais", async () => {
        semearAluno();
        const perfil = await montarPerfilAluno("aluno@unb.br");
        expect(perfil).not.toBeNull();
        const texto = renderizarPerfil(perfil, "assistente");

        expect(texto).toContain("ENGENHARIA DE SOFTWARE");
        expect(texto).toContain("IRA: 4.1");
        expect(texto).toContain("IFD0171");
        expect(texto).toContain("turma B");
        expect(texto).toContain("RAFAEL MORGADO");
        // FGA0002 está liberada (pré-requisito FGA0001 aprovado); FGA0003 não.
        expect(texto).toMatch(/liberadas para cursar: FGA0002/);
        expect(texto).not.toMatch(/liberadas para cursar:[^\n]*FGA0003/);
        expect(texto).toContain("até 20 créditos");
        // Matriz vem do banco, não do cliente.
        expect(montarDadosPlanoMock.mock.calls[0][1].curriculoCompleto).toBe("8117/-2 - 2018.2");
    });

    it("nunca expõe e-mail, matrícula nem nome completo", async () => {
        semearAluno();
        const texto = renderizarPerfil(await montarPerfilAluno("aluno@unb.br"), "montador", {
            tipo: "montador",
            grade: [{ codigo: "IFD0171", idTurma: 21 }],
            creditos: 4,
            turnos: ["M"],
            incluirCursando: true,
            horarioLivre: "0",
        });
        expect(texto).not.toContain("aluno@unb.br");
        expect(texto).not.toContain("200012345");
        expect(texto).not.toContain("Fulano de Tal Silva");
        expect(texto).toContain("Tela atual: Montador de Grade");
    });

    it("respeita o teto de tamanho cortando listas com +N", () => {
        const perfil = {
            idUser: "1",
            curriculoCompleto: "X",
            curso: "C",
            semestreAtual: 9,
            periodoAtivo: "2026.2",
            ira: 3,
            integralizacao: {
                percentualPorHoras: 50,
                feitas: { total: 1, obrigatoria: 1, optativa: 0, complementar: 0 },
                exigidas: { total: 2, obrigatoria: 2, optativa: 0, complementar: 0 },
            },
            emCurso: [],
            concluidas: Array.from({ length: 400 }, (_, i) => `ABC${String(i).padStart(4, "0")}`),
            pendentesDesbloqueadas: Array.from({ length: 200 }, (_, i) => ({
                codigo: `DEF${i}`,
                nome: "Uma matéria com um nome razoavelmente comprido para ocupar espaço",
                nivel: 5,
                creditos: 4,
            })),
            plano: null,
            preferencias: { limiteCreditos: 24, objetivo: "equilibrado", trabalha: false },
            restricoes: { adiar: [], priorizar: [], adicionar: [] },
            preferenciasGrade: [],
            ctx: null,
        } as PerfilAluno;
        const texto = renderizarPerfil(perfil, "assistente", undefined, 3000);
        expect(texto.length).toBeLessThanOrEqual(3000);
        expect(texto).toMatch(/\(\+\d+\)/);
    });

    it("sem histórico, orienta a enviar em vez de inventar", async () => {
        tabela("users").push({ id_user: 7, email: "novo@unb.br" });
        const perfil = await montarPerfilAluno("novo@unb.br");
        expect(perfil?.curriculoCompleto).toBeNull();
        expect(renderizarPerfil(perfil, "plano")).toContain("ainda não enviou o histórico");
    });

    it("o perfil entra nas instruções da Darcy", async () => {
        semearAluno();
        const perfil = await montarPerfilAluno("aluno@unb.br");
        const inst = String(createOrquestradorAgent({ email: "aluno@unb.br", perfil, superficie: "plano" }).instructions);
        expect(inst).toContain("## Perfil do aluno");
        expect(inst).toContain("IFD0171");
    });
});

// ---------------------------------------------------------------------------
describe("canal lateral do plano", () => {
    it("tool de plano que altera restrições devolve plano + restrições, sem sujar o perfil em cache", async () => {
        semearAluno();
        const perfil = (await montarPerfilAluno("aluno@unb.br"))!;
        mockCreate
            .mockResolvedValueOnce(respostaTool("mover_materia", { codigo: "FGA0002", acao: "adiar" }))
            .mockResolvedValueOnce(respostaTexto("Pronto, adiei FGA0002."));

        const agent = createOrquestradorAgent({ email: "aluno@unb.br", perfil, superficie: "plano" });
        await run(agent, "adia FGA0002");
        const efeitos = obterEfeitosDoOrquestrador(agent);

        expect(efeitos.plano).not.toBeNull();
        expect(efeitos.restricoes?.adiar).toEqual(["FGA0002"]);
        expect(perfil.ctx!.restricoes.adiar).toEqual([]);
    });

    it("simular_cenario não devolve plano nem restrições", async () => {
        semearAluno();
        const perfil = (await montarPerfilAluno("aluno@unb.br"))!;
        mockCreate
            .mockResolvedValueOnce(respostaTool("simular_cenario", { adiar: ["FGA0002"] }))
            .mockResolvedValueOnce(respostaTexto("Atrasaria um semestre."));

        const agent = createOrquestradorAgent({ email: "aluno@unb.br", perfil, superficie: "plano" });
        await run(agent, "e se eu adiar FGA0002?");
        const efeitos = obterEfeitosDoOrquestrador(agent);
        expect(efeitos.plano).toBeNull();
        expect(efeitos.restricoes).toBeNull();
    });
});

// ---------------------------------------------------------------------------
describe("janela da sessão", () => {
    const user = (t: string) => ({ role: "user", content: t }) as any;
    const darcy = (t: string) => ({ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: t }] }) as any;
    const call = () => ({ type: "function_call", name: "x", callId: "1", arguments: "{}" }) as any;
    const out = () => ({ type: "function_call_result", name: "x", callId: "1", output: "{}" }) as any;

    it("apara o começo até a primeira mensagem do aluno", () => {
        expect(aparaInicioDaJanela([out(), darcy("a"), user("oi"), darcy("b")])).toEqual([user("oi"), darcy("b")]);
    });

    it("mensagens visíveis: só a resposta final de cada turno, sem tool", () => {
        const itens = [user("oi"), darcy("vou ver"), call(), out(), darcy("final"), user("e?"), darcy("ok")];
        expect(mensagensVisiveis(itens)).toEqual([
            { role: "user", content: "oi" },
            { role: "assistant", content: "final" },
            { role: "user", content: "e?" },
            { role: "assistant", content: "ok" },
        ]);
    });

    it("getItems sem limite carrega no máximo a janela (30), começando numa mensagem do aluno", async () => {
        const session = new SupabaseSession("s1");
        const itens = [];
        for (let i = 0; i < 25; i++) itens.push(user(`p${i}`), call(), out(), darcy(`r${i}`));
        await session.addItems(itens);

        const janela = await session.getItems();
        expect(janela.length).toBeLessThanOrEqual(30);
        expect((janela[0] as any).role).toBe("user");
        expect((janela[janela.length - 1] as any).content[0].text).toBe("r24");
    });
});

// ---------------------------------------------------------------------------
describe("body do /chat/send", () => {
    it("formato novo: superfície + estado", () => {
        const corpo = parseCorpoChat({
            message: "oi",
            superficie: "montador",
            estado: { tipo: "montador", grade: [{ codigo: "fga0001", idTurma: 3 }], creditos: 4, turnos: ["M", "X"], incluirCursando: false, horarioLivre: "123" },
        });
        expect(corpo).toEqual({
            message: "oi",
            superficie: "montador",
            estado: { tipo: "montador", grade: [{ codigo: "FGA0001", idTurma: 3 }], creditos: 4, turnos: ["M"], incluirCursando: false, horarioLivre: "123" },
        });
    });

    it("formato antigo do Montador vira superfície montador; curriculoCompleto é ignorado", () => {
        const corpo = parseCorpoChat({
            message: "monta",
            contexto: "montador",
            horarioLivre: "99",
            codigosNaGrade: ["fga0002"],
            curriculoCompleto: "OUTRA MATRIZ",
        }) as any;
        expect(corpo.superficie).toBe("montador");
        expect(corpo.estado.horarioLivre).toBe("99");
        expect(corpo.estado.grade.map((g: any) => g.codigo)).toEqual(["FGA0002"]);
        expect(JSON.stringify(corpo)).not.toContain("OUTRA MATRIZ");
    });

    it("sem superfície nem contexto vira assistente; sem mensagem é erro", () => {
        expect((parseCorpoChat({ message: "x" }) as any).superficie).toBe("assistente");
        expect(parseCorpoChat({})).toEqual({ error: "O campo 'message' é obrigatório." });
    });
});

// ---------------------------------------------------------------------------
describe("atalho /turmas e histórico", () => {
    it("responde sem chamar o modelo, grava a troca e ela aparece no /chat/historico", async () => {
        consultarTurmasMock.mockResolvedValue(
            JSON.stringify({ codigo: "IFD0171", nome_materia: "Física 1", periodo: "2026.2", turmas_recentes: ["Turma B — 24M12"] })
        );

        const res = fakeRes();
        await ChatController.routes.send.value(
            { headers: { authorization: "Bearer token-valido" }, body: { message: "/turmas ifd0171", superficie: "plano" } } as any,
            res
        );
        expect(res.statusCode).toBe(200);
        expect(res.body.reply).toContain("**IFD0171 - Física 1** (2026.2)");
        expect(res.body.reply).toContain("Turma B — 24M12");
        expect(consultarTurmasMock).toHaveBeenCalledWith({ codigo: "IFD0171" });
        expect(mockCreate).not.toHaveBeenCalled();

        const hist = fakeRes();
        await ChatController.routes.historico.value({ headers: { authorization: "Bearer token-valido" } } as any, hist);
        expect(hist.statusCode).toBe(200);
        expect(hist.body.mensagens).toEqual([
            { role: "user", content: "/turmas ifd0171" },
            { role: "assistant", content: res.body.reply },
        ]);
    });

    it("nova-conversa apaga o histórico", async () => {
        const session = new SupabaseSession("auth-uuid-1");
        await session.addItems([{ role: "user", content: "oi" } as any]);
        const res = fakeRes();
        await ChatController.routes["nova-conversa"].value({ headers: { authorization: "Bearer token-valido" } } as any, res);
        expect(res.body).toEqual({ ok: true });
        expect(await session.listarMensagensVisiveis()).toEqual([]);
    });

    it("token inválido é 401", async () => {
        const res = fakeRes();
        await ChatController.routes.historico.value({ headers: { authorization: "Bearer x" } } as any, res);
        expect(res.statusCode).toBe(401);
    });
});
