import { describe, it, expect } from 'vitest';
import {
	montarModeloGradePdf,
	nomeLegivel,
	textoPdf,
	nomeArquivoGradePdf,
	type MateriaPdf
} from './grade-pdf';
import { slotMaskFromHorario, SLOTS_DIA } from './horario-slots';

function materia(
	codigo: string,
	horario: string | null,
	extra: Partial<MateriaPdf> = {}
): MateriaPdf {
	return {
		codigo,
		nome: `MATÉRIA ${codigo}`,
		creditos: 4,
		mask: slotMaskFromHorario(horario),
		cor: 0,
		turma: {
			id_turmas: 1,
			id_materia: 1,
			turma: '01',
			docente: null,
			horario,
			local: null,
			ano_periodo: '2026.1',
			vagas_ofertadas: null,
			vagas_ocupadas: null,
			vagas_sobrando: null
		},
		...extra
	};
}

describe('montarModeloGradePdf', () => {
	it('desenha só do primeiro ao último horário usado, juntando módulos seguidos num bloco', () => {
		const modelo = montarModeloGradePdf({
			titulo: 'Grade 1',
			periodo: '2026.1',
			materias: [materia('MAT0025', '24M12'), materia('CIC0004', '35T23')]
		});

		expect(SLOTS_DIA[modelo.linhas[0]].label).toBe('M1');
		expect(SLOTS_DIA[modelo.linhas[modelo.linhas.length - 1]].label).toBe('T3');
		const seg = modelo.dias.find((d) => d.cod === '2')!;
		expect(seg.blocos).toEqual([{ codigo: 'MAT0025', offsetStart: 0, span: 2 }]);
		const ter = modelo.dias.find((d) => d.cod === '3')!;
		expect(ter.blocos).toHaveLength(1);
		expect(SLOTS_DIA[ter.blocos[0].offsetStart].label).toBe('T2');
		expect(modelo.creditos).toBe(8);
	});

	it('sábado só aparece quando tem aula; matéria sem horário vai só para a tabela', () => {
		const semSabado = montarModeloGradePdf({
			titulo: 'G',
			periodo: null,
			materias: [materia('A', '2M12'), materia('B', null)]
		});
		expect(semSabado.dias.map((d) => d.label)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex']);
		expect(semSabado.semHorario).toEqual(['B']);
		expect(semSabado.materias).toHaveLength(2);

		const comSabado = montarModeloGradePdf({
			titulo: 'G',
			periodo: null,
			materias: [materia('A', '7M12')]
		});
		expect(comSabado.dias.map((d) => d.label)).toContain('Sáb');
	});

	it('grade só com matérias sem horário não tem linhas na semana', () => {
		const modelo = montarModeloGradePdf({
			titulo: 'G',
			periodo: null,
			materias: [materia('B', null)]
		});
		expect(modelo.linhas).toEqual([]);
	});
});

describe('texto do PDF', () => {
	it('nome legível mantém preposições minúsculas e algarismos romanos', () => {
		expect(nomeLegivel('INTRODUÇÃO A CIÊNCIA DA COMPUTAÇÃO')).toBe(
			'Introdução a Ciência da Computação'
		);
		expect(nomeLegivel('CÁLCULO II')).toBe('Cálculo II');
		expect(nomeLegivel('INTRODUÇÃO À ENGENHARIA')).toBe('Introdução à Engenharia');
	});

	it('troca o que a fonte do PDF não desenha e mantém acentos', () => {
		expect(textoPdf('Seg 8h – 9h50 · “sala” …')).toBe('Seg 8h - 9h50 · "sala" ...');
		expect(textoPdf('ação é ü')).toBe('ação é ü');
	});

	it('nome do arquivo sem acento nem espaço', () => {
		expect(nomeArquivoGradePdf('2026.1', 'Opção Manhã')).toBe('grade-2026-1-opcao-manha.pdf');
	});
});
