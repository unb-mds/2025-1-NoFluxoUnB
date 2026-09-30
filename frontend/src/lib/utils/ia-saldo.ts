/**
 * Regras puras do alerta de saldo da IA no dashboard admin (sem Svelte, sem
 * I/O). O banco decide os níveis (get_ai_saldo_status, limiares em
 * ai_saldo_config); aqui só se monta o texto que o admin lê e se valida o
 * valor digitado no formulário.
 */

import type { AiSaldoNivel, AiSaldoStatus, AiSaldoTipoRegistro } from '$lib/types/dashboard';
import { haQuanto } from '$lib/utils/dashboard-admin';

/** Painel onde o saldo real aparece (a Maritaca não tem API pública de saldo). */
export const URL_PAINEL_MARITACA = 'https://plataforma.maritaca.ai';

/** Aviso fixo junto da estimativa. */
export const TEXTO_ESTIMATIVA =
	'Estimativa. Calculada com preço cheio; a Maritaca dá descontos (noturno, cache), então o saldo real tende a ser um pouco maior.';

/** Tom visual do alerta: vira token de status no componente (sem cor fixa). */
export type TomAlerta = 'danger' | 'warning' | 'neutral';

export const TOM_DO_NIVEL: Record<Exclude<AiSaldoNivel, 'ok'>, TomAlerta> = {
	sem_creditos: 'danger',
	urgente: 'danger',
	atencao: 'warning',
	desatualizado: 'neutral'
};

export interface AlertaSaldo {
	nivel: Exclude<AiSaldoNivel, 'ok'>;
	tom: TomAlerta;
	titulo: string;
	texto: string;
}

export const ROTULO_TIPO: Record<AiSaldoTipoRegistro, string> = {
	saldo_atual: 'Saldo atual',
	recarga: 'Recarga'
};

/** "R$ 1.234,56" (moeda do ai_pricing; BRL por padrão). */
export function fmtMoeda(valor: number | null | undefined, moeda = 'BRL'): string {
	return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(
		Number(valor) || 0
	);
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Quanto o saldo dura, em texto: "~12 dias", "menos de 1 dia", "mais de um
 * ano"; `null` quando não há previsão (sem saldo ou sem gasto).
 */
export function fmtDiasRestantes(dias: number | null | undefined): string | null {
	if (dias === null || dias === undefined || !Number.isFinite(Number(dias))) return null;
	const d = Number(dias);
	if (d < 1) return 'menos de 1 dia';
	if (d > 365) return 'mais de um ano';
	return `~${plural(Math.floor(d), 'dia', 'dias')}`;
}

/** Frase da previsão ("Dá para ~12 dias…"), honesta quando não há dado. */
export function textoPrevisao(s: AiSaldoStatus): string {
	const p = s.previsao;
	if (p.media_diaria === null || p.media_diaria === undefined) {
		return 'Sem uso da Maritaca registrado ainda — sem previsão.';
	}
	if (Number(p.media_diaria) <= 0) {
		return `Sem gasto na Maritaca nos últimos ${p.janela_dias} dias — sem previsão.`;
	}
	const media = `${fmtMoeda(p.media_diaria, s.moeda)}/dia`;
	const horas = p.horas_hoje === null || p.horas_hoje === undefined ? null : Number(p.horas_hoje);
	const base =
		horas !== null
			? `média de ${media} projetada de ${plural(Math.round(horas), 'hora', 'horas')} de uso hoje — menos de 1 dia de dados, estimativa instável`
			: p.parcial
				? `média de ${media} em ${plural(p.dias_considerados, 'dia', 'dias')} de dados (menos de ${p.janela_dias})`
				: `média de ${media} nos últimos ${p.janela_dias} dias`;
	const dias = fmtDiasRestantes(p.dias_restantes);
	if (!dias) return `Gasto: ${base}.`;
	return `Dá para ${dias} (${base}).`;
}

function motivoLimiar(s: AiSaldoStatus, reais: number, dias: number): string {
	const saldo = Number(s.saldo_estimado);
	const partes: string[] = [];
	if (saldo < reais) partes.push(`abaixo de ${fmtMoeda(reais, s.moeda)}`);
	const restantes = s.previsao.dias_restantes;
	if (restantes !== null && restantes !== undefined && Number(restantes) < dias) {
		partes.push(`menos de ${plural(dias, 'dia', 'dias')} de uso`);
	}
	return partes.join(' e ');
}

function resumoSaldo(s: AiSaldoStatus): string {
	const dias = fmtDiasRestantes(s.previsao.dias_restantes);
	return `Saldo estimado: ${fmtMoeda(s.saldo_estimado, s.moeda)}${dias ? ` — dá para ${dias}` : ''}`;
}

/** Saldo ou recarga registrado depois da última recusa por falta de créditos. */
function registrouDepoisDaRecusa(s: AiSaldoStatus): boolean {
	const reg = s.ultimo_registro?.registrado_em;
	const evento = s.sem_creditos.ultimo_evento;
	if (!reg || !evento) return false;
	return new Date(reg).getTime() > new Date(evento).getTime();
}

/**
 * Alertas do topo do dashboard, na ordem que o banco devolveu (prioridade:
 * sem créditos, urgente, atenção, desatualizado). `agora` só formata o "há X".
 */
export function alertasSaldo(s: AiSaldoStatus | null | undefined, agora: Date): AlertaSaldo[] {
	if (!s) return [];
	return (s.alertas ?? []).map((nivel): AlertaSaldo => {
		const tom = TOM_DO_NIVEL[nivel];
		switch (nivel) {
			case 'sem_creditos': {
				const n = s.sem_creditos.eventos;
				const h = s.sem_creditos.janela_horas;
				const recusas = `A Maritaca recusou ${plural(n, 'chamada', 'chamadas')} por falta de créditos nas últimas ${h} h (a última ${haQuanto(s.sem_creditos.ultimo_evento, agora)}).`;
				// O banco mantém este alerta pelas `h` horas seguintes à última
				// recusa, mesmo com recarga registrada depois: o texto não promete
				// que registrar apaga o aviso.
				const proximo = registrouDepoisDaRecusa(s)
					? `Já há registro de saldo depois da última recusa; se o Darcy voltou a responder, este aviso some sozinho quando passarem ${h} h sem novas recusas.`
					: `O Darcy fica fora do ar até a recarga em plataforma.maritaca.ai. Depois de recarregar, registre a recarga aqui para o saldo estimado ficar certo — este aviso só some quando passarem ${h} h sem novas recusas.`;
				return { nivel, tom, titulo: 'Créditos acabaram', texto: `${recusas} ${proximo}` };
			}
			case 'urgente':
				return {
					nivel,
					tom,
					titulo: 'Urgente: saldo da IA acabando',
					texto: `${resumoSaldo(s)} (${motivoLimiar(s, s.limiares.urgente_reais, s.limiares.urgente_dias)}). Recarregue em plataforma.maritaca.ai.`
				};
			case 'atencao':
				return {
					nivel,
					tom,
					titulo: 'Atenção: saldo da IA baixo',
					texto: `${resumoSaldo(s)} (${motivoLimiar(s, s.limiares.atencao_reais, s.limiares.atencao_dias)}).`
				};
			case 'desatualizado':
				return {
					nivel,
					tom,
					titulo: 'Saldo desatualizado — confira em plataforma.maritaca.ai',
					texto: s.ultimo_registro
						? `O último registro foi ${haQuanto(s.ultimo_registro.registrado_em, agora)} (mais de ${s.limiares.desatualizado_dias} dias). Informe o saldo que aparece no painel da Maritaca.`
						: 'O saldo da Maritaca nunca foi informado. Informe o valor que aparece no painel para o dashboard estimar quanto ainda resta.'
				};
		}
	});
}

/** "Saldo atual de R$ 100,00 · Ana Admin · há 3 dias". */
export function textoUltimoRegistro(s: AiSaldoStatus | null | undefined, agora: Date): string {
	const r = s?.ultimo_registro;
	if (!r) return 'Nenhum saldo informado ainda.';
	const quem = r.nome || r.email || 'admin sem cadastro';
	return `${ROTULO_TIPO[r.tipo]} de ${fmtMoeda(r.valor, s!.moeda)} · ${quem} · ${haQuanto(r.registrado_em, agora)}`;
}

/**
 * Valor digitado no formulário → número. Aceita "1.234,56", "1234,56",
 * "1234.56", "R$ 50". `null` quando não é um valor válido (vazio, negativo,
 * zero numa recarga, texto).
 */
export function parseValorReais(entrada: string, tipo: AiSaldoTipoRegistro = 'saldo_atual'): number | null {
	let t = entrada.replace(/R\$/gi, '').replace(/\s/g, '');
	if (!t) return null;
	if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
	const v = Number(t);
	if (!Number.isFinite(v) || v < 0) return null;
	if (tipo === 'recarga' && v === 0) return null;
	return v;
}

const fmtDataHoraBr = new Intl.DateTimeFormat('pt-BR', {
	timeZone: 'America/Sao_Paulo',
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
});

/** "27/09/2026, 14:00" no fuso de Brasília; '—' sem data. */
export function fmtDataHora(iso: string | null | undefined): string {
	if (!iso) return '—';
	const d = new Date(iso);
	return Number.isFinite(d.getTime()) ? fmtDataHoraBr.format(d) : '—';
}
