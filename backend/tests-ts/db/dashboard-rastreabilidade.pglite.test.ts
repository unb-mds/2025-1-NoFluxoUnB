/**
 * Dashboard admin — custo de IA e suporte (PGlite com o schema de produção +
 * 20260929_darcy_cota.sql + 20260929b_dashboard_rastreabilidade.sql).
 *
 * get_ai_cost_metrics: modelo sem preço vira alerta (não R$ 0 silencioso),
 * tokens médios sem as linhas de 0 tokens e por pergunta, saúde do log.
 * get_ticket_metrics: mediana/P90 de resolução e da 1ª resposta do suporte,
 * sem resposta, aguardando suporte e janela de 30 dias.
 */

import { lerMigration, Job, rodarCenarios } from "./pglite_supabase";

// A nova migration entra duas vezes: reaplicar no SQL Editor não pode quebrar.
const MIGRATIONS = [
    "20260929_darcy_cota.sql",
    "20260929b_dashboard_rastreabilidade.sql",
    "20260929b_dashboard_rastreabilidade.sql",
];

const ALUNO = "11111111-1111-1111-1111-111111111111";
const ADMIN = "33333333-3333-3333-3333-333333333333";
const TECH = "44444444-4444-4444-4444-444444444444";

/** ticket_chat.sql (ticket_messages + CHECK do audit log) sem a transação nem o Realtime. */
const TICKET_CHAT = lerMigration("ticket_chat.sql")
    .replace(/^(BEGIN|COMMIT);$/gm, "")
    .replace(/DO \$realtime\$[\s\S]*?\$realtime\$;/, "")
    .replace(/DO \$cron\$[\s\S]*?\$cron\$;/, "");

const comoUsuario = (uid: string, sql: string, setup = ""): Job => ({
    setup: `${setup}
      SELECT set_config('request.jwt.claim.sub', '${uid}', true);
      SET LOCAL ROLE authenticated;`,
    query: sql,
});

const ADMIN_DASH = `INSERT INTO admins (auth_id, role, scopes) VALUES ('${ADMIN}', 'admin', ARRAY['dashboard']);`;

const P1 = "aaaaaaaa-0000-0000-0000-000000000001";
const P2 = "aaaaaaaa-0000-0000-0000-000000000002";

const LOG_IA = `
  ${ADMIN_DASH}
  DELETE FROM ai_pricing;
  INSERT INTO ai_pricing (model, input_per_1k, output_per_1k) VALUES
    ('sabia-4', 0.005, 0.02),
    ('modelo-gratis', 0, 0);
  INSERT INTO ai_usage_log (created_at, endpoint, model, prompt_tokens, completion_tokens, total_tokens, success, pergunta_id)
  VALUES
    -- pergunta 1: orquestrador + embeddings da busca (sem preço cadastrado)
    (now() - interval '3 hours', 'chat-send', 'sabia-4', 80, 20, 100, true, '${P1}'),
    (now() - interval '3 hours', 'recomendar', 'gemini-embedding-001', 50, 0, 50, true, '${P1}'),
    -- pergunta 2: falhou antes de o modelo responder (0 tokens)
    (now() - interval '2 hours', 'assistente-chat', 'sabia-4', 0, 0, 0, false, '${P2}'),
    -- ferramenta fora de pergunta
    (now() - interval '1 hour', 'planejamento-gerar-plano-dificuldade', 'modelo-gratis', 20, 10, 30, true, NULL),
    -- RAGFlow sem tokens nem preço
    (now() - interval '30 minutes', 'analyze', 'ragflow', 0, 0, 0, true, '${P2}');
`;

const P3 = "aaaaaaaa-0000-0000-0000-000000000003";
const P4 = "aaaaaaaa-0000-0000-0000-000000000004";

/** Perguntas estornadas: a linha da rota paga falhou, mas o modelo cobrou. */
const LOG_IA_FALHAS = `
  ${ADMIN_DASH}
  DELETE FROM ai_pricing;
  INSERT INTO ai_pricing (model, input_per_1k, output_per_1k) VALUES ('sabia-4', 0.005, 0.02);
  INSERT INTO ai_usage_log (created_at, endpoint, model, prompt_tokens, completion_tokens, total_tokens, success, pergunta_id)
  VALUES
    -- P3 respondida; a busca de uma ferramenta falhou, mas não decide
    (now() - interval '20 minutes', 'chat-send', 'sabia-4', 1000, 0, 1000, true, '${P3}'),
    (now() - interval '20 minutes', 'buscar-materias', 'gemini-embedding-001', 10, 0, 10, false, '${P3}'),
    -- P4 estornada: embeddings ok, stream terminou em erro depois de cobrar
    (now() - interval '10 minutes', 'recomendar-stream', 'gemini-embedding-001', 10, 0, 10, true, '${P4}'),
    (now() - interval '10 minutes', 'analyze-sabia-stream', 'sabia-4', 1000, 0, 1000, false, '${P4}'),
    -- sem pergunta_id (antes de 29/09): a própria linha é a pergunta
    (now() - interval '5 minutes', 'analyze-sabia', 'sabia-4', 0, 0, 0, false, NULL);
`;

// Tickets relativos a now(); horas em intervalos exatos para a mediana/P90.
const t = (dias: number, horas = 0) => `now() - interval '${dias} days' + interval '${horas} hours'`;
const TICKETS = `
  ${TICKET_CHAT}
  ${ADMIN_DASH}
  INSERT INTO tickets (id, created_by, title, description, category, status, created_at, resolved_at) VALUES
    (1, '${ALUNO}', 'a', 'a', 'bug', 'resolvido',       ${t(10)}, ${t(10, 24)}),
    (2, '${ALUNO}', 'b', 'b', 'bug', 'resolvido',       ${t(40)}, ${t(40, 48)}),
    (3, '${ALUNO}', 'c', 'c', 'bug', 'aberto',          ${t(5)},  NULL),
    (4, '${ALUNO}', 'd', 'd', 'bug', 'em_andamento',    ${t(3)},  NULL),
    (5, '${ALUNO}', 'e', 'e', 'bug', 'aguardando_info', ${t(2)},  NULL),
    (6, '${ALUNO}', 'f', 'f', 'bug', 'aguardando_info', ${t(1)},  NULL);
  INSERT INTO ticket_messages (ticket_id, author_id, author_role, content, created_at) VALUES
    (1, '${TECH}',  'tech', 'oi', ${t(10, 2)}),
    (4, '${TECH}',  'tech', 'oi', ${t(3, 1)}),
    (4, '${ALUNO}', 'user', 'e aí?', ${t(3, 2)}),
    (5, '${TECH}',  'tech', 'manda print', ${t(2, 3)});
  -- ticket 2: conversa apagada pela retenção, só o audit da 1ª resposta ficou
  INSERT INTO ticket_audit_log (ticket_id, actor_id, action, notes, created_at)
  VALUES (2, '${TECH}', 'message_added', 'Primeira resposta do suporte', ${t(40, 5)});
`;

const CENARIOS = {
    custo: comoUsuario(ADMIN, "SELECT get_ai_cost_metrics(30) AS m", LOG_IA),
    custo_falhas: comoUsuario(ADMIN, "SELECT get_ai_cost_metrics(30) AS m", LOG_IA_FALHAS),
    custo_sem_escopo: comoUsuario(ALUNO, "SELECT get_ai_cost_metrics(30)"),
    custo_sem_log: comoUsuario(ADMIN, "SELECT get_ai_cost_metrics(30) AS m", `${ADMIN_DASH} DELETE FROM ai_usage_log;`),
    tickets: comoUsuario(ADMIN, "SELECT get_ticket_metrics() AS m", TICKETS),
    tickets_sem_escopo: comoUsuario(ALUNO, "SELECT get_ticket_metrics()"),
    tickets_vazio: comoUsuario(ADMIN, "SELECT get_ticket_metrics() AS m", `${TICKET_CHAT} ${ADMIN_DASH}`),
    assinaturas: {
        query: `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
                       p.prosecdef AS definer, p.proconfig::text AS config
                  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname IN ('get_ai_cost_metrics', 'get_ticket_metrics')
                 ORDER BY p.proname`,
    },
};

let resultado: ReturnType<typeof rodarCenarios<keyof typeof CENARIOS>>;

beforeAll(() => {
    resultado = rodarCenarios(MIGRATIONS, CENARIOS);
}, 120_000);

function linhas(nome: keyof typeof CENARIOS) {
    const r = resultado(nome);
    if (r.error) throw new Error(`${nome}: ${r.error}`);
    return r.rows!;
}
const m = (nome: keyof typeof CENARIOS) => linhas(nome)[0].m;
const erro = (nome: keyof typeof CENARIOS) => resultado(nome).error ?? "";

describe("get_ai_cost_metrics — modelo sem preço é alerta, não custo zero", () => {
    it("lista os modelos do log sem preço cadastrado ou com preço 0", () => {
        expect(m("custo").modelos_sem_preco).toEqual([
            { model: "gemini-embedding-001", motivo: "sem_cadastro", requisicoes: 1, tokens: 50 },
            { model: "modelo-gratis", motivo: "preco_zero", requisicoes: 1, tokens: 30 },
            { model: "ragflow", motivo: "sem_cadastro", requisicoes: 1, tokens: 0 },
        ]);
    });

    it("marca os mesmos modelos em por_modelo e mantém o custo só dos que têm preço", () => {
        const c = m("custo");
        expect(c.por_modelo["sabia-4"].sem_preco).toBe(false);
        expect(c.por_modelo["gemini-embedding-001"].sem_preco).toBe(true);
        expect(c.por_modelo["ragflow"].sem_preco).toBe(true);
        // 80/1000*0.005 + 20/1000*0.02 = 0.0008
        expect(Number(c.custo_total)).toBeCloseTo(0.0008, 4);
    });
});

describe("get_ai_cost_metrics — tokens médios", () => {
    it("por requisição ignora as linhas de 0 tokens", () => {
        // (100 + 50 + 30) / 3; antes: 180 / 5 = 36
        expect(Number(m("custo").tokens_medios_por_req)).toBe(60);
    });

    it("por pergunta soma as chamadas da mesma pergunta e ignora perguntas sem tokens", () => {
        // P1 = 100 + 50; P2 = 0 (falha + RAGFlow sem tokens) fica de fora
        expect(Number(m("custo").tokens_medios_por_pergunta)).toBe(150);
    });

    it("sem log: médias zeradas, sem alerta de modelo", () => {
        const c = m("custo_sem_log");
        expect(c.tokens_medios_por_req).toBe(0);
        expect(c.tokens_medios_por_pergunta).toBe(0);
        expect(c.modelos_sem_preco).toEqual([]);
    });
});

describe("get_ai_cost_metrics — perguntas estornadas não contam como pergunta", () => {
    const somaPerguntasPorDia = (c: any) => c.por_dia.reduce((t: number, d: any) => t + d.perguntas, 0);

    it("a pergunta cuja rota paga falhou sai da contagem e vai para perguntas_com_falha", () => {
        const c = m("custo");
        // P1 respondida; P2 falhou no assistente-chat (a linha do RAGFlow ok não salva)
        expect(c.total_perguntas).toBe(1);
        expect(c.perguntas_com_falha).toBe(1);
        expect(somaPerguntasPorDia(c)).toBe(1);
        expect(c.por_endpoint["assistente-chat"].perguntas).toBe(0);
        expect(c.por_endpoint["chat-send"].perguntas).toBe(1);
    });

    it("linha de ferramenta não decide; o custo das estornadas continua no total", () => {
        const c = m("custo_falhas");
        expect(c.total_perguntas).toBe(1); // P3
        expect(c.perguntas_com_falha).toBe(2); // P4 e a linha sem pergunta_id
        expect(somaPerguntasPorDia(c)).toBe(1);
        expect(c.por_endpoint["analyze-sabia-stream"]).toMatchObject({ requisicoes: 1, perguntas: 0 });
        expect(c.por_endpoint["recomendar-stream"].perguntas).toBe(0);
        expect(c.por_endpoint["chat-send"].perguntas).toBe(1);
        // 1000/1000*0.005 (P3) + 1000/1000*0.005 (P4, estornada mas cobrada)
        expect(Number(c.custo_total)).toBeCloseTo(0.01, 4);
        expect(Number(c.por_endpoint["analyze-sabia-stream"].custo)).toBeCloseTo(0.005, 4);
        expect(c.total_requisicoes).toBe(5);
    });

    it("sem log: zero perguntas com falha", () => {
        expect(m("custo_sem_log")).toMatchObject({ total_perguntas: 0, perguntas_com_falha: 0 });
    });
});

describe("get_ai_cost_metrics — saúde do log", () => {
    it("último registro e taxa de falha, geral e por endpoint", () => {
        const s = m("custo").saude_log;
        expect(s.requisicoes).toBe(5);
        expect(s.falhas).toBe(1);
        expect(Number(s.taxa_falha)).toBe(20);
        expect(new Date(s.ultimo_registro).getTime()).toBe(new Date(s.por_endpoint.analyze.ultimo_registro).getTime());
        expect(s.por_endpoint["assistente-chat"]).toMatchObject({ requisicoes: 1, falhas: 1 });
        expect(Number(s.por_endpoint["assistente-chat"].taxa_falha)).toBe(100);
        expect(s.por_endpoint["chat-send"]).toMatchObject({ requisicoes: 1, falhas: 0 });
    });

    it("sem log no período: último registro nulo", () => {
        const s = m("custo_sem_log").saude_log;
        expect(s).toMatchObject({ ultimo_registro: null, requisicoes: 0, falhas: 0, por_endpoint: {} });
    });

    it("exige o escopo dashboard", () => {
        expect(erro("custo_sem_escopo")).toMatch(/forbidden/);
    });
});

describe("get_ticket_metrics — tempos e backlog", () => {
    it("mantém as chaves antigas", () => {
        const k = m("tickets");
        expect(k.total).toBe(6);
        expect(k.por_status).toEqual({ resolvido: 2, aberto: 1, em_andamento: 1, aguardando_info: 2 });
        expect(Number(k.tempo_medio_horas)).toBe(36);
    });

    it("mediana e P90 da resolução", () => {
        const k = m("tickets");
        expect(Number(k.tempo_mediana_horas)).toBe(36); // [24, 48]
        expect(Number(k.tempo_p90_horas)).toBe(45.6);
    });

    it("tempo até a 1ª resposta do suporte usa a mensagem 'tech' ou o audit (conversa apagada)", () => {
        const k = m("tickets");
        // [1 (t4), 2 (t1), 3 (t5), 5 (t2, só audit)]
        expect(Number(k.primeira_resposta_mediana_horas)).toBe(2.5);
        expect(Number(k.primeira_resposta_p90_horas)).toBe(4.4);
    });

    it("não resolvidos, sem resposta e aguardando suporte", () => {
        const k = m("tickets");
        expect(k.nao_resolvidos).toBe(4);
        // t3 (aberto, sem mensagem) e t6 (aguardando info sem mensagem)
        expect(k.sem_resposta).toBe(2);
        // t3 (a abertura é a fala do aluno) e t4 (última mensagem do aluno);
        // t5/t6 estão com a vez do aluno
        expect(k.aguardando_suporte).toBe(2);
    });

    it("janela de 30 dias", () => {
        expect(m("tickets").ultimos_30d).toEqual({
            dias: 30,
            abertos: 5,
            resolvidos: 1,
            tempo_mediana_horas: 24,
            tempo_p90_horas: 24,
            primeira_resposta_mediana_horas: 2, // t1 2h, t4 1h, t5 3h
        });
    });

    it("sem tickets: tudo zero", () => {
        expect(m("tickets_vazio")).toMatchObject({
            total: 0, nao_resolvidos: 0, sem_resposta: 0, aguardando_suporte: 0,
            tempo_mediana_horas: 0, primeira_resposta_mediana_horas: 0,
            ultimos_30d: { abertos: 0, resolvidos: 0 },
        });
    });

    it("exige o escopo dashboard", () => {
        expect(erro("tickets_sem_escopo")).toMatch(/forbidden/);
    });
});

describe("contrato das RPCs", () => {
    it("mesma assinatura, SECURITY DEFINER com search_path", () => {
        expect(linhas("assinaturas")).toEqual([
            { proname: "get_ai_cost_metrics", args: "p_days integer", definer: true, config: "{search_path=public}" },
            { proname: "get_ticket_metrics", args: "", definer: true, config: "{search_path=public}" },
        ]);
    });

    it("o cabeçalho documenta a dependência de ticket_chat.sql e o gasto real no teto", () => {
        const cabecalho = lerMigration("20260929b_dashboard_rastreabilidade.sql").split(/^BEGIN;$/m)[0];
        expect(cabecalho).toMatch(/ticket_chat\.sql/);
        expect(cabecalho).toMatch(/ticket_messages/);
        expect(cabecalho).toMatch(/ticket_audit_log/);
        expect(cabecalho).toMatch(/sub-execuções/);
        expect(cabecalho).toMatch(/AI_TETO_DIARIO_RS/);
    });

    it("a migration é idempotente e transacional", () => {
        const sql = lerMigration("20260929b_dashboard_rastreabilidade.sql");
        expect(sql).toMatch(/^BEGIN;$/m);
        expect(sql).toMatch(/^COMMIT;$/m);
        expect(sql).toMatch(/REVERSÃO/);
        expect(sql).not.toMatch(/CREATE FUNCTION(?! IF)/);
        expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
    });
});
