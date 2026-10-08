---
id: SUB-security
aliases:
  - segurança autenticação JWT RLS privacidade
  - auth service role quotas anonymous
title: Authentication, security, and privacy boundaries
status: source-reviewed
last_verified: 2026-10-08
owns:
  - SECURITY.md
  - .gitleaks.toml
watches:
  - frontend/**
  - backend/**
  - mcp_agent/**
  - supabase/**
related:
  - SUB-frontend
  - SUB-backend
  - SUB-ai
  - SUB-data
  - SUB-ops
---

# Authentication, security, and privacy boundaries

## Scope and evidence level

This document describes controls and data movement visible in the local source on
2026-10-07. `source-reviewed` means the cited implementations and relevant tests
were inspected; it does not assert that SQL migrations are applied, deployment
environment variables are safe, secrets are rotated, or a public service has
passed a penetration test. No `.env` values, live user records, or provider state
were read for this document.

## Identity and trust boundaries

| Boundary | Identity/control in source | Evidence |
| --- | --- | --- |
| Browser → Supabase Auth | Email/password, Google OAuth/PKCE, password recovery, session refresh | `frontend/src/lib/services/auth.service.ts`: `AuthService.signIn`, `signUp`, `exchangeCodeForSessionAndHandleCallback`, `verifyRecoveryToken`, `refreshSession` |
| Browser → Supabase tables/RPCs | Public browser client key plus session; user isolation depends on database policies/functions | `frontend/src/lib/supabase/client.ts`: `createSupabaseBrowserClient`; `frontend/src/lib/services/supabase-data.service.ts`: `saveFluxogramaData`; `supabase/migrations/latest_init_from_export.sql`: `users_select_own`, `dados_users_*_own` |
| Browser → Express user operations | Supabase token checked server-side, with application `User-ID` validated for appropriate handlers | `backend/src/utils.ts`: `Utils.getAuthenticatedUser`, `Utils.checkAuthorization` |
| Express → Supabase | Shared service-role client; application authorization must precede user-specific queries/writes | `backend/src/supabase_wrapper.ts`: `SupabaseWrapper.init` |
| Express → guarded paid chat/recommendation paths | Login, route-specific IP limiter, cached daily cost check, atomic daily question reservation | `backend/src/config/rate_limit.ts`: `ROTAS_IA_PAGA`; `backend/src/utils/ia_acesso.ts`: `exigirLoginIA`, `reservarPerguntaIA` |
| Express → Python Darcy | Shared `X-API-Key`; Python endpoints validate with constant-time comparison | `backend/src/services/sabia.service.ts`: `SabiaService.buildHeaders`; `mcp_agent/api_producao.py`: `verificar_api_key` |
| Python → Supabase/providers | Service-role Supabase client, Google embedding client, Maritaca OpenAI-compatible client | `mcp_agent/api_producao.py`: global client initialization |

The backend's service-role connection and browser RLS protections are different
boundaries. A policy protecting direct browser access does not authorize an
Express handler: that handler must independently bind operations to the verified
user. Conversely, frontend route guards control navigation, while database RLS
and authenticated backend handlers control data access.

## Frontend navigation and session state

`frontend/src/hooks.server.ts` is deliberately empty. The static SPA runs its
guards in the browser. The effective public-route classifier is
`frontend/src/lib/guards/authGuard.ts:isPublicRoute`: it includes the exact landing,
login, signup, recovery, callback, terms, privacy, accessibility, and introduction
routes, plus `/fluxogramas`, `/disciplinas`, and `/meu-fluxograma` and their nested
paths. `frontend/src/lib/config/routes.ts` still labels the last three as protected
and exposes a separate `requiresAuth`; those constants should not be mistaken for
the effective classifier used by the guards.

The protected route group's `frontend/src/routes/(protected)/+layout.ts:load`
calls `guardProtectedRoute` before page mount. It waits for
`AuthService.ensureSessionBootstrapped`, checks authenticated session validity,
then applies `decideProtectedRouteAccess`. Anonymous mode can enter routes such
as `/assistente` and `/upload-historico`; `/plano-formatura`, `/suporte`, and
`/admin` require a real authenticated user. Access to the assistant screen does
not grant paid model access: the backend requires login for those requests.

Admin navigation maps `/admin/tickets` to `tickets`, `/admin/configuracoes` to
`settings`, and the remaining `/admin` area to `dashboard` using
`requiredAdminScope`; `hasAdminScope` allows a superadmin in every scope.
`AuthService.enrichWithAdmin` reads `get_my_admin` and falls back to non-admin on
error. The older `checkAuth` helper has an early anonymous allow; the stronger
protected-layout decision must therefore be retained when interpreting admin
navigation. `frontend/src/lib/guards/authGuard.test.ts` specifically covers
anonymous admin denial and scope decisions.

`frontend/src/lib/stores/auth.ts:getInitialState` hydrates `nofluxo_user` from
localStorage only when it has a positive numeric user ID and an email-like value.
That record contains the user model, including a token when populated, academic
state, and admin fields; hydration alone is not token verification.
`checkSessionStillValid` consults Supabase session expiry before allowing an
authenticated guarded route. Browser Supabase cookies use `SameSite=Lax`, `/`, a
seven-day default lifetime, and `Secure` on HTTPS; they are written through
`document.cookie` by `frontend/src/lib/supabase/client.ts:criarCliente`.

## Backend authorization and development impersonation

`Utils.getAuthenticatedUser` validates the supplied token through Supabase
`auth.getUser`. `Utils.checkAuthorization` additionally requires `User-ID`, looks
up `users.id_user`, and compares its email to the authenticated token's email.
This is email-based application-user binding in this helper, rather than an
`auth_id` comparison. The user-profile routes in
`backend/src/controllers/users_controller.ts` use verified token identity:
`criarUsuario` derives email/auth ID from the token, and `get-user-by-email`
rejects a query email that differs from the authenticated user's email.

`backend/src/controllers/fluxograma_controller.ts` checks `checkAuthorization`
before `upload-dados-fluxograma` and `delete-fluxograma` manipulate `dados_users`.
`backend/src/controllers/PlanejamentoController.ts` also checks it for the
user-bound plan and grade-preference handlers. These are per-handler checks;
the Express bootstrap does not install a universal authentication middleware.
Public catalog/calculation handlers should therefore be assessed individually.

Local impersonation is explicitly gated twice: the browser's
`frontend/src/routes/dev/impersonar/+page.ts:load` rejects production/non-development
builds, while the backend requires both `NODE_ENV !== 'production'` and
`ALLOW_DEV_IMPERSONATE === 'true'`. The `X-Dev-Impersonate` email must match the
database row selected by `User-ID`. `usuarioDevImpersonado` additionally requires
that row's `auth_id` for paid IA identity. The frontend's developer session-validity
bypass does not by itself enable the backend bypass. Actual deployed environment
settings remain unknown.

`backend/src/controllers/chat_controller.ts:send` chooses the authenticated user's
UUID for its `SupabaseSession`, rather than accepting an arbitrary user session
ID. `backend/src/services/chat/supabase_session.ts` persists `chat_sessions` and
`chat_items` with the service-role client. The migrations named for these tables
in `docs/chatbot-orquestrador.md` are absent from the current tracked migration
set, and the export baseline does not include them; their live schema, grants,
RLS, and retention cannot be confirmed from that baseline.

## Request, cost, and service controls

`backend/src/index.ts` applies Helmet, the CORS allowlist, rate limits, then body
parsers before mounting the route registry. `buildCorsOptions` permits fixed
application/legacy domains, additive `ALLOWED_ORIGINS`, requests without Origin,
and localhost/127.0.0.1 on any port. Disallowed origins omit browser CORS headers;
CORS is not an authentication boundary. Credentials are disabled in this Express
CORS configuration. The allowed-header list includes `Authorization` and
`User-ID` but does not list `X-Dev-Impersonate`.

`resolveTrustProxy` defaults to one hop and is configurable with `TRUST_PROXY`.
The source defaults are 120 requests per minute per IP globally and 20 on paid
IA routes; `/` and `/health` skip the global limiter. These are in-process
`express-rate-limit` instances with no external shared store configured here.
The effective IP boundary depends on the deployed proxy topology.

`backend/src/config/body_limit.ts:applyBodyParsers` imposes a 1 MB default,
5 MB on the two fluxogram JSON endpoints, and 2 MB on plan generation/chat.
Parser errors return brief 413/400 JSON responses. Paid IA input validation and
quota code are separate from these byte limits. `backend/src/services/darcy_cota.service.ts`
defaults to 30 questions per user per Brasília day and R$15 in daily recorded IA
cost, configurable with `AI_COTA_DIARIA` and `AI_TETO_DIARIO_RS`.
`tetoGlobalAtingido` reads `darcy_custo_ia_hoje` through a process-local 60-second
cache and returns false when that cost RPC fails: the cost check fails open.
It checks accumulated recorded spend, not an atomic reservation of future model
cost, so the configured value is not proof of a hard financial ceiling.
`reservarPerguntaIA` returns 503 when the cached daily cost reaches the threshold
or the atomic user-question reservation fails; the latter fails closed. It returns
429 for exhausted daily user quota. Its refund callback is idempotent. Failure
refunds and disconnect semantics depend on controller call placement; the stream
cases are covered in `backend/tests-ts/darcy-login-cota.test.ts`.

The control set does not encompass every paid provider operation.
`PlanejamentoController`'s authenticated `/planejamento/modulo-livre-sugestoes`
handler validates the user, theme, and curriculum, then calls
`backend/src/services/chat/actuators/modulo_livre_actuator.ts:sugerirModuloLivre`.
That calls `SabiaService.buscarMaterias`, which reaches Python `/buscar-materias`
and performs Gemini semantic embeddings. This handler does not reserve a daily
question or check the daily cost threshold, and its path is absent from
`ROTAS_IA_PAGA`; it receives the global IP limiter, not the tighter paid-route
limiter. It also does not create `executarComContextoIA` context: standalone
embedding usage can therefore be recorded without user/question attribution.
This is a verified source coverage boundary, not a claim about observed abuse
or deployed spend.

Python's `/buscar-materias`, `/recomendar`, and `/recomendar-stream` declare
`Depends(verificar_api_key)`. Missing configured server key produces 503, while
missing/mismatched request key produces 401. `/health` is intentionally public
and returns service/version/commit metadata; this is process health, not proof
that every downstream credential, database policy, or model call works. Python
CORS uses its own comma-separated `ALLOWED_ORIGINS`, localhost defaults,
credentials enabled, POST/GET, and unrestricted request-header names. It does not
share the Express allowlist automatically.

## Database authorization and unresolved source gaps

The baseline `supabase/migrations/latest_init_from_export.sql` contains own-user
RLS policies for `users`, `dados_users`, `historicos_usuarios`, notifications, and
vacancy subscriptions. Admin functions `get_my_admin`, `has_admin_scope`,
`is_superadmin`, and `is_ticket_admin` resolve the authenticated UUID against
`admins`. Dashboard metrics and settings functions check their respective
scopes, while ticket policies use owner-or-ticket-admin conditions.

`supabase/migrations/ticket_chat.sql` adds SELECT-only message policies and
authenticated RPC grants. `get_ticket_messages` and `ticket_add_message` enforce
ticket ownership or ticket-admin access; the latter checks content length,
resolved status, and a three-second author/ticket rate interval. The quota
migration `20260929_darcy_cota.sql` grants reservation/refund/state/cost RPCs to
`service_role`, while selected support/admin RPCs require authenticated callers
and check permissions internally. A `SECURITY DEFINER` function needs its own
permission check and appropriate EXECUTE grants; table RLS alone is insufficient.

The following are source gaps, not confirmed live vulnerability diagnoses:

| Gap | Evidence and limit |
| --- | --- |
| Vector catalog deliberately remains without RLS in the catalog patch | `20260928_rls_catalogo.sql` explicitly leaves `materias_vetorizadas` pending until ingestion jobs consistently require service-role keys; `backend/tests-ts/db/catalogo.pglite.test.ts` preserves and tests this exception. Live grants were not queried. |
| Grade preference table migration contains no RLS enable/policies | `supabase/migrations/preferencias_grade.sql` creates `preferencias_grade` with application user IDs; the backend checks users before its preference handlers. Direct database exposure still depends on live grants/schema. |
| Export is a snapshot, not applied-state proof | Baseline policies and subsequent SQL files do not establish what has been manually applied to Supabase. |
| Session schema is not reconstructible from tracked migration files | Runtime `SupabaseSession` names tables absent from the baseline and references historical migration names via the orchestrator document. |

## Academic data, chat content, logs, and deletion

The current upload path parses the PDF in-browser using
`frontend/src/lib/services/upload.service.ts:parsePdfLocally` and the PDF parser.
`validatePdfFile` in `frontend/src/lib/utils/fileValidation.ts` limits files to
10 MB, checks extension/MIME, and requires `%PDF-` within the first 1024 bytes.
`casarDisciplinas` strips `full_text` before sending the extracted JSON to the
Supabase RPC. Local PDF parsing does not mean all extracted data stays local.

`saveFluxogramaData` directly upserts the current academic state in `dados_users`
and, when metadata is supplied, inserts a snapshot in `historicos_usuarios`:
matrícula, course/curriculum, semester, IRA, weighted average, workload, suspensions,
and flowchart/progress information. A snapshot failure logs a warning after the
current-state save. `deleteFluxogramaData` deletes the current `dados_users` row;
this operation alone is not proof that academic history, chat items, tickets,
usage logs, backups, or an Auth account are deleted.

`SupabaseSession.addItems` stores complete agent input items. `logAiUsage` in
`backend/src/utils/ai_usage_logger.ts` records authenticated user/question IDs,
token counts, duration/success, and the first 120 characters of `requestExcerpt`.
The baseline restricts IA usage reads to dashboard admins. Python logs include
search terms and, on the non-stream recommendation path, the raw generated
response. User-controller logs include email/application user identifiers.
No evidence here establishes that every log sink redacts personal data.

`frontend/src/routes/privacidade/+page.svelte` contains statements about local/API
processing, necessary retention, user rights, and advertising cookies. Those are
published policy text in source, not an independently verified compliance or
provider-retention audit. `ticket_chat.sql` contains a dedicated message-retention
section; it should not be generalized into a retention policy for academic data,
all chat paths, or usage logs. The ticket schedules only install when `pg_cron`
exists: daily auto-resolution only of tickets in `aguardando_info` with
`updated_at` older than 14 days, and weekly
deletion of messages on tickets resolved more than six months ago. Applied
scheduling and actual deletions were not verified.

## Secret scanning and reporting guidance

`.gitleaks.toml` extends default detector rules and adds Supabase secret-key and
legacy service-role patterns. It allowlists generated/dependency files and public
publishable-key/placeholders. `.github/workflows/security_scan.yml` pins Gitleaks,
scans full Git history against a baseline on main pushes, daily schedule, and
manual dispatch, uses redacted reports, and writes selected finding metadata to
`security_scans`. New findings fail the job. A baseline suppresses known findings
for that check; it does not prove credential rotation, safe deployed secrets,
or absence of secrets outside the scanner's rules.

`SECURITY.md` now states that this checkout has no confirmed confidential reporting
channel. The unsupported private/draft-PR instructions and response timeline were
removed during cleanup; maintainers must confirm a confidential channel before
sensitive material is sent. No private GitHub feature is assumed enabled.
This KB pass did not execute that workflow, send reports, scan secret values,
or perform remediation.

## Verification map

Inspected tests include frontend `authGuard.test.ts`, `auth.service.test.ts`,
`assistente.service.auth.test.ts`, and `fileValidation.test.ts`; backend
`users_controller.test.ts`, `darcy-login-cota.test.ts`, `cors-origins.test.ts`,
`rate-limit.test.ts`, `body-limit.test.ts`, and the catalog/quota/dashboard/saldo
PGlite suites under `backend/tests-ts/db/`. Controller mocks validate application
decisions, and PGlite checks local SQL behavior; neither verifies live Supabase
configuration. No test run result is claimed by this document. The current Python
unit files exercise parsing and Sabiá utilities; a dedicated HTTP integration
suite proving API-key rejection on every Python endpoint was not found in this
source inspection. Full live authorization, retention, cross-user attack tests,
provider settings, and deployed proxy/IP behavior remain unverified.

## Publication-base recheck

The upstream `SobreNosSection.svelte` change only updates a team GitHub username.
It does not change the reviewed authentication or privacy contracts. No application
runtime change is introduced relative to the PR's current main base.
