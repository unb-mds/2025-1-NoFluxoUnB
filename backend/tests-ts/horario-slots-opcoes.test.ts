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
