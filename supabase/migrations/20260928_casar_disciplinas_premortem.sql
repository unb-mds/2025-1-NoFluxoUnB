-- casar_disciplinas — correções do pré-mortem de 27/09/2026 (tema "rpc-casar-disciplinas").
-- Aplicar manualmente no SQL Editor do Supabase (idempotente: CREATE OR REPLACE).
--
-- Parte da versão exportada em latest_init_from_export.sql (export de 2026-07-16),
-- que continua sendo o baseline gerado e NÃO foi editado. O que muda:
--   R5  resolução de matriz: o código do currículo ("8117/-2") filtra os candidatos
--       por id_curso antes da versão; empate de versão vira COURSE_SELECTION em vez
--       de LIMIT 1 sem ORDER BY (PEDAGOGIA diurno x noturno, ENGENHARIA x ENG. SOFTWARE).
--
-- Reverter: rodar de novo, no SQL Editor, o bloco
--   CREATE OR REPLACE FUNCTION public.casar_disciplinas(p_dados jsonb) ... $function$;
-- de supabase/migrations/latest_init_from_export.sql (linhas 488-1246).
--
-- Testes: backend/tests-ts/db/casar-disciplinas.pglite.test.ts (PGlite, aplica o
-- baseline + este arquivo e roda cada cenário numa transação com ROLLBACK).

BEGIN;

CREATE OR REPLACE FUNCTION public.casar_disciplinas(p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Input
  v_extracted_data    jsonb;
  v_curso_extraido    text;
  v_matriz_curricular text;
  v_media_ponderada   numeric;
  v_frequencia_geral  numeric;
  v_id_curso_sel      bigint;
  v_curso_sel         text;

  -- Course resolution
  v_id_curso          bigint;
  v_nome_curso        text;
  v_id_matriz         bigint;
  v_curriculo         text;
  v_count             int;
  v_search_name       text;
  v_cod_matriz        text;   -- código do currículo ("8117" em "8117/-2") = cursos.id_curso
  v_count_versao      int;

  -- Discipline loop
  v_i                 int;
  v_len               int;
  v_item              jsonb;
  v_disc_codigo       text;
  v_disc_nome         text;
  v_disc_status       text;
  v_match_id          bigint;
  v_match_codigo      text;
  v_match_nome        text;
  v_match_nivel       int;
  v_match_tipo_natureza int;  -- 0=obrigatória, 1=optativa (prioridade sobre nivel)
  v_old_status        text;

  -- Aggregation
  v_ira               numeric;
  v_pendencias        jsonb := '[]'::jsonb;
  v_horas             int := 0;

  -- Result builders
  v_cursos_disp       jsonb;
  v_disc_casadas      jsonb;
  v_mat_concluidas    jsonb;
  v_mat_pendentes     jsonb;
  v_mat_optativas     jsonb;
  v_resumo            jsonb;
  v_total_concl       int;
  v_total_pend        int;
  v_total_obrig       int;
  v_total_opt         int;
  v_percentual        numeric;
BEGIN
  -- ═══════════════════════════════════════════════════════════════
  -- 1. PARSE INPUT
  -- ═══════════════════════════════════════════════════════════════
  v_extracted_data    := p_dados->'extracted_data';
  v_curso_extraido    := p_dados->>'curso_extraido';
  v_matriz_curricular := trim(coalesce(p_dados->>'matriz_curricular', ''));
  v_media_ponderada   := (p_dados->>'media_ponderada')::numeric;
  v_frequencia_geral  := (p_dados->>'frequencia_geral')::numeric;
  v_id_curso_sel      := (p_dados->>'id_curso_selecionado')::bigint;
  v_curso_sel         := p_dados->>'curso_selecionado';

  IF v_extracted_data IS NULL
     OR jsonb_array_length(coalesce(v_extracted_data, '[]'::jsonb)) = 0
  THEN
    RETURN jsonb_build_object('error', 'Dados extraídos são obrigatórios');
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. RESOLVE COURSE AND MATRIX
  --    (cursos_disponiveis is built lazily only when needed)
  -- ═══════════════════════════════════════════════════════════════
  IF v_curso_extraido IS NULL OR v_curso_extraido = '' THEN
    -- Build cursos_disponiveis only for this error path
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'id_curso', m.id_curso,
        'nome_curso', coalesce(c.nome_curso, ''),
        'matriz_curricular', coalesce(m.curriculo_completo, '')
      ) ORDER BY m.curriculo_completo
    ), '[]'::jsonb)
    INTO v_cursos_disp
    FROM matrizes m
    LEFT JOIN cursos c ON c.id_curso = m.id_curso;

    RETURN jsonb_build_object(
      'error', 'Curso não foi extraído do PDF automaticamente',
      'message', 'Por favor, selecione o curso manualmente',
      'cursos_disponiveis', v_cursos_disp
    );
  END IF;

  CREATE TEMP TABLE _cand (
    id_curso bigint, nome_curso text, id_matriz bigint, curriculo text
  ) ON COMMIT DROP;

  -- 2a. Keyword search (PALAVRAS_CHAVE:word1,word2,...)
  IF v_curso_extraido LIKE 'PALAVRAS_CHAVE:%' THEN
    INSERT INTO _cand
    SELECT DISTINCT c.id_curso, c.nome_curso, m.id_matriz, m.curriculo_completo
    FROM cursos c
    JOIN matrizes m ON m.id_curso = c.id_curso
    WHERE EXISTS (
      SELECT 1
      FROM unnest(string_to_array(substring(v_curso_extraido FROM 16), ',')) kw
      WHERE upper(c.nome_curso) LIKE '%' || upper(trim(kw)) || '%'
    );

    SELECT count(DISTINCT id_curso) INTO v_count FROM _cand;
    IF v_count = 0 THEN
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('id_curso', m.id_curso, 'nome_curso', coalesce(c.nome_curso, ''),
          'matriz_curricular', coalesce(m.curriculo_completo, ''))
        ORDER BY m.curriculo_completo
      ), '[]'::jsonb)
      INTO v_cursos_disp FROM matrizes m LEFT JOIN cursos c ON c.id_curso = m.id_curso;
      RETURN jsonb_build_object(
        'error', 'Nenhum curso encontrado com as palavras-chave',
        'cursos_disponiveis', v_cursos_disp
      );
    ELSIF v_count > 1 THEN
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id_curso', id_curso, 'nome_curso', nome_curso,
        'matriz_curricular', curriculo
      ))
      INTO v_cursos_disp FROM _cand;
      RETURN jsonb_build_object(
        'error', 'Múltiplos cursos encontrados',
        'message', 'Por favor, selecione o curso correto',
        'cursos_disponiveis', v_cursos_disp
      );
    END IF;

  -- 2b. Standard: by selected id, then by name
  ELSE
    IF v_id_curso_sel IS NOT NULL THEN
      INSERT INTO _cand
      SELECT c.id_curso, c.nome_curso, m.id_matriz, m.curriculo_completo
      FROM cursos c
      JOIN matrizes m ON m.id_curso = c.id_curso
      WHERE c.id_curso = v_id_curso_sel;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM _cand) THEN
      v_search_name := coalesce(v_curso_sel, v_curso_extraido);
      INSERT INTO _cand
      SELECT c.id_curso, c.nome_curso, m.id_matriz, m.curriculo_completo
      FROM cursos c
      JOIN matrizes m ON m.id_curso = c.id_curso
      WHERE upper(c.nome_curso) LIKE '%' || upper(v_search_name) || '%';
    END IF;

    -- Fallback: parse matrix as "codigo/versao"
    -- id_curso = código do currículo (ex: 8150, 8117); cada curso (diurno/noturno) tem código próprio.
    IF NOT EXISTS (SELECT 1 FROM _cand)
       AND v_matriz_curricular != ''
       AND position('/' IN v_matriz_curricular) > 0
    THEN
      <<parse_matrix>>
      DECLARE
        v_parts text[];
        v_cod   text;
        v_ver   text;
      BEGIN
        v_parts := string_to_array(v_matriz_curricular, '/');
        v_cod   := trim(v_parts[1]);
        v_ver   := trim(v_parts[2]);
        IF position(' - ' IN v_ver) > 0 THEN
          v_ver := trim(substring(v_ver FROM 1 FOR position(' - ' IN v_ver) - 1));
        END IF;
        IF v_cod ~ '^\d+$' AND v_ver != '' THEN
          INSERT INTO _cand
          SELECT c.id_curso, c.nome_curso, m.id_matriz, m.curriculo_completo
          FROM matrizes m
          JOIN cursos c ON c.id_curso = m.id_curso
          WHERE m.id_curso = v_cod::bigint
            AND m.versao = v_ver;
        END IF;
      END parse_matrix;
    END IF;
  END IF;

  -- 2c. Narrow by matrix: exact match on curriculo_completo, then versao-based
  IF v_matriz_curricular != '' THEN
    -- R5 (pré-mortem 27/09/2026): o código antes da "/" é o id_curso (DBA/database/README.md).
    -- A busca por nome traz homônimos (PEDAGOGIA diurno 8117 x noturno 8150) e nomes
    -- contidos em outros (LIKE '%ENGENHARIA%'); sem este filtro a versão "-2", comum aos
    -- dois, escolhia o curso errado. Só filtra se o código casar algum candidato.
    v_cod_matriz := trim(split_part(v_matriz_curricular, '/', 1));
    IF position('/' IN v_matriz_curricular) > 0
       AND v_cod_matriz ~ '^\d{1,15}$'
       AND EXISTS (SELECT 1 FROM _cand WHERE id_curso = v_cod_matriz::bigint)
    THEN
      DELETE FROM _cand WHERE id_curso <> v_cod_matriz::bigint;
    END IF;

    IF EXISTS (
      SELECT 1 FROM _cand
      WHERE lower(trim(curriculo)) = lower(trim(v_matriz_curricular))
    ) THEN
      DELETE FROM _cand
      WHERE lower(trim(curriculo)) != lower(trim(v_matriz_curricular));
    ELSIF position('/' IN v_matriz_curricular) > 0 THEN
      -- Parse "codigo/versao" (e.g. "6360/1") and match by versao column
      <<narrow_by_versao>>
      DECLARE
        v_nparts text[];
        v_nver   text;
      BEGIN
        v_nparts := string_to_array(v_matriz_curricular, '/');
        v_nver   := trim(v_nparts[2]);
        -- Strip trailing " - YYYY.S" if present
        IF position(' - ' IN v_nver) > 0 THEN
          v_nver := trim(substring(v_nver FROM 1 FOR position(' - ' IN v_nver) - 1));
        END IF;
        IF v_nver != '' AND EXISTS (
          SELECT 1 FROM _cand ca
          JOIN matrizes m ON m.id_matriz = ca.id_matriz
          WHERE m.versao = v_nver
        ) THEN
          DELETE FROM _cand
          WHERE id_matriz NOT IN (
            SELECT ca2.id_matriz FROM _cand ca2
            JOIN matrizes m2 ON m2.id_matriz = ca2.id_matriz
            WHERE m2.versao = v_nver
          );
        END IF;
      END narrow_by_versao;
    END IF;
  END IF;

  -- 2d. Evaluate candidates
  SELECT count(*) INTO v_count FROM _cand;

  IF v_count = 0 THEN
    SELECT coalesce(jsonb_agg(
      jsonb_build_object('id_curso', m.id_curso, 'nome_curso', coalesce(c.nome_curso, ''),
        'matriz_curricular', coalesce(m.curriculo_completo, ''))
      ORDER BY m.curriculo_completo
    ), '[]'::jsonb)
    INTO v_cursos_disp FROM matrizes m LEFT JOIN cursos c ON c.id_curso = m.id_curso;
    RETURN jsonb_build_object(
      'error', 'Curso não encontrado',
      'curso_buscado', v_curso_extraido,
      'matriz_curricular_buscada', v_matriz_curricular,
      'cursos_disponiveis', v_cursos_disp
    );
  END IF;

  IF v_count > 1 THEN
    -- Try exact matrix match
    IF v_matriz_curricular != '' THEN
      -- First try exact curriculo_completo match
      SELECT id_curso, nome_curso, id_matriz, curriculo
      INTO v_id_curso, v_nome_curso, v_id_matriz, v_curriculo
      FROM _cand
      WHERE lower(trim(curriculo)) = lower(trim(v_matriz_curricular))
      ORDER BY id_matriz
      LIMIT 1;

      -- Then try versao-based match
      IF v_id_matriz IS NULL AND position('/' IN v_matriz_curricular) > 0 THEN
        <<resolve_versao>>
        DECLARE
          v_rparts text[];
          v_rver   text;
        BEGIN
          v_rparts := string_to_array(v_matriz_curricular, '/');
          v_rver   := trim(v_rparts[2]);
          IF position(' - ' IN v_rver) > 0 THEN
            v_rver := trim(substring(v_rver FROM 1 FOR position(' - ' IN v_rver) - 1));
          END IF;
          -- R5: só resolve se a versão apontar UMA matriz. Com empate (mesma versão em
          -- cursos ou anos diferentes) o LIMIT 1 sem ORDER BY escolhia qualquer uma;
          -- agora v_id_matriz fica NULL e cai no COURSE_SELECTION abaixo.
          IF v_rver != '' THEN
            SELECT count(*) INTO v_count_versao
            FROM _cand ca
            JOIN matrizes m ON m.id_matriz = ca.id_matriz
            WHERE m.versao = v_rver;

            IF v_count_versao = 1 THEN
              SELECT ca.id_curso, ca.nome_curso, ca.id_matriz, ca.curriculo
              INTO v_id_curso, v_nome_curso, v_id_matriz, v_curriculo
              FROM _cand ca
              JOIN matrizes m ON m.id_matriz = ca.id_matriz
              WHERE m.versao = v_rver;
            END IF;
          END IF;
        END resolve_versao;
      END IF;
    END IF;

    IF v_id_matriz IS NULL THEN
      SELECT jsonb_agg(jsonb_build_object(
        'id_curso', id_curso, 'nome_curso', nome_curso,
        'matriz_curricular', curriculo
      ) ORDER BY curriculo)
      INTO v_cursos_disp FROM _cand;
      RETURN jsonb_build_object(
        'type', 'COURSE_SELECTION',
        'error', 'Mais de uma matriz curricular encontrada para este curso',
        'message', 'Selecione a matriz curricular do seu histórico',
        'cursos_disponiveis', v_cursos_disp,
        'matriz_extraida_pdf', nullif(v_matriz_curricular, '')
      );
    END IF;
  ELSE
    SELECT id_curso, nome_curso, id_matriz, curriculo
    INTO v_id_curso, v_nome_curso, v_id_matriz, v_curriculo
    FROM _cand LIMIT 1;
  END IF;

  RAISE NOTICE 'casar_disciplinas: course resolved to % (id_matriz=%)', v_nome_curso, v_id_matriz;

  -- ═══════════════════════════════════════════════════════════════
  -- 3. LOAD SUBJECTS FOR THE MATRIX
  -- ═══════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _mat (
    id_materia bigint, codigo text, nome text, nivel int, tipo_natureza int, ch int
  ) ON COMMIT DROP;

  INSERT INTO _mat
  SELECT m.id_materia, m.codigo_materia, m.nome_materia, mpc.nivel,
         coalesce(mpc.tipo_natureza, 0), m.carga_horaria
  FROM materias_por_curso mpc
  JOIN materias m ON m.id_materia = mpc.id_materia
  WHERE mpc.id_matriz = v_id_matriz;

  -- Cross-matrix subjects (same course, other matrices)
  CREATE TEMP TABLE _mat_x (
    id_materia bigint, codigo text, nome text, nivel int, tipo_natureza int
  ) ON COMMIT DROP;

  INSERT INTO _mat_x
  SELECT m.id_materia, m.codigo_materia, m.nome_materia, mpc.nivel,
         coalesce(mpc.tipo_natureza, 0)
  FROM materias_por_curso mpc
  JOIN materias m ON m.id_materia = mpc.id_materia
  JOIN matrizes mt ON mt.id_matriz = mpc.id_matriz
  WHERE mt.id_curso = v_id_curso AND mpc.id_matriz != v_id_matriz;

  RAISE NOTICE 'casar_disciplinas: loaded % subjects for matrix, % cross-matrix',
    (SELECT count(*) FROM _mat), (SELECT count(*) FROM _mat_x);

  -- ═══════════════════════════════════════════════════════════════
  -- 4. EQUIVALENCIES + PRE-COMPUTE CODE MAP
  -- ═══════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _eq (
    id_eq bigint, id_materia bigint, codigo_origem text, expressao text
  ) ON COMMIT DROP;

  INSERT INTO _eq
  SELECT e.id_equivalencia, e.id_materia, m.codigo_materia, e.expressao_original
  FROM equivalencias e
  JOIN materias m ON m.id_materia = e.id_materia
  WHERE e.id_materia IN (SELECT id_materia FROM _mat);

  -- Map: equivalent_code → target subject in our matrix
  CREATE TEMP TABLE _eq_map (
    codigo_eq text, id_materia_alvo bigint,
    codigo_alvo text, nome_alvo text, nivel_alvo int, tipo_natureza_alvo int
  ) ON COMMIT DROP;

  INSERT INTO _eq_map
  SELECT DISTINCT upper(codes.code),
         eq.id_materia, mb.codigo, mb.nome, mb.nivel, coalesce(mb.tipo_natureza, 0)
  FROM _eq eq
  CROSS JOIN LATERAL (
    SELECT m[1] AS code
    FROM regexp_matches(eq.expressao, '([A-Za-z]{2,}\d{3,})', 'g') m
  ) codes
  JOIN _mat mb ON mb.codigo = eq.codigo_origem
  WHERE eq.expressao IS NOT NULL AND eq.expressao != '';

  RAISE NOTICE 'casar_disciplinas: built eq_map with % entries', (SELECT count(*) FROM _eq_map);

  -- ═══════════════════════════════════════════════════════════════
  -- 5. MATCH DISCIPLINES
  -- ═══════════════════════════════════════════════════════════════
  CREATE TEMP TABLE _casadas (
    idx int,
    tipo_dado text, nome text, codigo text, status text, mencao text,
    creditos numeric, carga_horaria int, ano_periodo text,
    prefixo text, professor text,
    id_materia bigint, codigo_materia text, nome_materia text,
    nome_historico text, codigo_historico text,
    encontrada boolean DEFAULT false, nivel int,
    tipo text DEFAULT 'nao_encontrada'
  ) ON COMMIT DROP;

  -- Pre-scan: IRA and pendencias
  v_len := jsonb_array_length(v_extracted_data);
  FOR v_i IN 0..v_len - 1 LOOP
    v_item := v_extracted_data->v_i;
    IF (v_item->>'IRA') IS NOT NULL THEN
      v_ira := (v_item->>'valor')::numeric;
    END IF;
    IF v_item->>'tipo_dado' = 'Pendencias' THEN
      v_pendencias := coalesce(v_item->'valores', '[]'::jsonb);
    END IF;
  END LOOP;

  -- Main matching loop
  FOR v_i IN 0..v_len - 1 LOOP
    v_item := v_extracted_data->v_i;
    IF v_item->>'tipo_dado' NOT IN ('Disciplina Regular', 'Disciplina CUMP') THEN
      CONTINUE;
    END IF;

    v_disc_codigo := upper(trim(coalesce(v_item->>'codigo', '')));
    v_disc_nome   := trim(coalesce(v_item->>'nome', ''));
    v_disc_status := trim(coalesce(v_item->>'status', ''));
    v_match_id := NULL;

    -- Try 1: code match in main matrix (obrigatoria first, then optativa)
    SELECT id_materia, codigo, nome, nivel, tipo_natureza
    INTO v_match_id, v_match_codigo, v_match_nome, v_match_nivel, v_match_tipo_natureza
    FROM _mat WHERE upper(trim(codigo)) = v_disc_codigo AND (tipo_natureza IS NULL OR tipo_natureza != 1) AND nivel > 0 LIMIT 1;

    IF v_match_id IS NULL THEN
      SELECT id_materia, codigo, nome, nivel, tipo_natureza
      INTO v_match_id, v_match_codigo, v_match_nome, v_match_nivel, v_match_tipo_natureza
      FROM _mat WHERE upper(trim(codigo)) = v_disc_codigo AND tipo_natureza = 1 LIMIT 1;
    END IF;
    IF v_match_id IS NULL THEN
      SELECT id_materia, codigo, nome, nivel, tipo_natureza
      INTO v_match_id, v_match_codigo, v_match_nome, v_match_nivel, v_match_tipo_natureza
      FROM _mat WHERE upper(trim(codigo)) = v_disc_codigo AND nivel = 0 LIMIT 1;
    END IF;

    -- Try 2: name match in main matrix
    IF v_match_id IS NULL THEN
      SELECT id_materia, codigo, nome, nivel, tipo_natureza
      INTO v_match_id, v_match_codigo, v_match_nome, v_match_nivel, v_match_tipo_natureza
      FROM _mat WHERE lower(trim(nome)) = lower(v_disc_nome) AND (tipo_natureza IS NULL OR tipo_natureza != 1) AND nivel > 0 LIMIT 1;
    END IF;
    IF v_match_id IS NULL THEN
      SELECT id_materia, codigo, nome, nivel, tipo_natureza
      INTO v_match_id, v_match_codigo, v_match_nome, v_match_nivel, v_match_tipo_natureza
      FROM _mat WHERE lower(trim(nome)) = lower(v_disc_nome) AND (tipo_natureza = 1 OR nivel = 0) LIMIT 1;
    END IF;

    -- Try 3: cross-matrix match
    IF v_match_id IS NULL THEN
      SELECT id_materia, codigo, nome, nivel, tipo_natureza
      INTO v_match_id, v_match_codigo, v_match_nome, v_match_nivel, v_match_tipo_natureza
      FROM _mat_x WHERE upper(trim(codigo)) = v_disc_codigo LIMIT 1;
    END IF;
    IF v_match_id IS NULL THEN
      SELECT id_materia, codigo, nome, nivel, tipo_natureza
      INTO v_match_id, v_match_codigo, v_match_nome, v_match_nivel, v_match_tipo_natureza
      FROM _mat_x WHERE lower(trim(nome)) = lower(v_disc_nome) LIMIT 1;
    END IF;

    -- Try 4: equivalency code map
    IF v_match_id IS NULL THEN
      SELECT id_materia_alvo, codigo_alvo, nome_alvo, nivel_alvo, tipo_natureza_alvo
      INTO v_match_id, v_match_codigo, v_match_nome, v_match_nivel, v_match_tipo_natureza
      FROM _eq_map WHERE codigo_eq = v_disc_codigo LIMIT 1;
    END IF;

    -- Handle match
    IF v_match_id IS NOT NULL THEN
      -- Check for duplicate id_materia (keep higher priority status)
      SELECT status INTO v_old_status
      FROM _casadas WHERE id_materia = v_match_id;

      IF FOUND THEN
        IF (CASE WHEN upper(v_disc_status) IN ('APR','CUMP','DISP') THEN 3
                 WHEN upper(v_disc_status) = 'MATR' THEN 2 ELSE 1 END)
         > (CASE WHEN upper(v_old_status) IN ('APR','CUMP','DISP') THEN 3
                 WHEN upper(v_old_status) = 'MATR' THEN 2 ELSE 1 END)
        THEN
          UPDATE _casadas SET
            status = v_disc_status,
            mencao = v_item->>'mencao',
            carga_horaria = (v_item->>'carga_horaria')::int,
            ano_periodo = v_item->>'ano_periodo',
            professor = v_item->>'professor',
            nome_historico = v_item->>'nome',
            codigo_historico = v_item->>'codigo'
          WHERE id_materia = v_match_id;
        END IF;
        CONTINUE; -- skip insert for duplicate
      END IF;

      INSERT INTO _casadas VALUES (
        v_i, v_item->>'tipo_dado',
        coalesce(v_match_nome, v_item->>'nome'), v_match_codigo,
        v_disc_status, v_item->>'mencao',
        (v_item->>'creditos')::numeric, (v_item->>'carga_horaria')::int,
        v_item->>'ano_periodo', v_item->>'prefixo', v_item->>'professor',
        v_match_id, v_match_codigo, v_match_nome,
        v_item->>'nome', v_item->>'codigo',
        true, v_match_nivel,
        CASE WHEN v_match_tipo_natureza = 1 THEN 'optativa' WHEN v_match_nivel = 0 THEN 'optativa' ELSE 'obrigatoria' END
      );
    ELSE
      -- No match found
      INSERT INTO _casadas VALUES (
        v_i, v_item->>'tipo_dado',
        v_item->>'nome', v_item->>'codigo',
        v_disc_status, v_item->>'mencao',
        (v_item->>'creditos')::numeric, (v_item->>'carga_horaria')::int,
        v_item->>'ano_periodo', v_item->>'prefixo', v_item->>'professor',
        NULL, NULL, NULL,
        v_item->>'nome', v_item->>'codigo',
        false, NULL, 'nao_encontrada'
      );
    END IF;
  END LOOP;

  RAISE NOTICE 'casar_disciplinas: matched % disciplines (% found, % not found)',
    (SELECT count(*) FROM _casadas),
    (SELECT count(*) FROM _casadas WHERE encontrada),
    (SELECT count(*) FROM _casadas WHERE NOT encontrada);

  -- ═══════════════════════════════════════════════════════════════
  -- 6. BUILD disciplinas_casadas JSON
  -- ═══════════════════════════════════════════════════════════════
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'tipo_dado', tipo_dado, 'nome', nome, 'codigo', codigo,
      'status', status, 'mencao', mencao, 'creditos', creditos,
      'carga_horaria', carga_horaria, 'ano_periodo', ano_periodo,
      'prefixo', prefixo, 'professor', professor,
      'id_materia', id_materia, 'codigo_materia', codigo_materia,
      'nome_materia', nome_materia, 'nome_historico', nome_historico,
      'codigo_historico', codigo_historico,
      'encontrada_no_banco', encontrada, 'nivel', nivel, 'tipo', tipo
    ) ORDER BY idx
  ), '[]'::jsonb) INTO v_disc_casadas FROM _casadas;

  -- Horas integralizadas
  SELECT coalesce(sum(carga_horaria), 0) INTO v_horas
  FROM _casadas
  WHERE upper(status) IN ('APR','CUMP','DISP') AND carga_horaria IS NOT NULL;

  -- ═══════════════════════════════════════════════════════════════
  -- 7. CLASSIFY: concluidas, pendentes, optativas
  -- ═══════════════════════════════════════════════════════════════

  -- 7a. Missing mandatory subjects (obrigatórias: tipo_natureza != 1 e nivel > 0)
  CREATE TEMP TABLE _missing (
    id_materia bigint, codigo text, nome text, nivel int
  ) ON COMMIT DROP;

  INSERT INTO _missing
  SELECT mb.id_materia, mb.codigo, mb.nome, mb.nivel
  FROM _mat mb
  WHERE (mb.tipo_natureza IS NULL OR mb.tipo_natureza != 1)
    AND mb.nivel > 0
    AND mb.id_materia NOT IN (
      SELECT c.id_materia FROM _casadas c WHERE c.id_materia IS NOT NULL
    );

  -- 7b. Check equivalencies for missing mandatory subjects (SET-BASED)
  --     Replaces the old nested FOR loop with a single INSERT ... SELECT
  CREATE TEMP TABLE _equiv_concl (
    id_materia bigint, codigo text, nome text, nivel int,
    codigo_equivalente text, nome_equivalente text,
    professor text, mencao text, status text, ano_periodo text
  ) ON COMMIT DROP;

  INSERT INTO _equiv_concl
  SELECT DISTINCT ON (m.id_materia)
    m.id_materia, m.codigo, m.nome, m.nivel,
    coalesce(c.codigo, m.codigo),
    coalesce(c.nome, m.nome),
    coalesce(c.professor, ''),
    coalesce(c.mencao, '-'),
    coalesce(c.status, 'CUMP'),
    c.ano_periodo
  FROM _missing m
  JOIN _eq eq ON eq.codigo_origem = m.codigo
  CROSS JOIN LATERAL (
    SELECT upper(rm[1]) AS code
    FROM regexp_matches(eq.expressao, '([A-Za-z]{2,}\d{3,})', 'g') rm
  ) codes
  JOIN _casadas c ON upper(trim(c.codigo)) = codes.code
    AND upper(c.status) IN ('APR','CUMP','DISP')
  WHERE eq.expressao IS NOT NULL AND eq.expressao != ''
  ORDER BY m.id_materia, c.ano_periodo DESC NULLS LAST;

  -- Remove resolved subjects from _missing
  DELETE FROM _missing
  WHERE id_materia IN (SELECT id_materia FROM _equiv_concl);

  RAISE NOTICE 'casar_disciplinas: equivalency resolution found % additional completions, % still missing',
    (SELECT count(*) FROM _equiv_concl), (SELECT count(*) FROM _missing);

  -- 7c. Check if completed optativas can fulfill still-missing mandatory via equivalency (SET-BASED)
  --     For each completed optativa, check if its code appears in any equivalency expression
  --     that targets a still-missing mandatory subject.
  <<opt_equiv_block>>
  DECLARE
    v_opt_equiv_count int;
  BEGIN
    -- Find optativas that can fulfill missing mandatory via equivalencies
    CREATE TEMP TABLE _opt_fulfills (
      id_materia_missing bigint, codigo_missing text, nome_missing text, nivel_missing int,
      codigo_equivalente text, nome_equivalente text,
      professor text, mencao text, status text, ano_periodo text,
      id_materia_opt bigint
    ) ON COMMIT DROP;

    INSERT INTO _opt_fulfills
    SELECT DISTINCT ON (m.id_materia)
      m.id_materia, m.codigo, m.nome, m.nivel,
      coalesce(c.codigo, opt.codigo),
      coalesce(c.nome, opt.nome),
      coalesce(c.professor, ''),
      coalesce(c.mencao, '-'),
      coalesce(c.status, 'CUMP'),
      c.ano_periodo,
      opt.id_materia AS id_materia_opt
    FROM _missing m
    JOIN _eq eq ON eq.codigo_origem = m.codigo
    CROSS JOIN LATERAL (
      SELECT upper(rm[1]) AS code
      FROM regexp_matches(eq.expressao, '([A-Za-z]{2,}\d{3,})', 'g') rm
    ) codes
    JOIN _casadas opt ON opt.tipo = 'optativa'
      AND upper(opt.status) IN ('APR','CUMP','DISP')
      AND upper(trim(opt.codigo)) = codes.code
    JOIN _casadas c ON upper(trim(c.codigo)) = codes.code
      AND upper(c.status) IN ('APR','CUMP','DISP')
    WHERE eq.expressao IS NOT NULL AND eq.expressao != ''
    ORDER BY m.id_materia, c.ano_periodo DESC NULLS LAST;

    GET DIAGNOSTICS v_opt_equiv_count = ROW_COUNT;

    IF v_opt_equiv_count > 0 THEN
      -- Add to equiv_concl
      INSERT INTO _equiv_concl
      SELECT id_materia_missing, codigo_missing, nome_missing, nivel_missing,
             codigo_equivalente, nome_equivalente, professor, mencao, status, ano_periodo
      FROM _opt_fulfills;

      -- Remove from _missing
      DELETE FROM _missing
      WHERE id_materia IN (SELECT id_materia_missing FROM _opt_fulfills);

      -- Remove these optativas from _casadas
      DELETE FROM _casadas
      WHERE id_materia IN (SELECT id_materia_opt FROM _opt_fulfills)
        AND tipo = 'optativa';

      RAISE NOTICE 'casar_disciplinas: % optativas fulfilled missing mandatory subjects', v_opt_equiv_count;
    END IF;
  END opt_equiv_block;

  -- ═══════════════════════════════════════════════════════════════
  -- 8. BUILD RESULT JSON
  -- ═══════════════════════════════════════════════════════════════

  -- materias_concluidas = completed mandatory (from transcript + equivalencies)
  SELECT coalesce(jsonb_agg(j ORDER BY j->>'codigo'), '[]'::jsonb)
  INTO v_mat_concluidas
  FROM (
    -- From transcript
    SELECT jsonb_build_object(
      'id_materia', id_materia, 'codigo', codigo, 'nome', nome,
      'status', status, 'mencao', mencao, 'nivel', nivel,
      'carga_horaria', carga_horaria, 'ano_periodo', ano_periodo,
      'professor', professor, 'encontrada_no_banco', true, 'tipo', 'obrigatoria',
      'status_fluxograma', CASE
        WHEN codigo_historico IS NOT NULL
             AND upper(trim(codigo_historico)) != upper(trim(codigo))
        THEN 'concluida_equivalencia' ELSE 'concluida' END,
      'codigo_equivalente', CASE
        WHEN codigo_historico IS NOT NULL
             AND upper(trim(codigo_historico)) != upper(trim(codigo))
        THEN codigo_historico ELSE NULL END,
      'nome_equivalente', CASE
        WHEN codigo_historico IS NOT NULL
             AND upper(trim(codigo_historico)) != upper(trim(codigo))
        THEN nome_historico ELSE NULL END
    ) AS j
    FROM _casadas
    WHERE tipo = 'obrigatoria' AND upper(status) IN ('APR','CUMP','DISP')
    UNION ALL
    -- From equivalency resolution
    SELECT jsonb_build_object(
      'id_materia', id_materia, 'codigo', codigo, 'nome', nome,
      'status', status, 'mencao', mencao, 'nivel', nivel,
      'professor', professor, 'ano_periodo', ano_periodo,
      'encontrada_no_banco', true, 'encontrada_no_historico', false,
      'tipo', 'obrigatoria', 'status_fluxograma', 'concluida_equivalencia',
      'codigo_equivalente', codigo_equivalente,
      'nome_equivalente', nome_equivalente
    ) AS j
    FROM _equiv_concl
  ) sub;

  -- materias_pendentes = pending mandatory + missing mandatory (never in transcript)
  SELECT coalesce(jsonb_agg(j ORDER BY j->>'codigo'), '[]'::jsonb)
  INTO v_mat_pendentes
  FROM (
    SELECT jsonb_build_object(
      'id_materia', id_materia, 'codigo', codigo, 'nome', nome,
      'status', status, 'mencao', mencao, 'nivel', nivel,
      'carga_horaria', carga_horaria, 'ano_periodo', ano_periodo,
      'encontrada_no_banco', true, 'tipo', 'obrigatoria',
      'status_fluxograma', CASE
        WHEN upper(status) = 'MATR' THEN 'em_andamento' ELSE 'pendente' END
    ) AS j
    FROM _casadas
    WHERE tipo = 'obrigatoria' AND upper(status) NOT IN ('APR','CUMP','DISP')
    UNION ALL
    SELECT jsonb_build_object(
      'id_materia', id_materia, 'codigo', codigo, 'nome', nome,
      'nivel', nivel, 'encontrada_no_banco', true,
      'encontrada_no_historico', false, 'tipo', 'obrigatoria',
      'status_fluxograma', 'nao_cursada'
    ) AS j
    FROM _missing
  ) sub;

  -- materias_optativas (remaining after equivalency deductions)
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id_materia', id_materia, 'codigo', codigo, 'nome', nome,
      'status', status, 'mencao', mencao, 'nivel', nivel,
      'carga_horaria', carga_horaria, 'ano_periodo', ano_periodo,
      'encontrada_no_banco', true, 'tipo', 'optativa',
      'status_fluxograma', CASE
        WHEN upper(status) IN ('APR','CUMP','DISP') THEN 'concluida'
        WHEN upper(status) = 'MATR' THEN 'em_andamento'
        ELSE 'pendente' END
    ) ORDER BY codigo
  ), '[]'::jsonb)
  INTO v_mat_optativas
  FROM _casadas WHERE tipo = 'optativa';

  -- Summary counts
  v_total_concl := (SELECT count(*) FROM _casadas
                    WHERE tipo = 'obrigatoria' AND upper(status) IN ('APR','CUMP','DISP'))
                 + (SELECT count(*) FROM _equiv_concl);
  v_total_pend  := (SELECT count(*) FROM _casadas
                    WHERE tipo = 'obrigatoria' AND upper(status) NOT IN ('APR','CUMP','DISP'))
                 + (SELECT count(*) FROM _missing);
  v_total_obrig := v_total_concl + v_total_pend;
  v_total_opt   := (SELECT count(*) FROM _casadas WHERE tipo = 'optativa');
  v_percentual  := CASE WHEN v_total_obrig > 0
    THEN round((v_total_concl::numeric / v_total_obrig) * 100, 2)
    ELSE 0 END;

  RETURN jsonb_build_object(
    'disciplinas_casadas', v_disc_casadas,
    'materias_concluidas', v_mat_concluidas,
    'materias_pendentes',  v_mat_pendentes,
    'materias_optativas',  v_mat_optativas,
    'dados_validacao', jsonb_build_object(
      'ira', v_ira,
      'media_ponderada', v_media_ponderada,
      'frequencia_geral', v_frequencia_geral,
      'horas_integralizadas', v_horas,
      'pendencias', v_pendencias,
      'curso_extraido', v_curso_extraido,
      'matriz_curricular', v_curriculo
    ),
    'curso_extraido', v_curso_extraido,
    'matriz_curricular', v_curriculo,
    'resumo', jsonb_build_object(
      'total_disciplinas', (SELECT count(*) FROM _casadas),
      'total_obrigatorias', v_total_obrig,
      'total_obrigatorias_concluidas', v_total_concl,
      'total_obrigatorias_pendentes', v_total_pend,
      'total_optativas', v_total_opt,
      'percentual_conclusao_obrigatorias', v_percentual
    )
  );
END;
$function$;

COMMIT;
