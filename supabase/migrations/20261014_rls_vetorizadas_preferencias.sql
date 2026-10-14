-- RLS nas duas tabelas do schema public que ainda estavam abertas depois de
-- 20260928_rls_catalogo.sql — auditoria de segurança de 14/10/2026.
-- Aplicar manualmente no SQL Editor do Supabase (idempotente).
-- Pré-requisito: preferencias_grade.sql já aplicada (a tabela precisa existir).
--
-- Com os grants padrão do Supabase, qualquer um com a anon key (que vai no bundle do
-- front) conseguia INSERT/UPDATE/DELETE nas duas tabelas pelo PostgREST, sem login.
--
-- materias_vetorizadas (corpus que o Darcy/Sabiá recupera via match_materias): era o
-- PENDENTE da migration anterior. Quem escreve nela são os jobs de mcp_agent/jobs/,
-- que agora exigem SUPABASE_SERVICE_ROLE_KEY e recusam sb_publishable_ (mesma regra
-- de DBA/database/config.py), então a carga não depende mais da chave anon. Leitura
-- continua aberta para anon/authenticated, como em matrizes; api_producao.py e o
-- backend leem com service_role, que ignora RLS.
--
-- preferencias_grade (turno/professor preferido por aluno, id_user sequencial): só o
-- backend lê e escreve, com service_role (PlanejamentoController). Sem policy nenhuma
-- e sem grants para anon/authenticated: pelo PostgREST a tabela deixa de existir para
-- quem tem só a anon key, que hoje podia listar e sobrescrever a preferência de
-- qualquer id_user.
--
-- Reverter:
--   BEGIN;
--   DROP POLICY IF EXISTS materias_vetorizadas_select_public ON public.materias_vetorizadas;
--   ALTER TABLE public.materias_vetorizadas DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.preferencias_grade DISABLE ROW LEVEL SECURITY;
--   GRANT ALL ON TABLE public.preferencias_grade TO anon, authenticated;
--   COMMIT;
--
-- Teste: backend/tests-ts/db/rls-vetorizadas-preferencias.pglite.test.ts

BEGIN;

ALTER TABLE public.materias_vetorizadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS materias_vetorizadas_select_public ON public.materias_vetorizadas;
CREATE POLICY materias_vetorizadas_select_public ON public.materias_vetorizadas
  AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.preferencias_grade ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.preferencias_grade FROM anon, authenticated;

COMMIT;
