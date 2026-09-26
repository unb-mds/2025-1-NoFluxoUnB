/**
 * Indicativo de elegibilidade à dupla diplomação (referência institucional):
 * não substitui edital PPC / SIGAA; usa grade + histórico carregados no NoFluxo.
 *
 * Regras (ver docs/unb-domain.md#dupla-diplomação--requisitos e
 * docs/dupla-diplomacao-plano.md):
 * - Ser provável formando no curso atual: estar matriculado (status MATR) nas
 *   disciplinas que faltam para completar 100% da CH exigida do curso atual —
 *   ou seja, se concluir tudo que está cursando agora, a integralização chega a 100%.
 * - Integralizar ≥ 70% da CH do curso pretendido, via X = (T - P) / (T - C - E).
 * - IRA ≥ 3,0.
 * - CH optativa considerada é limitada ao exigido no curso pretendido.
 * - Complementares (módulo livre) não contam para o 70%; estágio obrigatório é
 *   excluído do denominador (mas conta como obrigatória realizada no numerador).
 * - "Não ter ingressado no curso atual por dupla diplomação" fica a critério do
 *   próprio aluno conferir — não é verificável pelos dados do NoFluxo.
 */

import { fluxogramaService } from '$lib/services/fluxograma.service';
import { getIntegralizacao } from '$lib/services/integralizacao.service';
import type { IntegralizacaoResult } from '$lib/types/matriz';
import type { CargaHorariaIntegralizada, DadosFluxogramaUser } from '$lib/types/user';
import { isMateriaCurrent } from '$lib/types/user';
import type { MateriaModel } from '$lib/types/materia';
import { getChEstagioObrigatorio, getCodigosEstagioObrigatorio } from '$lib/utils/estagio-obrigatorio';

/** IRA mínimo exigido para dupla diplomação. */
export const IRA_MINIMO_DUPLA_DIPLOMACAO = 3.0;

/** % mínimo de integralização do curso pretendido (fórmula X) exigido para dupla diplomação. */
export const PCT_MINIMO_INTEGRALIZACAO_DUPLA = 0.7;

export type AvaliacaoFormandoOrigem = {
	podeAvaliar: boolean;
	horasIntegralizadas: number;
	chTotalExigidaOrigem: number;
	/** CH que falta para chegar a 100% da CH exigida do curso atual (0 se já integralizou tudo). */
	chFaltanteOrigem: number;
	/** CH das disciplinas atualmente matriculadas (status MATR) casadas com a grade do curso atual. */
	chMatriculadaAtual: number;
	/** 0–1+. Hipotético: quanto seria integralizado se concluísse as matriculadas atuais. null se não há base para concluir (ex.: sem matriz de origem). */
	pctIntegralizacaoSeConcluir: number | null;
	atendeProvavelFormando: boolean | null;
};

export type AvaliacaoIntegralizacaoDuplaDiplomacao = {
	/** CH total exigida pelo curso pretendido. */
	T: number;
	/** CH de atividades complementares exigidas pelo curso pretendido. */
	C: number;
	/** CH de disciplinas obrigatórias de estágio no curso pretendido. */
	E: number;
	/** Obrigatória + optativa (limitada ao exigido) realizada, excluindo estágio e complementar. */
	realizadoNucleo: number;
	/** CH pendente no núcleo acadêmico (T - realizadoNucleo). */
	P: number;
	/** X da fórmula oficial, em fração (0–1). */
	pctIntegralizacaoDupla: number;
	atende70porcento: boolean;
};

export type AvaliacaoIra = {
	ira: number;
	minimoIra: number;
	atendeIra: boolean;
};

export type AvaliacaoDuplaDiplomacao = {
	formando: AvaliacaoFormandoOrigem;
	integralizacao: AvaliacaoIntegralizacaoDuplaDiplomacao;
	ira: AvaliacaoIra;
	elegivel: boolean;
};

/**
 * Avalia os gates da dupla diplomação: provável formando (curso atual), integralização
 * ≥70% do curso pretendido (fórmula oficial) e IRA ≥3,0.
 *
 * @param materiasDestino grade (materias) do curso pretendido — usada para localizar as
 * disciplinas de estágio obrigatório (heurística por nome, ver estagio-obrigatorio.ts).
 * @param cargaHorariaIntegralizadaOrigem CH integralizada (PDF/SIGAA) do curso atual do
 * aluno — mesma fonte usada no dashboard de integralização, para o gate de "provável
 * formando" bater com o percentual exibido lá.
 */
export async function avaliarRequisitosDuplaDiplomacao(
	dadosFluxograma: DadosFluxogramaUser,
	integralizacaoDestino: IntegralizacaoResult | null,
	materiasDestino: MateriaModel[],
	cargaHorariaIntegralizadaOrigem?: CargaHorariaIntegralizada | null
): Promise<AvaliacaoDuplaDiplomacao | null> {
	if (!integralizacaoDestino) return null;

	const integralizacao = calcularIntegralizacaoDupla(integralizacaoDestino, materiasDestino);

	const ira = dadosFluxograma.ira ?? 0;
	const avaliacaoIra: AvaliacaoIra = {
		ira,
		minimoIra: IRA_MINIMO_DUPLA_DIPLOMACAO,
		atendeIra: ira >= IRA_MINIMO_DUPLA_DIPLOMACAO
	};

	const formando = await avaliarFormandoOrigem(dadosFluxograma, cargaHorariaIntegralizadaOrigem);

	const elegivel =
		formando.atendeProvavelFormando === true && integralizacao.atende70porcento && avaliacaoIra.atendeIra;

	return { formando, integralizacao, ira: avaliacaoIra, elegivel };
}

/** X = (T - P) / (T - C - E), com P = T - realizadoNucleo (obrigatória + optativa limitada ao exigido). */
export function calcularIntegralizacaoDupla(
	integralizacaoDestino: IntegralizacaoResult,
	materiasDestino: MateriaModel[]
): AvaliacaoIntegralizacaoDuplaDiplomacao {
	const { exigido, realizado, codigosConcluidos } = integralizacaoDestino;

	const T = exigido.chTotal ?? 0;
	const C = exigido.chComplementar ?? 0;
	const E = getChEstagioObrigatorio(materiasDestino);

	const codigosEstagio = getCodigosEstagioObrigatorio(materiasDestino);
	const concluidosNorm = new Set(codigosConcluidos.map((c) => String(c ?? '').trim().toUpperCase()));
	const estagioConcluidoPorCodigo = new Map<string, MateriaModel>();
	for (const m of materiasDestino) {
		const codigo = String(m.codigoMateria ?? '').trim().toUpperCase();
		if (!codigosEstagio.has(codigo) || !concluidosNorm.has(codigo)) continue;
		if (!estagioConcluidoPorCodigo.has(codigo)) estagioConcluidoPorCodigo.set(codigo, m);
	}
	let chEstagioRealizado = 0;
	for (const m of estagioConcluidoPorCodigo.values()) chEstagioRealizado += (Number(m.creditos) || 0) * 15;

	const chObrigatoriaSemEstagio = Math.max(0, (realizado.chObrigatoria ?? 0) - chEstagioRealizado);
	const chOptativaClamped = Math.min(realizado.chOptativa ?? 0, exigido.chOptativa ?? 0);
	const realizadoNucleo = Math.round((chObrigatoriaSemEstagio + chOptativaClamped) * 10) / 10;

	const P = Math.max(0, Math.round((T - realizadoNucleo) * 10) / 10);

	const denominador = T - C - E;
	const pctIntegralizacaoDupla = denominador > 0 ? (T - P) / denominador : 0;

	return {
		T,
		C,
		E,
		realizadoNucleo,
		P,
		pctIntegralizacaoDupla,
		atende70porcento: pctIntegralizacaoDupla >= PCT_MINIMO_INTEGRALIZACAO_DUPLA
	};
}

async function avaliarFormandoOrigem(
	dadosFluxograma: DadosFluxogramaUser,
	cargaHorariaIntegralizadaOrigem?: CargaHorariaIntegralizada | null
): Promise<AvaliacaoFormandoOrigem> {
	const semBase: AvaliacaoFormandoOrigem = {
		podeAvaliar: false,
		horasIntegralizadas: dadosFluxograma.horasIntegralizadas ?? 0,
		chTotalExigidaOrigem: 0,
		chFaltanteOrigem: 0,
		chMatriculadaAtual: 0,
		pctIntegralizacaoSeConcluir: null,
		atendeProvavelFormando: null
	};

	const ccOrigem = (dadosFluxograma.matrizCurricular ?? '').trim();
	if (!ccOrigem) return semBase;

	try {
		// Carrega o MESMO CursoModel (materias + equivalências) que o dashboard de
		// integralização usa para o curso atual — evita "provável formando" resolver
		// contra uma grade/equivalências diferente e divergir do % exibido lá.
		const cursoOrigem = await fluxogramaService.getCourseDataByCurriculoCompleto(ccOrigem);

		// Mesma fonte/heurística do dashboard (ProgressSummarySection / CargaHorariaDashboard):
		// prefere a CH integralizada do PDF quando disponível, senão recalcula pela grade
		// (agora com as equivalências corretas do curso atual, não vazias).
		const integralizacaoOrigem = await getIntegralizacao({
			curriculoCompleto: ccOrigem,
			dadosFluxograma,
			cargaHorariaIntegralizada: cargaHorariaIntegralizadaOrigem,
			equivalencias: cursoOrigem.equivalencias
		});
		const chTotalExigidaOrigem = integralizacaoOrigem?.exigido.chTotal ?? 0;
		if (!integralizacaoOrigem || chTotalExigidaOrigem <= 0) return semBase;

		const horasIntegralizadas = integralizacaoOrigem.realizado.chTotal;

		// CH por código a partir do MESMO courseData.materias usado pelo badge "se aprovado"
		// do dashboard (não uma query de grade separada) — mesma fórmula (creditos * 15,
		// ignorando matérias fora da matriz/sem crédito válido).
		const chPorCodigo = new Map<string, number>();
		for (const m of cursoOrigem.materias) {
			const codigo = String(m.codigoMateria ?? '').trim().toUpperCase();
			if (!codigo) continue;
			const creditos = Number(m.creditos);
			if (!(creditos > 0)) continue;
			chPorCodigo.set(codigo, Math.round(creditos * 15));
		}

		let chMatriculadaAtual = 0;
		for (const semestre of dadosFluxograma.dadosFluxograma ?? []) {
			for (const materia of semestre) {
				if (!isMateriaCurrent(materia)) continue;
				const codigo = String(materia.codigoMateria ?? '').trim().toUpperCase();
				chMatriculadaAtual += chPorCodigo.get(codigo) ?? 0;
			}
		}

		const chFaltanteOrigem = Math.max(0, chTotalExigidaOrigem - horasIntegralizadas);
		const pctIntegralizacaoSeConcluir = (horasIntegralizadas + chMatriculadaAtual) / chTotalExigidaOrigem;

		return {
			podeAvaliar: true,
			horasIntegralizadas,
			chTotalExigidaOrigem,
			chFaltanteOrigem,
			chMatriculadaAtual,
			pctIntegralizacaoSeConcluir,
			atendeProvavelFormando: chMatriculadaAtual >= chFaltanteOrigem
		};
	} catch {
		return semBase;
	}
}
