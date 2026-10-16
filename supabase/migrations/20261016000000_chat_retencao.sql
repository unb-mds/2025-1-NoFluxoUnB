-- Retenção do chat da Darcy (chat_sessions / chat_conversas / chat_items).
--
-- Até aqui nada do chat expirava: a conversa só sumia se o aluno apagasse. Conversa
-- antiga sobre a grade de um semestre que já passou não tem mais finalidade (LGPD,
-- minimização) e é só mais dado exposto num incidente. O contexto do aluno não se
-- perde: ele vive na memória resumida (chat_sessions.memoria), que fica.
--
-- Regras (parâmetros de public.limpar_chat_antigo):
--   * conversa arquivada sem atividade há 12 meses: apagada (itens vão por cascade);
--   * itens da conversa ativa com mais de 12 meses: apagados (a conversa fica);
--   * sessão sem atividade há 2 anos: apagada inteira, memória inclusive. O backend
--     recria a sessão vazia se o aluno voltar (SupabaseSession.getSessionId).
-- ticket_chat (suporte) tem retenção própria em ticket_chat.sql.
--
-- Os itens de um turno são gravados num só insert com o mesmo created_at, então o
-- corte por data nunca separa uma tool call do resultado dela.
--
-- Aplicar manualmente no SQL Editor. Idempotente: pode rodar de novo.
-- Rodar à mão (ex.: para conferir): SELECT public.limpar_chat_antigo();
-- Histórico das execuções: SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'chat_retencao') ORDER BY start_time DESC;

CREATE OR REPLACE FUNCTION public.limpar_chat_antigo(
  p_conversas interval DEFAULT interval '12 months',
  p_sessao_inativa interval DEFAULT interval '24 months',
  p_lote int DEFAULT 5000
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sessoes int := 0;
  v_conversas int := 0;
  v_itens int := 0;
  v_n int;
BEGIN
  -- 1. Sessões abandonadas: tudo do aluno sai junto (conversas e itens por cascade).
  DELETE FROM chat_sessions
   WHERE coalesce(updated_at, created_at) < now() - p_sessao_inativa;
  GET DIAGNOSTICS v_sessoes = ROW_COUNT;

  -- 2. Conversas arquivadas paradas. Em lotes: cada uma leva os itens por cascade.
  LOOP
    DELETE FROM chat_conversas
     WHERE id IN (
       SELECT id FROM chat_conversas
        WHERE coalesce(fim, created_at) < now() - p_conversas
        LIMIT p_lote
     );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_conversas := v_conversas + v_n;
    EXIT WHEN v_n < p_lote;
  END LOOP;

  -- 3. Itens antigos da conversa ativa (conversa_id nulo).
  LOOP
    DELETE FROM chat_items
     WHERE id IN (
       SELECT id FROM chat_items
        WHERE conversa_id IS NULL
          AND created_at < now() - p_conversas
        LIMIT p_lote
     );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_itens := v_itens + v_n;
    EXIT WHEN v_n < p_lote;
  END LOOP;

  RETURN jsonb_build_object(
    'sessoes_apagadas', v_sessoes,
    'conversas_apagadas', v_conversas,
    'itens_ativos_apagados', v_itens
  );
END;
$function$;

-- Só o banco (pg_cron) e a service role chamam; nenhum cliente apaga o chat de outros.
REVOKE EXECUTE ON FUNCTION public.limpar_chat_antigo(interval, interval, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.limpar_chat_antigo(interval, interval, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.limpar_chat_antigo(interval, interval, int) FROM authenticated;

-- Agendamento: diário às 03:30 UTC. Mesmo padrão de ticket_chat.sql — só agenda com
-- pg_cron instalado, e cron.schedule com nome existente sobrescreve (idempotente).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'chat_retencao',
      '30 3 * * *',
      $job$ SELECT public.limpar_chat_antigo(); $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron não instalado — habilite em Dashboard → Database → Extensions e reaplique esta migration para agendar a retenção do chat.';
  END IF;
END;
$cron$;
