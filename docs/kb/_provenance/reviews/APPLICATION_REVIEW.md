# Independent application documentation review

Date: 2026-10-07 (America/Sao_Paulo). Source HEAD: `c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`.

Scope: `frontend-and-academic-planning.md`, `backend-api-and-motor2.md`, `darcy-ai-orchestration.md` and application architecture in `project-and-documentation.md`. This is an independent source review, with fresh execution of the two pure Python suites. It is not production acceptance, a complete line-by-line verification of every implementation, or an independent review of every historical plan/SQL/operational statement.

Only this report was written by the reviewer. Findings were sent to the parent for corrections in the dossiers; no runtime code, provider, database, migration or deployment was changed.

## Findings

### APP-01 — P1: Project architecture attributes AI orchestration to missing Python modules

Initial claim: “`mcp_agent/api.py` expõe FastAPI; `mcp_agent/orquestrador.py` coordena os caminhos determinísticos e conversacionais.” Neither file exists in this checkout. This sends a maintainer to the wrong implementation and gives the Python service responsibility for orchestration that belongs to the Node backend.

Correct wording: “`mcp_agent/api_producao.py` expõe a API FastAPI de recomendação e busca semântica. O orquestrador SDK está em `backend/src/services/chat/orquestrador_agent.ts`; chats legados coexistem em `PlanejadorAgenteService`.”

Evidence: `mcp_agent/api_producao.py::app`, `recomendar_materias`, `buscar_materias`; `backend/src/controllers/chat_controller.ts::ChatController.routes.send`; `backend/src/services/chat/orquestrador_agent.ts::createOrquestradorAgent`; `backend/src/services/planejador_agente.service.ts::PlanejadorAgenteService`. Filesystem inventory independently confirmed the two proposed Python files are absent.

Status: closed. Corrected project dossier reread against the cited source during final application recheck.

### APP-02 — P1: Claimed route inventory omitted four registered planning routes and a paid call outside the daily question boundary

Initial claim: the “Inventário de rotas registradas” table presents the API contract, but lists only `gerar-plano` and `chat` under `/planejamento`. It omits `POST /planejamento/modulo-livre-sugestoes`, `GET /planejamento/preferencias-grade-listar`, `POST /planejamento/preferencias-grade-salvar`, and `POST /planejamento/preferencias-grade-remover`.

Required correction: inventory all four routes with token/`User-ID` authorization. Explain theme-based semantic suggestions, preferences storage, and that the direct suggestions route may call paid embeddings without `reservarPerguntaIA`, `tetoGlobalAtingido`, or inclusion in `ROTAS_IA_PAGA`. The handler does not establish `executarComContextoIA`, so it also does not explicitly propagate identity/question grouping as chats do.

Evidence: `backend/src/controllers/PlanejamentoController.ts::PlanejamentoController.routes` (the four named entries); `backend/src/services/chat/actuators/modulo_livre_actuator.ts::identificarAluno`, `sugerirModuloLivre`; `backend/src/services/sabia.service.ts::buscarMaterias`; `backend/src/config/rate_limit.ts::ROTAS_IA_PAGA`; `backend/src/index.ts` dynamic route registration. Preference save uses `upsert` with `onConflict: 'id_user,codigo_materia'`; list/delete filter `id_user`; `normalizarTurnos` filters M/T/N; code is trimmed/uppercased. Direct theme requires at least two characters and no route-specific maximum, while the downstream term limit is 80 characters.

Status: writer corrected the table and added a dedicated source-backed section during review. The updated content was reread against those source symbols; no remaining discrepancy found in that section.

### APP-03 — P2: Project dossier points to a nonexistent authorization directory

Claim: “`backend/src/middleware` e controllers fazem autorização por rota.” The directory `backend/src/middleware` does not exist.

Correct wording: global middleware configuration is in `backend/src/config/cors.ts`, `rate_limit.ts` and `body_limit.ts`; authorization helpers are in `backend/src/utils.ts` and `backend/src/utils/ia_acesso.ts` and are called by individual controllers.

Evidence: `backend/src/index.ts` imports and `app.use` ordering; `backend/src/utils.ts::Utils.getAuthenticatedUser`, `Utils.checkAuthorization`; `backend/src/utils/ia_acesso.ts::exigirLoginIA`; directory inventory of `backend/src/`.

Status: closed. Updated project dossier points to actual `config/`, `utils.ts`, `utils/ia_acesso.ts` and controllers; reread against the source.

### APP-04 — P2: Anonymous mode is described as generic visitor access to Assistente

Claim: “A Assistente admite abertura por visitante no guard, mas abre modal de login sem conta.” A new unauthenticated visitor without anonymous mode is redirected by the protected layout. Anonymous mode can enter this page, then login is required for IA.

Correct wording: “A Assistente admite abertura em modo anônimo pelo guard do grupo protegido; visitante sem conta e sem modo anônimo é redirecionado a login. A ação de IA abre modal de login quando não há conta.”

Evidence: `frontend/src/routes/(protected)/+layout.ts::load`; `frontend/src/lib/guards/authGuard.ts::decideProtectedRouteAccess` immediately rejects `!isAuthenticated && !isAnonymous`; `/assistente` is not in `PUBLIC_ROUTES_EXACT/PREFIX`; `frontend/src/lib/components/chat/ChatPanel.svelte` login gating. The dossier's earlier route table correctly says account or anonymous mode; the later phrase should use the same precise rule.

Status: closed. Updated frontend dossier explicitly distinguishes anonymous mode from an unauthenticated visitor; reread against protected layout/guard.

### APP-05 — P2: Frontend behavior omits the structured module-livre suggestion flow

Gap: current behavior describes the grade builder and its chat, but module livre only appears in the test inventory. The non-chat panel is a distinct source-backed API path with user-visible behavior and a paid dependency.

Required addition: the grade page asks for a theme and keeps structured suggestions; `candidatosModuloLivre` calls `buscarSugestoesModuloLivre` at `/planejamento/modulo-livre-sugestoes`, with local/backend filters and real offers. The page persists the student's module-livre preference/theme via `planoFormaturaStore.setPreferenciaModuloLivre`; suggestions are presented for inclusion in the pool. Cross-reference the backend's separate cost/quota limits and distinguish preference persistence from enrollment or official academic acceptance. Describe failure/fallback behavior from implementation rather than assuming all empty results mean no candidate exists.

Evidence: `frontend/src/routes/(protected)/planejamento/grade/+page.svelte::responderModuloLivre`, `buscarModuloLivre`, props passed to `MontadorGradeView`; `frontend/src/lib/services/grade-pool.service.ts::candidatosModuloLivre`; `frontend/src/lib/services/modulo-livre.service.ts::buscarSugestoesModuloLivre`; `frontend/src/lib/stores/plano-formatura.store.svelte.ts::setPreferenciaModuloLivre`; `backend/src/controllers/PlanejamentoController.ts::modulo-livre-sugestoes`.

Status: closed. The new frontend section documents the chain, failure-only literal fallback, filters, best-effort preference/theme persistence and pool inclusion; independently reread against the page, pool/service and store implementation.

### APP-06 — P3: Clarify co-requisite fallback limitation alongside the Motor 2 heuristics

Current wording says the greedy incorporates co-requisites present in the pool. That is true on the grouped branch, but incomplete if read as an academic safety guarantee. When the group does not fit, the explicit “FALLBACK: ... SOLO” branch schedules the candidate without those co-requisites; the smallest-candidate fallback is another exception to strict capacity behavior.

Suggested addition: “Co-requisitos do pool são tentados juntos, mas um fallback pode alocar a candidata sozinha quando o grupo não cabe. A heurística não garante co-requisitos satisfeitos em toda saída.”

Evidence: `backend/src/services/plano_formatura.service.ts::distribuirPorSemestres`, grouped `horasNeeded/diffNeeded` branch followed by `else if (horasUsadas + horas <= limiteHoras ...)`; fallback comment and subsequent smallest-candidate branch. Existing dossier already correctly limits broader guarantees; this makes the concrete academic limitation discoverable.

Status: closed. Parent added the explicit grouped-attempt/`SOLO` fallback limitation. Independently reread the final Motor 2 paragraph against `distribuirPorSemestres`' grouped branch and candidate-alone branch at source line 532. This documents source behavior; it is not a claim of a reproduced runtime failure or an implementation fix.

## Coverage and corroborated contracts

- Frontend: read package/build/PWA/test configuration, root/protected route guards, Supabase browser singleton/cookie storage, OAuth/profile identity lookup, local PDF parser consolidation, upload RPC payload/timeout, current-data upsert plus non-transactional history insert, personal-flow `load`, planner/API clients, three chat clients, solver masks/budget/node limit, development harness guards, and module-livre call chain. The distinctions between SSR build/dev and static hosting, direct Supabase versus Express, local state versus saved state, and public behavior versus source were checked.
- Backend: independently enumerated seven controllers and route declarations; checked bootstrap, privileged Supabase use, auth/login helpers, global/paid limiters and body parser limits, quota/cost/refund behavior, health/readiness, Tool Registry count (13), legacy history/iteration limits (20/5), SDK session storage and authenticated session ID, orchestration gates and reviewer wrappers. Motor 2 source review covers persisted-history input, MATR projection, single-pass equivalence expansion, score, 40-iteration greedy, co-requisite/capacity fallbacks, TCC/stage post-processing and `adicionarEm`. `materiasNaoAlocadas` is correctly documented as insufficient to prove full pool coverage.
- Python: independently checked global client initialization, shared-key checks and health limitations, all four HTTP routes, routing/tool/text fallback, query normalization and Gemini/RPC parameters, aggregation and card allowlist boundaries, SSE terminal usage, cost logging limitations, offline jobs, startup scripts/Docker and timeout constants. The dossier's important distinction between filtered cards and unvalidated response prose is accurate. An AST assertion in a pure test is not an HTTP integration result.
- Project: reviewed its application diagram/implementation paths, workspace/package/README facts and boundary wording. Historical-plan disposition, full SQL/RLS review, complete operations correctness and all document-inventory rows are delegated review scopes, not asserted as independently accepted by this report.

## Fresh test execution and limits

Executed independently, locally, without importing `api_producao` or accessing services:

| Command (cwd `mcp_agent/`) | Result |
|---|---|
| `python3 test_sabia_utils.py` | Exit 0; 27/27 passed |
| `python3 test_tool_call_utils.py` | Exit 0; 7/7 passed |

Neither `backend/node_modules` nor `frontend/node_modules` is present in the reviewed checkout. Jest/Vitest/build/Playwright/type-check were not executed or installed by this reviewer. Test configuration and representative test source were inspected; no new test-pass assertion is made for Node or browser behavior. Pure Python tests do not prove live auth, SSE timing, embeddings, dimension compatibility, remote SQL, provider health, costs, visual quality or deployed functionality.

## Recheck outcome

APP-01 through APP-06 were corrected and independently reread. **All initial findings are addressed; no application documentation findings remain open in this review scope.** Final application review: **PASS for source-reviewed documentation**, with the stated execution/coverage limits. No deployed/runtime acceptance follows. Later root integration must preserve these distinctions and must not promote inspected tests to executed tests.
