/**
 * O atuador de optativas fazia busca semântica por tema e devolvia o resultado sem
 * olhar o histórico do aluno — então sugeria matéria que ele já tinha sido aprovado.
 *
 * Caso real: CIC0004 (ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES), aprovada em 2023.1,
 * voltando como sugestão numa busca por "algoritmos".
 */
process.env.MARITACA_API_KEY = "test-key";

type Row = Record<string, any>;
const db: {
    materias: Row[];
    turmas: Row[];
    users: Row[];
    dados_users: Row[];
    equivalencias: Row[];
    matrizes: Row[];
    materias_por_curso: Row[];
} = {
    materias: [],
    turmas: [],
    users: [],
    dados_users: [],
    equivalencias: [],
    matrizes: [],
    materias_por_curso: [],
};

function makeTable(rows: Row[]) {
    return {
        select(_cols: string) {
            const filtrosIn: Array<[string, any[]]> = [];
            const filtrosEq: Array<[string, any]> = [];
            const filtrosLike: Array<[string, string]> = [];
            let modoSingle: "maybe" | null = null;
            let orderCol: string | null = null;
            let limitN: number | null = null;
            const builder: any = {
                in(col: string, vals: any[]) {
                    filtrosIn.push([col, vals]);
                    return builder;
                },
                eq(col: string, val: any) {
                    filtrosEq.push([col, val]);
                    return builder;
                },
                like(col: string, pattern: string) {
                    filtrosLike.push([col, pattern]);
                    return builder;
                },
                order(col: string) {
                    orderCol = col;
                    return builder;
                },
                limit(n: number) {
                    limitN = n;
                    return builder;
                },
                maybeSingle() {
                    modoSingle = "maybe";
                    return builder;
                },
                then(resolve: (v: any) => any) {
                    let out = rows.filter(
                        (r) =>
                            filtrosEq.every(([c, v]) => r[c] === v) &&
                            filtrosIn.every(([c, vals]) => vals.includes(r[c])) &&
                            filtrosLike.every(([c, pattern]) => {
                                const prefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
                                return String(r[c] ?? "").startsWith(prefix);
                            })
                    );
                    if (orderCol) {
                        const col = orderCol as string;
                        out = [...out].sort((a, b) => String(a[col]).localeCompare(String(b[col])));
                    }
                    if (limitN != null) out = out.slice(0, limitN);
                    if (modoSingle === "maybe") return resolve({ data: out[0] ?? null, error: null });
                    return resolve({ data: out, error: null });
                },
            };
            return builder;
        },
    };
}

function tableFrom(table: string) {
    const t = (db as any)[table];
    if (Array.isArray(t)) return makeTable(t);
    return makeTable([]);
}

jest.mock("../src/supabase_wrapper", () => ({
    SupabaseWrapper: {
        get: () => ({
            from: (t: string) => tableFrom(t),
            rpc: async () => ({ data: "2026.2", error: null }),
        }),
    },
}));

const mockBuscarMaterias = jest.fn();
jest.mock("../src/services/sabia.service", () => ({
    SabiaService: jest.fn().mockImplementation(() => ({
        buscarMaterias: mockBuscarMaterias,
    })),
}));

import { buscarOptativas, filtrarJaCursadas } from "../src/services/chat/actuators/optativas_actuator";

/** Fluxograma com CIC0004 aprovada, no formato que parseFluxograma espera. */
const FLUXOGRAMA_COM_CIC0004 = JSON.stringify({
    dados_fluxograma: [
        [
            { codigo: "CIC0004", status: "APR" },
            { codigo: "FGA0124", status: "MATR" },
        ],
    ],
});

beforeEach(() => {
    for (const k of Object.keys(db)) (db as any)[k].length = 0;
    mockBuscarMaterias.mockReset();

    db.users.push({ email: "aluno@unb.br", id_user: 42 });
    db.dados_users.push({ id_user: 42, fluxograma_atual: FLUXOGRAMA_COM_CIC0004 });
    db.materias.push({ id_materia: 398, codigo_materia: "CIC0004" });
    db.materias.push({ id_materia: 500, codigo_materia: "FGA0009" });
    db.materias.push({ id_materia: 501, codigo_materia: "FGA0124" });
    // Oferta no período ativo pra todas (o filtro de oferta não é o alvo deste teste).
    db.turmas.push({ id_materia: 398, ano_periodo: "2026.2" });
    db.turmas.push({ id_materia: 500, ano_periodo: "2026.2" });
    db.turmas.push({ id_materia: 501, ano_periodo: "2026.2" });
});

describe("filtrarJaCursadas", () => {
    it("remove as matérias que o aluno já cumpriu", () => {
        const materias = [
            { codigo: "CIC0004", nome: "ALGORITMOS", similaridade: 0.9 },
            { codigo: "FGA0009", nome: "OUTRA", similaridade: 0.8 },
        ];
        expect(filtrarJaCursadas(materias, new Set(["CIC0004"])).map((m) => m.codigo)).toEqual([
            "FGA0009",
        ]);
    });

    it("normaliza caixa e espaço dos dois lados", () => {
        const materias = [{ codigo: " cic0004 ", nome: "ALGORITMOS", similaridade: 0.9 }];
        expect(filtrarJaCursadas(materias, new Set(["CIC0004"]))).toEqual([]);
    });

    it("sem histórico, devolve tudo", () => {
        const materias = [{ codigo: "CIC0004", nome: "ALGORITMOS", similaridade: 0.9 }];
        expect(filtrarJaCursadas(materias, new Set()).length).toBe(1);
    });
});

describe("buscarOptativas — filtro por histórico do aluno", () => {
    it("não sugere matéria que o aluno já foi aprovado", async () => {
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "CIC0004", nome: "ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES", similaridade: 0.95 },
            { codigo: "FGA0009", nome: "OUTRA COISA", similaridade: 0.7 },
        ]);

        const out = JSON.parse(await buscarOptativas(["algoritmos"], false, "aluno@unb.br"));
        expect(out.materias.map((m: any) => m.codigo)).toEqual(["FGA0009"]);
    });

    /** MATR estará concluída antes do semestre que o aluno vai cursar. */
    it("não sugere matéria que o aluno está cursando agora", async () => {
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0124", nome: "EM CURSO", similaridade: 0.9 },
            { codigo: "FGA0009", nome: "OUTRA COISA", similaridade: 0.7 },
        ]);

        const out = JSON.parse(await buscarOptativas(["tema"], false, "aluno@unb.br"));
        expect(out.materias.map((m: any) => m.codigo)).toEqual(["FGA0009"]);
    });

    /**
     * O aluno fez CIC0004; FGA0009 é dispensada por quem fez CIC0004, então sugerir
     * FGA0009 seria mandar cursar algo que ele já tem crédito.
     */
    it("não sugere matéria dispensada por equivalência do que o aluno cursou", async () => {
        db.equivalencias.push({
            id_materia: 500,
            expressao_logica: { operador: "OU", condicoes: ["CIC0004"] },
        });
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "EQUIVALENTE A CIC0004", similaridade: 0.9 },
        ]);

        const out = JSON.parse(await buscarOptativas(["tema"], false, "aluno@unb.br"));
        expect(out.materias).toEqual([]);
        expect(out.aviso).toBeTruthy();
    });

    /**
     * A direção inversa: a linha está cadastrada na matéria que o aluno CURSOU
     * ("CIC0004 equivale a FGA0009"). FGA0009 substitui sozinha algo já feito —
     * cursá-la não contaria de novo.
     */
    it("não sugere matéria que substitui sozinha uma que o aluno já cursou", async () => {
        db.equivalencias.push({
            id_materia: 398,
            expressao_logica: { operador: "OU", condicoes: ["FGA0009", "XYZ0001"] },
        });
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "SUBSTITUI CIC0004", similaridade: 0.9 },
        ]);

        const out = JSON.parse(await buscarOptativas(["tema"], false, "aluno@unb.br"));
        expect(out.materias).toEqual([]);
    });

    it("metade de um ramo E da matéria cursada não é substituta: continua sugerida", async () => {
        db.equivalencias.push({
            id_materia: 398,
            expressao_logica: { operador: "E", condicoes: ["FGA0009", "XYZ0001"] },
        });
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "METADE", similaridade: 0.9 },
        ]);

        const out = JSON.parse(await buscarOptativas(["tema"], false, "aluno@unb.br"));
        expect(out.materias.map((m: any) => m.codigo)).toEqual(["FGA0009"]);
    });

    it("equivalência com operador E não dispensa com só uma das pernas cursada", async () => {
        db.equivalencias.push({
            id_materia: 500,
            expressao_logica: { operador: "E", condicoes: ["CIC0004", "CIC9999"] },
        });
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "PRECISA DAS DUAS", similaridade: 0.9 },
        ]);

        const out = JSON.parse(await buscarOptativas(["tema"], false, "aluno@unb.br"));
        expect(out.materias.map((m: any) => m.codigo)).toEqual(["FGA0009"]);
    });

    it("sem email (chat deslogado) mantém o comportamento antigo, sem filtrar histórico", async () => {
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "CIC0004", nome: "ALGORITMOS", similaridade: 0.95 },
        ]);

        const out = JSON.parse(await buscarOptativas(["algoritmos"], false));
        expect(out.materias.map((m: any) => m.codigo)).toEqual(["CIC0004"]);
    });

    it("aluno sem cadastro não derruba a busca — só não filtra", async () => {
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "CIC0004", nome: "ALGORITMOS", similaridade: 0.95 },
        ]);

        const out = JSON.parse(await buscarOptativas(["algoritmos"], false, "naoexiste@unb.br"));
        expect(out.materias.map((m: any) => m.codigo)).toEqual(["CIC0004"]);
    });

    it("quando tudo que veio já foi cursado, avisa em vez de devolver lista vazia sem contexto", async () => {
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "CIC0004", nome: "ALGORITMOS", similaridade: 0.95 },
        ]);

        const out = JSON.parse(await buscarOptativas(["algoritmos"], false, "aluno@unb.br"));
        expect(out.materias).toEqual([]);
        expect(String(out.aviso)).toMatch(/já/i);
    });
});

describe("buscarOptativas — filtro por matriz do aluno (curriculoCompleto)", () => {
    beforeEach(() => {
        // Matriz 7: só FGA0009 é optativa cadastrada (tipo_natureza = 1).
        db.matrizes.push({ id_matriz: 7, curriculo_completo: "8117/-2 - 2018.2" });
        db.materias_por_curso.push({ id_materia: 500, id_matriz: 7, tipo_natureza: 1 });
        // FGA0124 existe na matriz mas como obrigatória (tipo_natureza = 0) — não deve
        // contar como optativa da matriz.
        db.materias_por_curso.push({ id_materia: 501, id_matriz: 7, tipo_natureza: 0 });
    });

    it("resolve a matriz por match exato e descarta resultado que não é optativa dela", async () => {
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "É OPTATIVA DA MATRIZ", similaridade: 0.9 },
            { codigo: "FGA0124", nome: "NÃO É OPTATIVA DA MATRIZ", similaridade: 0.8 },
        ]);

        const out = JSON.parse(
            await buscarOptativas(["tema"], false, undefined, "8117/-2 - 2018.2")
        );
        expect(out.materias.map((m: any) => m.codigo)).toEqual(["FGA0009"]);
    });

    it("resolve a matriz por fallback de prefixo quando não há match exato", async () => {
        // curriculoCompleto do aluno vem sem o sufixo " - 2018.2".
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "É OPTATIVA DA MATRIZ", similaridade: 0.9 },
            { codigo: "FGA0124", nome: "NÃO É OPTATIVA DA MATRIZ", similaridade: 0.8 },
        ]);

        const out = JSON.parse(await buscarOptativas(["tema"], false, undefined, "8117/-2"));
        expect(out.materias.map((m: any) => m.codigo)).toEqual(["FGA0009"]);
    });

    it("curriculoCompleto ausente — comportamento antigo sem restrição de matriz, inalterado", async () => {
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "É OPTATIVA DA MATRIZ", similaridade: 0.9 },
            { codigo: "FGA0124", nome: "NÃO É OPTATIVA DA MATRIZ", similaridade: 0.8 },
        ]);

        const out = JSON.parse(await buscarOptativas(["tema"], false));
        expect(out.materias.map((m: any) => m.codigo).sort()).toEqual(["FGA0009", "FGA0124"]);
    });

    it("curriculoCompleto não resolve pra nenhuma matriz — degrada pra sem restrição", async () => {
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "É OPTATIVA DA MATRIZ", similaridade: 0.9 },
            { codigo: "FGA0124", nome: "NÃO É OPTATIVA DA MATRIZ", similaridade: 0.8 },
        ]);

        const out = JSON.parse(
            await buscarOptativas(["tema"], false, undefined, "0000/-0 - 1999.1")
        );
        expect(out.materias.map((m: any) => m.codigo).sort()).toEqual(["FGA0009", "FGA0124"]);
    });

    it("matriz encontrada mas sem nenhuma optativa cadastrada — degrada pra sem restrição", async () => {
        db.matrizes.push({ id_matriz: 8, curriculo_completo: "9999/-1 - 2020.1" });
        // Nenhuma linha em materias_por_curso com id_matriz = 8.
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "É OPTATIVA DA MATRIZ", similaridade: 0.9 },
            { codigo: "FGA0124", nome: "NÃO É OPTATIVA DA MATRIZ", similaridade: 0.8 },
        ]);

        const out = JSON.parse(
            await buscarOptativas(["tema"], false, undefined, "9999/-1 - 2020.1")
        );
        expect(out.materias.map((m: any) => m.codigo).sort()).toEqual(["FGA0009", "FGA0124"]);
    });

    it("aviso diferencia 'não é da sua matriz' de 'já cursou' e de 'sem oferta'", async () => {
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0124", nome: "NÃO É OPTATIVA DA MATRIZ", similaridade: 0.8 },
        ]);

        const out = JSON.parse(
            await buscarOptativas(["tema"], false, undefined, "8117/-2 - 2018.2")
        );
        expect(out.materias).toEqual([]);
        expect(String(out.aviso)).toMatch(/matriz/i);
        expect(String(out.aviso)).not.toMatch(/já cursou|já cursado|oferta/i);
    });

    it("filtro de matriz roda antes do filtro de já-cursadas: se já-cursadas esvazia o resto, o aviso dele prevalece", async () => {
        // FGA0009 é optativa da matriz, mas o aluno já a cursou (equivalência com CIC0004).
        db.equivalencias.push({
            id_materia: 500,
            expressao_logica: { operador: "OU", condicoes: ["CIC0004"] },
        });
        mockBuscarMaterias.mockResolvedValue([
            { codigo: "FGA0009", nome: "OPTATIVA DA MATRIZ MAS JÁ CURSADA", similaridade: 0.9 },
            { codigo: "FGA0124", nome: "NÃO É OPTATIVA DA MATRIZ", similaridade: 0.8 },
        ]);

        const out = JSON.parse(
            await buscarOptativas(["tema"], false, "aluno@unb.br", "8117/-2 - 2018.2")
        );
        expect(out.materias).toEqual([]);
        expect(String(out.aviso)).toMatch(/já/i);
    });
});
