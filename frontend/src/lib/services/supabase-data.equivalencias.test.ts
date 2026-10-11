import { describe, expect, it } from 'vitest';
import { filtrarEquivalenciasDoContexto } from './supabase-data.service';

const HOJE = new Date(2026, 8, 28); // 28/09/2026, horário local

function linha(id: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return { id_equivalencia: id, id_materia: 20, id_curso: null, curriculo: null, data_vigencia: null, ...extra };
}

const ids = (rows: Record<string, unknown>[]) => rows.map((r) => r.id_equivalencia);

describe('filtrarEquivalenciasDoContexto', () => {
	it('linha do curso + currículo da matriz tem precedência sobre a do curso e a global', () => {
		const rows = [
			linha(1),
			linha(2, { id_curso: 6360 }),
			linha(3, { id_curso: 6360, curriculo: '6360/2 - 2024.1' })
		];
		expect(ids(filtrarEquivalenciasDoContexto(rows, 6360, '6360/2 - 2024.1', HOJE))).toEqual([3]);
		expect(ids(filtrarEquivalenciasDoContexto(rows, 6360, '6360/1 - 2017.1', HOJE))).toEqual([2]);
	});

	it('equivalência específica de outro curso não vale', () => {
		const rows = [linha(1, { id_curso: 1000, curriculo: '1000/1' })];
		expect(filtrarEquivalenciasDoContexto(rows, 6360, '6360/2 - 2024.1', HOJE)).toEqual([]);
	});

	// Pré-mortem 27/09/2026, R7: data_vigencia não era olhada em lugar nenhum.
	it('linha com data_vigencia futura sai, e não esconde a global vigente', () => {
		const rows = [
			linha(1),
			linha(2, { id_curso: 6360, curriculo: '6360/2 - 2024.1', data_vigencia: '2026-10-01' })
		];
		expect(ids(filtrarEquivalenciasDoContexto(rows, 6360, '6360/2 - 2024.1', HOJE))).toEqual([1]);
	});

	it('vigência de hoje ou passada vale', () => {
		const rows = [linha(1, { data_vigencia: '2026-09-28' }), linha(2, { data_vigencia: '2010-01-01' })];
		expect(ids(filtrarEquivalenciasDoContexto(rows, 6360, '6360/2 - 2024.1', HOJE))).toEqual([1, 2]);
	});
});
