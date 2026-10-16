/**
 * Semana de uma grade para a mini-grade do chat da Darcy: a partir dos horários
 * SIGAA de cada matéria, diz em que dia e em que módulos cada uma cai. Usa o
 * mesmo bitmask e o mesmo agrupamento de blocos do Montador
 * (`slotMaskFromHorario`, `SLOTS_DIA`, `agruparBlocosDia`) — nenhuma geometria nova.
 */
import {
	DIAS_SEMANA,
	SLOTS_DIA,
	agruparBlocosDia,
	bitIndex,
	slotMaskFromHorario
} from './horario-slots';

export interface BlocoPreview {
	codigo: string;
	/** Posição do primeiro módulo em `SLOTS_DIA`. */
	slotInicio: number;
	/** Quantos módulos seguidos. */
	span: number;
	/** "08:00" */
	inicio: string;
	/** "09:50" */
	fim: string;
}

export interface DiaPreview {
	cod: string;
	label: string;
	blocos: BlocoPreview[];
}

export interface SemanaPreview {
	dias: DiaPreview[];
	/** Faixa de módulos com aula (para a grade compacta só desenhar o necessário). */
	slotMin: number;
	slotMax: number;
	/** Matérias sem horário reconhecível (EAD, "A DEFINIR"). */
	semHorario: string[];
}

/**
 * Monta a semana. Sábado só entra se tiver aula; seg–sex sempre aparecem (dia
 * vazio também é informação: "sexta livre").
 */
export function montarSemanaPreview(
	itens: ReadonlyArray<{ codigo: string; horario: string | null | undefined }>
): SemanaPreview {
	const comMask = itens.map((i) => ({ codigo: i.codigo, mask: slotMaskFromHorario(i.horario) }));
	const semHorario = comMask.filter((i) => i.mask === 0n).map((i) => i.codigo);

	let slotMin = SLOTS_DIA.length;
	let slotMax = -1;
	const dias: DiaPreview[] = [];
	for (const dia of DIAS_SEMANA) {
		const porSlot = SLOTS_DIA.map((slot) => {
			const bit = 1n << BigInt(bitIndex(dia.cod, slot.offset));
			return comMask.find((i) => (i.mask & bit) !== 0n)?.codigo ?? null;
		});
		const blocos = agruparBlocosDia(porSlot).map(
			(b): BlocoPreview => ({
				codigo: b.codigo,
				slotInicio: b.offsetStart,
				span: b.span,
				inicio: SLOTS_DIA[b.offsetStart].inicio,
				fim: SLOTS_DIA[b.offsetStart + b.span - 1].fim
			})
		);
		for (const b of blocos) {
			slotMin = Math.min(slotMin, b.slotInicio);
			slotMax = Math.max(slotMax, b.slotInicio + b.span - 1);
		}
		if (dia.cod === '7' && blocos.length === 0) continue;
		dias.push({ cod: dia.cod, label: dia.label, blocos });
	}
	if (slotMax < 0) slotMin = 0;
	return { dias, slotMin, slotMax, semHorario };
}

/** 80 → "1h20"; 45 → "45min"; 0 → "0min". */
export function formatarMinutos(min: number): string {
	const m = Math.max(0, Math.round(min));
	if (m < 60) return `${m}min`;
	const h = Math.floor(m / 60);
	const r = m % 60;
	return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`;
}

/** Nome curto da estratégia para abas do comparador. */
export function rotuloCurtoEstrategia(estrategia: string): string {
	const e = estrategia.toLowerCase();
	if (e.includes('dias')) return 'Menos dias';
	if (e.includes('furo') || e.includes('lacuna')) return 'Menos furos';
	if (e.includes('equilibr')) return 'Equilibrada';
	return estrategia;
}
