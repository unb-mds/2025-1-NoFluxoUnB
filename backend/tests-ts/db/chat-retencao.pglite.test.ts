/**
 * public.limpar_chat_antigo (retenção do chat da Darcy) em PGlite: baseline + as
 * migrations do chat + a de retenção. Cada cenário monta as linhas, roda a limpeza
 * e devolve o que sobrou.
 */

import { Job, rodarCenarios } from "./pglite_supabase";

const MIGRATIONS = [
    "20261007000000_chat_sessions_darcy.sql",
    "20261011000000_chat_memoria.sql",
    "20261012000000_chat_conversas.sql",
    "20261016000000_chat_retencao.sql",
];

const ANTIGA = "now() - interval '13 months'";
const RECENTE = "now() - interval '1 month'";

/** Sessão com uma conversa arquivada (2 itens) e 2 itens na conversa ativa. */
function sessao(id: string, ultimaAtividade: string, fimArquivada: string, itemAtivo: string): string {
    return `
      INSERT INTO chat_sessions (session_id, memoria, created_at, updated_at)
        VALUES ('${id}', 'memória de ${id}', ${ultimaAtividade}, ${ultimaAtividade});
      INSERT INTO chat_conversas (id, session_id, fim, created_at)
        VALUES ('00000000-0000-0000-0000-00000000000${id.slice(-1)}', '${id}', ${fimArquivada}, ${fimArquivada});
      INSERT INTO chat_items (session_id, conversa_id, item, created_at) VALUES
        ('${id}', '00000000-0000-0000-0000-00000000000${id.slice(-1)}', '{}', ${fimArquivada}),
        ('${id}', '00000000-0000-0000-0000-00000000000${id.slice(-1)}', '{}', ${fimArquivada}),
        ('${id}', NULL, '{}', ${itemAtivo}),
        ('${id}', NULL, '{}', ${RECENTE});
    `;
}

// A limpeza roda num comando à parte (no setup): numa SELECT só, as contagens
// enxergariam o snapshot de antes dos DELETEs.
const LIMPAR = "CREATE TEMP TABLE _r AS SELECT public.limpar_chat_antigo() AS resumo;";

const SOBROU = `
  SELECT (SELECT resumo FROM _r) AS resumo,
    (SELECT json_agg(session_id ORDER BY session_id) FROM chat_sessions) AS sessoes,
    (SELECT count(*)::int FROM chat_conversas) AS conversas,
    (SELECT count(*)::int FROM chat_items) AS itens
`;

function cenario(setup: string, limpar = LIMPAR): Job {
    return { setup: setup + limpar, query: SOBROU };
}

const CENARIOS = {
    tudo_recente: cenario(sessao("s1", RECENTE, RECENTE, RECENTE)),
    arquivada_antiga: cenario(sessao("s1", RECENTE, ANTIGA, RECENTE)),
    ativa_com_item_antigo: cenario(sessao("s1", RECENTE, RECENTE, ANTIGA)),
    sessao_abandonada: cenario(
        sessao("s1", "now() - interval '25 months'", ANTIGA, ANTIGA) + sessao("s2", RECENTE, RECENTE, RECENTE)
    ),
    lotes_pequenos: cenario(
        sessao("s1", RECENTE, ANTIGA, ANTIGA),
        "CREATE TEMP TABLE _r AS SELECT public.limpar_chat_antigo(interval '12 months', interval '24 months', 1) AS resumo;"
    ),
    anon_nao_executa: {
        setup: "SET LOCAL ROLE anon;",
        query: "SELECT public.limpar_chat_antigo() AS resumo",
    } as Job,
};

let resultado: ReturnType<typeof rodarCenarios<keyof typeof CENARIOS>>;

beforeAll(() => {
    resultado = rodarCenarios(MIGRATIONS, CENARIOS);
}, 180_000);

function r(nome: keyof typeof CENARIOS): Record<string, any> {
    const res = resultado(nome);
    if (res.rows === undefined) throw new Error(`${nome}: ${res.error}`);
    return res.rows[0];
}

describe("limpar_chat_antigo", () => {
    it("não mexe em nada recente", () => {
        const out = r("tudo_recente");
        expect(out.resumo).toEqual({ sessoes_apagadas: 0, conversas_apagadas: 0, itens_ativos_apagados: 0 });
        expect(out).toMatchObject({ sessoes: ["s1"], conversas: 1, itens: 4 });
    });

    it("apaga a conversa arquivada parada há mais de 12 meses, com os itens dela", () => {
        const out = r("arquivada_antiga");
        expect(out.resumo.conversas_apagadas).toBe(1);
        expect(out).toMatchObject({ sessoes: ["s1"], conversas: 0, itens: 2 });
    });

    it("apaga só os itens antigos da conversa ativa", () => {
        const out = r("ativa_com_item_antigo");
        expect(out.resumo.itens_ativos_apagados).toBe(1);
        expect(out).toMatchObject({ conversas: 1, itens: 3 });
    });

    it("sessão inativa há 2 anos sai inteira; a ativa fica", () => {
        const out = r("sessao_abandonada");
        expect(out.resumo.sessoes_apagadas).toBe(1);
        expect(out).toMatchObject({ sessoes: ["s2"], conversas: 1, itens: 4 });
    });

    it("lote menor que o total continua até acabar", () => {
        const out = r("lotes_pequenos");
        expect(out.resumo).toMatchObject({ conversas_apagadas: 1, itens_ativos_apagados: 1 });
        expect(out.itens).toBe(1);
    });

    it("cliente anônimo não consegue executar", () => {
        const res = resultado("anon_nao_executa");
        expect(res.error).toMatch(/permission denied/i);
    });
});
