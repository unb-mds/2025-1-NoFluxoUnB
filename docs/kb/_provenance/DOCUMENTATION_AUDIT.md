# Documentation inventory and drift audit

> Historical initial audit of 2026-10-07, before the authorized cleanup. Current status is in [CLEANUP_AUDIT.md](CLEANUP_AUDIT.md). The 271-row ledger now contains 229 active documents/support/templates and 42 retired Git-provenance rows; the old 268 count below records the original selection before adding 3 setup templates. Drift findings below are the initial evidence, not claims that corrected/removed guidance remains active.

Snapshot date: **2026-10-07 (America/Sao_Paulo)**. Source revision: `c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`, branch `feat/new-docs`. The inventory includes the reviewed worktree corrections to `AGENTS.md`, `CLAUDE.md`, and `README.md` made during KB consolidation; these are not yet a new committed revision. Evidence level: **tracked-artifact inventory and selective source review**. This report does not certify tests, provider configuration, deployment, or every statement in the older documents.

The repository has several documentation audiences and ages. The engineering KB in `docs/kb/` should explain the current checkout with source citations. It should preserve the public academic site, technical specs, historical plans, and prior test evidence as references with explicit limits.

## Scope and reproducibility

[document-inventory.csv](document-inventory.csv) contains **268 tracked artifacts**: **142 Markdown/TeX/RST/AsciiDoc/license documents**, plus 126 supporting artifacts or extensionless entries. The latter include screenshots, PDF fixtures, JSON test evidence, schema exports, deployment helpers, templates, and MkDocs configuration. No binary was rendered or fixture executed during this pass. The CSV records paths, titles when available, classification, audience, publication scope, authority, review level, byte size, and SHA-256 of checkout bytes.

Coverage is defined over `git ls-files -z`, not `find` over the filesystem. Include tracked paths under `docs/`, `documentacao/`, `kubernetes_docs/`, `plans/`, `backend/docs/`, `.claude/skills/`, and `.github/ISSUE_TEMPLATE/`; all tracked `.md`, `.rst`, `.tex`, and `.adoc` documents elsewhere; and the exact root files `LICENSE` and `mkdocs.yml`. Explicitly exclude the new `docs/kb/` and `scripts/docs-kb/` trees and `PROJECT_WIDE_DECISIONS.md` so provenance does not inventory itself. The inventory is a snapshot of the files audited, not a claim about later revisions.

- `catalog-inspected`: title and placement identified; individual claims not exhaustively checked.
- `artifact-inventoried`: path/size/hash recorded; content not reviewed or executed.
- `source-reviewed-with-limitations`: selected content or links compared with tracked source/configuration; older acceptance and provider-state claims remain unverified.
- `source-reviewed`: MkDocs configuration inspected as publication source.

The missing-link checks below used relative Markdown link targets against this checkout, not external URL requests. No `.env`, secrets store, production database, published site, or paid model was accessed.

## Documentation map

| Area | Tracked artifacts | Purpose and authority |
| --- | ---: | --- |
| `documentacao/` | 65 | Public academic documentation source, configured by `mkdocs.yml`. Includes meeting minutes, requirements, design/study notes, test guides, and images. Historical academic records do not define current runtime behavior. |
| `docs/` outside the new KB | 107 | Internal specifications, domain/design references, investigations, prior reports, test evidence, and fixtures. Includes 84 historical test artifacts. Specs describe design; source and tests resolve implementation differences. |
| `plans/` | 30 | 29 plan/overview documents plus `README.md`. Intention/history; each plan's current implementation must be assessed independently. See the plan assessment in this KB. |
| `kubernetes_docs/` | 31 | Generic cluster/deploy/monitoring runbooks plus helper source and templates. Current application workflow is separately defined under `.github/workflows/` and `scripts/deploy/`. |
| `backend/docs/` | 5 | Exported schema JSON, table Markdown, functions, triggers, and RLS SQL snapshots. They are not proof that the live database currently has that state. |
| Other locations | 30 | Root governance and overview, component READMEs, legacy backend guides, contributor templates, and `.claude/skills/` workflow notes. |

The classifications in the CSV distinguish 15 governance/workflow guides, 6 component guides, 4 other root/component references, 3 legacy guides, 5 generated schema references, 10 technical specs/references, 2 dated investigations, 2 technical test guides, 9 historical test reports, 84 historical test artifacts, 33 academic references, 19 academic history entries, 5 public assets, 1 public overview, 8 public test guides, 10 infrastructure references, 10 infrastructure helper sources, 11 infrastructure template artifacts, 1 publication configuration, and 30 historical plan entries.

## Publication and source precedence

`mkdocs.yml` defines `docs_dir: documentacao` and `site_dir: site`. Its navigation directly lists the academic homepage, selected requirement/planning pages, eight test pages, and twelve meeting minutes. Other tracked files in `documentacao/` are not necessarily reachable through navigation; the CSV marks membership in the configured documentation directory, not confirmed publication of each page. Engineering `docs/`, plans, and `backend/docs/` are outside that configured public documentation source.

`.github/workflows/ci.yml` is named `Docs (mkdocs)` and runs `mkdocs gh-deploy --force` after a push to `main`. This is separate from `.github/workflows/pipelineCI.yml` (`CI`) and application deployment. No published MkDocs build was fetched or rebuilt in this audit.

Use repository governance for workflow restrictions, code/configuration for present implementation, generated exports as dated schema references, tests as executable contracts, and specs/plans as design intent. Historical test screenshots or a report saying PASS establish what the report recorded at its time; they do not demonstrate the current checkout passes those scenarios.

## Material drift and incomplete references

| Reference | Finding from this checkout | How to use it now |
| --- | --- | --- |
| `frontend/README.md`, plan 22; original AGENTS/CLAUDE wording | The older documents describe no SSR, but `frontend/src/routes/+layout.ts` currently exports `ssr = true`. `frontend/svelte.config.js` still uses adapter-static with an `index.html` fallback. | Describe static hosting and the current SSR flag separately. A static adapter does not itself prove SSR is disabled or that a Node SSR server is deployed. AGENTS/CLAUDE no-SSR wording was removed during consolidation. |
| Original `AGENTS.md` deployment paragraph | Previously said application deploy runs on push to main; corrected during consolidation to describe eligible successful CI, approved SHA and rollout verification. `.github/workflows/deploy.yml` instead listens for completion of `CI` on main and checks the run path, success, push event, and repository; manual `workflow_dispatch` also exists. `CLAUDE.md` has the newer description. | Cite the workflow for its exact gate and commit selection. A main push starts CI and may subsequently deploy when that gate passes. |
| Original `AGENTS.md`/`CLAUDE.md` and retained `plans/README.md` | Original blanket wording said 30 completed plans. AGENTS/CLAUDE now describe historical/proposed entries and per-plan disposition; retained plans README still uses completed-history wording. There are 30 tracked entries in `plans/`, including its README; plan documents include proposals/templates and different status wording. | Treat implementation and acceptance as per-plan findings, not a folder-level completed status. |
| `SABIA_INTEGRATION.md` | Title says v2/FastAPI, while body instructs subprocess/stdin, `agente_sabia.py`, `servidor_mcp_sabia.py`, local SentenceTransformer download, and `baixar_modelo.py`. Those agent/downloader paths are absent. | Use `mcp_agent/api_producao.py`, `backend/src/services/sabia.service.ts`, and `backend/scripts/dev-full.sh` for current integration. Preserve this guide as legacy. |
| `mcp_agent/README.md` | FastAPI architecture is supported by source, but recommendation-only framing is incomplete for the current service; advertised latency has not been measured in this audit. It links to the stale Sabiá guide. | Consult the service KB/source for endpoint catalog and timeouts; treat latency as an older statement. |
| `docs/PROJECT_DOCUMENTATION.md` | Mixed-age overview: primary AI path labeled RAGFlow, project structure contains removed `coleta_dados/` and local `test_historicos/`, backend dependencies include removed `express-fileupload`/`express-ws`/`morgan`, and the live URL differs from AGENTS. Its PDF paragraph reflects the newer client-side parser. | Use as historical overview, not a unified current architecture reference. RAGFlow source still exists, so distinguish retained code from primary frontend behavior rather than declaring every RAGFlow path removed. |
| `docs/PROJECT_DOCUMENTATION.tex` | Alternative document source for the project overview. This pass did not compile/render it. | Treat its existence as a document artifact, not independent corroboration of the Markdown overview or visual acceptance. |
| `frontend/README.md` CI sentence | Says only Vitest runs in CI and Playwright is local. `.github/workflows/a11y.yml` runs `test:e 2e:a11y` with Playwright and has `continue-on-error: true`. | Distinguish the main test pipeline from the separate advisory accessibility workflow. |
| `frontend/README.md`, `AGENTS.md`, `CLAUDE.md` quality notes | Specific pre-existing `svelte-check` error count is a historical number. | Do not carry that number into current acceptance without running the check. |
| `docs/chatbot-orquestrador.md` | Names `supabase/migrations/20260722010000_chat_sessions_openai_agents_schema.sql`, absent from tracked migration paths; asserts an older live schema and pending reapplication. | Keep the architectural design as reference. Current provider schema and whether any corrective migration is needed are UNKNOWN in this source-only audit; do not run destructive SQL from the old narrative. |
| `backend/API_TESTES.md` | Describes `/testes/*` debug endpoints. `backend/src/index.ts` registers seven domain controllers and no TestesController. | Mark retired route guidance as history; current route inventory is implementation-derived. |
| `backend/FORK_SETUP_SUMMARY.md` | Describes fork cloning using old Docker entrypoint/compose files and `no_fluxo_backend/`. Supporting entrypoint files are absent; `backend/start_and_monitor.py` remains tracked. | Historical fork-monitor workflow, not current reproducible container startup. |
| `DOCKER_README.md` | Explicitly says dev Compose/Dockerfiles are not versioned. | Helpful for a local setup that already exists; tracked checkout alone does not provide those dev files. Production Dockerfiles are separate. |
| `docs/testes/COMO-EXECUTAR-TESTES.md` | `--cov=../DBA/database` after changing into `DBA/tests` refers to a wrong nested path. | Use current `DBA/tests/pytest.ini` and `conftest.py` for production-module coverage. |
| `documentacao/testes/cobertura-metricas.md` | Uses a Windows `file:///c:/.../codecov.yml` link and recommends `--cov=.` from the tests directory. Current `pytest.ini` explicitly targets `expressao_parser` and `DBA.parse_pdf.pdf_parser_final`, with a 45% floor. | Relative repository links and configured production coverage are the reliable entry points. Its target percentages are policy/reference, not freshly measured coverage. |
| `README.md` local setup | Lists `DBA/database/01_insert_cursos_matrizes_materias.py` alongside service startup. | This is data ingestion that writes to the database, not a read-only development startup action. |
| Product domains | Original AGENTS named `no-fluxo.crianex.com`; CLAUDE and root/overview docs name `no-fluxo.com` variants. AGENTS now names the product and qualifies README domain as requiring deploy verification. | Preserve the historical discrepancy and avoid assuming domain/runtime acceptance. Current workflow/source configuration and external verification are needed to establish serving domains and redirects. |
| `kubernetes_docs/README.md` | Generic Kaniko/build-via-API quick start and push command differ from this application's workflow using local Docker through `scripts/deploy/deploy_local.py`. | Use templates for their intended generic context; application behavior comes from its workflow/script. Repository push restrictions still apply. |

During consolidation, `AGENTS.md` and `CLAUDE.md` received KB routing and corrections to plan disposition/static-adapter language; AGENTS also received the corrected deployment summary and domain qualification. `README.md` now links to the KB and its commands. The legacy specs, plans, public academic content, and infrastructure runbooks remain preserved. Remaining drift is discoverable through this audit and CSV notes; the KB should present source-derived behavior without erasing the older records.

## Broken or nonportable local links

| Document | Missing/nonportable target |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md` | Inline reference to `documentacao/incidente_seguranca_2026-09-04.md`; not tracked/present in this checkout. |
| `docs/testes/teste-exploratorio-divisao-equipe.md` | `../../.claude/projects/.../memory/equipe-ptoss2-status.md` placeholder. |
| `documentacao/planejamento/idv/idv.md` | `img/assis-no-fluxo.png`, `img/fluxograma-no-fluxo.png`, `img/home-no-fluxo.png`. |
| `documentacao/testes/cobertura-metricas.md` | Windows-only `file:///c:/.../codecov.yml`. |
| `kubernetes_docs/README.md` | `./DEPLOYMENT_GUIDE.md`, `./scripts/`, `./setup/`. |
| `kubernetes_docs/local_build_and_deploy/README.md` | `../DEPLOYMENT_GUIDE.md`. |
| `kubernetes_docs/monitoring/README.md` | `./SETUP_GUIDE.md`. |
| `kubernetes_docs/monitoring/APP_METRICS_GUIDE.md` | `./SETUP_GUIDE.md`, `../../deploy-api-server/docs/API_REFERENCE.md`. |
| `kubernetes_docs/templates/README.md` | `../monitoring/SETUP_GUIDE.md`, `../../deploy-api-server/docs/API_REFERENCE.md`, `../../deploy-api-server/docs/BUILD_GUIDE.md`. |

Two similarly named March meeting records (`atas/27 e 29-03-25.md` and `atas/27-29-03-25.md`) and multiple requirement/story-map locations are separate tracked records. Their mere duplication does not establish which text is canonical; MkDocs navigation explicitly selects one path for each public entry. Migration plan numbering also collides (`14-*`, `16-*`), as its README already records.

## Review and maintenance limits

This is complete coverage of the stated tracked-document/artifact selection rule, not exhaustive factual verification of all historical prose. Binary assets, exploratory JSON responses, PDF fixtures, TeX output, old percentage/latency/PASS claims, cluster state, live database state, official UnB rules, external Miro/Figma pages, and published domains were not independently validated here.

When updating a current behavior page, cite the source/configuration and tests in the corresponding KB area, record which checks were actually run, and keep schema/deployment/user-path acceptance separate. Rebuild this provenance inventory only when the audited legacy documentation changes. New KB prose belongs to the KB validator's own coverage/link checks rather than this legacy inventory.
