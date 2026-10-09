# Local knowledge-base tooling

`kb.mjs` uses Node built-ins and local Git metadata. It reads canonical Markdown,
tracked-document inventories and explicitly reviewed source hashes. It does not
load `.env`, contact services, run application code/tests, change runtime settings,
apply SQL, send messages or publish anything. These commands run from repository
root; no package installation is necessary.

```bash
node scripts/docs-kb/kb.mjs check
node scripts/docs-kb/kb.mjs query "Como funciona o Darcy?"
node scripts/docs-kb/kb.mjs query "PDF histórico" --current-only
node scripts/docs-kb/kb.mjs graph
node scripts/docs-kb/kb.mjs drift
node --test scripts/docs-kb/kb.test.mjs
```

`graph` prints deterministic JSON to stdout, without a timestamp or cache writes.
`query` ranks stable IDs, titles, aliases and body tokens, normalizing Portuguese
accents and English/Portuguese stop words. Current dossiers receive higher weight;
historical plans and superseded/rejected entries receive lower weight. This lexical
retrieval needs useful aliases and source review; it does not infer missing facts.
`--current-only` excludes historical plans and superseded/rejected decisions.

`check` rejects missing frontmatter, duplicate IDs, invalid schema status/evidence
values, dangling related/supersedes references, broken local Markdown file links,
missing index routes, unmatched ownership patterns, overlapping ownership of actual
files, changed inventory digests, incomplete inventory coverage and source drift.
Acceptance provenance is required for effective decisions, with a real calendar
date in ISO `YYYY-MM-DD` format; explanatory annotations may follow the date.
Invariant verification
states remain separate from decision implementation states. File-link validation
checks target existence; it does not verify anchors or factual correctness of prose.

Ownership patterns support `*`, `**`, `**/` and `?`, relative to repository root.
`owns` is exclusive across dossiers; `watches` can overlap. Graph ownership uses
existing tracked and nonignored local files so a new source file can trigger review.
Credentials named `.env`/`.env.*` and private-key file extensions are excluded from
source hashing. Symbolic links, including paths beneath a linked directory, are
excluded before reading any source contents. Ignored dependencies and local remnants
are not included.

The plan inventory covers tracked `plans/**/*.md`, including its README, plus
verified retirement tombstones for removed plans.
The document inventory uses `git ls-files -z`, excludes `docs/kb/`, `scripts/docs-kb/` and the new root
`PROJECT_WIDE_DECISIONS.md` and `scripts/docs-kb/`, and includes paths under `docs/`, `documentacao/`,
`kubernetes_docs/`, `plans/`, `backend/docs/`, `.claude/skills/`,
`.github/ISSUE_TEMPLATE/`; any `.md`, `.rst`, `.tex`, `.adoc` file; and exact
`LICENSE`/`mkdocs.yml`; and tracked `.env.example`/`.env.sample` templates, including
qualified names such as `.env.local.example`, anywhere in the repository. Real
environment files do not enter the catalog through this template rule.
Supporting binaries/assets inside those documentation trees
are inventoried without interpreting their contents. Both CSVs require
`source_path` (legacy `path` is accepted), `content_sha256` and `size_bytes`.
Additional reviewed metadata columns are preserved and accepted. Removed documents
remain inventory rows with `retirement_state=retired` and a full `source_revision`.
They must match `docs/kb/_provenance/document-retirement.csv` in revision, SHA and byte
size. That manifest requires `source_path`, `source_revision`, `content_sha256`,
`size_bytes`, `reason`, `destination`, `authorized_by` and `retired_at`. The retired
path must remain absent; destination files must exist; owner authorization and a real
ISO retirement date must be recorded. Original bytes are checked from local Git using
structured arguments and a complete commit SHA, with historical symlinks rejected.
Both plan and document inventories may reference the same manifest tombstone. A
reappeared source, missing authorization, unknown revision or changed historical
digest fails. The tool never deletes documents or invents retirement approval.
Queries label removed plans `retired` and show their recovery revision and original
path; `--current-only` excludes all historical plans.
Tracked and explicitly inventoried `.env.*.example`/`.env.*.sample` templates are
hash-checked as documentation artifacts; they remain excluded from source snapshots.
This template exception never permits symlink aliases or real `.env` files.

The checker does not automatically rewrite inventories or snapshots. After reviewing
source changes and updating affected dossiers, create the reference explicitly:

```bash
node scripts/docs-kb/kb.mjs snapshot
git diff -- docs/kb/_provenance/source-snapshot.json
node scripts/docs-kb/kb.mjs check
```

`snapshot` is the only mutating command: it writes
`docs/kb/_provenance/source-snapshot.json` with local HEAD, dossier hashes and
owned/watched source hashes. `drift` compares paths and content hashes, including
added/deleted files, and never silently renews the reference. It exits nonzero when
sources need review, even in bootstrap. A changed dossier alone cannot erase source
drift; a reviewed explicit snapshot is required. Source hashes prove neither test
execution nor deployment. Snapshot hashes are evidence of checkout contents, not
the validity of the author's conclusions.

Tests use isolated temporary Git repositories and verify rejection of real structural
defects, CSV digest/coverage failures, glob overlap, deterministic graph output,
accent-aware retrieval and drift without automatic writes. They exercise this
documentation tooling, not frontend/backend/Python behavior.
