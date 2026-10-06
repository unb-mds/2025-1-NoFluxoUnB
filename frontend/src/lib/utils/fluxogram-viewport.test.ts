import { describe, expect, it } from 'vitest';
import {
	CARD_MIN_TEXT_PX,
	MIN_READABLE_TEXT_PX,
	computeInitialZoom,
	DESKTOP_CARD_TEXT_PX,
	DESKTOP_MIN_ZOOM,
	MIN_READABLE_DESKTOP_TEXT_PX,
	findFirstPendingSemester,
	pickInitialFocusSemester
} from './fluxogram-viewport';

describe('computeInitialZoom — visualização inicial (pré-mortem R29)', () => {
	// Viewports de celular menos o gutter de 16px de cada lado.
	it.each([288, 343, 358, 380])('compacto com %ipx: texto do card >= 10px e zoom <= 1', (clientWidth) => {
		const z = computeInitialZoom({ compact: true, clientWidth, clientHeight: 600, naturalH: 1200 })!;
		expect(z * CARD_MIN_TEXT_PX).toBeGreaterThanOrEqual(MIN_READABLE_TEXT_PX);
		expect(z).toBeLessThanOrEqual(1);
	});

	it('celular deitado (largura sobrando) não passa de 1.0', () => {
		expect(computeInitialZoom({ compact: true, clientWidth: 800, clientHeight: 360, naturalH: 1200 })).toBe(1);
	});

	it('desktop encaixa a coluna mais alta na vertical quando ainda dá para ler', () => {
		expect(
			computeInitialZoom({ compact: false, clientWidth: 1280, clientHeight: 800, naturalH: 950 })
		).toBeCloseTo(0.842, 3);
		expect(computeInitialZoom({ compact: false, clientWidth: 1280, clientHeight: 900, naturalH: 600 })).toBe(1);
	});

	it('desktop com coluna muito alta não abre ilegível (antes caía para 30%)', () => {
		// Engenharia de Software com optativas: ~2600px de coluna numa área de ~560px.
		const z = computeInitialZoom({ compact: false, clientWidth: 1440, clientHeight: 560, naturalH: 2600 })!;
		expect(z).toBe(DESKTOP_MIN_ZOOM);
		expect(z * DESKTOP_CARD_TEXT_PX).toBeGreaterThanOrEqual(MIN_READABLE_DESKTOP_TEXT_PX);
	});

	it('desktop sem altura medida ainda devolve null', () => {
		expect(computeInitialZoom({ compact: false, clientWidth: 1280, clientHeight: 800, naturalH: 0 })).toBeNull();
	});
});

describe('findFirstPendingSemester', () => {
	it('abre no primeiro nível com matéria não concluída', () => {
		expect(
			findFirstPendingSemester([
				{ semester: 1, completed: [true, true] },
				{ semester: 2, completed: [true] },
				{ semester: 3, completed: [true, false] },
				{ semester: 4, completed: [false] }
			])
		).toBe(3);
	});

	it('ignora colunas vazias e não depende da ordem de entrada', () => {
		expect(
			findFirstPendingSemester([
				{ semester: 5, completed: [false] },
				{ semester: 2, completed: [] },
				{ semester: 4, completed: [false] }
			])
		).toBe(4);
	});

	it('tudo concluído: null (não rola)', () => {
		expect(findFirstPendingSemester([{ semester: 1, completed: [true] }])).toBeNull();
	});
});

describe('pickInitialFocusSemester — regra única de posicionamento inicial (R29)', () => {
	const columns = [
		{ semester: 1, completed: [true, true] },
		{ semester: 2, completed: [true, false] },
		{ semester: 3, completed: [false] },
		{ semester: 4, completed: [false] }
	];

	it('desktop abre na primeira coluna (null), mesmo com semestre atual e pendências', () => {
		expect(pickInitialFocusSemester({ compact: false, semestreAtual: 3, columns })).toBeNull();
	});

	it('compacto prioriza o semestre atual do aluno quando há coluna para ele', () => {
		expect(pickInitialFocusSemester({ compact: true, semestreAtual: 4, columns })).toBe(4);
	});

	it('compacto sem semestre atual (anônimo) cai no primeiro nível pendente', () => {
		expect(pickInitialFocusSemester({ compact: true, semestreAtual: undefined, columns })).toBe(2);
		expect(pickInitialFocusSemester({ compact: true, semestreAtual: null, columns })).toBe(2);
	});

	it('semestre atual fora da matriz também cai no primeiro nível pendente', () => {
		expect(pickInitialFocusSemester({ compact: true, semestreAtual: 12, columns })).toBe(2);
	});

	it('compacto sem semestre atual e tudo concluído: null (primeira coluna)', () => {
		expect(
			pickInitialFocusSemester({
				compact: true,
				semestreAtual: 0,
				columns: [{ semester: 1, completed: [true] }]
			})
		).toBeNull();
	});

	it('ignora o nível 0 (pool de optativas), que não vira coluna no diagrama', () => {
		// Dado real: getSubjectsBySemester inclui o nível 0 e ele quase sempre tem
		// optativa não concluída. Sem o filtro, o alvo era 0 e nunca era achado.
		expect(
			pickInitialFocusSemester({
				compact: true,
				semestreAtual: null,
				columns: [
					{ semester: 0, completed: [false, false] },
					{ semester: 1, completed: [true] },
					{ semester: 3, completed: [true, false] }
				]
			})
		).toBe(3);
	});
});
