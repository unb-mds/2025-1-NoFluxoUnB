import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SubjectStatusEnum, type SubjectStatusValue } from '$lib/types/materia';
import {
	WCAG_AA_NON_TEXT,
	WCAG_AA_NORMAL_TEXT,
	blend,
	contrastRatio,
	hslToRgb,
	readThemeTokens,
	type Rgb
} from '$lib/utils/color-contrast';
import {
	CARD_OUTLINE,
	CREDIT_CHIP,
	PREREQ_BADGE,
	STATUS_CARD,
	TAG_BADGE,
	statusTextAlpha,
	subjectCardAriaLabel
} from './subject-card-colors';

const statuses = Object.values(SubjectStatusEnum) as SubjectStatusValue[];

const SRC = resolve(__dirname, '../../../..');
const temas = readThemeTokens(readFileSync(resolve(SRC, 'app.css'), 'utf8'));
const TEMAS = Object.entries(temas) as [keyof typeof temas, Record<string, string>][];

function cor(tema: Record<string, string>, token: string): Rgb {
	const v = tema[token];
	if (v === undefined) throw new Error(`token --${token} ausente do app.css`);
	return hslToRgb(v);
}

describe('tokens de status do fluxograma no app.css', () => {
	const usados = new Set<string>();
	for (const c of Object.values(STATUS_CARD)) {
		usados.add(c.bg).add(c.fg);
		if (c.border) usados.add(c.border);
	}
	for (const c of [...Object.values(PREREQ_BADGE), ...Object.values(TAG_BADGE)]) usados.add(c.bg).add(c.fg);
	for (const o of Object.values(CARD_OUTLINE)) usados.add(o.token);

	it.each([...usados])('--%s definido em :root E em .dark', (token) => {
		expect(temas.light[token], ':root').toBeDefined();
		expect(temas.dark[token], '.dark').toBeDefined();
	});

	it('className usa o utilitário do token (sem hex solto)', () => {
		for (const c of Object.values(STATUS_CARD)) expect(c.className).toBe(`bg-${c.bg}`);
		for (const c of [...Object.values(PREREQ_BADGE), ...Object.values(TAG_BADGE)]) {
			expect(c.className).toContain(`bg-${c.bg}`);
			expect(c.className).toContain(`text-${c.fg}`);
		}
		for (const o of Object.values(CARD_OUTLINE)) expect(o.className).toContain(`border-${o.token}/`);
	});
});

describe.each(TEMAS)('contraste do SubjectCard — tema %s (pré-mortem R28)', (_nome, tema) => {
	const pagina = cor(tema, 'background');

	it.each(statuses)('texto do card %s >= 4.5:1', (status) => {
		const c = STATUS_CARD[status];
		const bg = cor(tema, c.bg);
		const texto = blend(cor(tema, c.fg), statusTextAlpha(status), bg);
		expect(contrastRatio(texto, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	it.each(statuses)('texto secundário ("libera N") no card %s >= 4.5:1', (status) => {
		const c = STATUS_CARD[status];
		const bg = cor(tema, c.bg);
		const texto = blend(cor(tema, c.fg), c.textSoftAlpha, bg);
		expect(contrastRatio(texto, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	it.each(statuses)('chip de créditos no card %s >= 4.5:1', (status) => {
		const c = STATUS_CARD[status];
		const chip = blend([0, 0, 0], CREDIT_CHIP.overlayAlpha, cor(tema, c.bg));
		const texto = blend(cor(tema, c.fg), statusTextAlpha(status) * CREDIT_CHIP.textOpacity, chip);
		expect(contrastRatio(texto, chip)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	it.each(Object.entries(PREREQ_BADGE))('badge de pré-requisito %s >= 4.5:1', (_n, b) => {
		expect(contrastRatio(cor(tema, b.fg), cor(tema, b.bg))).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	it.each(Object.entries(TAG_BADGE))('etiqueta %s >= 4.5:1', (_n, t) => {
		expect(contrastRatio(cor(tema, t.fg), cor(tema, t.bg))).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
	});

	it.each(Object.entries(CARD_OUTLINE))('contorno %s >= 3:1 contra o fundo da página', (_n, o) => {
		const borda = blend(cor(tema, o.token), o.borderAlpha, pagina);
		expect(contrastRatio(borda, pagina)).toBeGreaterThanOrEqual(WCAG_AA_NON_TEXT);
	});
});

describe('card bloqueado se destaca da página', () => {
	// No claro o fundo do card é quase o da página, então a borda carrega o
	// contorno (>= 3:1). No escuro o visual é o filete sutil herdado do tema
	// dark premium — o texto (>= 4.5:1) é o que identifica o card.
	it('tema claro: borda do card bloqueado >= 3:1 contra --background', () => {
		const c = STATUS_CARD[SubjectStatusEnum.LOCKED];
		expect(contrastRatio(cor(temas.light, c.border!), cor(temas.light, 'background'))).toBeGreaterThanOrEqual(
			WCAG_AA_NON_TEXT
		);
	});
});

describe('sem cor que só funciona no escuro nos componentes do card e do modal', () => {
	const arquivos = [
		'lib/components/fluxograma/cards/SubjectCard.svelte',
		'lib/components/fluxograma/cards/subject-card-colors.ts',
		'lib/components/materia/MateriaNaturezaBadge.svelte',
		'lib/components/fluxograma/modal/SubjectDetailsModal.svelte',
		'lib/components/fluxograma/modal/ManualStatusEditor.svelte',
		'lib/components/fluxograma/modal/SubjectClassesTab.svelte'
	];
	// Texto/borda branco, hex arbitrário e tons claros (50–400) sem par `dark:`
	// somem no tema claro. Permitido: com prefixo `dark:`, e no card o filete
	// `border-white/10` sobre fundo saturado (STATUS_CARD.borderClass).
	const proibido =
		/(?<![\w:/-])(?:hover:|focus:|placeholder:)?(?:text|bg|border|ring|from|to|placeholder)-(?:white(?:\/\d+)?(?![\w-])|\[#[0-9a-f]{3,8}\]|(?:gray|zinc|slate|sky|cyan|amber|rose|red|purple|green|teal|emerald|blue|indigo|violet|orange|yellow)-(?:[1-4]00|50)\b)/gi;

	it.each(arquivos)('%s', (arquivo) => {
		const fonte = readFileSync(resolve(SRC, arquivo), 'utf8');
		const permitidos = arquivo.includes('/cards/') ? ['border-white/10'] : [];
		const achados = [...fonte.matchAll(proibido)].map((m) => m[0]).filter((c) => !permitidos.includes(c));
		expect(achados).toEqual([]);
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
