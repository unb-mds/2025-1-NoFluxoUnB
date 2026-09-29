import { describe, expect, it } from 'vitest';
import {
	emHorarioDeUso,
	fmtHoras,
	haQuanto,
	horaBrasilia,
	linhasSaude,
	logParado,
	textoSemPreco
} from './dashboard-admin';
import type { AiSaudeLog } from '$lib/types/dashboard';

// 15:00 em Brasília (UTC-3) = 18:00 UTC
const TARDE = new Date('2026-09-29T18:00:00Z');
// 03:00 em Brasília = 06:00 UTC
const MADRUGADA = new Date('2026-09-29T06:00:00Z');

describe('horário de uso (Brasília)', () => {
	it('lê a hora no fuso de Brasília, não no do navegador', () => {
		expect(horaBrasilia(TARDE)).toBe(15);
		expect(horaBrasilia(MADRUGADA)).toBe(3);
		// 01:30 UTC de 30/09 = 22:30 de 29/09 em Brasília
		expect(horaBrasilia(new Date('2026-09-30T01:30:00Z'))).toBe(22);
	});

	it('8h–23h é horário de uso', () => {
		expect(emHorarioDeUso(TARDE)).toBe(true);
		expect(emHorarioDeUso(MADRUGADA)).toBe(false);
		expect(emHorarioDeUso(new Date('2026-09-29T11:00:00Z'))).toBe(true); // 08:00
		expect(emHorarioDeUso(new Date('2026-09-30T02:00:00Z'))).toBe(false); // 23:00
	});
});

describe('logParado', () => {
	it('alerta quando não há linha há mais de 3 h em horário de uso', () => {
		expect(logParado('2026-09-29T14:30:00Z', TARDE)).toBe(true); // 3h30
		expect(logParado('2026-09-29T15:30:00Z', TARDE)).toBe(false); // 2h30
	});

	it('alerta quando não há nenhuma linha no período', () => {
		expect(logParado(null, TARDE)).toBe(true);
	});

	it('de madrugada não alerta (é normal ninguém perguntar)', () => {
		expect(logParado('2026-09-28T20:00:00Z', MADRUGADA)).toBe(false);
		expect(logParado(null, MADRUGADA)).toBe(false);
	});

	it('N horas configurável', () => {
		expect(logParado('2026-09-29T16:30:00Z', TARDE, 1)).toBe(true);
	});
});

describe('haQuanto', () => {
	it.each([
		[null, 'sem registro'],
		['2026-09-29T17:59:40Z', 'agora'],
		['2026-09-29T17:55:00Z', 'há 5 min'],
		['2026-09-29T15:00:00Z', 'há 3 h'],
		['2026-09-26T18:00:00Z', 'há 3 dias']
	])('%s → %s', (iso, esperado) => {
		expect(haQuanto(iso, TARDE)).toBe(esperado);
	});
});

describe('linhasSaude', () => {
	const saude: AiSaudeLog = {
		ultimo_registro: '2026-09-29T17:00:00Z',
		requisicoes: 10,
		falhas: 3,
		taxa_falha: 30,
		por_endpoint: {
			'chat-send': { ultimo_registro: '2026-09-29T12:00:00Z', requisicoes: 4, falhas: 0, taxa_falha: 0 },
			analyze: { ultimo_registro: '2026-09-29T17:00:00Z', requisicoes: 2, falhas: 1, taxa_falha: 50 },
			'assistente-chat': { ultimo_registro: '2026-09-29T16:00:00Z', requisicoes: 4, falhas: 2, taxa_falha: 20 }
		}
	};

	it('mais recente primeiro, com "há X" e alerta de falha ≥ 20%', () => {
		expect(linhasSaude(saude, TARDE).map((l) => [l.endpoint, l.haQuanto, l.falhaAlta])).toEqual([
			['analyze', 'há 1 h', true],
			['assistente-chat', 'há 2 h', true],
			['chat-send', 'há 6 h', false]
		]);
	});

	it('sem saúde (banco antes da migration): lista vazia', () => {
		expect(linhasSaude(undefined, TARDE)).toEqual([]);
	});
});

describe('textoSemPreco', () => {
	it('nomeia cada modelo e o motivo', () => {
		expect(
			textoSemPreco([
				{ model: 'gemini-embedding-001', motivo: 'sem_cadastro', requisicoes: 12, tokens: 300 },
				{ model: 'ragflow', motivo: 'preco_zero', requisicoes: 1, tokens: 0 }
			])
		).toBe(
			'Custo não calculado para: gemini-embedding-001 (sem preço cadastrado, 12 chamadas); ragflow (preço 0, 1 chamada). Esses modelos entram como R$ 0 no total até terem preço em ai_pricing.'
		);
	});

	it('vazio quando todos têm preço', () => {
		expect(textoSemPreco([])).toBe('');
		expect(textoSemPreco(undefined)).toBe('');
	});
});

describe('fmtHoras', () => {
	it.each([
		[0.75, '45 min'],
		[2.5, '2,5 h'],
		[36, '36 h'],
		[72, '3 dias'],
		[0, '—'],
		[undefined, '—']
	])('%s → %s', (h, esperado) => {
		expect(fmtHoras(h)).toBe(esperado);
	});
});
