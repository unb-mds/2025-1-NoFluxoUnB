import { describe, expect, it } from 'vitest';
import { getPrereqDisplay } from './prereq-display';

describe('getPrereqDisplay — chips da aba Pré-requisitos (pré-mortem R59)', () => {
	it('monta as opções do OU recursivo mesmo sem expressao_original', () => {
		expect(
			getPrereqDisplay({
				codigoMateriaRequisito: 'A0001',
				expressaoOriginal: null,
				expressaoLogica: { operador: 'OU', condicoes: ['A0001', 'B0001'] }
			})
		).toEqual({ kind: 'groups', groups: [['A0001'], ['B0001']] });
	});

	it('E dentro de OU vira opção com várias matérias', () => {
		expect(
			getPrereqDisplay({
				codigoMateriaRequisito: 'A0001',
				expressaoOriginal: '',
				expressaoLogica: {
					operador: 'OU',
					condicoes: [{ operador: 'E', condicoes: ['A0001', 'C0001'] }, 'B0001']
				}
			})
		).toEqual({ kind: 'groups', groups: [['A0001', 'C0001'], ['B0001']] });
	});

	it('regra sem nenhum código aproveitável aparece crua em vez de card vazio', () => {
		expect(
			getPrereqDisplay({ codigoMateriaRequisito: '', expressaoOriginal: '( )', expressaoLogica: null })
		).toEqual({ kind: 'raw', text: '( )' });
		expect(
			getPrereqDisplay({
				codigoMateriaRequisito: 'A0001',
				expressaoOriginal: null,
				expressaoLogica: { operador: 'OU', condicoes: [] }
			})
		).toEqual({ kind: 'raw', text: 'A0001' });
	});

	it('linha legada sem expressão continua no código único', () => {
		expect(
			getPrereqDisplay({ codigoMateriaRequisito: 'A0001', expressaoOriginal: null, expressaoLogica: null })
		).toEqual({ kind: 'single', code: 'A0001' });
	});
});
