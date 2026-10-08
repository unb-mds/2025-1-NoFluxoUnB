---
id: SUB-data
aliases:
  - DBA SIGAA scraping ingestão
  - banco schema migrations currículo equivalências histórico PDF
watches:
  - backend/docs/**
  - backend/scripts/export_schema.ts
related:
  - SUB-backend
  - SUB-frontend
  - SUB-ai
  - SUB-security
  - SUB-ops
title: Academic data ingestion and database schema
owns:
  - DBA/**
  - supabase/**
status: source-reviewed
last_verified: 2026-10-08
---

# Academic data ingestion and database schema

This subsystem collects the UnB academic catalogue and offerings, transforms them
into Supabase rows, and supplies contracts consumed by the Svelte frontend,
Express API and Darcy services. Its Python PDF parser is retained for tests and
historical reference; the product's current transcript parser runs in the browser.

**Evidence boundary:** the files and symbols below were reviewed on 2026-10-07.
No scraper, ingestion command, schema export or database query was executed for
this document. `source-reviewed` establishes what the checkout implements, not
that a scheduled job succeeded, a migration was applied, a dataset is complete,
or the live Supabase schema matches these files.

## Code and data map

| Area | Entry points and role |
|---|---|
| Catalogue structures | `DBA/scraping/scraping_ementa.py::scrape_estruturas`, `extract_dados_por_nivel`, `extract_prazos_cargas` collect curricular structures and graduation metadata. |
| Subject relationships | `DBA/scraping/scraping_equivalencias.py::processar_departamento`, `coleta_dados`, `salvar_por_departamento` collect subject details, prerequisites, corequisites and generic/course-specific equivalences. |
| Offerings | `DBA/scraping/scraping_turmas.py::main`, `processar_departamento`, `coleta_dados` collect classes for an explicit year/semester. |
| Department inventory | `DBA/scraping/atualizar_departamentos_id.py::coletar_ids_departamento` and `DBA/scraping/departamentos_ID_unb.csv` support department traversal. |
| Academic calendar | `DBA/scraping/scraping_calendario_academico.py::parse_calendario`, `scrape_calendario_academico` collect regular `.1`/`.2` periods from the SAA calendar page. |
| Database synchronization | `DBA/database/01_insert_cursos_matrizes_materias.py` through `05_insert_calendario_academico.py` provide the ingestion operations described below. |
| Logical expressions | `DBA/database/expressao_parser.py::parse_expression` converts textual subject expressions to JSONB trees; `diff_utils.py::diff_campos` implements field synchronization rules. |
| Retained Python PDF parser | `DBA/parse_pdf/pdf_parser_final.py::upload_pdf` exposes a Flask test/development endpoint. |
| Current browser PDF parser | `frontend/src/lib/services/pdf/pdfParser.ts::parsePdf` orchestrates PDF.js positional discipline extraction and text metadata extraction. |
| Schema evidence | `backend/docs/database_schema.json`, `database_tables.md`, `database_functions.sql`, `database_triggers.sql`, `rls_policies.sql` contain the checked-in export. |
| SQL changes | `supabase/migrations/*.sql` contain a generated baseline and manually applied feature/security changes. |

`DBA/dados/**` is ignored by `.gitignore`, with a tracked exception for
`DBA/dados/cursos-de-graduacao.json`. Consequently a clean checkout is not a
complete catalogue input bundle. The tracked `DBA/turmas_2026_1/` directory is a
dated collection of outputs, not the current default input path for script 03.
The live offering scraper writes to
`DBA/dados/dados_finais_teste_p_depto_20`; relationship scraping writes to
`DBA/dados/materias`; curricular structure input is
`DBA/dados/estruturas-curriculares`. These defaults are defined in
`scraping_turmas.py::DEFAULT_OUTPUT_DIR`,
`scraping_equivalencias.py::OUTPUT_DIR` and `database/config.py`.

## Ingestion operations and write contracts

The numbered scripts express dependencies, not one atomic transaction. The
workflows run catalogue, relationship, offering and calendar synchronization as
separate operations. All five ingestion scripts have `--dry-run`, but dry runs
still initialize the Supabase client and read database state; they are not
offline validation commands.

### 01 — courses, matrices, subjects and curriculum membership

`01_insert_cursos_matrizes_materias.py::main` loads caches and processes the
curricular structure JSONs. `get_or_create_curso`, `get_or_create_matriz`,
`get_or_create_materia` and `insert_materias_por_curso_batch` insert missing rows.
`get_or_create_materia` can supplement the structure using subject details.

The primary domain contracts are:

- `cursos.id_curso` is the numeric curriculum code before `/`, with no added
  offset for the teaching shift. A curriculum `8150/-4` corresponds to course
  ID `8150`. Explicit insertion of that ID requires a compatible non-IDENTITY
  course column.
- `matrizes.curriculo_completo` is `codigo/versao - periodo`, without `DIURNO`
  or `NOTURNO`. Existing matrices also match by course, version and effective
  year; `build_curriculo_completo_sem_turno` supplies the normalized string.
- `materias_por_curso.tipo_natureza`: `0` means mandatory, `1` means optional.
  `nivel` and `tipo_natureza` accept zero as a meaningful value.
- `normalizar_cursos_id_legado` attempts to rewire matrix and equivalence course
  IDs from the old `codigo_base + 100000` convention and delete the obsolete
  course row. It catches FK-rewiring exceptions and FK-related delete failures,
  so completion is not guaranteed. This operation is a structural database
  change, beyond inserting rows.

The current code also corrects existing rows. `REGRAS_CURSO`, `REGRAS_MATRIZ`,
`REGRAS_MATERIA`, `REGRAS_MPC` select fields, while `flush_updates` persists
accumulated changes. Course name/type/shift, matrix required workloads and
`formatura`, subject workload/description/department, and membership
level/nature can change. `get_or_create_matriz::_update_row` also updates matrix
`status` when the incoming value is not `None` and differs. Subject names are
filled only when currently empty. The matrix version/effective year are
matching keys and are not diff-updated.

`diff_utils.py::diff_campos` preserves existing data when the incoming value is
empty or absent: nonempty strings correct differences, workload changes require
a positive integer, nonempty JSON corrects JSON differences, and the integer
rule permits zero. In `get_or_create_materia`'s fallback lookup path, direct
updates correct description and department whenever a nonempty incoming value
differs; workload is directly filled only when currently missing or zero and
the incoming value is positive. These fallback operations differ from the
cached workload diff, which can also correct a nonzero workload.

**Documentation cleanup completed:** the outdated matrix-only update rule and
missing migration-file reference were removed while reconciling the guides on
2026-10-07. [DBA/database/README.md](../../../DBA/database/README.md) now documents
the actual synchronization and ID contracts; [DBA/README.md](../../../DBA/README.md)
maps the current data paths, automation and test boundaries. That cleanup does
not establish which schema changes have been applied to the live database.

### 02 — prerequisites, corequisites and equivalences

`02_insert_pre_requisitos_equivalencias.py::main` reads subject JSONs, resolves
subject IDs from `materias.codigo_materia`, caches existing relations, parses
expressions and inserts missing relations in batches with row fallback.
Rows whose subject cannot be resolved are skipped; parse failures are counted.

Prerequisite and corequisite deduplication keys are subject ID plus the original
expression. Equivalence keys add course ID and curriculum text
(`_chave_equi`). Generic equivalences omit course/curriculum scope; specific
equivalences resolve a valid course via `id_curso_from_curriculo`, retain
curriculum text, and convert a supplied effective period via `periodo_to_date`.
The `main` path adds missing expression records; it does not replace or delete
outdated relations. A changed expression can therefore coexist with the older
one rather than updating it in place.

`expressao_parser.py` normalizes nonbreaking spaces and Unicode parentheses,
recognizes case-insensitive `E`/`OU`, and uppercases subject codes. The output is
either a code string or `{"operador":"E"|"OU","condicoes":[...]}`. `E` binds
more tightly than `OU`; nested occurrences of the same operator are flattened.
Malformed parentheses and leftover tokens raise `ValueError`. The tokenizer
skips unrecognized characters, so this parser is not a lossless textual grammar
validator. `is_expressao_valida` checks the supported recursive tree shape.

### 03 and 04 — offering synchronization and reconciliation

`03_insert_turmas.py::normalizar_linha_turma` resolves the subject FK, trims
strings, normalizes vacancy numbers, and recalculates remaining vacancies when
offered/occupied counts are present. `flush_upsert` writes on the unique key
`(id_materia, turma, ano_periodo)` (`uq_turmas_oferta`). Rows carry update
timestamps for subsequent reconciliation. Unknown subject codes, incomplete
keys and invalid source files are skipped and reported.

`04_reconciliar_turmas.py::listar_turmas_obsoletas` selects rows for exactly the
requested `--ano-periodo` whose `last_updated_at` precedes the scrape start.
`apagar_turmas` deletes their IDs in batches; `--run-started-at` or
`RUN_STARTED_AT` is mandatory. Previous semesters are outside the selection.

**Completeness gap:** a zero exit code is not sufficient evidence that every
department was scraped and upserted. The scraper only retains departments that
returned offerings; script 03 can return normally when no JSON files exist and
can continue after per-file/per-row errors; `flush_upsert` catches row failures
and reports a partial batch. Script 04 has no independent completeness gate
before deleting untouched rows. The workflow calls reconciliation after the
preceding commands succeed. A partial collection can therefore make valid rows
appear stale. This is a source-level risk, not a reproduced production incident.

### 05 — calendar synchronization

`05_insert_calendario_academico.py::validar` requires `AAAA.1`/`AAAA.2`, an integer
year consistent with the period, and an end date after the start. Dates change
from `DD/MM/YYYY` to ISO dates. Invalid entries are logged and skipped; no valid
periods abort the run. `buscar_existentes` compares dates; changed dates are
logged. `main` upserts on `periodo` when a new period or date change exists.
The generated `limite_matricula_25pct` column is deliberately omitted from
writes. A metadata-only change in `texto_bruto` does not trigger an upsert when
all existing dates are unchanged.

The scraper locates year sections and regular semester ranges in the SAA HTML;
special periods such as `.4` are omitted. This depends on the page's structure
and is not proof of current calendar accuracy.

## Scheduled pipelines

These are checked-in workflow definitions; their most recent executions were
not inspected.

| Workflow | Trigger and sequence |
|---|---|
| `.github/workflows/scrape_ementa.yml` | Manual or day 1 at 00:00 UTC: curricular scraper → script 01. |
| `.github/workflows/scrape_equivalencias.yml` | Manual or successful `Scrape Ementa`: relationship scraper → script 02. |
| `.github/workflows/scrape_turmas_lite.yml` | Manual, successful `Scrape Equivalencias`, or 30-minute cron: decision RPC → offering scraper → script 03 → script 04. |
| `.github/workflows/scrape_calendario.yml` | Manual or Monday at 02:00 UTC: SAA calendar scraper → script 05. |

The offering workflow's `jobDecisao` calls `scraping_turmas_decisao`. Calendar
phase/admin mode determine the cron cadence. `rapida` enables every tick;
`diaria` enables cron ticks during 03:00 UTC's hour; other values skip cron.
Manual and successful chained runs bypass the cadence, including the off mode.
Missing RPC data falls back to daily cadence and, when the period is missing,
the month-based semester formula. `scraping_turmas.py::ano_periodo_atual` has
the same formula as a standalone fallback; workflow-provided arguments take
precedence, and each resulting row retains the period extracted from SIGAA.

Ementa/equivalence workflows include auto-commit actions for collected JSONs,
while `.gitignore` excludes those dataset paths. Their definitions show the
intended commit step but do not prove successful data publication. Calendar and
offering workflows use read-only repository permissions and keep data in the
database. Uploaded artifacts select scraper logs; comments deliberately exclude
database operation logs that run with privileged credentials.

## Credential and safety boundary

`database/config.py` searches backend/root/current-directory/DBA `.env` files
and selects `SUPABASE_SERVICE_ROLE_KEY`, then `SUPABASE_SERVICE_KEY`, then
`SUPABASE_KEY`. It rejects missing keys, publishable-key prefixes and unknown
formats; it permits secret-key and legacy JWT prefixes. Prefix validation is
not a verification of JWT role or whether an old credential remains valid.
The configured URL has a default, so operating against a different environment
requires checking the intended target explicitly.

The scripts create Supabase clients at import time. Do not import ingestion
modules merely to run an offline smoke test, and do not use their dry runs to
claim no external access. Credentials must remain in environment configuration;
the KB requires no `.env` contents or privileged query output.

## Schema exports, baseline and later migrations

The checked-in `backend/docs/database_tables.md` and
`supabase/migrations/latest_init_from_export.sql` identify their export as
**2026-07-16T23:00:16.419383+00:00**, using RPC. The generated baseline describes
21 tables, one view, 181 functions, five triggers and 35 policies. These numbers
describe that export, not today's database.

`backend/scripts/export_schema.ts::exportSchema` tries the `export_schema` RPC
and can fall back to table/OpenAPI discovery and inferred column information.
It writes the five export documents. Although `parseCliArgs` recognizes
`--write-supabase-migration`, the current `if (true)` block always writes a
baseline migration too. Therefore `cd backend && npm run export-schema` is a
live read plus local documentation/baseline rewrite, not a harmless local
inspection. It was not run during this review.

The generator calls its baseline best-effort. Local test setup can compensate
for omitted constraints/security properties; `ticket_chat.sql`, for example,
adds the ticket audit action CHECK omitted from the export, and
`20260928_rls_catalogo.sql` enables `turmas_historico` RLS omitted from the
generated SQL. Do not replace live schema or migrations based solely on this
baseline.

| Later SQL file | Source-defined contract |
|---|---|
| `20260928_casar_disciplinas_premortem.sql` | Replaces transcript matching and equivalence evaluators; handles matrix ambiguity, expression conjunctions, course/effective-date scope and other-matrix subjects. |
| `20260928_rls_catalogo.sql` | Enables matrix RLS with public SELECT, restores baseline-missing offering-history RLS, conditionally revokes old test-table grants. Leaves `materias_vetorizadas` RLS as an explicit pending item. |
| `20260928_vw_creditos_por_matriz_id_curso.sql` | Adds course ID to `vw_creditos_por_matriz`, retaining `security_invoker`. |
| `20260929_darcy_cota.sql` | Adds AI usage user/question traceability, daily quotas, concessions and reservation/admin RPCs. |
| `20260929b_dashboard_rastreabilidade.sql` | Extends AI cost/support metrics; requires the quota migration and ticket chat SQL. |
| `20260930_ai_saldo.sql` | Adds insufficient-credit markers, manually entered balance/recharge records and balance estimate/configuration RPCs; depends on quota and cost-traceability SQL. |
| `preferencias_grade.sql` | Defines per-user/per-subject shift/teacher preferences. |
| `security_scans.sql` | Defines security scan metadata and admin-only health reporting; findings store fingerprints rather than secret values. |
| `ticket_chat.sql` | Defines ticket messages, permission-checked write/read RPCs, Realtime and retention. |
| `ticket_chat_nao_lidas.sql` | Adds per-user read cursors and unread summaries; requires ticket chat SQL. |
| `casar_disciplinas_function.sql` | Retains another transcript-matching function definition; overlapping definitions must be interpreted with later patches and test bootstrap, not treated as simultaneous authority. |

These SQL files instruct manual application in the Supabase SQL Editor. Their
presence establishes intended changes; application status and rollback history
are unknown. File ordering alone is not a deployment ledger.

**Known missing schema evidence:** `01_insert_cursos_matrizes_materias.py::load_cache_matrizes`
requires `matrizes.status`, `ch_maxima_componentes_eletivos` and `formatura`.
All three are absent from the matrix columns in the checked-in
`backend/docs/database_schema.json` and the baseline table definition; this was
verified directly after the README cleanup. Calendar ingestion also requires
`calendario_academico` (including generated cutoff), and the offering workflow
requires `scraping_turmas_decisao`. Those definitions are
absent from the checked-in July export/baseline and the reviewed migration set.
The exported `periodo_letivo_atual` function still derives the semester from the
month. Current workflow comments describe calendar-based behavior, but the
actual live replacement cannot be established from these files. A future schema
refresh or explicit migration is needed to make those contracts reproducible.

## Tests and what they establish

`DBA/tests/conftest.py` adds the repository root to import paths. The Python CI
suite runs in `DBA/tests`. `pytest.ini` measures `expressao_parser` and
`DBA.parse_pdf.pdf_parser_final`, emits coverage reports and sets a 45% combined
threshold. Its approximate parser/PDF percentages are historical comments, not
newly measured evidence.

- `DBA/tests/test_expressao_parser.py` imports the production parser and covers
  tokenization, normalization, conjunction/disjunction, precedence, flattening,
  malformed parentheses and tree validation.
- `DBA/tests/test_upload_pdf.py` exercises the Flask endpoint's missing-file 400
  response. Its successful PDF upload case is explicitly skipped.
- `DBA/tests/test_scraping_equivalencias.py` defines its own copies of utility
  functions. Those tests establish expectations for the copies, not that the
  current production scraper's network/session behavior works.
- `DBA/database/test_diff_campos.py` is a standalone assertion script for the
  production diff helper, outside the standard `DBA/tests` suite.
- `backend/tests-ts/db/casar-disciplinas.pglite.test.ts` and
  `catalogo.pglite.test.ts` exercise SQL contracts in local PGlite using baseline
  and patches. They do not establish live Supabase configuration or deployment.

The Python Flask parser tries `pypdf` text extraction and, if empty, uses
`pdf2image` plus `pytesseract` OCR. Its presence and test coverage do not make it
the current user upload route. See `frontend/src/lib/services/pdf/pdfParser.ts`
and the historical plans `10-PDF-UPLOAD.md`, `16-CLIENT-SIDE-PDF-PARSING.md`,
`16-PDF-PARSER-REWRITE.md`, `17-POSITION-BASED-PDF-PARSING.md` for the migration
context; current code determines the active contract.

## Open verification work

The main unresolved questions are dataset completeness and safe reconciliation,
schema reproducibility for calendar and the additional matrix fields,
workflow data-commit behavior under ignored paths, and actual migration/job
state. README rule/path drift was resolved by the documentation cleanup.
`DBA/package.json` also references one-off JS migration scripts under
`dados/expressao_logica` and `scripts` that are not tracked in this checkout;
those npm commands are not established runnable entry points from repository
source alone.

Source review is complete for this page. Tests, scraping acceptance, database
state and production acceptance remain separate evidence stages.
