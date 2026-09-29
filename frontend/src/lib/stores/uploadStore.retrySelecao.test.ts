import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('$lib/stores/plano-formatura.store.svelte', () => ({ planoFormaturaStore: { reset: vi.fn() } }));
vi.mock('$lib/stores/auth', () => ({ authStore: { getUser: vi.fn(), updateDadosFluxograma: vi.fn() } }));
vi.mock('$lib/services/supabase-data.service', () => ({
	supabaseDataService: { saveFluxogramaData: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('$lib/services/upload.service', () => ({
	uploadService: { parsePdfLocally: vi.fn(), casarDisciplinas: vi.fn() }
}));

import { uploadService } from '$lib/services/upload.service';
import { supabaseDataService } from '$lib/services/supabase-data.service';
import { authStore } from '$lib/stores/auth';
import { uploadStore } from './uploadStore';

const EXTRAIDO = {
	curso_extraido: 'PEDAGOGIA',
	matriz_curricular: '8117/-2',
	extracted_data: [{ tipo_dado: 'Disciplina Regular', codigo: 'PED0001', status: 'APR' }]
};

const OPCOES = [
	{ id_curso: 8117, nome_curso: 'PEDAGOGIA', matriz_curricular: '8117/-2 - 2018.2' },
	{ id_curso: 8117, nome_curso: 'PEDAGOGIA', matriz_curricular: '8117/-2 - 2020.1' }
];

const SUCESSO = {
	disciplinas_casadas: [],
	materias_concluidas: [],
	materias_pendentes: [],
	materias_optativas: [],
	matriz_curricular: '8117/-2 - 2018.2',
	resumo: {
		percentual_conclusao_obrigatorias: 0,
		total_disciplinas: 0,
		total_obrigatorias: 0,
		total_obrigatorias_concluidas: 0,
		total_obrigatorias_pendentes: 0,
		total_optativas: 0
	},
	dados_validacao: {}
};

describe('uploadStore.retryWithSelectedCourse — matriz escolhida no COURSE_SELECTION', () => {
	beforeEach(async () => {
		uploadStore.reset();
		const casar = vi.mocked(uploadService.casarDisciplinas);
		casar.mockReset();
		vi.mocked(uploadService.parsePdfLocally).mockResolvedValue(EXTRAIDO as never);
		casar.mockResolvedValueOnce({
			type: 'COURSE_SELECTION',
			message: 'Selecione a matriz curricular do seu histórico',
			cursos_disponiveis: OPCOES,
			matriz_extraida_pdf: '8117/-2'
		});
		await uploadStore.uploadFile(new File(['%PDF'], 'historico.pdf'));
		expect(get(uploadStore).showCourseSelection).toBe(true);
	});

	it('reenvia o curriculo_completo escolhido em matriz_selecionada (o PDF sem ano empataria de novo)', async () => {
		vi.mocked(uploadService.casarDisciplinas).mockResolvedValueOnce(SUCESSO as never);

		await uploadStore.retryWithSelectedCourse(OPCOES[0].nome_curso, OPCOES[0]);

		const payload = vi.mocked(uploadService.casarDisciplinas).mock.calls[1][0] as Record<string, unknown>;
		expect(payload).toMatchObject({
			curso_selecionado: 'PEDAGOGIA',
			id_curso_selecionado: 8117,
			matriz_selecionada: '8117/-2 - 2018.2',
			// o que veio do PDF segue como está
			matriz_curricular: '8117/-2'
		});
		expect(get(uploadStore).state).toBe('success');
	});

	it('opção sem matriz_curricular não manda matriz_selecionada', async () => {
		vi.mocked(uploadService.casarDisciplinas).mockResolvedValueOnce(SUCESSO as never);

		await uploadStore.retryWithSelectedCourse('PEDAGOGIA', { id_curso: 8117, nome_curso: 'PEDAGOGIA' });

		const payload = vi.mocked(uploadService.casarDisciplinas).mock.calls[1][0] as Record<string, unknown>;
		expect(payload).not.toHaveProperty('matriz_selecionada');
	});

	it('ao salvar, grava a matriz escolhida (devolvida pelo RPC), não a do PDF', async () => {
		vi.mocked(uploadService.casarDisciplinas).mockResolvedValueOnce({
			...SUCESSO,
			matriz_curricular: '8117/-2 - 2020.1'
		} as never);
		await uploadStore.retryWithSelectedCourse(OPCOES[1].nome_curso, OPCOES[1]);
		vi.mocked(authStore.getUser).mockReturnValue({ idUser: 1 } as never);

		await uploadStore.saveAndNavigate();

		const save = vi.mocked(supabaseDataService.saveFluxogramaData);
		expect(save).toHaveBeenCalled();
		const salvo = JSON.stringify(save.mock.calls.at(-1)![1]);
		expect(salvo).toContain('8117/-2 - 2020.1');
	});
});
