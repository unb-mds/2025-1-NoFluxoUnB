/**
 * Cota diária de perguntas ao Darcy — lógica pura (sem Svelte, sem I/O).
 *
 * O backend conta as perguntas por aluno por dia (dia de Brasília, renova à
 * meia-noite) e devolve `{ cota }` em toda resposta de IA. Erros com código
 * próprio: 401 LOGIN_NECESSARIO (abre o modal de login), 429 COTA_DIARIA
 * (card de limite atingido) e 503 TETO_GLOBAL (o assistente pausou por hoje).
 */

export interface CotaIA {
	usadas: number;
	limite: number;
	restantes: number;
	/** ISO 8601 da próxima meia-noite de Brasília. */
	renova_em: string;
}

export type CorRodinha = 'azul' | 'ambar' | 'vermelho';

export interface EstadoRodinha {
	/** 0..1 do anel preenchido. */
	fracao: number;
	/** 0..100, arredondado. */
	percentual: number;
	cor: CorRodinha;
	/** Texto do tooltip e do aria-label. */
	rotulo: string;
	esgotada: boolean;
}

/**
 * Token de cor (app.css `--status-*`, par light/dark) do traço da rodinha.
 * Nada de sky/amber/rose fixos: esses tons só têm contraste no tema escuro.
 */
export const TOKEN_RODINHA: Record<CorRodinha, 'status-info' | 'status-warning' | 'status-danger'> =
	{
		azul: 'status-info',
		ambar: 'status-warning',
		vermelho: 'status-danger'
	};

/** Fração de perguntas restantes a partir da qual a rodinha fica âmbar. */
export const LIMIAR_AMBAR = 0.2;

export function estadoRodinha(cota: Pick<CotaIA, 'usadas' | 'limite'>): EstadoRodinha {
	const limite = Math.max(0, Math.floor(cota.limite));
	const usadas = Math.max(0, Math.floor(cota.usadas));
	const esgotada = usadas >= limite;
	const fracao = limite > 0 ? Math.min(1, usadas / limite) : 1;
	const restantes = Math.max(0, limite - usadas);
	let cor: CorRodinha = 'azul';
	if (esgotada) cor = 'vermelho';
	else if (limite > 0 && restantes / limite <= LIMIAR_AMBAR) cor = 'ambar';
	const plural = limite === 1 ? 'pergunta' : 'perguntas';
	return {
		fracao,
		percentual: Math.round(fracao * 100),
		cor,
		rotulo: `${usadas} de ${limite} ${plural} hoje. Renova à meia-noite.`,
		esgotada
	};
}

export type TipoErroIA = 'login' | 'cota' | 'teto' | 'outro';

export interface ErroIAClassificado {
	tipo: TipoErroIA;
	/** Presente no 429 (o backend manda usadas/limite/renova_em). */
	cota?: CotaIA;
	/** Mensagem pronta para exibir (teto global / cota). */
	mensagem?: string;
}

export const MSG_TETO_GLOBAL = 'O assistente atingiu o limite de uso de hoje. Volta amanhã.';

/** Erro lançado pelos serviços de IA: carrega o status e o corpo cru da resposta. */
export class ErroIA extends Error {
	constructor(
		readonly status: number,
		readonly corpo: string,
		contexto: string
	) {
		// Mantém o formato antigo da mensagem (isAiSemCreditos casa por ela).
		super(`Erro ${status} ao chamar ${contexto}: ${corpo || 'Resposta inválida'}`);
		this.name = 'ErroIA';
	}
}

function lerJson(texto: string): Record<string, unknown> | null {
	const inicio = texto.indexOf('{');
	if (inicio < 0) return null;
	try {
		const v = JSON.parse(texto.slice(inicio));
		return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function status(erro: unknown): number | null {
	if (erro instanceof ErroIA) return erro.status;
	const m = /Erro (\d{3}) ao chamar/.exec(erro instanceof Error ? erro.message : String(erro ?? ''));
	return m ? Number(m[1]) : null;
}

/** Classifica qualquer erro vindo de um serviço de chat do Darcy. */
export function classificarErroIA(erro: unknown): ErroIAClassificado {
	const texto = erro instanceof ErroIA ? erro.corpo : erro instanceof Error ? erro.message : String(erro ?? '');
	const corpo = lerJson(texto);
	const codigo = typeof corpo?.codigo === 'string' ? corpo.codigo : null;
	const st = status(erro);

	if (codigo === 'LOGIN_NECESSARIO' || (st === 401 && codigo === null)) return { tipo: 'login' };

	if (codigo === 'COTA_DIARIA') {
		const usadas = Number(corpo?.usadas ?? 0);
		const limite = Number(corpo?.limite ?? 0);
		const cota: CotaIA = {
			usadas,
			limite,
			restantes: Math.max(0, limite - usadas),
			renova_em: String(corpo?.renova_em ?? '')
		};
		return { tipo: 'cota', cota, mensagem: `Você usou suas ${limite} perguntas de hoje` };
	}

	if (codigo === 'TETO_GLOBAL') return { tipo: 'teto', mensagem: MSG_TETO_GLOBAL };

	return { tipo: 'outro' };
}

/** True quando a cota já renovou (passou da meia-noite de Brasília informada). */
export function cotaRenovou(cota: Pick<CotaIA, 'renova_em'>, agora: number = Date.now()): boolean {
	const t = Date.parse(cota.renova_em);
	return Number.isFinite(t) && agora >= t;
}

/** Corpo do ticket de "Mais perguntas no Darcy". */
export type OpcaoPedido = 'hoje' | 'semana' | 'limite';

export const OPCOES_PEDIDO: Record<OpcaoPedido, string> = {
	hoje: 'Só hoje (+30)',
	semana: 'Esta semana',
	limite: 'Aumentar meu limite'
};

export const TITULO_PEDIDO = 'Mais perguntas no Darcy';
export const TIPO_TICKET_PEDIDO = 'darcy_mais_perguntas';

export function montarPedidoMaisPerguntas(
	motivo: string,
	opcao: OpcaoPedido,
	cota: Pick<CotaIA, 'usadas' | 'limite'> | null
): { title: string; description: string; metadata: Record<string, unknown> } {
	const motivoLimpo = motivo.trim();
	const uso = cota ? `${cota.usadas} de ${cota.limite} perguntas usadas hoje` : 'uso de hoje indisponível';
	return {
		title: TITULO_PEDIDO,
		description: [
			`Pedido: ${OPCOES_PEDIDO[opcao]}`,
			`Uso: ${uso}`,
			'',
			'Motivo:',
			motivoLimpo
		].join('\n'),
		metadata: {
			tipo: TIPO_TICKET_PEDIDO,
			opcao,
			motivo: motivoLimpo,
			usadas: cota?.usadas ?? null,
			limite: cota?.limite ?? null
		}
	};
}
