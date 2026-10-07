import {
    autoMontarGradeOpcoes,
    slotMaskFromHorario,
    type MateriaTurmas,
    type RankingStrategy,
    type TurmaCandidata,
} from "../src/utils/horario_slots";

interface TurmaFake {
    id: string;
    docente: string | null;
}

function turma(id: string, horario: string, docente: string | null = null): TurmaCandidata<TurmaFake> {
    return { mask: slotMaskFromHorario(horario), turma: { id, docente } };
}

const ESTRATEGIA_NEUTRA: RankingStrategy<TurmaFake> = {
    nome: "neutra",
    pontuar: () => 0,
};

function estrategiaPreferindo(id: string, bonus: number): RankingStrategy<TurmaFake> {
    return {
        nome: `prefere-${id}`,
        pontuar: (t) => (t.turma.id === id ? bonus : 0),
    };
}

describe("horario_slots (backend) — autoMontarGradeOpcoes (Fase 1c)", () => {
    it("gera até maxOpcoes, nunca mais que isso", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            {
                chave: "A",
                turmas: [turma("A-manha", "2M1"), turma("A-tarde", "2T1"), turma("A-noite", "2N1")],
            },
        ];
        const estrategias: RankingStrategy<TurmaFake>[] = [
            estrategiaPreferindo("A-manha", 5),
            estrategiaPreferindo("A-tarde", 5),
            estrategiaPreferindo("A-noite", 5),
        ];
        const opcoes = autoMontarGradeOpcoes(materias, 0n, undefined, estrategias, 2);
        expect(opcoes.length).toBeLessThanOrEqual(2);
    });

    it("até 6 opções diversas quando há espaço de escolha real (default maxOpcoes)", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            {
                chave: "A",
                turmas: [turma("A-manha", "2M1"), turma("A-tarde", "2T1"), turma("A-noite", "2N1")],
            },
        ];
        const estrategias: RankingStrategy<TurmaFake>[] = [
            estrategiaPreferindo("A-manha", 5),
            estrategiaPreferindo("A-tarde", 5),
            estrategiaPreferindo("A-noite", 5),
        ];
        const opcoes = autoMontarGradeOpcoes(materias, 0n, undefined, estrategias);
        expect(opcoes.length).toBe(3);
        const nomes = opcoes.map((o) => o.estrategia).sort();
        expect(nomes).toEqual(["prefere-A-manha", "prefere-A-noite", "prefere-A-tarde"].sort());
    });

    it("dedupe por assinatura: duas estratégias que convergem pra mesma seleção só geram uma opção", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            { chave: "A", turmas: [turma("A-unica", "2M1")] }, // só uma turma: toda estratégia converge.
        ];
        const opcoes = autoMontarGradeOpcoes(
            materias,
            0n,
            undefined,
            [ESTRATEGIA_NEUTRA, { nome: "outra-neutra", pontuar: () => 0 }],
            6,
            (t) => t.id
        );
        expect(opcoes.length).toBe(1);
    });

    it("professor preferido sem vaga: matéria ainda é alocada, nunca é filtrada por não ter a turma do professor", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            {
                chave: "A",
                turmas: [turma("A-1", "2M1", "Prof. João")], // só existe turma de outro professor.
            },
        ];
        const estrategiaProfessorInexistente: RankingStrategy<TurmaFake> = {
            nome: "prefere-maria",
            pontuar: (t) => (t.turma.docente === "Prof. Maria" ? 100 : 0),
        };
        const opcoes = autoMontarGradeOpcoes(materias, 0n, undefined, [estrategiaProfessorInexistente]);
        expect(opcoes.length).toBe(1);
        expect(opcoes[0].resultado.selecao.has("A")).toBe(true);
        expect(opcoes[0].resultado.naoAlocadas).toEqual([]);
    });

    it("limite de horas (orçamento de créditos) respeitado pelas não-essenciais e ignorado pela essencial", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            {
                chave: "ESSENCIAL1",
                essencial: true,
                obrigatoria: true, // mesmo mecanismo de "nunca barrada pelo teto" já usado por matrícula real.
                creditos: 10,
                turmas: [turma("E1", "2M1")],
            },
            {
                chave: "OUTRA1",
                creditos: 10,
                turmas: [turma("O1", "3T1")],
            },
        ];
        // Orçamento de 10: a essencial sozinha já satura, mas continua entrando; a
        // não-essencial fica de fora por estourar o teto.
        const opcoes = autoMontarGradeOpcoes(materias, 0n, 10, [ESTRATEGIA_NEUTRA]);
        expect(opcoes.length).toBe(1);
        const { resultado } = opcoes[0];
        expect(resultado.selecao.has("ESSENCIAL1")).toBe(true);
        expect(resultado.naoAlocadas).toContain("OUTRA1");
    });

    it("métricas agregadas: diasComAula e horasTotais refletem a seleção final", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            { chave: "A", turmas: [turma("A1", "2M12")] }, // 2 módulos seguidos = ~1h55.
            { chave: "B", turmas: [turma("B1", "3T1")] },
        ];
        const opcoes = autoMontarGradeOpcoes(materias, 0n, undefined, [ESTRATEGIA_NEUTRA]);
        expect(opcoes.length).toBe(1);
        const { metricas } = opcoes[0];
        expect(metricas.diasComAula).toBe(2); // segunda e terça.
        expect(metricas.horasTotais).toBeGreaterThan(0);
        expect(metricas.minutosDeLacuna).toBe(0); // nenhum furo dentro de um único bloco por dia.
    });
});

describe("horario_slots (backend) — estratégias que avaliam a grade inteira", () => {
    type T = { id: number; horario: string };
    let proximoId = 1;
    const mat = (chave: string, ...hs: string[]): MateriaTurmas<T> => ({
        chave,
        peso: 1_000_000,
        creditos: 4,
        turmas: hs.map((h) => ({ mask: slotMaskFromHorario(h), turma: { id: proximoId++, horario: h } })),
    });
    // Cenário do experimento que motivou a mudança (mesmo do frontend).
    const pool = () => [
        mat("A", "24M12", "35T23", "35N12"),
        mat("B", "24M34", "35M12", "24T45"),
        mat("C", "35M34", "24T23", "6M1234"),
        mat("D", "35T45", "24N12", "6T2345"),
        mat("E", "24T23", "35M12", "35T23"),
    ];
    const ESTRATEGIAS: RankingStrategy<T>[] = [
        { nome: "Menos dias", avaliar: (m) => [m.diasComAula, m.minutosDeLacuna] },
        { nome: "Menos lacunas", avaliar: (m) => [m.minutosDeLacuna, m.diasComAula] },
        { nome: "Semana equilibrada", avaliar: (m) => [m.variancaCargaDiaria, m.minutosDeLacuna] },
    ];

    it("cada estratégia vence no próprio critério e nenhuma perde matéria", () => {
        // Uma estratégia por chamada: sem o dedupe esconder quem convergiu.
        const porNome = new Map(
            ESTRATEGIAS.map((e) => [e.nome, autoMontarGradeOpcoes(pool(), 0n, 20, [e], 6, (t) => t.id)[0]])
        );
        const todas = [...porNome.values()];
        const dias = porNome.get("Menos dias")!;
        const lacunas = porNome.get("Menos lacunas")!;
        const equilibrada = porNome.get("Semana equilibrada")!;

        for (const o of todas) expect(o.resultado.selecao.size).toBe(5);
        for (const o of todas) {
            expect(dias.metricas.diasComAula).toBeLessThanOrEqual(o.metricas.diasComAula);
            expect(lacunas.metricas.minutosDeLacuna).toBeLessThanOrEqual(o.metricas.minutosDeLacuna);
            expect(equilibrada.metricas.variancaCargaDiaria).toBeLessThanOrEqual(o.metricas.variancaCargaDiaria);
        }
        // Regressão: a "Menos lacunas" antiga devolvia mais furo que a "Menos dias".
        expect(lacunas.metricas.minutosDeLacuna).toBeLessThan(dias.metricas.minutosDeLacuna);
    });

    it("métrica nunca troca o professor preferido (bônus) por uma semana mais bonita", () => {
        const materias: Array<MateriaTurmas<T>> = [
            {
                chave: "A",
                turmas: [
                    { mask: slotMaskFromHorario("2M12"), turma: { id: 1, horario: "2M12" } },
                    { mask: slotMaskFromHorario("3T12"), turma: { id: 2, horario: "3T12" }, bonus: 1e-4 },
                ],
            },
            { chave: "B", turmas: [{ mask: slotMaskFromHorario("2M34"), turma: { id: 3, horario: "2M34" } }] },
        ];
        const [opcao] = autoMontarGradeOpcoes(materias, 0n, undefined, [ESTRATEGIAS[0]]);
        expect(opcao.resultado.selecao.get("A")!.turma.id).toBe(2);
    });

    it("duas matérias coladas (M12 + M34) não geram lacuna", () => {
        // M2 termina 09:50 e M3 começa 10:00 — a pausa regular de 10 min não é furo.
        const materias: Array<MateriaTurmas<T>> = [
            { chave: "A", turmas: [{ mask: slotMaskFromHorario("2M12"), turma: { id: 1, horario: "2M12" } }] },
            { chave: "B", turmas: [{ mask: slotMaskFromHorario("2M34"), turma: { id: 2, horario: "2M34" } }] },
        ];
        const [opcao] = autoMontarGradeOpcoes(materias, 0n, undefined, [ESTRATEGIAS[1]]);
        expect(opcao.metricas.minutosDeLacuna).toBe(0);
    });
});
