import { writable, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { planoFormaturaStore } from '$lib/stores/plano-formatura.store.svelte';
import {
	uploadService,
	type UploadPdfResponse,
	type CasarDisciplinasResponse,
	type CourseSelectionError
} from '$lib/services/upload.service';
import { authStore } from '$lib/stores/auth';
import { ROUTES } from '$lib/config/routes';
import type { DadosMateria, DadosFluxogramaUser } from '$lib/types/user';
import {
	buildDadosFluxogramaUserFromCasarResponse,
	dadosFluxogramaUserToJson,
	injetarEquivalenciasDoPdf
} from '$lib/factories';
import { FLUXOGRAMA_SCHEMA_VERSION } from '$lib/config/release';
import { supabaseDataService } from '$lib/services/supabase-data.service';

export type UploadState = 'initial' | 'uploading' | 'processing' | 'success' | 'error';

/**
 * Convert a CasarDisciplinasResponse into a DadosMateria[][] grouped by ano_periodo (semester).
 * This bridges the discipline-matching output with the fluxograma rendering format.
 */
function convertCasarResponseToDadosFluxograma(
	response: CasarDisciplinasResponse
): DadosMateria[][] {
	const byPeriod = new Map<string, DadosMateria[]>();

	// 1) Map all matched disciplines from the transcript
	for (const disc of response.disciplinas_casadas) {
		// Use the DB-matched code (codigo_materia) if available, else transcript code
		const code = (disc.codigo_materia as string) || (disc.codigo as string) || '';
		if (!code) continue;

		const status = String(disc.status ?? '-');
		const mencao = String(disc.mencao ?? '-');
		const period = String(disc.ano_periodo ?? 'sem_periodo');

		const materia: DadosMateria = {
			codigoMateria: code,
			mencao,
			professor: String(disc.professor ?? ''),
			status,
			anoPeriodo: disc.ano_periodo != null ? String(disc.ano_periodo) : null,
			frequencia: disc.frequencia != null ? String(disc.frequencia) : null,
			tipoDado: disc.tipo_dado != null ? String(disc.tipo_dado) : null,
			turma: disc.turma != null ? String(disc.turma) : null
		};

		if (!byPeriod.has(period)) {
			byPeriod.set(period, []);
		}
		byPeriod.get(period)!.push(materia);
	}

	// 2) Add mandatory subjects completed by equivalency (not already in disciplinas_casadas)
	const existingCodes = new Set<string>();
	for (const arr of byPeriod.values()) {
		for (const m of arr) {
			existingCodes.add(m.codigoMateria);
		}
	}

	for (const matConcluida of response.materias_concluidas) {
		const rec = matConcluida as Record<string, unknown>;
		if (rec.status_fluxograma !== 'concluida_equivalencia') continue;

		const code = String(rec.codigo ?? '');
		if (!code || existingCodes.has(code)) continue;

		const materia: DadosMateria = {
			codigoMateria: code,
			mencao: '-',
			professor: '',
			status: 'CUMP', // Treated as completed via equivalency
			anoPeriodo: null,
			frequencia: null,
			tipoDado: 'equivalencia',
			turma: null
		};

		const period = 'equivalencias';
		if (!byPeriod.has(period)) {
			byPeriod.set(period, []);
		}
		byPeriod.get(period)!.push(materia);
		existingCodes.add(code);
	}

	// 3) Sort periods chronologically and return as nested array
	const sortedPeriods = [...byPeriod.keys()].sort((a, b) => {
		if (a === 'sem_periodo' || a === 'equivalencias') return 1;
		if (b === 'sem_periodo' || b === 'equivalencias') return -1;
		return a.localeCompare(b);
	});

	console.log('[UploadStore] convertCasarResponseToDadosFluxograma:', {
		totalDisciplinasCasadas: response.disciplinas_casadas.length,
		totalEquivalencias: response.materias_concluidas.filter(
			(m) => (m as Record<string, unknown>).status_fluxograma === 'concluida_equivalencia'
		).length,
		periods: sortedPeriods,
		totalDadosMaterias: [...byPeriod.values()].reduce((sum, arr) => sum + arr.length, 0)
	});

	return sortedPeriods.map((period) => byPeriod.get(period)!);
}

export interface UploadStoreState {
	state: UploadState;
	progress: number;
	fileName: string;
	error: string | null;
	extractedData: UploadPdfResponse | null;
	disciplinasCasadas: CasarDisciplinasResponse | null;
	courseSelectionError: CourseSelectionError | null;
	showCourseSelection: boolean;
	/**
	 * O aluno fechou o modal de escolha de curso sem escolher (Esc, clique
	 * fora, X). O histórico já processado continua em `extractedData` — dá para
	 * reabrir o modal em vez de mandá-lo subir o PDF de novo do zero.
	 */
	courseSelectionPending: boolean;
}

const initialState: UploadStoreState = {
	state: 'initial',
	progress: 0,
	fileName: '',
	error: null,
	extractedData: null,
	disciplinasCasadas: null,
	courseSelectionError: null,
	showCourseSelection: false,
	courseSelectionPending: false
};

function createUploadStore() {
	const { subscribe, set, update } = writable<UploadStoreState>({ ...initialState });

	let progressInterval: ReturnType<typeof setInterval> | null = null;

	function startProgressSimulation(from: number, to: number, durationMs: number) {
		stopProgressSimulation();
		const steps = Math.floor(durationMs / 100);
		const increment = (to - from) / steps;
		let current = from;

		progressInterval = setInterval(() => {
			current = Math.min(current + increment, to);
			update((s) => ({ ...s, progress: Math.round(current) }));
			if (current >= to) {
				stopProgressSimulation();
			}
		}, 100);
	}

	function stopProgressSimulation() {
		if (progressInterval) {
			clearInterval(progressInterval);
			progressInterval = null;
		}
	}

	return {
		subscribe,

		async uploadFile(file: File) {
			update((s) => ({
				...s,
				state: 'uploading',
				progress: 0,
				fileName: file.name,
				error: null,
				extractedData: null,
				disciplinasCasadas: null,
				courseSelectionError: null,
				showCourseSelection: false
			}));

			try {
				// Phase 1: Parse PDF locally in the browser (0-50%)
				console.time('[UploadStore] Phase 1: parsePdfLocally');
				startProgressSimulation(0, 45, 3000);
				const extracted = await uploadService.parsePdfLocally(file);
				stopProgressSimulation();
				console.timeEnd('[UploadStore] Phase 1: parsePdfLocally');
				update((s) => ({ ...s, progress: 50, extractedData: extracted }));

				// Phase 2: Match disciplines (50-90%)
				update((s) => ({ ...s, state: 'processing' }));
				console.time('[UploadStore] Phase 2: casarDisciplinas');
				startProgressSimulation(50, 85, 4000);
				const result = await uploadService.casarDisciplinas(extracted);
				stopProgressSimulation();
				console.timeEnd('[UploadStore] Phase 2: casarDisciplinas');

				// Check for course selection needed
				if ('type' in result && result.type === 'COURSE_SELECTION') {
					update((s) => ({
						...s,
						progress: 60,
						state: 'processing',
						courseSelectionError: result as CourseSelectionError,
						showCourseSelection: true,
						courseSelectionPending: false
					}));
					return;
				}

				// Success
				planoFormaturaStore.reset();
				update((s) => ({
					...s,
					progress: 100,
					state: 'success',
					disciplinasCasadas: result as CasarDisciplinasResponse
				}));
				toast.success('Histórico processado com sucesso!');
			} catch (err) {
				stopProgressSimulation();
				const message = err instanceof Error ? err.message : 'Erro desconhecido ao processar o PDF.';
				update((s) => ({
					...s,
					state: 'error',
					error: message
				}));
				toast.error(message);
			}
		},

		async retryWithSelectedCourse(
			courseName: string,
			selected?: { id_curso?: number; nome_curso: string; matriz_curricular?: string }
		) {
			const currentState = get({ subscribe });
			if (!currentState.extractedData) {
				toast.error('Dados do PDF não encontrados. Tente novamente.');
				return;
			}

			update((s) => ({
				...s,
				showCourseSelection: false,
				state: 'processing',
				progress: 55,
				error: null
			}));

			try {
				startProgressSimulation(55, 85, 3000);
				const dataWithCourse = {
					...currentState.extractedData,
					curso_extraido: courseName,
					curso_selecionado: courseName,
					...(selected?.id_curso != null && { id_curso_selecionado: selected.id_curso }),
					// A matriz escolhida no modal. Sem ela, um PDF sem ano ("8117/-2")
					// empata de novo entre as mesmas matrizes e o RPC devolve outro
					// COURSE_SELECTION. matriz_curricular fica com o que veio do PDF.
					...(selected?.matriz_curricular && { matriz_selecionada: selected.matriz_curricular })
				};
				const result = await uploadService.casarDisciplinas(dataWithCourse);
				stopProgressSimulation();

				if ('type' in result && result.type === 'COURSE_SELECTION') {
					update((s) => ({
						...s,
						courseSelectionError: result as CourseSelectionError,
						showCourseSelection: true,
						courseSelectionPending: false,
						progress: 60
					}));
					return;
				}

				planoFormaturaStore.reset();
				update((s) => ({
					...s,
					progress: 100,
					state: 'success',
					disciplinasCasadas: result as CasarDisciplinasResponse
				}));
				toast.success('Histórico processado com sucesso!');
			} catch (err) {
				stopProgressSimulation();
				const message = err instanceof Error ? err.message : 'Erro ao processar disciplinas.';
				update((s) => ({
					...s,
					state: 'error',
					error: message
				}));
				toast.error(message);
			}
		},

		async saveAndNavigate() {
			const currentState = get({ subscribe });
			const user = authStore.getUser();

			if (!currentState.disciplinasCasadas || !user) {
				toast.error('Dados insuficientes para salvar.');
				return;
			}

			try {
				console.time('[UploadStore] Phase 3: saveAndNavigate');
				const cd = currentState.disciplinasCasadas;
				const ext = currentState.extractedData;
				const meta = {
					nomeCurso: ext?.curso_extraido ?? '',
					matricula: ext?.matricula ?? '',
					anoAtual: ext?.semestre_atual ?? '',
					matrizCurricular: ext?.matriz_curricular ?? '',
					semestreAtual: ext?.numero_semestre ?? 0,
					suspensoes: ext?.suspensoes ?? []
				};
				const iraExtraido = ext?.extracted_data?.find(
					(d) => (d as { tipo_dado?: string }).tipo_dado === 'IRA'
				) as { valor?: number; valor_texto?: string } | undefined;
				const dados = buildDadosFluxogramaUserFromCasarResponse(
					cd as {
						disciplinas_casadas: Record<string, unknown>[];
						dados_validacao?: { ira?: number; ira_texto?: string | null; horas_integralizadas?: number };
					},
					meta,
					{ iraTexto: iraExtraido?.valor_texto ?? null }
				);

				// Equivalências que o PRÓPRIO histórico declara ("Cumpriu X através de Y"):
				// fonte oficial do SIGAA — cobre pares que faltem na tabela do banco.
				injetarEquivalenciasDoPdf(dados, ext?.equivalencias_pdf);

				// Carimba a versão do schema: o modal de novidades usa isso para saber
				// quem precisa reenviar o histórico para ativar recursos novos.
				dados.schemaVersion = FLUXOGRAMA_SCHEMA_VERSION;

				// Save: atualiza dados_users (estado atual) + registra em historicos_usuarios (acompanhamento ao longo dos anos)
				await supabaseDataService.saveFluxogramaData(
					user.idUser,
					dadosFluxogramaUserToJson(dados),
					meta.semestreAtual || undefined,
					ext?.carga_horaria_integralizada ?? undefined,
					{
						curso_extraido: ext?.curso_extraido ?? null,
						matriz_curricular: ext?.matriz_curricular ?? null,
						matricula: ext?.matricula ?? null,
						ira: (ext?.extracted_data?.find((d) => (d as { tipo_dado?: string }).tipo_dado === 'IRA') as { valor?: number } | undefined)?.valor ?? null,
						media_ponderada: ext?.media_ponderada ?? null,
						carga_horaria_integralizada: ext?.carga_horaria_integralizada ?? null,
						suspensoes: ext?.suspensoes ?? null,
						resumo: cd?.resumo
							? {
									total_disciplinas: cd.resumo.total_disciplinas,
									total_obrigatorias: cd.resumo.total_obrigatorias,
									total_obrigatorias_concluidas: cd.resumo.total_obrigatorias_concluidas,
									total_obrigatorias_pendentes: cd.resumo.total_obrigatorias_pendentes,
									percentual_conclusao_obrigatorias: cd.resumo.percentual_conclusao_obrigatorias
								}
							: null
					}
				);

				console.timeEnd('[UploadStore] Phase 3: saveAndNavigate');
				authStore.updateDadosFluxograma(dados, ext?.carga_horaria_integralizada ?? undefined);
				toast.success('Fluxograma salvo com sucesso!');
				goto(ROUTES.MEU_FLUXOGRAMA);
			} catch (err) {
				console.timeEnd('[UploadStore] Phase 3: saveAndNavigate');
				console.error('[UploadStore] saveAndNavigate error:', err);
				const message = err instanceof Error ? err.message : 'Erro ao salvar fluxograma.';
				toast.error(message);
			}
		},

		/**
		 * Fechar o modal NÃO joga fora o histórico já lido: o PDF continua
		 * processado em `extractedData` e `reopenCourseSelection` retoma de onde
		 * parou. Antes daqui saía um `state:'error'` cujo único botão chamava
		 * reset(), e um clique fora do modal custava o upload inteiro.
		 */
		dismissCourseSelection() {
			update((s) => ({
				...s,
				showCourseSelection: false,
				state: 'error',
				courseSelectionPending: !!s.extractedData && !!s.courseSelectionError,
				error: s.extractedData
					? 'Falta escolher a matriz do seu curso para continuar.'
					: 'Seleção de curso cancelada. Tente novamente.'
			}));
		},

		/** Reabre o modal de escolha de curso mantendo o histórico já processado. */
		reopenCourseSelection() {
			update((s) => {
				if (!s.extractedData || !s.courseSelectionError) return s;
				return {
					...s,
					showCourseSelection: true,
					courseSelectionPending: false,
					state: 'processing',
					error: null
				};
			});
		},

		async startManualMode(course: { nomeCurso: string; matrizCurricular: string }) {
			const user = authStore.getUser();
			if (!user) {
				toast.error('Você precisa estar logado.');
				return;
			}
			
			const dados: DadosFluxogramaUser = {
				nomeCurso: course.nomeCurso,
				ira: 0,
				matricula: 'Manual',
				horasIntegralizadas: 0,
				suspensoes: [],
				anoAtual: new Date().getFullYear() + '.1',
				matrizCurricular: course.matrizCurricular,
				semestreAtual: 1,
				dadosFluxograma: [],
				schemaVersion: FLUXOGRAMA_SCHEMA_VERSION
			};
			
			try {
				await supabaseDataService.saveFluxogramaData(
					user.idUser,
					dadosFluxogramaUserToJson(dados),
					1,
					undefined,
					{
						curso_extraido: course.nomeCurso,
						matriz_curricular: course.matrizCurricular,
						matricula: 'Manual',
						ira: 0,
						media_ponderada: 0,
						carga_horaria_integralizada: null,
						suspensoes: [],
						resumo: null
					}
				);
				
				authStore.updateDadosFluxograma(dados, undefined);
				toast.success('Modo manual iniciado! Você pode alterar o status das matérias clicando nelas.');
				goto(ROUTES.MEU_FLUXOGRAMA);
			} catch (err) {
				console.error(err);
				toast.error('Erro ao iniciar preenchimento manual.');
			}
		},

		reset() {
			stopProgressSimulation();
			set({ ...initialState });
		}
	};
}

export const uploadStore = createUploadStore();
