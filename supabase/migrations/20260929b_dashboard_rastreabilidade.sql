-- Dashboard admin: rastreabilidade do custo de IA e métricas de suporte
-- (29/09/2026). Aplicar manualmente no SQL Editor do Supabase DEPOIS de:
--   * 20260929_darcy_cota.sql (usa ai_usage_log.pergunta_id e
--     darcy_custo_ia_hoje);
--   * ticket_chat.sql (get_ticket_metrics lê public.ticket_messages e a ação
--     'message_added' de public.ticket_audit_log — sem ela a função falha
--     ao ser chamada).
-- Idempotente: pode ser reaplicada.
--
-- Custo = gasto real. O ai_usage_log agora recebe também o usage das
-- sub-execuções do orquestrador (somado na linha do chat-send) e o que o
-- modelo cobrou em chamadas que falharam (success=false, pergunta estornada).
-- Por isso darcy_custo_ia_hoje — e o teto global AI_TETO_DIARIO_RS, que é
-- comparado com ela — passam a contar esse gasto: o teto pode ser atingido
-- antes do que a contagem de perguntas respondidas sugere.
--
-- Mesmas assinaturas e mesmas chaves de antes; só chaves NOVAS no jsonb
-- (o front antigo continua funcionando):
--
--   get_ai_cost_metrics(p_days)
--     * total_perguntas, por_dia.perguntas e por_endpoint.perguntas contam só
--       perguntas respondidas: a pergunta cuja linha da rota paga
--       (assistente-chat, planejamento-chat, chat-send, analyze,
--       analyze-sabia, analyze-sabia-stream) tem success=false foi estornada
--       e sai da contagem — linhas de ferramenta (embeddings, dificuldade)
--       não decidem. O custo e as requisições continuam com tudo.
--     * perguntas_com_falha: as perguntas que ficaram de fora acima. Inclui
--       o stream em que o aluno saiu depois de o modelo ser chamado (a
--       pergunta é gasta, mas o log não distingue: success=false).
--     * modelos_sem_preco: modelos presentes no log sem linha em ai_pricing
--       ('sem_cadastro') ou com input e output = 0 ('preco_zero'). O custo
--       deles entra como 0 no total — o dashboard mostra ALERTA em vez de um
--       R$ 0 silencioso. por_modelo.<m>.sem_preco marca o mesmo.
--     * tokens_medios_por_pergunta: média de tokens por pergunta (soma das
--       chamadas da mesma pergunta), só perguntas com tokens > 0.
--     * tokens_medios_por_req passa a ignorar linhas com 0 tokens (falhas e
--       chamadas sem `usage`, que puxavam a média para baixo).
--     * saude_log: último registro e taxa de success=false no período, geral
--       e por endpoint (o alerta "nenhuma linha em N horas" é do front).
--
--   get_ticket_metrics()
--     * nao_resolvidos: o que o card "Tickets abertos" conta (status <>
--       'resolvido': aberto, em andamento e aguardando info).
--     * tempo_mediana_horas / tempo_p90_horas: resolução (histórico todo).
--     * primeira_resposta_mediana_horas / primeira_resposta_p90_horas: da
--       abertura à 1ª mensagem do suporte (ticket_messages.author_role =
--       'tech', ou o audit 'message_added' — sobrevive à retenção de 6 meses
--       das conversas resolvidas).
--     * sem_resposta: não resolvidos sem nenhuma resposta do suporte.
--     * aguardando_suporte: não resolvidos cuja última mensagem é do usuário
--       (ou sem mensagem nenhuma: a abertura é a fala do usuário; exceto
--       'aguardando_info', em que o suporte já devolveu a vez ao usuário).
--     * ultimos_30d: abertos, resolvidos e os mesmos tempos na janela.
--
-- Nenhum dado pessoal novo: só contagens e tempos.
--
-- REVERSÃO (rodar numa transação):
--   -- get_ai_cost_metrics: reaplicar a seção 8 de 20260929_darcy_cota.sql
--   -- get_ticket_metrics: reaplicar a versão de latest_init_from_export.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Custo de IA
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ai_cost_metrics(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_moeda          text;
  v_total_req      bigint;
  v_total_tokens   bigint;
  v_custo_total    numeric;
  v_por_modelo     jsonb;
  v_por_dia        jsonb;
  v_por_endpoint   jsonb;
  v_perguntas      bigint;
  v_perguntas_falha bigint;
  v_sem_tokens     bigint;
  v_sem_preco      boolean;
  v_medio_req      numeric;
  v_medio_pergunta numeric;
  v_modelos_sem_preco jsonb;
  v_saude          jsonb;
BEGIN
  IF NOT public.has_admin_scope('dashboard') THEN
    RAISE EXCEPTION 'forbidden: dashboard scope required';
  END IF;

  SELECT COALESCE(max(currency), 'BRL') INTO v_moeda FROM public.ai_pricing;

  WITH r0 AS (
    SELECT l.endpoint, COALESCE(l.model, 'desconhecido') AS model, l.total_tokens,
           l.created_at, l.success,
           CASE
             WHEN l.pergunta_id IS NOT NULL THEN l.pergunta_id::text
             WHEN l.endpoint IN ('assistente-chat', 'planejamento-chat', 'chat-send',
                                 'analyze-sabia', 'analyze-sabia-stream')
               THEN l.endpoint || '|' || l.created_at::text
           END AS pergunta,  -- NULL = não é pergunta (count DISTINCT ignora)
           CASE
             WHEN p.model IS NULL THEN 'sem_cadastro'
             WHEN p.input_per_1k = 0 AND p.output_per_1k = 0 THEN 'preco_zero'
           END AS sem_preco,
           (l.prompt_tokens / 1000.0) * COALESCE(p.input_per_1k, 0)
         + (l.completion_tokens / 1000.0) * COALESCE(p.output_per_1k, 0) AS custo
      FROM public.ai_usage_log l
      LEFT JOIN public.ai_pricing p ON p.model = l.model
     WHERE l.created_at >= now() - (p_days || ' days')::interval
  ), r AS (
    -- Pergunta estornada: a linha da rota paga falhou. As chamadas dela
    -- continuam no custo, mas não na contagem de perguntas.
    SELECT r0.*,
           COALESCE(bool_or(NOT r0.success) FILTER (
             WHERE r0.endpoint IN ('assistente-chat', 'planejamento-chat', 'chat-send', 'analyze',
                                   'analyze-sabia', 'analyze-sabia-stream')
           ) OVER (PARTITION BY r0.pergunta), false) AS pergunta_falhou
      FROM r0
  ), rq AS (
    SELECT r.*,
           CASE WHEN NOT pergunta_falhou THEN pergunta END AS pergunta_ok,
           CASE WHEN pergunta_falhou THEN pergunta END AS pergunta_falha
      FROM r
  )
  SELECT
    (SELECT count(*) FROM r),
    (SELECT COALESCE(sum(total_tokens), 0) FROM r),
    (SELECT COALESCE(round(sum(custo)::numeric, 4), 0) FROM r),
    (SELECT COALESCE(jsonb_object_agg(model, jsonb_build_object(
              'requisicoes', req, 'tokens', tok, 'custo', round(custo::numeric, 4),
              'sem_preco', sp
            )), '{}'::jsonb)
       FROM (SELECT model, count(*) AS req, sum(total_tokens) AS tok, sum(custo) AS custo,
                    bool_or(sem_preco IS NOT NULL) AS sp
               FROM r GROUP BY model) m),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'dia', d, 'custo', c, 'requisicoes', q_req, 'perguntas', q) ORDER BY d), '[]'::jsonb)
       FROM (SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d,
                    round(sum(custo)::numeric, 4) AS c,
                    count(*) AS q_req,
                    count(DISTINCT pergunta_ok) AS q
               FROM rq GROUP BY 1) s),
    (SELECT COALESCE(jsonb_object_agg(ep, jsonb_build_object(
              'requisicoes', q_req, 'perguntas', q, 'custo', round(c::numeric, 4))), '{}'::jsonb)
       FROM (SELECT COALESCE(endpoint, 'desconhecido') AS ep, count(*) AS q_req, sum(custo) AS c,
                    count(DISTINCT pergunta_ok) AS q
               FROM rq GROUP BY 1) e),
    (SELECT count(DISTINCT pergunta_ok) FROM rq),
    (SELECT count(DISTINCT pergunta_falha) FROM rq),
    (SELECT count(*) FROM r WHERE total_tokens = 0),
    (SELECT round(avg(total_tokens)::numeric, 0) FROM r WHERE total_tokens > 0),
    (SELECT round(avg(t)::numeric, 0)
       FROM (SELECT sum(total_tokens) AS t FROM r
              WHERE pergunta IS NOT NULL GROUP BY pergunta) pq
      WHERE t > 0),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'model', model, 'motivo', motivo, 'requisicoes', req, 'tokens', tok)
              ORDER BY tok DESC, model), '[]'::jsonb)
       FROM (SELECT model, min(sem_preco) AS motivo, count(*) AS req,
                    COALESCE(sum(total_tokens), 0) AS tok
               FROM r WHERE sem_preco IS NOT NULL GROUP BY model) sp),
    (SELECT jsonb_build_object(
              'ultimo_registro', (SELECT max(created_at) FROM r),
              'requisicoes',     (SELECT count(*) FROM r),
              'falhas',          (SELECT count(*) FROM r WHERE NOT success),
              'taxa_falha',      (SELECT CASE WHEN count(*) > 0
                                   THEN round(100.0 * count(*) FILTER (WHERE NOT success) / count(*), 1)
                                   ELSE 0 END FROM r),
              'por_endpoint',    COALESCE((
                SELECT jsonb_object_agg(ep, jsonb_build_object(
                         'ultimo_registro', ult, 'requisicoes', q, 'falhas', f,
                         'taxa_falha', round(100.0 * f / q, 1)))
                  FROM (SELECT COALESCE(endpoint, 'desconhecido') AS ep, max(created_at) AS ult,
                               count(*) AS q, count(*) FILTER (WHERE NOT success) AS f
                          FROM r GROUP BY 1) h), '{}'::jsonb)))
  INTO v_total_req, v_total_tokens, v_custo_total, v_por_modelo, v_por_dia,
       v_por_endpoint, v_perguntas, v_perguntas_falha, v_sem_tokens, v_medio_req, v_medio_pergunta,
       v_modelos_sem_preco, v_saude;

  SELECT bool_or(input_per_1k = 0 AND output_per_1k = 0) INTO v_sem_preco
    FROM public.ai_pricing;

  RETURN jsonb_build_object(
    'moeda',                 v_moeda,
    'total_requisicoes',     COALESCE(v_total_req, 0),
    'total_perguntas',       COALESCE(v_perguntas, 0),
    'perguntas_com_falha',   COALESCE(v_perguntas_falha, 0),
    'total_tokens',          COALESCE(v_total_tokens, 0),
    'custo_total',           COALESCE(v_custo_total, 0),
    'custo_hoje',            public.darcy_custo_ia_hoje(),
    'tokens_medios_por_req', COALESCE(v_medio_req, 0),
    'tokens_medios_por_pergunta', COALESCE(v_medio_pergunta, 0),
    'requisicoes_sem_tokens', COALESCE(v_sem_tokens, 0),
    'por_modelo',            COALESCE(v_por_modelo, '{}'::jsonb),
    'por_endpoint',          COALESCE(v_por_endpoint, '{}'::jsonb),
    'por_dia',               COALESCE(v_por_dia, '[]'::jsonb),
    'precos_nao_configurados', COALESCE(v_sem_preco, true),
    'modelos_sem_preco',     COALESCE(v_modelos_sem_preco, '[]'::jsonb),
    'saude_log',             v_saude
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Suporte
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ticket_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_by_status   jsonb;
  v_by_category jsonb;
  v_avg_horas   numeric;
  v_total       bigint;
  v_extra       jsonb;
BEGIN
  IF NOT public.has_admin_scope('dashboard') THEN
    RAISE EXCEPTION 'forbidden: dashboard scope required';
  END IF;

  SELECT count(*) INTO v_total FROM public.tickets;

  SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) INTO v_by_status
  FROM (SELECT status, count(*) n FROM public.tickets GROUP BY status) s;

  SELECT COALESCE(jsonb_object_agg(category, n), '{}'::jsonb) INTO v_by_category
  FROM (SELECT category, count(*) n FROM public.tickets GROUP BY category) c;

  SELECT round(avg(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)::numeric, 1)
    INTO v_avg_horas
  FROM public.tickets
  WHERE status = 'resolvido' AND resolved_at IS NOT NULL;

  WITH t AS (
    SELECT tk.id, tk.status, tk.created_at,
           CASE WHEN tk.status = 'resolvido' AND tk.resolved_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (tk.resolved_at - tk.created_at)) / 3600.0 END AS h_resolucao,
           tk.resolved_at,
           -- 1ª resposta do suporte: a mensagem, ou o registro no audit log
           -- (LEAST ignora NULL; a conversa pode ter sido apagada pela retenção)
           LEAST(
             (SELECT min(m.created_at) FROM public.ticket_messages m
               WHERE m.ticket_id = tk.id AND m.author_role = 'tech'),
             (SELECT min(a.created_at) FROM public.ticket_audit_log a
               WHERE a.ticket_id = tk.id AND a.action = 'message_added')
           ) AS primeira_resposta,
           (SELECT m.author_role FROM public.ticket_messages m
             WHERE m.ticket_id = tk.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS ultima_fala
      FROM public.tickets tk
  ), tr AS (
    SELECT t.*,
           EXTRACT(EPOCH FROM (t.primeira_resposta - t.created_at)) / 3600.0 AS h_resposta
      FROM t
  )
  SELECT jsonb_build_object(
    'nao_resolvidos',   (SELECT count(*) FROM tr WHERE status <> 'resolvido'),
    'tempo_mediana_horas', COALESCE((SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h_resolucao)::numeric, 1)
                                      FROM tr WHERE h_resolucao IS NOT NULL), 0),
    'tempo_p90_horas',  COALESCE((SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY h_resolucao)::numeric, 1)
                                   FROM tr WHERE h_resolucao IS NOT NULL), 0),
    'primeira_resposta_mediana_horas', COALESCE((SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h_resposta)::numeric, 1)
                                                  FROM tr WHERE h_resposta IS NOT NULL), 0),
    'primeira_resposta_p90_horas', COALESCE((SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY h_resposta)::numeric, 1)
                                              FROM tr WHERE h_resposta IS NOT NULL), 0),
    'sem_resposta',     (SELECT count(*) FROM tr WHERE status <> 'resolvido' AND primeira_resposta IS NULL),
    'aguardando_suporte', (SELECT count(*) FROM tr
                            WHERE status <> 'resolvido'
                              AND (ultima_fala = 'user'
                                   OR (ultima_fala IS NULL AND status <> 'aguardando_info'))),
    'ultimos_30d', jsonb_build_object(
      'dias',      30,
      'abertos',   (SELECT count(*) FROM tr WHERE created_at >= now() - interval '30 days'),
      'resolvidos', (SELECT count(*) FROM tr WHERE resolved_at >= now() - interval '30 days'
                                               AND status = 'resolvido'),
      'tempo_mediana_horas', COALESCE((SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h_resolucao)::numeric, 1)
                                        FROM tr WHERE h_resolucao IS NOT NULL
                                          AND resolved_at >= now() - interval '30 days'), 0),
      'tempo_p90_horas', COALESCE((SELECT round(percentile_cont(0.9) WITHIN GROUP (ORDER BY h_resolucao)::numeric, 1)
                                    FROM tr WHERE h_resolucao IS NOT NULL
                                      AND resolved_at >= now() - interval '30 days'), 0),
      'primeira_resposta_mediana_horas', COALESCE((SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h_resposta)::numeric, 1)
                                                    FROM tr WHERE h_resposta IS NOT NULL
                                                      AND created_at >= now() - interval '30 days'), 0)
    )
  ) INTO v_extra;

  RETURN jsonb_build_object(
    'total',            v_total,
    'por_status',       v_by_status,
    'por_categoria',    v_by_category,
    'tempo_medio_horas', COALESCE(v_avg_horas, 0)
  ) || v_extra;
END;
$function$;

COMMIT;
