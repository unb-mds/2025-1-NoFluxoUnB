/**
 * Serviço central de Integralização: compara Exigido (da matriz) vs Realizado (aluno).
 * Quando `cargaHorariaIntegralizada` (PDF) está disponível, usa os valores do PDF.
 * Caso contrário, calcula somando disciplinas concluídas casadas na grade (com equivalências).
 */

import { supabaseDataService } from '$lib/services/supabase-data.service';
import type { IntegralizacaoResult } from '$lib/types/matriz';
import type { DadosFluxogramaUser } from '$lib/types/user';
import type { CargaHorariaIntegralizada } from '$lib/types/user';
import { getCompletedSubjectCodes } from '$lib/types/user';
import { getCompletedByEquivalenceCodes } from '$lib/types/equivalencia';
import type { EquivalenciaModel } from '$lib/types/equivalencia';
import {
	evaluateExpressionWithTracking,
	evaluateExpressaoLogica,
	getMatchingCodesFromExpressao
} from '$lib/utils/expressao-logica';

type GradeRow = {
	codigoMateria: string;
	cargaHoraria: number;
	categoria: 'obrigatoria' | 'optativa' | 'complementar';
};

function categoriaPrioridade(categoria: GradeRow['categoria']): number {
	// Conservador para evitar inflar optativa em dados conflitantes.
	// Se o mesmo código vier em mais de uma categoria, prioriza:
	// obrigatoria > complementar > optativa.
	if (categoria === 'obrigatoria') return 3;
	if (categoria === 'complementar') return 2;
	return 1;
}

/**
 * Uma única disciplina concluída não pode contar várias vezes no realizado.
 * Deduplica por CÓDIGO (não por código+categoria), pois há matrizes com
 * linhas redundantes/conflitantes para o mesmo código.
 */
function dedupeGradePorCodigoENatureza(grade: GradeRow[]): GradeRow[] {
	const map = new Map<string, GradeRow>();
	for (const item of grade) {
		const cod = String(item.codigoMateria ?? '').trim().toUpperCase();
		if (!cod) continue;
		const ch = Math.max(0, Number(item.cargaHoraria) || 0);
		const prev = map.get(cod);
		const atual: GradeRow = { codigoMateria: cod, cargaHoraria: ch, categoria: item.categoria };
		if (!prev) {
			map.set(cod, atual);
			continue;
		}

		const pPrev = categoriaPrioridade(prev.categoria);
		const pAtual = categoriaPrioridade(atual.categoria);
		if (pAtual > pPrev) {
			map.set(cod, atual);
			continue;
		}
		if (pAtual === pPrev && atual.cargaHoraria > prev.cargaHoraria) {
			map.set(cod, atual);
		}
	}
	return [...map.values()];
}

export interface IntegralizacaoInput {
	/** curriculo_completo (ex: "8117/-2 - 2018.2") para buscar a matriz. */
	curriculoCompleto: string;
	/** Dados do histórico do aluno (disciplinas concluídas). */
	dadosFluxograma: DadosFluxogramaUser | null;
	/** Carga horária integralizada do PDF (SIGAA). Só usar quando for o curso do usuário — em mudança de curso, recalcular. */
	cargaHorariaIntegralizada?: CargaHorariaIntegralizada | null;
	/** Equivalências aplicáveis (gerais + específicas da matriz) para expandir concluídas. */
	equivalencias?: EquivalenciaModel[];
	/** Se true, ignora cargaHorariaIntegralizada e calcula CH realizado pela grade + histórico (ex.: simulação de outro curso). */
	recalcularPorDisciplinas?: boolean;
}

/**
 * Percentual cumprido. Só chega a 100 quando realizado >= exigido: arredondar
 * para cima mostrava 100% com horas ainda faltando (ex.: 3840 de 3855 h).
 * Manter igual a `pct` em backend/src/services/integralizacao.service.ts.
 */
export function pct(exigido: number, realizado: number): number {
	if (exigido <= 0) return 0;
	if (realizado >= exigido) return 100;
	return Math.max(0, Math.min(99, Math.floor((realizado / exigido) * 100)));
}

/**
 * Retorna o JSON de integralização: Exigido (matriz) vs Realizado (soma das concluídas).
 */
export async function getIntegralizacao(input: IntegralizacaoInput): Promise<IntegralizacaoResult | null> {
	const {
		curriculoCompleto,
		dadosFluxograma,
		cargaHorariaIntegralizada,
		equivalencias = [],
		recalcularPorDisciplinas = false
	} = input;

	const cc = curriculoCompleto?.trim();
	if (!cc) return null;

	const matriz = await supabaseDataService.getMatrizByCurriculoCompleto(cc);
	if (!matriz) return null;

	// Grade vazia não zera o realizado: sem recálculo, a CH do PDF continua valendo.
	// Só no modo de recálculo o loop sobre a grade vazia resulta em 0.
	const gradeRaw = await supabaseDataService.getGradeByMatriz(matriz.idMatriz);
	const grade = dedupeGradePorCodigoENatureza(gradeRaw ?? []);

	const codigosObrigatorios = grade.filter((g) => g.categoria === 'obrigatoria').map((g) => g.codigoMateria);
	const completedCodes = dadosFluxograma ? getCompletedSubjectCodes(dadosFluxograma) : new Set<string>();
	const completedByEquiv = getCompletedByEquivalenceCodes(equivalencias, completedCodes);
	const completedCodesNorm = new Set(
		[...completedCodes]
			.map((c) => String(c ?? '').trim().toUpperCase())
			.filter(Boolean)
	);
	const completedByEquivNorm = new Set(
		[...completedByEquiv]
			.map((c) => String(c ?? '').trim().toUpperCase())
			.filter(Boolean)
	);
	const codesThatCount = new Set<string>([...completedCodes, ...completedByEquiv]);
	const codesThatCountNormalizados = new Set(
		[...codesThatCount]
			.map((c) => String(c ?? '').trim().toUpperCase())
			.filter(Boolean)
	);

	const logMudancaCurso = (...args: unknown[]) => {
		if (!recalcularPorDisciplinas) return;
		console.log('[Integralizacao:SimulacaoMudanca]', ...args);
	};

	if (recalcularPorDisciplinas) {
		const baseNorm = completedCodesNorm;
		const equivalenciasAplicadas = equivalencias
			.filter((eq) => completedByEquivNorm.has(String(eq.codigoMateriaOrigem ?? '').trim().toUpperCase()))
			.map((eq) => {
				const origem = String(eq.codigoMateriaOrigem ?? '').trim().toUpperCase();
				let satisfaz = false;
				let matching: string[] = [];
				if (eq.expressaoLogica != null) {
					satisfaz = evaluateExpressaoLogica(eq.expressaoLogica, baseNorm);
					matching = [...getMatchingCodesFromExpressao(eq.expressaoLogica, baseNorm)].map((c) =>
						String(c).trim().toUpperCase()
					);
				} else {
					const r = evaluateExpressionWithTracking((eq.expressao ?? '').trim(), baseNorm);
					satisfaz = r.isTrue;
					matching = [...r.matchingMaterias].map((c) => String(c).trim().toUpperCase());
				}
				return {
					origem,
					nomeOrigem: eq.nomeMateriaOrigem ?? '',
					satisfazExpressao: satisfaz,
					materiasQueSatisfizeram: matching,
					expressao: eq.expressao ?? null
				};
			});

		logMudancaCurso('Iniciando recálculo por disciplinas');
		logMudancaCurso('Matriz destino', {
			curriculoCompleto: matriz.curriculoCompleto,
			idMatriz: matriz.idMatriz,
			idCurso: matriz.idCurso
		});
		logMudancaCurso('Concluídas do histórico (base)', {
			total: completedCodes.size,
			amostra: [...completedCodes]
		});
		logMudancaCurso('Concluídas por equivalência', {
			total: completedByEquiv.size,
			amostra: [...completedByEquiv]
		});
		logMudancaCurso('Equivalências aplicadas (origem <- matérias do histórico)', {
			total: equivalenciasAplicadas.length,
			itens: equivalenciasAplicadas
		});
		if (completedByEquivNorm.has('DSC0011')) {
			logMudancaCurso('DEBUG DSC0011: origem por equivalência detectada', {
				itens: equivalenciasAplicadas.filter((e) => e.origem === 'DSC0011')
			});
		}
		logMudancaCurso('Códigos que contam (base + equivalência)', {
			total: codesThatCount.size,
			amostra: [...codesThatCount]
		});
		logMudancaCurso('Códigos que contam (normalizados)', {
			total: codesThatCountNormalizados.size,
			amostra: [...codesThatCountNormalizados]
		});
		logMudancaCurso('Grade destino (deduplicada)', {
			total: grade.length,
			amostra: grade.map((g) => ({
				codigo: g.codigoMateria,
				categoria: g.categoria,
				ch: g.cargaHoraria
			}))
		});
	}

	let chObrigatoriaRealizado: number;
	let chOptativaRealizado: number;
	let chComplementarRealizado: number;

	if (!recalcularPorDisciplinas && cargaHorariaIntegralizada && (cargaHorariaIntegralizada.total > 0 || cargaHorariaIntegralizada.obrigatoria > 0 || cargaHorariaIntegralizada.optativa > 0)) {
		chObrigatoriaRealizado = cargaHorariaIntegralizada.obrigatoria ?? 0;
		chOptativaRealizado = cargaHorariaIntegralizada.optativa ?? 0;
		chComplementarRealizado = cargaHorariaIntegralizada.complementar ?? 0;
	} else {
		chObrigatoriaRealizado = 0;
		chOptativaRealizado = 0;
		chComplementarRealizado = 0;
		const matched: Array<{ codigo: string; categoria: string; ch: number }> = [];
		const notMatched: Array<{ codigo: string; categoria: string; ch: number }> = [];
		for (const item of grade) {
			const codigoItem = String(item.codigoMateria ?? '').trim().toUpperCase();
			const concluida = codesThatCountNormalizados.has(codigoItem);
			if (!concluida) {
				notMatched.push({
					codigo: item.codigoMateria,
					categoria: item.categoria,
					ch: item.cargaHoraria
				});
				continue;
			}

			matched.push({
				codigo: item.codigoMateria,
				categoria: item.categoria,
				ch: item.cargaHoraria
			});

			if (item.categoria === 'obrigatoria') chObrigatoriaRealizado += item.cargaHoraria;
			else if (item.categoria === 'optativa') chOptativaRealizado += item.cargaHoraria;
			else chComplementarRealizado += item.cargaHoraria;
		}
		if (recalcularPorDisciplinas) {
			const matchedObrigatorias = matched.filter((m) => m.categoria === 'obrigatoria');
			const matchedOptativas = matched.filter((m) => m.categoria === 'optativa');
			const matchedComplementares = matched.filter((m) => m.categoria === 'complementar');
			const matchedOptativasDiretas = matchedOptativas.filter((m) =>
				completedCodesNorm.has(String(m.codigo ?? '').trim().toUpperCase())
			);
			const matchedOptativasExtrasEquivalencia = matchedOptativas.filter((m) => {
				const cod = String(m.codigo ?? '').trim().toUpperCase();
				return !completedCodesNorm.has(cod) && completedByEquivNorm.has(cod);
			});
			const somaCh = (arr: Array<{ ch: number }>) => arr.reduce((acc, cur) => acc + (Number(cur.ch) || 0), 0);

			logMudancaCurso('Disciplinas da grade que entraram no cálculo', {
				total: matched.length,
				amostra: matched
			});
			logMudancaCurso('Obrigatórias concluídas na simulação', {
				total: matchedObrigatorias.length,
				totalCH: somaCh(matchedObrigatorias),
				itens: matchedObrigatorias
			});
			logMudancaCurso('Optativas concluídas na simulação', {
				total: matchedOptativas.length,
				totalCH: somaCh(matchedOptativas),
				itens: matchedOptativas
			});
			logMudancaCurso('Optativas diretas do histórico (sem equivalência)', {
				total: matchedOptativasDiretas.length,
				totalCH: somaCh(matchedOptativasDiretas),
				itens: matchedOptativasDiretas
			});
			logMudancaCurso('Optativas extras por equivalência (não estavam na base)', {
				total: matchedOptativasExtrasEquivalencia.length,
				totalCH: somaCh(matchedOptativasExtrasEquivalencia),
				itens: matchedOptativasExtrasEquivalencia
			});
			logMudancaCurso('Complementares concluídas na simulação', {
				total: matchedComplementares.length,
				totalCH: somaCh(matchedComplementares),
				itens: matchedComplementares
			});
			logMudancaCurso('Disciplinas da grade NÃO contadas', {
				total: notMatched.length,
				amostra: notMatched
			});
			logMudancaCurso('Soma por categoria (realizado)', {
				chObrigatoriaRealizado,
				chOptativaRealizado,
				chComplementarRealizado,
				chTotalRealizadoParcial:
					chObrigatoriaRealizado + chOptativaRealizado + chComplementarRealizado
			});
		}
	}

	const exigido = {
		chObrigatoria: matriz.chObrigatoriaExigida ?? 0,
		chOptativa: matriz.chOptativaExigida ?? 0,
		chComplementar: matriz.chComplementarExigida ?? 0,
		chTotal: matriz.chTotalExigida ?? 0
	};

	// No recálculo, cada categoria só conta até o exigido dela: optativa excedente
	// não pode esconder obrigatória pendente no total. Exigido 0 = matriz sem o dado,
	// aí não há teto. (Módulo livre não entra aqui; ver card "FIX: Módulo Livre".)
	const ateOExigido = (realizadoCat: number, exigidoCat: number) =>
		exigidoCat > 0 ? Math.min(realizadoCat, exigidoCat) : realizadoCat;
	const chTotalRealizado =
		!recalcularPorDisciplinas && cargaHorariaIntegralizada && cargaHorariaIntegralizada.total > 0
			? cargaHorariaIntegralizada.total
			: recalcularPorDisciplinas
				? ateOExigido(chObrigatoriaRealizado, exigido.chObrigatoria) +
					ateOExigido(chOptativaRealizado, exigido.chOptativa) +
					ateOExigido(chComplementarRealizado, exigido.chComplementar)
				: chObrigatoriaRealizado + chOptativaRealizado + chComplementarRealizado;

	const realizado = {
		chObrigatoria: chObrigatoriaRealizado,
		chOptativa: chOptativaRealizado,
		chComplementar: chComplementarRealizado,
		chTotal: chTotalRealizado
	};

	const faltam = {
		chObrigatoria: Math.max(0, exigido.chObrigatoria - realizado.chObrigatoria),
		chOptativa: Math.max(0, exigido.chOptativa - realizado.chOptativa),
		chComplementar: Math.max(0, exigido.chComplementar - realizado.chComplementar),
		chTotal: Math.max(0, exigido.chTotal - realizado.chTotal)
	};

	if (recalcularPorDisciplinas) {
		logMudancaCurso('Resumo final da simulação', {
			exigido,
			realizado,
			faltam
		});
	}

	/** Optativas “adicionadas” no fluxo não entram no cálculo (rever depois se necessário). */
	const chOptativaPlanejada = 0;
	const pctOptativaComPlanejamento = pct(exigido.chOptativa, realizado.chOptativa);
	const faltamChOptativaAposPlanejamento = faltam.chOptativa;

	return {
		curriculoCompleto: matriz.curriculoCompleto,
		idMatriz: matriz.idMatriz,
		idCurso: matriz.idCurso,
		exigido,
		realizado,
		faltam,
		codigosObrigatorios,
		codigosConcluidos: [...codesThatCountNormalizados],
		pctObrigatoria: pct(exigido.chObrigatoria, realizado.chObrigatoria),
		pctOptativa: pct(exigido.chOptativa, realizado.chOptativa),
		pctComplementar: pct(exigido.chComplementar, realizado.chComplementar),
		pctTotal: pct(exigido.chTotal, realizado.chTotal),
		chOptativaPlanejada,
		pctOptativaComPlanejamento,
		faltamChOptativaAposPlanejamento
	};
}
