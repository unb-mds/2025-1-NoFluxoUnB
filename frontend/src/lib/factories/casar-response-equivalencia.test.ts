import { describe, it, expect } from 'vitest';
import { buildDadosFluxogramaUserFromCasarResponse } from '$lib/factories';
import { isMateriaAprovada } from '$lib/types/user';

/**
 * R17 (pré-mortem 27/09/2026): obrigatória reprovada (ou em curso) cuja equivalente foi
 * aprovada. O RPC devolve MAT0025 em materias_concluidas como concluida_equivalencia e
 * mantém a tentativa REP/MATR em disciplinas_casadas (tipo obrigatoria_substituida).
 * Saída real do casar_disciplinas no cenário r17_rep_optativa_equivalente.
 */
function resposta(statusObrigatoria: string) {
	return {
		disciplinas_casadas: [
			{
				tipo_dado: 'Disciplina Regular', codigo: 'MAT0025', codigo_materia: 'MAT0025',
				codigo_historico: 'MAT0025', nome: 'CALCULO 1', status: statusObrigatoria, mencao: 'II',
				ano_periodo: '2023.2', professor: 'PROF REP', tipo: 'obrigatoria_substituida', nivel: 1
			},
			{
				tipo_dado: 'Disciplina Regular', codigo: 'OPT0001', codigo_materia: 'OPT0001',
				codigo_historico: 'OPT0001', nome: 'OPTATIVA', status: 'APR', mencao: 'MS',
				ano_periodo: '2024.1', professor: 'PROF OPT', tipo: 'optativa', nivel: 0
			}
		],
		materias_concluidas: [
			{
				id_materia: 20, codigo: 'MAT0025', nome: 'CALCULO 1', status: 'APR', mencao: 'MS',
				nivel: 1, professor: 'PROF OPT', ano_periodo: '2024.1', tipo: 'obrigatoria',
				status_fluxograma: 'concluida_equivalencia', codigo_equivalente: 'OPT0001',
				nome_equivalente: 'OPTATIVA'
			}
		],
		dados_validacao: { ira: 4, horas_integralizadas: 60 }
	};
}

const META = {
	nomeCurso: 'ENGENHARIA DE SOFTWARE',
	matricula: '200000000',
	anoAtual: '2024.2',
	matrizCurricular: '6360/2 - 2024.1',
	semestreAtual: 3,
	suspensoes: []
};

describe('buildDadosFluxogramaUserFromCasarResponse — R17 concluida_equivalencia', () => {
	it.each(['REP', 'MATR'])(
		'obrigatória %s + equivalente aprovada: a linha vira a equivalência, não fica a tentativa',
		(status) => {
			const dados = buildDadosFluxogramaUserFromCasarResponse(resposta(status), META);
			const mat = dados.dadosFluxograma.flat().filter((m) => m.codigoMateria === 'MAT0025');
			expect(mat).toHaveLength(1);
			expect(mat[0]).toMatchObject({
				tipoDado: 'equivalencia',
				status: 'APR',
				mencao: 'MS',
				professor: 'PROF OPT',
				anoPeriodo: '2024.1',
				codigoEquivalente: 'OPT0001',
				nomeEquivalente: 'OPTATIVA'
			});
			expect(isMateriaAprovada(mat[0])).toBe(true);
		}
	);

	it('regressão: a optativa usada continua no fluxograma', () => {
		const dados = buildDadosFluxogramaUserFromCasarResponse(resposta('REP'), META);
		expect(dados.dadosFluxograma.flat().map((m) => m.codigoMateria).sort()).toEqual(['MAT0025', 'OPT0001']);
	});

	it('regressão: REP sem equivalência continua REP', () => {
		const r = resposta('REP');
		r.materias_concluidas = [];
		const dados = buildDadosFluxogramaUserFromCasarResponse(r, META);
		const mat = dados.dadosFluxograma.flat().find((m) => m.codigoMateria === 'MAT0025');
		expect(mat).toMatchObject({ status: 'REP', professor: 'PROF REP' });
		expect(mat?.codigoEquivalente ?? null).toBeNull();
	});
});
