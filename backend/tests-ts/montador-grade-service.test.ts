process.env.MARITACA_API_KEY = "test-key";

/**
 * Testes da Facade `montador_grade.service.ts` (Fase 1(e)/3 do plano
 * montador-de-grade-resilient-muffin.md) — end-to-end sobre a Facade, com
 * `SupabaseWrapper` e `PlanejamentoController.montarDadosPlano`/`resolverPeriodoAtivo`
 * mockados. Mesmo padrão de mock em duas tabelas (materias/turmas) já usado em
 * grade-actuator.test.ts, já que `turmas` não tem `codigo_materia` direto.
 */

type Row = Record<string, any>;
const db: { materias: Row[]; turmas: Row[]; users: Row[] } = {
    materias: [],
    turmas: [],
    users: [],
};

function makeTable(rows: Row[]) {
    return {
        select(_cols: string) {
            const filtrosIn: Array<[string, any[]]> = [];
            const filtrosEq: Array<[string, any]> = [];
            let modoSingle: "maybe" | null = null;
            const builder: any = {
                in(col: string, vals: any[]) {
                    filtrosIn.push([col, vals]);
                    return builder;
                },
                eq(col: string, val: any) {
                    filtrosEq.push([col, val]);
                    return builder;
                },
                maybeSingle() {
                    modoSingle = "maybe";
                    return builder;
                },
                then(resolve: (v: any) => any) {
                    const resultado = rows.filter(
                        (r) =>
                            filtrosEq.every(([c, v]) => r[c] === v) &&
                            filtrosIn.every(([c, vals]) => vals.includes(r[c]))
                    );
                    if (modoSingle === "maybe") {
                        return resolve({ data: resultado[0] ?? null, error: null });
                    }
                    return resolve({ data: resultado, error: null });
                },
            };
            return builder;
        },
    };
}

function tableFrom(table: string) {
    if (table === "materias") return makeTable(db.materias);
    if (table === "turmas") return makeTable(db.turmas);
    if (table === "users") return makeTable(db.users);
    return {
        select: () => ({
            eq: function () {
                return this;
            },
            in: function () {
                return this;
            },
            maybeSingle: function () {
                return this;
            },
            then: (resolve: any) => resolve({ data: [], error: null }),
        }),
    };
}

const getMock = jest.fn(() => ({
    from: (t: string) => tableFrom(t),
    rpc: async (..._args: any[]) => ({ data: "2026.2", error: null }),
}));
jest.mock("../src/supabase_wrapper", () => ({
    SupabaseWrapper: { get: () => getMock() },
}));

const montarDadosPlanoMock = jest.fn();
jest.mock("../src/controllers/PlanejamentoController", () => ({
    montarDadosPlano: (...args: any[]) => montarDadosPlanoMock(...args),
    resolverPeriodoAtivo: async () => "2026.2",
}));

import { montarGrade, docenteBate, normDocente, type ParametrosMontador } from "../src/services/grade/montador_grade.service";

const CARGA_ZERADA = { total: 0, obrigatoria: 0, optativa: 0, complementar: 0 };
const EXIGIDA_PADRAO = { total: 600, obrigatoria: 400, optativa: 200, complementar: 0 };

function mockarDados(overrides: {
    materiasMapeadas: any[];
    fluxograma?: unknown[];
    codigosComOferta?: string[];
    numeroPeriodo?: number;
    cargaHorariaIntegralizada?: typeof CARGA_ZERADA;
    exigidaMatriz?: typeof EXIGIDA_PADRAO;
}) {
    montarDadosPlanoMock.mockResolvedValueOnce({
        dados: {
            idUser: "42",
            idCurso: "1",
            numeroPeriodo: overrides.numeroPeriodo ?? 3,
            cargaHorariaIntegralizada: overrides.cargaHorariaIntegralizada ?? CARGA_ZERADA,
            exigidaMatriz: overrides.exigidaMatriz ?? EXIGIDA_PADRAO,
            fluxogramaAtual: JSON.stringify({ dados_fluxograma: overrides.fluxograma ?? [] }),
            materiasMapeadas: overrides.materiasMapeadas,
            codigosComOferta: new Set(overrides.codigosComOferta ?? []),
        },
    });
}

const FGA0001_ESSENCIAL = {
    codigo: "FGA0001",
    nome: "Essencial",
    creditos: 4,
    nivel: 3,
    obrigatoria: true,
    tipo_natureza: 0,
    carga_horaria: 60,
};

const FGA0002_NORMAL = {
    codigo: "FGA0002",
    nome: "Obrigatória comum",
    creditos: 4,
    nivel: 2,
    obrigatoria: true,
    tipo_natureza: 0,
    carga_horaria: 60,
};

const PARAMS_PADRAO: ParametrosMontador = {
    email: "aluno@unb.br",
    curriculoCompleto: "8117/-2 - 2018.2",
    escopo: "todas_pendentes",
};

beforeEach(() => {
    db.materias.length = 0;
    db.turmas.length = 0;
    db.users.length = 0;
    montarDadosPlanoMock.mockReset();
    getMock.mockReset();
    getMock.mockImplementation(() => ({
        from: (t: string) => tableFrom(t),
        rpc: async () => ({ data: "2026.2", error: null }),
    }));
    db.users.push({ email: "aluno@unb.br", id_user: 42 });
    db.materias.push({ id_materia: 1, codigo_materia: "FGA0001" });
    db.materias.push({ id_materia: 2, codigo_materia: "FGA0002" });
});

describe("montarGrade — caso básico (sem essencial)", () => {
    it("monta a grade e devolve opções sem matérias em conflito", async () => {
        db.turmas.push({ id_turmas: 10, id_materia: 1, turma: "A", docente: "Ana", horario: "2M12", local: null, ano_periodo: "2026.2", vagas_ofertadas: 40, vagas_ocupadas: 10, vagas_sobrando: 30 });
        db.turmas.push({ id_turmas: 11, id_materia: 2, turma: "A", docente: "Bruno", horario: "3M12", local: null, ano_periodo: "2026.2", vagas_ofertadas: 40, vagas_ocupadas: 10, vagas_sobrando: 30 });
        mockarDados({ materiasMapeadas: [FGA0001_ESSENCIAL, FGA0002_NORMAL] });

        const resultado = await montarGrade(PARAMS_PADRAO);

        expect(resultado.opcoes.length).toBeGreaterThan(0);
        expect(resultado.erros).toEqual([]);
        const primeira = resultado.opcoes[0];
        expect(primeira.resultado.selecao.has("FGA0001")).toBe(true);
        expect(primeira.resultado.selecao.has("FGA0002")).toBe(true);
    });
});

describe("montarGrade — ESSENCIAL_SEM_VAGA (erro tipado propagado)", () => {
    it("essencial sem NENHUMA turma ofertada no período → erro ESSENCIAL_SEM_VAGA", async () => {
        // FGA0001 (essencial) não tem turma nenhuma; FGA0002 tem, pra provar que o resto
        // da grade continua sendo montado mesmo com a essencial sem solução.
        db.turmas.push({ id_turmas: 11, id_materia: 2, turma: "A", docente: null, horario: "3M12", local: null, ano_periodo: "2026.2", vagas_ofertadas: null, vagas_ocupadas: null, vagas_sobrando: null });
        mockarDados({ materiasMapeadas: [FGA0001_ESSENCIAL, FGA0002_NORMAL] });

        const resultado = await montarGrade({ ...PARAMS_PADRAO, essencial: "FGA0001" });

        expect(resultado.erros).toEqual([{ tipo: "ESSENCIAL_SEM_VAGA", chave: "FGA0001" }]);
        // A grade não fica vazia por causa da essencial impossível — o resto ainda monta.
        expect(resultado.opcoes.length).toBeGreaterThan(0);
        expect(resultado.opcoes[0].resultado.selecao.has("FGA0002")).toBe(true);
    });

    it("essencial que não está nem na matriz/pendências do aluno → também ESSENCIAL_SEM_VAGA", async () => {
        mockarDados({ materiasMapeadas: [FGA0002_NORMAL] });

        const resultado = await montarGrade({ ...PARAMS_PADRAO, essencial: "FGA9999" });

        expect(resultado.erros).toEqual([{ tipo: "ESSENCIAL_SEM_VAGA", chave: "FGA9999" }]);
    });
});

describe("montarGrade — ESSENCIAL_FORA_DO_TURNO", () => {
    it("essencial só tem turma fora dos turnos pedidos → erro tipado com os turnos reais", async () => {
        // FGA0001 só tem turma à tarde (T); o aluno só permite manhã (M).
        db.turmas.push({ id_turmas: 10, id_materia: 1, turma: "A", docente: null, horario: "3T12", local: null, ano_periodo: "2026.2", vagas_ofertadas: null, vagas_ocupadas: null, vagas_sobrando: null });
        mockarDados({ materiasMapeadas: [FGA0001_ESSENCIAL] });

        const resultado = await montarGrade({
            ...PARAMS_PADRAO,
            essencial: "FGA0001",
            turnosPermitidos: ["M"],
        });

        expect(resultado.erros).toEqual([
            { tipo: "ESSENCIAL_FORA_DO_TURNO", chave: "FGA0001", turnosComOferta: ["T"] },
        ]);
    });
});

describe("montarGrade — ESSENCIAL_PRE_REQUISITO", () => {
    it("essencial com pré-requisito pendente → erro tipado com a pendência, e NUNCA é forçada na grade", async () => {
        db.turmas.push({ id_turmas: 10, id_materia: 1, turma: "A", docente: null, horario: "2M12", local: null, ano_periodo: "2026.2", vagas_ofertadas: null, vagas_ocupadas: null, vagas_sobrando: null });
        const essencialComPreRequisito = {
            ...FGA0001_ESSENCIAL,
            preRequisitos: { condicoes: ["FGA0000"], operador: "E" },
        };
        mockarDados({ materiasMapeadas: [essencialComPreRequisito], fluxograma: [] });

        const resultado = await montarGrade({ ...PARAMS_PADRAO, essencial: "FGA0001" });

        expect(resultado.erros).toEqual([
            { tipo: "ESSENCIAL_PRE_REQUISITO", chave: "FGA0001", pendencias: ["FGA0000"] },
        ]);
        for (const opcao of resultado.opcoes) {
            expect(opcao.resultado.selecao.has("FGA0001")).toBe(false);
        }
    });
});

describe("montarGrade — professor preferido é bônus, nunca filtro (Fase 1b)", () => {
    it("professor preferido SEM turma disponível → essencial ainda é alocada (alternativa aparece, não filtra)", async () => {
        db.turmas.push({ id_turmas: 10, id_materia: 1, turma: "A", docente: "Carlos Souza", horario: "2M12", local: null, ano_periodo: "2026.2", vagas_ofertadas: null, vagas_ocupadas: null, vagas_sobrando: null });
        mockarDados({ materiasMapeadas: [FGA0001_ESSENCIAL] });

        const resultado = await montarGrade({
            ...PARAMS_PADRAO,
            essencial: "FGA0001",
            professorPreferidoEssencial: "Maria",
        });

        expect(resultado.erros).toEqual([]);
        expect(resultado.opcoes.length).toBeGreaterThan(0);
        expect(resultado.opcoes[0].resultado.selecao.has("FGA0001")).toBe(true);
        expect(resultado.opcoes[0].resultado.selecao.get("FGA0001")?.turma.docente).toBe("Carlos Souza");
    });

    it("professor preferido COM turma disponível → essa turma é escolhida e a métrica de atendimento fica true", async () => {
        db.turmas.push({ id_turmas: 10, id_materia: 1, turma: "A", docente: "Ana Maria", horario: "2M12", local: null, ano_periodo: "2026.2", vagas_ofertadas: null, vagas_ocupadas: null, vagas_sobrando: null });
        db.turmas.push({ id_turmas: 20, id_materia: 1, turma: "B", docente: "Maria Silva", horario: "3M12", local: null, ano_periodo: "2026.2", vagas_ofertadas: null, vagas_ocupadas: null, vagas_sobrando: null });
        mockarDados({ materiasMapeadas: [FGA0001_ESSENCIAL] });

        const resultado = await montarGrade({
            ...PARAMS_PADRAO,
            essencial: "FGA0001",
            professorPreferidoEssencial: "Maria Silva",
        });

        const escolhida = resultado.opcoes[0].resultado.selecao.get("FGA0001");
        expect(escolhida?.turma.docente).toBe("Maria Silva");
        expect(resultado.opcoes[0].metricas.professorEssencialAtendido).toBe(true);
    });

});

describe("docenteBate — split por vírgula + comparação exata (Fase 1b), não substring cru", () => {
    it("NÃO bate por substring: 'Maria' não é a mesma pessoa que 'Ana Maria'", () => {
        expect(docenteBate("Ana Maria", normDocente("Maria"))).toBe(false);
    });

    it("bate quando o nome é exatamente igual (após normalizar espaços/caixa)", () => {
        expect(docenteBate("Maria Silva", normDocente("maria   silva"))).toBe(true);
    });

    it("bate quando o alvo é UM dos docentes de uma turma com vários, separados por vírgula", () => {
        expect(docenteBate("Ana Souza, Maria Silva", normDocente("Maria Silva"))).toBe(true);
        // O outro nome da mesma lista não devia "vazar" o match pra quem não é ele.
        expect(docenteBate("Ana Souza, Maria Silva", normDocente("Ana Souza Maria"))).toBe(false);
    });

    it("docente nulo/vazio nunca bate", () => {
        expect(docenteBate(null, normDocente("Maria"))).toBe(false);
        expect(docenteBate("", normDocente("Maria"))).toBe(false);
    });
});

describe("montarGrade — incluirCursando", () => {
    it("incluirCursando=false exclui matérias MATR do pool (monta como se não estivesse cursando nada)", async () => {
        db.turmas.push({ id_turmas: 11, id_materia: 2, turma: "A", docente: null, horario: "3M12", local: null, ano_periodo: "2026.2", vagas_ofertadas: null, vagas_ocupadas: null, vagas_sobrando: null });
        mockarDados({
            materiasMapeadas: [FGA0002_NORMAL],
            fluxograma: [[{ codigo: "FGA0002", status: "MATR" }]],
        });

        const resultado = await montarGrade({ ...PARAMS_PADRAO, incluirCursando: false });

        for (const opcao of resultado.opcoes) {
            expect(opcao.resultado.selecao.has("FGA0002")).toBe(false);
        }
    });
});
