/**
 * Alerta de saldo da IA (PGlite com o schema de produção + 20260929_darcy_cota
 * + 20260929b_dashboard_rastreabilidade + 20260930_ai_saldo).
 *
 * Saldo estimado = último saldo informado + recargas depois dele − custo dos
 * modelos da Maritaca desde esse registro; previsão pela média dos últimos 7
 * dias de Brasília; alertas sem créditos / urgente / atenção / desatualizado
 * com limiares de ai_saldo_config; tudo só com has_admin_scope('dashboard').
 *
 * O cálculo roda em ai_saldo_status_em(p_agora) com um instante fixo, para os
 * dias de Brasília não dependerem da hora em que a suíte roda.
 */

import { Job, rodarCenarios } from "./pglite_supabase";

// A nova migration entra duas vezes: reaplicar no SQL Editor não pode quebrar.
const MIGRATIONS = [
    "20260929_darcy_cota.sql",
    "20260929b_dashboard_rastreabilidade.sql",
    "20260930_ai_saldo.sql",
    "20260930_ai_saldo.sql",
];

const ALUNO = "11111111-1111-1111-1111-111111111111";
const ADMIN = "33333333-3333-3333-3333-333333333333";
const ADMIN_TICKETS = "55555555-5555-5555-5555-555555555555";

/** 30/09/2026 15:00 em Brasília (18:00 UTC). */
const AGORA = "2026-09-30 15:00:00-03";
/** Instante em Brasília, ex. br('2026-09-28 10:00'). */
const br = (s: string) => `'${s}:00-03'::timestamptz`;

// sabia-4: 1000 tokens de entrada = R$ 1 (conta redonda); os outros para
// mostrar que só os modelos da Maritaca saem do crédito dela.
const PRECOS = `
  DELETE FROM ai_pricing;
  INSERT INTO ai_pricing (model, input_per_1k, output_per_1k) VALUES
    ('sabia-4', 1, 2),
    ('sabiazinho-4', 0.5, 1),
    ('gemini-embedding-001', 1, 0);
`;

/** Linha no ai_usage_log custando `reais` no sabia-4 (1000 tokens de entrada = R$ 1). */
const gasto = (quando: string, reais: number, extra: { model?: string; success?: boolean; erro?: string } = {}) => `
  INSERT INTO ai_usage_log (created_at, endpoint, model, prompt_tokens, completion_tokens, total_tokens, success, erro_codigo)
  VALUES (${quando}, 'chat-send', '${extra.model ?? "sabia-4"}', ${Math.round(reais * 1000)}, 0, ${Math.round(reais * 1000)},
          ${extra.success ?? true}, ${extra.erro ? `'${extra.erro}'` : "NULL"});`;

const registro = (tipo: "saldo_atual" | "recarga", valor: number, quando: string, por: string | null = ADMIN) => `
  INSERT INTO ai_saldo_registros (tipo, valor, registrado_em, registrado_por)
  VALUES ('${tipo}', ${valor}, ${quando}, ${por ? `'${por}'` : "NULL"});`;

const status = (setup: string, agora = AGORA): Job => ({
    setup: `${PRECOS} DELETE FROM ai_usage_log; ${setup}`,
    query: `SELECT ai_saldo_status_em('${agora}'::timestamptz) AS s`,
});

const comoUsuario = (uid: string, sql: string, setup = ""): Job => ({
    setup: `${setup}
      SELECT set_config('request.jwt.claim.sub', '${uid}', true);
      SET LOCAL ROLE authenticated;`,
    query: sql,
});

const ADMINS = `
  INSERT INTO admins (auth_id, role, scopes) VALUES
    ('${ADMIN}', 'admin', ARRAY['dashboard']),
    ('${ADMIN_TICKETS}', 'admin', ARRAY['tickets']);
  INSERT INTO users (email, nome_completo, auth_id) VALUES ('admin@unb.br', 'Ana Admin', '${ADMIN}');
`;

/** 7 dias de Brasília (24 a 30/09) a R$ 2 por dia. */
const SETE_DIAS_A_2 = ["24", "25", "26", "27", "28", "29", "30"]
    .map((d) => gasto(br(`2026-09-${d} 10:00`), 2))
    .join("");

/** Saldo informado às 14h de hoje: nada do log de antes entra no desconto. */
const saldoHoje = (valor: number) => registro("saldo_atual", valor, br("2026-09-30 14:00"));

const CENARIOS = {
    // ── cálculo do saldo ────────────────────────────────────────────────
    nunca_informado: status(""),
    calculo: status(`
      ${registro("saldo_atual", 999, br("2026-09-01 09:00"))}
      ${registro("recarga", 500, br("2026-09-10 09:00"))}
      ${registro("saldo_atual", 100, br("2026-09-20 10:00"))}
      ${registro("recarga", 50, br("2026-09-25 10:00"))}
      ${gasto(br("2026-09-20 09:59"), 7)}
      ${gasto(br("2026-09-21 12:00"), 3)}
      ${gasto(br("2026-09-22 12:00"), 1.5, { model: "sabiazinho-4" })}
      ${gasto(br("2026-09-23 12:00"), 0.5, { success: false })}
      ${gasto(br("2026-09-23 12:00"), 40, { model: "gemini-embedding-001" })}
      ${gasto(br("2026-09-23 12:00"), 0, { model: "ragflow" })}
      ${gasto(br("2026-09-30 16:00"), 20)}
    `),
    saldo_redefine: status(`
      ${registro("saldo_atual", 100, br("2026-09-20 10:00"))}
      ${registro("recarga", 50, br("2026-09-25 10:00"))}
      ${gasto(br("2026-09-26 12:00"), 5)}
      ${registro("saldo_atual", 80, br("2026-09-28 10:00"))}
      ${gasto(br("2026-09-29 12:00"), 4)}
    `),
    modelos_configuraveis: status(`
      UPDATE ai_saldo_config SET modelos_maritaca = ARRAY['sabia-4', 'gemini-embedding-001'] WHERE id;
      ${registro("saldo_atual", 100, br("2026-09-20 10:00"))}
      ${gasto(br("2026-09-21 12:00"), 3)}
      ${gasto(br("2026-09-21 12:00"), 1.5, { model: "sabiazinho-4" })}
      ${gasto(br("2026-09-21 12:00"), 4, { model: "gemini-embedding-001" })}
    `),
    maritaca_sem_preco: status(`
      UPDATE ai_saldo_config SET modelos_maritaca = modelos_maritaca || ARRAY['sabia-5'] WHERE id;
      ${registro("saldo_atual", 100, br("2026-09-20 10:00"))}
      ${gasto(br("2026-09-21 12:00"), 3, { model: "sabia-5" })}
    `),

    // ── previsão ────────────────────────────────────────────────────────
    previsao_7d: status(`
      ${SETE_DIAS_A_2}
      -- 23/09 23:30 em Brasília = 24/09 02:30 UTC: fora da janela de Brasília
      ${gasto(br("2026-09-23 23:30"), 100)}
      ${saldoHoje(40)}
    `),
    previsao_parcial: status(`
      ${["28", "29", "30"].map((d) => gasto(br(`2026-09-${d} 10:00`), 3)).join("")}
      ${saldoHoje(300)}
    `),
    previsao_so_modelos_maritaca: status(`
      ${SETE_DIAS_A_2}
      ${gasto(br("2026-09-29 10:00"), 70, { model: "gemini-embedding-001" })}
      ${saldoHoje(40)}
    `),
    sem_gasto_recente: status(`
      ${gasto(br("2026-09-01 10:00"), 50)}
      ${saldoHoje(100)}
    `),
    sem_log: status(saldoHoje(100)),

    // ── alertas e limiares ──────────────────────────────────────────────
    urgente_reais: status(saldoHoje(9.99)),
    urgente_dias: status(`${["28", "29", "30"].map((d) => gasto(br(`2026-09-${d} 10:00`), 12)).join("")} ${saldoHoje(50)}`),
    atencao_reais: status(saldoHoje(29)),
    limite_exato_10: status(saldoHoje(10)),
    atencao_dias: status(`${["28", "29", "30"].map((d) => gasto(br(`2026-09-${d} 10:00`), 10)).join("")} ${saldoHoje(100)}`),
    ok: status(`${SETE_DIAS_A_2} ${saldoHoje(100)}`),
    limiar_configurado: status(`UPDATE ai_saldo_config SET atencao_reais = 200 WHERE id; ${saldoHoje(100)}`),
    negativo: status(`
      ${registro("saldo_atual", 5, br("2026-09-29 10:00"))}
      ${gasto(br("2026-09-29 12:00"), 8)}
    `),
    desatualizado: status(registro("saldo_atual", 100, br("2026-09-14 14:00"))),
    quase_desatualizado: status(registro("saldo_atual", 100, br("2026-09-15 16:00"))),
    recarga_atualiza: status(`
      ${registro("saldo_atual", 100, br("2026-09-01 10:00"))}
      ${registro("recarga", 20, br("2026-09-28 10:00"))}
    `),
    sem_creditos: status(`
      ${saldoHoje(100)}
      ${gasto(br("2026-09-30 12:00"), 0, { success: false, erro: "ai_sem_creditos" })}
    `),
    sem_creditos_antigo: status(`
      ${saldoHoje(100)}
      ${gasto(br("2026-09-29 13:59"), 0, { success: false, erro: "ai_sem_creditos" })}
      ${gasto(br("2026-09-30 12:00"), 0, { success: false })}
    `),
    tudo_junto: status(`
      ${registro("saldo_atual", 3, br("2026-09-01 10:00"))}
      ${gasto(br("2026-09-30 14:30"), 0, { success: false, erro: "ai_sem_creditos" })}
    `),

    // ── RPCs do admin ───────────────────────────────────────────────────
    registrar_saldo: comoUsuario(
        ADMIN,
        "SELECT registrar_ai_saldo('saldo_atual', 123.456, '  painel às 10h  ') AS s",
        ADMINS
    ),
    registrar_saldo_e_recarga: comoUsuario(
        ADMIN,
        "SELECT registrar_ai_saldo('recarga', 50, NULL) AS s",
        `${ADMINS}
         SELECT set_config('request.jwt.claim.sub', '${ADMIN}', true);
         SET LOCAL ROLE authenticated;
         SELECT registrar_ai_saldo('saldo_atual', 100);
         RESET ROLE;`
    ),
    registrar_linha_gravada: comoUsuario(
        ADMIN,
        "SELECT registrar_ai_saldo('saldo_atual', 42, 'x') IS NOT NULL AS ok",
        ADMINS
    ),
    recarga_sem_saldo: comoUsuario(ADMIN, "SELECT registrar_ai_saldo('recarga', 50)", ADMINS),
    tipo_invalido: comoUsuario(ADMIN, "SELECT registrar_ai_saldo('estorno', 50)", ADMINS),
    valor_negativo: comoUsuario(ADMIN, "SELECT registrar_ai_saldo('saldo_atual', -1)", ADMINS),
    recarga_zero: comoUsuario(ADMIN, `SELECT registrar_ai_saldo('recarga', 0)`, `${ADMINS} ${saldoHoje(10)}`),
    status_admin: comoUsuario(ADMIN, "SELECT get_ai_saldo_status() AS s", ADMINS),

    // ── has_admin_scope negado ──────────────────────────────────────────
    status_aluno: comoUsuario(ALUNO, "SELECT get_ai_saldo_status()", ADMINS),
    status_admin_tickets: comoUsuario(ADMIN_TICKETS, "SELECT get_ai_saldo_status()", ADMINS),
    registrar_aluno: comoUsuario(ALUNO, "SELECT registrar_ai_saldo('saldo_atual', 1000)", ADMINS),
    registrar_admin_tickets: comoUsuario(ADMIN_TICKETS, "SELECT registrar_ai_saldo('saldo_atual', 1000)", ADMINS),
    select_direto_admin: comoUsuario(ADMIN, "SELECT count(*) FROM ai_saldo_registros", ADMINS),
    insert_direto_admin: comoUsuario(
        ADMIN,
        "INSERT INTO ai_saldo_registros (tipo, valor) VALUES ('saldo_atual', 1000)",
        ADMINS
    ),
    config_direto_admin: comoUsuario(ADMIN, "UPDATE ai_saldo_config SET urgente_reais = 0", ADMINS),
    calculo_interno_admin: comoUsuario(ADMIN, "SELECT ai_saldo_status_em(now())", ADMINS),
    status_anon: {
        setup: "SET LOCAL ROLE anon;",
        query: "SELECT get_ai_saldo_status()",
    },
    assinaturas: {
        query: `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
                       p.prosecdef AS definer, p.proconfig::text AS config
                  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public'
                   AND p.proname IN ('ai_saldo_status_em', 'get_ai_saldo_status', 'registrar_ai_saldo')
                 ORDER BY p.proname`,
    },
    rls: {
        query: `SELECT relname, relrowsecurity FROM pg_class
                 WHERE relname IN ('ai_saldo_registros', 'ai_saldo_config') ORDER BY relname`,
    },
    config_unica: { query: "SELECT count(*)::int AS n FROM ai_saldo_config" },
};

type Nome = keyof typeof CENARIOS;
let resultado: ReturnType<typeof rodarCenarios<Nome>>;

beforeAll(() => {
    resultado = rodarCenarios(MIGRATIONS, CENARIOS);
}, 120_000);

function linhas(nome: Nome) {
    const r = resultado(nome);
    if (r.error) throw new Error(`${nome}: ${r.error}`);
    return r.rows!;
}
const s = (nome: Nome) => linhas(nome)[0].s;
const erro = (nome: Nome) => resultado(nome).error ?? "";
const num = (v: unknown) => (v === null || v === undefined ? v : Number(v));

describe("saldo estimado", () => {
    it("nunca informado: sem saldo, sem base, alerta de desatualizado", () => {
        const r = s("nunca_informado");
        expect(r.configurado).toBe(false);
        expect(r.saldo_estimado).toBeNull();
        expect(r.base).toBeNull();
        expect(r.ultimo_registro).toBeNull();
        expect(r.alertas).toEqual(["desatualizado"]);
        expect(r.nivel).toBe("desatualizado");
    });

    it("base = último saldo_atual + recargas posteriores; custo só desde esse registro e só da Maritaca", () => {
        const r = s("calculo");
        // saldo de 20/09 (100) + recarga de 25/09 (50); o saldo e a recarga de antes não contam
        expect(num(r.base.valor)).toBe(100);
        expect(num(r.base.recargas)).toBe(50);
        expect(r.base.n_recargas).toBe(1);
        expect(num(r.saldo_base)).toBe(150);
        // 3 (sabia-4) + 0,75 (1500 tokens do sabiazinho-4 a R$ 0,50/1k) + 0,5
        // (falha que cobrou) — sem os 7 de antes do registro, sem os 40 do
        // Gemini, sem o RAGFlow e sem o que é depois do instante consultado
        expect(num(r.custo_desde_base)).toBeCloseTo(4.25, 4);
        expect(num(r.saldo_estimado)).toBeCloseTo(145.75, 2);
    });

    it("novo saldo_atual redefine a base e zera as recargas e o custo anteriores", () => {
        const r = s("saldo_redefine");
        expect(num(r.base.valor)).toBe(80);
        expect(num(r.base.recargas)).toBe(0);
        expect(num(r.custo_desde_base)).toBeCloseTo(4, 4);
        expect(num(r.saldo_estimado)).toBeCloseTo(76, 2);
    });

    it("a lista de modelos da Maritaca vem da configuração", () => {
        const r = s("modelos_configuraveis");
        expect(r.modelos_maritaca).toEqual(["sabia-4", "gemini-embedding-001"]);
        // sabiazinho-4 saiu da lista; gemini entrou
        expect(num(r.custo_desde_base)).toBeCloseTo(7, 4);
    });

    it("padrão: sabia-4 e sabiazinho-4 (e os sabiá antigos), sem Gemini nem RAGFlow", () => {
        const lista = s("nunca_informado").modelos_maritaca;
        expect(lista).toEqual(expect.arrayContaining(["sabia-4", "sabiazinho-4"]));
        expect(lista).not.toContain("gemini-embedding-001");
        expect(lista).not.toContain("ragflow");
    });

    it("modelo da Maritaca sem preço aparece à parte (entra como R$ 0)", () => {
        const r = s("maritaca_sem_preco");
        expect(r.modelos_maritaca_sem_preco).toEqual(["sabia-5"]);
        expect(num(r.saldo_estimado)).toBe(100);
    });

    it("gasto maior que o saldo: estimativa negativa, 0 dias, urgente", () => {
        const r = s("negativo");
        expect(num(r.saldo_estimado)).toBe(-3);
        expect(num(r.previsao.dias_restantes)).toBe(0);
        expect(r.nivel).toBe("urgente");
    });
});

describe("previsão", () => {
    it("média dos últimos 7 dias de Brasília → dias restantes", () => {
        const p = s("previsao_7d").previsao;
        expect(p.janela_dias).toBe(7);
        expect(p.dias_considerados).toBe(7);
        expect(p.parcial).toBe(false);
        // os R$ 100 de 23/09 23:30 (Brasília) ficam fora — em UTC já seria 24/09
        expect(num(p.custo_janela)).toBeCloseTo(14, 4);
        expect(num(p.media_diaria)).toBeCloseTo(2, 4);
        expect(num(p.dias_restantes)).toBe(20);
    });

    it("menos de 7 dias de dados: divide pelos dias disponíveis e marca parcial", () => {
        const p = s("previsao_parcial").previsao;
        expect(p.dias_considerados).toBe(3);
        expect(p.parcial).toBe(true);
        expect(num(p.media_diaria)).toBeCloseTo(3, 4);
        expect(num(p.dias_restantes)).toBe(100);
    });

    it("só os modelos da Maritaca entram na média", () => {
        expect(num(s("previsao_so_modelos_maritaca").previsao.media_diaria)).toBeCloseTo(2, 4);
    });

    it("sem gasto na janela: média 0 e nenhuma previsão de dias", () => {
        const r = s("sem_gasto_recente");
        expect(num(r.previsao.media_diaria)).toBe(0);
        expect(r.previsao.dias_restantes).toBeNull();
        expect(r.nivel).toBe("ok");
    });

    it("sem log nenhum da Maritaca: sem média e sem previsão", () => {
        const p = s("sem_log").previsao;
        expect(p.dias_considerados).toBe(0);
        expect(p.media_diaria).toBeNull();
        expect(p.dias_restantes).toBeNull();
    });
});

describe("níveis de alerta e limiares", () => {
    it.each([
        ["urgente_reais", "urgente"],
        ["urgente_dias", "urgente"],
        ["atencao_reais", "atencao"],
        ["limite_exato_10", "atencao"],
        ["atencao_dias", "atencao"],
        ["ok", "ok"],
        ["limiar_configurado", "atencao"],
    ] as Array<[Nome, string]>)("%s → %s", (nome, nivel) => {
        expect(s(nome).nivel).toBe(nivel);
    });

    it("limiares padrão: R$ 10 / 5 dias, R$ 30 / 14 dias, 15 dias sem registro", () => {
        expect(s("ok").limiares).toEqual({
            urgente_reais: 10,
            urgente_dias: 5,
            atencao_reais: 30,
            atencao_dias: 14,
            desatualizado_dias: 15,
        });
    });

    it("dias restantes abaixo do limiar dispara mesmo com saldo acima de R$ 30", () => {
        const r = s("urgente_dias");
        expect(num(r.saldo_estimado)).toBe(50);
        expect(num(r.previsao.dias_restantes)).toBeCloseTo(4.2, 1);
    });

    it("último registro com mais de 15 dias: desatualizado", () => {
        expect(s("desatualizado").alertas).toEqual(["desatualizado"]);
        expect(s("quase_desatualizado").alertas).toEqual([]);
    });

    it("uma recarga recente conta como registro", () => {
        const r = s("recarga_atualiza");
        expect(r.alertas).toEqual([]);
        expect(r.ultimo_registro.tipo).toBe("recarga");
        expect(num(r.saldo_estimado)).toBe(120);
    });

    it("erro real de sem créditos nas últimas 24h: 'Créditos acabaram' na frente", () => {
        const r = s("sem_creditos");
        expect(r.nivel).toBe("sem_creditos");
        expect(r.sem_creditos.eventos).toBe(1);
        expect(r.sem_creditos.ultimo_evento).toBeTruthy();
    });

    it("evento de mais de 24h, ou falha sem o marcador, não conta", () => {
        const r = s("sem_creditos_antigo");
        expect(r.sem_creditos.eventos).toBe(0);
        expect(r.nivel).toBe("ok");
    });

    it("vários ao mesmo tempo, na ordem de prioridade", () => {
        expect(s("tudo_junto").alertas).toEqual(["sem_creditos", "urgente", "desatualizado"]);
    });
});

describe("registrar_ai_saldo", () => {
    it("grava quem e quando e devolve o status recalculado", () => {
        const r = s("registrar_saldo");
        expect(r.configurado).toBe(true);
        expect(num(r.saldo_estimado)).toBe(123.46);
        expect(r.ultimo_registro).toMatchObject({
            tipo: "saldo_atual",
            registrado_por: ADMIN,
            nome: "Ana Admin",
            email: "admin@unb.br",
            observacao: "painel às 10h",
        });
        expect(r.ultimo_registro.registrado_em).toBeTruthy();
        expect(r.alertas).toEqual([]);
    });

    it("recarga registrada depois do saldo soma à base (mesmo instante: vale a ordem de registro)", () => {
        const r = s("registrar_saldo_e_recarga");
        expect(num(r.saldo_estimado)).toBe(150);
        expect(r.ultimo_registro.tipo).toBe("recarga");
    });

    it("grava a linha", () => {
        expect(linhas("registrar_linha_gravada")[0].ok).toBe(true);
    });

    it.each([
        ["recarga_sem_saldo", /saldo atual antes/],
        ["tipo_invalido", /tipo inválido/],
        ["valor_negativo", /valor inválido/],
        ["recarga_zero", /valor inválido/],
    ] as Array<[Nome, RegExp]>)("%s é recusado", (nome, msg) => {
        expect(erro(nome)).toMatch(msg);
    });

    it("admin com escopo dashboard lê o status", () => {
        expect(s("status_admin").nivel).toBe("desatualizado");
    });
});

describe("has_admin_scope('dashboard') negado", () => {
    it.each([
        "status_aluno",
        "status_admin_tickets",
        "registrar_aluno",
        "registrar_admin_tickets",
    ] as Nome[])("%s: forbidden", (nome) => {
        expect(erro(nome)).toMatch(/forbidden: dashboard scope required/);
    });

    it.each([
        "select_direto_admin",
        "insert_direto_admin",
        "config_direto_admin",
        "calculo_interno_admin",
        "status_anon",
    ] as Nome[])("%s: sem permissão (só pelas RPCs)", (nome) => {
        expect(erro(nome)).toMatch(/permission denied/);
    });

    it("tabelas com RLS ligado", () => {
        expect(linhas("rls")).toEqual([
            { relname: "ai_saldo_config", relrowsecurity: true },
            { relname: "ai_saldo_registros", relrowsecurity: true },
        ]);
    });
});

describe("migration", () => {
    it("funções SECURITY DEFINER com search_path fixo", () => {
        expect(linhas("assinaturas")).toEqual([
            { proname: "ai_saldo_status_em", args: "p_agora timestamp with time zone", definer: true, config: "{search_path=public}" },
            { proname: "get_ai_saldo_status", args: "", definer: true, config: "{search_path=public}" },
            {
                proname: "registrar_ai_saldo",
                args: "p_tipo text, p_valor numeric, p_observacao text",
                definer: true,
                config: "{search_path=public}",
            },
        ]);
    });

    it("reaplicada, mantém uma única linha de configuração", () => {
        expect(linhas("config_unica")[0].n).toBe(1);
    });
});
