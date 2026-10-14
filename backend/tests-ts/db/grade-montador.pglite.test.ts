/**
 * Tabela grade_montador (PGlite com o schema de produção +
 * supabase/migrations/20261014000000_grade_montador.sql): uma linha por
 * aluno+período, CHECKs de formato/tamanho e RLS sem policy.
 */
import { rodarCenarios } from "./pglite_supabase";

const MIGRATIONS = ["20261014000000_grade_montador.sql"];

const ESTADO = `'{"grades":[{"id":"a","nome":"Grade 1","selecao":{"FGA0060":10},"origem":"usuario"}],"activeId":"a"}'::jsonb`;
const insere = (user: number, periodo: string, estado = ESTADO) =>
    `INSERT INTO grade_montador (id_user, ano_periodo, estado) VALUES (${user}, '${periodo}', ${estado});`;

const CENARIOS = {
    insere_e_le: {
        setup: insere(1, "2026.2"),
        query: `SELECT versao, estado->'grades'->0->>'nome' AS nome FROM grade_montador WHERE id_user = 1`,
    },
    chave_duplicada: { setup: insere(1, "2026.2"), query: insere(1, "2026.2") },
    periodos_independentes: {
        setup: insere(1, "2026.1") + insere(1, "2026.2") + insere(2, "2026.2"),
        query: `SELECT count(*)::int AS n FROM grade_montador WHERE id_user = 1`,
    },
    estado_nao_objeto: { query: insere(1, "2026.2", `'[]'::jsonb`) },
    estado_gigante: {
        query: insere(1, "2026.2", `jsonb_build_object('lixo', repeat('x', 40000))`),
    },
    rls_ligada: {
        query: `SELECT relrowsecurity FROM pg_class WHERE relname = 'grade_montador'`,
    },
    anon_nao_le: {
        setup: `${insere(1, "2026.2")} SET LOCAL ROLE anon;`,
        query: `SELECT * FROM grade_montador`,
    },
};

let resultado: ReturnType<typeof rodarCenarios<keyof typeof CENARIOS>>;
beforeAll(() => {
    resultado = rodarCenarios(MIGRATIONS, CENARIOS);
}, 120_000);

const linhas = (n: keyof typeof CENARIOS) => resultado(n).rows ?? [];
const erro = (n: keyof typeof CENARIOS) => resultado(n).error ?? "";

describe("grade_montador", () => {
    it("guarda e devolve o estado, com versão 1", () => {
        expect(linhas("insere_e_le")).toEqual([{ versao: 1, nome: "Grade 1" }]);
    });

    it("não aceita duas linhas para o mesmo aluno+período", () => {
        expect(erro("chave_duplicada")).toMatch(/duplicate|unique|violates/i);
    });

    it("períodos e alunos são independentes", () => {
        expect(linhas("periodos_independentes")).toEqual([{ n: 2 }]);
    });

    it("recusa estado que não é objeto", () => {
        expect(erro("estado_nao_objeto")).toMatch(/grade_montador_estado_objeto|check/i);
    });

    it("recusa estado grande demais (rede de segurança além do backend)", () => {
        expect(erro("estado_gigante")).toMatch(/grade_montador_estado_tamanho|check/i);
    });

    it("tem RLS ligada e o papel anon não lê nada", () => {
        expect(linhas("rls_ligada")).toEqual([{ relrowsecurity: true }]);
        expect(erro("anon_nao_le") !== "" || linhas("anon_nao_le").length === 0).toBe(true);
    });
});
