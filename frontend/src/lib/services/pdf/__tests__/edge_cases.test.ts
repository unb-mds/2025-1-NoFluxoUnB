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

describe('R12: PDF que não é histórico do SIGAA', () => {
	const mensagemDe = (p: Promise<unknown>) => p.then(() => '', (e: Error) => e.message);

	test('declaração de matrícula é rejeitada em vez de "processada com sucesso"', async () => {
		const items: Item[] = [
			{ x: 50, y: 800, t: 'DECLARAÇÃO DE MATRÍCULA' },
			{ x: 50, y: 780, t: 'Declaramos que o aluno está regularmente matriculado.' },
			{ x: 50, y: 760, t: 'Emitido em 16/01/2025' }
		];
		const msg = await mensagemDe(parsePdf(pdfFile([items])));
		expect(msg).toMatch(/histórico escolar do SIGAA/);
	});

	test('histórico sem nenhuma disciplina cursada nem pendente é rejeitado', async () => {
		const msg = await mensagemDe(parsePdf(pdfFile([header(700)])));
		expect(msg).toMatch(/histórico escolar do SIGAA/);
	});

	test('histórico sintético mínimo continua passando', async () => {
		const items: Item[] = [
			...header(700),
			...dataRow(690, { per: '2024.1', code: 'FGA0138', name: 'MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE', ch: '60', sit: 'APR' })
		];
		const r = await parsePdf(pdfFile([items]));
		expect(regs(r)).toHaveLength(1);
		expect(r.matriz_curricular).toBe('6360/1');
	});
});

describe('R40: seção de obrigatórias pendentes com palavras coladas pelo pdf.js', () => {
	test('cabeçalho "ComponentesCurriculares ObrigatóriosPendentes" não zera os pendentes', async () => {
		const pend = (y: number, code: string, name: string, ch: string, obs?: string): Item[] => [
			{ x: 34, y, t: code },
			{ x: 91, y, t: name },
			...(obs ? [{ x: 290, y, t: obs }] : []),
			{ x: 417, y, t: ch }
		];
		const items: Item[] = [
			...header(700),
			...dataRow(690, { per: '2024.1', code: 'FGA0138', name: 'MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE', ch: '60', sit: 'APR' }),
			{ x: 34, y: 500, t: 'ComponentesCurriculares ObrigatóriosPendentes:3' },
			{ x: 34, y: 488, t: 'Código' },
			{ x: 91, y: 488, t: 'ComponenteCurricular' },
			{ x: 417, y: 488, t: 'CH' },
			...pend(476, 'FGA0168', 'DESENHO INDUSTRIAL ASSISTIDO PORCOMPUTADOR', '90h'),
			...pend(464, 'FGA0172', 'REQUISITOS DESOFTWARE', '60h', 'MatriculadoemEquivalente'),
			...pend(452, 'IFD0171', 'FISICA1', '60h')
		];
		const r = await parsePdf(pdfFile([items]));
		const pendentes = r.extracted_data.filter((d) => d.tipo_dado === 'Disciplina Pendente');
		expect(pendentes.map((d) => `${d.codigo}:${d.status}:${d.carga_horaria}`)).toEqual([
			'FGA0168:PENDENTE:90',
			'FGA0172:MATR:60',
			'IFD0171:PENDENTE:60'
		]);
	});
});

describe('R38: PDF que o pdf.js não consegue abrir', () => {
	const mensagemDe = (p: Promise<unknown>) => p.then(() => '', (e: Error) => e.message);

	test('PDF protegido por senha: mensagem em pt-BR, não o erro cru do pdf.js', async () => {
		const msg = await mensagemDe(parsePdf(pdfFile([[{ x: 50, y: 800, t: 'x' }]], { encrypt: true })));
		expect(msg).toMatch(/senha/i);
		expect(msg).not.toMatch(/password/i);
	});

	test('bytes aleatórios com extensão .pdf: mensagem de arquivo inválido/corrompido', async () => {
		const lixo = new Uint8Array(2048).map((_, i) => (i * 37 + 11) % 256);
		const msg = await mensagemDe(parsePdf(new File([lixo], 'historico.pdf', { type: 'application/pdf' })));
		expect(msg).toMatch(/inválido|corrompido/i);
	});
});

describe('R36: sobra de quebra de linha da lista de professores', () => {
	test('"NOME (12h)" longo não vira nome da próxima disciplina', async () => {
		const items: Item[] = [
			...header(700),
			{ x: 129, y: 680, t: 'VIGILÂNCIA EPIDEMIOLÓGICA COMUNITÁRIA E PARTICIPATIVA' },
			...dataRow(668, { per: '2020.2', code: 'DEG0204', ch: '60', sit: 'APR' }),
			{ x: 129, y: 668, t: 'Dra. ANA (12h), Dr. BRUNO (12h), Dr.' },
			// sobra da quebra de linha: o nome do 3º professor cai na linha de baixo
			{ x: 129, y: 656, t: 'JONAS LOTUFO BRANT DE CARVALHO (12h)' },
			{ x: 129, y: 644, t: 'ENGENHARIA E AMBIENTE' },
			...dataRow(632, { per: '2020.2', code: 'FGA0161', ch: '60', sit: 'APR' }),
			{ x: 129, y: 632, t: 'Dra. CARLA (60h)' }
		];
		const r = await parsePdf(pdfFile([items]));
		const porCodigo = Object.fromEntries(regs(r).map((d) => [d.codigo, d]));
		expect(porCodigo.FGA0161.nome).toBe('ENGENHARIA E AMBIENTE');
		expect(porCodigo.DEG0204.nome).toBe('VIGILÂNCIA EPIDEMIOLÓGICA COMUNITÁRIA E PARTICIPATIVA');
		expect(porCodigo.DEG0204.professor).toContain('JONAS LOTUFO BRANT DE CARVALHO');
	});
});
