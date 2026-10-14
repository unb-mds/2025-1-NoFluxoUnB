/**
 * Estrela (matéria prioritária) no montador do backend: o motivo de cada uma que
 * ficou de fora — pura, sem banco.
 */
import { resultadoDaPrioritaria, type EntradaBase, type TurmaOferta } from "../src/services/grade/montador_grade.service";
import { slotMaskFromHorario } from "../src/utils/horario_slots";

const turma = (id: number, horario: string): TurmaOferta => ({
    id_turmas: id,
    id_materia: 1,
    turma: "01",
    docente: null,
    horario,
    local: null,
    ano_periodo: "2026.2",
    vagas_ofertadas: 30,
    vagas_ocupadas: 0,
    vagas_sobrando: 30,
});

const entrada = (chave: string, horarios: string[], extra: Partial<EntradaBase> = {}): EntradaBase => ({
    chave,
    turmas: horarios.map((h, i) => ({ mask: slotMaskFromHorario(h), turma: turma(i + 1, h), bonus: 0 })),
    peso: 1,
    creditos: 4,
    obrigatoria: false,
    essencial: false,
    desbloqueada: true,
    ...extra,
});

/** Opção mínima: só `resultado.selecao` interessa aqui. */
const opcao = (sel: Record<string, string>) =>
    ({
        resultado: {
            selecao: new Map(
                Object.entries(sel).map(([cod, h]) => [cod, { mask: slotMaskFromHorario(h), turma: turma(99, h) }])
            ),
        },
    }) as any;

const reais = (m: Record<string, string[]>) =>
    new Map(Object.entries(m).map(([c, hs]) => [c, hs.map((h, i) => turma(i + 1, h))]));

describe("resultadoDaPrioritaria", () => {
    it("entrou quando está na seleção escolhida", () => {
        const r = resultadoDaPrioritaria("FGA1", [entrada("FGA1", ["24M12"])], opcao({ FGA1: "24M12" }), reais({}), new Map());
        expect(r).toEqual({ codigo: "FGA1", entrou: true });
    });

    it("não entrou por colisão: diz com quem o horário bate", () => {
        const r = resultadoDaPrioritaria(
            "FGA1",
            [entrada("FGA1", ["24M12"])],
            opcao({ MAT0026: "24M12" }),
            reais({ FGA1: ["24M12"] }),
            new Map()
        );
        expect(r.entrou).toBe(false);
        expect(r.motivo).toMatch(/bate com MAT0026/);
    });

    it("escolhe a turma que menos atrapalha ao explicar", () => {
        const r = resultadoDaPrioritaria(
            "FGA1",
            [entrada("FGA1", ["24M12", "35T23"])],
            opcao({ A: "2M12", B: "4M12", C: "35T23" }),
            reais({ FGA1: ["24M12", "35T23"] }),
            new Map()
        );
        expect(r.motivo).toMatch(/bate com C$/);
    });

    it("pré-requisito pendente, sem turma e fora de turno/dia têm motivos próprios", () => {
        const pre = resultadoDaPrioritaria(
            "FGA1",
            [entrada("FGA1", ["24M12"], { desbloqueada: false })],
            opcao({}),
            reais({ FGA1: ["24M12"] }),
            new Map([["FGA1", ["MAT0025"]]])
        );
        expect(pre.motivo).toMatch(/pré-requisito pendente: MAT0025/);

        const semTurma = resultadoDaPrioritaria("FGA1", [entrada("FGA1", [])], opcao({}), reais({ FGA1: [] }), new Map());
        expect(semTurma.motivo).toMatch(/não tem turma ofertada/);

        const foraTurno = resultadoDaPrioritaria(
            "FGA1",
            [entrada("FGA1", [])],
            opcao({}),
            reais({ FGA1: ["6T12"] }),
            new Map()
        );
        expect(foraTurno.motivo).toMatch(/fora dos turnos ou dias/);
    });

    it("matéria que nem é elegível diz isso", () => {
        const r = resultadoDaPrioritaria("XXX9", [], opcao({}), reais({}), new Map());
        expect(r.motivo).toMatch(/não está entre as matérias/);
    });
});
