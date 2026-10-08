# Independent history and documentation coverage review

Reviewer: `review_history` subagent, independent of the inventory/history authors.
Reference date: 2026-10-07 (America/Sao_Paulo).
Checkout: `feat/new-docs`, HEAD `c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`.
Evidence: local source, tracked-file selection, Markdown/CSV inspection and local Git ancestry. This is not application, database, provider, deployment or visual acceptance.

## Result at first review

**Corrections required before final approval.** The substantive plan dispositions and catalog coverage are credible, but the growing KB and the root entry-point edits introduced documentary inconsistencies and stale hashes. Initial missing audit files were subsequently created and inspected; their absence is no longer a finding. The parent owns corrections outside this review file.

## Findings and exact corrections

### HIST-001 — P1: auditing the old root documents as if they were the current checkout

`DOCUMENTATION_AUDIT.md` currently states that the documents in its drift table “remain untouched by this documentation task.” `git diff -- AGENTS.md CLAUDE.md README.md` establishes that those three files have changed during the consolidation. Several rows now describe resolved drift as current: AGENTS' completed-plan wording, unconditional push deployment description, and named `no-fluxo.crianex.com` product address. The project dossier likewise says AGENTS still contains the previous address, although current AGENTS replaced it with the product name and an explicit domain-verification caveat. `PLAN_AUDIT.md` refers to the collective-completion phrase as if it remains in current AGENTS.

Exact correction:

- Distinguish original tracked content at HEAD from revised checkout content in the audit. Retain the historical findings, identify the root files updated in this task, and remove the claim that they remained untouched.
- Mark the AGENTS/CLAUDE completed-plan wording and AGENTS deployment/domain findings as corrected in this consolidation. `plans/README.md` still retains its historical blanket title, so its limitation should remain.
- Update `project-and-documentation.md` to reflect the current AGENTS domain caveat while retaining the original-domain discrepancy as historical context if useful.
- Change the opening of `PLAN_AUDIT.md` to “the original wording in AGENTS.md and the historical plans/README.md,” or equivalent precise attribution.
- Revise affected `document-inventory.csv` notes to describe the current content, then recalculate their byte sizes and hashes. Do not present a new hash with an old-content note.

### HIST-002 — P1: document-inventory validation uses a narrower scope than the audited catalog

At inspection, `scripts/docs-kb/kb.mjs:validateInventories` defined expected document files as tracked `.md` files outside `docs/kb/`. The catalog and its audit intentionally include `.tex`, license, schema SQL/JSON, test artifacts, public assets, infra helper/template sources and `mkdocs.yml`. Therefore a sound 268-row inventory produces “unexpected inventory path” errors under that implementation. This is a validation/scope mismatch, not missing catalog coverage.

Exact correction: use one explicit shared document selection rule matching `DOCUMENTATION_AUDIT.md` and the catalog producer. It must include tracked files under `docs/`, `documentacao/`, `kubernetes_docs/`, `plans/`, `backend/docs/`, `.claude/skills/`, `.github/ISSUE_TEMPLATE/`; tracked `.md/.rst/.tex/.adoc` elsewhere; `LICENSE` and `mkdocs.yml`; and exclude `docs/kb/` and `PROJECT_WIDE_DECISIONS.md`. Define whether newly created KB/tooling documents are outside this legacy-document snapshot before staging. Verify an omitted artifact is detected as well as an unexpected one.

### HIST-003 — P2: reviewed metadata and final-review references still describe bootstrap work in progress

`plan-disposition.csv:reviewed_by` says independent review is pending in all 30 rows, and `PLAN_AUDIT.md` retains the same initial-state disclaimer. `INDEX.md` links to `_provenance/reviews/FINAL_REVIEW.md`, which did not yet exist at review time. These are expected while work is active but must not remain as the final outcome. The MkDocs row claims `source-reviewed`, yet its notes say binary/support content was not inspected; the audit itself correctly describes the configuration as inspected.

Exact correction: after resolving findings, record source-review author and independent reviewer/result with an honest date/status; create the final report and keep its acceptance scope narrow; update the MkDocs row note to “Publication configuration inspected: docs_dir/documentacao, nav and docs workflow; published site/build unverified,” or equivalent. Final decisions may remain `implemented-unverified` for product/runtime evidence even when KB structural tests pass.

## Checks passed and limitations

- Reconstructed the stated document selector directly from `git ls-files -z`: **268 expected paths, 268 catalog rows**, no missing paths, extra paths or duplicate rows. There are **142 Markdown/TeX/RST/AsciiDoc/license documents and 126 supporting/extensionless artifacts**, matching the audit. Catalog counts by area/classification agree with the report.
- Plan CSV matches all **30 tracked `plans/*.md` files** exactly, including overview/master/README. That is **27 substantive plans plus 3 coordination/navigation references**, not 30 separate completed initiatives. Every plan size and SHA-256 matches its original. No original plan was moved or deleted.
- Disposition counts agree: 4 `implemented-source`, 19 `implemented-with-evolution`, 2 `partial-source`, 1 `partial-validation`, 1 `superseded`, 3 `historical-reference`.
- All cited plan evidence paths exist. All destination fields now point to `docs/kb/_provenance/PLAN_AUDIT.md`; all `decision_ids` fields are empty, consistent with an audit that does not invent accepted product decisions. The three cited commits resolve as ancestors of HEAD.
- Read the purpose/checklists of the 30 entries and inspected relevant current source references. In particular, browser auth/client guards, Supabase/RPC upload, PDF.js positioned extraction and detailed-format regex branch, four connection modes with direct default, gap/lane routing, html2canvas-pro adaptive/theme export, Chromium-only Playwright configuration, root `ssr=true` versus protected `ssr=false`, planner restrictions/agent wiring, dashboard RPC/usage layers, and conditional generic ticket options support the notes and calibrated dispositions. No blanket completion or checkbox-level acceptance is warranted.
- Protocol/root decisions distinguish code, tests, SQL/config and production, and do not infer product approval from code. The effective decisions cite direct user/repository authority for publication, secret handling, and the requested KB/review workflow; optional CI enforcement remains open. No contradiction in acceptance authority was found.
- Historical documents are cataloged rather than exhaustively fact-checked. Original external references, binary assets, TeX output, live RLS/schema, real AI usage/pricing, published domains and Flutter visual parity remain unverified. This reviewer did not execute application suites or access external services.

A recheck should resolve HIST-001 through HIST-003 and rerun content/coverage/link checks after authors finish changing the corpus. This report records evidence of the initial review; a later section will record the correction recheck.

## Correction recheck

Performed after the history/inventory authors and parent applied corrections, on the same reference date and HEAD.

- **HIST-001 resolved:** `DOCUMENTATION_AUDIT.md` now distinguishes original AGENTS wording from the reviewed root edits and discloses the uncommitted-worktree snapshot. It identifies the preserved legacy sources and removes the untouched claim. `PLAN_AUDIT.md` attributes collective completion to original AGENTS/history. `project-and-documentation.md` describes AGENTS' updated domain caveat. Recomputed all **268 document and 30 plan** byte sizes/SHA-256s: **zero mismatches**; current notes reflect corrected root documents.
- **HIST-002 resolved:** `isInventoryDocument` and `validateInventories` implement the documented selection rule. Independently invoked `validateInventories()` against this checkout: **[] (no errors)**. Independently executed `node --test scripts/docs-kb/kb.test.mjs`: **11 tests passed, 0 failures**, including exact inventory coverage/digests, links, schema, ownership and drift. These tests validate the KB tooling, not application behavior.
- **HIST-003 metadata resolved:** all plan rows now record that independent findings are present in KB reviews instead of claiming review is still pending. The MkDocs note explicitly records inspected docs_dir/nav/config and unknown deployed publication. At this recheck, `FINAL_REVIEW.md` remains an assembly dependency for the parent; its link must resolve before the final structural check. This is not a remaining substantive history/coverage objection.

**History/coverage approval:** PASS for the reviewed source dispositions, inventory completeness, metadata and authority distinctions, within the source-only scope stated above. Final corpus link/snapshot validity remains the parent's final assembly check. The initial findings above are preserved as a review/correction trail, not unresolved objections.

## Additional independent tooling correctness review

The parent requested a separate review of the new implementation against protocol/schema, beyond the prior history/coverage approval and the existing passing tests. `FINAL_REVIEW.md` now exists with explicit provisional status; HIST-003's link dependency is resolved, without implying final approval.

**Tooling correctness at this review: corrections required.** Isolated temporary Git fixtures used fake strings only; no project secrets or external services were accessed. The following defects were reproduced against `scripts/docs-kb/kb.mjs`, not merely inferred from missing test cases.

### TOOL-001 — P1: blank acceptance metadata passes as owner-confirmed approval

`value(block, name)` uses `\\s*`, which crosses newlines. With `Accepted by:` and `Accepted at:` both blank, an effective decision returns `acceptedBy = "Accepted at:"`, `acceptedAt = "Supersedes: none"`, and **zero graph errors**. This creates apparent acceptance from neighboring metadata and violates required human-acceptance provenance.

Correction: constrain field separators to horizontal whitespace, preserve blank values as blank, and reject blank/sentinel acceptance metadata. Add a regression with blank author and date immediately followed by other valid metadata, including CRLF if supported. Validate acceptance-date syntax to the documented grammar rather than treating arbitrary neighboring text as a date.

### TOOL-002 — P1: a source symlink bypasses credential exclusion

The safe-source predicate inspects the Git path, but `readFileSync` follows symlinks. A nonignored `source/alias.txt` symlink to a fake `source/.env.local` is included in `sourceSnapshot`, even though the target's name is excluded. A symlink may similarly point outside the repository. The existing `.env` test is weaker than this case because its fixture `.env` is already Git-ignored.

Correction: reject source symlinks, or resolve targets and require both repository containment and credential-safe paths before reading/hashing. Add tests for nonignored `.env.local`, sensitive key extensions, aliases to excluded files, and external symlink targets. Do not read/hash a sensitive target before deciding whether it is excluded.

### TOOL-003 — P2: open-choice validation contradicts its schema

The actual schema declares `open_statuses: ["open", "resolved", "superseded"]`, but the validator hardcodes only `open`. An OPEN entry with `Status: resolved` and valid evidence is rejected despite schema validity.

Correction: either implement the schema's accepted statuses or intentionally narrow the schema and documented lifecycle. Regression tests must use the actual open-status contract and reject invalid statuses.

### TOOL-004 — P2: current-only query truncates before removing historical results

`queryGraph` limits to 20 before `run('query', ... --current-only)` removes historical/superseded entries. A synthetic graph with 25 historical title matches for `needle` (score 1.6 each) and one current subsystem body match (score 1.5) returns **zero current matches**, although a valid current match exists.

Correction: filter eligible nodes before ranking/truncation, or rank all eligible nodes and truncate afterward. Add a regression exceeding the result limit, verifying the current match remains visible.

### TOOL-005 — P2: path-prefixed references fabricate source nodes instead of reporting dangling relations

A dossier with `related: ["path:missing.ts"]` (block-list form) yields **zero graph errors** and a generated `code_path` node whose source file does not exist. All `path:` targets bypass dangling validation, even on knowledge relations rather than `OWNS/WATCHES`. `Supersedes: path:...` can bypass the same check. Source nodes are also synthesized from every path-target edge, making the fabricated target look legitimate.

Correction: allow source paths only for `OWNS/WATCHES`, emitted from safe existing matched files; require knowledge references to resolve to appropriate existing knowledge-node types. `RELATED_TO` dossier targets should resolve to subsystems, and `SUPERSEDES` should follow the documented decision lifecycle. Add regressions for missing `path:` targets and inappropriate target types.

The parent accepted the first four findings and delegated implementation to the tooling author; TOOL-005 was sent with reproduction guidance as well. Only this review artifact was edited by the reviewer. A fresh correctness recheck will record the final outcome below.

## Tooling correction recheck and approval

**Tooling correctness review: PASS after corrections**, within the local bootstrap contract. This is an independent source/reproduction recheck, not only acceptance of the author's test summary.

The corrected implementation constrains metadata matching to horizontal whitespace and validates calendar dates while preserving explicit date annotations; rejects symlink paths and linked ancestors before source reading/hashing; supports schema-defined OPEN statuses; filters current-only candidates before the ranking limit; and rejects unresolved knowledge/path references without fabricating source nodes. Credential-template hashing is limited to the inventory path, retains symlink/ancestor safeguards, and leaves all `.env` names excluded from source snapshots. The new tooling README is explicitly outside the legacy-document inventory selector, including after staging.

Independently reran **11 adversarial fixture checks**, all PASS:

1. Actual schema baseline with annotated acceptance date, invariant verification, exact inventory and the tracked environment template.
2. Blank approval author/date in LF and CRLF inputs rejected without consuming neighboring metadata.
3. Impossible acceptance date (`2026-02-30`) rejected.
4. Schema-valid open/resolved/superseded states accepted; unknown state rejected.
5. Nonignored environment/private-key paths, internal/external symlink aliases, and linked ancestor targets excluded before hashing.
6. An inventoried environment example cannot alias a credential target.
7. Missing structured `path:` relation rejected without a fabricated source node; cross-type supersession rejected.
8. More than 20 historical matches cannot hide an eligible current-only result.
9. Graph JSON remains byte-deterministic across repeated builds.
10. Omission of a supporting JSON artifact is detected by the exact inventory selector.
11. Source additions/deletions produce drift while preserving the snapshot bytes until explicit renewal.

Independently executed the expanded authored test suite: **18 tests passed, 0 failures**. Against the real checkout, `buildGraph().errors` and `validateInventories()` both returned **[]**. The legitimate 268-row inventory is preserved, including its tracked `.env.local.example` artifact. The provisional final-report link target exists and explicitly disclaims premature approval.

No further substantive tooling defect was found in this review. The parent may now create the reviewed source snapshot and perform the final corpus check. This reviewer did not create or renew the real snapshot, stage files, alter application code, or run application/provider/deployment acceptance.
