/**
 * Ações da Darcy sobre a grade (services/chat/grade_acoes.ts): validação pura —
 * turma existe e é da matéria, não colide, turnos, ordem das ações.
 */
import { colisoes, normalizarAcao, simularAcoes, type AcaoGrade, type TurmaInfo } from "../src/services/chat/grade_acoes";

const turma = (idTurma: number, codigo: string, horario: string, t = "01"): TurmaInfo => ({
    idTurma,
    codigo,
    turma: t,
    docente: "Prof",
    horario,
    vagasSobrando: 5,
});

const CALC = turma(1, "MAT0026", "24M12");
const FISICA = turma(2, "IFD0171", "35T23");
const CALC_TARDE = turma(3, "MAT0026", "24T23", "02");
const CALC_CHOCA_FISICA = turma(4, "MAT0026", "35T23", "03");
const PROG = turma(5, "CIC0004", "6M34");

const TURMAS = new Map([CALC, FISICA, CALC_TARDE, CALC_CHOCA_FISICA, PROG].map((t) => [t.idTurma, t]));
const simular = (acoes: AcaoGrade[], grade = [CALC, FISICA], pool: string[] = []) =>
    simularAcoes(grade, pool, acoes, TURMAS);

describe("colisoes", () => {
    it("acha quem divide horário, ignorando a própria matéria", () => {
        expect(colisoes(CALC_CHOCA_FISICA, [CALC, FISICA])).toEqual(["IFD0171"]);
        expect(colisoes(CALC_TARDE, [CALC, FISICA])).toEqual([]);
    });
});

describe("simularAcoes", () => {
    it("troca de turma válida entra e muda a grade final", () => {
        const r = simular([{ tipo: "trocarTurma", codigo: "MAT0026", idTurma: 3 }]);
        expect(r.aceitas).toEqual([{ tipo: "trocarTurma", codigo: "MAT0026", idTurma: 3, turma: "02", horario: "24T23" }]);
        expect(r.gradeFinal.find((t) => t.codigo === "MAT0026")?.idTurma).toBe(3);
    });

    it("troca que colide é rejeitada com o motivo", () => {
        const r = simular([{ tipo: "trocarTurma", codigo: "MAT0026", idTurma: 4 }]);
        expect(r.aceitas).toEqual([]);
        expect(r.rejeitadas[0].motivo).toContain("colide com IFD0171");
    });

    it("turma de outra matéria ou inexistente é rejeitada", () => {
        const r = simular([
            { tipo: "trocarTurma", codigo: "MAT0026", idTurma: 2 },
            { tipo: "adicionar", codigo: "CIC0004", idTurma: 999 },
        ]);
        expect(r.rejeitadas.map((x) => x.motivo)).toEqual([
            "a turma 2 é de IFD0171, não de MAT0026",
            "turma 999 não existe neste período",
        ]);
    });

    it("ações em sequência: remover libera o horário para a próxima", () => {
        const r = simular([
            { tipo: "remover", codigo: "IFD0171" },
            { tipo: "trocarTurma", codigo: "MAT0026", idTurma: 4 },
        ]);
        expect(r.aceitas).toHaveLength(2);
        expect(r.gradeFinal.map((t) => t.idTurma)).toEqual([4]);
    });

    it("adicionar sem turma só põe na lista; depois dá para priorizar", () => {
        const r = simular([
            { tipo: "adicionar", codigo: "cic0004" },
            { tipo: "priorizar", codigo: "CIC0004" },
        ]);
        expect(r.aceitas).toEqual([
            { tipo: "adicionar", codigo: "CIC0004" },
            { tipo: "priorizar", codigo: "CIC0004" },
        ]);
        expect(r.gradeFinal).toHaveLength(2);
    });

    it("não remove nem prioriza o que não está na grade nem na lista", () => {
        const r = simular([
            { tipo: "remover", codigo: "FGA9999" },
            { tipo: "priorizar", codigo: "FGA9999" },
        ]);
        expect(r.aceitas).toEqual([]);
        expect(r.rejeitadas).toHaveLength(2);
    });

    it("turnos: rejeita se alguma matéria da grade cai fora", () => {
        expect(simular([{ tipo: "turnos", turnos: ["M"] }]).rejeitadas[0].motivo).toContain("IFD0171");
        expect(simular([{ tipo: "turnos", turnos: ["M", "T"] }]).aceitas).toHaveLength(1);
    });

    it("limpar esvazia a grade final", () => {
        expect(simular([{ tipo: "limpar" }]).gradeFinal).toEqual([]);
    });
});

describe("normalizarAcao", () => {
    it("saneia código, id e turnos", () => {
        expect(normalizarAcao({ tipo: "adicionar", codigo: " mat0026 ", idTurma: 3 })).toEqual({
            tipo: "adicionar",
            codigo: "MAT0026",
            idTurma: 3,
        });
        expect(normalizarAcao({ tipo: "trocarTurma", codigo: "MAT0026", idTurma: 0 })).toBeNull();
        expect(normalizarAcao({ tipo: "turnos", turnos: ["M", "X" as any, "M"] })).toEqual({ tipo: "turnos", turnos: ["M"] });
        expect(normalizarAcao({ tipo: "criarCenario", nome: "  " })).toBeNull();
    });
});

describe("desfazer", () => {
    it("ação 'desfazer' passa pela simulação sem mexer na grade", () => {
        const r = simular([{ tipo: "desfazer", pontoId: "p1", rotulo: "Darcy · Sem sexta" }]);
        expect(r.aceitas).toEqual([{ tipo: "desfazer", pontoId: "p1", rotulo: "Darcy · Sem sexta" }]);
        expect(r.gradeFinal.map((t) => t.codigo)).toEqual(["MAT0026", "IFD0171"]);
    });

    it("sem pontoId a ação é malformada", () => {
        expect(normalizarAcao({ tipo: "desfazer", pontoId: "", rotulo: "x" })).toBeNull();
    });
});

describe("tool desfazer_alteracao_grade", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RunContext } = require("@openai/agents");
    const { criarToolsAcoesGrade } = require("../src/services/chat/grade_acoes");

    const estado = (desfazer?: Array<{ id: string; rotulo: string; quando: string }>) => ({
        tipo: "montador",
        grade: [],
        creditos: 0,
        turnos: ["M", "T", "N"],
        incluirCursando: true,
        horarioLivre: "0",
        ...(desfazer ? { desfazer } : {}),
    });

    async function chamar(est: ReturnType<typeof estado> | null, args: Record<string, unknown>) {
        const registradas: AcaoGrade[][] = [];
        const tools = criarToolsAcoesGrade(est, "2026.2", (a: AcaoGrade[]) => registradas.push(a));
        const t = tools.find((x: { name: string }) => x.name === "desfazer_alteracao_grade");
        const saida = await t.invoke(new RunContext(), JSON.stringify(args));
        return { saida: JSON.parse(String(saida)), registradas };
    }

    const PONTOS = [
        { id: "novo", rotulo: "Darcy · Sem sexta", quando: "2026-10-14T20:00:00Z" },
        { id: "velho", rotulo: "Trocou turma de MAT0026", quando: "2026-10-14T19:00:00Z" },
    ];

    it("sem pontoId desfaz o mais recente", async () => {
        const { registradas } = await chamar(estado(PONTOS), {});
        expect(registradas).toEqual([[{ tipo: "desfazer", pontoId: "novo", rotulo: "Darcy · Sem sexta" }]]);
    });

    it("com pontoId escolhe aquele", async () => {
        const { registradas } = await chamar(estado(PONTOS), { pontoId: "velho" });
        expect(registradas[0][0]).toMatchObject({ pontoId: "velho" });
    });

    it("id inexistente ou nada guardado: erro e nada registrado", async () => {
        const a = await chamar(estado(PONTOS), { pontoId: "fantasma" });
        expect(a.saida.erro).toMatch(/não existe/);
        expect(a.registradas).toEqual([]);

        const b = await chamar(estado([]), {});
        expect(b.saida.erro).toMatch(/Não há nenhuma alteração/);
        expect(b.registradas).toEqual([]);
    });

    it("fora do Montador responde que precisa da grade aberta", async () => {
        const r = await chamar(null, {});
        expect(r.saida.erro).toMatch(/grade aberta/);
    });
});
