import { describe, expect, it } from 'vitest';
import {
	CARD_MIN_TEXT_PX,
	MIN_READABLE_TEXT_PX,
	computeInitialZoom,
	findFirstPendingSemester
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

	it('desktop mantém o encaixe da coluna mais alta na vertical', () => {
		expect(
			computeInitialZoom({ compact: false, clientWidth: 1280, clientHeight: 800, naturalH: 1200 })
		).toBeCloseTo(0.667, 3);
		expect(computeInitialZoom({ compact: false, clientWidth: 1280, clientHeight: 900, naturalH: 600 })).toBe(1);
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
