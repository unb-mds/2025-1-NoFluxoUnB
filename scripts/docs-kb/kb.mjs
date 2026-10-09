#!/usr/bin/env node
/** Local, deterministic KB validation and retrieval. No dependencies or network calls. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KB = 'docs/kb';
const SNAPSHOT = `${KB}/_provenance/source-snapshot.json`;
const PLAN_LEDGER = `${KB}/_provenance/plan-disposition.csv`;
const DOC_LEDGER = `${KB}/_provenance/document-inventory.csv`;
const RETIREMENT_LEDGER = `${KB}/_provenance/document-retirement.csv`;
const DEFAULT_DECISIONS = ['proposed', 'effective', 'superseded', 'rejected'];
const DEFAULT_IMPLEMENTATION = ['not-implemented', 'partial', 'implemented-unverified',
  'verified-local', 'verified-production', 'rolled-back'];
const DEFAULT_EVIDENCE = ['owner-confirmed', 'curated', 'derived-code', 'derived-schema',
  'derived-git', 'observed-production', 'historical', 'inferred'];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (root, file) => {
  if (!isSafeFile(root, file)) throw new Error(`Unsafe or missing local file ${file}`);
  return fs.readFileSync(path.join(root, file), 'utf8');
};
const exists = (root, file) => fs.existsSync(path.join(root, file));
const list = (value) => Array.isArray(value) ? value : !value || /^(none|null)$/i.test(value)
  ? [] : String(value).split(',').map((part) => part.trim()).filter(Boolean);
const safeSource = (file) => !file.split('/').some((part) => /^\.env(?:\.|$)/.test(part))
  && !/\.(?:pem|key|p12|pfx)$/i.test(file);
const isEnvTemplate = (file) => /^\.env(?:\.[^.]+)*\.(?:example|sample)$/.test(path.basename(file));

// Reject links before reading content; a harmless alias must not expose a secret target.
export function isSafeFile(root, file, { allowEnvTemplate = false } = {}) {
  // Only inventoried tracked templates get this narrow exception; source snapshots
  // exclude all env names. Symlink/ancestor checks still run for these templates.
  const template = allowEnvTemplate && isEnvTemplate(file)
    && safeSource(path.join(path.dirname(file), 'credential-template.txt'));
  if (!safeSource(file) && !template) return false;
  const relative = path.relative(root, path.resolve(root, file));
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return false;
  const parts = relative.split(path.sep);
  try {
    for (let index = 0; index < parts.length; index += 1) {
      const stat = fs.lstatSync(path.join(root, ...parts.slice(0, index + 1)));
      if (stat.isSymbolicLink() || (index === parts.length - 1 && !stat.isFile())) return false;
    }
    return true;
  } catch { return false; }
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function safeHistoricalPath(file, allowEnvTemplate = false) {
  if (typeof file !== 'string' || !file || file.startsWith('/') || file.includes('\\')
    || file.split('/').some((part) => !part || part === '.' || part === '..')
    || /[\0\r\n:]/.test(file)) return false;
  const template = allowEnvTemplate && isEnvTemplate(file)
    && safeSource(path.join(path.dirname(file), 'credential-template.txt'));
  return safeSource(file) || template;
}

function absentWithoutLinkedAncestor(root, file) {
  let current = root;
  for (const part of file.split('/')) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return false;
    } catch (error) { return error.code === 'ENOENT'; }
  }
  return false;
}

/** Verify removed documents from immutable local Git objects, never runtime state. */
export function readRetirements(root = REPO) {
  const errors = [], rows = [], byPath = new Map();
  if (!exists(root, RETIREMENT_LEDGER)) return { rows, byPath, errors };
  let entries;
  try { entries = parseCsv(read(root, RETIREMENT_LEDGER)); }
  catch (error) { return { rows, byPath, errors: [`${RETIREMENT_LEDGER}: ${error.message}`] }; }
  for (const row of entries) {
    const file = row.source_path;
    const label = `${RETIREMENT_LEDGER}: ${file || '<missing source_path>'}`;
    if (!safeHistoricalPath(file, true) || !isInventoryDocument(file)) {
      errors.push(`${label}: unsafe or out-of-scope retired path`); continue;
    }
    if (byPath.has(file)) { errors.push(`${label}: duplicate retired path`); continue; }
    rows.push(row); byPath.set(file, row);
    if (!absentWithoutLinkedAncestor(root, file)) errors.push(`${label}: retired source reappeared or has a linked ancestor`);
    for (const key of ['reason', 'destination', 'authorized_by']) {
      if (!row[key]?.trim() || /^(unknown|unaccepted|none|pending)$/i.test(row[key].trim())) errors.push(`${label}: missing retirement ${key}`);
    }
    if (!validIsoDate(row.retired_at)) errors.push(`${label}: invalid retired_at date`);
    if (!/^[0-9a-f]{40}$/i.test(row.source_revision || '')) errors.push(`${label}: invalid source_revision; require full commit SHA`);
    if (!/^[0-9a-f]{64}$/i.test(row.content_sha256 || '')) errors.push(`${label}: invalid retired content_sha256`);
    if (!/^\d+$/.test(row.size_bytes || '')) errors.push(`${label}: invalid retired size_bytes`);
    for (const destination of (row.destination || '').split(';').map((item) => item.trim()).filter(Boolean)) {
      const target = destination.split('#')[0];
      if (!safeHistoricalPath(target) || !isSafeFile(root, target)) errors.push(`${label}: invalid or missing retirement destination ${destination}`);
    }
    if (!/^[0-9a-f]{40}$/i.test(row.source_revision || '') || !/^\d+$/.test(row.size_bytes || '')) continue;
    try {
      const objectType = execFileSync('git', ['cat-file', '-t', row.source_revision], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      if (objectType !== 'commit') throw new Error('source revision is not a commit');
      const entry = execFileSync('git', ['ls-tree', '-z', row.source_revision, '--', `:(literal)${file}`],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (!/^100(?:644|755) blob [0-9a-f]{40}\t/.test(entry)) throw new Error('historical source is absent or not a regular file');
      const bytes = execFileSync('git', ['show', `${row.source_revision}:${file}`],
        { cwd: root, maxBuffer: Math.max(1024 * 1024, Math.min(256 * 1024 * 1024, Number(row.size_bytes) + 1024)), stdio: ['ignore', 'pipe', 'pipe'] });
      if (sha(bytes) !== row.content_sha256) errors.push(`${label}: retired hash differs from historical Git bytes`);
      if (String(bytes.length) !== row.size_bytes) errors.push(`${label}: retired size differs from historical Git bytes`);
    } catch (error) { errors.push(`${label}: cannot verify historical source (${error.message.split('\n')[0]})`); }
  }
  return { rows, byPath, errors: errors.sort(compare) };
}

export function gitFiles(root = REPO, includeUntracked = false) {
  return execFileSync('git', ['ls-files', '-z', '--cached',
    ...(includeUntracked ? ['--others', '--exclude-standard'] : [])],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort(compare);
}

export function isInventoryDocument(file) {
  if (file.startsWith(`${KB}/`) || file.startsWith('scripts/docs-kb/')
    || file === 'PROJECT_WIDE_DECISIONS.md') return false;
  return ['docs/', 'documentacao/', 'kubernetes_docs/', 'plans/', 'backend/docs/',
    '.claude/skills/', '.github/ISSUE_TEMPLATE/'].some((prefix) => file.startsWith(prefix))
    || /\.(md|rst|tex|adoc)$/i.test(file) || ['LICENSE', 'mkdocs.yml'].includes(file)
    || isEnvTemplate(file);
}

export function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized };
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return { data: {}, body: normalized };
  const data = {};
  let current;
  const scalar = (value) => value.replace(/^(['"])([\s\S]*)\1$/, '$2');
  for (const line of normalized.slice(4, end).split('\n')) {
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && current) { data[current].push(scalar(item[1].trim())); continue; }
    const field = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!field) continue;
    const [, key, value] = field;
    if (!value || value === '[]') { data[key] = []; current = key; }
    else { data[key] = scalar(value.trim()); current = null; }
  }
  return { data, body: normalized.slice(end + 5) };
}

export function parseCsv(text) {
  const records = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some(Boolean)) records.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('unterminated CSV quoted field');
  if (row.length || field) { row.push(field); records.push(row); }
  const headers = records.shift() || [];
  if (new Set(headers).size !== headers.length) throw new Error('duplicate CSV column');
  return records.map((values) => {
    if (values.length !== headers.length) throw new Error('CSV row has wrong column count');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

export function globRegex(pattern) {
  let result = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') { result += '(?:.*/)?'; index += 1; }
      else result += '.*';
    } else if (char === '*') result += '[^/]*';
    else if (char === '?') result += '[^/]';
    else result += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`${result}$`);
}

function markdownFiles(root, directory) {
  if (!exists(root, directory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) found.push(...markdownFiles(root, file));
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(file);
  }
  return found.sort(compare);
}

function value(block, name) {
  return block.match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*)$`, 'mi'))?.[1]?.trim() || undefined;
}

function knowledgeEntries(text, sourceFile, subsystem) {
  const headings = [...text.matchAll(/^###\s+((?:DEC|INV|OPEN)-[A-Za-z0-9-]+)\s+[—-]\s+(.+)$/gm)];
  return headings.map((heading, index) => {
    const block = text.slice(heading.index, headings[index + 1]?.index ?? text.length);
    const id = heading[1];
    return { id, type: id.startsWith('DEC-') ? 'decision' : id.startsWith('INV-') ? 'invariant' : 'open_decision',
      title: heading[2].trim(), sourceFile, ...(subsystem ? { subsystem } : {}),
      status: value(block, id.startsWith('DEC-') ? 'Decision status' : 'Status'),
      implementationStatus: value(block, 'Implementation status'),
      verificationStatus: value(block, 'Verification status'),
      evidenceClass: value(block, 'Evidence class'),
      acceptedBy: value(block, 'Accepted by'), acceptedAt: value(block, 'Accepted at'),
      relates: list(value(block, 'Relates to')), supersedes: list(value(block, 'Supersedes')),
      text: block.trim() };
  });
}

function checkLinks(root, file, text, errors) {
  // Inline Markdown links/images; external URLs and fragment-only references are exempt.
  const links = [...text.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^)]*)?\)/g)]
    .map((match) => match[1].replace(/^<|>$/g, ''));
  links.push(...[...text.matchAll(/^\[[^\]]+\]:\s*(\S+)/gm)].map((match) => match[1]));
  for (const link of links) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#')) continue;
    const target = link.split(/[?#]/)[0];
    if (!target) continue;
    let decoded;
    try { decoded = decodeURIComponent(target); } catch { errors.push(`${file}: malformed local link ${link}`); continue; }
    const destination = path.resolve(root, path.dirname(file), decoded);
    const relative = path.relative(root, destination);
    if (relative.startsWith('..') || path.isAbsolute(relative)) errors.push(`${file}: local link escapes repository: ${link}`);
    else if (!fs.existsSync(destination)) errors.push(`${file}: missing local link target ${link}`);
  }
}

export function buildGraph(root = REPO) {
  const errors = [], warnings = [], nodes = [], edges = [];
  let schema = {};
  try { schema = JSON.parse(read(root, `${KB}/_GRAPH_SCHEMA.json`)); }
  catch (error) { errors.push(`Cannot read ${KB}/_GRAPH_SCHEMA.json: ${error.message}`); }
  const files = gitFiles(root, true).filter((file) => isSafeFile(root, file));
  const dossiers = markdownFiles(root, `${KB}/subsystems`);
  if (!dossiers.length) errors.push('Knowledge base has no subsystem dossiers');
  const ownership = new Map();
  const pushNode = (node) => {
    if (nodes.some((entry) => entry.id === node.id)) errors.push(`Duplicate knowledge id: ${node.id}`);
    else nodes.push(node);
  };
  for (const file of dossiers) {
    const text = read(root, file);
    const { data, body } = parseFrontmatter(text);
    for (const key of ['id', 'title', 'status', 'owns', 'last_verified']) {
      if (!data[key] || (Array.isArray(data[key]) && !data[key].length)) errors.push(`${file}: missing frontmatter ${key}`);
    }
    if (data.id && !/^SUB-[a-z0-9-]+$/.test(data.id)) errors.push(`${file}: malformed subsystem id ${data.id}`);
    if (!(schema.subsystem_statuses || ['source-reviewed', 'draft', 'current', 'deprecated']).includes(data.status)) {
      errors.push(`${file}: invalid subsystem status ${data.status}`);
    }
    if (!validIsoDate(String(data.last_verified || ''))) errors.push(`${file}: invalid last_verified date`);
    const node = { id: data.id, type: 'subsystem', title: data.title, status: data.status,
      sourceFile: file, aliases: list(data.aliases), owns: list(data.owns), watches: list(data.watches),
      related: list(data.related), lastVerified: data.last_verified, text: body };
    if (data.id) pushNode(node);
    for (const [key, edgeType] of [['owns', 'OWNS'], ['watches', 'WATCHES']]) {
      for (const pattern of node[key]) {
        if (pattern.startsWith('/') || pattern.includes('..')) { errors.push(`${file}: unsafe ${key} path ${pattern}`); continue; }
        const matches = files.filter((source) => globRegex(pattern).test(source));
        if (!matches.length) errors.push(`${file}: ${key} pattern matches no repository files: ${pattern}`);
        for (const source of matches) {
          edges.push({ source: node.id, type: edgeType, target: `path:${source}`, sourceFile: file });
          if (key === 'owns') {
            if (!ownership.has(source)) ownership.set(source, new Set());
            ownership.get(source).add(node.id);
          }
        }
      }
    }
    for (const entry of knowledgeEntries(body, file, node.id)) pushNode(entry);
    for (const target of node.related) edges.push({ source: node.id, type: 'RELATED_TO', target, sourceFile: file });
  }
  for (const file of ['PROJECT_WIDE_DECISIONS.md', `${KB}/OPEN_DECISIONS.md`]) {
    if (!exists(root, file)) { errors.push(`Missing canonical knowledge file ${file}`); continue; }
    for (const entry of knowledgeEntries(read(root, file), file)) pushNode(entry);
  }
  for (const [source, owners] of ownership) {
    if (owners.size > 1) errors.push(`Overlapping ownership for ${source}: ${[...owners].sort(compare).join(', ')}`);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes.filter((entry) => entry.type !== 'subsystem')) {
    if (!node.evidenceClass || !(schema.evidence_classes || DEFAULT_EVIDENCE).includes(node.evidenceClass)) {
      errors.push(`${node.sourceFile}: ${node.id} missing or invalid Evidence class: ${node.evidenceClass}`);
    }
    if (node.type === 'decision') {
      if (!(schema.decision_statuses || DEFAULT_DECISIONS).includes(node.status)) errors.push(`${node.id}: invalid Decision status ${node.status}`);
      if (!(schema.implementation_statuses || DEFAULT_IMPLEMENTATION).includes(node.implementationStatus)) {
        errors.push(`${node.id}: invalid Implementation status ${node.implementationStatus}`);
      }
      if (node.status === 'effective' && (!node.acceptedBy || !node.acceptedAt
        || /^(unknown|unaccepted|none|pending)$/i.test(node.acceptedBy)
        || /^(unknown|unaccepted|none|pending)$/i.test(node.acceptedAt))) errors.push(`${node.id}: effective decision requires acceptance provenance`);
      if (node.status === 'effective' && !validIsoDate(node.acceptedAt?.match(/^(\d{4}-\d{2}-\d{2})(?:$|[ \t])/g)?.[0]?.trim())) {
        errors.push(`${node.id}: effective decision requires a valid ISO Accepted at date (optional annotation allowed)`);
      }
    } else if (node.type === 'invariant') {
      if (!node.status || (schema.invariant_statuses && !schema.invariant_statuses.includes(node.status))) errors.push(`${node.id}: missing or invalid Status`);
      const allowedVerification = schema.verification_statuses || schema.invariant_verification_statuses;
      if (!node.verificationStatus || (allowedVerification && !allowedVerification.includes(node.verificationStatus))) {
        errors.push(`${node.id}: missing or invalid Verification status`);
      }
    } else if (!(schema.open_statuses || ['open']).includes(node.status)) errors.push(`${node.id}: invalid open-decision Status: ${node.status}`);
    if (node.subsystem) edges.push({ source: node.id, type: 'BELONGS_TO', target: node.subsystem, sourceFile: node.sourceFile });
    for (const target of node.relates) edges.push({ source: node.id, type: 'RELATED_TO', target, sourceFile: node.sourceFile });
    for (const target of node.supersedes) edges.push({ source: node.id, type: 'SUPERSEDES', target, sourceFile: node.sourceFile });
  }
  for (const edge of edges) {
    if (['OWNS', 'WATCHES'].includes(edge.type)) continue;
    const target = byId.get(edge.target);
    if (!target) errors.push(`${edge.source}: dangling ${edge.type} reference ${edge.target}`);
    else if (edge.type === 'BELONGS_TO' && target.type !== 'subsystem') errors.push(`${edge.source}: BELONGS_TO must reference a subsystem`);
    else if (edge.type === 'SUPERSEDES' && target.type !== byId.get(edge.source)?.type) errors.push(`${edge.source}: SUPERSEDES must reference the same knowledge type`);
  }
  const indexFile = `${KB}/INDEX.md`;
  if (!exists(root, indexFile)) errors.push(`Missing ${indexFile}`);
  else {
    const index = read(root, indexFile);
    for (const node of nodes.filter((entry) => entry.type === 'subsystem')) {
      if (!index.includes(node.id) && !index.includes(path.basename(node.sourceFile))) errors.push(`${indexFile}: subsystem ${node.id} has no route`);
    }
  }
  for (const file of [...markdownFiles(root, KB), 'PROJECT_WIDE_DECISIONS.md']) {
    if (exists(root, file)) checkLinks(root, file, read(root, file), errors);
  }
  if (exists(root, PLAN_LEDGER)) {
    try {
      for (const row of parseCsv(read(root, PLAN_LEDGER))) {
        const file = row.source_path || row.path;
        if (!file) continue;
        const id = `HIST-${sha(file).slice(0, 16)}`;
        pushNode({ id, type: 'historical_plan', title: row.title || path.basename(file, '.md'),
          sourceFile: file, status: row.disposition,
          ...(row.retirement_state === 'retired' ? { retirementState: 'retired', sourceRevision: row.source_revision } : {}),
          text: `${row.title || ''} ${row.notes || ''} ${row.evidence || ''}` });
      }
    } catch (error) { errors.push(`${PLAN_LEDGER}: ${error.message}`); }
  }
  const sourceNodes = [...new Set(edges.filter((edge) => ['OWNS', 'WATCHES'].includes(edge.type)).map((edge) => edge.target))]
    .map((id) => ({ id, type: 'code_path', title: id.slice(5), sourceFile: id.slice(5) }));
  const uniqueEdges = new Map(edges.map((edge) => [JSON.stringify(edge), edge]));
  return { graph: { version: schema.version || 1, nodes: [...nodes, ...sourceNodes].sort((a, b) => compare(a.id, b.id)),
    edges: [...uniqueEdges.values()].sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))) },
  errors: [...new Set(errors)].sort(compare), warnings: [...new Set(warnings)].sort(compare) };
}

export function validateInventories(root = REPO) {
  const retirements = readRetirements(root);
  const errors = [...retirements.errors];
  const tracked = gitFiles(root);
  const isPlan = (file) => file.startsWith('plans/') && file.endsWith('.md');
  const planFiles = [...new Set([...tracked.filter(isPlan), ...retirements.rows.map((row) => row.source_path).filter(isPlan)])];
  const documentFiles = [...new Set([...tracked.filter(isInventoryDocument), ...retirements.rows.map((row) => row.source_path)])];
  for (const [ledger, expected] of [[PLAN_LEDGER, planFiles], [DOC_LEDGER, documentFiles]]) {
    if (!exists(root, ledger)) { errors.push(`Missing inventory ${ledger}`); continue; }
    let rows;
    try { rows = parseCsv(read(root, ledger)); } catch (error) { errors.push(`${ledger}: ${error.message}`); continue; }
    const seen = new Set();
    for (const row of rows) {
      const file = row.source_path || row.path;
      if (!file || seen.has(file)) { errors.push(`${ledger}: missing or duplicate source_path ${file || ''}`); continue; }
      seen.add(file);
      if (!expected.includes(file)) { errors.push(`${ledger}: unexpected inventory path ${file}`); continue; }
      const retirement = retirements.byPath.get(file);
      if (row.retirement_state === 'retired' || retirement) {
        if (!retirement) { errors.push(`${ledger}: retired row lacks retirement manifest ${file}`); continue; }
        if (row.retirement_state !== 'retired') errors.push(`${ledger}: tombstone row must have retirement_state=retired for ${file}`);
        for (const key of ['source_revision', 'content_sha256', 'size_bytes']) {
          if (row[key] !== retirement[key]) errors.push(`${ledger}: tombstone ${key} differs from manifest for ${file}`);
        }
        continue;
      }
      if (!isSafeFile(root, file, { allowEnvTemplate: true })) { errors.push(`${ledger}: unsafe or missing inventoried file ${file}`); continue; }
      const content = fs.readFileSync(path.join(root, file));
      if (row.content_sha256 !== sha(content)) errors.push(`${ledger}: content digest differs for ${file}`);
      if (row.size_bytes !== String(content.length)) errors.push(`${ledger}: size differs for ${file}`);
    }
    for (const file of expected) if (!seen.has(file)) errors.push(`${ledger}: missing inventory row ${file}`);
  }
  return errors.sort(compare);
}

export function sourceSnapshot(root = REPO, graph = buildGraph(root).graph) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const dossiers = graph.nodes.filter((node) => node.type === 'subsystem').map((node) => {
    const files = [...new Set(graph.edges.filter((edge) => edge.source === node.id
      && ['OWNS', 'WATCHES'].includes(edge.type)).map((edge) => edge.target.slice(5)))].sort(compare);
    return { id: node.id, sourceFile: node.sourceFile, dossier_sha256: sha(read(root, node.sourceFile)),
      files: files.map((file) => {
        if (!isSafeFile(root, file)) throw new Error(`Unsafe or missing snapshot source ${file}`);
        return { path: file, content_sha256: sha(fs.readFileSync(path.join(root, file))) };
      }) };
  }).sort((a, b) => compare(a.id, b.id));
  return { version: 1, head, dossiers };
}

export function checkDrift(root = REPO, graph = buildGraph(root).graph) {
  if (!exists(root, SNAPSHOT)) return { stale: [], errors: [`Missing ${SNAPSHOT}; create a reviewed snapshot explicitly`] };
  let previous;
  try { previous = JSON.parse(read(root, SNAPSHOT)); } catch (error) { return { stale: [], errors: [`Invalid snapshot: ${error.message}`] }; }
  if (previous.version !== 1 || !Array.isArray(previous.dossiers)) return { stale: [], errors: ['Invalid snapshot structure'] };
  const current = sourceSnapshot(root, graph);
  const stale = [];
  const before = new Map(previous.dossiers.map((dossier) => [dossier.id, dossier]));
  for (const dossier of current.dossiers) {
    const prior = before.get(dossier.id);
    if (!prior) { stale.push({ id: dossier.id, sourceFile: dossier.sourceFile, reason: 'dossier absent from snapshot', paths: [] }); continue; }
    const oldFiles = new Map((prior.files || []).map((file) => [file.path, file.content_sha256]));
    const newFiles = new Map(dossier.files.map((file) => [file.path, file.content_sha256]));
    const changed = [...new Set([...oldFiles.keys(), ...newFiles.keys()])]
      .filter((file) => oldFiles.get(file) !== newFiles.get(file)).sort(compare);
    if (changed.length) stale.push({ id: dossier.id, sourceFile: dossier.sourceFile,
      reason: 'owned or watched sources changed; review dossier and explicitly renew snapshot', paths: changed });
  }
  for (const prior of previous.dossiers) if (!current.dossiers.some((dossier) => dossier.id === prior.id)) {
    stale.push({ id: prior.id, sourceFile: prior.sourceFile, reason: 'dossier removed since snapshot', paths: [] });
  }
  return { stale: stale.sort((a, b) => compare(a.id, b.id)), errors: [] };
}

const STOP_WORDS = new Set('a an and as at by de da das do dos e em for how in is na no o os of on or para por que the to um uma what with como qual quais'.split(' '));
const tokens = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .split(/[^a-z0-9_./-]+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));

export function queryGraph(graph, question, limit = 20, { currentOnly = false } = {}) {
  const terms = [...new Set(tokens(question))];
  if (!terms.length) return [];
  return graph.nodes.filter((node) => node.type !== 'code_path' && (!currentOnly
    || (node.type !== 'historical_plan' && !['superseded', 'rejected'].includes(node.status)))).map((node) => {
    const title = new Set(tokens(`${node.id} ${node.title} ${(node.aliases || []).join(' ')}`));
    const body = new Set(tokens(node.text));
    let score = 0;
    for (const term of terms) {
      if (title.has(term)) score += 8;
      else if (term.length >= 4 && [...title].some((word) => word.includes(term) || term.includes(word))) score += 3;
      if (body.has(term)) score += 1;
    }
    if (node.type === 'subsystem') score *= 1.5;
    if (node.type === 'historical_plan') score *= 0.2;
    if (['rejected', 'superseded'].includes(node.status)) score *= 0.3;
    return { ...node, score };
  }).filter((node) => node.score > 0).sort((a, b) => b.score - a.score || compare(a.id, b.id)).slice(0, limit);
}

export function run(command, args = [], root = REPO) {
  const result = buildGraph(root);
  if (command === 'check') {
    // Drift de fonte é aviso por padrão: todo PR de código muda arquivos
    // observados, e exigir snapshot renovado em cada um travaria PRs em paralelo
    // (o snapshot é um JSON único). `--strict` volta a reprovar; `kb:drift`
    // continua saindo com erro quando há drift.
    const strict = args.includes('--strict');
    const errors = [...result.errors, ...validateInventories(root)];
    const drift = checkDrift(root, result.graph);
    errors.push(...drift.errors);
    const staleLines = drift.stale.map((item) => `STALE ${item.id}: ${item.reason}: ${item.paths.join(', ')}`);
    if (strict) errors.push(...staleLines);
    if (errors.length) return { code: 1, output: errors.map((error) => `ERROR ${error}`).join('\n') };
    const summary = `KB valid: ${result.graph.nodes.filter((node) => node.type === 'subsystem').length} subsystems, ${result.graph.nodes.length} nodes, ${result.graph.edges.length} edges; inventories complete; `;
    if (!staleLines.length) return { code: 0, output: `${summary}snapshot current.` };
    return { code: 0, output: [`${summary}snapshot stale for ${staleLines.length} dossier(s) — review them when touching the area, then run kb:snapshot.`,
      ...staleLines.map((line) => `WARN ${line}`)].join('\n') };
  }
  if (result.errors.length) return { code: 1, output: result.errors.map((error) => `ERROR ${error}`).join('\n') };
  if (command === 'graph') return { code: 0, output: JSON.stringify(result.graph, null, 2) };
  if (command === 'query') {
    const question = args.filter((arg) => arg !== '--current-only').join(' ').trim();
    if (!question) return { code: 2, output: 'Usage: node scripts/docs-kb/kb.mjs query "question" [--current-only]' };
    const found = queryGraph(result.graph, question, 20, { currentOnly: args.includes('--current-only') });
    return { code: 0, output: found.length ? found.map((node) => `${node.id} — ${node.title}\n  ${node.type}; ${node.status}; ${node.sourceFile}${node.implementationStatus ? `; implementation ${node.implementationStatus}` : ''}${node.retirementState ? `; ${node.retirementState}; recover at ${node.sourceRevision}:${node.sourceFile}` : ''}`).join('\n\n') : 'No matching canonical knowledge; inspect source and update dossier if needed.' };
  }
  if (command === 'snapshot') {
    const snapshot = sourceSnapshot(root, result.graph);
    fs.mkdirSync(path.join(root, path.dirname(SNAPSHOT)), { recursive: true });
    fs.writeFileSync(path.join(root, SNAPSHOT), `${JSON.stringify(snapshot, null, 2)}\n`);
    return { code: 0, output: `Saved ${SNAPSHOT}: ${snapshot.dossiers.length} dossiers, HEAD ${snapshot.head}. Source review evidence only; does not prove test execution or deployment.` };
  }
  if (command === 'drift') {
    const drift = checkDrift(root, result.graph);
    return { code: drift.errors.length || drift.stale.length ? 1 : 0, output: [...drift.errors,
      ...drift.stale.map((item) => `STALE ${item.id}: ${item.paths.join(', ') || item.reason}`),
      ...(drift.errors.length || drift.stale.length ? [] : ['No source drift against reviewed snapshot.'])].join('\n') };
  }
  return { code: 2, output: 'Usage: node scripts/docs-kb/kb.mjs <check|query|graph|snapshot|drift> [question]' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = run(process.argv[2], process.argv.slice(3));
    (result.code ? console.error : console.log)(result.output);
    process.exitCode = result.code;
  } catch (error) { console.error(`ERROR ${error.message}`); process.exitCode = 1; }
}
