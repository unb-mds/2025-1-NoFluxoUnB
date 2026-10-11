-- vw_creditos_por_matriz passa a expor id_curso — pré-mortem de 27/09/2026, R64.
-- Aplicar manualmente no SQL Editor do Supabase (idempotente: CREATE OR REPLACE).
--
-- O front (fluxograma.service.ts getAllCursos e supabase-data.service.ts
-- getCursosComCreditos) lê row.id_curso da view, que só projetava id_matriz: todas as
-- linhas viravam NaN e eram descartadas, e a tela de cursos mostrava créditos nulos
-- (Engenharia de Software sem os 206 créditos).
--
-- id_curso entra no FIM da lista: CREATE OR REPLACE VIEW só aceita colunas novas depois
-- das existentes, e assim a view não é recriada (grants e security_invoker ficam).
--
-- Reverter: rodar de novo o CREATE OR REPLACE VIEW public."vw_creditos_por_matriz" de
-- supabase/migrations/latest_init_from_export.sql NÃO basta (não remove coluna); use
--   BEGIN;
--   DROP VIEW public.vw_creditos_por_matriz;
--   <o CREATE OR REPLACE VIEW de latest_init_from_export.sql, linhas 295-308>
--   GRANT SELECT ON public.vw_creditos_por_matriz TO anon, authenticated;
--   COMMIT;
--
-- Teste: backend/tests-ts/db/catalogo.pglite.test.ts

BEGIN;

CREATE OR REPLACE VIEW public."vw_creditos_por_matriz" WITH (security_invoker = true) AS SELECT m.id_matriz,
    m.curriculo_completo,
    c.nome_curso,
    floor(((m.ch_obrigatoria_exigida)::numeric / 15.0)) AS cred_obrigatorio_exigido,
    floor(((m.ch_optativa_exigida)::numeric / 15.0)) AS cred_optativo_exigido,
    floor(((m.ch_complementar_exigida)::numeric / 15.0)) AS cred_complementar_exigido,
    floor(((m.ch_total_exigida)::numeric / 15.0)) AS cred_total_exigido,
    floor(((COALESCE(sum(mat.carga_horaria) FILTER (WHERE (mpc.nivel > 0)), (0)::bigint))::numeric / 15.0)) AS cred_obrigatorio_grade,
    floor(((COALESCE(sum(mat.carga_horaria) FILTER (WHERE (mpc.nivel = 0)), (0)::bigint))::numeric / 15.0)) AS cred_optativo_grade,
    m.id_curso
   FROM (((matrizes m
     JOIN cursos c ON ((c.id_curso = m.id_curso)))
     LEFT JOIN materias_por_curso mpc ON ((mpc.id_matriz = m.id_matriz)))
     LEFT JOIN materias mat ON ((mat.id_materia = mpc.id_materia)))
  GROUP BY m.id_matriz, m.id_curso, m.curriculo_completo, c.nome_curso;

COMMIT;
