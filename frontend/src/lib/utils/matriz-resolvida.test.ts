import { describe, it, expect } from 'vitest';
import { matrizResolvidaParaSalvar } from './matriz-resolvida';

describe('matrizResolvidaParaSalvar (R5: escolha do COURSE_SELECTION não se perde)', () => {
	it('prefere a matriz que o RPC usou à matriz ambígua do PDF', () => {
		expect(matrizResolvidaParaSalvar({ matriz_curricular: '8117/-2 - 2018.2' }, '8117/-2')).toBe(
			'8117/-2 - 2018.2'
		);
	});

	it('cai na matriz do PDF quando o RPC não devolve matriz', () => {
		expect(matrizResolvidaParaSalvar({}, '8117/-2')).toBe('8117/-2');
		expect(matrizResolvidaParaSalvar({ matriz_curricular: '  ' }, '8117/-2')).toBe('8117/-2');
		expect(matrizResolvidaParaSalvar(null, '8117/-2')).toBe('8117/-2');
	});

	it('sem nenhuma das duas, string vazia', () => {
		expect(matrizResolvidaParaSalvar(undefined, undefined)).toBe('');
	});
});
