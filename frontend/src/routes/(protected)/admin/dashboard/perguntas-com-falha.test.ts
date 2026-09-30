/**
 * perguntas_com_falha (migration 20260929b) conta toda pergunta cuja linha da
 * rota paga tem success=false — inclusive o stream abandonado pelo aluno depois
 * de o upstream responder, que NÃO é estornado (conta na cota). Enquanto o
 * ai_usage_log não tiver uma coluna "estornada", o card não pode afirmar que
 * essas perguntas foram estornadas.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pagina = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

describe('dashboard admin: rótulo de perguntas_com_falha', () => {
	const bloco = /\{#if aiCost\.perguntas_com_falha\}[\s\S]*?\{\/if\}/.exec(pagina)?.[0] ?? '';

	it('o bloco do card existe', () => {
		expect(bloco).not.toBe('');
	});

	it('diz "com falha ou abandonadas" e não afirma que todas foram estornadas', () => {
		expect(bloco).toContain('com falha ou abandonadas (custo incluído)');
		expect(bloco).not.toMatch(/com falha \(estornadas/);
	});

	it('o title explica que o abandono conta na cota', () => {
		expect(bloco).toMatch(/abandonados[^"]*contam na cota/);
	});
});
