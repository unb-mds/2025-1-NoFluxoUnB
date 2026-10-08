# Independent data, operations, and security review

Date: 2026-10-07 (America/Sao_Paulo). Review status: **PASS after targeted recheck**.

This review compares the current source against three draft dossiers:
`docs/kb/subsystems/data-ingestion-and-schema.md`,
`docs/kb/subsystems/deployment-ci-and-operations.md`, and
`docs/kb/subsystems/auth-security-and-privacy.md`.
Only this review artifact was written. No dossier, application code, schema,
workflow, or credential file was changed. No network calls, ingestion imports,
schema exports, database reads, deployments, or external reports were performed.

## Initial findings, all resolved on recheck

The findings below preserve the original review record. The dossier authors
applied corrections during the review, and this reviewer independently reread
the corrected paragraphs against the same source. None remains open.

### DOPS-01 — Describe the global cost cutoff's cache and fail-open behavior

- Severity: P2, material control limitation omitted.
- Affected dossier: `auth-security-and-privacy.md`, Identity and trust boundaries
  and Request, cost, and service controls.
- The table calls the control a global daily cost ceiling without explaining
  that it is an observed-cost check with a process-local cache. The paragraph
  explaining 503 responses could be read as implying that all quota/cost
  accounting errors close the paid path.
- Source: `backend/src/services/darcy_cota.service.ts::tetoGlobalAtingido`,
  `TETO_CACHE_MS`, `COTA_DIARIA_PADRAO`, `TETO_DIARIO_PADRAO_RS`;
  `backend/src/utils/ia_acesso.ts::reservarPerguntaIA`;
  `backend/src/utils/ai_usage_logger.ts::logAiUsage`.
- Evidence: cost is cached for 60,000 ms in the Node process; an RPC exception
  logs and returns `false`, allowing the next control to proceed. Cost recording
  is fire-and-forget, logs failures, and does not block responses. The cost check
  does not reserve spend atomically. The user question reservation is the
  distinct fail-closed control. Defaults are 30 questions per user/day and R$15
  observed daily cost, overridable through `AI_COTA_DIARIA` and
  `AI_TETO_DIARIO_RS`.
- Proposed correction: explicitly distinguish the atomic user-question quota
  from the cached, fail-open global cost cutoff. State that concurrent calls,
  cache latency, and unsuccessful usage logging prevent treating this cutoff
  as a guaranteed hard spend cap. Keep deployed environment values unknown.

### DOPS-02 — Narrow the ticket auto-resolution condition

- Severity: P2, retention/status behavior overstated.
- Affected dossier: `auth-security-and-privacy.md`, Academic data, chat content,
  logs, and deletion.
- “Daily auto-resolution of unanswered tickets after 14 days” can include
  tickets in statuses other than the one selected by the SQL.
- Source: `supabase/migrations/ticket_chat.sql`, retention block
  `$cron$`, schedule `tickets_auto_resolver_aguardando`.
- Evidence: the UPDATE only selects `status = 'aguardando_info'` and
  `updated_at < now() - interval '14 days'`. It sets `status = 'resolvido'`.
  The purge separately deletes only messages associated with resolved tickets
  whose `resolved_at` is older than six months. Both schedules require `pg_cron`.
- Proposed correction: say “tickets awaiting user information
  (`aguardando_info`) whose `updated_at` is older than 14 days.” Do not infer
  that this is a general no-response deadline, based on ticket creation time.

### DOPS-03 — Include existing-matrix status synchronization

- Severity: P2, existing-row write contract incomplete.
- Affected dossier: `data-ingestion-and-schema.md`, script 01 existing-row
  correction contract.
- Source: `DBA/database/01_insert_cursos_matrizes_materias.py::get_or_create_matriz`,
  nested `_update_row`.
- Evidence: before applying `diff_campos`, `_update_row` adds a `status` update
  whenever the supplied status is not `None` and differs from the current row.
  This write is collected in `UPDATES_MATRIZES` and applied by `flush_updates`.
- Proposed correction: include matrix `status` in the list of existing-row
  updates and distinguish its explicit rule from `REGRAS_MATRIZ` workload/JSON
  diff rules. Incoming status need not pass the nonempty string diff rule.

### DOPS-04 — Correct the subject fallback's fill-versus-correction behavior

- Severity: P2, inaccurate existing-row write description.
- Affected dossier: `data-ingestion-and-schema.md`, final paragraph of script 01
  write contracts.
- The dossier says existing subjects have direct fill operations for missing
  description, department, and workload. The direct fallback can correct already
  populated description and department fields.
- Source: `DBA/database/01_insert_cursos_matrizes_materias.py::get_or_create_materia`,
  database lookup fallback after the `CACHE_ID_MATERIA` branch.
- Evidence: nonempty `ementa` is written if it differs; nonempty `departamento`
  is written if missing or different. Positive workload is written only when
  current workload is absent/zero. These direct writes are guarded by
  `not DRY_RUN`. The cache branch already uses the broader documented diff rules.
- Proposed correction: say the fallback directly fills/corrects description and
  department, while workload is filled only when absent/zero. Do not describe all
  three fields as missing-data-only fills.

### DOPS-05 — Describe legacy-course normalization as attempted, non-atomic work

- Severity: P2, successful migration behavior implied despite swallowed errors.
- Affected dossier: `data-ingestion-and-schema.md`, script 01 legacy normalization.
- Source: `DBA/database/01_insert_cursos_matrizes_materias.py::normalizar_cursos_id_legado`.
- Evidence: dry-run returns immediately; initial legacy lookup errors return;
  matrix/equivalence FK updates each catch and suppress any exception; deleting
  the old course suppresses FK failures. The procedure can therefore leave a
  partially normalized database while continuing the ingestion run. The dossier
  correctly calls the operation structural, but says it rewires IDs and removes
  the obsolete row without this qualification.
- Proposed correction: use “attempts to create the base course, rewire matrix and
  equivalence FKs, and delete the obsolete course row”; state that caught errors
  and separate requests mean successful completion is not guaranteed or atomic.

## Confirmed source-backed statements

- Automatic deployment waits for the specific `CI` workflow path, successful
  conclusion, same-repository push, and publishes its exact SHA. Manual dispatch
  bypasses this gate. Retry responds to any failed Deploy run below attempt four.
  Source: `.github/workflows/deploy.yml::jobs.deploy`,
  `.github/workflows/deploy-auto-retry.yml::jobs.retry`.
- Deployment payload/config, target domains, mandatory variables, one replica,
  Docker build/runtime descriptions, public version checks, and absence of an
  implicit local rollout verifier agree with source. Source:
  `scripts/deploy/deploy_config.py::APPS`,
  `scripts/deploy/deploy_local.py::_deploy_payload`, `run_local_deploy`,
  `run_redeploy`, `load_env_files`, `main`,
  `scripts/deploy/verificar_rollout.py::mesmo_commit`, `esperar`, and the three
  `k8s.*.Dockerfile` files.
- `--no-push` still proceeds toward digest resolution/deploy; ordinary dry-run
  masks env values; redeploy dry-run prints the complete runtime payload.
  `.dockerignore` lacks a general root `.env` exclusion. The dossiers correctly
  describe these as source limitations without claiming a live secret exposure.
- CI filtering, main/dev full runs, package test commands, backend audit,
  informational frontend audit/a11y, and deploy independence from the auxiliary
  security workflows agree with `.github/workflows/pipelineCI.yml`,
  `security-and-quality.yml`, `a11y.yml`, `ci.yml`, `security_scan.yml`, and package
  configuration. Branch protection and actual runs remain unverified.
- Offering reconciliation selects a single explicit period and old
  `last_updated_at`; partial scraper/upsert success is not a completeness gate.
  Source: `DBA/database/03_insert_turmas.py::main`, `flush_upsert`,
  `04_reconciliar_turmas.py::listar_turmas_obsoletas`, `apagar_turmas`,
  `.github/workflows/scrape_turmas_lite.yml::jobDecisao`, `jobSyncTurmas`.
- The calendar/formatura/decision-RPC missing-schema claims are appropriately
  bounded to checked-in source. Searches of `supabase/migrations/*.sql` and the
  table/function export found no definitions for those current contracts. This
  does not establish their absence from live Supabase.
- Shared service-role versus browser-RLS separation, email-based application
  user binding, opt-in development impersonation, paid-route login, API-key
  rejection, CORS differences, byte limits, and process-local IP limiting match
  the cited source. Relevant symbols: `Utils.checkAuthorization`,
  `Utils.getAuthenticatedUser`, `usuarioDevImpersonado`, `verificar_api_key`,
  `buildCorsOptions`, `applyBodyParsers`, `applyRateLimits`.
- Vector-catalog and grade-preference policy gaps are documented as source
  gaps, not confirmed live access vulnerabilities. Quota privileged RPC grants
  and ticket owner/admin RPC checks are supported by the migration source.
- PDF local parsing, extracted-state cloud writes, historic snapshot failure
  warning, localStorage identity hydration limitations, chat item persistence,
  request excerpts, and logging caveats are appropriately separated from live
  privacy/retention compliance proof.

## Coverage and limits

The review inspected the three dossiers, workflow files, all deployment target
configuration/Dockerfiles, deployment/rollout control flow, ingestion config and
scripts 01/03/04/05, selected script 02 entry points, diff helper, schema exports
and relevant catalog/quota/ticket/preference migrations, core auth/guard/store
code, backend security helpers, session storage, usage logging, Python API-key
and endpoint declarations, and Python test configuration/files. It checked
tracked migration references and test filenames without importing ingestion
modules or reading credentials.

This review did not run tests. The operations dossier's seven passing rollout
unit tests are an author-reported execution result; this reviewer verified the
command and test/source structure but did not independently reproduce the run.
Other dossiers explicitly claim inspected tests rather than new execution
results. Backend/SQL/HTTP security testing and deployed behavior remain outside
this review. Detailed scraper extraction and every function in the large SQL
export were not audited exhaustively.

No material unsupported exposure or live-state claim was found in the operations
dossier. Its source-versus-production boundaries should be retained.

## Targeted recheck and disposition

- DOPS-01 resolved: the security page now gives the 30-question/R$15 defaults,
  process-local 60-second observed-cost cache, fail-open cost RPC behavior,
  non-atomic future-cost boundary, and distinct fail-closed question reservation.
- DOPS-02 resolved: the ticket auto-resolution description now names
  `aguardando_info` and the `updated_at` age predicate.
- DOPS-03 resolved: the data page now includes the explicit existing-matrix
  `status` synchronization rule, independent of the diff-map rules.
- DOPS-04 resolved: the data page now separates fallback description/department
  corrections from missing/zero workload fills and cached nonzero workload diffs.
- DOPS-05 resolved: the data page now describes attempted FK rewiring/deletion,
  caught exceptions, and non-guaranteed completion.

The security author also added a provider-operation coverage boundary. This
reviewer independently traced
`PlanejamentoController::modulo-livre-sugestoes` →
`modulo_livre_actuator.ts::sugerirModuloLivre` →
`SabiaService.buscarMaterias` → `api_producao.py::buscar_materias`.
The handler checks application user authorization and input/matrix availability,
then invokes semantic embeddings without `reservarPerguntaIA`,
`tetoGlobalAtingido`, or `executarComContextoIA`; its path is absent from
`ROTAS_IA_PAGA` while the global limiter still applies. The Python embedding log
accepts optional user/question IDs. The added paragraph correctly limits this
to source coverage rather than observed abuse or live spend.

Final disposition: all five initial findings are resolved, and the three
dossiers pass this bounded source correctness review. This PASS does not expand
the evidence level beyond source review or independently reproduce the
author-reported rollout unit-test result.
