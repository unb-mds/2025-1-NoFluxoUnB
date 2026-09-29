/**
 * Fluxograma store — manages state for the interactive curriculum flowchart.
 * Svelte 5 runes-based store using $state().
 */

import { fluxogramaService } from '$lib/services/fluxograma.service';
import { authStore } from '$lib/stores/auth';
import type { CursoModel } from '$lib/types/curso';
import type { MateriaModel } from '$lib/types/materia';
import {
	isOptativa,
	SubjectStatusEnum,
	determineSubjectStatus,
	type SubjectStatusValue,
	type OptativaAdicionada
} from '$lib/types/materia';
import {
	getCompletedSubjectCodes,
	getCurrentSubjectCodes,
	isMateriaAprovada,
	isMateriaCurrent,
	type DadosFluxogramaUser,
	type DadosMateria,
	type OptativaPlanejadaRef,
	type OptativaManual,
	findSubjectInFluxograma
} from '$lib/types/user';
import {
	getCompletedByEquivalenceCodes,
	getCurrentByEquivalenceCodes,
	findEquivalenceSourceCodes
} from '$lib/types/equivalencia';
import { getSubjectsBySemester } from '$lib/types/curso';
import { captureScreenshot } from '$lib/utils/screenshot';
import { toast } from 'svelte-sonner';
import type { AuthState } from '$lib/types/auth';

export type ConnectionMode = 'off' | 'direct' | 'chain' | 'all';

export type DisplayUnit = 'creditos' | 'horas';

export interface FluxogramaState {
	courseData: CursoModel | null;
	loading: boolean;
	error: string | null;
	zoomLevel: number;
	/** Zoom base calculado no mount para caber na tela — alvo do resetZoom. */
	defaultZoom: number;
	connectionMode: ConnectionMode;
	/** Exibição das badges por semestre: créditos ou horas */
	displayUnit: DisplayUnit;
	/** Filtro: exibir optativas (matriz, planejadas e cursadas) no fluxograma */
	showOptativas: boolean;
	/** Filtro: exibir módulos livres (cursados fora da matriz) no fluxograma */
	showModulosLivres: boolean;
	isAnonymous: boolean;
	hoveredSubjectCode: string | null;
	/** No modo "Todas" as conexões: pré-visualização do card sob o rato (clique continua fixando `hoveredSubjectCode`). */
	hoverPreviewSubjectCode: string | null;
	selectedSubjectCode: string | null;
	isCapturingScreenshot: boolean;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;

function normalizarSemestreDestino(valor: number | undefined, fallback: number): number {
	const n = Number(valor);
	if (!Number.isFinite(n) || n < 1) return Math.max(1, fallback);
	return Math.floor(n);
}

function hydrateOptativasFromManuais(
	manuais: OptativaManual[] | undefined,
	fluxograma: DadosFluxogramaUser | null | undefined,
	course: CursoModel
): OptativaAdicionada[] {
	if (!manuais?.length) return [];
	const byCode = new Map(course.materias.map((m) => [m.codigoMateria.trim().toUpperCase(), m]));
	const oficiais = new Set<string>();
	for (const sem of fluxograma?.dadosFluxograma ?? []) {
		for (const m of sem) {
			const c = m.codigoMateria.trim().toUpperCase();
			if (c) oficiais.add(c);
		}
	}
	const out: OptativaAdicionada[] = [];
	const seen = new Set<string>();
	for (const r of manuais) {
		const key = r.codigo.trim().toUpperCase();
		if (!key || seen.has(key)) continue;
		if (oficiais.has(key)) continue;
		seen.add(key);
		const m = byCode.get(key);
		if (!m) continue;
		const sem = Number(r.nivelAlocado);
		out.push({ materia: m, semestre: Number.isFinite(sem) && sem >= 1 ? sem : 1 });
	}
	return out;
}

function mergeFluxogramaComOptativasManuais(
	base: DadosFluxogramaUser | null,
	manuais: OptativaManual[] | undefined
): DadosFluxogramaUser | null {
	if (!base) return null;
	if (!manuais?.length) return base;

	const nextGrid = base.dadosFluxograma.map((sem) => [...sem]);
	const oficiais = new Set<string>();
	for (const sem of base.dadosFluxograma) {
		for (const m of sem) {
			const c = m.codigoMateria.trim().toUpperCase();
			if (c) oficiais.add(c);
		}
	}

	for (const manual of manuais) {
		const codigo = String(manual.codigo ?? '').trim();
		if (!codigo) continue;
		const codeU = codigo.toUpperCase();
		if (oficiais.has(codeU)) continue;
		const sem = normalizarSemestreDestino(manual.nivelAlocado, 1);
		const semIdx = sem - 1;
		while (nextGrid.length <= semIdx) nextGrid.push([]);
		const exists = nextGrid[semIdx].some((m) => m.codigoMateria.trim().toUpperCase() === codeU);
		if (exists) continue;
		nextGrid[semIdx].push({
			codigoMateria: codigo,
			mencao: '-',
			professor: '-',
			status: String(manual.status ?? 'PLANEJADO').toUpperCase(),
			anoPeriodo: null,
			frequencia: null,
			tipoDado: 'inclusao_manual_optativa',
			turma: null,
			nomeEquivalente: null,
			codigoEquivalente: null,
			isManual: true,
			nivelAlocado: sem,
			nivelDestino: sem
		});
	}

	return { ...base, dadosFluxograma: nextGrid };
}

function createFluxogramaStore() {
	let state = $state<FluxogramaState>({
		courseData: null,
		loading: false,
		error: null,
		zoomLevel: 0.6,
		defaultZoom: 0.6,
		connectionMode: 'direct' as ConnectionMode,
		displayUnit: 'horas' as DisplayUnit,
		showOptativas: true,
		showModulosLivres: true,
		isAnonymous: false,
		hoveredSubjectCode: null,
		hoverPreviewSubjectCode: null,
		selectedSubjectCode: null,
		isCapturingScreenshot: false
	});

	/**
	 * Geração do carregamento de curso/matriz. Só a chamada mais recente (e não
	 * invalidada por reset) escreve courseData/error/loading: trocar de matriz
	 * rápido fazia a resposta lenta da anterior sobrescrever a nova.
	 */
	let loadSeq = 0;

	let optativasAdicionadas = $state<OptativaAdicionada[]>([]);
	/** Alterações locais de optativas manuais ainda não enviadas ao Supabase. */
	let historicoManualPendenteSalvar = $state(false);

	// Per-semester connection density: semester → connection count
	let connectionDensityBySemester = $state<Map<number, number>>(new Map());

	/** Incrementado ao mudar optativas planejadas ou histórico local — força recálculo das linhas no diagrama. */
	let diagramLayoutRevision = $state(0);
	function bumpDiagramLayout() {
		diagramLayoutRevision += 1;
	}

	// Mirror the Svelte 4 writable authStore into a $state variable so that
	// $derived expressions can reactively track auth changes.
	let authState = $state<AuthState>({
		user: null,
		isAuthenticated: false,
		isAnonymous: false,
		isLoading: true,
		error: null
	});
	authStore.subscribe((value) => {
		authState = value;
	});

	async function persistirOptativasManuaisSilenciosamente(
		optativas: OptativaManual[]
	): Promise<boolean> {
		const user = authStore.getUser();
		if (state.isAnonymous || !user?.idUser) return false;
		try {
			await fluxogramaService.saveOptativasManuais(
				user.idUser,
				optativas.map((o) => ({
					codigo: o.codigo.trim(),
					nivel_alocado: normalizarSemestreDestino(o.nivelAlocado, 1),
					status: String(o.status ?? 'PLANEJADO').toUpperCase(),
					nome: o.nome ?? null
				}))
			);
			authStore.setUser({ ...user, optativasManuais: optativas });
			historicoManualPendenteSalvar = false;
			return true;
		} catch {
			historicoManualPendenteSalvar = true;
			return false;
		}
	}

	const optativasBySemester = $derived.by(() => {
		const map = new Map<number, OptativaAdicionada[]>();
		for (const opt of optativasAdicionadas) {
			if (!map.has(opt.semestre)) {
				map.set(opt.semestre, []);
			}
			map.get(opt.semestre)!.push(opt);
		}
		return map;
	});

	/** Código (uppercase) → semestre da optativa planejada (para densidade de linhas; matriz mantém nivel 0). */
	const optativaPlanejadaSemestrePorCodigo = $derived.by(() => {
		const m = new Map<string, number>();
		for (const o of optativasAdicionadas) {
			m.set(o.materia.codigoMateria.trim().toUpperCase(), o.semestre);
		}
		return m;
	});

	const optativasPlanejadasRefs = $derived.by((): OptativaPlanejadaRef[] =>
		optativasAdicionadas.map((o) => ({
			codigoMateria: o.materia.codigoMateria.trim(),
			semestre: o.semestre
		}))
	);

	// Computed: subjects grouped by semester
	const subjectsBySemester = $derived.by(() => {
		if (!state.courseData) return new Map<number, MateriaModel[]>();
		return getSubjectsBySemester(state.courseData);
	});

	// Computed: user progress data (reactive to auth store changes)
	const userFluxograma = $derived.by(() => {
		return mergeFluxogramaComOptativasManuais(
			authState.user?.dadosFluxograma ?? null,
			authState.user?.optativasManuais
		);
	});

	const precisaSalvarPerfil = $derived.by(() => historicoManualPendenteSalvar);

	/** Disciplinas com `inclusao_manual_optativa` ainda não enviadas (exibe em “Alterações para salvar”). */
	const historicoManualPendenteItens = $derived.by((): { codigoMateria: string; nomeMateria: string }[] => {
		if (!historicoManualPendenteSalvar || !userFluxograma) return [];
		const course = state.courseData;
		const byCode = new Map(
			(course?.materias ?? []).map((m) => [m.codigoMateria.trim().toUpperCase(), m])
		);
		const seen = new Set<string>();
		const out: { codigoMateria: string; nomeMateria: string }[] = [];
		for (const sem of userFluxograma.dadosFluxograma) {
			for (const dm of sem) {
				if (dm.tipoDado !== 'inclusao_manual_optativa') continue;
				if (!isMateriaAprovada(dm)) continue;
				const u = dm.codigoMateria.trim().toUpperCase();
				if (!u || seen.has(u)) continue;
				seen.add(u);
				const m = byCode.get(u);
				out.push({
					codigoMateria: dm.codigoMateria.trim(),
					nomeMateria: m?.nomeMateria ?? dm.codigoMateria.trim()
				});
			}
		}
		return out;
	});

	// Computed: carga horária integralizada do histórico (PDF)
	const cargaHorariaIntegralizada = $derived.by(() => {
		return authState.user?.cargaHorariaIntegralizada ?? null;
	});

	// Computed: completed subject codes (histórico + concluídas por equivalência)
	const completedCodes = $derived.by(() => {
		if (!userFluxograma) return new Set<string>();
		const base = getCompletedSubjectCodes(userFluxograma);
		const courseData = state.courseData;
		const byEquiv =
			courseData?.equivalencias && courseData.equivalencias.length > 0
				? getCompletedByEquivalenceCodes(courseData.equivalencias, base)
				: new Set<string>();
		return new Set([...base, ...byEquiv]);
	});

	// Computed: current subject codes (matrículas diretas + "Matriculado em
	// Equivalente" — ex.: cursando FGA0146/ED1 nova marca FGA0147 da matriz como
	// em curso, espelhando a expansão que completedCodes já faz para concluídas).
	const currentCodes = $derived.by(() => {
		if (!userFluxograma) return new Set<string>();
		const base = getCurrentSubjectCodes(userFluxograma);
		const courseData = state.courseData;
		// Passa as concluídas EXPANDIDAS (com equivalências): se outra equivalência
		// da mesma matéria já está satisfeita só com concluídas, ela é concluída —
		// não deve reaparecer como "cursando" por uma segunda expressão.
		const byEquiv =
			courseData?.equivalencias && courseData.equivalencias.length > 0
				? getCurrentByEquivalenceCodes(courseData.equivalencias, completedCodes, base)
				: new Set<string>();
		return new Set([...base, ...byEquiv]);
	});

	// ── "Optatórias": optativas que são pré-requisito de obrigatória ────────────
	// No SIGAA elas constam como Optativa, mas na prática o aluno PRECISA delas
	// para destravar obrigatórias. Mapa: código da optativa → obrigatórias que a
	// exigem (para a etiqueta e o tooltip explicarem a transparência ao aluno).
	const optatorias = $derived.by(() => {
		const map = new Map<string, string[]>();
		const course = state.courseData;
		if (!course) return map;
		const byId = new Map(course.materias.map((m) => [m.idMateria, m]));
		const byCode = new Map(
			course.materias.map((m) => [m.codigoMateria.trim().toUpperCase(), m])
		);
		for (const pr of course.preRequisitos ?? []) {
			const alvo = byId.get(pr.idMateria);
			// Só conta quando a matéria que EXIGE o requisito é obrigatória da matriz.
			if (!alvo || isOptativa(alvo)) continue;
			const reqCode = pr.codigoMateriaRequisito?.trim().toUpperCase();
			if (!reqCode) continue;
			const req = byCode.get(reqCode);
			if (!req || !isOptativa(req)) continue;
			if (!map.has(reqCode)) map.set(reqCode, []);
			const list = map.get(reqCode)!;
			if (!list.includes(alvo.codigoMateria)) list.push(alvo.codigoMateria);
		}
		return map;
	});

	// Nome/créditos resolvidos da tabela global `materias` para extras cujo dado
	// persistido não tem nome (uploads antigos, antes do schema guardar). Cache
	// simples: cada código é buscado uma única vez por sessão.
	let materiasResolvidas = $state<Map<string, { nome: string; creditos: number }>>(new Map());
	const materiasJaBuscadas = new Set<string>();
	async function resolverNomesExtras(codigos: string[]): Promise<void> {
		const novos = codigos.filter((c) => !materiasJaBuscadas.has(c));
		if (novos.length === 0) return;
		for (const c of novos) materiasJaBuscadas.add(c);
		try {
			const { getMateriasByCodigos } = await import('$lib/services/materias.service');
			const encontradas = await getMateriasByCodigos(novos);
			if (encontradas.length === 0) return;
			const next = new Map(materiasResolvidas);
			for (const m of encontradas) {
				next.set(m.codigo.trim().toUpperCase(), { nome: m.nome, creditos: m.creditos });
			}
			materiasResolvidas = next;
		} catch {
			/* sem rede/erro: cards ficam com o código, como antes */
		}
	}

	// ── Extras cursadas: optativas/eletivas do histórico fora das obrigatórias ──
	// O histórico traz matérias que não são obrigatórias da matriz (optativas,
	// módulo livre, aproveitamentos como Inteligência Artificial/CUMP). Elas eram
	// invisíveis no fluxograma; aqui viram cards na coluna do semestre em que
	// foram cursadas (ano/período → ordinal do aluno). CUMP sem período (ganhas
	// no ingresso) caem no 1º semestre.
	const extrasCursadasBySemester = $derived.by(() => {
		void diagramLayoutRevision;
		const out = new Map<number, { materia: MateriaModel; dados: DadosMateria }[]>();
		const fluxo = userFluxograma;
		const course = state.courseData;
		if (!fluxo) return out;

		// Códigos que já têm card na grade: obrigatórias da matriz (nivel > 0)…
		const obrigatorias = new Set<string>();
		if (course) {
			for (const [sem, mats] of getSubjectsBySemester(course)) {
				if (sem <= 0) continue;
				for (const m of mats) obrigatorias.add(m.codigoMateria.trim().toUpperCase());
			}
		}
		// …e optativas planejadas (renderizadas como optPlanned).
		const planejadas = new Set(
			optativasAdicionadas.map((o) => o.materia.codigoMateria.trim().toUpperCase())
		);

		// Matérias cujo status já foi "consumido" por uma obrigatória da matriz via
		// equivalência (ex.: FGA0146/ED1 nova → FGA0147 roxa) não viram card extra —
		// senão a mesma disciplina aparece duas vezes no fluxograma.
		const consumidasPorEquivalencia = new Set<string>();
		if (course?.equivalencias?.length) {
			const compCur = new Set(
				[...completedCodes, ...currentCodes].map((c) => c.trim().toUpperCase())
			);
			for (const eq of course.equivalencias) {
				const origem = (eq.codigoMateriaOrigem || '').trim().toUpperCase();
				if (!obrigatorias.has(origem) || !compCur.has(origem)) continue;
				for (const src of findEquivalenceSourceCodes(origem, [eq], compCur)) {
					consumidasPorEquivalencia.add(src.trim().toUpperCase());
				}
			}
		}

		// Ordinal do semestre: sequência CONTÍNUA do primeiro ao último período do
		// histórico (2022.2→1, 2023.1→2, …), casando com o "semestre atual" do
		// SIGAA. Não dá para usar só os períodos presentes: a consolidação remove
		// períodos em que o aluno só teve tentativas superadas (REP/TRANC), e o
		// ordinal encolheria.
		const periodos = new Set<string>();
		for (const sem of fluxo.dadosFluxograma) {
			for (const m of sem) {
				const p = String(m.anoPeriodo ?? '').trim();
				if (/^\d{4}\.\d$/.test(p)) periodos.add(p);
			}
		}
		const ordemPeriodos: string[] = [];
		if (periodos.size > 0) {
			const sorted = [...periodos].sort();
			let [ano, per] = sorted[0].split('.').map(Number);
			const [anoF, perF] = sorted[sorted.length - 1].split('.').map(Number);
			while (ano < anoF || (ano === anoF && per <= perF)) {
				ordemPeriodos.push(`${ano}.${per}`);
				if (per === 1) per = 2;
				else {
					per = 1;
					ano++;
				}
			}
		}
		const ordinalDe = (p: string | null | undefined): number => {
			const idx = ordemPeriodos.indexOf(String(p ?? '').trim());
			return idx >= 0 ? idx + 1 : 1;
		};

		const courseByCode = course
			? new Map(course.materias.map((m) => [m.codigoMateria.trim().toUpperCase(), m]))
			: new Map<string, MateriaModel>();

		// Dedup por código+período (não só código): repetíveis aprovadas mais de
		// uma vez (ex.: extensão para créditos de optativa) geram um card por
		// semestre cursado — e cada um soma nas horas da coluna.
		const seen = new Set<string>();
		let syntheticId = -1;
		for (const sem of fluxo.dadosFluxograma) {
			for (const dados of sem) {
				const codeU = dados.codigoMateria.trim().toUpperCase();
				if (!codeU) continue;
				const chave = `${codeU}|${String(dados.anoPeriodo ?? '').trim()}`;
				if (seen.has(chave)) continue;
				if (obrigatorias.has(codeU) || planejadas.has(codeU)) continue;
				if (consumidasPorEquivalencia.has(codeU)) continue;
				if (dados.isManual) continue; // manuais já rendem via optativasAdicionadas
				const st = String(dados.status ?? '').toUpperCase();
				if (st !== 'APR' && st !== 'CUMP' && st !== 'DISP' && st !== 'MATR') continue;
				seen.add(chave);

				const daMatriz = courseByCode.get(codeU);
				const resolvida = materiasResolvidas.get(codeU);
				const materia: MateriaModel = daMatriz ?? {
					// Fora da matriz (módulo livre/eletiva): sintetiza o card com os
					// dados do histórico (ou da tabela global de matérias, para
					// uploads antigos que não persistiram nome). id negativo estável
					// só para keys do Svelte.
					ementa: '',
					idMateria: syntheticId--,
					codigoMateria: dados.codigoMateria.trim(),
					nomeMateria:
						dados.nomeMateria?.trim() || resolvida?.nome || dados.codigoMateria.trim(),
					creditos: dados.creditos ?? resolvida?.creditos ?? 0,
					nivel: 0,
					tipoNatureza: 1
				};

				const semestre = st === 'CUMP' ? 1 : ordinalDe(dados.anoPeriodo);
				if (!out.has(semestre)) out.set(semestre, []);
				out.get(semestre)!.push({ materia, dados });
			}
		}

		// Busca (uma vez) nome/créditos dos extras sem nome persistido — quando a
		// resposta chegar, materiasResolvidas muda e este derived recalcula.
		const pendentesNome: string[] = [];
		for (const list of out.values()) {
			for (const { materia, dados } of list) {
				if (materia.idMateria < 0 && !dados.nomeMateria && !materiasResolvidas.has(materia.codigoMateria.trim().toUpperCase())) {
					pendentesNome.push(materia.codigoMateria.trim().toUpperCase());
				}
			}
		}
		if (pendentesNome.length > 0) void resolverNomesExtras(pendentesNome);

		return out;
	});

	// Computed: failed subject codes
	const failedCodes = $derived.by(() => {
		if (!userFluxograma) return new Set<string>();
		const failed = new Set<string>();
		for (const semester of userFluxograma.dadosFluxograma) {
			for (const materia of semester) {
				const st = String(materia.status ?? '').toUpperCase();
				if (st === 'REP' || st === 'REPF' || st === 'REPMF') {
					failed.add(materia.codigoMateria);
				}
			}
		}
		return failed;
	});

	function getOptativasManuaisAtuais(): OptativaManual[] {
		return [...(authStore.getUser()?.optativasManuais ?? [])];
	}

	function upsertOptativaManual(
		list: OptativaManual[],
		entry: OptativaManual
	): OptativaManual[] {
		const codeU = entry.codigo.trim().toUpperCase();
		const filtered = list.filter((o) => o.codigo.trim().toUpperCase() !== codeU);
		return [...filtered, entry];
	}

	async function resolverNomeMateria(codigo: string, fallback: string): Promise<string> {
		try {
			const rows = await fluxogramaService.getMateriasByCode([codigo.trim().toUpperCase()]);
			const found = (rows?.[0] as { nome_materia?: string } | undefined)?.nome_materia;
			return found?.trim() ? found : fallback;
		} catch {
			return fallback;
		}
	}

	return {
		get state() {
			return state;
		},
		get subjectsBySemester() {
			return subjectsBySemester;
		},
		get userFluxograma() {
			return userFluxograma;
		},
		get cargaHorariaIntegralizada() {
			return cargaHorariaIntegralizada;
		},
		get completedCodes() {
			return completedCodes;
		},
		get currentCodes() {
			return currentCodes;
		},
		get failedCodes() {
			return failedCodes;
		},
		get optativasAdicionadas() {
			return optativasAdicionadas;
		},
		get optativasBySemester() {
			return optativasBySemester;
		},
		get extrasCursadasBySemester() {
			return extrasCursadasBySemester;
		},
		get optatorias() {
			return optatorias;
		},
		get optativaPlanejadaSemestrePorCodigo() {
			return optativaPlanejadaSemestrePorCodigo;
		},
		get optativasPlanejadasRefs() {
			return optativasPlanejadasRefs;
		},
		get historicoManualPendenteSalvar() {
			return historicoManualPendenteSalvar;
		},
		get historicoManualPendenteItens() {
			return historicoManualPendenteItens;
		},
		get precisaSalvarPerfil() {
			return precisaSalvarPerfil;
		},
		get connectionDensityBySemester() {
			return connectionDensityBySemester;
		},

		get diagramLayoutRevision() {
			return diagramLayoutRevision;
		},

		getSubjectStatus(materia: MateriaModel): SubjectStatusValue {
			if (state.isAnonymous || !userFluxograma) {
				return SubjectStatusEnum.NOT_STARTED;
			}
			return determineSubjectStatus(materia, completedCodes, currentCodes, failedCodes, state.courseData ?? undefined);
		},

		getSubjectUserData(codigoMateria: string) {
			if (!userFluxograma) return null;
			const direto = findSubjectInFluxograma(userFluxograma, codigoMateria);
			if (direto && isMateriaAprovada(direto)) return direto;

			// Sem tentativa direta aprovada -- se o código consta como concluído
			// por equivalência de curso, busca os dados reais (menção, professor)
			// da disciplina que efetivamente satisfez a equivalência, em vez de
			// mostrar uma tentativa direta reprovada no próprio código.
			const equivalencias = state.courseData?.equivalencias;
			if (equivalencias?.length) {
				const sourceCodes = findEquivalenceSourceCodes(
					codigoMateria,
					equivalencias,
					completedCodes
				);
				for (const sourceCode of sourceCodes) {
					const origem = findSubjectInFluxograma(userFluxograma, sourceCode);
					if (origem && isMateriaAprovada(origem)) {
						const nomeOrigem = state.courseData?.materias.find(
							(m) => m.codigoMateria.trim().toUpperCase() === sourceCode
						)?.nomeMateria;
						return {
							...origem,
							codigoMateria,
							tipoDado: 'equivalencia',
							codigoEquivalente: origem.codigoMateria,
							nomeEquivalente: origem.nomeEquivalente || nomeOrigem || sourceCode
						};
					}
				}

				// "Matriculado em Equivalente": cursando uma equivalente agora — mostra
				// os dados da turma em curso, e não uma tentativa direta reprovada
				// antiga (que pintaria o anel vermelho num card já roxo).
				const sourceCodesCursando = findEquivalenceSourceCodes(
					codigoMateria,
					equivalencias,
					currentCodes
				);
				for (const sourceCode of sourceCodesCursando) {
					const origem = findSubjectInFluxograma(userFluxograma, sourceCode);
					if (origem && isMateriaCurrent(origem)) {
						const nomeOrigem = state.courseData?.materias.find(
							(m) => m.codigoMateria.trim().toUpperCase() === sourceCode
						)?.nomeMateria;
						return {
							...origem,
							codigoMateria,
							tipoDado: 'equivalencia',
							codigoEquivalente: origem.codigoMateria,
							nomeEquivalente: origem.nomeEquivalente || nomeOrigem || sourceCode
						};
					}
				}
			}

			return direto;
		},

		async addOptativa(materia: MateriaModel, semestre: number) {
			if (!isOptativa(materia)) {
				toast.error('Só matérias optativas da matriz entram neste planejamento.');
				return;
			}
			const semestreDestino = normalizarSemestreDestino(
				semestre,
				Math.max(1, Number(authStore.getUser()?.dadosFluxograma?.semestreAtual ?? 1))
			);
			const codeU = materia.codigoMateria.trim().toUpperCase();
			const exists = optativasAdicionadas.some(
				(o) => o.materia.codigoMateria.trim().toUpperCase() === codeU
			);
			if (exists) {
				toast.warning('Esta optativa já foi adicionada.');
				return;
			}
			if (userFluxograma && findSubjectInFluxograma(userFluxograma, materia.codigoMateria)) {
				toast.warning('Esta disciplina já está no histórico oficial e terá prioridade de exibição.');
				return;
			}
			optativasAdicionadas = [...optativasAdicionadas, { materia, semestre: semestreDestino }];
			bumpDiagramLayout();
			toast.success(`${materia.nomeMateria} adicionada ao ${semestreDestino}º semestre.`);
			const user = authStore.getUser();
			if (!state.isAnonymous && user) {
				const nomeMateria = await resolverNomeMateria(materia.codigoMateria, materia.nomeMateria);
				const atuais = getOptativasManuaisAtuais();
				const next = upsertOptativaManual(atuais, {
					codigo: materia.codigoMateria.trim(),
					nivelAlocado: semestreDestino,
					status: 'PLANEJADO',
					nome: nomeMateria
				});
				authStore.setUser({ ...user, optativasManuais: next });
				historicoManualPendenteSalvar = true;
				toast.info('Alteração local salva no app. Clique em "Salvar no perfil" para persistir.');
			}
		},

		async registrarOptativaConcluida(materia: MateriaModel, semestreConclusao?: number) {
			const user = authStore.getUser();
			if (state.isAnonymous || !user?.dadosFluxograma) {
				toast.error('Entre na conta para registrar disciplina concluída.');
				return;
			}
			const st = determineSubjectStatus(
				materia,
				completedCodes,
				currentCodes,
				failedCodes,
				state.courseData ?? undefined
			);
			if (st === SubjectStatusEnum.LOCKED) {
				toast.error(
					'Complete os pré-requisitos desta disciplina (como no fluxograma) antes de registrá-la como concluída.'
				);
				return;
			}
			if (st === SubjectStatusEnum.COMPLETED) {
				toast.warning('Esta disciplina já consta como concluída no seu histórico.');
				return;
			}
			const fluxo = user.dadosFluxograma;
			const semDestino = normalizarSemestreDestino(semestreConclusao, fluxo.semestreAtual || 1);
			const nomeMateria = await resolverNomeMateria(materia.codigoMateria, materia.nomeMateria);
			const atuais = getOptativasManuaisAtuais();
			const next = upsertOptativaManual(atuais, {
				codigo: materia.codigoMateria.trim(),
				nivelAlocado: semDestino,
				status: 'CUMP',
				nome: nomeMateria
			});
			optativasAdicionadas = [
				...optativasAdicionadas.filter(
					(o) => o.materia.codigoMateria.trim().toUpperCase() !== materia.codigoMateria.trim().toUpperCase()
				),
				{ materia, semestre: semDestino }
			];
			authStore.setUser({ ...user, optativasManuais: next });
			historicoManualPendenteSalvar = true;
			bumpDiagramLayout();
			toast.success(`${materia.nomeMateria} registrada como concluída.`);
			toast.info('Clique em "Salvar no perfil" para persistir as alterações.');
		},

		async registrarDisciplinaManual(
			materia: MateriaModel,
			status: string,
			semestreDestino?: number,
			opcionais?: { mencao?: string; professor?: string; equivalencia?: string }
		) {
			const user = authStore.getUser();
			if (state.isAnonymous || !user?.dadosFluxograma) {
				toast.error('Entre na conta para alterar o status da disciplina manualmente.');
				return;
			}

			const fluxo = user.dadosFluxograma;
			const semAlocado = normalizarSemestreDestino(semestreDestino, fluxo.semestreAtual || 1);
			const nomeMateria = await resolverNomeMateria(materia.codigoMateria, materia.nomeMateria);
			const atuais = getOptativasManuaisAtuais();
			
			// If it was already planned as an optativa, we can replace it.
			const next = upsertOptativaManual(atuais, {
				codigo: materia.codigoMateria.trim(),
				nivelAlocado: semAlocado,
				status: status,
				nome: nomeMateria,
				...(opcionais && {
					mencao: opcionais.mencao,
					professor: opcionais.professor,
					codigoEquivalente: opcionais.equivalencia
				})
			} as any);

			optativasAdicionadas = [
				...optativasAdicionadas.filter(
					(o) => o.materia.codigoMateria.trim().toUpperCase() !== materia.codigoMateria.trim().toUpperCase()
				)
			];
			// Add back if it's an optativa and we are planning it, but for manual history overrides, 
			// `mergeFluxogramaComOptativasManuais` handles rendering it in the flowchart correctly.
			if (isOptativa(materia) && status === 'PLANEJADO') {
				optativasAdicionadas.push({ materia, semestre: semAlocado });
			}

			authStore.setUser({ ...user, optativasManuais: next });
			historicoManualPendenteSalvar = true;
			bumpDiagramLayout();
			toast.success(`Status de ${materia.codigoMateria} atualizado.`);
		},

		async removerDisciplinaManual(codigoMateria: string) {
			const user = authStore.getUser();
			if (state.isAnonymous || !user?.dadosFluxograma) return;
			const u = codigoMateria.trim().toUpperCase();
			const atuais = getOptativasManuaisAtuais();
			const next = atuais.filter((o) => o.codigo.trim().toUpperCase() !== u);
			
			optativasAdicionadas = optativasAdicionadas.filter(
				(o) => o.materia.codigoMateria.trim().toUpperCase() !== u
			);
			
			authStore.setUser({ ...user, optativasManuais: next });
			historicoManualPendenteSalvar = true;
			bumpDiagramLayout();
			toast.success(`Status manual removido.`);
		},

		async removeOptativa(codigoMateria: string) {
			const u = codigoMateria.trim().toUpperCase();
			const opt = optativasAdicionadas.find(
				(o) => o.materia.codigoMateria.trim().toUpperCase() === u
			);
			optativasAdicionadas = optativasAdicionadas.filter(
				(o) => o.materia.codigoMateria.trim().toUpperCase() !== u
			);
			if (opt) {
				bumpDiagramLayout();
				toast.success(`${opt.materia.nomeMateria} removida.`);
			}
			const user = authStore.getUser();
			if (!state.isAnonymous && user) {
				const atuais = getOptativasManuaisAtuais();
				const next = atuais.filter((o) => o.codigo.trim().toUpperCase() !== u);
				authStore.setUser({ ...user, optativasManuais: next });
				historicoManualPendenteSalvar = true;
				toast.info('Remoção aplicada localmente. Clique em "Salvar no perfil" para persistir.');
			}
		},

		isOptativaPlanejada(codigoMateria: string): boolean {
			const u = codigoMateria.trim().toUpperCase();
			return optativasAdicionadas.some(
				(o) => o.materia.codigoMateria.trim().toUpperCase() === u
			);
		},

		/**
		 * Remove optativa do planejamento (persistência fica para ação explícita em "Salvar no perfil").
		 */
		async removeOptativaPlanejada(codigoMateria: string): Promise<boolean> {
			await this.removeOptativa(codigoMateria);
			return true;
		},
		/**
		 * Compat: manter assinatura antiga para componentes legados.
		 */
		async removeOptativaPlanejadaESalvar(codigoMateria: string): Promise<boolean> {
			return this.removeOptativaPlanejada(codigoMateria);
		},

		async saveOptativasPlanejadas() {
			const user = authStore.getUser();
			if (state.isAnonymous || !user?.idUser || !user.dadosFluxograma) {
				toast.error('Entre na conta para salvar o planejamento de optativas.');
				return;
			}
			const next = getOptativasManuaisAtuais();
			try {
				const ok = await persistirOptativasManuaisSilenciosamente(next);
				if (ok) toast.success('Alterações salvas no seu perfil.');
				else toast.error('Não foi possível salvar. Tente de novo.');
			} catch (err) {
				toast.error(
					`Não foi possível salvar. Tente de novo.${err instanceof Error ? ` (${err.message})` : ''}`
				);
			}
		},

		async loadCourseData(courseName: string, anonymous = false) {
			const seq = ++loadSeq;
			state.loading = true;
			state.error = null;
			state.isAnonymous = anonymous;

			try {
				const data = await fluxogramaService.getCourseData(courseName);
				if (seq !== loadSeq) return;
				state.courseData = data;
				optativasAdicionadas = hydrateOptativasFromManuais(
					authStore.getUser()?.optativasManuais,
					authStore.getUser()?.dadosFluxograma,
					data
				);
			} catch (err) {
				if (seq !== loadSeq) return;
				const message =
					err instanceof Error ? err.message : 'Erro ao carregar dados do curso';
				state.error = message;
				toast.error(message);
			} finally {
				if (seq === loadSeq) state.loading = false;
			}
		},

		async loadCourseDataByCurriculoCompleto(curriculoCompleto: string, anonymous = false) {
			const seq = ++loadSeq;
			state.loading = true;
			state.error = null;
			state.isAnonymous = anonymous;
			try {
				const data = await fluxogramaService.getCourseDataByCurriculoCompleto(curriculoCompleto);
				if (seq !== loadSeq) return;
				state.courseData = data;
				optativasAdicionadas = hydrateOptativasFromManuais(
					authStore.getUser()?.optativasManuais,
					authStore.getUser()?.dadosFluxograma,
					data
				);
			} catch (err) {
				if (seq !== loadSeq) return;
				const message =
					err instanceof Error ? err.message : 'Erro ao carregar dados da matriz';
				state.error = message;
				toast.error(message);
			} finally {
				if (seq === loadSeq) state.loading = false;
			}
		},

		setZoom(level: number) {
			state.zoomLevel = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
		},

		/** Zoom inicial adaptativo: aplica e memoriza como padrão para o resetZoom. */
		applyAdaptiveZoom(level: number) {
			const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
			state.defaultZoom = z;
			state.zoomLevel = z;
		},

		zoomIn() {
			this.setZoom(state.zoomLevel + ZOOM_STEP);
		},

		zoomOut() {
			this.setZoom(state.zoomLevel - ZOOM_STEP);
		},

		resetZoom() {
			state.zoomLevel = state.defaultZoom;
		},

		setConnectionMode(mode: ConnectionMode) {
			state.connectionMode = mode;
		},

		setDisplayUnit(unit: DisplayUnit) {
			state.displayUnit = unit;
		},

		toggleShowOptativas() {
			state.showOptativas = !state.showOptativas;
			bumpDiagramLayout();
		},

		toggleShowModulosLivres() {
			state.showModulosLivres = !state.showModulosLivres;
			bumpDiagramLayout();
		},

		setConnectionDensity(density: Map<number, number>) {
			connectionDensityBySemester = density;
		},

		toggleConnections() {
			state.connectionMode = state.connectionMode === 'off' ? 'direct' : 'off';
		},

		setHoveredSubject(code: string | null) {
			state.hoveredSubjectCode = code;
		},

		setHoverPreviewSubject(code: string | null) {
			state.hoverPreviewSubjectCode = code;
		},

		setSelectedSubject(code: string | null) {
			state.selectedSubjectCode = code;
		},

		/**
		 * @param captureOptions.connectionMode — `off`: só disciplinas (sem linhas). `all`: todas as conexões no print. Estado do usuário é restaurado após a captura.
		 */
		async saveScreenshot(
			container: HTMLElement | null,
			captureOptions?: { connectionMode: 'off' | 'all' }
		) {
			if (!container) {
				toast.error('Elemento do fluxograma não encontrado.');
				return;
			}
			const prevMode = state.connectionMode;
			const prevHover = state.hoveredSubjectCode;
			const prevPreview = state.hoverPreviewSubjectCode;
			const shouldRestore = !!captureOptions?.connectionMode;
			try {
				state.isCapturingScreenshot = true;
				if (captureOptions?.connectionMode) {
					state.connectionMode = captureOptions.connectionMode;
					state.hoveredSubjectCode = null;
					state.hoverPreviewSubjectCode = null;
				}
				// Modo "todas" altera gaps entre colunas — precisa de mais tempo para o layout/SVG
				const delayMs = captureOptions?.connectionMode === 'all' ? 450 : captureOptions?.connectionMode === 'off' ? 180 : 100;
				await new Promise((resolve) => setTimeout(resolve, delayMs));
				const courseName = state.courseData?.nomeCurso ?? 'fluxograma';
				const base = courseName.replace(/\s+/g, '_');
				const suffix =
					captureOptions?.connectionMode === 'all'
						? '_todas_conexoes'
						: captureOptions?.connectionMode === 'off'
							? '_normal'
							: '';
				const filename = `${base}${suffix}.png`;
				await captureScreenshot(container, filename);
				toast.success('Screenshot salvo com sucesso!');
			} catch {
				toast.error('Não foi possível capturar a imagem.');
			} finally {
				state.isCapturingScreenshot = false;
				if (shouldRestore) {
					state.connectionMode = prevMode;
					state.hoveredSubjectCode = prevHover;
					state.hoverPreviewSubjectCode = prevPreview;
				}
			}
		},

		reset() {
			// Invalida carregamentos em voo: a resposta deles não pode repopular o store.
			loadSeq++;
			state.courseData = null;
			state.loading = false;
			state.error = null;
			state.zoomLevel = 0.6;
			state.defaultZoom = 0.6;
			state.connectionMode = 'direct';
			state.displayUnit = 'horas';
			state.showOptativas = true;
			state.showModulosLivres = true;
			state.isAnonymous = false;
			state.hoveredSubjectCode = null;
			state.hoverPreviewSubjectCode = null;
			state.selectedSubjectCode = null;
			state.isCapturingScreenshot = false;
			optativasAdicionadas = [];
			connectionDensityBySemester = new Map();
		}
	};
}

export const fluxogramaStore = createFluxogramaStore();
