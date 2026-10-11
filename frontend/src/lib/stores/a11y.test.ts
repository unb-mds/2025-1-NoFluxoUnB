import { describe, expect, it } from 'vitest';
import { A11Y_CLASS, A11Y_DEFAULTS, A11Y_KEYS, classesFor, countActive, parseStoredSettings } from './a11y';

describe('a11y store — leitura das preferências salvas', () => {
	it('sem nada salvo, tudo desligado e "reduzir movimento" segue o sistema', () => {
		expect(parseStoredSettings(null, false)).toEqual(A11Y_DEFAULTS);
		expect(parseStoredSettings(null, true)).toEqual({ ...A11Y_DEFAULTS, reducedMotion: true });
	});

	it('valor salvo tem prioridade sobre a preferência do sistema', () => {
		const raw = JSON.stringify({ ...A11Y_DEFAULTS, reducedMotion: false, highContrast: true });
		expect(parseStoredSettings(raw, true)).toEqual({ ...A11Y_DEFAULTS, highContrast: true });
	});

	it('só aceita true literal: strings, números e chaves desconhecidas são ignorados', () => {
		const raw = JSON.stringify({ highContrast: 'sim', largeText: 1, focusBold: true, invasor: true });
		const parsed = parseStoredSettings(raw);
		expect(parsed).toEqual({ ...A11Y_DEFAULTS, focusBold: true });
		expect(Object.keys(parsed)).toEqual(A11Y_KEYS);
	});

	it('JSON corrompido cai no padrão em vez de quebrar', () => {
		expect(parseStoredSettings('{nope', false)).toEqual(A11Y_DEFAULTS);
		expect(parseStoredSettings('null', true)).toEqual({ ...A11Y_DEFAULTS, reducedMotion: true });
	});
});

describe('a11y store — classes no <html>', () => {
	it('gera exatamente uma classe por preferência ligada, na ordem das chaves', () => {
		const settings = { ...A11Y_DEFAULTS, highContrast: true, focusBold: true };
		expect(classesFor(settings)).toEqual([A11Y_CLASS.highContrast, A11Y_CLASS.focusBold]);
		expect(countActive(settings)).toBe(2);
		expect(classesFor(A11Y_DEFAULTS)).toEqual([]);
	});

	it('cada classe começa com o prefixo a11y- (contrato com app.css e app.html)', () => {
		for (const key of A11Y_KEYS) expect(A11Y_CLASS[key]).toMatch(/^a11y-[a-z-]+$/);
	});
});
