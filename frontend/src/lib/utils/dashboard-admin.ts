/**
 * Regras puras do dashboard admin (sem Svelte, sem I/O): saúde do log de IA,
 * alerta de modelo sem preço e formatação dos tempos do suporte.
 */

import type { AiModeloSemPreco, AiSaudeEndpoint, AiSaudeLog } from '$lib/types/dashboard';

/** Sem nenhuma linha no ai_usage_log há mais que isso, em horário de uso: alerta. */
export const HORAS_SEM_LOG_ALERTA = 3;
/** Horário de uso (Brasília): das 8h até antes das 23h. */
export const HORARIO_USO = { inicio: 8, fim: 23 } as const;
/** Taxa de success=false de um endpoint a partir da qual ele fica em alerta. */
export const TAXA_FALHA_ALERTA = 20;

const FUSO = 'America/Sao_Paulo';

const fmtHora = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hour: 'numeric', hourCycle: 'h23' });

/** Hora (0–23) de `agora` no fuso de Brasília. */
export function horaBrasilia(agora: Date): number {
	const h = fmtHora
		.formatToParts(agora)
		.find((p) => p.type === 'hour')?.value;
	return Number(h) % 24;
}

export function emHorarioDeUso(agora: Date, horario = HORARIO_USO): boolean {
	const h = horaBrasilia(agora);
	return h >= horario.inicio && h < horario.fim;
}

/** "há 5 min", "há 3 h", "há 2 dias"; `null` → "sem registro". */
export function haQuanto(iso: string | null | undefined, agora: Date): string {
	if (!iso) return 'sem registro';
	const ms = agora.getTime() - new Date(iso).getTime();
	if (!Number.isFinite(ms)) return 'sem registro';
	const min = Math.max(0, Math.floor(ms / 60_000));
	if (min < 1) return 'agora';
	if (min < 60) return `há ${min} min`;
	const h = Math.floor(min / 60);
	if (h < 48) return `há ${h} h`;
	return `há ${Math.floor(h / 24)} dias`;
}

const HORA_MS = 3_600_000;

/**
 * Horas de `desde` até `ate` que caem dentro do horário de uso (Brasília).
 * Anda de hora cheia em hora cheia (o fuso de Brasília tem offset de horas
 * inteiras); `limiteMs` encerra cedo quando o total já passou do que importa.
 */
export function msEmHorarioDeUso(
	desde: Date,
	ate: Date,
	horario = HORARIO_USO,
	limiteMs = Number.POSITIVE_INFINITY
): number {
	let t = desde.getTime();
	const fim = ate.getTime();
	if (!Number.isFinite(t) || !Number.isFinite(fim)) return 0;
	let total = 0;
	while (t < fim && total <= limiteMs) {
		const proximaHora = Math.min(fim, (Math.floor(t / HORA_MS) + 1) * HORA_MS);
		if (emHorarioDeUso(new Date(t), horario)) total += proximaHora - t;
		t = proximaHora;
	}
	return total;
}

/**
 * O log parou? Em horário de uso, nenhuma linha há mais de `horas` (ou nenhuma
 * no período) indica que o logger quebrou ou o Darcy caiu — de madrugada é
 * normal ficar parado, então fora do horário não alerta. Só contam as horas
 * dentro do horário de uso: às 8h30 a noite sem perguntas não dispara alerta.
 */
export function logParado(
	ultimoRegistro: string | null | undefined,
	agora: Date,
	horas = HORAS_SEM_LOG_ALERTA,
	horario = HORARIO_USO
): boolean {
	if (!emHorarioDeUso(agora, horario)) return false;
	if (!ultimoRegistro) return true;
	const limite = horas * HORA_MS;
	return msEmHorarioDeUso(new Date(ultimoRegistro), agora, horario, limite) > limite;
}

export interface LinhaSaudeEndpoint extends AiSaudeEndpoint {
	endpoint: string;
	haQuanto: string;
	falhaAlta: boolean;
}

/** Endpoints do mais recente para o mais antigo, com o texto "há X" e o alerta de falha. */
export function linhasSaude(saude: AiSaudeLog | undefined, agora: Date): LinhaSaudeEndpoint[] {
	if (!saude) return [];
	return Object.entries(saude.por_endpoint)
		.map(([endpoint, e]) => ({
			endpoint,
			...e,
			haQuanto: haQuanto(e.ultimo_registro, agora),
			falhaAlta: e.falhas > 0 && Number(e.taxa_falha) >= TAXA_FALHA_ALERTA
		}))
		.sort(
			(a, b) =>
				new Date(b.ultimo_registro ?? 0).getTime() - new Date(a.ultimo_registro ?? 0).getTime()
		);
}

/** Frase do alerta de modelo sem preço (vazia quando todos têm preço). */
export function textoSemPreco(modelos: AiModeloSemPreco[] | undefined): string {
	if (!modelos || modelos.length === 0) return '';
	const partes = modelos.map(
		(m) =>
			`${m.model} (${m.motivo === 'preco_zero' ? 'preço 0' : 'sem preço cadastrado'}, ${m.requisicoes} ${
				m.requisicoes === 1 ? 'chamada' : 'chamadas'
			})`
	);
	return `Custo não calculado para: ${partes.join('; ')}. Esses modelos entram como R$ 0 no total até terem preço em ai_pricing.`;
}

/** Horas do suporte legíveis: "45 min", "2,5 h", "3 dias". */
export function fmtHoras(horas: number | null | undefined): string {
	if (horas === null || horas === undefined || !Number.isFinite(Number(horas))) return '—';
	const h = Number(horas);
	if (h <= 0) return '—';
	if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
	if (h < 48) return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
	const dias = h / 24;
	return `${dias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}
