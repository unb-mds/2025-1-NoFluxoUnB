import { beforeAll, describe, expect, it } from 'vitest';
import { extractDisciplinasFromPositions, type PositionedTextItem } from './pdfPositionExtractor';

/**
 * Itens posicionados SINTÉTICOS, nas colunas medidas no histórico do SIGAA
 * (período 41, código 91, nome 129, CH 417, turma 451, freq 476, nota 508,
 * situação 538).
 */

beforeAll(() => {
	console.log = () => {};
});

const it_ = (x: number, y: number, text: string): PositionedTextItem => ({ x, y, text, width: 0 });

function linha(y: number, periodo: PositionedTextItem[], code: string, sit: string): PositionedTextItem[] {
	return [
		...periodo,
		it_(91, y, code),
		it_(129, y, 'CÁLCULO 1'),
		it_(417, y, '90'),
		it_(451, y, '01'),
		it_(476, y, '100,0'),
		it_(508, y, 'MS'),
		it_(538, y, sit)
	];
}

describe('período do componente (R37)', () => {
	it('"2020." e "2" em itens separados viram "2020.2"', () => {
		const [d] = extractDisciplinasFromPositions([linha(700, [it_(41, 700, '2020.'), it_(62, 700, '2')], 'MAT0025', 'APR')]);
		expect(d.ano_periodo).toBe('2020.2');
	});

	it('período truncado "2020." fica desconhecido, nunca "2020.0"', () => {
		const [d] = extractDisciplinasFromPositions([linha(700, [it_(41, 700, '2020.')], 'MAT0025', 'APR')]);
		expect(d.ano_periodo).toBe('');
	});

	it('período completo continua igual', () => {
		const [d] = extractDisciplinasFromPositions([linha(700, [it_(41, 700, '2023.4')], 'MAT0025', 'APR')]);
		expect(d.ano_periodo).toBe('2023.4');
	});
});
