/**
 * Banco Postgres local (PGlite, WASM) com o schema do Supabase de produção, para
 * testar funções SQL e policies sem tocar em banco real.
 *
 * Aplica supabase/migrations/latest_init_from_export.sql (baseline gerado pelo
 * export-schema) e depois as migrations datadas pedidas, na ordem. O trabalho roda em
 * pglite_runner.mjs, num processo Node à parte (ver o comentário de lá); aqui só se
 * monta a lista de jobs e se lê o resultado.
 */

import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "supabase", "migrations");

/** Texto de um arquivo de supabase/migrations. */
export function lerMigration(nome: string): string {
    return readFileSync(join(MIGRATIONS_DIR, nome), "utf8");
}

export interface Job {
    /** SQL rodado antes da consulta, na mesma transação (catálogo, SET ROLE...). */
    setup?: string;
    query: string;
    params?: unknown[];
}

export type Resultado =
    | { rows: Record<string, any>[]; error?: undefined; code?: undefined }
    | { rows?: undefined; error: string; code: string | null };

/** Sobe o banco uma vez e roda cada job numa transação desfeita no fim. */
export function rodarNoBanco(migrations: string[], jobs: Job[]): Resultado[] {
    const r = spawnSync(process.execPath, [join(__dirname, "pglite_runner.mjs")], {
        input: JSON.stringify({ migrations, jobs }),
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) {
        throw new Error(`pglite_runner falhou (status ${r.status}):\n${r.stderr}`);
    }
    return JSON.parse(r.stdout);
}

/** Roda um mapa nome → job e devolve um leitor por nome. */
export function rodarCenarios<K extends string>(
    migrations: string[],
    cenarios: Record<K, Job>
): (nome: K) => Resultado {
    const nomes = Object.keys(cenarios) as K[];
    const resultados = rodarNoBanco(
        migrations,
        nomes.map((n) => cenarios[n])
    );
    const porNome = new Map(nomes.map((n, i) => [n, resultados[i]]));
    return (nome: K) => porNome.get(nome)!;
}
