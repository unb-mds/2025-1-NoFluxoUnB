import { describe, expect, it } from 'vitest';
import { layoutGradePng, nomeArquivoGradePng } from './grade-imagem';
import { montarModeloGradePdf, type MateriaPdf } from './grade-pdf';
import { slotMaskFromHorario } from './horario-slots';

const mat = (codigo: string, horario: string, cor = 0): MateriaPdf => ({
	codigo,
	nome: codigo,
	creditos: 4,
	turma: { turma: '01', horario } as any,
	mask: slotMaskFromHorario(horario),
	cor
});

describe('layoutGradePng', () => {
	it('altura cresce com o número de horários usados e a largura é fixa', () => {
		const curta = layoutGradePng(montarModeloGradePdf({ titulo: 'x', periodo: null, materias: [mat('A', '2M12')] }));
		const longa = layoutGradePng(
			montarModeloGradePdf({ titulo: 'x', periodo: null, materias: [mat('A', '2M12'), mat('B', '3N34')] })
		);
		expect(longa.altura).toBeGreaterThan(curta.altura);
		expect(longa.largura).toBe(curta.largura);
	});

	it('sábado só ganha coluna quando há aula nele', () => {
		const sem = layoutGradePng(montarModeloGradePdf({ titulo: 'x', periodo: null, materias: [mat('A', '2M12')] }));
		const com = layoutGradePng(montarModeloGradePdf({ titulo: 'x', periodo: null, materias: [mat('A', '7M12')] }));
		expect(com.colDia).toBeLessThan(sem.colDia);
	});

	it('grade vazia não quebra', () => {
		const l = layoutGradePng(montarModeloGradePdf({ titulo: 'x', periodo: null, materias: [] }));
		expect(l.altura).toBeGreaterThan(0);
		expect(Number.isFinite(l.colDia)).toBe(true);
	});
});

describe('nomeArquivoGradePng', () => {
	it('slug sem acento, com período e extensão png', () => {
		expect(nomeArquivoGradePng('2026.2', 'Sua semana ideal')).toBe('grade-2026-2-sua-semana-ideal.png');
	});
});
