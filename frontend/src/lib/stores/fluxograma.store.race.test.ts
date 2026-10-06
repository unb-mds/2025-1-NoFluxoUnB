import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pré-mortem R25: os loaders do fluxogramaStore gravavam courseData/error/loading
 * sem saber se ainda eram a chamada mais recente, e reset() não invalidava
 * requisições em voo. Aqui cada "request" só resolve quando o teste manda.
 */
type CursoFake = { nomeCurso: string; materias: unknown[]; equivalencias: unknown[]; coRequisitos: unknown[] };
const pending: Record<string, { resolve: (v: CursoFake) => void; reject: (e: unknown) => void }> = {};
function pendurar(chave: string) {
	return new Promise<CursoFake>((resolve, reject) => {
		pending[chave] = { resolve, reject };
	});
}

vi.mock('$lib/services/fluxograma.service', () => ({
	fluxogramaService: {
		getCourseData: (name: string) => pendurar(name),
		getCourseDataByCurriculoCompleto: (cc: string) => pendurar(cc)
	}
}));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('$lib/utils/screenshot', () => ({ captureScreenshot: vi.fn() }));

const { fluxogramaStore: store } = await import('./fluxograma.store.svelte');

const curso = (nome: string): CursoFake => ({ nomeCurso: nome, materias: [], equivalencias: [], coRequisitos: [] });

describe('fluxogramaStore: corridas de carregamento (R25)', () => {
	beforeEach(() => store.reset());

	it('troca rápida de matriz: resposta lenta da anterior não sobrescreve a nova', async () => {
		const pA = store.loadCourseDataByCurriculoCompleto('MATRIZ_A');
		const pB = store.loadCourseDataByCurriculoCompleto('MATRIZ_B');
		pending['MATRIZ_B'].resolve(curso('B'));
		await pB;
		pending['MATRIZ_A'].resolve(curso('A'));
		await pA;
		expect(store.state.courseData?.nomeCurso).toBe('B');
	});

	it('loading só desliga quando a última requisição termina', async () => {
		const pA = store.loadCourseData('CursoA');
		const pB = store.loadCourseData('CursoB');
		pending['CursoA'].resolve(curso('A'));
		await pA;
		expect(store.state.loading).toBe(true);
		pending['CursoB'].resolve(curso('B'));
		await pB;
		expect(store.state.loading).toBe(false);
		expect(store.state.courseData?.nomeCurso).toBe('B');
	});

	it('reset() invalida a requisição em voo: nada vaza para o singleton', async () => {
		const pA = store.loadCourseData('Engenharia de Software');
		store.reset();
		pending['Engenharia de Software'].resolve(curso('Engenharia de Software'));
		await pA;
		expect(store.state.courseData).toBeNull();
		expect(store.state.loading).toBe(false);
	});

	it('erro de uma requisição antiga não apaga a tela da nova', async () => {
		const pA = store.loadCourseData('X');
		const pB = store.loadCourseData('Y');
		pending['Y'].resolve(curso('Y'));
		await pB;
		pending['X'].reject(new Error('timeout rede'));
		await pA;
		expect(store.state.error).toBeNull();
		expect(store.state.courseData?.nomeCurso).toBe('Y');
	});
});
