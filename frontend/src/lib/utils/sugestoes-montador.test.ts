import { describe, expect, it } from 'vitest';
import { mensagemEvitarDias, sugestoesDoMontador } from './sugestoes-montador';

const base = { naGrade: 4, naoAlocadas: [], diasComAula: ['Seg', 'Ter'], cenarios: 1 };

describe('sugestoesDoMontador', () => {
	it('grade vazia: pede para montar (e explica o que ficou de fora, se houver)', () => {
		const s = sugestoesDoMontador(
			{ ...base, naGrade: 0, naoAlocadas: ['MAT0026'] },
			() => 'Cálculo 2'
		);
		expect(s.map((x) => x.badge)).toEqual(['Cálculo 2', 'grade']);
		expect(s[0].message).toContain('MAT0026');
	});

	it('com aula em mais de um dia, oferece escolher os dias a liberar', () => {
		const s = sugestoesDoMontador({ ...base, diasComAula: ['Seg', 'Qua', 'Sex'] });
		const dias = s.find((x) => x.escolherDias);
		expect(dias?.escolherDias?.opcoes).toEqual(['Seg', 'Qua', 'Sex']);
		expect(dias?.escolherDias?.mensagem(['Seg', 'Sex'])).toBe(
			'Rearranje minha grade sem aula na segunda e na sexta'
		);
		expect(sugestoesDoMontador({ ...base, diasComAula: ['Seg'] }).some((x) => x.escolherDias)).toBe(
			false
		);
	});

	it('mensagemEvitarDias: um dia, vários dias e sábado', () => {
		expect(mensagemEvitarDias(['Qua'])).toBe('Rearranje minha grade sem aula na quarta');
		expect(mensagemEvitarDias(['Seg', 'Ter', 'Sáb'])).toBe(
			'Rearranje minha grade sem aula na segunda, na terça e no sábado'
		);
	});

	it('grade só com obrigatórias oferece optativas para o horário que sobrou', () => {
		const s = sugestoesDoMontador({ ...base, soObrigatorias: true });
		expect(s[0].badge).toBe('optativas');
		expect(s[0].message).toContain('optativas');
		expect(sugestoesDoMontador(base).map((x) => x.badge)).not.toContain('optativas');
	});

	it('mais de um cenário sugere comparar; no máximo 3', () => {
		const s = sugestoesDoMontador({
			...base,
			naoAlocadas: ['X'],
			diasComAula: ['Sex'],
			cenarios: 2
		});
		expect(s).toHaveLength(3);
		expect(sugestoesDoMontador({ ...base, cenarios: 2 }).map((x) => x.badge)).toContain('cenários');
	});
});
