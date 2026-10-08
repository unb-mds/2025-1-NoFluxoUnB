import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildGraph, checkDrift, gitFiles, globRegex, isInventoryDocument,
  parseCsv, queryGraph, run, sourceSnapshot, validateInventories } from './kb.mjs';

const digest = (content) => crypto.createHash('sha256').update(content).digest('hex');
const dossier = (id = 'SUB-alpha', owns = 'source/**', related = '') => `---
id: ${id}
title: Darcy e planejamento acadêmico
status: source-reviewed
last_verified: 2026-10-07
aliases:
  - academic planning
  - currículo
owns:
  - ${owns}
related: ${related || '[]'}
---
# Darcy

Current source behavior: planejamento, histórico e currículo acadêmico.

### INV-ALPHA-001 — Evidência de fonte

Status: effective
Verification status: source-reviewed
Evidence class: derived-code

The implementation is source-reviewed.
`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nofluxo-kb-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--quiet');
  git('config', 'user.name', 'KB Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  write('source/a.ts', 'export const planning = true;\n');
  write('source/nested/b.ts', 'export const history = true;\n');
  write('plans/README.md', '# Historical plan index\n');
  write('plans/01-planning.md', '# Planning migration\n');
  write('docs/guide.md', '# Engineering guide\n');
  write('.gitignore', 'source/.env\n');
  write('docs/kb/_GRAPH_SCHEMA.json', JSON.stringify({ version: 1,
    decision_statuses: ['proposed', 'effective', 'superseded', 'rejected'],
    implementation_statuses: ['not-implemented', 'partial', 'implemented-unverified', 'verified-local', 'verified-production', 'rolled-back'],
    evidence_classes: ['owner-confirmed', 'derived-code', 'curated'],
    invariant_statuses: ['proposed', 'effective', 'superseded'],
    verification_statuses: ['unverified', 'source-reviewed', 'verified-local', 'verified-production'] }));
  write('docs/kb/subsystems/alpha.md', dossier());
  write('docs/kb/INDEX.md', '[SUB-alpha](./subsystems/alpha.md)\n');
  write('docs/kb/OPEN_DECISIONS.md', '# Open choices\n');
  write('PROJECT_WIDE_DECISIONS.md', `# Global decisions

### DEC-GLOBAL-001 — Documentation authority

Decision status: effective
Implementation status: implemented-unverified
Evidence class: owner-confirmed
Accepted by: fixture owner
Accepted at: 2026-10-07
Supersedes: none

Source review never proves deployment.
`);
  git('add', '.');
  git('commit', '--quiet', '-m', 'Fixture source');
  const inventory = (files, plan) => {
    const header = plan ? 'source_path,content_sha256,size_bytes,title,disposition\n' : 'source_path,content_sha256,size_bytes\n';
    return header + files.map((file) => {
      const bytes = fs.readFileSync(path.join(root, file));
      return `${file},${digest(bytes)},${bytes.length}${plan ? ',Historical planning,historical-reference' : ''}`;
    }).join('\n') + '\n';
  };
  const tracked = gitFiles(root);
  write('docs/kb/_provenance/plan-disposition.csv', inventory(tracked.filter((file) => file.startsWith('plans/') && file.endsWith('.md')), true));
  write('docs/kb/_provenance/document-inventory.csv', inventory(tracked.filter(isInventoryDocument), false));
  write('docs/kb/_provenance/source-snapshot.json', `${JSON.stringify(sourceSnapshot(root), null, 2)}\n`);
  return { root, write, git, read: (file) => fs.readFileSync(path.join(root, file), 'utf8') };
}

const csv = (rows) => {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return `${headers.join(',')}\n${rows.map((row) => headers.map((key) => `"${String(row[key] || '').replaceAll('"', '""')}"`).join(',')).join('\n')}\n`;
};

function retire(f, file = 'plans/01-planning.md') {
  const bytes = fs.readFileSync(path.join(f.root, file));
  const revision = f.git('rev-parse', 'HEAD').trim();
  const manifest = { source_path: file, source_revision: revision, content_sha256: digest(bytes), size_bytes: String(bytes.length),
    reason: 'Explicit owner-approved stale document retirement', destination: 'docs/kb/INDEX.md',
    authorized_by: 'fixture owner', retired_at: '2026-10-07' };
  f.write('docs/kb/_provenance/document-retirement.csv', csv([manifest]));
  for (const ledger of ['plan-disposition.csv', 'document-inventory.csv']) {
    const location = `docs/kb/_provenance/${ledger}`;
    const rows = parseCsv(f.read(location)).map((row) => row.source_path === file
      ? { ...row, retirement_state: 'retired', source_revision: revision } : row);
    f.write(location, csv(rows));
  }
  fs.unlinkSync(path.join(f.root, file));
  return manifest;
}

test('baseline validates, graph is byte-deterministic and query respects accents', (t) => {
  const { root } = fixture(t);
  assert.equal(run('check', [], root).code, 0);
  const first = run('graph', [], root);
  assert.equal(first.code, 0);
  assert.equal(first.output, run('graph', [], root).output);
  assert.ok(!first.output.includes('generatedAt'));
  assert.equal(queryGraph(buildGraph(root).graph, 'curriculo')[0].id, 'SUB-alpha');
  assert.equal(queryGraph(buildGraph(root).graph, 'academic planning')[0].id, 'SUB-alpha');
  assert.ok(!run('query', ['planning', '--current-only'], root).output.includes('historical_plan'));
});

test('rejects duplicate IDs and dangling related/supersedes references', (t) => {
  const { root, write } = fixture(t);
  write('docs/kb/subsystems/beta.md', dossier('SUB-alpha', 'docs/guide.md', 'SUB-missing'));
  write('PROJECT_WIDE_DECISIONS.md', `### DEC-GLOBAL-002 — Reversal
Decision status: proposed
Implementation status: not-implemented
Evidence class: curated
Supersedes: DEC-MISSING-001
`);
  const errors = buildGraph(root).errors.join('\n');
  assert.match(errors, /Duplicate knowledge id: SUB-alpha/);
  assert.match(errors, /dangling RELATED_TO reference SUB-missing/);
  assert.match(errors, /dangling SUPERSEDES reference DEC-MISSING-001/);
});

test('detects overlapping actual files even when ownership patterns differ', (t) => {
  const { root, write } = fixture(t);
  write('docs/kb/subsystems/beta.md', dossier('SUB-beta', 'source/nested/*.ts').replace('INV-ALPHA-001', 'INV-BETA-001'));
  const errors = buildGraph(root).errors.join('\n');
  assert.match(errors, /Overlapping ownership for source\/nested\/b.ts: SUB-alpha, SUB-beta/);
  assert.doesNotMatch(errors, /Overlapping ownership for source\/a.ts/);
});

test('rejects missing required metadata and unmatched source ownership', (t) => {
  const { root, write } = fixture(t);
  write('docs/kb/subsystems/alpha.md', dossier('SUB-alpha', 'absent/**').replace('last_verified: 2026-10-07\n', ''));
  const errors = buildGraph(root).errors.join('\n');
  assert.match(errors, /missing frontmatter last_verified/);
  assert.match(errors, /owns pattern matches no repository files: absent/);
});

test('schema rejects invalid implementation/evidence and missing acceptance', (t) => {
  const { root, write, read } = fixture(t);
  write('PROJECT_WIDE_DECISIONS.md', read('PROJECT_WIDE_DECISIONS.md')
    .replace('implemented-unverified', 'live-probably').replace('owner-confirmed', 'looks-good')
    .replace('Accepted by: fixture owner\n', ''));
  const errors = buildGraph(root).errors.join('\n');
  assert.match(errors, /invalid Implementation status live-probably/);
  assert.match(errors, /invalid Evidence class: looks-good/);
  assert.match(errors, /effective decision requires acceptance provenance/);
});

test('blank acceptance metadata cannot consume the following field', (t) => {
  const { root, write, read } = fixture(t);
  const original = read('PROJECT_WIDE_DECISIONS.md');
  for (const replacement of [
    original.replace('Accepted by: fixture owner', 'Accepted by:   '),
    original.replace('Accepted at: 2026-10-07', 'Accepted at:\t'),
    original.replace('Accepted by: fixture owner', 'Accepted by:').replace('Accepted at: 2026-10-07', 'Accepted at:'),
  ]) {
    write('PROJECT_WIDE_DECISIONS.md', replacement);
    assert.match(buildGraph(root).errors.join('\n'), /effective decision requires acceptance provenance/);
  }
  write('PROJECT_WIDE_DECISIONS.md', original.replace('Accepted at: 2026-10-07', 'Accepted at: 2026-02-30'));
  assert.match(buildGraph(root).errors.join('\n'), /requires a valid ISO Accepted at date/);
  write('PROJECT_WIDE_DECISIONS.md', original.replace('Accepted at: 2026-10-07', 'Accepted at: 2026-10-07 (owner reconfirmed)'));
  assert.deepEqual(buildGraph(root).errors, []);
});

test('open decisions accept configured resolved/superseded states and reject unknown states', (t) => {
  const { root, write, read } = fixture(t);
  const schema = JSON.parse(read('docs/kb/_GRAPH_SCHEMA.json'));
  schema.open_statuses = ['open', 'resolved', 'superseded'];
  write('docs/kb/_GRAPH_SCHEMA.json', JSON.stringify(schema));
  for (const status of schema.open_statuses) {
    write('docs/kb/OPEN_DECISIONS.md', `### OPEN-ALPHA-001 — Pending choice\nStatus: ${status}\nEvidence class: curated\n`);
    assert.deepEqual(buildGraph(root).errors, []);
  }
  write('docs/kb/OPEN_DECISIONS.md', '### OPEN-ALPHA-001 — Pending choice\nStatus: approved-maybe\nEvidence class: curated\n');
  assert.match(buildGraph(root).errors.join('\n'), /invalid open-decision Status: approved-maybe/);
});

test('related references cannot inject path nodes and supersession respects knowledge type', (t) => {
  const { root, write, read } = fixture(t);
  write('docs/kb/subsystems/alpha.md', dossier('SUB-alpha', 'source/**', 'path:missing.ts'));
  write('PROJECT_WIDE_DECISIONS.md', read('PROJECT_WIDE_DECISIONS.md').replace('Supersedes: none', 'Supersedes: SUB-alpha'));
  const { graph, errors } = buildGraph(root);
  assert.match(errors.join('\n'), /dangling RELATED_TO reference path:missing.ts/);
  assert.match(errors.join('\n'), /SUPERSEDES must reference the same knowledge type/);
  assert.ok(!graph.nodes.some((node) => node.id === 'path:missing.ts'));
});

test('current-only filtering occurs before the query limit', () => {
  const graph = { nodes: [
    ...Array.from({ length: 25 }, (_, index) => ({ id: `HIST-${index}`, type: 'historical_plan', title: 'needle', status: 'historical-reference' })),
    { id: 'SUB-alpha', type: 'subsystem', title: 'Current subsystem', text: 'needle', status: 'source-reviewed' },
  ] };
  assert.ok(!queryGraph(graph, 'needle').some((node) => node.id === 'SUB-alpha'));
  assert.equal(queryGraph(graph, 'needle', 20, { currentOnly: true })[0].id, 'SUB-alpha');
});

test('uses schema verification_statuses for invariants', (t) => {
  const { root, write } = fixture(t);
  write('docs/kb/subsystems/alpha.md', dossier().replace('Verification status: source-reviewed', 'Verification status: tested-in-my-head'));
  assert.match(buildGraph(root).errors.join('\n'), /INV-ALPHA-001: missing or invalid Verification status/);
});

test('checks local Markdown link files and prevents repository escape', (t) => {
  const { root, write } = fixture(t);
  write('docs/kb/INDEX.md', '[SUB-alpha](./subsystems/alpha.md)\n[Missing](./missing.md)\n[Escape](../../../outside.md)\n');
  const errors = buildGraph(root).errors.join('\n');
  assert.match(errors, /missing local link target .\/missing.md/);
  assert.match(errors, /local link escapes repository/);
});

test('requires exact inventory coverage and unchanged byte digests', (t) => {
  const { root, write, read } = fixture(t);
  write('docs/guide.md', '# Changed guide\n');
  write('docs/kb/_provenance/plan-disposition.csv', read('docs/kb/_provenance/plan-disposition.csv')
    .split('\n').filter((line) => !line.startsWith('plans/README.md,')).join('\n'));
  const errors = validateInventories(root).join('\n');
  assert.match(errors, /content digest differs for docs\/guide.md/);
  assert.match(errors, /missing inventory row plans\/README.md/);
});

test('drift tracks modified, added and deleted source paths without rewriting snapshot', (t) => {
  const { root, write, read } = fixture(t);
  const snapshotPath = 'docs/kb/_provenance/source-snapshot.json';
  const before = read(snapshotPath);
  write('source/a.ts', 'export const planning = false;\n');
  write('source/new.ts', 'export const newSource = true;\n');
  fs.unlinkSync(path.join(root, 'source/nested/b.ts'));
  const drift = checkDrift(root);
  assert.deepEqual(drift.errors, []);
  assert.deepEqual(drift.stale[0].paths, ['source/a.ts', 'source/nested/b.ts', 'source/new.ts']);
  assert.equal(run('drift', [], root).code, 1);
  // check: drift é aviso por padrão e erro com --strict
  const check = run('check', [], root);
  assert.equal(check.code, 0);
  assert.match(check.output, /WARN STALE/);
  assert.equal(run('check', ['--strict'], root).code, 1);
  assert.equal(read(snapshotPath), before);
  assert.equal(run('snapshot', [], root).code, 0);
  assert.equal(run('drift', [], root).code, 0);
});

test('source snapshot excludes env credentials and fails closed without snapshot', (t) => {
  const { root, write } = fixture(t);
  write('source/.env', 'FIXTURE_SECRET=not-a-real-key\n');
  assert.ok(!JSON.stringify(sourceSnapshot(root)).includes('.env'));
  fs.unlinkSync(path.join(root, 'docs/kb/_provenance/source-snapshot.json'));
  assert.equal(run('drift', [], root).code, 1);
  assert.match(run('check', [], root).output, /Missing docs\/kb\/_provenance\/source-snapshot.json/);
});

test('nonignored symlink aliases and linked ancestor directories cannot expose env files', (t) => {
  const { root, write } = fixture(t);
  write('source/.env.local', 'FAKE_TEST_SECRET=fixture-only-never-a-real-secret\n');
  fs.symlinkSync('.env.local', path.join(root, 'source/alias.txt'));
  fs.symlinkSync('nested', path.join(root, 'source/linked-directory'));
  const { graph, errors } = buildGraph(root);
  assert.deepEqual(errors, []);
  const snapshot = JSON.stringify(sourceSnapshot(root, graph));
  assert.ok(!snapshot.includes('alias.txt'));
  assert.ok(!snapshot.includes('.env.local'));
  assert.ok(!snapshot.includes('linked-directory'));
  assert.ok(!snapshot.includes(digest('FAKE_TEST_SECRET=fixture-only-never-a-real-secret\n')));
  // Also reject a stale supplied graph if a formerly ordinary source becomes a link.
  fs.unlinkSync(path.join(root, 'source/a.ts'));
  fs.symlinkSync('.env.local', path.join(root, 'source/a.ts'));
  assert.throws(() => sourceSnapshot(root, graph), /Unsafe or missing snapshot source source\/a.ts/);
});

test('new tooling Markdown is excluded from document inventory after staging', (t) => {
  const { root, write, git } = fixture(t);
  write('scripts/docs-kb/README.md', '# New local KB tooling\n');
  git('add', 'scripts/docs-kb/README.md');
  assert.equal(isInventoryDocument('scripts/docs-kb/README.md'), false);
  assert.deepEqual(validateInventories(root), []);
});

test('tracked inventoried env examples are hash-checked but remain excluded from source snapshots', (t) => {
  const { root, write, read, git } = fixture(t);
  const file = 'docs/.env.local.example';
  const content = 'EXAMPLE_EMPTY_TOKEN=\n';
  write(file, content);
  git('add', file);
  const ledger = 'docs/kb/_provenance/document-inventory.csv';
  write(ledger, `${read(ledger)}${file},${digest(content)},${Buffer.byteLength(content)}\n`);
  assert.deepEqual(validateInventories(root), []);
  assert.ok(!JSON.stringify(sourceSnapshot(root)).includes('.env.local.example'));
  write(file, 'EXAMPLE_EMPTY_TOKEN=modified-placeholder\n');
  assert.match(validateInventories(root).join('\n'), /content digest differs for docs\/\.env.local.example/);
  // The template exception does not allow a linked alias to a real env file.
  fs.unlinkSync(path.join(root, file));
  write('docs/.env.local', 'FAKE_TEST_SECRET=fixture-only\n');
  fs.symlinkSync('.env.local', path.join(root, file));
  assert.match(validateInventories(root).join('\n'), /unsafe or missing inventoried file docs\/\.env.local.example/);
  git('add', 'docs/.env.local');
  const fakeSecret = 'FAKE_TEST_SECRET=fixture-only\n';
  write(ledger, `${read(ledger)}docs/.env.local,${digest(fakeSecret)},${Buffer.byteLength(fakeSecret)}\n`);
  assert.match(validateInventories(root).join('\n'), /unsafe or missing inventoried file docs\/\.env.local(?:\n|$)/);
});

test('tracked env templates anywhere require inventory rows while real env files remain excluded', (t) => {
  const f = fixture(t);
  const templates = ['.env.example', 'frontend/.env.sample', 'backend/.env.local.example'];
  const content = 'EXAMPLE_EMPTY_TOKEN=\n';
  for (const file of templates) f.write(file, content);
  f.write('backend/.env.local', 'FAKE_TEST_SECRET=fixture-only\n');
  f.git('add', ...templates, 'backend/.env.local');
  const missing = validateInventories(f.root).join('\n');
  for (const file of templates) {
    assert.equal(isInventoryDocument(file), true);
    assert.ok(missing.includes(`missing inventory row ${file}`));
  }
  assert.equal(isInventoryDocument('backend/.env.local'), false);
  assert.equal(isInventoryDocument('.env'), false);
  const ledger = 'docs/kb/_provenance/document-inventory.csv';
  f.write(ledger, `${f.read(ledger)}${templates.map((file) => `${file},${digest(content)},${Buffer.byteLength(content)}`).join('\n')}\n`);
  assert.deepEqual(validateInventories(f.root), []);
  assert.ok(!JSON.stringify(sourceSnapshot(f.root)).includes('.env'));
});

test('glob double star matches direct and nested files; CSV handles quoted multiline fields', () => {
  assert.ok(globRegex('source/**/*.ts').test('source/a.ts'));
  assert.ok(globRegex('source/**/*.ts').test('source/nested/b.ts'));
  assert.ok(!globRegex('source/*.ts').test('source/nested/b.ts'));
  assert.deepEqual(parseCsv('source_path,notes\n"a.md","quoted ""text""\nand comma, here"\n'),
    [{ source_path: 'a.md', notes: 'quoted "text"\nand comma, here' }]);
  assert.throws(() => parseCsv('a,b\n"unterminated,b'), /unterminated/);
});

test('retired plan/document inventories retain verified tombstones before and after staging deletion', (t) => {
  const f = fixture(t);
  const manifest = retire(f);
  assert.deepEqual(validateInventories(f.root), []);
  f.git('add', '-u', 'plans/01-planning.md');
  assert.deepEqual(validateInventories(f.root), []);
  const node = buildGraph(f.root).graph.nodes.find((entry) => entry.sourceFile === manifest.source_path && entry.type === 'historical_plan');
  assert.equal(node.retirementState, 'retired');
  assert.equal(node.sourceRevision, manifest.source_revision);
  assert.match(run('query', ['historical planning'], f.root).output, /retired; recover at [a-f0-9]{40}:plans\/01-planning.md/);
});

test('retirement rejects missing owner authorization and impossible dates', (t) => {
  const f = fixture(t);
  const manifest = retire(f);
  f.write('docs/kb/_provenance/document-retirement.csv', csv([{ ...manifest, authorized_by: '', retired_at: '2026-02-30' }]));
  const errors = validateInventories(f.root).join('\n');
  assert.match(errors, /missing retirement authorized_by/);
  assert.match(errors, /invalid retired_at date/);
});

test('retirement verifies original bytes and requires identical manifest and inventory hashes', (t) => {
  const f = fixture(t);
  const manifest = retire(f);
  f.write('docs/kb/_provenance/document-retirement.csv', csv([{ ...manifest, content_sha256: '0'.repeat(64) }]));
  const errors = validateInventories(f.root).join('\n');
  assert.match(errors, /retired hash differs from historical Git bytes/);
  assert.match(errors, /tombstone content_sha256 differs from manifest/);
});

test('retirement refuses reappeared source paths including symlink aliases', (t) => {
  const f = fixture(t);
  const manifest = retire(f);
  f.write(manifest.source_path, '# Reappeared source with different content\n');
  assert.match(validateInventories(f.root).join('\n'), /retired source reappeared/);
  fs.unlinkSync(path.join(f.root, manifest.source_path));
  fs.symlinkSync('../source/a.ts', path.join(f.root, manifest.source_path));
  assert.match(validateInventories(f.root).join('\n'), /retired source reappeared or has a linked ancestor/);
});

test('retirement rejects revisions that are invalid, missing, or non-commit objects', (t) => {
  const f = fixture(t);
  const manifest = retire(f);
  for (const revision of ['HEAD; touch should-never-run', '0'.repeat(40), f.git('rev-parse', 'HEAD:plans/01-planning.md').trim()]) {
    f.write('docs/kb/_provenance/document-retirement.csv', csv([{ ...manifest, source_revision: revision }]));
    assert.match(validateInventories(f.root).join('\n'), /invalid source_revision|cannot verify historical source/);
  }
  assert.ok(!fs.existsSync(path.join(f.root, 'should-never-run')));
});

test('missing manifest and removed inventory tombstones fail exact coverage', (t) => {
  const f = fixture(t);
  const manifest = retire(f);
  const ledger = 'docs/kb/_provenance/plan-disposition.csv';
  f.write(ledger, csv(parseCsv(f.read(ledger)).filter((row) => row.source_path !== manifest.source_path)));
  assert.match(validateInventories(f.root).join('\n'), /missing inventory row plans\/01-planning.md/);
  fs.unlinkSync(path.join(f.root, 'docs/kb/_provenance/document-retirement.csv'));
  assert.match(validateInventories(f.root).join('\n'), /retired row lacks retirement manifest plans\/01-planning.md/);
});

test('retirement rejects historical symlinks and paths outside the repository', (t) => {
  const f = fixture(t);
  fs.symlinkSync('../source/a.ts', path.join(f.root, 'docs/alias.md'));
  f.git('add', 'docs/alias.md');
  f.git('commit', '--quiet', '-m', 'Fixture historical link');
  const revision = f.git('rev-parse', 'HEAD').trim();
  fs.unlinkSync(path.join(f.root, 'docs/alias.md'));
  const manifest = { source_path: 'docs/alias.md', source_revision: revision, content_sha256: digest('../source/a.ts'), size_bytes: '14',
    reason: 'Fixture retirement', destination: 'docs/kb/INDEX.md', authorized_by: 'fixture owner', retired_at: '2026-10-07' };
  f.write('docs/kb/_provenance/document-retirement.csv', csv([manifest]));
  assert.match(validateInventories(f.root).join('\n'), /historical source is absent or not a regular file/);
  f.write('docs/kb/_provenance/document-retirement.csv', csv([{ ...manifest, source_path: '../outside.md' }]));
  assert.match(validateInventories(f.root).join('\n'), /unsafe or out-of-scope retired path/);
});
