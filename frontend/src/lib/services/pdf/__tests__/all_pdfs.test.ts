import { vi, test, expect, describe, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileFromPath, listarHistoricosReais, silenciarLogsDoParser, HISTORICOS_REAIS_DIR } from './harness';

vi.mock('pdfjs-dist', async () => (await import('./harness')).pdfjsNode());

import { parsePdf } from '../pdfParser';

/**
 * Regressão com históricos REAIS do SIGAA (pré-mortem 27/09/2026).
 *
 * Os PDFs de alunos NÃO são versionados (LGPD): ficam em test_historicos/ na
 * raiz do repo (ou em HISTORICOS_REAIS_DIR) só na máquina de quem testa, e o
 * describe é pulado quando a pasta não existe ou está vazia. Os PDFs que já
 * estavam no repositório entram quando presentes.
 */

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const JA_VERSIONADOS = [
	path.join(AQUI, '..', 'historico_231011417 (6) - Gustavo Choueiri.pdf'),
	path.join(AQUI, '../../../../../../docs/testes/fixtures/historico_valido.pdf')
].filter((p) => fs.existsSync(p));

const PDFS = [...JA_VERSIONADOS, ...listarHistoricosReais()];

beforeAll(silenciarLogsDoParser);

describe.skipIf(PDFS.length === 0)(`históricos reais (${HISTORICOS_REAIS_DIR})`, () => {
	test.each(PDFS.map((p) => [path.basename(p), p]))('%s: invariantes do parse', async (_nome, p) => {
		const r = await parsePdf(fileFromPath(p));
		const regs = r.extracted_data.filter((d) => d.tipo_dado === 'Disciplina Regular');
		const pend = r.extracted_data.filter((d) => d.tipo_dado === 'Disciplina Pendente');

		expect(regs.length + pend.length).toBeGreaterThan(0);
		for (const d of regs) {
			expect(d.codigo).toMatch(/^[A-Z]{2,}\d{3,}$/);
			expect(d.nome).not.toBe('');
			// sobra da lista de professores não pode virar nome (R36)
			expect(d.nome).not.toMatch(/\(\d+\s*h\)/);
			expect(d.status).toMatch(/^(APR|REP|REPF|REPMF|CANC|DISP|TRANC|MATR|CUMP)$/);
			// período fabricado (R37)
			expect(d.ano_periodo).not.toMatch(/\.0$/);
		}

		// "Pendencias" = contagem dos status das regulares, sem a legenda (R41)
		const contagem: Record<string, number> = {};
		for (const d of regs) contagem[d.status] = (contagem[d.status] || 0) + 1;
		expect(r.extracted_data.find((d) => d.tipo_dado === 'Pendencias')?.valores ?? {}).toEqual(contagem);

		// CH integralizada: ou null, ou a soma fecha com o total (R18)
		const ch = r.carga_horaria_integralizada;
		if (ch) expect(Math.abs(ch.obrigatoria + ch.optativa + ch.complementar - ch.total)).toBeLessThanOrEqual(10);

		// matriz nunca é uma data dd/mm (R12)
		if (r.matriz_curricular) expect(r.matriz_curricular).toMatch(/^\d{3,}\/-?\d+/);
	});
});
