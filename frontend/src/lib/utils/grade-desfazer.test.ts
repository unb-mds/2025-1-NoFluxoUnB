import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	consumirPonto,
	listarPontos,
	MAX_PONTOS_DESFAZER,
	registrarPonto,
	resumoPontos,
	type SnapshotGrade
} from './grade-desfazer';

const snap = (nome: string): SnapshotGrade => ({
	grades: [{ id: 'a', nome, selecao: { FGA0060: 10 }, origem: 'usuario' }],
	activeId: 'a',
	pool: ['FGA0060'],
	prioritarias: [],
	turnos: ['M', 'T', 'N'],
	dispensadas: [],
	incluirCursando: true
});

beforeEach(() => {
	const mem = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => mem.get(k) ?? null,
		setItem: (k: string, v: string) => void mem.set(k, v),
		removeItem: (k: string) => void mem.delete(k)
	});
});
afterEach(() => vi.unstubAllGlobals());

describe('pontos de desfazer', () => {
	it('empilha do mais novo ao mais antigo e guarda o snapshot', () => {
		registrarPonto(1, '2026.2', 'primeiro', snap('A'));
		registrarPonto(1, '2026.2', 'segundo', snap('B'));
		const l = listarPontos(1, '2026.2');
		expect(l.map((p) => p.rotulo)).toEqual(['segundo', 'primeiro']);
		expect(l[1].snapshot.grades[0].nome).toBe('A');
	});

	it(`mantém só os ${MAX_PONTOS_DESFAZER} mais recentes`, () => {
		for (let i = 0; i < MAX_PONTOS_DESFAZER + 3; i++) registrarPonto(1, '2026.2', `p${i}`, snap('x'));
		const l = listarPontos(1, '2026.2');
		expect(l).toHaveLength(MAX_PONTOS_DESFAZER);
		expect(l[0].rotulo).toBe(`p${MAX_PONTOS_DESFAZER + 2}`);
	});

	it('consumir devolve o ponto e descarta ele e os mais novos, mantendo os antigos', () => {
		const a = registrarPonto(1, '2026.2', 'a', snap('A'))!;
		const b = registrarPonto(1, '2026.2', 'b', snap('B'))!;
		registrarPonto(1, '2026.2', 'c', snap('C'));

		const volta = consumirPonto(1, '2026.2', b.id);
		expect(volta?.rotulo).toBe('b');
		expect(listarPontos(1, '2026.2').map((p) => p.id)).toEqual([a.id]);
		expect(consumirPonto(1, '2026.2', b.id)).toBeNull();
	});

	it('é isolado por aluno e por semestre; resumo não vaza o snapshot', () => {
		registrarPonto(1, '2026.2', 'meu', snap('A'));
		expect(listarPontos(2, '2026.2')).toEqual([]);
		expect(listarPontos(1, '2026.1')).toEqual([]);
		const r = resumoPontos(1, '2026.2');
		expect(Object.keys(r[0]).sort()).toEqual(['id', 'quando', 'rotulo']);
	});

	it('sem aluno/semestre ou com storage quebrado não lança', () => {
		expect(registrarPonto(null, '2026.2', 'x', snap('A'))).toBeNull();
		expect(listarPontos(1, null)).toEqual([]);
		vi.stubGlobal('localStorage', {
			getItem: () => '{lixo',
			setItem: () => {
				throw new Error('cheio');
			}
		});
		expect(listarPontos(1, '2026.2')).toEqual([]);
		expect(() => registrarPonto(1, '2026.2', 'x', snap('A'))).not.toThrow();
	});
});
