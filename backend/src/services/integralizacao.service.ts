/**
 * Serviço global de integralização.
 * Compara exigido (matrizes) vs realizado (PDF) e retorna pronto para o front.
 * A porcentagem é calculada aqui no backend (Node.js), não no banco.
 */

import { SupabaseWrapper } from '../supabase_wrapper';

export interface CargaHorariaIntegralizada {
	obrigatoria: number;
	optativa: number;
	complementar: number;
	total: number;
}

/**
 * Percentual cumprido. Só chega a 100 quando realizado >= exigido: arredondar
 * para cima mostrava 100% com horas ainda faltando (ex.: 3840 de 3855 h).
 * Manter igual a `pct` em frontend/src/lib/services/integralizacao.service.ts.
 */
export function pct(exigido: number, realizado: number): number {
	if (exigido <= 0) return 0;
	if (realizado >= exigido) return 100;
	return Math.max(0, Math.min(99, Math.floor((realizado / exigido) * 100)));
}

/** CH vinda do body/banco pode chegar como string ou negativa: normaliza para número >= 0. */
function ch(valor: unknown): number {
	return Math.max(0, Number(valor) || 0);
}

export interface IntegralizacaoResult {
	curriculoCompleto: string;
	idMatriz: number;
	idCurso: number;
	exigido: { chObrigatoria: number; chOptativa: number; chComplementar: number; chTotal: number };
	realizado: { chObrigatoria: number; chOptativa: number; chComplementar: number; chTotal: number };
	faltam: { chObrigatoria: number; chOptativa: number; chComplementar: number; chTotal: number };
	pctObrigatoria: number;
	pctOptativa: number;
	pctComplementar: number;
	pctTotal: number;
}

export async function calcularIntegralizacao(
	curriculoCompleto: string,
	cargaHorariaIntegralizada: CargaHorariaIntegralizada | null
): Promise<IntegralizacaoResult | null> {
	if (!curriculoCompleto?.trim() || !cargaHorariaIntegralizada) return null;

	const cc = curriculoCompleto.trim();

	// Busca matriz por curriculo_completo exato
	let { data: matriz, error } = await SupabaseWrapper.get()
		.from('matrizes')
		.select('id_matriz, id_curso, curriculo_completo, ch_obrigatoria_exigida, ch_optativa_exigida, ch_complementar_exigida, ch_total_exigida')
		.eq('curriculo_completo', cc)
		.maybeSingle();

	if (error) throw new Error(`Erro ao buscar matriz: ${error.message}`);

	// Fallback: match por prefixo (ex: "6360/1" -> "6360/1 - 2017.1")
	if (!matriz && cc.includes('/')) {
		const prefix = cc.split(' - ')[0]?.trim() ?? cc;
		const { data: rows } = await SupabaseWrapper.get()
			.from('matrizes')
			.select('id_matriz, id_curso, curriculo_completo, ch_obrigatoria_exigida, ch_optativa_exigida, ch_complementar_exigida, ch_total_exigida')
			.like('curriculo_completo', prefix + '%')
			.order('curriculo_completo')
			.limit(1);
		matriz = rows?.[0] ?? null;
	}

	if (!matriz) return null;

	const exObr = ch(matriz.ch_obrigatoria_exigida);
	const exOpt = ch(matriz.ch_optativa_exigida);
	const exCompl = ch(matriz.ch_complementar_exigida);
	const exTotal = ch(matriz.ch_total_exigida);

	const reObr = ch(cargaHorariaIntegralizada.obrigatoria);
	const reOpt = ch(cargaHorariaIntegralizada.optativa);
	const reCompl = ch(cargaHorariaIntegralizada.complementar);
	const reTotal = ch(cargaHorariaIntegralizada.total) > 0
		? ch(cargaHorariaIntegralizada.total)
		: reObr + reOpt + reCompl;

	return {
		curriculoCompleto: matriz.curriculo_completo,
		idMatriz: matriz.id_matriz,
		idCurso: matriz.id_curso,
		exigido: { chObrigatoria: exObr, chOptativa: exOpt, chComplementar: exCompl, chTotal: exTotal },
		realizado: { chObrigatoria: reObr, chOptativa: reOpt, chComplementar: reCompl, chTotal: reTotal },
		faltam: {
			chObrigatoria: Math.max(0, exObr - reObr),
			chOptativa: Math.max(0, exOpt - reOpt),
			chComplementar: Math.max(0, exCompl - reCompl),
			chTotal: Math.max(0, exTotal - reTotal)
		},
		pctObrigatoria: pct(exObr, reObr),
		pctOptativa: pct(exOpt, reOpt),
		pctComplementar: pct(exCompl, reCompl),
		pctTotal: pct(exTotal, reTotal)
	};
}
