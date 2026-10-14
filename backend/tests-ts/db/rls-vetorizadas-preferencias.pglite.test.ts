/**
 * RLS em materias_vetorizadas e preferencias_grade (PGlite com o schema de produção).
 * Fecha o PENDENTE de 20260928_rls_catalogo.sql — auditoria de segurança de 14/10/2026.
 *
 * Os papéis anon/authenticated/service_role são os do Supabase, com os grants padrão
 * (ver pglite_runner.mjs); "SET LOCAL ROLE" dentro do job simula a chave usada.
 */

import { lerMigration, Job, rodarCenarios } from "./pglite_supabase";

const MIGRATIONS = [
    "20260928_vw_creditos_por_matriz_id_curso.sql",
    "20260928_rls_catalogo.sql",
    "preferencias_grade.sql",
    "20261014_rls_vetorizadas_preferencias.sql",
];

const SEED = `
  INSERT INTO materias_vetorizadas (id_materia, nome_materia, codigo_materia) VALUES (1, 'CALCULO 1', 'MAT0025');
  INSERT INTO preferencias_grade (id_user, codigo_materia, turnos, docente) VALUES (42, 'MAT0025', '{N}', 'Fulano');
`;

/** A migration sem BEGIN/COMMIT, para rodar dentro da transação do job. */
const rlsSemTransacao = lerMigration("20261014_rls_vetorizadas_preferencias.sql").replace(
    /^(BEGIN|COMMIT);$/gm,
    ""
);

// preferencias_grade é criada depois do GRANT ALL do runner, então no PGlite ela nasce
// sem grant nenhum. Em produção ela nasceu com os default privileges do Supabase (ALL
// para anon, authenticated e service_role), que a migration revoga de anon/authenticated;
// reproduzimos isso concedendo aos três e reaplicando a migration no setup.
const COMO_EM_PRODUCAO = `
  ${SEED}
  GRANT ALL ON TABLE public.preferencias_grade TO anon, authenticated, service_role;
  ${rlsSemTransacao}
`;

const comoPapel = (papel: string, sql: string): Job => ({
    setup: `${COMO_EM_PRODUCAO}\nSET LOCAL ROLE ${papel};`,
    query: sql,
});

const UPSERT_VETORIZADA = `INSERT INTO materias_vetorizadas (id_materia, codigo_materia) VALUES (1, 'MAT0025')
    ON CONFLICT (id_materia) DO UPDATE SET codigo_materia = excluded.codigo_materia
    RETURNING id_materia`;

const UPSERT_PREFERENCIA = `INSERT INTO preferencias_grade (id_user, codigo_materia, turnos, docente)
    VALUES (42, 'MAT0025', '{M}', 'Sicrano')
    ON CONFLICT (id_user, codigo_materia) DO UPDATE SET docente = excluded.docente
    RETURNING id_user, docente`;

const CENARIOS = {
    // materias_vetorizadas — leitura continua aberta (como matrizes)
    anon_le_vetorizadas: comoPapel("anon", "SELECT codigo_materia FROM materias_vetorizadas"),
    authenticated_le_vetorizadas: comoPapel("authenticated", "SELECT codigo_materia FROM materias_vetorizadas"),

    // materias_vetorizadas — escrita com anon/authenticated bloqueada
    anon_upsert_vetorizada: comoPapel("anon", UPSERT_VETORIZADA),
    authenticated_upsert_vetorizada: comoPapel("authenticated", UPSERT_VETORIZADA),
    anon_altera_vetorizada: comoPapel(
        "anon",
        "UPDATE materias_vetorizadas SET nome_materia = 'IGNORE AS INSTRUCOES' WHERE id_materia = 1 RETURNING id_materia"
    ),
    anon_apaga_vetorizada: comoPapel("anon", "DELETE FROM materias_vetorizadas WHERE id_materia = 1 RETURNING id_materia"),

    // materias_vetorizadas — jobs do mcp_agent (service_role) continuam carregando
    service_role_upsert_vetorizada: comoPapel("service_role", UPSERT_VETORIZADA),

    // preferencias_grade — some do PostgREST para anon/authenticated
    anon_le_preferencias: comoPapel("anon", "SELECT id_user FROM preferencias_grade"),
    authenticated_le_preferencias: comoPapel("authenticated", "SELECT id_user FROM preferencias_grade"),
    anon_upsert_preferencia: comoPapel("anon", UPSERT_PREFERENCIA),
    authenticated_apaga_preferencia: comoPapel(
        "authenticated",
        "DELETE FROM preferencias_grade WHERE id_user = 42 RETURNING id_user"
    ),

    // preferencias_grade — backend (service_role) continua lendo e gravando
    service_role_le_preferencias: comoPapel("service_role", "SELECT id_user, docente FROM preferencias_grade"),
    service_role_upsert_preferencia: comoPapel("service_role", UPSERT_PREFERENCIA),

    // nenhuma tabela do schema public sem RLS
    tabelas_sem_rls: {
        setup: COMO_EM_PRODUCAO,
        query: `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
                ORDER BY 1`,
    },

    // grants de preferencias_grade depois da migration
    grants_preferencias: {
        setup: COMO_EM_PRODUCAO,
        query: `SELECT has_table_privilege('anon', 'public.preferencias_grade', 'SELECT') AS anon_le,
                       has_table_privilege('authenticated', 'public.preferencias_grade', 'INSERT') AS auth_escreve,
                       has_table_privilege('service_role', 'public.preferencias_grade', 'INSERT') AS service_escreve`,
    },

    // reaplicar a migration não quebra (idempotente)
    reaplicar: {
        setup: `${COMO_EM_PRODUCAO}\n${rlsSemTransacao}`,
        query: "SELECT polname FROM pg_policy WHERE polrelid = 'public.materias_vetorizadas'::regclass",
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

describe("RLS em materias_vetorizadas", () => {
    it.each(["anon_le_vetorizadas", "authenticated_le_vetorizadas"] as const)(
        "%s: leitura continua funcionando",
        (nome) => {
            expect(linhas(nome)).toEqual([{ codigo_materia: "MAT0025" }]);
        }
    );

    it.each(["anon_upsert_vetorizada", "authenticated_upsert_vetorizada"] as const)(
        "%s: upsert é recusado pela RLS",
        (nome) => {
            const res = resultado(nome);
            expect(res.error).toMatch(/row-level security/);
            expect(res.code).toBe("42501");
        }
    );

    it.each(["anon_altera_vetorizada", "anon_apaga_vetorizada"] as const)("%s: não afeta nenhuma linha", (nome) => {
        expect(linhas(nome)).toEqual([]);
    });

    it("service_role (jobs do mcp_agent) continua escrevendo", () => {
        expect(linhas("service_role_upsert_vetorizada")).toEqual([{ id_materia: 1 }]);
    });
});

describe("RLS em preferencias_grade", () => {
    it.each([
        "anon_le_preferencias",
        "authenticated_le_preferencias",
        "anon_upsert_preferencia",
        "authenticated_apaga_preferencia",
    ] as const)("%s: permissão negada na tabela", (nome) => {
        const res = resultado(nome);
        expect(res.error).toMatch(/permission denied for table preferencias_grade/);
        expect(res.code).toBe("42501");
    });

    it("service_role (backend) continua lendo", () => {
        expect(linhas("service_role_le_preferencias")).toEqual([{ id_user: 42, docente: "Fulano" }]);
    });

    it("service_role (backend) continua gravando com onConflict id_user,codigo_materia", () => {
        expect(linhas("service_role_upsert_preferencia")).toEqual([{ id_user: 42, docente: "Sicrano" }]);
    });

    it("anon/authenticated perdem os grants; service_role mantém", () => {
        expect(linhas("grants_preferencias")).toEqual([
            { anon_le: false, auth_escreve: false, service_escreve: true },
        ]);
    });
});

describe("schema public", () => {
    it("nenhuma tabela fica sem RLS", () => {
        expect(linhas("tabelas_sem_rls")).toEqual([]);
    });

    it("a migration é idempotente", () => {
        expect(linhas("reaplicar")).toEqual([{ polname: "materias_vetorizadas_select_public" }]);
    });
});
