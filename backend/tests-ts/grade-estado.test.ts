import {
    MAX_CENARIOS,
    periodoAnterior,
    periodosParaApagar,
    periodoValido,
    validarEstadoGrade,
} from "../src/services/grade/grade_estado.service";

const cenario = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    nome: `Grade ${id}`,
    selecao: { FGA0060: 10, ifd0171: 20 },
    origem: "usuario",
    ...extra,
});

describe("validarEstadoGrade", () => {
    it("normaliza códigos, aplica padrões e escolhe o ativo existente", () => {
        const r = validarEstadoGrade({ grades: [cenario("a")], activeId: "inexistente", pool: ["fga0060"] });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.estado.grades[0].selecao).toEqual({ FGA0060: 10, IFD0171: 20 });
        expect(r.estado.activeId).toBe("a");
        expect(r.estado.pool).toEqual(["FGA0060"]);
        expect(r.estado.turnos).toEqual(["M", "T", "N"]);
        expect(r.estado.incluirCursando).toBe(true);
    });

    it(`recusa mais de ${MAX_CENARIOS} cenários`, () => {
        const grades = Array.from({ length: MAX_CENARIOS + 1 }, (_, i) => cenario(String(i)));
        const r = validarEstadoGrade({ grades });
        expect(r.ok).toBe(false);
    });

    it("aceita exatamente o limite", () => {
        const grades = Array.from({ length: MAX_CENARIOS }, (_, i) => cenario(String(i)));
        expect(validarEstadoGrade({ grades }).ok).toBe(true);
    });

    it("recusa id duplicado, turma inválida e origem desconhecida vira 'usuario'", () => {
        expect(validarEstadoGrade({ grades: [cenario("a"), cenario("a")] }).ok).toBe(false);
        expect(validarEstadoGrade({ grades: [cenario("a", { selecao: { FGA0060: -1 } })] }).ok).toBe(false);
        expect(validarEstadoGrade({ grades: [cenario("a", { selecao: { "DROP TABLE": 1 } })] }).ok).toBe(false);
        const r = validarEstadoGrade({ grades: [cenario("a", { origem: "hacker" })] });
        expect(r.ok && r.estado.grades[0].origem).toBe("usuario");
    });

    it("limita o tamanho do estado (413)", () => {
        const selecao: Record<string, number> = {};
        for (let i = 0; i < 400; i++) selecao[`AAA${String(i).padStart(4, "0")}`] = 100000 + i;
        const grades = Array.from({ length: MAX_CENARIOS }, (_, i) => ({ ...cenario(String(i)), selecao }));
        const r = validarEstadoGrade({ grades });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(413);
    });

    it("recusa lixo no topo", () => {
        expect(validarEstadoGrade(null).ok).toBe(false);
        expect(validarEstadoGrade({ grades: "x" }).ok).toBe(false);
    });
});

describe("períodos", () => {
    it("valida o formato", () => {
        expect(periodoValido("2026.1")).toBe(true);
        expect(periodoValido("2026-1")).toBe(false);
        expect(periodoValido(null)).toBe(false);
    });

    it("calcula o anterior", () => {
        expect(periodoAnterior("2026.2")).toBe("2026.1");
        expect(periodoAnterior("2026.1")).toBe("2025.2");
    });

    it("só marca como vencido o que passou de atual + anterior", () => {
        const lista = ["2025.1", "2025.2", "2026.1", "2026.2", "2027.1"];
        expect(periodosParaApagar(lista, "2026.2")).toEqual(["2025.1", "2025.2"]);
        // Nunca marca período futuro nem o atual.
        expect(periodosParaApagar(["2026.2", "2027.1"], "2026.2")).toEqual([]);
    });
});

describe("compatibilidade: removidas → dispensadas", () => {
    it("aceita o nome antigo (linhas já gravadas e clientes em cache) e devolve o novo", () => {
        const r = validarEstadoGrade({ grades: [cenario("a")], removidas: ["fga0060"] });
        expect(r.ok && r.estado.dispensadas).toEqual(["FGA0060"]);
        expect(r.ok && (r.estado as any).removidas).toBeUndefined();
    });

    it("o nome novo vale quando os dois vêm juntos", () => {
        const r = validarEstadoGrade({ grades: [cenario("a")], dispensadas: ["MAT0025"], removidas: ["FGA0060"] });
        expect(r.ok && r.estado.dispensadas).toEqual(["MAT0025"]);
    });
});
