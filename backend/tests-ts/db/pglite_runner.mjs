// Processo filho de pglite_supabase.ts: o PGlite faz import() dinâmico do WASM, que
// o VM do Jest só aceita com --experimental-vm-modules. Rodando em Node puro, fora do
// Jest, não precisa de flag nenhuma na suíte.
//
// Entrada (stdin, JSON): { migrations: string[], jobs: [{ setup?, query, params? }] }
// Saída (stdout, JSON):  [{ rows } | { error, code }] na ordem dos jobs.
//
// Sobe o banco uma vez (baseline + migrations) e roda cada job numa transação desfeita
// no fim, então todos partem do mesmo estado.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'migrations');

// O que o Supabase provê fora do schema public.
const PRELUDIO = `
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
`;

// Grants padrão do Supabase no schema public (o export não traz GRANTs).
const GRANTS_SUPABASE = `
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
`;

const ler = (nome) => readFileSync(join(MIGRATIONS_DIR, nome), 'utf8');

// Dois defeitos do gerador do baseline que o Postgres recusa, corrigidos só em memória:
// colunas pgvector exportadas como "USER-DEFINED" (vector(256) é o embedding Gemini de
// materias_vetorizadas) e policies FOR INSERT com "USING (true)" (INSERT só aceita
// WITH CHECK).
const baseline = () =>
  ler('latest_init_from_export.sql')
    .replace(/USER-DEFINED/g, 'vector(256)')
    .replace(/(FOR INSERT TO \w+) USING \(true\)/g, '$1');

const entrada = JSON.parse(readFileSync(0, 'utf8'));

const db = new PGlite({ extensions: { vector, pg_trgm } });
await db.exec(PRELUDIO);
await db.exec(baseline());
await db.exec(GRANTS_SUPABASE);
for (const nome of entrada.migrations) await db.exec(ler(nome));

const saida = [];
for (const job of entrada.jobs) {
  await db.exec('BEGIN');
  try {
    if (job.setup) await db.exec(job.setup);
    const r = await db.query(job.query, job.params ?? []);
    saida.push({ rows: r.rows });
  } catch (e) {
    saida.push({ error: e.message, code: e.code ?? null });
  } finally {
    await db.exec('ROLLBACK');
  }
}

// bigint (colunas int8) não serializa em JSON; os ids do catálogo cabem em Number.
process.stdout.write(JSON.stringify(saida, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
await db.close();
