/**
 * Catálogo no banco (PGlite com o schema de produção): view de créditos por matriz.
 * Pré-mortem de 27/09/2026, R64.
 *
 * Os papéis anon/authenticated/service_role são os do Supabase, com os grants padrão
 * (ver pglite_runner.mjs); "SET LOCAL ROLE" dentro do job simula a chave usada.
 */

import { Job, rodarCenarios } from "./pglite_supabase";

const MIGRATIONS = ["20260928_vw_creditos_por_matriz_id_curso.sql"];

const CATALOGO = `
  INSERT INTO cursos (id_curso, nome_curso, tipo_curso, turno) VALUES (6360, 'ENGENHARIA DE SOFTWARE', 'Bacharelado', 'DIURNO');
  INSERT INTO matrizes (id_matriz, id_curso, versao, ano_vigor, curriculo_completo, ch_total_exigida)
    VALUES (2, 6360, '2', '2024.1', '6360/2 - 2024.1', 3090);
  INSERT INTO materias_vetorizadas (id_materia, nome_materia, codigo_materia) VALUES (1, 'CALCULO 1', 'MAT0025');
`;

const comoPapel = (papel: string, sql: string, setup = CATALOGO): Job => ({
    setup: `${setup}\nSET LOCAL ROLE ${papel};`,
    query: sql,
});

const CENARIOS = {
    // R64
    view_por_curso: { setup: CATALOGO, query: "SELECT * FROM vw_creditos_por_matriz" },
    view_authenticated: comoPapel("authenticated", "SELECT id_curso FROM vw_creditos_por_matriz"),
};

let resultado: ReturnType<typeof rodarCenarios<keyof typeof CENARIOS>>;

beforeAll(() => {
    resultado = rodarCenarios(MIGRATIONS, CENARIOS);
}, 180_000);

function linhas(nome: keyof typeof CENARIOS): Record<string, any>[] {
    const res = resultado(nome);
    if (res.rows === undefined) throw new Error(`${nome}: ${res.error}`);
    return res.rows;
}

describe("R64 — vw_creditos_por_matriz", () => {
    it("expõe id_curso, que o front usa para indexar os créditos por curso", () => {
        const rows = linhas("view_por_curso");
        expect(rows).toEqual([
            expect.objectContaining({ id_matriz: 2, id_curso: 6360, curriculo_completo: "6360/2 - 2024.1" }),
        ]);
        // numeric chega como texto do PGlite; o PostgREST devolve número
        expect(Number(rows[0].cred_total_exigido)).toBe(206);
    });

    it("é legível com a chave authenticated (security_invoker)", () => {
        expect(linhas("view_authenticated")).toEqual([{ id_curso: 6360 }]);
    });
});
