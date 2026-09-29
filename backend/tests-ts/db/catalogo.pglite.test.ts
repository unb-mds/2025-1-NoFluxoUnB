/**
 * Catálogo no banco (PGlite com o schema de produção): view de créditos por matriz e RLS
 * das tabelas de catálogo. Pré-mortem de 27/09/2026, R64 e R11.
 *
 * Os papéis anon/authenticated/service_role são os do Supabase, com os grants padrão
 * (ver pglite_runner.mjs); "SET LOCAL ROLE" dentro do job simula a chave usada.
 */

import { lerMigration, Job, rodarCenarios } from "./pglite_supabase";

const MIGRATIONS = ["20260928_vw_creditos_por_matriz_id_curso.sql", "20260928_rls_catalogo.sql"];

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

/** A migration de RLS sem BEGIN/COMMIT, para rodar dentro da transação do job. */
const rlsSemTransacao = lerMigration("20260928_rls_catalogo.sql").replace(/^(BEGIN|COMMIT);$/gm, "");

const CENARIOS = {
    // R64
    view_por_curso: { setup: CATALOGO, query: "SELECT * FROM vw_creditos_por_matriz" },
    view_authenticated: comoPapel("authenticated", "SELECT id_curso FROM vw_creditos_por_matriz"),

    // R11 — leitura continua aberta
    anon_le_matrizes: comoPapel("anon", "SELECT curriculo_completo FROM matrizes"),
    authenticated_le_matrizes: comoPapel("authenticated", "SELECT curriculo_completo FROM matrizes"),
    anon_le_vetorizadas: comoPapel("anon", "SELECT codigo_materia FROM materias_vetorizadas"),

    // R11 — escrita com a anon/authenticated key bloqueada
    anon_insere_matriz: comoPapel(
        "anon",
        "INSERT INTO matrizes (id_curso, versao, curriculo_completo) VALUES (6360, '9', '6360/9 - 2099.1')"
    ),
    authenticated_insere_matriz: comoPapel(
        "authenticated",
        "INSERT INTO matrizes (id_curso, versao, curriculo_completo) VALUES (6360, '9', '6360/9 - 2099.1')"
    ),
    anon_altera_matriz: comoPapel(
        "anon",
        "UPDATE matrizes SET ch_total_exigida = 0 WHERE id_matriz = 2 RETURNING id_matriz"
    ),
    anon_apaga_matriz: comoPapel("anon", "DELETE FROM matrizes WHERE id_matriz = 2 RETURNING id_matriz"),
    anon_insere_vetorizada: comoPapel(
        "anon",
        "INSERT INTO materias_vetorizadas (id_materia, codigo_materia) VALUES (2, 'XXX0001')"
    ),

    // R11 — carga de dados (service_role) continua escrevendo
    service_role_insere_matriz: comoPapel(
        "service_role",
        "INSERT INTO matrizes (id_curso, versao, curriculo_completo) VALUES (6360, '9', '6360/9 - 2099.1') RETURNING id_matriz"
    ),

    // R11 — nenhuma tabela do schema public sem RLS
    tabelas_sem_rls: {
        query: `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
                ORDER BY 1`,
    },

    // R11 — dados_users_teste, se existir, perde os grants (sem DROP)
    dados_users_teste: {
        setup: `
          CREATE TABLE public.dados_users_teste (id bigint);
          GRANT ALL ON public.dados_users_teste TO anon, authenticated;
          ${rlsSemTransacao}
        `,
        query: `SELECT to_regclass('public.dados_users_teste') IS NOT NULL AS existe,
                       has_table_privilege('anon', 'public.dados_users_teste', 'SELECT') AS anon_le,
                       has_table_privilege('authenticated', 'public.dados_users_teste', 'INSERT') AS auth_escreve`,
    },
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

    it("continua legível com a chave authenticated depois da RLS em matrizes", () => {
        expect(linhas("view_authenticated")).toEqual([{ id_curso: 6360 }]);
    });
});

describe("R11 — RLS no catálogo", () => {
    it.each(["anon_le_matrizes", "authenticated_le_matrizes", "anon_le_vetorizadas"] as const)(
        "%s: leitura continua funcionando",
        (nome) => {
            expect(linhas(nome)).toHaveLength(1);
        }
    );

    it.each(["anon_insere_matriz", "authenticated_insere_matriz", "anon_insere_vetorizada"] as const)(
        "%s: INSERT é recusado pela RLS",
        (nome) => {
            const res = resultado(nome);
            expect(res.error).toMatch(/row-level security/);
            expect(res.code).toBe("42501");
        }
    );

    it.each(["anon_altera_matriz", "anon_apaga_matriz"] as const)("%s: não afeta nenhuma linha", (nome) => {
        expect(linhas(nome)).toEqual([]);
    });

    it("service_role (carga do DBA) continua escrevendo", () => {
        expect(linhas("service_role_insere_matriz")).toHaveLength(1);
    });

    it("nenhuma tabela do schema public fica sem RLS", () => {
        expect(linhas("tabelas_sem_rls")).toEqual([]);
    });

    it("dados_users_teste perde os grants de anon/authenticated e não é apagada", () => {
        expect(linhas("dados_users_teste")).toEqual([{ existe: true, anon_le: false, auth_escreve: false }]);
    });
});
