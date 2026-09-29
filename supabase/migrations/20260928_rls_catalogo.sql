-- RLS nas tabelas de catálogo que ainda estavam abertas — pré-mortem de 27/09/2026, R11.
-- Aplicar manualmente no SQL Editor do Supabase (idempotente).
--
-- No export de 2026-07-16, matrizes e materias_vetorizadas são as únicas tabelas do
-- schema public sem RLS. Com os grants padrão do Supabase, qualquer um com a anon key
-- (que vai no bundle do front) consegue INSERT/UPDATE/DELETE em matrizes, o catálogo que
-- resolve o curso no upload e dá o ch_*_exigida da integralização.
--
-- A leitura continua como está hoje: policy de SELECT para anon e authenticated
-- (o front lê matrizes com as duas chaves). Escrita passa a ser só service_role, que
-- ignora RLS: DBA/database (config.py recusa chave publishable) e mcp_agent/jobs já usam
-- SUPABASE_SERVICE_ROLE_KEY. match_materias é SECURITY INVOKER, então a busca semântica
-- continua lendo materias_vetorizadas pela policy de SELECT.
--
-- dados_users_teste: fora do export de julho (provavelmente já apagada). Se ainda
-- existir, só perde os grants de anon/authenticated; apagar a tabela é decisão de quem
-- administra o banco, não desta migration.
--
-- Reverter:
--   BEGIN;
--   DROP POLICY IF EXISTS matrizes_select_public ON public.matrizes;
--   ALTER TABLE public.matrizes DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS materias_vetorizadas_select_public ON public.materias_vetorizadas;
--   ALTER TABLE public.materias_vetorizadas DISABLE ROW LEVEL SECURITY;
--   -- turmas_historico: não reverter (já estava com RLS em produção).
--   -- dados_users_teste (se existir): GRANT ALL ON public.dados_users_teste TO anon, authenticated;
--   COMMIT;
--
-- Teste: backend/tests-ts/db/catalogo.pglite.test.ts

BEGIN;

ALTER TABLE public.matrizes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matrizes_select_public ON public.matrizes;
CREATE POLICY matrizes_select_public ON public.matrizes
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.materias_vetorizadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS materias_vetorizadas_select_public ON public.materias_vetorizadas;
CREATE POLICY materias_vetorizadas_select_public ON public.materias_vetorizadas
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

-- turmas_historico já tem RLS em produção (rls_enabled_tables de
-- backend/docs/database_schema.json), mas o baseline SQL gerado perdeu o ENABLE. Em
-- produção é no-op; num banco montado do baseline, fecha a tabela como lá. Sem policy:
-- só service_role e o trigger registrar_turma_historico (SECURITY DEFINER) escrevem.
ALTER TABLE public.turmas_historico ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.dados_users_teste') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.dados_users_teste FROM anon, authenticated';
  END IF;
END
$$;

COMMIT;
