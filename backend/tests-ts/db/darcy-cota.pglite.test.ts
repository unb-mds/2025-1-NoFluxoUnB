/**
 * Cota diária do Darcy no banco (PGlite com o schema de produção +
 * supabase/migrations/20260929_darcy_cota.sql): reserva atômica, estorno, dia de
 * Brasília, concessões, RLS e as ações do admin no ticket.
 *
 * Os papéis anon/authenticated/service_role são os do Supabase (ver
 * pglite_runner.mjs); "SET LOCAL ROLE" + request.jwt.claim.sub simulam quem chama.
 */

import { lerMigration, Job, rodarCenarios } from "./pglite_supabase";

const MIGRATIONS = ["20260929_darcy_cota.sql"];

const ALUNO = "11111111-1111-1111-1111-111111111111";
const OUTRO = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";

/** ticket_chat.sql (ticket_messages + CHECK do audit log) sem a transação nem o Realtime. */
const TICKET_CHAT = lerMigration("ticket_chat.sql")
    .replace(/^(BEGIN|COMMIT);$/gm, "")
    .replace(/DO \$realtime\$[\s\S]*?\$realtime\$;/, "")
    .replace(/DO \$cron\$[\s\S]*?\$cron\$;/, "");

const reservar = (user: string, limite: number) =>
    `SELECT * FROM darcy_reservar_pergunta('${user}', ${limite})`;

/** Faz n reservas antes da consulta. */
const reservas = (user: string, limite: number, n: number) =>
    Array.from({ length: n }, () => `SELECT darcy_reservar_pergunta('${user}', ${limite});`).join("\n");

const comoUsuario = (uid: string, sql: string, setup = ""): Job => ({
    setup: `${setup}
      SELECT set_config('request.jwt.claim.sub', '${uid}', true);
      SET LOCAL ROLE authenticated;`,
    query: sql,
});

const concessao = (user: string, tipo: string, qtd: number, de: string, ate: string | null) =>
    `INSERT INTO darcy_cota_concessoes (user_id, tipo, quantidade, valida_de, valida_ate, aprovado_por)
     VALUES ('${user}', '${tipo}', ${qtd}, ${de}, ${ate ?? "NULL"}, '${ADMIN}');`;

const HOJE = "darcy_dia_brasilia(now())";

const TICKET_PEDIDO = `
  ${TICKET_CHAT}
  INSERT INTO admins (auth_id, role, scopes) VALUES ('${ADMIN}', 'admin', ARRAY['tickets','dashboard']);
  INSERT INTO tickets (id, created_by, title, description, category, status, metadata)
  VALUES (900, '${ALUNO}', 'Mais perguntas no Darcy', 'Preciso estudar para a prova', 'duvida', 'aberto',
          '{"tipo":"darcy_mais_perguntas","motivo":"Semana de provas","usadas":30,"limite":30}');
  INSERT INTO tickets (id, created_by, title, description, category, status, metadata)
  VALUES (901, '${ALUNO}', 'Bug no fluxograma', 'Não carrega', 'bug', 'aberto', '{}');
`;

const CENARIOS = {
    // ---- reserva e limite ----
    primeira: { query: reservar(ALUNO, 30) },
    trigesima: { setup: reservas(ALUNO, 30, 29), query: reservar(ALUNO, 30) },
    trigesima_primeira: { setup: reservas(ALUNO, 30, 30), query: reservar(ALUNO, 30) },
    rajada_nao_passa_do_limite: {
        setup: reservas(ALUNO, 5, 12),
        query: `SELECT usadas, limite FROM darcy_uso_diario WHERE user_id = '${ALUNO}'`,
    },
    limite_zero_nega: { query: reservar(ALUNO, 0) },
    outro_usuario_independente: { setup: reservas(ALUNO, 3, 3), query: reservar(OUTRO, 3) },

    // ---- estorno ----
    estorno_devolve: {
        setup: reservas(ALUNO, 30, 2),
        query: `SELECT darcy_estornar_pergunta('${ALUNO}', ${HOJE}) AS usadas`,
    },
    estorno_libera_quem_estava_no_limite: {
        setup: `${reservas(ALUNO, 2, 2)} SELECT darcy_estornar_pergunta('${ALUNO}', ${HOJE});`,
        query: reservar(ALUNO, 2),
    },
    estorno_nao_fica_negativo: {
        query: `SELECT darcy_estornar_pergunta('${ALUNO}', ${HOJE}) AS usadas`,
    },
    estorno_do_dia_da_reserva: {
        setup: `INSERT INTO darcy_uso_diario (user_id, dia, usadas, limite) VALUES ('${ALUNO}', ${HOJE} - 1, 4, 30);
                ${reservas(ALUNO, 30, 1)}
                SELECT darcy_estornar_pergunta('${ALUNO}', ${HOJE} - 1);`,
        query: `SELECT dia - ${HOJE} AS delta, usadas FROM darcy_uso_diario WHERE user_id = '${ALUNO}' ORDER BY dia`,
    },

    // ---- fuso de Brasília ----
    dia_antes_da_meia_noite: {
        query: `SELECT darcy_dia_brasilia('2026-09-30 02:59:59+00') AS dia`,
    },
    dia_na_meia_noite: {
        query: `SELECT darcy_dia_brasilia('2026-09-30 03:00:00+00') AS dia`,
    },
    renova_em: {
        query: `SELECT darcy_renova_em('2026-09-29') = '2026-09-30 03:00:00+00'::timestamptz AS ok`,
    },
    reserva_usa_dia_de_brasilia: {
        query: `SELECT r.dia = darcy_dia_brasilia(now()) AS ok,
                       r.renova_em = darcy_renova_em(darcy_dia_brasilia(now())) AS renova_ok
                  FROM darcy_reservar_pergunta('${ALUNO}', 30) r`,
    },

    // ---- concessões ----
    extra_hoje_soma: {
        setup: concessao(ALUNO, "extra", 30, HOJE, HOJE),
        query: `SELECT darcy_limite_efetivo('${ALUNO}', ${HOJE}, 30) AS limite`,
    },
    extra_vencida_ignorada: {
        setup: concessao(ALUNO, "extra", 30, `${HOJE} - 7`, `${HOJE} - 1`),
        query: `SELECT darcy_limite_efetivo('${ALUNO}', ${HOJE}, 30) AS limite`,
    },
    extra_semana_vale_no_meio: {
        setup: concessao(ALUNO, "extra", 10, `${HOJE} - 3`, `${HOJE} + 3`),
        query: `SELECT darcy_limite_efetivo('${ALUNO}', ${HOJE}, 30) AS limite`,
    },
    limite_permanente: {
        setup: concessao(ALUNO, "limite", 60, `${HOJE} - 30`, null),
        query: `SELECT darcy_limite_efetivo('${ALUNO}', ${HOJE}, 30) AS limite`,
    },
    limite_menor_que_padrao_nao_reduz: {
        setup: concessao(ALUNO, "limite", 10, HOJE, null),
        query: `SELECT darcy_limite_efetivo('${ALUNO}', ${HOJE}, 30) AS limite`,
    },
    limite_mais_extra: {
        setup: concessao(ALUNO, "limite", 60, HOJE, null) + concessao(ALUNO, "extra", 5, HOJE, HOJE),
        query: `SELECT darcy_limite_efetivo('${ALUNO}', ${HOJE}, 30) AS limite`,
    },
    concessao_de_outro_nao_vale: {
        setup: concessao(OUTRO, "extra", 30, HOJE, HOJE),
        query: `SELECT darcy_limite_efetivo('${ALUNO}', ${HOJE}, 30) AS limite`,
    },
    concessao_libera_31a: {
        setup: `${reservas(ALUNO, 30, 30)} ${concessao(ALUNO, "extra", 30, HOJE, HOJE)}`,
        query: reservar(ALUNO, 30),
    },
    extra_sem_fim_recusada: {
        setup: "",
        query: `INSERT INTO darcy_cota_concessoes (user_id, tipo, quantidade, valida_de, aprovado_por)
                VALUES ('${ALUNO}', 'extra', 30, ${HOJE}, '${ADMIN}') RETURNING id`,
    },

    // ---- estado sem consumir ----
    estado_nao_consome: {
        setup: `${reservas(ALUNO, 30, 3)} SELECT * FROM darcy_estado_cota('${ALUNO}', 30);`,
        query: `SELECT * FROM darcy_estado_cota('${ALUNO}', 30)`,
    },

    // ---- custo do dia (teto global) ----
    custo_hoje: {
        setup: `
          DELETE FROM ai_pricing;
          INSERT INTO ai_pricing (model, input_per_1k, output_per_1k) VALUES ('sabia-4', 0.005, 0.02);
          INSERT INTO ai_usage_log (created_at, endpoint, model, prompt_tokens, completion_tokens, total_tokens)
          VALUES (now(), 'assistente-chat', 'sabia-4', 1000, 1000, 2000),
                 ((${HOJE})::timestamp AT TIME ZONE 'America/Sao_Paulo' - interval '1 minute',
                  'assistente-chat', 'sabia-4', 100000, 0, 100000);`,
        query: `SELECT darcy_custo_ia_hoje() AS custo`,
    },

    // ---- RLS / permissões ----
    aluno_le_so_o_proprio_uso: comoUsuario(
        ALUNO,
        "SELECT user_id::text FROM darcy_uso_diario ORDER BY 1",
        `${reservas(ALUNO, 30, 1)} ${reservas(OUTRO, 30, 1)}`
    ),
    aluno_nao_escreve_uso: comoUsuario(
        ALUNO,
        `INSERT INTO darcy_uso_diario (user_id, dia, usadas) VALUES ('${ALUNO}', ${HOJE}, 0) RETURNING usadas`
    ),
    aluno_nao_zera_uso: comoUsuario(
        ALUNO,
        `UPDATE darcy_uso_diario SET usadas = 0 RETURNING usadas`,
        reservas(ALUNO, 30, 5)
    ),
    aluno_nao_reserva_direto: comoUsuario(ALUNO, reservar(ALUNO, 1000)),
    aluno_nao_se_concede: comoUsuario(ALUNO, concessao(ALUNO, "limite", 1000, HOJE, null).replace(/;\s*$/, " RETURNING id")),
    anon_nao_le_uso: {
        setup: `${reservas(ALUNO, 30, 1)} SET LOCAL ROLE anon;`,
        query: "SELECT count(*) AS n FROM darcy_uso_diario",
    },
    service_role_reserva: {
        setup: "SET LOCAL ROLE service_role;",
        query: reservar(ALUNO, 30),
    },

    // ---- admin: aprovar / recusar no ticket ----
    aprovar_hoje: comoUsuario(
        ADMIN,
        `SELECT (darcy_aprovar_pedido(900, 'hoje', 30)) AS c`,
        TICKET_PEDIDO
    ),
    aprovar_efeitos: {
        setup: `${TICKET_PEDIDO}
         SELECT set_config('request.jwt.claim.sub', '${ADMIN}', true);
         SET LOCAL ROLE authenticated;
         SELECT darcy_aprovar_pedido(900, 'hoje', 30);
         RESET ROLE;`,
        query: `SELECT (SELECT status FROM tickets WHERE id = 900) AS status,
                (SELECT count(*) FROM ticket_messages WHERE ticket_id = 900 AND author_role = 'tech') AS msgs,
                (SELECT content FROM ticket_messages WHERE ticket_id = 900) AS texto,
                (SELECT aprovado_por::text FROM darcy_cota_concessoes WHERE ticket_id = 900) AS aprovado_por,
                (SELECT motivo FROM darcy_cota_concessoes WHERE ticket_id = 900) AS motivo,
                darcy_limite_efetivo('${ALUNO}', ${HOJE}, 30) AS limite`,
    },
    aprovar_semana: comoUsuario(
        ADMIN,
        `SELECT tipo, quantidade, valida_ate - valida_de AS dias
           FROM jsonb_populate_record(NULL::darcy_cota_concessoes, darcy_aprovar_pedido(900, 'semana', 20))`,
        TICKET_PEDIDO
    ),
    aprovar_limite: comoUsuario(
        ADMIN,
        `SELECT tipo, quantidade, valida_ate
           FROM jsonb_populate_record(NULL::darcy_cota_concessoes, darcy_aprovar_pedido(900, 'limite', 60))`,
        TICKET_PEDIDO
    ),
    aprovar_duas_vezes: comoUsuario(
        ADMIN,
        `SELECT darcy_aprovar_pedido(900, 'hoje', 30)`,
        `${TICKET_PEDIDO}
         SELECT set_config('request.jwt.claim.sub', '${ADMIN}', true);
         SET LOCAL ROLE authenticated;
         SELECT darcy_aprovar_pedido(900, 'hoje', 30);
         RESET ROLE;`
    ),
    aluno_nao_aprova_o_proprio: comoUsuario(ALUNO, `SELECT darcy_aprovar_pedido(900, 'limite', 1000)`, TICKET_PEDIDO),
    aprovar_ticket_que_nao_e_pedido: comoUsuario(ADMIN, `SELECT darcy_aprovar_pedido(901, 'hoje', 30)`, TICKET_PEDIDO),
    recusar: comoUsuario(
        ADMIN,
        `SELECT (SELECT status FROM tickets WHERE id = 900) AS status,
                (SELECT content FROM ticket_messages WHERE ticket_id = 900) AS texto,
                (SELECT count(*) FROM darcy_cota_concessoes) AS concessoes`,
        `${TICKET_PEDIDO}
         SELECT set_config('request.jwt.claim.sub', '${ADMIN}', true);
         SET LOCAL ROLE authenticated;
         SELECT darcy_recusar_pedido(900, 'Seu uso de hoje já foi alto; tente amanhã.');
         RESET ROLE;`
    ),
    recusar_sem_motivo: comoUsuario(ADMIN, `SELECT darcy_recusar_pedido(900, '  ')`, TICKET_PEDIDO),

    // ---- dashboard ----
    metricas_custo: comoUsuario(
        ADMIN,
        `SELECT m->'total_requisicoes' AS req, m->'total_perguntas' AS perguntas,
                m->'por_endpoint' AS por_endpoint, m->'requisicoes_sem_tokens' AS sem_tokens
           FROM get_ai_cost_metrics(30) m`,
        `INSERT INTO admins (auth_id, role, scopes) VALUES ('${ADMIN}', 'admin', ARRAY['dashboard']);
         INSERT INTO ai_usage_log (created_at, endpoint, model, prompt_tokens, completion_tokens, total_tokens, pergunta_id)
         VALUES (now(), 'analyze-sabia', 'sabiazinho-4', 10, 10, 20, 'aaaaaaaa-0000-0000-0000-000000000001'),
                (now(), 'analyze-sabia', 'sabia-4', 10, 10, 20, 'aaaaaaaa-0000-0000-0000-000000000001'),
                ('2026-09-02 12:00:00+00', 'assistente-chat', 'sabia-4', 10, 10, 20, NULL),
                ('2026-09-02 12:00:00+00', 'assistente-chat', 'sabia-4', 10, 10, 20, NULL),
                (now() - interval '1 day', 'planejamento-chat', 'desconhecido', 0, 0, 0, NULL);`
    ),
    metricas_ferramenta_nao_e_pergunta: comoUsuario(
        ADMIN,
        `SELECT m->'total_requisicoes' AS req, m->'total_perguntas' AS perguntas,
                m->'por_endpoint' AS por_endpoint,
                (SELECT sum((d->>'perguntas')::int) FROM jsonb_array_elements(m->'por_dia') d) AS perguntas_por_dia
           FROM get_ai_cost_metrics(30) m`,
        `INSERT INTO admins (auth_id, role, scopes) VALUES ('${ADMIN}', 'admin', ARRAY['dashboard']);
         INSERT INTO ai_usage_log (created_at, endpoint, model, prompt_tokens, completion_tokens, total_tokens, pergunta_id)
         VALUES (now(), 'assistente-chat', 'sabia-4', 10, 10, 20, 'aaaaaaaa-0000-0000-0000-000000000002'),
                (now() + interval '1 second', 'buscar-materias', 'gemini-embedding-001', 3, 0, 3, 'aaaaaaaa-0000-0000-0000-000000000002'),
                -- legado: embeddings sem pergunta_id (antes o Python não recebia o id)
                (now() - interval '1 hour', 'buscar-materias', 'gemini-embedding-001', 3, 0, 3, NULL),
                (now() - interval '2 hours', 'buscar-materias', 'gemini-embedding-001', 3, 0, 3, NULL),
                (now() - interval '3 hours', 'planejamento-gerar-plano-dificuldade', 'sabiazinho-4', 5, 5, 10, NULL);`
    ),
    metricas_dia_brasilia: comoUsuario(
        ADMIN,
        `SELECT d->>'dia' AS dia FROM jsonb_array_elements((SELECT get_ai_cost_metrics(3650))->'por_dia') d`,
        `INSERT INTO admins (auth_id, role, scopes) VALUES ('${ADMIN}', 'admin', ARRAY['dashboard']);
         INSERT INTO ai_usage_log (created_at, endpoint, model) VALUES ('2026-09-03 01:30:00+00', 'assistente-chat', 'sabia-4');`
    ),
    metricas_uso: comoUsuario(
        ADMIN,
        `SELECT m->'perguntas_hoje' AS perguntas, m->'usuarios_hoje' AS usuarios,
                m->'usuarios_no_limite' AS no_limite, m->'pedidos_pendentes' AS pendentes
           FROM get_darcy_uso_metrics() m`,
        `${TICKET_PEDIDO} ${reservas(ALUNO, 2, 2)} ${reservas(OUTRO, 30, 1)}`
    ),
    metricas_uso_sem_escopo: comoUsuario(ALUNO, "SELECT get_darcy_uso_metrics()"),
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

function erro(nome: keyof typeof CENARIOS): string {
    const res = resultado(nome);
    if (res.error === undefined) throw new Error(`${nome}: esperava erro, veio ${JSON.stringify(res.rows)}`);
    return res.error;
}

describe("reserva atômica", () => {
    it("a primeira pergunta do dia cria a linha com 1 usada", () => {
        expect(linhas("primeira")).toEqual([expect.objectContaining({ permitido: true, usadas: 1, limite: 30 })]);
    });

    it("a 30ª passa e a 31ª é negada sem incrementar", () => {
        expect(linhas("trigesima")[0]).toMatchObject({ permitido: true, usadas: 30 });
        expect(linhas("trigesima_primeira")[0]).toMatchObject({ permitido: false, usadas: 30, limite: 30 });
    });

    it("uma rajada de pedidos nunca passa do limite", () => {
        expect(linhas("rajada_nao_passa_do_limite")).toEqual([{ usadas: 5, limite: 5 }]);
    });

    it("limite 0 nega sem criar uso", () => {
        expect(linhas("limite_zero_nega")[0]).toMatchObject({ permitido: false, usadas: 0 });
    });

    it("a cota é por usuário", () => {
        expect(linhas("outro_usuario_independente")[0]).toMatchObject({ permitido: true, usadas: 1 });
    });
});

describe("estorno", () => {
    it("devolve uma pergunta", () => {
        expect(linhas("estorno_devolve")).toEqual([{ usadas: 1 }]);
    });

    it("quem estava no limite volta a poder perguntar", () => {
        expect(linhas("estorno_libera_quem_estava_no_limite")[0]).toMatchObject({ permitido: true, usadas: 2 });
    });

    it("sem uso não fica negativo", () => {
        expect(linhas("estorno_nao_fica_negativo")).toEqual([{ usadas: null }]);
    });

    it("estorna o dia da reserva, não o dia corrente", () => {
        expect(linhas("estorno_do_dia_da_reserva")).toEqual([
            { delta: -1, usadas: 3 },
            { delta: 0, usadas: 1 },
        ]);
    });
});

describe("dia no fuso de Brasília", () => {
    it("02:59 UTC ainda é o dia anterior em Brasília", () => {
        expect(String(linhas("dia_antes_da_meia_noite")[0].dia)).toMatch(/2026-09-29/);
    });

    it("03:00 UTC é meia-noite de Brasília: dia novo", () => {
        expect(String(linhas("dia_na_meia_noite")[0].dia)).toMatch(/2026-09-30/);
    });

    it("renova_em é a meia-noite de Brasília", () => {
        expect(linhas("renova_em")).toEqual([{ ok: true }]);
    });

    it("a reserva conta no dia de Brasília e informa quando renova", () => {
        expect(linhas("reserva_usa_dia_de_brasilia")).toEqual([{ ok: true, renova_ok: true }]);
    });
});

describe("concessões", () => {
    it.each([
        ["extra_hoje_soma", 60],
        ["extra_vencida_ignorada", 30],
        ["extra_semana_vale_no_meio", 40],
        ["limite_permanente", 60],
        ["limite_menor_que_padrao_nao_reduz", 30],
        ["limite_mais_extra", 65],
        ["concessao_de_outro_nao_vale", 30],
    ] as const)("%s → limite %i", (nome, limite) => {
        expect(linhas(nome)).toEqual([{ limite }]);
    });

    it("uma concessão aprovada libera a 31ª pergunta", () => {
        expect(linhas("concessao_libera_31a")[0]).toMatchObject({ permitido: true, usadas: 31, limite: 60 });
    });

    it("extra sem data de fim é recusada pelo CHECK", () => {
        expect(erro("extra_sem_fim_recusada")).toMatch(/darcy_concessao_extra_com_fim_ck/);
    });
});

describe("estado da cota", () => {
    it("consultar não consome", () => {
        expect(linhas("estado_nao_consome")[0]).toMatchObject({ usadas: 3, limite: 30 });
    });
});

describe("custo do dia (teto global)", () => {
    it("soma só o que foi gasto depois da meia-noite de Brasília", () => {
        // 1000 × 0,005/1k + 1000 × 0,02/1k = 0,025; a linha de 23:59 fica de fora
        expect(Number(linhas("custo_hoje")[0].custo)).toBeCloseTo(0.025, 4);
    });
});

describe("RLS e permissões", () => {
    it("o aluno lê só o próprio uso", () => {
        expect(linhas("aluno_le_so_o_proprio_uso")).toEqual([{ user_id: ALUNO }]);
    });

    it.each(["aluno_nao_escreve_uso", "aluno_nao_zera_uso", "aluno_nao_se_concede"] as const)(
        "%s: escrita direta bloqueada",
        (nome) => {
            expect(erro(nome)).toMatch(/permission denied/);
        }
    );

    it("o aluno não chama a função de reserva (só o backend, com service_role)", () => {
        expect(erro("aluno_nao_reserva_direto")).toMatch(/permission denied for function/);
    });

    it("anon não enxerga nada", () => {
        expect(erro("anon_nao_le_uso")).toMatch(/permission denied/);
    });

    it("service_role reserva", () => {
        expect(linhas("service_role_reserva")[0]).toMatchObject({ permitido: true });
    });
});

describe("admin: pedido de mais perguntas no ticket", () => {
    it("aprovar 'só hoje' cria a concessão vinculada ao ticket", () => {
        const c = linhas("aprovar_hoje")[0].c;
        expect(c).toMatchObject({ user_id: ALUNO, tipo: "extra", quantidade: 30, ticket_id: 900, aprovado_por: ADMIN });
        expect(c.valida_de).toBe(c.valida_ate);
    });

    it("aprovar responde no ticket, resolve e vale na cota do aluno", () => {
        expect(linhas("aprovar_efeitos")[0]).toEqual({
            status: "resolvido",
            msgs: 1,
            texto: expect.stringContaining("+30 perguntas"),
            aprovado_por: ADMIN,
            motivo: "Semana de provas",
            limite: 60,
        });
    });

    it("'esta semana' vale 7 dias", () => {
        expect(linhas("aprovar_semana")).toEqual([{ tipo: "extra", quantidade: 20, dias: 6 }]);
    });

    it("'aumentar meu limite' é permanente", () => {
        expect(linhas("aprovar_limite")).toEqual([{ tipo: "limite", quantidade: 60, valida_ate: null }]);
    });

    it("não aprova duas vezes", () => {
        expect(erro("aprovar_duas_vezes")).toMatch(/já foi resolvido|já foi aprovado/);
    });

    it("aluno não aprova o próprio pedido", () => {
        expect(erro("aluno_nao_aprova_o_proprio")).toMatch(/forbidden/);
    });

    it("só aprova ticket que é pedido do Darcy", () => {
        expect(erro("aprovar_ticket_que_nao_e_pedido")).toMatch(/não é um pedido/);
    });

    it("recusar responde e resolve sem conceder", () => {
        expect(linhas("recusar")[0]).toEqual({
            status: "resolvido",
            texto: "Seu uso de hoje já foi alto; tente amanhã.",
            concessoes: 0,
        });
    });

    it("recusar exige motivo", () => {
        expect(erro("recusar_sem_motivo")).toMatch(/motivo/);
    });
});

describe("dashboard", () => {
    it("conta perguntas separadas das chamadas ao modelo", () => {
        const m = linhas("metricas_custo")[0];
        expect(m.req).toBe(5);
        // 1 (pergunta_id) + 1 (mesmo endpoint+created_at) + 1 (desconhecido)
        expect(m.perguntas).toBe(3);
        expect(m.sem_tokens).toBe(1);
        expect(m.por_endpoint["analyze-sabia"]).toMatchObject({ requisicoes: 2, perguntas: 1 });
    });

    it("busca semântica e dificuldade do plano sem pergunta_id não viram pergunta", () => {
        const m = linhas("metricas_ferramenta_nao_e_pergunta")[0];
        expect(m.req).toBe(5);
        // só o assistente-chat; a busca com o mesmo pergunta_id entra nele
        expect(m.perguntas).toBe(1);
        expect(Number(m.perguntas_por_dia)).toBe(1);
        expect(m.por_endpoint["buscar-materias"]).toMatchObject({ requisicoes: 3, perguntas: 1 });
        expect(m.por_endpoint["planejamento-gerar-plano-dificuldade"]).toMatchObject({ requisicoes: 1, perguntas: 0 });
    });

    it("agrupa o custo pelo dia de Brasília", () => {
        // 01:30 UTC de 03/09 = 22:30 de 02/09 em Brasília
        expect(linhas("metricas_dia_brasilia")).toEqual([{ dia: "2026-09-02" }]);
    });

    it("mostra o uso das cotas de hoje", () => {
        expect(linhas("metricas_uso")[0]).toEqual({ perguntas: 3, usuarios: 2, no_limite: 1, pendentes: 1 });
    });

    it("exige o escopo dashboard", () => {
        expect(erro("metricas_uso_sem_escopo")).toMatch(/forbidden/);
    });
});
