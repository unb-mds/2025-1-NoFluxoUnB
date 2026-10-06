/**
 * Factory functions for creating typed objects from raw JSON/API data
 * Bridges between snake_case (database) and camelCase (TypeScript) conventions
 */

import type {
	UserModel,
	DadosMateria,
	DadosFluxogramaUser,
	OptativaPlanejadaRef,
	OptativaManual,
	EquivalenciaPdf
} from '$lib/types/user';
import { isMateriaAprovada } from '$lib/types/user';
import type {
	CursoModel,
	MinimalCursoModel,
	PreRequisitoModel,
	CoRequisitoModel
} from '$lib/types/curso';
import type { MateriaModel } from '$lib/types/materia';
import type { EquivalenciaModel } from '$lib/types/equivalencia';

// ============================================================================
// DadosMateria Factory
// ============================================================================

export function createDadosMateriaFromJson(json: Record<string, unknown>): DadosMateria {
	return {
		codigoMateria: String(json.codigo ?? json.codigoMateria ?? ''),
		mencao: String(json.mencao ?? '-'),
		professor: String(json.professor ?? ''),
		status: String(json.status ?? '-'),
		anoPeriodo: json.ano_periodo != null ? String(json.ano_periodo) : null,
		frequencia: json.frequencia != null ? String(json.frequencia) : null,
		tipoDado: json.tipo_dado != null ? String(json.tipo_dado) : null,
		turma: json.turma != null ? String(json.turma) : null,
		codigoEquivalente:
			json.codigo_equivalente != null
				? String(json.codigo_equivalente)
				: json.codigoEquivalente != null
					? String(json.codigoEquivalente)
					: null,
		nomeEquivalente:
			json.nome_equivalente != null
				? String(json.nome_equivalente)
				: json.nomeEquivalente != null
					? String(json.nomeEquivalente)
					: null,
		isManual: Boolean(json.is_manual ?? json.isManual ?? false),
		nivelDestino:
			json.nivel_destino != null
				? (json.nivel_destino as number | string)
				: json.nivelDestino != null
					? (json.nivelDestino as number | string)
					: null,
		nivel:
			json.nivel != null
				? (json.nivel as number | string)
				: json.nivel_alocado != null
					? (json.nivel_alocado as number | string)
					: null,
		nivelAlocado:
			json.nivel_alocado != null
				? (json.nivel_alocado as number | string)
				: json.nivelAlocado != null
					? (json.nivelAlocado as number | string)
					: null,
		// Nome/créditos do histórico (RPC manda nome/nome_materia e creditos):
		// essencial para matérias fora da matriz, que não existem no courseData.
		nomeMateria:
			json.nome_materia != null
				? String(json.nome_materia)
				: json.nome != null
					? String(json.nome)
					: json.nomeMateria != null
						? String(json.nomeMateria)
						: null,
		creditos:
			json.creditos != null && Number.isFinite(Number(json.creditos))
				? Number(json.creditos)
				: null
	};
}

export function dadosMateriaToJson(dados: DadosMateria): Record<string, unknown> {
	return {
		codigo: dados.codigoMateria,
		mencao: dados.mencao,
		professor: dados.professor,
		status: dados.status,
		ano_periodo: dados.anoPeriodo,
		frequencia: dados.frequencia,
		tipo_dado: dados.tipoDado,
		turma: dados.turma,
		codigo_equivalente: dados.codigoEquivalente ?? undefined,
		nome_equivalente: dados.nomeEquivalente ?? undefined,
		is_manual: dados.isManual ?? undefined,
		nivel_destino: dados.nivelDestino ?? undefined,
		nivel: dados.nivel ?? undefined,
		nivel_alocado: dados.nivelAlocado ?? undefined,
		nome_materia: dados.nomeMateria ?? undefined,
		creditos: dados.creditos ?? undefined
	};
}

// ============================================================================
// DadosFluxogramaUser Factory
// ============================================================================

export function parseOptativasPlanejadasFromJson(raw: unknown): OptativaPlanejadaRef[] | undefined {
	if (!Array.isArray(raw) || raw.length === 0) return undefined;
	const out: OptativaPlanejadaRef[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const o = item as Record<string, unknown>;
		const cod = String(o.codigoMateria ?? o.codigo_materia ?? '').trim();
		if (!cod) continue;
		const sem = Number(o.semestre);
		const semestre = Number.isFinite(sem) && sem >= 1 ? sem : 1;
		out.push({ codigoMateria: cod, semestre });
	}
	return out.length ? out : undefined;
}

export function createDadosFluxogramaUserFromJson(
	json: Record<string, unknown>
): DadosFluxogramaUser {
	const dadosFluxograma = json.dados_fluxograma as unknown[][];

	return {
		nomeCurso: String(json.nome_curso ?? ''),
		ira: Number(json.ira ?? 0),
		iraTexto:
			json.ira_texto != null && String(json.ira_texto).trim() !== ''
				? String(json.ira_texto).trim()
				: null,
		matricula: String(json.matricula ?? ''),
		semestreAtual: Number(json.semestre_atual ?? 0),
		anoAtual: String(json.ano_atual ?? ''),
		matrizCurricular: String(json.matriz_curricular ?? ''),
		horasIntegralizadas: Number(json.horas_integralizadas ?? 0),
		suspensoes: Array.isArray(json.suspensoes)
			? (json.suspensoes as unknown[]).map(String)
			: [],
		dadosFluxograma: Array.isArray(dadosFluxograma)
			? dadosFluxograma.map((semester) =>
					Array.isArray(semester)
						? semester.map((materia) =>
								createDadosMateriaFromJson(materia as Record<string, unknown>)
							)
						: []
				)
			: [],
		optativasPlanejadas: parseOptativasPlanejadasFromJson(
			json.optativas_planejadas ?? json.optativasPlanejadas
		),
		equivalenciasPdf: parseEquivalenciasPdfFromJson(
			json.equivalencias_pdf ?? json.equivalenciasPdf
		),
		schemaVersion:
			json.schema_version != null
				? Number(json.schema_version)
				: json.schemaVersion != null
					? Number(json.schemaVersion)
					: undefined
	};
}

/** Normaliza a lista de equivalências do histórico (aceita snake_case do parser). */
function parseEquivalenciasPdfFromJson(raw: unknown): EquivalenciaPdf[] | undefined {
	if (!Array.isArray(raw) || raw.length === 0) return undefined;
	const out: EquivalenciaPdf[] = [];
	for (const item of raw) {
		if (item == null || typeof item !== 'object') continue;
		const r = item as Record<string, unknown>;
		const cumpriu = String(r.cumpriu ?? '').trim().toUpperCase();
		const atravesDe = String(r.atraves_de ?? r.atravesDe ?? '').trim().toUpperCase();
		if (!cumpriu || !atravesDe) continue;
		out.push({
			cumpriu,
			atravesDe,
			nomeCumpriu: r.nome_cumpriu != null ? String(r.nome_cumpriu) : (r.nomeCumpriu != null ? String(r.nomeCumpriu) : null),
			nomeEquivalente: r.nome_equivalente != null ? String(r.nome_equivalente) : (r.nomeEquivalente != null ? String(r.nomeEquivalente) : null)
		});
	}
	return out.length > 0 ? out : undefined;
}

export function dadosFluxogramaUserToJson(
	dados: DadosFluxogramaUser
): Record<string, unknown> {
	return {
		nome_curso: dados.nomeCurso,
		ira: dados.ira,
		...(dados.iraTexto != null && dados.iraTexto !== ''
			? { ira_texto: dados.iraTexto }
			: {}),
		matricula: dados.matricula,
		matriz_curricular: dados.matrizCurricular,
		semestre_atual: dados.semestreAtual,
		ano_atual: dados.anoAtual,
		horas_integralizadas: dados.horasIntegralizadas,
		suspensoes: dados.suspensoes,
		dados_fluxograma: dados.dadosFluxograma.map((semester) =>
			semester.map(dadosMateriaToJson)
		),
		...(dados.optativasPlanejadas?.length
			? {
					optativas_planejadas: dados.optativasPlanejadas.map((p) => ({
						codigo_materia: p.codigoMateria,
						semestre: p.semestre
					}))
				}
			: {}),
		...(dados.equivalenciasPdf?.length
			? {
					equivalencias_pdf: dados.equivalenciasPdf.map((e) => ({
						cumpriu: e.cumpriu,
						atraves_de: e.atravesDe,
						...(e.nomeCumpriu ? { nome_cumpriu: e.nomeCumpriu } : {}),
						...(e.nomeEquivalente ? { nome_equivalente: e.nomeEquivalente } : {})
					}))
				}
			: {}),
		...(dados.schemaVersion != null ? { schema_version: dados.schemaVersion } : {})
	};
}

/**
 * Injeta no dados_fluxograma as equivalências declaradas no PRÓPRIO histórico
 * ("Cumpriu X através de Y"). É a fonte oficial do SIGAA por aluno: cobre pares
 * que faltem na tabela `equivalencias` do banco. Cada par vira uma entrada
 * CUMP/tipo 'equivalencia' — o mesmo formato que o casamento via banco produz —
 * então status do card, etiqueta "equiv." e o gerador de plano (que conta CUMP)
 * funcionam sem caminho especial. Pares cujo alvo já está APR/CUMP/equivalência
 * no fluxograma são ignorados (o banco chegou primeiro; não duplica).
 */
export function injetarEquivalenciasDoPdf(
	dados: DadosFluxogramaUser,
	equivalenciasRaw: unknown
): void {
	const pares = parseEquivalenciasPdfFromJson(equivalenciasRaw);
	if (!pares) return;
	dados.equivalenciasPdf = pares;

	const presentes = new Set<string>();
	for (const sem of dados.dadosFluxograma) {
		for (const m of sem) {
			const st = String(m.status ?? '').toUpperCase();
			if (st === 'APR' || st === 'CUMP' || m.tipoDado === 'equivalencia') {
				presentes.add(m.codigoMateria.trim().toUpperCase());
			}
		}
	}

	if (dados.dadosFluxograma.length === 0) dados.dadosFluxograma.push([]);
	const primeiroSemestre = dados.dadosFluxograma[0];
	for (const eq of pares) {
		if (presentes.has(eq.cumpriu)) continue;
		presentes.add(eq.cumpriu);
		primeiroSemestre.push(
			createDadosMateriaFromJson({
				codigo: eq.cumpriu,
				status: 'CUMP',
				mencao: '-',
				professor: '',
				tipo_dado: 'equivalencia',
				codigo_equivalente: eq.atravesDe,
				nome_equivalente: eq.nomeEquivalente ?? null,
				nome_materia: eq.nomeCumpriu ?? null
			})
		);
	}
}

/**
 * Normalize fluxograma data from localStorage/raw source.
 * Accepts either snake_case (dados_fluxograma, codigo) or camelCase (dadosFluxograma, codigoMateria)
 * and returns a DadosFluxogramaUser so getCompletedSubjectCodes() and the UI always get the expected shape.
 */
export function normalizeDadosFluxogramaFromStored(
	payload: unknown
): DadosFluxogramaUser | null {
	if (payload == null || typeof payload !== 'object') return null;
	const raw = payload as Record<string, unknown>;
	// Snake_case format (e.g. from DB or old localStorage)
	if (Array.isArray(raw.dados_fluxograma) && !raw.dadosFluxograma) {
		return createDadosFluxogramaUserFromJson(raw);
	}
	// CamelCase format (e.g. from setUser/updateDadosFluxograma)
	if (Array.isArray(raw.dadosFluxograma)) {
		const dadosFluxograma = (raw.dadosFluxograma as unknown[][]).map((semester) =>
			Array.isArray(semester)
				? 		(semester as Record<string, unknown>[]).map((m) => {
						const mm = m as Record<string, unknown>;
						return createDadosMateriaFromJson({
							codigo: (mm.codigoMateria ?? mm.codigo) ?? '',
							mencao: mm.mencao,
							professor: mm.professor,
							status: mm.status,
							ano_periodo: mm.anoPeriodo,
							frequencia: mm.frequencia,
							tipo_dado: mm.tipoDado,
							turma: mm.turma,
							codigo_equivalente: mm.codigoEquivalente,
							nome_equivalente: mm.nomeEquivalente
						});
					})
				: []
		);
		return {
			nomeCurso: String(raw.nomeCurso ?? ''),
			ira: Number(raw.ira ?? 0),
			matricula: String(raw.matricula ?? ''),
			horasIntegralizadas: Number(raw.horasIntegralizadas ?? 0),
			suspensoes: Array.isArray(raw.suspensoes) ? (raw.suspensoes as string[]) : [],
			anoAtual: String(raw.anoAtual ?? ''),
			matrizCurricular: String(raw.matrizCurricular ?? ''),
			semestreAtual: Number(raw.semestreAtual ?? 0),
			dadosFluxograma,
			optativasPlanejadas: parseOptativasPlanejadasFromJson(
				raw.optativasPlanejadas ?? raw.optativas_planejadas
			)
		};
	}
	return null;
}

/**
 * Build DadosFluxogramaUser from the casar-disciplinas API response.
 * Converts disciplinas_casadas (flat list with codigo, status, mencao) into
 * the 2D array format so getCompletedSubjectCodes() and the fluxograma UI work.
 * Inclui também materias_concluidas com status_fluxograma 'concluida_equivalencia'
 * para que todas as concluídas (incl. por equivalência) reflitam no fluxograma.
 */
export function buildDadosFluxogramaUserFromCasarResponse(
	response: {
		disciplinas_casadas: Record<string, unknown>[];
		materias_concluidas?: Record<string, unknown>[];
		dados_validacao?: { ira?: number; ira_texto?: string | null; horas_integralizadas?: number };
		curso_extraido?: string;
		matriz_curricular?: string;
	},
	meta: {
		nomeCurso: string;
		matricula: string;
		anoAtual: string;
		matrizCurricular: string;
		semestreAtual: number;
		suspensoes: string[];
	},
	options?: { iraTexto?: string | null }
): DadosFluxogramaUser {
	const disciplinas = response.disciplinas_casadas ?? [];
	const materiasConcluidas = response.materias_concluidas ?? [];

	const equivalenciaByCode = new Map<
		string,
		{
			professor: string;
			mencao: string;
			status: string;
			ano_periodo: string | null;
			codigo_equivalente: string | null;
			nome_equivalente: string | null;
		}
	>();
	for (const rec of materiasConcluidas) {
		const r = rec as Record<string, unknown>;
		if (r.status_fluxograma !== 'concluida_equivalencia') continue;
		const codigo = String(r.codigo_materia ?? r.codigo ?? '').trim().toUpperCase();
		if (!codigo) continue;
		equivalenciaByCode.set(codigo, {
			professor: (r.professor as string) ?? '',
			mencao: (r.mencao as string) ?? '-',
			status: (r.status as string) ?? 'CUMP',
			ano_periodo: r.ano_periodo != null ? String(r.ano_periodo) : null,
			codigo_equivalente: r.codigo_equivalente != null ? String(r.codigo_equivalente) : null,
			nome_equivalente: r.nome_equivalente != null ? String(r.nome_equivalente) : null
		});
	}

	const primeiroSemestre: DadosMateria[] = disciplinas.map((d) => {
		const raw = d as Record<string, unknown>;
		const codigoMatriz = String(raw.codigo_materia ?? raw.codigo ?? '').trim();
		const codigoUpper = codigoMatriz.toUpperCase();
		const codigoHist = String(raw.codigo_historico ?? '').trim();
		const nomeHist = raw.nome_historico != null ? String(raw.nome_historico) : null;
		const foiCursadaComoEquivalente =
			codigoHist.length > 0 && codigoHist.toUpperCase() !== codigoUpper;

		const base = createDadosMateriaFromJson({
			...raw,
			codigo: raw.codigo_materia ?? raw.codigo
		});

		const equiv = equivalenciaByCode.get(codigoUpper);
		const isAprovada = isMateriaAprovada(base);

		// R17: a obrigatória foi reprovada/está em curso, mas o RPC a integralizou por uma
		// equivalente aprovada. A tentativa REP/MATR dá lugar à equivalência; senão o
		// código já está em codigosJaIncluidos, a entrada concluida_equivalencia nunca
		// entra e o fluxograma salvo diverge do percentual do resumo.
		if (equiv && !isAprovada) {
			return createDadosMateriaFromJson({
				...raw,
				codigo: codigoMatriz,
				status: equiv.status,
				mencao: equiv.mencao,
				professor: equiv.professor,
				ano_periodo: equiv.ano_periodo,
				frequencia: null,
				turma: null,
				tipo_dado: 'equivalencia',
				codigo_equivalente: equiv.codigo_equivalente,
				nome_equivalente: equiv.nome_equivalente
			});
		}
		const usarComoEquivalencia =
			isAprovada && (equiv || (foiCursadaComoEquivalente && (codigoHist || nomeHist)));

		if (usarComoEquivalencia) {
			const codigoEq = equiv?.codigo_equivalente ?? (codigoHist || null);
			const nomeEq = equiv?.nome_equivalente ?? nomeHist ?? null;
			return {
				...base,
				tipoDado: 'equivalencia',
				professor: equiv ? (equiv.professor || base.professor) : base.professor,
				mencao: equiv && equiv.mencao !== '-' ? equiv.mencao : base.mencao,
				status: equiv?.status || base.status,
				anoPeriodo: equiv?.ano_periodo ?? base.anoPeriodo ?? null,
				codigoEquivalente: codigoEq,
				nomeEquivalente: nomeEq
			};
		}
		return base;
	});

	const codigosJaIncluidos = new Set(primeiroSemestre.map((m) => m.codigoMateria.trim().toUpperCase()));
	for (const rec of materiasConcluidas) {
		const r = rec as Record<string, unknown>;
		if (r.status_fluxograma !== 'concluida_equivalencia') continue;
		const codigo = String(r.codigo_materia ?? r.codigo ?? '').trim();
		if (!codigo || codigosJaIncluidos.has(codigo.toUpperCase())) continue;
		primeiroSemestre.push(
			createDadosMateriaFromJson({
				codigo,
				codigo_materia: codigo,
				status: (r.status as string) ?? 'CUMP',
				mencao: (r.mencao as string) ?? '-',
				professor: (r.professor as string) ?? '',
				ano_periodo: r.ano_periodo != null ? String(r.ano_periodo) : null,
				tipo_dado: 'equivalencia',
				codigo_equivalente: r.codigo_equivalente != null ? String(r.codigo_equivalente) : null,
				nome_equivalente: r.nome_equivalente != null ? String(r.nome_equivalente) : null
			})
		);
		codigosJaIncluidos.add(codigo.toUpperCase());
	}

	const dadosFluxograma: DadosMateria[][] = [primeiroSemestre];

	const iraTextoResolved =
		options?.iraTexto ??
		(response.dados_validacao as { ira_texto?: string | null } | undefined)?.ira_texto ??
		null;
	return {
		nomeCurso: meta.nomeCurso,
		ira: Number(response.dados_validacao?.ira ?? 0),
		iraTexto:
			iraTextoResolved != null && String(iraTextoResolved).trim() !== ''
				? String(iraTextoResolved).trim()
				: null,
		matricula: meta.matricula,
		horasIntegralizadas: Number(response.dados_validacao?.horas_integralizadas ?? 0),
		suspensoes: meta.suspensoes,
		anoAtual: meta.anoAtual,
		matrizCurricular: meta.matrizCurricular,
		semestreAtual: meta.semestreAtual,
		dadosFluxograma
	};
}

function parseOptativasManuais(raw: unknown): OptativaManual[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item): OptativaManual | null => {
			if (!item || typeof item !== 'object') return null;
			const o = item as Record<string, unknown>;
			const codigo = String(o.codigo ?? o.codigo_materia ?? '').trim();
			const nivel = Number(o.nivel_alocado ?? o.nivelAlocado ?? 0);
			if (!codigo || !Number.isFinite(nivel) || nivel < 1) return null;
			const out: OptativaManual = {
				codigo,
				nivelAlocado: Math.floor(nivel),
				status: String(o.status ?? 'PLANEJADO').toUpperCase(),
				nome: o.nome != null ? String(o.nome) : null
			};
			return out;
		})
		.filter((v): v is OptativaManual => v != null);
}

// ============================================================================
// UserModel Factory
// ============================================================================

export function createUserModelFromJson(json: Record<string, unknown>): UserModel {
	let dadosFluxograma: DadosFluxogramaUser | null = null;

	// Supabase returns dados_users as a single object (one-to-one via unique id_user)
	// or as an array (legacy / to-many). Handle both formats.
	const rawDadosUsers = json.dados_users;
	const dadosUserRow: Record<string, unknown> | null =
		rawDadosUsers != null && typeof rawDadosUsers === 'object'
			? Array.isArray(rawDadosUsers)
				? (rawDadosUsers.length > 0 ? (rawDadosUsers[0] as Record<string, unknown>) : null)
				: (rawDadosUsers as Record<string, unknown>)
			: null;

	const cargaHorariaIntegralizada = (() => {
		if (!dadosUserRow?.carga_horaria_integralizada) return null;
		const ch = dadosUserRow.carga_horaria_integralizada as Record<string, unknown>;
		if (typeof ch !== 'object' || ch === null) return null;
		const o = Number(ch.obrigatoria ?? 0);
		const op = Number(ch.optativa ?? 0);
		const c = Number(ch.complementar ?? 0);
		const t = Number(ch.total ?? o + op + c);
		return { obrigatoria: o, optativa: op, complementar: c, total: t };
	})();

	if (dadosUserRow != null && dadosUserRow.fluxograma_atual != null) {
		const fluxogramaData =
			typeof dadosUserRow.fluxograma_atual === 'string'
				? JSON.parse(dadosUserRow.fluxograma_atual)
				: dadosUserRow.fluxograma_atual;

		// Support both formats: DadosFluxogramaUser (dados_fluxograma) or old CasarDisciplinasResponse (disciplinas_casadas)
		if (
			fluxogramaData &&
			Array.isArray(fluxogramaData.disciplinas_casadas) &&
			!Array.isArray(fluxogramaData.dados_fluxograma)
		) {
			const meta = {
				nomeCurso: String(fluxogramaData.curso_extraido ?? ''),
				matricula: '',
				anoAtual: '',
				matrizCurricular: String(fluxogramaData.matriz_curricular ?? ''),
				semestreAtual: 0,
				suspensoes: [] as string[]
			};
			const fd = fluxogramaData as Record<string, unknown>;
			const dv = fd.dados_validacao as Record<string, unknown> | undefined;
			const iraTextoLegacy =
				(dv?.ira_texto as string | undefined) ??
				(fd.ira_texto as string | undefined) ??
				(fd.iraTexto as string | undefined);
			dadosFluxograma = buildDadosFluxogramaUserFromCasarResponse(
				fluxogramaData as Parameters<typeof buildDadosFluxogramaUserFromCasarResponse>[0],
				meta,
				{ iraTexto: iraTextoLegacy ?? null }
			);
		} else {
			dadosFluxograma = createDadosFluxogramaUserFromJson(
				fluxogramaData as Record<string, unknown>
			);
		}
	}

	return {
		idUser: Number(json.id_user),
		email: String(json.email ?? ''),
		nomeCompleto: String(json.nome_completo ?? ''),
		dadosFluxograma,
		optativasManuais: parseOptativasManuais(dadosUserRow?.optativas_manuais),
		cargaHorariaIntegralizada: cargaHorariaIntegralizada ?? undefined,
		token: json.token != null ? String(json.token) : null,
		// admin info vem de public.admins via RPC get_my_admin (preenchido no auth.service)
		isAdmin: false,
		adminRole: null,
		adminScopes: []
	};
}

export function userModelToJson(
	user: UserModel,
	options: { includeToken?: boolean; includeDadosFluxograma?: boolean } = {}
): Record<string, unknown> {
	const result: Record<string, unknown> = {
		id_user: user.idUser,
		email: user.email,
		nome_completo: user.nomeCompleto
	};

	if (options.includeToken && user.token) {
		result.token = user.token;
	}

	if (options.includeDadosFluxograma && user.dadosFluxograma) {
		result.dados_users = [
			{
				fluxograma_atual: JSON.stringify(
					dadosFluxogramaUserToJson(user.dadosFluxograma)
				),
				optativas_manuais: (user.optativasManuais ?? []).map((o) => ({
					codigo: o.codigo,
					nivel_alocado: o.nivelAlocado,
					status: o.status,
					nome: o.nome ?? null
				}))
			}
		];
	}

	return result;
}

// ============================================================================
// MateriaModel Factory
// ============================================================================

export function createMateriaModelFromJson(json: Record<string, unknown>): MateriaModel {
	const materiaData = (json.materias as Record<string, unknown>) ?? json;
	const cargaHoraria = Number(materiaData.carga_horaria ?? json.carga_horaria ?? 0);
	// materias_por_curso: nivel e tipo_natureza (0=obrigatória, 1=optativa) vêm do row
	const tn = json.tipo_natureza as number | null | undefined;
	return {
		ementa: String(materiaData.ementa ?? ''),
		idMateria: Number(json.id_materia ?? materiaData.id_materia ?? 0),
		nomeMateria: String(materiaData.nome_materia ?? ''),
		codigoMateria: String(materiaData.codigo_materia ?? ''),
		creditos: cargaHoraria > 0 ? cargaHoraria / 15 : 0,
		nivel: Number(json.nivel ?? 0),
		tipoNatureza: tn !== undefined && tn !== null ? tn : undefined,
		status: materiaData.status != null ? String(materiaData.status) : null,
		mencao: materiaData.mencao != null ? String(materiaData.mencao) : null,
		professor: materiaData.professor != null ? String(materiaData.professor) : null,
		preRequisitos: []
	};
}

// ============================================================================
// PreRequisitoModel Factory (com expressao_original e expressao_logica JSONB)
// ============================================================================

import { getCodigosFromExpressaoLogica } from '$lib/utils/expressao-logica';
import type { ExpressaoLogicaRecursiva } from '$lib/utils/expressao-logica';

/** Regex para código de matéria (ex: MAT0026). */
const CODIGO_MATERIA_REGEX = /^[A-Za-z]{2,}\d{3,}$/;

function parseExpressaoLogica(
	val: unknown
): { materias?: string[]; operador?: 'OU' | 'E' | null } | ExpressaoLogicaRecursiva | null {
	if (val == null) return null;
	if (typeof val === 'string') {
		let s = val.trim();
		// Remove aspas em volta (ex: "MAT0026" ou \"MAT0026\")
		while (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
			s = s.slice(1, -1).trim();
		}
		if (s.length >= 4 && s.startsWith('\\"') && s.endsWith('\\"')) {
			s = s.slice(2, -2).trim();
		}
		if (!s) return null;
		// String que é um único código de matéria -> usar como expressão (não fazer JSON.parse)
		if (CODIGO_MATERIA_REGEX.test(s)) return s.toUpperCase();
		// String que parece JSON
		if (s.startsWith('{') || s.startsWith('[')) {
			try {
				const parsed = JSON.parse(val.trim());
				return parseExpressaoLogica(parsed);
			} catch {
				return null;
			}
		}
		return s.toUpperCase();
	}
	if (typeof val === 'object') {
		const o = val as Record<string, unknown>;
		if ('condicoes' in o && Array.isArray(o.condicoes)) {
			return val as ExpressaoLogicaRecursiva;
		}
		if ('materias' in o) {
			return {
				materias: Array.isArray(o.materias) ? o.materias.map(String) : undefined,
				operador: o.operador === 'OU' || o.operador === 'E' ? o.operador : null
			};
		}
	}
	return null;
}

export function createPreRequisitoModelFromJson(
	json: Record<string, unknown>
): PreRequisitoModel {
	const materias = json.materias as Record<string, unknown> | null | undefined;
	const expressaoLogica = parseExpressaoLogica(json.expressao_logica);
	const codigosFromLogica = expressaoLogica ? getCodigosFromExpressaoLogica(expressaoLogica) : [];
	const codigoFromLogica = codigosFromLogica[0];
	return {
		idPreRequisito: Number(json.id_pre_requisito ?? 0),
		idMateria: Number(json.id_materia ?? 0),
		idMateriaRequisito: json.id_materia_requisito != null ? Number(json.id_materia_requisito) : null,
		codigoMateriaRequisito: String(
			materias?.codigo_materia ?? json.codigo_materia_requisito ?? codigoFromLogica ?? ''
		),
		nomeMateriaRequisito: String(
			materias?.nome_materia ?? json.nome_materia_requisito ?? ''
		),
		expressaoOriginal: json.expressao_original != null ? String(json.expressao_original) : null,
		expressaoLogica: expressaoLogica ?? undefined
	};
}

// ============================================================================
// CoRequisitoModel Factory
// ============================================================================

export function createCoRequisitoModelFromJson(
	json: Record<string, unknown>
): CoRequisitoModel {
	const materias = json.materias as Record<string, unknown> | null | undefined;
	const expressaoLogica = parseExpressaoLogica(json.expressao_logica);
	const codigosFromLogica = expressaoLogica ? getCodigosFromExpressaoLogica(expressaoLogica) : [];
	const codigoFromLogica = codigosFromLogica[0];
	return {
		idCoRequisito: Number(json.id_co_requisito ?? 0),
		idMateria: Number(json.id_materia ?? 0),
		idMateriaCoRequisito: json.id_materia_corequisito != null ? Number(json.id_materia_corequisito) : null,
		codigoMateriaCoRequisito: String(
			materias?.codigo_materia ?? json.codigo_materia_corequisito ?? codigoFromLogica ?? ''
		),
		nomeMateriaCoRequisito: String(
			materias?.nome_materia ?? json.nome_materia_corequisito ?? ''
		),
		expressaoOriginal: json.expressao_original != null ? String(json.expressao_original) : null,
		expressaoLogica: expressaoLogica ?? undefined
	};
}

// ============================================================================
// EquivalenciaModel Factory
// ============================================================================

export function createEquivalenciaModelFromJson(
	json: Record<string, unknown>
): EquivalenciaModel {
	const expressaoLogica = parseExpressaoLogica(json.expressao_logica);
	const expressaoLogicaRecursiva: ExpressaoLogicaRecursiva | undefined =
		expressaoLogica == null
			? undefined
			: typeof expressaoLogica === 'string'
				? expressaoLogica
				: 'condicoes' in expressaoLogica
					? (expressaoLogica as ExpressaoLogicaRecursiva)
					: {
							operador:
								expressaoLogica.operador === 'E' || expressaoLogica.operador === 'OU'
									? expressaoLogica.operador
									: 'OU',
							condicoes: (expressaoLogica.materias ?? []).map((c) => String(c).trim().toUpperCase())
						};
	const codigos = expressaoLogica ? getCodigosFromExpressaoLogica(expressaoLogica) : [];
	const primeiroCodigo = codigos[0] ?? '';
	return {
		idEquivalencia: Number(json.id_equivalencia ?? 0),
		codigoMateriaOrigem: String(json.codigo_materia_origem ?? ''),
		nomeMateriaOrigem: String(json.nome_materia_origem ?? ''),
		codigoMateriaEquivalente: String(json.codigo_materia_equivalente ?? primeiroCodigo),
		nomeMateriaEquivalente: String(json.nome_materia_equivalente ?? ''),
		expressao: String(json.expressao ?? ''),
		expressaoLogica: expressaoLogicaRecursiva,
		idCurso: json.id_curso != null ? Number(json.id_curso) : null,
		nomeCurso: json.nome_curso != null ? String(json.nome_curso) : null,
		matrizCurricular:
			json.matriz_curricular != null ? String(json.matriz_curricular) : null,
		curriculo: json.curriculo != null ? String(json.curriculo) : null,
		dataVigencia: json.data_vigencia != null ? String(json.data_vigencia) : null,
		fimVigencia: json.fim_vigencia != null ? String(json.fim_vigencia) : null
	};
}

// ============================================================================
// CursoModel Factory
// ============================================================================

export function createMinimalCursoModelFromJson(
	json: Record<string, unknown>
): MinimalCursoModel {
	return {
		nomeCurso: String(json.nome_curso ?? ''),
		matrizCurricular: String(json.matriz_curricular ?? ''),
		idCurso: Number(json.id_curso ?? 0),
		creditos: json.creditos != null ? Number(json.creditos) : null,
		tipoCurso: String(json.tipo_curso ?? 'outro'),
		classificacao: String(json.classificacao ?? 'outro')
	};
}

export function createCursoModelFromJson(json: Record<string, unknown>): CursoModel {
	const materiasPorCurso =
		(json.materias_por_curso as Array<Record<string, unknown>>) ?? [];
	const equivalenciasJson =
		(json.equivalencias as Array<Record<string, unknown>>) ?? [];
	const preRequisitosJson =
		(json.pre_requisitos as Array<Record<string, unknown>>) ?? [];
	const coRequisitosJson =
		(json.co_requisitos as Array<Record<string, unknown>>) ?? [];

	const materias = materiasPorCurso.map(createMateriaModelFromJson);

	let maxSemestre = 0;
	for (const materia of materias) {
		if (materia.nivel > maxSemestre) {
			maxSemestre = materia.nivel;
		}
	}

	const allPreRequisitos = preRequisitosJson.map(createPreRequisitoModelFromJson);
	const allCoRequisitos = coRequisitosJson.map(createCoRequisitoModelFromJson);

	const codigoNorm = (c: string) => (c || '').trim().toUpperCase();
	const materiaCodesNorm = new Set(materias.map((m) => codigoNorm(m.codigoMateria)));
	const idsMateriasNoCurso = new Set(materias.map((m) => m.idMateria));
	// Todos os pré-requisitos cuja disciplina-alvo está na matriz (incl. optativas), mesmo que o
	// requisito não apareça na grade — assim equivalências no histórico satisfazem via satisfazPreRequisitos.
	const preRequisitosInCurso = allPreRequisitos.filter((pr) => idsMateriasNoCurso.has(pr.idMateria));

	const coRequisitosInCurso = allCoRequisitos.filter((cr) =>
		materiaCodesNorm.has(codigoNorm(cr.codigoMateriaCoRequisito || ''))
	);

	const curso: CursoModel = {
		nomeCurso: String(json.nome_curso ?? ''),
		matrizCurricular: String(json.matriz_curricular ?? ''),
		idCurso: Number(json.id_curso ?? 0),
		totalCreditos: json.creditos != null ? Number(json.creditos) : null,
		tipoCurso: String(json.tipo_curso ?? ''),
		classificacao: String(json.classificacao ?? ''),
		materias,
		semestres: maxSemestre,
		equivalencias: equivalenciasJson.map(createEquivalenciaModelFromJson),
		preRequisitos: preRequisitosInCurso,
		coRequisitos: coRequisitosInCurso
	};

	populatePrerequisites(curso);

	return curso;
}

/**
 * Populate prerequisites for all materias in a course
 */
function populatePrerequisites(curso: CursoModel): void {
	const codigoNorm = (c: string) => (c || '').trim().toUpperCase();

	for (const materia of curso.materias) {
		materia.preRequisitos = [];
	}

	const materiaMap = new Map<string, MateriaModel>();
	for (const materia of curso.materias) {
		materiaMap.set(codigoNorm(materia.codigoMateria), materia);
	}

	const prerequisiteMap = new Map<string, string[]>();

	for (const preReq of curso.preRequisitos) {
		const targetMateria = curso.materias.find((m) => m.idMateria === preReq.idMateria);
		if (!targetMateria) continue;

		const materiaCode = codigoNorm(targetMateria.codigoMateria);
		const codigosPrereq =
			preReq.expressaoLogica != null
				? getCodigosFromExpressaoLogica(preReq.expressaoLogica)
				: preReq.codigoMateriaRequisito
					? [preReq.codigoMateriaRequisito.trim().toUpperCase()]
					: [];

		if (!prerequisiteMap.has(materiaCode)) {
			prerequisiteMap.set(materiaCode, []);
		}
		const existing = prerequisiteMap.get(materiaCode)!;
		for (const code of codigosPrereq) {
			if (code && !existing.includes(code)) existing.push(code);
		}
	}

	for (const materia of curso.materias) {
		const existingNorm = new Set<string>();
		const directPrerequisites = prerequisiteMap.get(codigoNorm(materia.codigoMateria)) ?? [];

		for (const prereqCode of directPrerequisites) {
			const prereqMateria = materiaMap.get(prereqCode);
			if (prereqMateria && !existingNorm.has(prereqCode)) {
				materia.preRequisitos!.push(prereqMateria);
				existingNorm.add(prereqCode);
			}
		}

		const allPrerequisites = new Set<string>();
		collectAllPrerequisites(codigoNorm(materia.codigoMateria), prerequisiteMap, allPrerequisites);

		for (const prereqCode of allPrerequisites) {
			const prereqMateria = materiaMap.get(prereqCode);
			if (prereqMateria && !existingNorm.has(prereqCode)) {
				materia.preRequisitos!.push(prereqMateria);
				existingNorm.add(prereqCode);
			}
		}
	}
}

function collectAllPrerequisites(
	materiaCode: string,
	prerequisiteMap: Map<string, string[]>,
	collected: Set<string>
): void {
	const directPrereqs = prerequisiteMap.get(materiaCode) ?? [];

	for (const prereqCode of directPrereqs) {
		if (!collected.has(prereqCode)) {
			collected.add(prereqCode);
			collectAllPrerequisites(prereqCode, prerequisiteMap, collected);
		}
	}
}
