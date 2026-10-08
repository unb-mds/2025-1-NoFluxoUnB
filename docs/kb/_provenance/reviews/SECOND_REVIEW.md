# Second independent review: current documentation cleanup

Reference date: **2026-10-07**, America/Sao_Paulo. Reviewed source HEAD:
`c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`, with the KB and documentation worktree
changes. This reviewer compared documents with source afresh, independently of
the initial acceptance reports. Initial result: **changes required**. Final result
on **2026-10-08: PASS for reviewed source documentation and local KB tooling**.
This report records the initial findings and the completed independent recheck below.

## Review scope and authority

The user explicitly requested a second subagent review and removal of documentation
that disagrees with the current project. Retaining misleading current instructions
with only a stale banner does not satisfy that request. Replace useful entry points
with current, source-grounded instructions; remove superseded plans/guides from the
working tree, with original revision/path/hash and Git recovery recorded in provenance.
Historical meeting minutes, dated test observations and study records describe their
own time; they do not become false solely because the implementation later changed.

This review inspected local source/configuration and document text. It did not import
configured clients, query databases or providers, render legacy PDF/TeX, exercise the
browser, contact infrastructure, or execute jobs. Source can establish what a guide
should say, but cannot establish the live domain/schema, acceptance, latency or cluster
capabilities. Other agents own edits; this reviewer writes only this report.

## File-level findings and required dispositions

| File or exact group | Required disposition | Freshly checked reason / source |
| --- | --- | --- |
| `SABIA_INTEGRATION.md` | Remove original guide; route integration questions to current AI/backend READMEs and dossiers | Original spawns absent `agente_sabia.py` and `servidor_mcp_sabia.py`, downloads absent `baixar_modelo.py`, describes local 384D vectors. `backend/src/services/sabia.service.ts` calls HTTP and `mcp_agent/api_producao.py` generates Gemini 256D vectors. |
| `docs/PROJECT_DOCUMENTATION.md`, `docs/PROJECT_DOCUMENTATION.tex` | Remove mixed-age overview sources, retain provenance/recovery | Current overview includes removed directories/dependencies and promotes RAGFlow as primary AI. Backend currently registers seven controllers and supports Maritaca directly plus the separate FastAPI service. TeX existence is not corroboration of its claims. |
| `backend/API_TESTES.md` | Remove retired debug route guide | `backend/src/index.ts` registers Fluxograma, Users, Cursos, Materias, Assistente, Planejamento, Chat; no TestesController or `/testes/*` registration. |
| `backend/FORK_SETUP_SUMMARY.md` | Remove original fork startup guide | Referenced old entrypoints/compose paths are absent from the tracked checkout; present `backend/start_and_monitor.py` does not restore those dependencies. |
| `frontend/melhorias.md` | Remove obsolete backlog | Claims no helmet, open CORS and zero tests; `backend/src/index.ts` applies helmet/CORS config and `tests-ts/` exists. Claims grade builder and chat persistence pending; current grade routes and `SupabaseSession` exist. Planner no longer exists only in another branch. |
| Every original `plans/*.md` except replacement `plans/README.md` (29 files) | Retire originals to Git history and disposition ledger | Plans mix implemented, partial, superseded and unverified visual work; master/overview contain obsolete dependencies/route counts/checklists. Current code is canon. Keep all 30 original ledger rows/hashes, record retirement separately from implementation disposition, and make README a current recovery/index entry. |
| `frontend/README.md` | Replace/correct active guide | Root `+layout.ts` exports `ssr=true`, protected layout exports false, adapter remains static. Curriculum renderer is custom DOM/SVG; `@xyflow/svelte` imports are in planner components. Separate `a11y.yml` runs advisory Playwright. Do not assert an unmeasured current svelte-check error count. |
| `mcp_agent/README.md` | Replace/correct active guide | Current API includes health, search, recommendation and stream; thresholds are 0.6/20 per term and 25 aggregated, not 0.55/10. API-key dependency excludes health. Remove unmeasured latency and removed-guide link. |
| `DBA/database/README.md` | Replace/correct operational contract | Script 01 computes and queues updates across courses, matrices, subjects and subject-course rows; direct updates also repair IDs and fill fields. Original 'only curriculo_completo may update' is false. Script source `REGRAS_*`, `diff_campos`, `UPDATES_*`, `_flush_updates` determines behavior. |
| `DBA/README.md` | Correct overview | Coverage percentages are historical measurements; missing one-off JS scripts in `DBA/package.json` are not runnable tracked entry points. Current parser use by tests and numbered Python pipeline remain valid. |
| `backend/README.md` | Correct/retain entry point | Node/Express and FastAPI integration match source. Clarify PDF path as active frontend behavior; remaining backend PDF controller should not be erased by absolute 'no backend parsing' wording. Replace old spec links with current KB. |
| `docs/chatbot-orquestrador.md` | Replace with current chat contract or remove original in favor of backend/AI dossiers | Original claims a destructive schema reapplication is pending in live DB and links absent migration. No remote evidence exists. Original says grade unimplemented; `orquestrador_agent.ts` registers grade/module-free tools when `apenasComOferta && curriculoCompleto && horarioLivre`. |
| `docs/chat-agente-planejador-spec.md` | Replace with current compatibility contract or retire original design | Original model `sabia-3` contradicts `config/maritaca.ts:MARITACA_MODELS.AGENTE='sabia-4'`. Five loop iterations are still source-backed; stateless compatibility endpoint must be distinguished from `/chat/send` persistence. |
| `docs/motor2.md`, `docs/motor2-v2-spec.md` | Replace with source-grounded Motor 2 contract or retire originals | Suggested GET endpoint and `/gerar-plano-completo` do not match `PlanejamentoController.routes['gerar-plano']` POST. Current controller identifies user through authorization/headers and assembles server data. Proposed outputs, onboarding and scheduling claims cannot silently stand as current contracts. |
| `CONTRIBUTING.md` | Replace/correct active setup | Uses `PUBLIC_BACKEND_URL`, while frontend reads `PUBLIC_API_URL`; Python install fence is unclosed. Preserve setup_env/venv instructions that match source, use tracked env examples/current guide, distinguish ordinary dev start from ingest writes. |
| `README.md` | Correct overview/startup | Database ingestion is placed alongside service startup; `01_insert_cursos_matrizes_materias.py` writes DB. Product domain is a documented address, not current served revision evidence. |
| `DOCKER_README.md` | Replace with tracked container facts | Guide depends on individually recreated ignored Compose/dev Dockerfiles. Do not promise runnable full-stack Compose from this checkout. Production image files are tracked and can be documented. |
| `docs/DEV_IMPERSONATION.md` | Correct retained developer contract | Frontend `load` checks BOTH `config.isProd` and `!import.meta.env.DEV`; header bypass also uses DEV. Backend still performs actual user lookup. 'All PASS' is an older claim unless tied to dated evidence; do not certify fresh E2E. |
| `SECURITY.md` | Correct reporting guide | Draft status does not itself establish confidential PR visibility. The original's private/draft PR instructions are misleading; do not invent private reporting availability or response commitments. |
| Six `.claude/skills/motor2-*.md` files | Retire original task-specific workflows or replace current checklists | Code-review guide mandates old task numbers/spec assumptions and a score formula that omits current offer bonuses/penalties; Git workflow instructs `supabase db push` while this repository's migrations are applied manually. These files are agent instructions and documentation, not implementation evidence. |
| `kubernetes_docs/README.md` | Replace with application operations entry | Original generic quick-start copies over `deploy.yml`, describes Kaniko rather than local Docker script, and instructs main push. Current `deploy.yml` gates eligible successful CI, selects approved SHA and verifies public rollout; manual dispatch differs. |
| `kubernetes_docs/migration_docs/MIGRATION_TO_KUBERNETES.md`, `kubernetes_docs/migration_docs/NOFLUXO_KUBERNETES_MIGRATION_PLAN.md` | Retire old application migration guides if compared claims are superseded | Migration proposals must not be application startup or current deployment authority. Current Dockerfiles/workflow/deploy scripts are reconstructible local sources; old acceptance/cluster state is not. |
| `kubernetes_docs/monitoring/README.md`, `kubernetes_docs/monitoring/APP_METRICS_GUIDE.md`, `kubernetes_docs/templates/README.md`, `kubernetes_docs/local_build_and_deploy/README.md` | Correct retained generic scope/links or remove outdated prose | Missing SETUP_GUIDE/DEPLOYMENT_GUIDE/API_REFERENCE/BUILD_GUIDE and implied platform capability make current runbooks unreliable. Generic helpers/templates are supporting code; do not delete them merely because narrative is stale. |
| `documentacao/index.md` | Correct public entry | Vercel/DigitalOcean deployment badges do not describe current container workflow. Link current architecture and treat address as unverified deployment reference. |
| `documentacao/arquitetura/arquitetura.md` | Replace generic architecture with current application diagram | Current frontend also connects directly to Supabase; some backend agents call Maritaca directly. 'All data on the server' and client↔server-only framing omit browser parsing and direct DB/RPC. |
| `documentacao/testes/*.md`, `docs/testes/COMO-EXECUTAR-TESTES.md` | Correct current commands/paths; retain dated results as results | Python coverage commands must target actual production modules from DBA/tests; Windows `file:///` links are not portable. Main CI versus advisory accessibility CI and inventory versus execution must be explicit. |
| `docs/design-system.md`, `docs/unb-domain.md` | Keep narrowly after selected factual checks/corrections | Theme source supports default dark, HSL tokens and runtime store; rules may express intended conventions, not universal compliance. Domain rules need separation between code assumptions and unverified official academic policy, and MATR distinction between achieved progress and planning projection. |
| `documentacao/atas/*`, academic study/requirements/storymap files, dated investigations and historical test evidence | Keep explicitly historical/reference where appropriate | These are records or intent, not claims that present architecture is unchanged. Removal based only on age would erase genuine evidence. Current-facing indexes must route to current behavior, not these historical proposals. |

## KB corrections required by cleanup

The dossiers' implementation claims checked against SSR flags, imports, controller
registry, Python routes/search constants, TypeScript orchestrator gate, and ingestion
updates were consistent with source. One overview omission needs correction: the
project Mermaid should also show backend → providers, because both
`services/chat/model_provider.ts` and `planejador_agente.service.ts` call Maritaca
directly. Its existing backend → Python → provider path is only one current path.

Additional test-guide source checks: `DBA/tests/test_upload_pdf.py` exercises a Flask
test client for the no-file error; its successful real-PDF case is skipped and depends
on an absent fixture. `mcp_agent/test_tool_call_utils.py` contains seven pure tool-text
parsing tests, not provider requests, Pydantic type validation or catalog serialization.
The public Python guide's descriptions must be replaced accordingly; test-file
existence does not prove those broader features. Atomic expression output is a string,
not the old illustrated object with null operator. Jest/Vitest/Playwright counts must
be freshly counted with a stated selection rule or omitted, never carried as current
from the older '25/42/3' catalog.

Cleanup changes the document set, so old claims such as 'originals preserved',
'no files retired', '30 plans present', and '268 current artifacts' must be removed
from current-facing protocol/index/dossiers or explicitly retained as dated initial
audit history. Inventory should represent remaining worktree files while a retirement
ledger carries original paths/hashes/revision; otherwise `git ls-files` would count
deleted-but-not-committed paths as present. Remove Markdown links to retired guides
or convert them to provenance/recovery references. Do not snapshot these changes
without reviewing the new prose.

## Final cleanup verification

Recheck date: **2026-10-08**, America/Sao_Paulo. Authors' corrected documentation
was read independently again after the findings above:

- Frontend, backend, AI and DBA entry guides now describe the source paths, current
  SSR/client split, DOM/SVG curriculum versus XYFlow planner, HTTP endpoints,
  search parameters and multi-field ingestion updates.
- Eight public architecture/testing guides were reread against Jest/Vite/Playwright,
  main CI, advisory accessibility, security-quality and Codecov configuration. The
  skipped Flask success case, pure AI helpers, self-defined scraping helpers and
  distinction between test presence and execution are now accurately described.
- Ten operations guides and the updated operations dossier were reread against
  APPS, workflow gate/SHA selection, product/generic CLI parsers, payload, cache
  ordering and dry-run behavior. Generic examples are scoped separately from the
  application; no unsupported cluster/provider capability is certified.
- Motor 2, planner/orchestrator, development impersonation, security reporting,
  old overview and current test-command pages were replaced with current contracts
  or KB routers. The domain guide now describes application assumptions/projection
  rather than claiming verified institutional regulation.
- The final residual design-system guide was reread against `app.css`, Tailwind
  config, theme store, ModeToggle, PageBackground, Input/status cards, SVG edge
  palette, PNG background selection and high-contrast selectors. Its values and
  component paths agree with source; guidelines are distinguished from achieved
  visual/accessibility compliance.
- Independent Python/Git provenance check verified **42 unique retired files**:
  each original revision/path resolves, bytes/size/SHA-256 match the manifest, the
  working-tree file is absent, and the replacement destination exists. The set is
  exactly the 42 Git deletions, with no unrecorded deletion. This includes all 29
  retired original plans, six old task-specific agent guides and seven other stale
  guides/overview/migration documents.

The first cleanup-time `npm run kb:check` was intentionally observed before the
parent completed inventory/snapshot reconciliation and failed on stale hashes,
absent ownership patterns and incomplete plan tombstones. After those corrections
and the reviewed snapshot renewal, this reviewer independently reran the actual
final commands: `npm run kb:check` **passed**, with 7 dossiers, **1,033 nodes**,
**2,526 edges**, complete inventories and a current snapshot, followed by all
**26 tooling tests passing**. `npm run kb:drift` returned **No source drift against
reviewed snapshot**. This reviewer did not modify inventories or renew snapshots.

The final report, cleanup audit, protocol, project diagram/ownership, historical
audit boundaries and decision succession were reread after integration. Counts
were independently recalculated: **271 inventory rows = 229 active + 42 retired**;
**30 plan rows = 1 current README + 29 retired originals**. All 42 retirement rows
again passed historical-byte/size/SHA checks, working-tree absence, replacement
presence and exact correspondence to Git deletions. No identified documentary
finding remains open in the reviewed scope.

Independent local verification on the final reviewed tooling/source:

| Check | Result and scope |
| --- | --- |
| `node --test scripts/docs-kb/*.test.mjs` | 26 passed, zero failures; includes authorized retirement before/after staging, historical hash/revision, reappeared path/symlink, dates and environment-template coverage. |
| `python3 test_tool_call_utils.py`, from `mcp_agent/` | 7 passed; pure functions, no configured API import or provider request. |
| `python3 test_sabia_utils.py`, from `mcp_agent/` | 27 passed; pure helpers and source/AST checks, no real HTTP/LLM/embedding request. |
| `python3 -m unittest discover -s scripts/deploy -p test_verificar_rollout.py` | 7 passed; network/clock mocked, printed rollout failures are synthetic test inputs. |
| `git diff --check` | Passed on the reviewed tracked changes. |
| Final `npm run kb:check` and `npm run kb:drift` | Independently passed after integration; exact corpus/ownership/links/retirements and reviewed-source snapshot agree. |

The source review does not verify every statement of historical records, external
links, deployed schema/domain, provider responses, browser acceptance, PDF/TeX
rendering or current test pass counts. Historical records remain evidence of their
own sessions and are scoped accordingly.
