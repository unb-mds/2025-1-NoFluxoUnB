/**
 * Indicativo de elegibilidade à mudança de curso (UnB — referência institucional):
 * não substitui edital PPC / SIGAA; usa grade + histórico carregados no NoFluxo.
 */

import { fluxogramaService } from '$lib/services/fluxograma.service';
import type { IntegralizacaoResult } from '$lib/types/matriz';
import type { DadosFluxogramaUser } from '$lib/types/user';
import { getCompletedSubjectCodes } from '$lib/types/user';
import { getCompletedByEquivalenceCodes } from '$lib/types/equivalencia';
import type { EquivalenciaModel } from '$lib/types/equivalencia';
import { isOptativa } from '$lib/types/materia';

/** Carga mínima (h) em disciplinas obrigatórias e/ou optativas do destino conforme norma citada pela coordenação. */
export const CH_MINIMA_CURSO_DESTINO_MUDANCA = 360;

export type AvaliacaoIntegralizacaoOrigem = {
	podeAvaliar: boolean;
	/** Obrigatórias nos semestres 1 e 2 da matriz oficial (níveis 1 e 2 na grade). */
	obrigatoriosPeriodos12Total: number;
	obrigatoriosConcluidos: number;
	codigosPendentes: string[];
	/** Regra 2 (Impeditivo): Ter concluído >= 75% do curso. */
    percentualCargaConcluida: number | null;
    ultrapassou75PorcentoCarga: boolean | null;
    /** Regra 3 (Impeditivo): Ter atingido 50% do tempo máximo de permanência. */
    ultrapassou50PorcentoTempo: boolean | null;
	/** null se não há base para concluir (ex.: sem grade). */
	atendeIntegralizacaoOrigem: boolean | null;
};

export type AvaliacaoIntegralizacaoDestino = {
	/** Soma CH obrigatória + optativa integralizada no destino (simulação). */
	horasObrigatoriasEOptativas: number;
	minimoHorasInstitucional: number;
	atendeCargaDestino: boolean;
	/** Aviso para cursos específicos (ex: Música requer Prova de Habilidade) */
    requerHabilidadeEspecifica: boolean;
};

export type AvaliacaoMudancaCurso = {
	origem: AvaliacaoIntegralizacaoOrigem;
	destino: AvaliacaoIntegralizacaoDestino;
};

/** Expande códigos concluídos + equivalentes declarados na matriz de origem. */
function montarCodigosContamParaGrade(codes: Set<string>, equivalencias: EquivalenciaModel[]): Set<string> {
	const expanded = new Set<string>();
	const upper = [...codes].map((c) => String(c).trim().toUpperCase()).filter(Boolean);
	for (const c of upper) expanded.add(c);
	for (const c of getCompletedByEquivalenceCodes(equivalencias, codes)) expanded.add(String(c).trim().toUpperCase());
	return expanded;
}

/**
 * Avalia dois eixos: (origem) obrigatórias 1º e 2º períodos conforme níveis 1–2 na grade;
 * (destino) ≥360h em obrig + optativa contabilizadas na integralização da simulação.
 */
export async function avaliarRequisitosMudancaCurso(
	dadosFluxograma: DadosFluxogramaUser,
	integralizacaoDestino: IntegralizacaoResult | null,
	integralizacaoOrigem?: IntegralizacaoResult | null
): Promise<AvaliacaoMudancaCurso | null> {
	if (!integralizacaoDestino) return null;

	const horasDestino =
		Math.round((integralizacaoDestino.realizado.chObrigatoria + integralizacaoDestino.realizado.chOptativa) * 10) /
		10;

	// Aviso de Habilidade Específica (Música)
    const destRecord = integralizacaoDestino as unknown as Record<string, any>;
    const cursoDestinoNome = String(destRecord?.curso?.nome ?? destRecord?.nomeCurso ?? destRecord?.nome ?? ''); 
    const nomeNormalizado = cursoDestinoNome.toLowerCase();
	const isMusica = cursoDestinoNome.toLowerCase().includes('música') || cursoDestinoNome.toLowerCase().includes('musica');

	const destino: AvaliacaoIntegralizacaoDestino = {
		horasObrigatoriasEOptativas: horasDestino,
		minimoHorasInstitucional: CH_MINIMA_CURSO_DESTINO_MUDANCA,
		atendeCargaDestino: horasDestino >= CH_MINIMA_CURSO_DESTINO_MUDANCA,
		requerHabilidadeEspecifica: isMusica
	};

	const ccOrigem = (dadosFluxograma.matrizCurricular ?? '').trim();
	
	// Objeto parcial default
    const defaultOrigem: AvaliacaoIntegralizacaoOrigem = {
        podeAvaliar: false,
        obrigatoriosPeriodos12Total: 0,
        obrigatoriosConcluidos: 0,
        codigosPendentes: [],
        percentualCargaConcluida: null,
        ultrapassou75PorcentoCarga: null,
        ultrapassou50PorcentoTempo: null,
        atendeIntegralizacaoOrigem: null
    };
	
	if (!ccOrigem) {
		return {origem: defaultOrigem, destino};
	}

	let origemPartial: AvaliacaoIntegralizacaoOrigem = { ...defaultOrigem };

	try {
		const cursoOrigem = await fluxogramaService.getCourseDataByCurriculoCompleto(ccOrigem);

		const obrigatoriasPrimeirosPeriodos = cursoOrigem.materias.filter((m) => {
			const n = Number(m.nivel);
			if (!Number.isFinite(n) || n < 1 || n > 2) return false;
			return !isOptativa(m);
		});

		const codigosReq = obrigatoriasPrimeirosPeriodos
			.map((m) => String(m.codigoMateria ?? '').trim().toUpperCase())
			.filter(Boolean);

		const uniqueReq = [...new Set(codigosReq)];

		if (uniqueReq.length === 0) {
			return { origem: defaultOrigem, destino };
		}

		const concluded = getCompletedSubjectCodes(dadosFluxograma);
		const conta = montarCodigosContamParaGrade(concluded, cursoOrigem.equivalencias ?? []);

		const pendentes = uniqueReq.filter((c) => !conta.has(c));
		const concluidos = uniqueReq.length - pendentes.length;
		const atendePeriodos12 = pendentes.length === 0;

		let ultrapassou75Carga: boolean | null = null;
		let percentualCarga: number | null = null;

		if(integralizacaoOrigem){
			const { realizado, exigido } = integralizacaoOrigem;
			
			// Edital: optativas contam só até a CH prevista na estrutura do curso de origem
            const chOptativaLimitada = Math.min(realizado.chOptativa, exigido?.chOptativa ?? 0);
            const chComplementarLimitada = Math.min(realizado.chComplementar ?? 0, exigido?.chComplementar ?? 0);
            
			const chConsiderada = realizado.chObrigatoria + chOptativaLimitada + chComplementarLimitada;
            const chTotalExigida = integralizacaoOrigem.exigido?.chTotal ?? 0;

            if (chTotalExigida > 0) {
                const razao = chConsiderada / chTotalExigida;
				ultrapassou75Carga = razao >= 0.75; // compara o valor bruto
				percentualCarga = Math.round(razao * 10000) / 100;
            }
		}

		let ultrapassou50Tempo: boolean | null = null;

		const userRecord = dadosFluxograma as unknown as Record<string, any>;
        const cursoRecord = cursoOrigem as unknown as Record<string, any>;

        const semestresCursados = userRecord.semestresCursados ?? dadosFluxograma.semestreAtual ?? dadosFluxograma.dadosFluxograma.length; 
        const prazoMaximo = cursoRecord.prazoMaximo ?? cursoRecord.semestresMaximo ?? cursoRecord.prazoMaximoPermanencia;

        if (typeof semestresCursados === 'number' && typeof prazoMaximo === 'number' && prazoMaximo > 0) {
            ultrapassou50Tempo = (semestresCursados / prazoMaximo) >= 0.5;
        }

		const checks = [
			atendePeriodos12,
			ultrapassou75Carga === null ? null : !ultrapassou75Carga,
			ultrapassou50Tempo === null ? null : !ultrapassou50Tempo
		];
		const elegivelOrigem = checks.includes(false) ? false : checks.includes(null) ? null : true;

		origemPartial = {
			podeAvaliar: true,
			obrigatoriosPeriodos12Total: uniqueReq.length,
			obrigatoriosConcluidos: concluidos,
			codigosPendentes: pendentes,
			percentualCargaConcluida: percentualCarga,
			ultrapassou75PorcentoCarga: ultrapassou75Carga,
			ultrapassou50PorcentoTempo: ultrapassou50Tempo,
			atendeIntegralizacaoOrigem: elegivelOrigem
		};
	} catch {
		origemPartial = defaultOrigem;
	}

	return { origem: origemPartial, destino };
}
