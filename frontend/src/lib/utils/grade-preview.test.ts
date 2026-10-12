import { describe, expect, it } from 'vitest';
import { formatarMinutos, montarSemanaPreview, rotuloCurtoEstrategia } from './grade-preview';

describe('montarSemanaPreview', () => {
	it('coloca cada matéria nos dias e módulos do horário SIGAA', () => {
		const s = montarSemanaPreview([
			{ codigo: 'MAT0026', horario: '24M12' },
			{ codigo: 'FGA0242', horario: '3T23' }
		]);
		expect(s.dias.map((d) => d.label)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex']);
		const seg = s.dias[0];
		expect(seg.blocos).toEqual([
			{ codigo: 'MAT0026', slotInicio: 0, span: 2, inicio: '08:00', fim: '09:50' }
		]);
		const ter = s.dias[1];
		expect(ter.blocos[0]).toMatchObject({ codigo: 'FGA0242', inicio: '14:00', fim: '15:50' });
		expect(s.dias[4].blocos).toEqual([]); // sexta livre
		expect(s.slotMin).toBe(0);
		expect(s.slotMax).toBe(7); // T3 = índice 7 em SLOTS_DIA
	});

	it('sábado só aparece com aula', () => {
		const s = montarSemanaPreview([{ codigo: 'FGA0001', horario: '7M1234' }]);
		expect(s.dias.map((d) => d.cod)).toContain('7');
	});

	it('horário vazio/EAD vai para semHorario', () => {
		const s = montarSemanaPreview([
			{ codigo: 'EAD0001', horario: 'A DEFINIR' },
			{ codigo: 'X', horario: null }
		]);
		expect(s.semHorario).toEqual(['EAD0001', 'X']);
		expect(s.dias.every((d) => d.blocos.length === 0)).toBe(true);
		expect(s.slotMin).toBe(0);
		expect(s.slotMax).toBe(-1);
	});
});

describe('formatarMinutos', () => {
	it.each([
		[0, '0min'],
		[45, '45min'],
		[60, '1h'],
		[80, '1h20'],
		[125, '2h05']
	])('%i → %s', (min, txt) => {
		expect(formatarMinutos(min)).toBe(txt);
	});
});

describe('rotuloCurtoEstrategia', () => {
	it('encurta os nomes do solver', () => {
		expect(rotuloCurtoEstrategia('Menos dias com aula')).toBe('Menos dias');
		expect(rotuloCurtoEstrategia('Menos furos entre aulas')).toBe('Menos furos');
		expect(rotuloCurtoEstrategia('Semana equilibrada')).toBe('Equilibrada');
		expect(rotuloCurtoEstrategia('Darcy')).toBe('Darcy');
	});
});
