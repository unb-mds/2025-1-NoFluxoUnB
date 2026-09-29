import { describe, expect, it } from 'vitest';
import { SubjectStatusEnum, type SubjectStatusValue } from '$lib/types/materia';
import { WCAG_AA_NORMAL_TEXT, blend, contrastRatio } from '$lib/utils/color-contrast';
import {
	CREDIT_CHIP,
	PREREQ_BADGE,
	STATUS_CARD_BG,
	TAG_BADGE,
	statusTextAlpha,
	subjectCardAriaLabel
} from './subject-card-colors';

const WHITE = '#ffffff';
const statuses = Object.values(SubjectStatusEnum) as SubjectStatusValue[];

describe('contraste do SubjectCard (pré-mortem R28)', () => {
	it('className e hex descrevem a mesma cor', () => {
		for (const c of [...Object.values(STATUS_CARD_BG), ...Object.values(PREREQ_BADGE), ...Object.values(TAG_BADGE)]) {
			expect(c.className).toContain(`bg-[${c.hex}]`);
		}
	});

	it.each(statuses)('texto do card %s >= 4.5:1', (status) => {
		const bg = STATUS_CARD_BG[status].hex;
		const texto = blend(WHITE, statusTextAlpha(status), bg);
		expect(contrastRatio(texto, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	it.each(statuses)('chip de créditos no card %s >= 4.5:1', (status) => {
		const chip = blend('#000000', CREDIT_CHIP.overlayAlpha, STATUS_CARD_BG[status].hex);
		const texto = blend(WHITE, statusTextAlpha(status) * CREDIT_CHIP.textOpacity, chip);
		expect(contrastRatio(texto, chip)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	it('badge de pré-requisito (cumprido e pendente) >= 4.5:1 com texto branco', () => {
		expect(contrastRatio(WHITE, PREREQ_BADGE.ok.hex)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
		expect(contrastRatio(WHITE, PREREQ_BADGE.pending.hex)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	it.each(Object.entries(TAG_BADGE))('etiqueta %s >= 4.5:1', (_nome, tag) => {
		expect(contrastRatio(tag.text, tag.hex)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});
});

describe('status não só por cor (pré-mortem R28)', () => {
	it('nome acessível traz status e situação dos pré-requisitos', () => {
		expect(
			subjectCardAriaLabel({
				codigo: 'CIC0004',
				nome: 'Algoritmos e Programação de Computadores',
				creditos: 6,
				status: SubjectStatusEnum.AVAILABLE,
				prereqsCompleted: true
			})
		).toBe('CIC0004 Algoritmos e Programação de Computadores, 6 créditos, Disponível, pré-requisitos cumpridos');
		expect(
			subjectCardAriaLabel({
				codigo: 'CIC0090',
				nome: 'Estruturas de Dados',
				creditos: 4,
				status: SubjectStatusEnum.LOCKED,
				prereqsCompleted: false,
				etiquetas: ['optativa']
			})
		).toBe('CIC0090 Estruturas de Dados, 4 créditos, Bloqueado, pré-requisitos pendentes, optativa');
	});

	it('sem badge de pré-requisito o nome não inventa a situação', () => {
		expect(
			subjectCardAriaLabel({ codigo: 'X', nome: 'Y', creditos: 2, status: SubjectStatusEnum.COMPLETED })
		).toBe('X Y, 2 créditos, Aprovado');
	});

	it('cada status tem rótulo próprio — bloqueado e não iniciado dividem o fundo e diferem pelo texto', () => {
		const rotulos = statuses.map((status) =>
			subjectCardAriaLabel({ codigo: 'X', nome: 'Y', creditos: 2, status })
		);
		expect(new Set(rotulos).size).toBe(statuses.length);
	});
});
