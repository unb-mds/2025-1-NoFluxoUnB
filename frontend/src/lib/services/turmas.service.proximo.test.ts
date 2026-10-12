import { describe, it, expect, vi } from 'vitest';

/** Quantas turmas o "banco" tem por período. */
const turmasPorPeriodo: Record<string, number> = { '2026.2': 120 };

vi.mock('$lib/supabase/client', () => ({
	createSupabaseBrowserClient: () => ({
		from: () => ({
			select: () => ({
				eq: async (_coluna: string, periodo: string) => ({
					count: turmasPorPeriodo[periodo] ?? 0,
					error: null
				})
			})
		})
	})
}));

const { proximoPeriodo, temOfertaNoPeriodo } = await import('./turmas.service');

describe('próximo semestre no Montador', () => {
	it.each([
		['2026.1', '2026.2'],
		['2026.2', '2027.1'],
		['2029.2', '2030.1']
	])('%s → %s', (atual, seguinte) => {
		expect(proximoPeriodo(atual)).toBe(seguinte);
	});

	it('só considera a oferta do próximo semestre quando ela já foi coletada', async () => {
		expect(await temOfertaNoPeriodo('2026.2')).toBe(true);
		expect(await temOfertaNoPeriodo('2027.1')).toBe(false);
	});
});
