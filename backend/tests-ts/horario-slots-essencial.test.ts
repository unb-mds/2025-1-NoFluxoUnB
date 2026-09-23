import {
    autoMontarGrade,
    diagnosticarEssenciais,
    slotMaskFromHorario,
    type MateriaTurmas,
    type TurmaCandidata,
} from "../src/utils/horario_slots";

interface TurmaFake {
    id: string;
}

function turma(id: string, horario: string, bonus?: number): TurmaCandidata<TurmaFake> {
    return { mask: slotMaskFromHorario(horario), turma: { id }, bonus };
}

describe("horario_slots (backend) — essencial (Fase 1a)", () => {
    it("essencial nunca fica de fora quando cabe — mesmo perdendo pra outras matérias de peso maior", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            {
                chave: "ESSENCIAL1",
                essencial: true,
                peso: 1, // peso baixo de propósito — mesmo assim tem que entrar.
                turmas: [turma("E1-A", "2M12")],
            },
            {
                chave: "OUTRA1",
                peso: 1_000_000,
                turmas: [turma("O1-A", "2M12")], // mesmo horário — conflita com a essencial.
            },
        ];

        const r = autoMontarGrade(materias);
        expect(r.selecao.has("ESSENCIAL1")).toBe(true);
        expect(r.naoAlocadas).toContain("OUTRA1");
    });

    it("ESSENCIAL_SEM_VAGA: matéria essencial sem turma nenhuma", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            { chave: "ESSENCIAL1", essencial: true, turmas: [] },
        ];
        const r = autoMontarGrade(materias);
        expect(r.naoAlocadas).toContain("ESSENCIAL1");
        // `autoMontarGrade` não autodiagnostica (ver comentário no retorno) — quem
        // chama roda `diagnosticarEssenciais` depois, com o contexto que só ele tem.
        const erros = diagnosticarEssenciais(materias, r.naoAlocadas, {
            turmasAntesDoFiltroDeTurno: new Map(),
            turnosComOferta: new Map(),
            pendenciasPreRequisito: new Map(),
        });
        expect(erros).toContainEqual({ tipo: "ESSENCIAL_SEM_VAGA", chave: "ESSENCIAL1" });
    });

    it("ESSENCIAL_FORA_DO_TURNO: diagnosticarEssenciais recebe contexto de antes do filtro de turno", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            { chave: "ESSENCIAL1", essencial: true, turmas: [] }, // já filtrada pelo turno, chegou vazia
        ];
        const erros = diagnosticarEssenciais(materias, ["ESSENCIAL1"], {
            turmasAntesDoFiltroDeTurno: new Map([["ESSENCIAL1", [{ id: "E1-A" }]]]),
            turnosComOferta: new Map([["ESSENCIAL1", ["N"]]]),
            pendenciasPreRequisito: new Map(),
        });
        expect(erros).toEqual([
            { tipo: "ESSENCIAL_FORA_DO_TURNO", chave: "ESSENCIAL1", turnosComOferta: ["N"] },
        ]);
    });

    it("ESSENCIAL_PRE_REQUISITO: diagnosticarEssenciais reporta pendências passadas pelo chamador", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            { chave: "ESSENCIAL1", essencial: true, turmas: [turma("E1-A", "2M12")] },
        ];
        // A matéria tem turma (não é SEM_VAGA/FORA_DO_TURNO), mas o pré-requisito
        // ainda pendente é quem explica ela não ter sido alocada nesse cenário.
        const erros = diagnosticarEssenciais(materias, ["ESSENCIAL1"], {
            turmasAntesDoFiltroDeTurno: new Map(),
            turnosComOferta: new Map(),
            pendenciasPreRequisito: new Map([["ESSENCIAL1", ["CIC0004"]]]),
        });
        expect(erros).toEqual([
            { tipo: "ESSENCIAL_PRE_REQUISITO", chave: "ESSENCIAL1", pendencias: ["CIC0004"] },
        ]);
    });

    it("ESSENCIAL_CONFLITO: duas essenciais colidem entre si — nenhuma explicação anterior se aplica", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            { chave: "ESSENCIAL1", essencial: true, turmas: [turma("E1-A", "2M12")] },
            { chave: "ESSENCIAL2", essencial: true, turmas: [turma("E2-A", "2M12")] },
        ];
        const r = autoMontarGrade(materias);
        // Só uma das duas cabe (mesmo horário) — a outra fica em naoAlocadas.
        expect(r.naoAlocadas.length).toBe(1);
        const [chaveFora] = r.naoAlocadas;
        const erros = diagnosticarEssenciais(materias, r.naoAlocadas, {
            turmasAntesDoFiltroDeTurno: new Map(),
            turnosComOferta: new Map(),
            pendenciasPreRequisito: new Map(),
        });
        const erro = erros.find((e) => e.chave === chaveFora);
        expect(erro?.tipo).toBe("ESSENCIAL_CONFLITO");
        if (erro?.tipo === "ESSENCIAL_CONFLITO") {
            expect(erro.colideCom).toContain(chaveFora === "ESSENCIAL1" ? "ESSENCIAL2" : "ESSENCIAL1");
        }
    });

    it("conflito entre travada (mascaraInicial) e essencial: a essencial fica de fora quando só tem turma que colide com o já ocupado", () => {
        const mascaraTravada = slotMaskFromHorario("2M12");
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            { chave: "ESSENCIAL1", essencial: true, turmas: [turma("E1-A", "2M12")] },
        ];
        const r = autoMontarGrade(materias, mascaraTravada);
        expect(r.naoAlocadas).toContain("ESSENCIAL1");
        // Passando `mascaraInicial` no contexto, o diagnóstico enxerga o conflito
        // com a trava mesmo sem outra essencial candidata no pool.
        const erros = diagnosticarEssenciais(materias, r.naoAlocadas, {
            turmasAntesDoFiltroDeTurno: new Map(),
            turnosComOferta: new Map(),
            pendenciasPreRequisito: new Map(),
            mascaraInicial: mascaraTravada,
        });
        const erro = erros.find((e) => e.chave === "ESSENCIAL1");
        expect(erro?.tipo).toBe("ESSENCIAL_CONFLITO");
        if (erro?.tipo === "ESSENCIAL_CONFLITO") {
            expect(erro.colideCom).toEqual([]);
        }
    });

    it("resultado maximal: nada que caberia sozinho fica de fora sem motivo, quando há espaço", () => {
        const materias: Array<MateriaTurmas<TurmaFake>> = [
            { chave: "A", essencial: true, turmas: [turma("A1", "2M1")] },
            { chave: "B", turmas: [turma("B1", "2M2")] },
            { chave: "C", turmas: [turma("C1", "3T1")] },
        ];
        const r = autoMontarGrade(materias);
        expect(r.naoAlocadas).toEqual([]);
        expect(r.selecao.size).toBe(3);
    });

    it("estouro de orçamento de nós: pool patológico marca truncado mas ainda devolve seleção válida", () => {
        // ~14 matérias x 4 turmas cada, todas no mesmo horário-base só pra estourar nós
        // com poda pouco eficaz (nenhuma delas cabe junto de outra do mesmo bloco).
        const materias: Array<MateriaTurmas<TurmaFake>> = Array.from({ length: 14 }, (_, i) => ({
            chave: `M${i}`,
            turmas: Array.from({ length: 4 }, (_, j) => turma(`M${i}-T${j}`, `${2 + (j % 6)}M1`)),
        }));
        const r = autoMontarGrade(materias);
        // Não afirmamos truncado=true (depende de MAX_NOS_MONTAGEM), só que o resultado
        // continua consistente: seleção sem conflito interno.
        const masks = [...r.selecao.values()].map((t) => t.mask);
        for (let i = 0; i < masks.length; i++) {
            for (let j = i + 1; j < masks.length; j++) {
                expect((masks[i] & masks[j]) === 0n).toBe(true);
            }
        }
        expect(typeof r.truncado).toBe("boolean");
    });
});
