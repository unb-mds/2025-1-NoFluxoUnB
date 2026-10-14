import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('$lib/utils/api', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));

import {
	agendarEnvio,
	cenariosKey,
	limparCacheGrade,
	normalizar,
	poolKey,
	sincronizarCacheComServidor,
	type EstadoServidor
} from './grade-estado.service';

const USER = 7;
const PERIODO = '2026.2';

function instalarStorage() {
	const mem = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => mem.get(k) ?? null,
		setItem: (k: string, v: string) => void mem.set(k, v),
		removeItem: (k: string) => void mem.delete(k),
		key: (i: number) => [...mem.keys()][i] ?? null,
		get length() {
			return mem.size;
		}
	});
	return mem;
}

const estado = (extra: Partial<EstadoServidor> = {}): EstadoServidor => ({
	grades: [{ id: 'a', nome: 'Grade 1', selecao: { FGA0060: 10 }, origem: 'usuario' }],
	activeId: 'a',
	pool: ['FGA0060'],
	prioritarias: [],
	turnos: ['M', 'T', 'N'],
	removidas: [],
	incluirCursando: true,
	...extra
});

function gravarLocal(mem: Map<string, string>, e: EstadoServidor) {
	mem.set(poolKey(USER, PERIODO)!, JSON.stringify(e.pool));
	mem.set(
		cenariosKey(USER, PERIODO)!,
		JSON.stringify({
			grades: e.grades,
			activeId: e.activeId,
			prioritarias: e.prioritarias,
			turnos: e.turnos,
			removidas: e.removidas,
			incluirCursando: e.incluirCursando
		})
	);
}

let mem: Map<string, string>;
beforeEach(() => {
	apiRequest.mockReset();
	mem = instalarStorage();
	vi.useFakeTimers();
});
afterEach(() => {
	limparCacheGrade();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('sincronizarCacheComServidor', () => {
	it('servidor vazio + local com conteúdo: sobe o local (migração do localStorage)', async () => {
		gravarLocal(mem, estado());
		apiRequest
			.mockResolvedValueOnce({
				data: { estado: null, versao: 0, outrosPeriodos: [] },
				error: null,
				status: 200
			})
			.mockResolvedValueOnce({ data: { versao: 1 }, error: null, status: 200 });

		await sincronizarCacheComServidor(USER, PERIODO);

		const envio = apiRequest.mock.calls[1];
		expect(envio[0]).toBe('/planejamento/grade-estado-salvar');
		expect(envio[1].body).toMatchObject({ periodo: PERIODO, versaoBase: 0 });
		expect(envio[1].body.estado.grades[0].selecao).toEqual({ FGA0060: 10 });
	});

	it('servidor vazio + local vazio: não grava linha à toa', async () => {
		apiRequest.mockResolvedValueOnce({
			data: { estado: null, versao: 0, outrosPeriodos: [] },
			error: null,
			status: 200
		});
		await sincronizarCacheComServidor(USER, PERIODO);
		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	it('servidor manda: sobrescreve o cache local e devolve os outros semestres', async () => {
		gravarLocal(mem, estado({ pool: ['AAA0001'] }));
		const doServidor = estado({
			grades: [
				{ id: 'x', nome: 'Sem sexta', selecao: { FGA0060: 99 }, origem: 'darcy' },
				{ id: 'y', nome: 'Grade 2', selecao: {}, origem: 'usuario' }
			],
			activeId: 'y',
			pool: ['FGA0060', 'IFD0171']
		});
		apiRequest.mockResolvedValueOnce({
			data: {
				estado: doServidor,
				versao: 4,
				outrosPeriodos: [{ periodo: '2026.1', cenarios: 3, vencido: false }]
			},
			error: null,
			status: 200
		});

		const r = await sincronizarCacheComServidor(USER, PERIODO);

		expect(r.outrosPeriodos).toEqual([{ periodo: '2026.1', cenarios: 3, vencido: false }]);
		expect(JSON.parse(mem.get(poolKey(USER, PERIODO)!)!)).toEqual(['FGA0060', 'IFD0171']);
		const c = JSON.parse(mem.get(cenariosKey(USER, PERIODO)!)!);
		expect(c.grades.map((g: { nome: string }) => g.nome)).toEqual(['Sem sexta', 'Grade 2']);
		expect(c.activeId).toBe('y');
		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	it('alteração local pendente vence e é reenviada em cima da versão do servidor', async () => {
		gravarLocal(mem, estado({ pool: ['LOCAL01'] }));
		mem.set(`nofluxo:grade:${USER}:${PERIODO}:pendente`, '1');
		apiRequest
			.mockResolvedValueOnce({
				data: { estado: estado({ pool: ['REMOTO1'] }), versao: 5, outrosPeriodos: [] },
				error: null,
				status: 200
			})
			.mockResolvedValueOnce({ data: { versao: 6 }, error: null, status: 200 });

		await sincronizarCacheComServidor(USER, PERIODO);

		expect(apiRequest.mock.calls[1][1].body).toMatchObject({ versaoBase: 5 });
		expect(JSON.parse(mem.get(poolKey(USER, PERIODO)!)!)).toEqual(['LOCAL01']);
	});

	it('sem rede: segue com o cache e não lança', async () => {
		gravarLocal(mem, estado());
		apiRequest.mockResolvedValueOnce({ data: null, error: 'x', status: 0 });
		await expect(sincronizarCacheComServidor(USER, PERIODO)).resolves.toEqual({
			outrosPeriodos: []
		});
		expect(mem.get(poolKey(USER, PERIODO)!)).toBeTruthy();
	});

	it('visitante (sem idUser) não chama o servidor', async () => {
		await sincronizarCacheComServidor(null, PERIODO);
		expect(apiRequest).not.toHaveBeenCalled();
	});
});

describe('agendarEnvio', () => {
	it('junta várias mudanças seguidas em UM envio (debounce)', async () => {
		gravarLocal(mem, estado());
		apiRequest.mockResolvedValue({ data: { versao: 2 }, error: null, status: 200 });

		agendarEnvio(USER, PERIODO);
		agendarEnvio(USER, PERIODO);
		agendarEnvio(USER, PERIODO);
		expect(apiRequest).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(900);

		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	it('não reenvia o que o servidor já tem', async () => {
		gravarLocal(mem, estado());
		apiRequest.mockResolvedValue({ data: { versao: 2 }, error: null, status: 200 });

		agendarEnvio(USER, PERIODO);
		await vi.advanceTimersByTimeAsync(900);
		agendarEnvio(USER, PERIODO);
		await vi.advanceTimersByTimeAsync(900);

		expect(apiRequest).toHaveBeenCalledTimes(1);
	});

	it('409: tenta de novo uma vez em cima da versão atual do servidor', async () => {
		gravarLocal(mem, estado());
		apiRequest
			.mockResolvedValueOnce({
				data: null,
				error: JSON.stringify({ versao: 9 }),
				status: 409
			})
			.mockResolvedValueOnce({ data: { versao: 10 }, error: null, status: 200 });

		agendarEnvio(USER, PERIODO);
		await vi.advanceTimersByTimeAsync(900);

		expect(apiRequest).toHaveBeenCalledTimes(2);
		expect(apiRequest.mock.calls[1][1].body.versaoBase).toBe(9);
		expect(mem.get(`nofluxo:grade:${USER}:${PERIODO}:pendente`)).toBeUndefined();
	});

	it('falha de rede deixa o aluno marcado como pendente (reenvia depois)', async () => {
		gravarLocal(mem, estado());
		apiRequest.mockResolvedValue({ data: null, error: 'x', status: 0 });

		agendarEnvio(USER, PERIODO);
		await vi.advanceTimersByTimeAsync(900);

		expect(mem.get(`nofluxo:grade:${USER}:${PERIODO}:pendente`)).toBe('1');
	});
});

describe('normalizar / limpeza', () => {
	it('corta no teto de 6 grades e descarta código/turma inválidos', () => {
		const grades = Array.from({ length: 9 }, (_, i) => ({
			id: String(i),
			nome: `G${i}`,
			selecao: { FGA0060: 1, 'lixo!': 2, MAT0025: -3 },
			origem: 'usuario' as const
		}));
		const r = normalizar(estado({ grades }));
		expect(r.grades).toHaveLength(6);
		expect(r.grades[0].selecao).toEqual({ FGA0060: 1 });
	});

	it('logout apaga todas as chaves de grade e só elas', () => {
		mem.set(poolKey(USER, PERIODO)!, '[]');
		mem.set('outra:coisa', 'x');
		limparCacheGrade();
		expect([...mem.keys()]).toEqual(['outra:coisa']);
	});
});
