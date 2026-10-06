import { describe, it, expect } from 'vitest';
import { formatarIraParaExibicao, iraOuNull, iraStringParaNumero } from '$lib/utils/ira';
import {
	buildDadosFluxogramaUserFromCasarResponse,
	createDadosFluxogramaUserFromJson,
	normalizeDadosFluxogramaFromStored
} from '$lib/factories';
import { isDadosFluxogramaUser } from '$lib/types/guards';

/**
 * Pré-mortem R45: IRA ausente virava 0 nos factories (`Number(x ?? 0)`) e a UI,
 * que testa `ira != null`, mostrava "IRA: 0". Valor não numérico virava NaN.
 */
describe('iraStringParaNumero / iraOuNull', () => {
	it('texto não numérico vira null, não NaN', () => {
		expect(iraStringParaNumero('x')).toBeNull();
		expect(iraOuNull('abc')).toBeNull();
	});
	it('ausente ou vazio vira null, não 0', () => {
		expect(iraOuNull(undefined)).toBeNull();
		expect(iraOuNull(null)).toBeNull();
		expect(iraOuNull('')).toBeNull();
	});
	it('valores válidos continuam iguais (inclusive 0 e vírgula)', () => {
		expect(iraOuNull('4.12')).toBe(4.12);
		expect(iraOuNull('4,1234')).toBe(4.1234);
		expect(iraOuNull(3.7)).toBe(3.7);
		expect(iraOuNull(0)).toBe(0);
	});
});

describe('factories com IRA ausente', () => {
	const base = { nome_curso: 'X', dados_fluxograma: [] };

	it('createDadosFluxogramaUserFromJson', () => {
		expect(createDadosFluxogramaUserFromJson({ ...base }).ira).toBeNull();
		expect(createDadosFluxogramaUserFromJson({ ...base, ira: 'abc' }).ira).toBeNull();
		expect(createDadosFluxogramaUserFromJson({ ...base, ira: '4.12' }).ira).toBe(4.12);
	});

	it('normalizeDadosFluxogramaFromStored (camelCase)', () => {
		const r = normalizeDadosFluxogramaFromStored({ nomeCurso: 'X', dadosFluxograma: [] });
		expect(r?.ira).toBeNull();
	});

	it('buildDadosFluxogramaUserFromCasarResponse sem dados_validacao.ira', () => {
		const r = buildDadosFluxogramaUserFromCasarResponse(
			{ disciplinas_casadas: [], dados_validacao: {} },
			{
				nomeCurso: 'X',
				matricula: '1',
				anoAtual: '2026.2',
				matrizCurricular: '1/1',
				semestreAtual: 1,
				suspensoes: []
			}
		);
		expect(r.ira).toBeNull();
		// O guard aceita o dado com IRA ausente (não descarta o fluxograma).
		expect(isDadosFluxogramaUser(r)).toBe(true);
	});
});

describe('formatarIraParaExibicao', () => {
	it('IRA null sem texto dá string vazia (a UI mostra "IRA não encontrado")', () => {
		expect(formatarIraParaExibicao(null)).toBe('');
		expect(formatarIraParaExibicao(null, '  ')).toBe('');
	});
	it('texto do histórico tem prioridade', () => {
		expect(formatarIraParaExibicao(null, '4,1234')).toBe('4,1234');
		expect(formatarIraParaExibicao(4.1, null)).toBe('4,1');
	});
});
