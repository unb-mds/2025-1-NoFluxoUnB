import { vi, test, expect, describe, beforeAll } from 'vitest';
import { dataRow, header, pdfFile, type Item } from './genpdf';
import { silenciarLogsDoParser } from './harness';

vi.mock('pdfjs-dist', async () => (await import('./harness')).pdfjsNode());

import { parsePdf } from '../pdfParser';

/**
 * Casos de borda do upload de histórico levantados no pré-mortem de 27/09/2026,
 * todos com PDFs SINTÉTICOS (genpdf.ts) — nenhum dado real de aluno.
 */

type Parsed = Awaited<ReturnType<typeof parsePdf>>;
const regs = (r: Parsed) => r.extracted_data.filter((d) => d.tipo_dado === 'Disciplina Regular');

beforeAll(silenciarLogsDoParser);

describe('R4: nome de disciplina que começa com palavra de metadata', () => {
	// Nomes reais do SIGAA (turmas 2026.1) que colidiam com RE_METADATA_PATTERNS.
	const NOMES = [
		'TRABALHO DE CONCLUSÃO DE CURSO 1',
		'ATENÇÃO PRIMÁRIA À SAÚDE',
		'CURRÍCULO E AVALIAÇÃO EM MATEMÁTICA',
		'UNIVERSIDADE, SOCIEDADE E ESTADO',
		'CAMPUS MULTIMÍDIA',
		'DESCRIÇÃO ARQUIVÍSTICA'
	];

	test('layout inline (código e nome na mesma linha): nenhuma disciplina some', async () => {
		const items: Item[] = [...header(700)];
		let y = 690;
		items.push(
			...dataRow(y, { per: '2024.1', code: 'FGA0138', name: 'MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE', ch: '60', sit: 'APR' })
		);
		NOMES.forEach((n, i) =>
			items.push(...dataRow((y -= 15), { per: '2024.2', code: `XXX00${10 + i}`, name: n, ch: '60', sit: 'APR' }))
		);
		const r = await parsePdf(pdfFile([items]));
		const got = regs(r).map((d) => d.nome);
		expect(got).toEqual(['MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE', ...NOMES]);
	});

	test('layout name-above: o nome na linha de cima não vira metadata', async () => {
		const items: Item[] = [
			...header(700),
			{ x: 129, y: 680, t: 'TRABALHO DE CONCLUSÃO DE CURSO 2' },
			...dataRow(668, { per: '2025.1', code: 'FGA0011', ch: '90', sit: 'APR' }),
			{ x: 129, y: 668, t: 'Dr. FULANO DE TAL (90h)' }
		];
		const r = await parsePdf(pdfFile([items]));
		const d = regs(r)[0];
		expect(d.codigo).toBe('FGA0011');
		expect(d.nome).toBe('TRABALHO DE CONCLUSÃO DE CURSO 2');
	});

	test('rótulos reais de metadata continuam fora da lista de disciplinas', async () => {
		const items: Item[] = [
			...header(700),
			...dataRow(690, { per: '2024.1', code: 'FGA0138', name: 'MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE', ch: '60', sit: 'APR' }),
			{ x: 129, y: 600, t: 'Trabalho de Conclusão de Curso: Não informado' },
			{ x: 129, y: 588, t: 'Atenção, a lista de componentes pendentes pode mudar.' },
			{ x: 129, y: 576, t: 'Universidade de Brasília' },
			{ x: 129, y: 564, t: 'Campus: Gama' }
		];
		const r = await parsePdf(pdfFile([items]));
		expect(regs(r).map((d) => d.codigo)).toEqual(['FGA0138']);
	});
});
