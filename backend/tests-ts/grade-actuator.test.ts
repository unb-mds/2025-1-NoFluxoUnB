process.env.MARITACA_API_KEY = "test-key";

type Row = Record<string, any>;
const db: { materias: Row[]; turmas: Row[]; users: Row[]; materias_vetorizadas: Row[] } = {
    materias: [],
    turmas: [],
    users: [],
    materias_vetorizadas: [],
};

/**
 * Mock genérico de tabela Supabase suportando .select().eq().in().then().
 *
 * NOTA sobre o schema: a tabela `turmas` no banco real só tem `id_materia`
 * (sem `codigo_materia` denormalizado) — confirmado lendo
 * PlanejamentoController.ts:217-219 e o padrão já usado em
 * `filtrarPorOfertaAtiva` (optativas_actuator.ts:33-48), que resolve
 * código → id_materia via a tabela `materias` antes de consultar `turmas`.
 * Por isso o mock aqui modela DUAS tabelas (materias e turmas) em vez da
 * versão otimista do brief que assumia `codigo_materia` direto em `turmas`.
 */
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
    if (table === "materias_vetorizadas") return makeTable(db.materias_vetorizadas);
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

// rpc tipado com (...args: any[]) — não é mais usado pelo ranking por similaridade
// (Fix 1: match_materias saiu do path de recomendarPorHorarioLivre), mas fica genérico
// pra não quebrar caso algum outro caminho do arquivo real chame rpc no futuro.
const getMock = jest.fn(() => ({ from: (t: string) => tableFrom(t), rpc: async (..._args: any[]): Promise<{ data: any[]; error: any }> => ({ data: [], error: null }) }));
jest.mock("../src/supabase_wrapper", () => ({
    SupabaseWrapper: { get: () => getMock() },
}));

const materiasMapeadasFake = [
    { codigo: "FGA0001", nome: "Obrigatória Pendente", creditos: 4, nivel: 3, obrigatoria: true, tipo_natureza: 0, carga_horaria: 60 },
    { codigo: "FGA0002", nome: "Optativa com Oferta", creditos: 4, nivel: 0, obrigatoria: false, tipo_natureza: 1, carga_horaria: 60 },
    { codigo: "FGA0003", nome: "Optativa sem Oferta", creditos: 4, nivel: 0, obrigatoria: false, tipo_natureza: 1, carga_horaria: 60 },
];

jest.mock("../src/controllers/PlanejamentoController", () => ({
    montarDadosPlano: jest.fn(async () => ({
        dados: {
            idUser: "42",
            idCurso: "1",
            numeroPeriodo: 3,
            preferencias: { limiteCreditos: 24, objetivo: "equilibrado", trabalha: false },
            cargaHorariaIntegralizada: { total: 0, obrigatoria: 0, optativa: 0, complementar: 0 },
            exigidaMatriz: { total: 0, obrigatoria: 0, optativa: 0, complementar: 0 },
            fluxogramaAtual: JSON.stringify({ dados_fluxograma: [] }),
            materiasMapeadas: materiasMapeadasFake,
            codigosComOferta: new Set(["FGA0002"]),
        },
    })),
    // Usado por `montador_grade.service.ts` (Fase 3) — a tool nova `montar_grade`
    // (adiante neste arquivo) passa pela Facade de verdade, que chama isso.
    resolverPeriodoAtivo: async () => "2026.2",
}));

import { maskLivre, slotMaskFromHorario } from "../src/utils/horario_slots";
import { recomendarPorHorarioLivre } from "../src/services/chat/actuators/grade_actuator";
import { montarDadosPlano } from "../src/controllers/PlanejamentoController";
import { run, OutputGuardrailTripwireTriggered } from "@openai/agents";
import { createGradeAgent, runGradeComRevisao, RESPOSTA_ESCALONAMENTO_GRADE } from "../src/services/chat/actuators/grade_actuator";

const mockCreate = jest.fn();
jest.mock("openai", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ chat: { completions: { create: mockCreate } } })),
}));

beforeEach(() => {
    db.materias.length = 0;
    db.turmas.length = 0;
    db.users.length = 0;
    db.materias_vetorizadas.length = 0;
    getMock.mockReset();
    getMock.mockImplementation(() => ({ from: (t: string) => tableFrom(t), rpc: async () => ({ data: [], error: null }) }));

    // Mapeamento código -> id_materia usado pelas duas turmas de teste abaixo.
    db.materias.push({ id_materia: 1, codigo_materia: "FGA0001" });
    db.materias.push({ id_materia: 2, codigo_materia: "FGA0002" });
    // recomendarPorHorarioLivre/createGradeAgent recebem email e resolvem id_user
    // internamente (mesmo padrão de integralizacao_actuator.ts) — sem essa linha,
    // toda chamada cai no "Não encontrei o cadastro deste usuário.".
    db.users.push({ email: "aluno@unb.br", id_user: 42 });
});

describe("recomendarPorHorarioLivre — filtro determinístico de horário", () => {
    it("só devolve candidatos com turma que cabe inteira no horário livre", async () => {
        // FGA0001 (obrigatória) tem turma na segunda de manhã (2M12) — cabe no livre.
        db.turmas.push({ id_materia: 1, ano_periodo: "2026.2", horario: "2M12" });
        // FGA0002 (optativa com oferta) só tem turma na terça à tarde (3T12) — NÃO cabe.
        db.turmas.push({ id_materia: 2, ano_periodo: "2026.2", horario: "3T12" });

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12"); // só libera 2M12 pro teste
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        expect("candidatos" in resultado).toBe(true);
        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).toEqual(["FGA0001"]);
    });

    it("FGA0003 (optativa sem oferta) nunca aparece como candidata, mesmo com horário livre total", async () => {
        db.turmas.push({ id_materia: 1, ano_periodo: "2026.2", horario: "2M12" });
        db.turmas.push({ id_materia: 2, ano_periodo: "2026.2", horario: "3T12" });

        const livreTotal = maskLivre(0n, ["M", "T", "N"]);
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livreTotal.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).not.toContain("FGA0003");
    });

    it("freeMask = 0n devolve lista vazia sem consultar turmas", async () => {
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", "0", "2026.2");
        expect((resultado as any).candidatos).toEqual([]);
    });
});

describe("recomendarPorHorarioLivre — ranking por coerência temática (Task 7 / Fix 1)", () => {
    it("entre duas optativas que cabem no horário, prioriza a mais parecida com o histórico", async () => {
        // Mapeamento extra código -> id_materia pra FGA0004 (beforeEach só cadastra 0001/0002).
        db.materias.push({ id_materia: 4, codigo_materia: "FGA0004" });
        db.turmas.push({ id_materia: 2, ano_periodo: "2026.2", horario: "2M12" });
        db.turmas.push({ id_materia: 4, ano_periodo: "2026.2", horario: "2M12" });

        // Fix 1: não há mais RPC match_materias — a similaridade é calculada em JS
        // (cosseno) a partir de embeddings buscados diretamente em materias_vetorizadas,
        // só para os candidatos já filtrados por horário (não o universo de ~26k matérias).
        // Perfil do aluno = embedding de FGA0001 (única concluída) = [0.1, 0.2].
        db.materias_vetorizadas.push({ codigo_materia: "FGA0001", embedding: [0.1, 0.2] });
        // FGA0004: paralelo ao perfil ([0.2, 0.4] = 2x[0.1, 0.2]) -> cosseno = 1 (máxima similaridade).
        db.materias_vetorizadas.push({ codigo_materia: "FGA0004", embedding: [0.2, 0.4] });
        // FGA0002: ortogonal ao perfil (dot([0.1,0.2],[-0.2,0.1]) = 0) -> cosseno = 0.
        db.materias_vetorizadas.push({ codigo_materia: "FGA0002", embedding: [-0.2, 0.1] });

        const materiasComQuarta = [
            ...materiasMapeadasFake,
            { codigo: "FGA0004", nome: "Optativa 2 com Oferta", creditos: 4, nivel: 0, obrigatoria: false, tipo_natureza: 1, carga_horaria: 60 },
        ];
        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({ dados_fluxograma: [[{ codigo: "FGA0001", status: "APR" }]] }),
                materiasMapeadas: materiasComQuarta,
                codigosComOferta: new Set(["FGA0002", "FGA0004"]),
            },
        });

        const livreTotal = maskLivre(0n, ["M", "T", "N"]);
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livreTotal.toString(), "2026.2");
        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;

        const idxFGA0004 = candidatos.findIndex((c) => c.codigo === "FGA0004");
        const idxFGA0002 = candidatos.findIndex((c) => c.codigo === "FGA0002");
        expect(idxFGA0004).toBeGreaterThanOrEqual(0);
        expect(idxFGA0002).toBeGreaterThanOrEqual(0);
        expect(idxFGA0004).toBeLessThan(idxFGA0002);
    });

    it("sem histórico (nenhuma matéria concluída): não quebra, cai pra ordem neutra", async () => {
        // Mock padrão (beforeEach) já tem fluxogramaAtual sem concluídas — calcularVetorPerfil
        // deve retornar cedo (sem sequer consultar materias_vetorizadas para candidatos) e o
        // resultado segue com candidatos intactos, na ordem neutra do filtro de horário.
        db.turmas.push({ id_materia: 2, ano_periodo: "2026.2", horario: "2M12" });

        const livreTotal = maskLivre(0n, ["M", "T", "N"]);
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livreTotal.toString(), "2026.2");
        expect("candidatos" in resultado).toBe(true);
        expect((resultado as any).candidatos.length).toBeGreaterThan(0);
    });

    it("materias_vetorizadas falhando na busca dos candidatos: degrada graciosamente (não lança, mantém candidatos do filtro de horário)", async () => {
        db.turmas.push({ id_materia: 2, ano_periodo: "2026.2", horario: "2M12" });

        // Mock dedicado: a 1ª consulta a materias_vetorizadas (calcularVetorPerfil, busca por
        // FGA0001 concluída) funciona normalmente; a 2ª (calcularSimilaridadesCandidatos, busca
        // por FGA0002 candidata) rejeita, simulando o novo ponto de falha (não é mais a RPC).
        getMock.mockImplementation(() => ({
            from: (t: string) => {
                if (t !== "materias_vetorizadas") return tableFrom(t);
                return {
                    select: () => ({
                        in: (_col: string, vals: string[]) => {
                            if (vals.includes("FGA0002")) {
                                return Promise.reject(new Error("timeout"));
                            }
                            return {
                                then: (resolve: any) =>
                                    resolve({ data: [{ codigo_materia: "FGA0001", embedding: [0.1, 0.2] }], error: null }),
                            };
                        },
                    }),
                };
            },
            rpc: async () => ({ data: [], error: null }),
        }));

        // Histórico não-vazio (FGA0001 concluída) pra garantir que calcularVetorPerfil ache um
        // perfil e o código realmente chegue a chamar calcularSimilaridadesCandidatos (senão o
        // try/catch nunca seria exercido).
        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({ dados_fluxograma: [[{ codigo: "FGA0001", status: "APR" }]] }),
                materiasMapeadas: materiasMapeadasFake,
                codigosComOferta: new Set(["FGA0002"]),
            },
        });

        const livreTotal = maskLivre(0n, ["M", "T", "N"]);
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livreTotal.toString(), "2026.2");
        expect("candidatos" in resultado).toBe(true);
        expect((resultado as any).candidatos.length).toBeGreaterThan(0);
    });
});

describe("recomendarPorHorarioLivre — dedupe de candidatos (Fix 4)", () => {
    it("o mesmo código aparecendo em dois níveis de materiasMapeadas não duplica o candidato final", async () => {
        db.turmas.push({ id_materia: 1, ano_periodo: "2026.2", horario: "2M12" });

        const materiasComDuplicata = [
            ...materiasMapeadasFake,
            {
                codigo: "FGA0001",
                nome: "Obrigatória Pendente (duplicata de nível)",
                creditos: 4,
                nivel: 5,
                obrigatoria: true,
                tipo_natureza: 0,
                carga_horaria: 60,
            },
        ];
        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({ dados_fluxograma: [] }),
                materiasMapeadas: materiasComDuplicata,
                codigosComOferta: new Set(["FGA0002"]),
            },
        });

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.filter((c) => c.codigo === "FGA0001")).toHaveLength(1);
    });
});

/**
 * Pré-requisitos + matérias já na grade.
 *
 * FGA0005 exige FGA0001. O que satisfaz o pré-requisito é o conjunto
 * "cumpridas" = APR/CUMP ∪ MATR — matéria MATR é do semestre corrente e estará
 * concluída antes do semestre que o aluno está montando. Matéria apenas ALOCADA
 * na grade em construção NÃO satisfaz: ela é do MESMO semestre, então não pode
 * ser pré-requisito de outra da mesma grade.
 */
describe("recomendarPorHorarioLivre — pré-requisitos e matérias já na grade", () => {
    const FGA0005_DEPENDE_DE_FGA0001 = {
        codigo: "FGA0005",
        nome: "Depende de FGA0001",
        creditos: 4,
        nivel: 4,
        obrigatoria: true,
        tipo_natureza: 0,
        carga_horaria: 60,
        preRequisitos: { condicoes: ["FGA0001"], operador: "E" },
    };

    /** Cadastra id_materia + turma no horário livre pra FGA0005. */
    function ofertarFGA0005() {
        db.materias.push({ id_materia: 5, codigo_materia: "FGA0005" });
        db.turmas.push({ id_materia: 5, ano_periodo: "2026.2", horario: "2M12" });
    }

    function mockarPlano(fluxograma: unknown[], materias: unknown[], oferta: string[]) {
        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({ dados_fluxograma: fluxograma }),
                materiasMapeadas: materias,
                codigosComOferta: new Set(oferta),
            },
        });
    }

    it("exclui matéria cujo pré-requisito o aluno NÃO cumpriu", async () => {
        ofertarFGA0005();
        // Histórico vazio — FGA0001 não foi cursada.
        mockarPlano([], [...materiasMapeadasFake, FGA0005_DEPENDE_DE_FGA0001], ["FGA0002"]);

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).not.toContain("FGA0005");
    });

    it("inclui matéria cujo pré-requisito está APROVADO no histórico", async () => {
        ofertarFGA0005();
        mockarPlano(
            [[{ codigo: "FGA0001", status: "APR" }]],
            [...materiasMapeadasFake, FGA0005_DEPENDE_DE_FGA0001],
            ["FGA0002"]
        );

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).toContain("FGA0005");
    });

    it("inclui matéria cujo pré-requisito está MATR (cursando agora) — estará concluído no semestre alvo", async () => {
        ofertarFGA0005();
        mockarPlano(
            [[{ codigo: "FGA0001", status: "MATR" }]],
            [...materiasMapeadasFake, FGA0005_DEPENDE_DE_FGA0001],
            ["FGA0002"]
        );

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).toContain("FGA0005");
    });

    it("NÃO libera pré-requisito que está só alocado na grade em construção (mesmo semestre)", async () => {
        ofertarFGA0005();
        // Histórico vazio: FGA0001 só está na grade que o aluno está montando agora.
        mockarPlano([], [...materiasMapeadasFake, FGA0005_DEPENDE_DE_FGA0001], ["FGA0002"]);

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre(
            "aluno@unb.br",
            "8117/-2 - 2018.2",
            livre.toString(),
            "2026.2",
            ["FGA0001"]
        );

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).not.toContain("FGA0005");
    });

    it("não recomenda matéria que já está alocada na grade", async () => {
        db.turmas.push({ id_materia: 1, ano_periodo: "2026.2", horario: "2M12" });

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre(
            "aluno@unb.br",
            "8117/-2 - 2018.2",
            livre.toString(),
            "2026.2",
            ["FGA0001"]
        );

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).not.toContain("FGA0001");
    });

    it("não recomenda optativa que o aluno já cursou (ramo das optativas também checa o histórico)", async () => {
        db.turmas.push({ id_materia: 2, ano_periodo: "2026.2", horario: "2M12" });
        mockarPlano([[{ codigo: "FGA0002", status: "APR" }]], materiasMapeadasFake, ["FGA0002"]);

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).not.toContain("FGA0002");
    });
});

/**
 * Co-requisitos (docs/unb-domain.md: "deve cursar NO MESMO semestre, não antes").
 *
 * FGA0007 tem FGA0006 como co-requisito. Satisfeito se FGA0006 já foi cumprida,
 * já está alocada nesta grade, ou é ela mesma uma candidata viável (aí as duas
 * entram juntas). Se FGA0006 não estiver disponível de nenhuma dessas formas,
 * FGA0007 não é matriculável e não deve ser recomendada.
 */
describe("recomendarPorHorarioLivre — co-requisitos", () => {
    const FGA0007_COREQ_FGA0006 = {
        codigo: "FGA0007",
        nome: "Exige FGA0006 junto",
        creditos: 4,
        nivel: 4,
        obrigatoria: true,
        tipo_natureza: 0,
        carga_horaria: 60,
        coRequisitos: { condicoes: ["FGA0006"], operador: "E" },
    };
    const FGA0006 = {
        codigo: "FGA0006",
        nome: "Co-requisito",
        creditos: 4,
        nivel: 4,
        obrigatoria: true,
        tipo_natureza: 0,
        carga_horaria: 60,
    };

    function mockarPlano(fluxograma: unknown[], materias: unknown[]) {
        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({ dados_fluxograma: fluxograma }),
                materiasMapeadas: materias,
                codigosComOferta: new Set(["FGA0002"]),
            },
        });
    }

    it("exclui matéria cujo co-requisito não está disponível de forma nenhuma", async () => {
        db.materias.push({ id_materia: 7, codigo_materia: "FGA0007" });
        db.turmas.push({ id_materia: 7, ano_periodo: "2026.2", horario: "2M12" });
        // FGA0006 existe na matriz, mas não tem turma no horário livre.
        db.materias.push({ id_materia: 6, codigo_materia: "FGA0006" });
        db.turmas.push({ id_materia: 6, ano_periodo: "2026.2", horario: "5N12" });
        mockarPlano([], [...materiasMapeadasFake, FGA0007_COREQ_FGA0006, FGA0006]);

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).not.toContain("FGA0007");
    });

    it("inclui quando o co-requisito já está alocado na grade (cursado junto)", async () => {
        db.materias.push({ id_materia: 7, codigo_materia: "FGA0007" });
        db.turmas.push({ id_materia: 7, ano_periodo: "2026.2", horario: "2M12" });
        mockarPlano([], [...materiasMapeadasFake, FGA0007_COREQ_FGA0006, FGA0006]);

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre(
            "aluno@unb.br",
            "8117/-2 - 2018.2",
            livre.toString(),
            "2026.2",
            ["FGA0006"]
        );

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).toContain("FGA0007");
    });

    it("inclui quando o co-requisito já foi cursado", async () => {
        db.materias.push({ id_materia: 7, codigo_materia: "FGA0007" });
        db.turmas.push({ id_materia: 7, ano_periodo: "2026.2", horario: "2M12" });
        mockarPlano(
            [[{ codigo: "FGA0006", status: "APR" }]],
            [...materiasMapeadasFake, FGA0007_COREQ_FGA0006, FGA0006]
        );

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).toContain("FGA0007");
    });

    it("co-requisito que também é candidato viável: as duas entram, e o par fica explícito", async () => {
        db.materias.push({ id_materia: 7, codigo_materia: "FGA0007" });
        db.materias.push({ id_materia: 6, codigo_materia: "FGA0006" });
        // Ambas com turma dentro do horário livre (slots distintos, sem conflito).
        db.turmas.push({ id_materia: 7, ano_periodo: "2026.2", horario: "2M12" });
        db.turmas.push({ id_materia: 6, ano_periodo: "2026.2", horario: "3M12" });
        mockarPlano([], [...materiasMapeadasFake, FGA0007_COREQ_FGA0006, FGA0006]);

        const livre =
            maskLivre(0n, ["M", "T", "N"]) & (slotMaskFromHorario("2M12") | slotMaskFromHorario("3M12"));
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string; coRequisitos?: string[] }>;
        const codigos = candidatos.map((c) => c.codigo);
        expect(codigos).toContain("FGA0007");
        expect(codigos).toContain("FGA0006");
        // FGA0007 precisa avisar que FGA0006 tem que entrar junto.
        expect(candidatos.find((c) => c.codigo === "FGA0007")?.coRequisitos).toEqual(["FGA0006"]);
        // FGA0006 não tem co-requisito próprio pendente.
        expect(candidatos.find((c) => c.codigo === "FGA0006")?.coRequisitos ?? []).toEqual([]);
    });
});

/**
 * Equivalência ponta a ponta no atuador. O fluxograma só pré-resolve equivalência de
 * obrigatórias, então uma OPTATIVA equivalente a algo já cursado escapava do
 * `completed` e voltava a ser recomendada.
 */
describe("recomendarPorHorarioLivre — equivalências", () => {
    it("não recomenda optativa equivalente a uma matéria que o aluno já cursou", async () => {
        db.turmas.push({ id_materia: 2, ano_periodo: "2026.2", horario: "2M12" });

        const optativaComEquivalencia = {
            ...materiasMapeadasFake[1], // FGA0002, optativa com oferta
            equivalencias: [{ condicoes: ["CIC0234"], operador: "OU" }],
        };
        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                // Aluno cursou CIC0234, que é equivalente a FGA0002.
                fluxogramaAtual: JSON.stringify({
                    dados_fluxograma: [[{ codigo: "CIC0234", status: "APR" }]],
                }),
                materiasMapeadas: [materiasMapeadasFake[0], optativaComEquivalencia],
                codigosComOferta: new Set(["FGA0002"]),
            },
        });

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        expect(candidatos.map((c) => c.codigo)).not.toContain("FGA0002");
    });

    it("libera pré-requisito cumprido por equivalência", async () => {
        db.materias.push({ id_materia: 5, codigo_materia: "FGA0005" });
        db.turmas.push({ id_materia: 5, ano_periodo: "2026.2", horario: "2M12" });

        // FGA0005 exige FGA0001. O aluno não cursou FGA0001, mas cursou CIC0234,
        // que é equivalente a FGA0001.
        const fga0001ComEquivalencia = {
            ...materiasMapeadasFake[0], // FGA0001
            equivalencias: [{ condicoes: ["CIC0234"], operador: "OU" }],
        };
        const fga0005 = {
            codigo: "FGA0005",
            nome: "Depende de FGA0001",
            creditos: 4,
            nivel: 4,
            obrigatoria: true,
            tipo_natureza: 0,
            carga_horaria: 60,
            preRequisitos: { condicoes: ["FGA0001"], operador: "E" },
        };
        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({
                    dados_fluxograma: [[{ codigo: "CIC0234", status: "APR" }]],
                }),
                materiasMapeadas: [fga0001ComEquivalencia, fga0005],
                codigosComOferta: new Set([]),
            },
        });

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre("aluno@unb.br", "8117/-2 - 2018.2", livre.toString(), "2026.2");

        const candidatos = (resultado as any).candidatos as Array<{ codigo: string }>;
        // FGA0005 liberada pela equivalência; FGA0001 sai por já estar cumprida.
        expect(candidatos.map((c) => c.codigo)).toContain("FGA0005");
        expect(candidatos.map((c) => c.codigo)).not.toContain("FGA0001");
    });
});

describe("AtuadorGrade — revisor (código citado precisa estar nos candidatos)", () => {
    beforeEach(() => {
        mockCreate.mockReset();
        db.turmas.length = 0;
        db.turmas.push({ id_materia: 1, codigo_materia: "FGA0001", ano_periodo: "2026.2", horario: "2M12" });
    });

    it("aprova quando o código citado no MONTAR_GRADE está entre os candidatos retornados pela tool", async () => {
        let chamou = 0;
        mockCreate.mockImplementation(async (req: any) => {
            chamou++;
            const jaTemTool = req.messages.some((m: any) => m.role === "tool");
            if (!jaTemTool) {
                return {
                    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "recomendar_por_horario_livre", arguments: "{}" } }] } }],
                };
            }
            return { choices: [{ message: { role: "assistant", content: "Achei! [MONTAR_GRADE|FGA0001]" } }] };
        });

        const freeMaskTotal = (1n << 96n) - 1n; // universo inteiro, mesmo valor usado nos outros testes deste describe
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        const resultado = await run(agente, "tenho um buraco na segunda de manhã, me recomenda algo");
        expect(String(resultado.finalOutput)).toContain("[MONTAR_GRADE|FGA0001]");
    });

    it("reprova e reexecuta quando o código citado NÃO está nos candidatos — runGradeComRevisao corrige", async () => {
        let tentativa = 0;
        mockCreate.mockImplementation(async (req: any) => {
            const jaTemTool = req.messages.some((m: any) => m.role === "tool");
            if (!jaTemTool) {
                return {
                    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "recomendar_por_horario_livre", arguments: "{}" } }] } }],
                };
            }
            tentativa++;
            const codigo = tentativa === 1 ? "FGA9999" : "FGA0001"; // 1ª vez alucina, 2ª vez corrige
            return { choices: [{ message: { role: "assistant", content: `Beleza! [MONTAR_GRADE|${codigo}]` } }] };
        });

        const freeMaskTotal = (1n << 96n) - 1n; // universo inteiro, simplificado pro teste
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        const { reply } = await runGradeComRevisao(agente, "me recomenda algo pro horário livre");
        expect(reply).toContain("FGA0001");
        expect(reply).not.toContain("FGA9999");
    });

    it("reprova duas vezes seguidas → escalona pra resposta fixa (revisor do revisor)", async () => {
        mockCreate.mockImplementation(async (req: any) => {
            const jaTemTool = req.messages.some((m: any) => m.role === "tool");
            if (!jaTemTool) {
                return {
                    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "recomendar_por_horario_livre", arguments: "{}" } }] } }],
                };
            }
            return { choices: [{ message: { role: "assistant", content: "Vixe! [MONTAR_GRADE|FGA9999]" } }] }; // sempre alucina
        });

        const freeMaskTotal = (1n << 96n) - 1n;
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        const { reply } = await runGradeComRevisao(agente, "me recomenda algo pro horário livre");
        expect(reply).toBe(RESPOSTA_ESCALONAMENTO_GRADE);
    });

    it("reprova quando o modelo cita um código SEM ter chamado a tool nesta execução (bypass) — nada foi verificado", async () => {
        // O modelo ignora a instrução de sempre chamar a tool primeiro e já emite a
        // tag na primeira resposta. ultimosCandidatos nunca é setado (fica null).
        // Isso NÃO pode ser tratado como "nada a verificar" — é uma citação não
        // verificada e precisa ser rejeitada como qualquer código inválido.
        mockCreate.mockImplementation(async () => ({
            choices: [{ message: { role: "assistant", content: "Beleza! [MONTAR_GRADE|FGA9999]" } }],
        }));

        const freeMaskTotal = (1n << 96n) - 1n;
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        await expect(run(agente, "me recomenda algo pro horário livre")).rejects.toThrow(
            OutputGuardrailTripwireTriggered
        );

        // runGradeComRevisao nunca escala pra fora um código não verificado: como o mock
        // sempre pula a tool, a reexecução também reprova e o wrapper escalona.
        const { reply } = await runGradeComRevisao(agente, "me recomenda algo pro horário livre");
        expect(reply).toBe(RESPOSTA_ESCALONAMENTO_GRADE);
        expect(reply).not.toContain("FGA9999");
    });

    it("reprova quando a tag mistura código válido e inválido — [MONTAR_GRADE|FGA0001,FGA9999]", async () => {
        mockCreate.mockImplementation(async (req: any) => {
            const jaTemTool = req.messages.some((m: any) => m.role === "tool");
            if (!jaTemTool) {
                return {
                    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "recomendar_por_horario_livre", arguments: "{}" } }] } }],
                };
            }
            return {
                choices: [{ message: { role: "assistant", content: "Beleza! [MONTAR_GRADE|FGA0001,FGA9999]" } }],
            };
        });

        const freeMaskTotal = (1n << 96n) - 1n;
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        await expect(run(agente, "me recomenda algo pro horário livre")).rejects.toThrow(
            OutputGuardrailTripwireTriggered
        );
    });

    it("aprova resposta puramente conversacional, sem tag [MONTAR_GRADE|...] nenhuma", async () => {
        mockCreate.mockImplementation(async (req: any) => {
            const jaTemTool = req.messages.some((m: any) => m.role === "tool");
            if (!jaTemTool) {
                return {
                    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "recomendar_por_horario_livre", arguments: "{}" } }] } }],
                };
            }
            return {
                choices: [{ message: { role: "assistant", content: "Não achei nada certeiro pro seu horário livre agora." } }],
            };
        });

        const freeMaskTotal = (1n << 96n) - 1n;
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        const resultado = await run(agente, "me recomenda algo pro horário livre");
        expect(String(resultado.finalOutput)).toContain("Não achei nada certeiro");
    });
});

/**
 * Oferta por equivalência: quando a matéria da matriz mudou de código, a turma é
 * publicada sob o código NOVO. Sem olhar equivalência, ela some da recomendação.
 * Caso real (matriz 693, Eng. de Software): CIC0151 sem turma, CIC0197/FGA0158 com.
 *
 * Spec: docs/superpowers/specs/2026-08-03-equivalencias-oferta-turmas-design.md
 */
describe("recomendarPorHorarioLivre — turma achada via equivalência", () => {
    it("recomenda a matéria da matriz quando só a equivalente tem turma, informando o código ofertado", async () => {
        // FGA0001 (matriz) mudou de código: não tem turma própria; FGA0900 é a nova.
        db.materias.push({ id_materia: 9, codigo_materia: "FGA0900" });
        db.turmas.push({ id_materia: 9, ano_periodo: "2026.2", horario: "2M12" });

        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({ dados_fluxograma: [] }),
                materiasMapeadas: [
                    {
                        ...materiasMapeadasFake[0],
                        equivalencias: [{ operador: "OU", condicoes: ["FGA0900"] }],
                    },
                ],
                codigosComOferta: new Set<string>(),
            },
        });

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre(
            "aluno@unb.br",
            "8117/-2 - 2018.2",
            livre.toString(),
            "2026.2"
        );

        const candidatos = (resultado as any).candidatos as Array<{
            codigo: string;
            codigoOfertado?: string;
        }>;
        // O candidato é o código DA MATRIZ — é ele que vai na tag [MONTAR_GRADE|...].
        expect(candidatos.map((c) => c.codigo)).toEqual(["FGA0001"]);
        // Mas o aluno se matricula no código realmente ofertado.
        expect(candidatos[0].codigoOfertado).toBe("FGA0900");
    });

    it("não preenche codigoOfertado quando a turma é do próprio código", async () => {
        db.turmas.push({ id_materia: 1, ano_periodo: "2026.2", horario: "2M12" });

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre(
            "aluno@unb.br",
            "8117/-2 - 2018.2",
            livre.toString(),
            "2026.2"
        );

        const candidatos = (resultado as any).candidatos as Array<{
            codigo: string;
            codigoOfertado?: string;
        }>;
        expect(candidatos.map((c) => c.codigo)).toEqual(["FGA0001"]);
        expect(candidatos[0].codigoOfertado).toBeUndefined();
    });

    /** "X E Y" só vale cursando os dois — a turma de X sozinha não cobre a matéria. */
    it("equivalência com operador E não vira oferta", async () => {
        db.materias.push({ id_materia: 9, codigo_materia: "FGA0900" });
        db.turmas.push({ id_materia: 9, ano_periodo: "2026.2", horario: "2M12" });

        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({ dados_fluxograma: [] }),
                materiasMapeadas: [
                    {
                        ...materiasMapeadasFake[0],
                        equivalencias: [{ operador: "E", condicoes: ["FGA0900", "FGA0901"] }],
                    },
                ],
                codigosComOferta: new Set<string>(),
            },
        });

        const livreTotal = maskLivre(0n, ["M", "T", "N"]);
        const resultado = await recomendarPorHorarioLivre(
            "aluno@unb.br",
            "8117/-2 - 2018.2",
            livreTotal.toString(),
            "2026.2"
        );

        expect((resultado as any).candidatos).toEqual([]);
    });

    it("a turma da equivalente ainda precisa caber no horário livre", async () => {
        db.materias.push({ id_materia: 9, codigo_materia: "FGA0900" });
        // Turma da equivalente na terça à tarde, mas o livre só cobre segunda de manhã.
        db.turmas.push({ id_materia: 9, ano_periodo: "2026.2", horario: "3T12" });

        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({ dados_fluxograma: [] }),
                materiasMapeadas: [
                    {
                        ...materiasMapeadasFake[0],
                        equivalencias: [{ operador: "OU", condicoes: ["FGA0900"] }],
                    },
                ],
                codigosComOferta: new Set<string>(),
            },
        });

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre(
            "aluno@unb.br",
            "8117/-2 - 2018.2",
            livre.toString(),
            "2026.2"
        );

        expect((resultado as any).candidatos).toEqual([]);
    });

    /**
     * Substituto é FALLBACK, não alternativa: se a matéria ainda é ofertada no próprio
     * código neste período, é nele que o aluno se matricula — mesmo que o horário dessa
     * turma seja pior. Medido em produção: 1.396 pares têm oferta nos DOIS códigos, ou
     * seja, coexistem em vez de terem sido renomeados.
     */
    it("não cai no substituto quando a matéria ainda tem turma própria no período", async () => {
        db.materias.push({ id_materia: 9, codigo_materia: "FGA0900" });
        // FGA0001 É ofertada, mas na terça à tarde — fora do horário livre do aluno.
        db.turmas.push({ id_materia: 1, ano_periodo: "2026.2", horario: "3T12" });
        // A equivalente tem turma que caberia. Não pode ser recomendada mesmo assim.
        db.turmas.push({ id_materia: 9, ano_periodo: "2026.2", horario: "2M12" });

        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({ dados_fluxograma: [] }),
                materiasMapeadas: [
                    {
                        ...materiasMapeadasFake[0],
                        equivalencias: [{ operador: "OU", condicoes: ["FGA0900"] }],
                    },
                ],
                codigosComOferta: new Set<string>(),
            },
        });

        const livre = maskLivre(0n, ["M", "T", "N"]) & slotMaskFromHorario("2M12");
        const resultado = await recomendarPorHorarioLivre(
            "aluno@unb.br",
            "8117/-2 - 2018.2",
            livre.toString(),
            "2026.2"
        );

        expect((resultado as any).candidatos).toEqual([]);
    });

    /**
     * Equivalência é usada para achar OFERTA, não para dispensar a matéria. Se o aluno
     * já cursou a equivalente, expandirCumpridasComEquivalencias a marca como cumprida
     * e ela não pode voltar como recomendação.
     */
    it("não recomenda quando o aluno JÁ cursou a equivalente", async () => {
        db.materias.push({ id_materia: 9, codigo_materia: "FGA0900" });
        db.turmas.push({ id_materia: 9, ano_periodo: "2026.2", horario: "2M12" });

        (montarDadosPlano as jest.Mock).mockResolvedValueOnce({
            dados: {
                fluxogramaAtual: JSON.stringify({
                    dados_fluxograma: [[{ codigo: "FGA0900", status: "APR" }]],
                }),
                materiasMapeadas: [
                    {
                        ...materiasMapeadasFake[0],
                        equivalencias: [{ operador: "OU", condicoes: ["FGA0900"] }],
                    },
                ],
                codigosComOferta: new Set<string>(),
            },
        });

        const livreTotal = maskLivre(0n, ["M", "T", "N"]);
        const resultado = await recomendarPorHorarioLivre(
            "aluno@unb.br",
            "8117/-2 - 2018.2",
            livreTotal.toString(),
            "2026.2"
        );

        expect((resultado as any).candidatos).toEqual([]);
    });
});

/**
 * Fase 3 (montador-de-grade-resilient-muffin.md) — tool nova `montar_grade`, que chama
 * `montarGrade()` da Facade (`montador_grade.service.ts`) de verdade (mesma matriz mockada
 * via `montarDadosPlano`/`resolverPeriodoAtivo` acima) e o guardrail evoluído
 * (`criarRevisorHorario`), que agora também valida pares `codigo:idTurma` contra as
 * `OpcaoGrade[]` realmente retornadas — não só `codigo` solto contra `CandidatoGrade[]`.
 */
describe("AtuadorGrade — tool montar_grade (Fase 3)", () => {
    beforeEach(() => {
        mockCreate.mockReset();
        db.turmas.length = 0;
        // FGA0001 (obrigatória pendente de materiasMapeadasFake) com UMA turma real —
        // montarGrade() a aloca sozinha (FGA0002/FGA0003 sem turma aqui não atrapalham).
        db.turmas.push({ id_turmas: 55, id_materia: 1, ano_periodo: "2026.2", horario: "2M12" });
    });

    it("createGradeAgent expõe as duas tools: recomendar_por_horario_livre e montar_grade", () => {
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", "0", "2026.2");
        const nomes = (agente as any).tools?.map((t: any) => t.name) ?? [];
        expect(nomes).toContain("recomendar_por_horario_livre");
        expect(nomes).toContain("montar_grade");
    });

    it("aprova e propaga `opcaoGrade` quando o marcador cita um par codigo:idTurma real, vindo de uma OpcaoGrade[] efetivamente retornada", async () => {
        mockCreate.mockImplementation(async (req: any) => {
            const jaTemTool = req.messages.some((m: any) => m.role === "tool");
            if (!jaTemTool) {
                return {
                    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "montar_grade", arguments: "{}" } }] } }],
                };
            }
            return { choices: [{ message: { role: "assistant", content: "Beleza, montei! [MONTAR_GRADE|FGA0001:55]" } }] };
        });

        const freeMaskTotal = (1n << 96n) - 1n;
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        const { reply, opcaoGrade } = await runGradeComRevisao(agente, "monta minha grade priorizando FGA0001");

        expect(reply).toContain("[MONTAR_GRADE|FGA0001:55]");
        expect(opcaoGrade).toBeDefined();
        expect(opcaoGrade?.selecao).toEqual(expect.arrayContaining([{ codigo: "FGA0001", idTurma: 55 }]));
    });

    it("reprova e reexecuta quando o marcador cita um idTurma que NÃO está em nenhuma opção retornada — runGradeComRevisao corrige", async () => {
        let tentativa = 0;
        mockCreate.mockImplementation(async (req: any) => {
            const jaTemTool = req.messages.some((m: any) => m.role === "tool");
            if (!jaTemTool) {
                return {
                    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "montar_grade", arguments: "{}" } }] } }],
                };
            }
            tentativa++;
            const idTurma = tentativa === 1 ? 9999 : 55; // 1ª vez alucina uma turma, 2ª vez corrige
            return { choices: [{ message: { role: "assistant", content: `Beleza! [MONTAR_GRADE|FGA0001:${idTurma}]` } }] };
        });

        const freeMaskTotal = (1n << 96n) - 1n;
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        const { reply } = await runGradeComRevisao(agente, "monta minha grade priorizando FGA0001");

        expect(reply).toContain("FGA0001:55");
        expect(reply).not.toContain("9999");
    });

    it("reprova quando o código está certo mas o idTurma citado é de OUTRA matéria/turma (par errado)", async () => {
        // Turma extra pra outra matéria, pra provar que o revisor valida o PAR inteiro
        // (codigo:idTurma), não só se o idTurma existe em ALGUM lugar.
        db.turmas.push({ id_turmas: 77, id_materia: 2, ano_periodo: "2026.2", horario: "3M12" });

        mockCreate.mockImplementation(async (req: any) => {
            const jaTemTool = req.messages.some((m: any) => m.role === "tool");
            if (!jaTemTool) {
                return {
                    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "montar_grade", arguments: "{}" } }] } }],
                };
            }
            // 77 é uma turma real, mas de outra matéria — nunca de FGA0001.
            return { choices: [{ message: { role: "assistant", content: "Beleza! [MONTAR_GRADE|FGA0001:77]" } }] };
        });

        const freeMaskTotal = (1n << 96n) - 1n;
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        await expect(run(agente, "monta minha grade priorizando FGA0001")).rejects.toThrow(
            OutputGuardrailTripwireTriggered
        );
    });

    it("citação de código SOLTO (sem idTurma) continua validada contra os candidatos de recomendar_por_horario_livre, comportamento antigo intacto", async () => {
        mockCreate.mockImplementation(async (req: any) => {
            const jaTemTool = req.messages.some((m: any) => m.role === "tool");
            if (!jaTemTool) {
                return {
                    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "recomendar_por_horario_livre", arguments: "{}" } }] } }],
                };
            }
            return { choices: [{ message: { role: "assistant", content: "Achei! [MONTAR_GRADE|FGA0001]" } }] };
        });

        const freeMaskTotal = (1n << 96n) - 1n;
        const agente = createGradeAgent("aluno@unb.br", "8117/-2 - 2018.2", freeMaskTotal.toString(), "2026.2");
        const { reply, opcaoGrade } = await runGradeComRevisao(agente, "tenho um buraco na segunda de manhã, me recomenda algo");

        expect(reply).toContain("[MONTAR_GRADE|FGA0001]");
        // recomendar_por_horario_livre não passa por montar_grade — nunca tem opcaoGrade.
        expect(opcaoGrade).toBeUndefined();
    });
});
