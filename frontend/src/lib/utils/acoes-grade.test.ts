import { describe, expect, it } from 'vitest';
import { descreverAcao } from './acoes-grade';

const nomes = new Map([['MAT0026', 'Cálculo 2']]);
const nomeDe = (c: string) => nomes.get(c);

describe('descreverAcao', () => {
	it('troca de turma mostra turma e horário legível', () => {
		const l = descreverAcao(
			{ tipo: 'trocarTurma', codigo: 'MAT0026', idTurma: 3, turma: '02', horario: '24T23' },
			nomeDe
		);
		expect(l.sinal).toBe('troca');
		expect(l.texto).toBe('Trocar turma de Cálculo 2');
		expect(l.detalhe).toMatch(/^Turma 02 · Seg/);
	});

	it('adicionar sem turma é só pôr na lista; sem nome usa o código', () => {
		expect(descreverAcao({ tipo: 'adicionar', codigo: 'FGA0001' }, nomeDe)).toEqual({
			sinal: 'mais',
			texto: 'Pôr FGA0001 na lista',
			detalhe: undefined
		});
	});

	it('remover e limpar são destrutivas', () => {
		expect(descreverAcao({ tipo: 'remover', codigo: 'MAT0026' }, nomeDe).destrutiva).toBe(true);
		expect(descreverAcao({ tipo: 'limpar' }, nomeDe).destrutiva).toBe(true);
		expect(
			descreverAcao({ tipo: 'priorizar', codigo: 'MAT0026' }, nomeDe).destrutiva
		).toBeUndefined();
	});

	it('turnos por extenso', () => {
		expect(descreverAcao({ tipo: 'turnos', turnos: ['M', 'T'] }, nomeDe).texto).toBe(
			'Só manhã e tarde'
		);
	});
});
