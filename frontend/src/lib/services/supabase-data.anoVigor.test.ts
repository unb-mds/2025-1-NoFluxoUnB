import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pré-mortem R63: `matrizes.ano_vigor` é text nullable, e no Postgres
 * `ORDER BY ... DESC` usa NULLS FIRST por padrão. Sem `nullsFirst: false`, uma
 * matriz sem ano virava a "mais recente" do curso.
 *
 * O cliente falso ordena como o Postgres/PostgREST: DESC põe NULL primeiro, a
 * não ser que `nullsFirst: false` seja passado.
 */
type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {};
const ordens: Array<{ col: string; opts?: { ascending?: boolean; nullsFirst?: boolean } }> = [];

function ordenar(linhas: Linha[], col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
	const asc = opts.ascending ?? true;
	const nullsFirst = opts.nullsFirst ?? !asc;
	return [...linhas].sort((a, b) => {
		const va = a[col] as string | null;
		const vb = b[col] as string | null;
		if (va == null && vb == null) return 0;
		if (va == null) return nullsFirst ? -1 : 1;
		if (vb == null) return nullsFirst ? 1 : -1;
		const c = String(va).localeCompare(String(vb));
		return asc ? c : -c;
	});
}

function builder(tabela: string) {
	let linhas = [...(tabelas[tabela] ?? [])];
	let limite: number | null = null;
	const resultado = () => ({ data: limite == null ? linhas : linhas.slice(0, limite), error: null });
	const b: Record<string, unknown> = {
		select: () => b,
		eq: () => b,
		in: () => b,
		like: () => b,
		ilike: () => b,
		limit: (n: number) => {
			limite = n;
			return b;
		},
		order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
			ordens.push({ col, opts });
			linhas = ordenar(linhas, col, opts);
			return b;
		},
		maybeSingle: async () => ({ data: resultado().data[0] ?? null, error: null }),
		then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
			Promise.resolve(resultado()).then(res, rej)
	};
	return b;
}

vi.mock('$lib/supabase/client', () => ({
	createSupabaseBrowserClient: () => ({ from: (t: string) => builder(t) })
}));

const { supabaseDataService } = await import('./supabase-data.service');

beforeEach(() => {
	ordens.length = 0;
	tabelas['matrizes'] = [
		{ id_matriz: 2, id_curso: 6360, curriculo_completo: '6360/1 - 2017.1', ano_vigor: '2017.1', status: 'Ativa' },
		{ id_matriz: 99, id_curso: 6360, curriculo_completo: '6360/9 - ???', ano_vigor: null, status: 'Ativa' },
		{ id_matriz: 1, id_curso: 6360, curriculo_completo: '6360/0 - 2010.1', ano_vigor: '2010.1', status: 'Ativa' }
	];
});

describe('ordenação por ano_vigor com NULL (R63)', () => {
	it('getMatrizesResumoPorCurso escolhe a matriz de 2017.1, não a sem ano', async () => {
		const resumo = await supabaseDataService.getMatrizesResumoPorCurso();
		expect(resumo.get(6360)?.id_matriz).toBe(2);
	});

	it('getClosestActiveMatriz escolhe a matriz de 2017.1', async () => {
		const m = (await supabaseDataService.getClosestActiveMatriz(6360)) as { id_matriz: number } | null;
		expect(m?.id_matriz).toBe(2);
	});

	it('toda ordenação por ano_vigor manda NULL para o fim', async () => {
		await supabaseDataService.getMatrizesResumoPorCurso();
		await supabaseDataService.getClosestActiveMatriz(6360);
		await supabaseDataService.getMatrizByCurriculoCompleto('6360/1');
		const porAno = ordens.filter((o) => o.col === 'ano_vigor');
		expect(porAno.length).toBeGreaterThan(0);
		expect(porAno.every((o) => o.opts?.nullsFirst === false)).toBe(true);
	});
});
