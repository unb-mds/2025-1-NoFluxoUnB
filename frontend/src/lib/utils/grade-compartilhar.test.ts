import { describe, expect, it } from 'vitest';
import { resumoTextoGrade, urlEmail, urlWhatsapp } from './grade-compartilhar';
import { montarModeloGradePdf } from './grade-pdf';
import { slotMaskFromHorario } from './horario-slots';

const modelo = montarModeloGradePdf({
	titulo: 'Sua semana ideal',
	periodo: '2026.2',
	materias: [
		{
			codigo: 'FGA0060',
			nome: 'SISTEMAS DE BANCO DE DADOS 1',
			creditos: 4,
			turma: { turma: '01', horario: '24M12' } as any,
			mask: slotMaskFromHorario('24M12'),
			cor: 0
		}
	]
});

describe('compartilhar grade', () => {
	it('resumo traz título, período, créditos e uma linha por matéria', () => {
		const t = resumoTextoGrade(modelo);
		expect(t).toContain('Sua semana ideal');
		expect(t).toContain('Período 2026.2');
		expect(t).toContain('1 matéria · 4 créditos');
		expect(t).toMatch(/• FGA0060 .* — turma 01,/);
		expect(t).toContain('no-fluxo.com');
	});

	it('urls escapam quebra de linha e acentos', () => {
		const t = resumoTextoGrade(modelo);
		expect(urlEmail('Minha grade', t)).toMatch(/^mailto:\?subject=Minha%20grade&body=/);
		expect(urlEmail('a', t)).not.toContain('\n');
		expect(urlWhatsapp(t)).toMatch(/^https:\/\/wa\.me\/\?text=/);
		expect(urlWhatsapp('olá')).toBe('https://wa.me/?text=ol%C3%A1');
	});
});
