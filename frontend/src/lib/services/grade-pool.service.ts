/**
 * Construção do pool do Montador de Grade — compartilhado entre a página do
 * montador e a busca de turmas.
 *
 * Existe porque as duas telas precisam da mesma coisa: transformar códigos de
 * matéria em `MateriaGrade` (matéria + oferta do período + máscaras de horário +
 * avisos de requisito). A busca de turmas ainda depende de `garantirContexto`
 * para funcionar em carregamento direto, sem passar antes pelo montador.
 */
import { authStore } from '$lib/stores/auth';
import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
import {
	gradeStore,
	lerPoolSalvo,
	slotMaskFromHorario,
	type MateriaGrade
} from '$lib/stores/grade.store.svelte';
import { getPeriodoAtivo } from '$lib/services/turmas.service';
import { getMateriasByCodigos, searchMaterias } from '$lib/services/materias.service';
import { buscarSugestoesModuloLivre } from '$lib/services/modulo-livre.service';
import { getOfertaComEquivalencia } from '$lib/services/oferta-turmas.service';
import { satisfazPreRequisitos } from '$lib/types/curso';
import { classificarNatureza, isOptativa } from '$lib/types/materia';
import { setHasCodeIgnoreCase, filtrarNaoCursados } from '$lib/utils/subject-codes';
import { hasConflict, turmaRespeitaTurnos, type Turno } from '$lib/utils/horario-slots';
import { horasParaCreditos } from '$lib/types/matriz';
import {
	saturada,
	type NaturezaCH,
	type SituacaoAcademica
} from '$lib/services/situacao-academica.service';

/**
 * Partes de pré-requisito ainda não cumpridas (código ou, quando o registro não
 * traz código, a expressão do SIGAA). `null` = nada pendente.
 *
 * Vive separado de `calcularRequisitos` porque o aviso inline corta em 3 partes
 * enquanto o pop-up de confirmação precisa da lista inteira — e a avaliação da
 * expressão lógica (AND/OR) não pode ficar duplicada nos dois lugares.
 */
export type NivelPreRequisito = 'em-curso' | 'pendente';

/**
 * Estado do pré-requisito em três níveis, com as partes que faltam.
 *
 * `docs/unb-domain.md:26` diz que MATR não desbloqueia pré-requisito; o Motor 2
 * monta `completedPlusMatr` e recomenda com base nisso. Os dois estão certos no
 * próprio quadro, e escolher um em silêncio foi o erro anterior: ora o app dizia
 * "pendente" numa recomendação legítima do backend, ora não dizia nada sobre uma
 * dependência que ainda pode falhar.
 *
 * O padrão é não decidir escondido:
 * - `null`  → cumprido só com aprovadas (inclui equivalência)
 * - `em-curso` → só fecha contando o que ele cursa agora; depende de passar
 * - `pendente` → não fecha nem assim
 *
 * Nenhum bloqueia: quem chama decide o que fazer com o aviso.
 */
function estadoPreRequisito(
	idMateria: number
): { nivel: NivelPreRequisito; partes: string[] } | null {
	const curso = fluxogramaStore.state.courseData;
	const concluidas = fluxogramaStore.completedCodes;
	const emCurso = fluxogramaStore.currentCodes ?? new Set<string>();
	const comEmCurso = new Set([...concluidas, ...emCurso]);

	const prereqs = (curso?.preRequisitos ?? []).filter((pr) => pr.idMateria === idMateria);
	if (prereqs.length === 0 || satisfazPreRequisitos(prereqs, concluidas)) return null;

	// Fecha quando entram as em curso? Então é dependência encaminhada, não pendência.
	const nivel: NivelPreRequisito = satisfazPreRequisitos(prereqs, comEmCurso)
		? 'em-curso'
		: 'pendente';
	// No nível "em curso" o que interessa mostrar é a matéria de que ele depende;
	// no "pendente", o que ainda falta por completo.
	const base = nivel === 'em-curso' ? concluidas : comEmCurso;

	const partes = new Set<string>();
	for (const pr of prereqs) {
		const code = pr.codigoMateriaRequisito?.trim();
		if (code) {
			if (!setHasCodeIgnoreCase(base, code)) partes.add(code);
		} else if (pr.expressaoOriginal?.trim()) {
			partes.add(pr.expressaoOriginal.trim());
		}
	}
	return { nivel, partes: [...partes] };
}

/**
 * Partes ainda não cumpridas, contando o que ele cursa agora — é a lista que o
 * pop-up de confirmação mostra. `null` = nada a avisar.
 */
function partesPreRequisitoPendentes(idMateria: number): string[] | null {
	const estado = estadoPreRequisito(idMateria);
	return estado === null || estado.nivel === 'em-curso' ? null : estado.partes;
}

/**
 * Requisitos da matéria a partir do courseData: aviso de pré-requisito pendente
 * (não bloqueia) e lista de co-requisitos. Só resolve p/ matérias da matriz —
 * optativas de fora não têm essas regras no courseData e passam sem aviso.
 */
export function calcularRequisitos(idMateria: number): {
	avisoPreRequisito: string | null;
	nivelPreRequisito: NivelPreRequisito | null;
	coRequisitos: string[];
} {
	const curso = fluxogramaStore.state.courseData;
	const completed = fluxogramaStore.completedCodes;
	const current = fluxogramaStore.currentCodes ?? new Set<string>();

	const estado = estadoPreRequisito(idMateria);
	const avisoPreRequisito =
		estado === null
			? null
			: estado.partes.length > 0
				? estado.partes.slice(0, 3).join(' · ')
				: 'requisitos não cumpridos';

	const coRequisitos = [
		...new Set(
			(curso?.coRequisitos ?? [])
				.filter((cr) => cr.idMateria === idMateria)
				.map((cr) => cr.codigoMateriaCoRequisito?.trim())
				.filter((c): c is string => !!c && !setHasCodeIgnoreCase(completed, c) && !current.has(c))
		)
	];

	return { avisoPreRequisito, nivelPreRequisito: estado?.nivel ?? null, coRequisitos };
}

/**
 * Natureza da matéria (obrigatória / optativa / módulo livre) pelo código, na
 * mesma regra do fluxograma: o que não está na matriz é módulo livre.
 */
export function naturezaDoCodigo(codigo: string): 'obrigatoria' | 'optativa' | 'modulo_livre' {
	const alvo = codigo.trim().toUpperCase();
	const m = (fluxogramaStore.state.courseData?.materias ?? []).find(
		(x) => x.codigoMateria.trim().toUpperCase() === alvo
	);
	return classificarNatureza(m);
}

/**
 * Optativas que ainda destravam alguma obrigatória **pendente**.
 *
 * `fluxogramaStore.optatorias` mapeia toda optativa que é pré-requisito de
 * obrigatória, sem olhar se o aluno já cursou a obrigatória em questão. Uma
 * optativa que só destrava o que ele já fez é peso morto: manter o privilégio
 * dela custaria o lugar de uma matéria que ainda conta.
 */
function optatoriasVivas(): Set<string> {
	const optatorias = fluxogramaStore.optatorias;
	if (!optatorias || optatorias.size === 0) return new Set();

	// Normaliza as concluídas UMA vez. `setHasCodeIgnoreCase` materializa o Set
	// inteiro num array sempre que o `has` direto falha — e falhar é o caso comum
	// aqui, já que a obrigatória que interessa é justamente a que ele ainda não
	// cursou. Com centenas de concluídas isso custaria uma varredura por par.
	const concluidas = new Set(
		[...fluxogramaStore.completedCodes].map((c) => c.trim().toUpperCase())
	);

	const vivas = new Set<string>();
	for (const [optativa, exigidaPor] of optatorias) {
		if (exigidaPor.some((c) => !concluidas.has(c.trim().toUpperCase()))) vivas.add(optativa);
	}
	return vivas;
}

/** Resolve códigos → matéria + turmas (courseData primeiro; senão banco). */
export async function construirMateriasGrade(
	codigos: string[],
	periodo: string
): Promise<MateriaGrade[]> {
	const cods = [...new Set(codigos.map((c) => c.trim().toUpperCase()).filter(Boolean))];
	if (cods.length === 0) return [];

	const courseMap = new Map(
		(fluxogramaStore.state.courseData?.materias ?? []).map((m) => [
			m.codigoMateria.trim().toUpperCase(),
			m
		])
	);

	const resolved = new Map<string, { idMateria: number; nome: string; creditos: number }>();
	const faltantes: string[] = [];
	for (const c of cods) {
		const mm = courseMap.get(c);
		if (mm)
			resolved.set(c, { idMateria: mm.idMateria, nome: mm.nomeMateria, creditos: mm.creditos });
		else faltantes.push(c);
	}
	if (faltantes.length > 0) {
		const extra = await getMateriasByCodigos(faltantes);
		for (const e of extra) {
			resolved.set(e.codigo.trim().toUpperCase(), {
				idMateria: e.idMateria,
				nome: e.nome,
				creditos: e.creditos
			});
		}
	}

	// Equivalência (matéria que mudou de código) resolvida no serviço compartilhado —
	// mesma regra que a aba Turmas do fluxograma e o painel de /disciplinas usam.
	// Spec: docs/superpowers/specs/2026-08-03-equivalencias-oferta-turmas-design.md
	const ofertaPorCodigo = await getOfertaComEquivalencia(
		[...resolved].map(([codigo, r]) => ({ codigo, idMateria: r.idMateria })),
		fluxogramaStore.state.courseData?.equivalencias ?? [],
		periodo
	);

	const out: MateriaGrade[] = [];
	const vivas = optatoriasVivas();
	for (const [codigo, r] of resolved) {
		const { avisoPreRequisito, nivelPreRequisito, coRequisitos } = calcularRequisitos(r.idMateria);
		out.push({
			codigo,
			nome: r.nome,
			creditos: r.creditos,
			idMateria: r.idMateria,
			avisoPreRequisito,
			nivelPreRequisito,
			coRequisitos,
			// Sem isto a montagem automática não distingue obrigatória de optativa e
			// vira um maximizador de contagem — ver a escada de pesos em grade.store.
			natureza: naturezaDoCodigo(codigo),
			// Carimbado aqui, e não na montagem, porque é fato sobre a matéria: é o
			// que impede a optativa que destrava uma obrigatória de ser descartada
			// junto com as demais quando a carga optativa do aluno já fechou.
			optatoria: vivas.has(codigo),
			// Semestre na matriz: a montagem prefere a mais atrasada dentro do mesmo
			// degrau (`fatorAtraso`). Optativa vem com 0 e não ganha nada.
			nivel: courseMap.get(codigo)?.nivel || undefined,
			turmas: (ofertaPorCodigo.get(codigo) ?? []).map(({ turma, codigoOfertado }) => ({
				turma,
				mask: slotMaskFromHorario(turma.horario),
				codigoOfertado
			}))
		});
	}
	return out;
}

/**
 * O que a semeadura trouxe para a lista — e o que não pôde trazer.
 *
 * Já não separa "do plano" de "da matriz": a fonte agora é sempre a matriz do
 * aluno, e o plano de formatura só desempata a ordem.
 */
export interface SemeaduraResultado {
	/** Códigos que entraram na lista agora. */
	adicionadas: string[];
	/** Obrigatórias que faltam ao aluno e não têm turma neste período. */
	obrigatoriasSemOferta: string[];
	/**
	 * Naturezas deixadas de fora por já estarem cumpridas.
	 *
	 * Chega até a view para o aviso da montagem poder dizer o porquê: uma lista sem
	 * optativas, sem explicação, parece defeito — e o aluno tem todo o direito de
	 * discordar e adicionar uma na mão.
	 */
	naturezasSaturadas?: NaturezaCH[];
	/** Pendentes da matriz sem turma no período — ver `PoolRecomendado`. */
	pendentesSemOferta?: number;
}

/**
 * O que quem pede a semeadura (o Passo 1 do wizard) pode ajustar. Ausente = o
 * limite do plano de formatura e o escopo `periodo-atual`, como sempre foi.
 */
export interface OpcoesSemeadura {
	limiteCreditos?: number;
	escopo?: 'periodo-atual' | 'todas-pendentes';
}

/**
 * Candidatas da matriz, para quando o plano não tem matéria concreta a semear.
 *
 * Acontece mais do que parece: o semestre recomendado pode vir só com
 * `optativa_slot`/`complementar_slot` (que não têm código), o `gerar()` do plano
 * pode ter falhado, ou tudo que ele recomendou já foi cursado. Sem uma segunda
 * fonte, "Montar grade" não tem o que montar e o aluno leva um aviso no lugar de
 * uma grade.
 *
 * Só volta matéria **com turma no período** — sem oferta ela não entra na grade de
 * jeito nenhum. A ordem é a de utilidade para quem quer se formar: requisito
 * cumprido antes de pendente, obrigatória antes de optativa e, dentro disso, o
 * nível mais baixo primeiro (a matéria mais atrasada).
 */
export async function candidatosDaMatriz(
	periodo: string,
	excluir: Iterable<string> = []
): Promise<MateriaGrade[]> {
	const { obrigatorias, optativas } = await candidatosClassificados(periodo, excluir);
	return [...obrigatorias, ...optativas].map((c) => c.materia);
}

/**
 * Posição de quem o plano não citou. Um número grande e FINITO de propósito:
 * `Infinity - Infinity` é `NaN`, e um `NaN` no comparador só não estraga a ordem
 * por acidente (é falsy, então o `||` cai no critério seguinte).
 */
const SEM_PLANO = Number.MAX_SAFE_INTEGER;

/** Uma candidata da matriz com tudo que a ordenação precisa saber sobre ela. */
interface CandidatoMatriz {
	materia: MateriaGrade;
	/** Pendente de verdade vai para o fim; dependência em curso fica no meio. */
	requisitoPendente: 0 | 1 | 2;
	/** Optativa que é pré-requisito de obrigatória — na prática, obrigatória disfarçada. */
	optatoria: boolean;
	/** Semestre esperado na matriz; a mais atrasada primeiro. */
	nivel: number;
	/** Posição no semestre recomendado do plano, ou `SEM_PLANO` se ele não citou. */
	ordemPlano: number;
}

/**
 * As matérias da matriz que ainda faltam, separadas por natureza e já ordenadas
 * por utilidade para quem quer se formar.
 *
 * Só volta matéria **com turma no período** — sem oferta ela não vira bloco no
 * calendário. As obrigatórias que caem por esse filtro saem em
 * `obrigatoriasSemOferta` em vez de sumirem caladas: "a obrigatória que te falta
 * não é ofertada neste semestre" é informação que muda o planejamento do aluno.
 *
 * `ordemDoPlano` é o semestre recomendado do plano de formatura. Ele NÃO decide
 * quem entra — só desempata entre matérias do mesmo grupo. Foi de lá que saíam as
 * "matérias nada a ver": o plano pode recomendar código que não está na matriz do
 * aluno, e isso entrava na lista como módulo livre.
 */
async function candidatosClassificados(
	periodo: string,
	excluir: Iterable<string> = [],
	ordemDoPlano: string[] = []
): Promise<{
	obrigatorias: CandidatoMatriz[];
	optativas: CandidatoMatriz[];
	obrigatoriasSemOferta: string[];
	/** Pendentes da matriz sem turma no período — obrigatórias e optativas. */
	pendentesSemOferta: number;
}> {
	const vazio = () => ({
		obrigatorias: [],
		optativas: [],
		obrigatoriasSemOferta: [],
		pendentesSemOferta: 0
	});
	const matriz = fluxogramaStore.state.courseData?.materias ?? [];
	if (matriz.length === 0) return vazio();

	const fora = new Set([...excluir].map((c) => c.trim().toUpperCase()));
	const codigos = filtrarNaoCursados(
		matriz.map((m) => m.codigoMateria).filter((c) => !fora.has(c.trim().toUpperCase())),
		fluxogramaStore.completedCodes,
		fluxogramaStore.currentCodes ?? new Set<string>()
	);
	if (codigos.length === 0) return vazio();

	const daMatriz = new Map(matriz.map((m) => [m.codigoMateria.trim().toUpperCase(), m]));
	const posicaoNoPlano = new Map(
		ordemDoPlano.map((c, i) => [c.trim().toUpperCase(), i] as const)
	);

	const obrigatorias: CandidatoMatriz[] = [];
	const optativas: CandidatoMatriz[] = [];
	const obrigatoriasSemOferta: string[] = [];

	/**
	 * Pendentes da matriz que não têm turma neste período — obrigatórias E
	 * optativas. É o número que explica a lista vazia de quem está no fim do
	 * curso: a matriz ainda tem dezenas de matérias, mas nenhuma é ofertada agora.
	 */
	let pendentesSemOferta = 0;

	for (const m of await construirMateriasGrade(codigos, periodo)) {
		const info = daMatriz.get(m.codigo);
		const optativa = !!info && isOptativa(info);
		if (m.turmas.length === 0) {
			pendentesSemOferta++;
			// Optativa sem oferta é rotina e não vale aviso; obrigatória é notícia.
			if (!optativa) obrigatoriasSemOferta.push(m.codigo);
			continue;
		}
		(optativa ? optativas : obrigatorias).push({
			materia: m,
			requisitoPendente:
				m.nivelPreRequisito === 'pendente' ? 2 : m.nivelPreRequisito === 'em-curso' ? 1 : 0,
			// Já carimbado em `construirMateriasGrade`, e lá a regra é mais estrita:
			// só conta a optativa que destrava obrigatória ainda PENDENTE.
			optatoria: optativa && m.optatoria === true,
			// Optativa tem nivel 0 na matriz; a separação por natureza já cuidou disso.
			nivel: info?.nivel ?? 99,
			ordemPlano: posicaoNoPlano.get(m.codigo) ?? SEM_PLANO
		});
	}

	const porUtilidade = (a: CandidatoMatriz, b: CandidatoMatriz): number =>
		a.requisitoPendente - b.requisitoPendente ||
		Number(b.optatoria) - Number(a.optatoria) ||
		a.ordemPlano - b.ordemPlano ||
		a.nivel - b.nivel ||
		a.materia.codigo.localeCompare(b.materia.codigo);

	obrigatorias.sort(porUtilidade);
	optativas.sort(porUtilidade);

	return { obrigatorias, optativas, obrigatoriasSemOferta, pendentesSemOferta };
}

/**
 * Escolhe, na ordem recebida, o maior prefixo viável: matérias que cabem na grade
 * atual sem conflito de horário e sem estourar o limite de créditos do aluno.
 *
 * Existe para a semeadura não jogar a matriz inteira na lista. `montarAutomatico`
 * maximiza matérias e **não** conhece limite de créditos — semear 70 matérias faria
 * ele empacotar a semana toda e devolver o dobro do limite. Escolhendo aqui um
 * conjunto que já é comprovadamente compatível (mesma máscara, mesmos turnos), a
 * montagem seguinte consegue alocar todas: o ótimo dela é, no mínimo, este conjunto.
 *
 * Parte do que já está selecionado — assim a semeadura complementa a grade em vez
 * de ignorá-la.
 */
export function escolherAteOLimite(
	candidatos: MateriaGrade[],
	limiteCreditos: number
): MateriaGrade[] {
	return escolherComOrcamento(candidatos, limiteCreditos, {
		mask: gradeStore.combinedMask,
		creditos: gradeStore.creditosSelecionados,
		turnos: gradeStore.turnosPermitidos
	});
}

/** Ponto de partida da escolha: o que a grade já ocupa e o filtro de turno. */
export interface OrcamentoInicial {
	/** Horários já tomados. */
	mask: bigint;
	/** Créditos já gastos. */
	creditos: number;
	/** Turnos que o aluno aceita. */
	turnos: Set<Turno>;
}

const TODOS_OS_TURNOS = new Set<Turno>(['M', 'T', 'N']);

/**
 * O mesmo prefixo viável de `escolherAteOLimite`, mas partindo de um orçamento
 * explícito em vez do estado do `gradeStore`.
 *
 * A semeadura precisa disso porque roda ANTES do `init` do store, na primeira
 * carga da página: ali não existe seleção nem filtro de turno de onde partir, e
 * ler o store devolveria o estado da visita anterior.
 */
function escolherComOrcamento(
	candidatos: MateriaGrade[],
	limiteCreditos: number,
	base: OrcamentoInicial,
	/**
	 * Teto adicional de créditos por natureza, quando se sabe quanto falta de cada
	 * uma. Ausente = só o limite global, que é o comportamento de sempre.
	 */
	tetoPorNatureza?: Partial<Record<NaturezaCH, number>>
): MateriaGrade[] {
	const escolhidas: MateriaGrade[] = [];
	let mask = base.mask;
	let creditos = base.creditos;
	const gastoPorNatureza = new Map<NaturezaCH, number>();

	for (const m of candidatos) {
		if (creditos + m.creditos > limiteCreditos) continue; // pode caber uma menor adiante

		// Optatória escapa do teto da natureza dela: ela não está ali para fechar
		// carga optativa, e sim para destravar uma obrigatória. Matéria sem natureza
		// resolvida também escapa — herdar o teto da optativa faria a lista descartar
		// em silêncio matéria que talvez nem seja optativa, por falta de dado.
		const teto = m.optatoria === true || !m.natureza ? undefined : tetoPorNatureza?.[m.natureza];
		if (teto !== undefined) {
			const gasto = gastoPorNatureza.get(m.natureza!) ?? 0;
			if (gasto + m.creditos > teto) continue;
		}

		const turma = m.turmas.find(
			(t) => turmaRespeitaTurnos(t.mask, base.turnos) && !hasConflict(t.mask, mask)
		);
		if (!turma) continue;
		mask |= turma.mask;
		creditos += m.creditos;
		if (m.optatoria !== true && m.natureza) {
			gastoPorNatureza.set(m.natureza, (gastoPorNatureza.get(m.natureza) ?? 0) + m.creditos);
		}
		escolhidas.push(m);
	}

	return escolhidas;
}

/**
 * Quanto de cada natureza vale a pena semear, dado o que ainda falta ao aluno.
 *
 * Semear cinco optativas para quem precisa de duas não é generosidade: as três a
 * mais empurram para fora da lista a obrigatória que ele ainda deve. Obrigatória
 * fica de fora do teto de propósito — quem manda nela é a lista de pendentes da
 * matriz, não a conta de horas (as duas divergem em quem mudou de matriz).
 *
 * Sem situação, devolve `undefined`: nenhum teto, o comportamento de antes.
 */
function tetoPorNatureza(
	situacao: SituacaoAcademica | undefined
): Partial<Record<NaturezaCH, number>> | undefined {
	if (!situacao) return undefined;

	const teto: Partial<Record<NaturezaCH, number>> = {};
	for (const natureza of ['optativa', 'modulo_livre'] as const) {
		const faltam = situacao.faltam[natureza];
		// `null` é "não sei quanto falta" — e não saber não pode virar um teto.
		if (faltam === null) continue;
		teto[natureza] = Math.max(0, horasParaCreditos(faltam));
	}
	return teto;
}

/** O que a semeadura devolve: a lista pronta e o que ficou de fora, com o motivo. */
export interface PoolRecomendado {
	/** Em curso primeiro, depois obrigatórias, depois optativas — na ordem de entrada. */
	materias: MateriaGrade[];
	/** Obrigatórias pendentes da matriz que não têm turma no período. */
	obrigatoriasSemOferta: string[];
	/**
	 * Naturezas que ficaram de fora por já estarem cumpridas.
	 *
	 * Existe para a tela poder dizer o porquê: "sumiram as optativas" sem
	 * explicação parece bug, e o aluno tem o direito de discordar e adicionar uma
	 * na mão.
	 */
	naturezasSaturadas: NaturezaCH[];
	/**
	 * Quantas matérias que o aluno ainda deve não têm turma neste período.
	 *
	 * É a informação que explica a lista vazia de quem está no fim do curso: a
	 * matriz ainda tem dezenas de pendências, e nenhuma delas é ofertada agora.
	 * Sem esse número a tela culpa o filtro de "matérias em curso" e manda o aluno
	 * mexer num botão que não muda nada.
	 */
	pendentesSemOferta: number;
}

/**
 * Monta a lista que o Montador recomenda — direto da **matriz do aluno**.
 *
 * A ordem não é arbitrária, é a de quem quer se formar:
 *
 * 1. **Matérias em curso (MATR).** Entram sempre, antes de tudo e sem passar por
 *    filtro nenhum: matrícula é fato consumado, não recomendação. O crédito delas
 *    é debitado do orçamento antes de o app sugerir qualquer coisa — recomendar 24
 *    créditos por cima de 12 já cursados dá uma grade impossível de se matricular.
 * 2. **Obrigatórias pendentes** com turma no período, a mais atrasada (menor
 *    `nivel`) primeiro. Quem tem pré-requisito que não fecha nem com o que ele
 *    cursa agora fica de fora (dependência "em curso" entra, depois das livres).
 * 3. **Optativas**, só com o crédito que sobrar — e entre elas, primeiro as que
 *    destravam alguma obrigatória (as "optatórias").
 *
 * O plano de formatura entra apenas como desempate (`ordemDoPlano`). Ele era a
 * fonte da semeadura e é de lá que vinham as "matérias nada a ver": o plano pode
 * recomendar código fora da matriz, que entrava na lista como módulo livre. Agora
 * matéria de fora só entra se o aluno adicionar na mão.
 */
export async function montarPoolRecomendado(
	periodo: string,
	opts: {
		limiteCreditos: number;
		/** Semestre recomendado do plano de formatura — só desempata a ordem. */
		ordemDoPlano?: string[];
		/** Códigos que não devem voltar (lixeira do aluno) ou que já estão na lista. */
		excluir?: Iterable<string>;
		/** O que a grade já ocupa. Ausente = lista partindo do zero. */
		base?: OrcamentoInicial;
		/**
		 * O que ainda falta ao aluno, por natureza. Ausente — integralização que
		 * falhou, ou tela que não a carrega — semeia como sempre semeou.
		 */
		situacao?: SituacaoAcademica;
		/**
		 * As matérias em curso vão ocupar a grade? Ligado (o padrão), o crédito
		 * delas sai do orçamento antes de recomendarmos qualquer coisa.
		 *
		 * Desligado, elas continuam na lista — o modo esconde da grade, não apaga a
		 * matrícula — mas param de consumir o orçamento, porque não vão ocupar vaga
		 * nenhuma. Sem essa distinção, quem já cursa perto do teto abria o Montador,
		 * desligava as em curso para ver o que mais podia pegar, e recebia uma lista
		 * só com as próprias matérias em curso: o orçamento tinha sido gasto por
		 * matérias que nem iam entrar.
		 */
		cursandoOcupaOrcamento?: boolean;
		/**
		 * `periodo-atual` (o padrão) semeia só o prefixo que cabe no limite — a
		 * lista já é uma grade viável. `todas-pendentes` põe na lista TODA
		 * obrigatória pendente com turma no turno aceito (e as optatórias), sem
		 * cortar por crédito: quem escolhe dentro do limite é o solver, que enxerga
		 * as alternativas em vez de receber um único encaixe pronto. Optativas
		 * comuns continuam pelo orçamento — semear dezenas delas só enche a lista.
		 */
		escopo?: 'periodo-atual' | 'todas-pendentes';
	}
): Promise<PoolRecomendado> {
	const base = opts.base ?? { mask: 0n, creditos: 0, turnos: TODOS_OS_TURNOS };
	const fora = new Set([...(opts.excluir ?? [])].map((c) => c.trim().toUpperCase()));

	// Em curso: entram inteiras, mesmo sem oferta no período. Uma MATR sem turma
	// publicada continua sendo uma matéria que o aluno cursa — escondê-la da lista
	// é justamente o bug que este caminho existe para não repetir.
	const emCurso = [...(fluxogramaStore.currentCodes ?? new Set<string>())].filter(
		(c) => !fora.has(c.trim().toUpperCase())
	);
	const materiasEmCurso = await construirMateriasGrade(emCurso, periodo);

	// Só o crédito é debitado, não o horário: a turma real da matrícula é escolhida
	// depois (`preencherTurmasReais`), então travar a máscara numa turma qualquer
	// bloquearia horários que a matéria talvez nem ocupe.
	//
	// E só quando elas de fato vão para a grade: com o modo "sem as cursando"
	// ligado, cobrar o crédito de quem não vai ocupar vaga é o que deixava o aluno
	// sem nenhuma sugestão na tela que ele abriu justamente para ver o que pegar.
	const creditosEmCurso =
		opts.cursandoOcupaOrcamento === false
			? 0
			: materiasEmCurso.reduce((acc, m) => acc + m.creditos, 0);

	const { obrigatorias, optativas, obrigatoriasSemOferta, pendentesSemOferta } =
		await candidatosClassificados(
		periodo,
		[...fora, ...emCurso],
		opts.ordemDoPlano ?? []
	);

	// Natureza cumprida sai da recomendação — mas a optatória fica: ela não está na
	// lista para fechar carga optativa, e sim para destravar uma obrigatória.
	// Obrigatória nunca é filtrada aqui: quem diz se ainda falta obrigatória é esta
	// lista de pendentes, não a conta de horas do histórico.
	const naturezasSaturadas: NaturezaCH[] = (['optativa', 'modulo_livre'] as const).filter((n) =>
		saturada(opts.situacao ?? null, n)
	);
	const candidatas = [...obrigatorias, ...optativas]
		.map((c) => c.materia)
		// Pré-requisito que não fecha nem com o que ele cursa agora: a matrícula seria
		// recusada, então não é recomendação. O aluno ainda pode adicioná-la na mão.
		.filter((m) => m.nivelPreRequisito !== 'pendente')
		.filter(
			(m) =>
				m.optatoria === true ||
				!m.natureza ||
				!naturezasSaturadas.includes(m.natureza as NaturezaCH)
		);

	const orcamentoBase = { ...base, creditos: base.creditos + creditosEmCurso };
	let recomendadas: MateriaGrade[];
	if (opts.escopo === 'todas-pendentes') {
		// Tudo que conta para a formatura e tem turma num turno aceito entra; o
		// solver corta pelo limite depois. O resto (optativa comum) pelo orçamento.
		const ehNucleo = (m: MateriaGrade) => m.natureza === 'obrigatoria' || m.optatoria === true;
		const nucleo = candidatas.filter(
			(m) => ehNucleo(m) && m.turmas.some((t) => turmaRespeitaTurnos(t.mask, base.turnos))
		);
		const resto = escolherComOrcamento(
			candidatas.filter((m) => !ehNucleo(m)),
			opts.limiteCreditos,
			orcamentoBase,
			tetoPorNatureza(opts.situacao)
		);
		recomendadas = [...nucleo, ...resto];
	} else {
		recomendadas = escolherComOrcamento(
			candidatas,
			opts.limiteCreditos,
			orcamentoBase,
			tetoPorNatureza(opts.situacao)
		);
	}

	return {
		materias: [...materiasEmCurso, ...recomendadas],
		obrigatoriasSemOferta,
		naturezasSaturadas,
		pendentesSemOferta
	};
}

/**
 * Candidatas a módulo livre sobre um tema, com turma no período.
 *
 * Módulo livre é definido por AUSÊNCIA — é o que não está na matriz do aluno —,
 * o que na prática significa o catálogo inteiro da UnB. Por isso a função exige
 * um tema em vez de aceitar "me sugira": sem um recorte não existe recomendação,
 * existe uma listagem em ordem de código fingindo ser uma.
 *
 * A busca é a mesma do catálogo global (`searchMaterias`, por código e nome).
 * Casa com o vocabulário do aluno até onde o nome da matéria alcança; procurar
 * por afinidade de assunto ("quero algo de robótica") é o que o chat da Darcy faz
 * com busca semântica, e continua sendo o caminho para isso.
 *
 * Devolve lista vazia — nunca lança — quando não há tema ou nada sobra.
 */
export async function candidatosModuloLivre(
	tema: string,
	periodo: string,
	excluir: Iterable<string> = []
): Promise<MateriaGrade[]> {
	const termo = tema.trim();
	if (termo.length < 2) return [];

	// Busca semântica primeiro: quem digita "robótica" não quer só as matérias com
	// "robótica" no nome, e módulo livre se escolhe por interesse. A busca literal
	// do catálogo fica de reserva para quando o backend não responde — sem ela, uma
	// queda de rede transformaria "não consegui procurar" em "não existe nada".
	let codigosAchados: string[] = [];
	const semantica = await buscarSugestoesModuloLivre(termo);
	if (!semantica.falhou) {
		codigosAchados = semantica.materias.map((m) => m.codigo);
	} else {
		try {
			codigosAchados = (await searchMaterias(termo)).map((m) => m.codigo);
		} catch {
			return []; // a tela avisa que não deu para buscar; não é erro de tela
		}
	}
	const achados = codigosAchados.map((codigo) => ({ codigo }));
	if (achados.length === 0) return [];

	const daMatriz = new Set(
		(fluxogramaStore.state.courseData?.materias ?? []).map((m) =>
			m.codigoMateria.trim().toUpperCase()
		)
	);
	const fora = new Set([...excluir].map((c) => c.trim().toUpperCase()));

	// Fora da matriz é o que define módulo livre; o resto é higiene: não sugerir o
	// que ele já cursou, já cursa, ou já pôs na lista.
	const codigos = filtrarNaoCursados(
		achados
			.map((a) => a.codigo.trim().toUpperCase())
			.filter((c) => !daMatriz.has(c) && !fora.has(c)),
		fluxogramaStore.completedCodes,
		fluxogramaStore.currentCodes ?? new Set<string>()
	);
	if (codigos.length === 0) return [];

	// Sem turma no período a matéria não vira bloco no calendário — não há grade a
	// montar com ela, então sugeri-la só gastaria o tempo do aluno.
	return (await construirMateriasGrade(codigos, periodo)).filter((m) => m.turmas.length > 0);
}

/**
 * Motivo pelo qual a matéria não deve entrar no pool, ou `null` se pode entrar.
 *
 * Avisa em vez de adicionar em silêncio: o aluno pode estar buscando pelo nome e
 * não perceber que é a mesma matéria que já cursou (ou que está cursando agora).
 */
export function motivoParaNaoAdicionar(codigo: string): string | null {
	const c = codigo.trim().toUpperCase();
	if (setHasCodeIgnoreCase(fluxogramaStore.completedCodes, c)) {
		return `Você já foi aprovado em ${c}.`;
	}
	if (setHasCodeIgnoreCase(fluxogramaStore.currentCodes ?? new Set<string>(), c)) {
		return `Você já está cursando ${c} neste semestre.`;
	}
	return null;
}

/** Pré-requisitos que o aluno ainda não cumpriu para uma matéria. */
export interface PendenciaPreRequisito {
	/** Código normalizado da matéria que ele quer adicionar. */
	codigo: string;
	/** Nome da matéria, quando conhecido (vem do courseData). */
	nome: string;
	/** Códigos — ou expressões, quando o registro não tem código — ainda não cumpridos. */
	faltantes: string[];
	/** Regra como o SIGAA escreve, ex.: "CIC0004 E MAT0025". */
	expressaoOriginal: string | null;
}

/**
 * Nome da matéria pelo código, para exibição.
 *
 * Consulta a matriz primeiro e, se o código não estiver nela, cai no
 * `nomeMateriaRequisito` dos pré-requisitos — pré-requisito de outro
 * departamento costuma não fazer parte da matriz do aluno.
 */
export function nomeDoCodigo(codigo: string): string | null {
	const alvo = codigo.trim().toUpperCase();
	if (!alvo) return null;

	const curso = fluxogramaStore.state.courseData;
	const materia = (curso?.materias ?? []).find(
		(m) => m.codigoMateria.trim().toUpperCase() === alvo
	);
	if (materia?.nomeMateria?.trim()) return materia.nomeMateria.trim();

	const pr = (curso?.preRequisitos ?? []).find(
		(p) => p.codigoMateriaRequisito?.trim().toUpperCase() === alvo
	);
	return pr?.nomeMateriaRequisito?.trim() || null;
}

/**
 * Pendência de pré-requisito da matéria, ou `null` quando não há o que avisar.
 *
 * Serve a todos os caminhos de adição (busca do montador, chat da Darcy, busca de
 * turmas): o aviso é advisory de propósito — quem está cursando o pré-requisito
 * agora tem motivo legítimo para seguir —, então quem chama decide o que fazer
 * com o resultado em vez de receber um bloqueio.
 *
 * Devolve `null` para matéria fora da matriz (módulo livre): o courseData não tem
 * as regras dela e afirmar "faltam pré-requisitos" ali seria mentira.
 */
export function pendenciaPreRequisito(codigo: string): PendenciaPreRequisito | null {
	const alvo = codigo.trim().toUpperCase();
	if (!alvo) return null;

	const curso = fluxogramaStore.state.courseData;
	const materia = (curso?.materias ?? []).find(
		(m) => m.codigoMateria.trim().toUpperCase() === alvo
	);
	if (!materia) return null;

	const faltantes = partesPreRequisitoPendentes(materia.idMateria);
	if (faltantes === null) return null;

	// Um mesmo idMateria pode ter vários registros repetindo a mesma expressão
	// (o backend devolve a regra expandida) — daí o dedupe.
	const expressoes = [
		...new Set(
			(curso?.preRequisitos ?? [])
				.filter((pr) => pr.idMateria === materia.idMateria)
				.map((pr) => pr.expressaoOriginal?.trim())
				.filter((e): e is string => !!e)
		)
	];

	return {
		codigo: alvo,
		nome: materia.nomeMateria?.trim() || alvo,
		faltantes,
		expressaoOriginal: expressoes.length > 0 ? expressoes.join(' · ') : null
	};
}

/**
 * Versão em lote, para quem adiciona várias matérias de uma vez (ação
 * `[MONTAR_GRADE|...]` do chat, semeadura).
 *
 * Um diálogo por matéria seria uma fila de pop-ups; devolvendo tudo junto o aluno
 * vê de uma vez o que está pendente. Preserva a ordem de entrada, ignora código
 * repetido e já descarta quem não tem pendência.
 */
export function pendenciasPreRequisito(codigos: string[]): PendenciaPreRequisito[] {
	const vistos = new Set<string>();
	const out: PendenciaPreRequisito[] = [];

	for (const codigo of codigos) {
		const alvo = codigo?.trim().toUpperCase();
		if (!alvo || vistos.has(alvo)) continue;
		vistos.add(alvo);

		const pendencia = pendenciaPreRequisito(alvo);
		if (pendencia) out.push(pendencia);
	}

	return out;
}

/** Estado do contexto compartilhado do montador. */
export type ContextoGrade = { periodo: string } | null;

let contextoEmVoo: Promise<ContextoGrade> | null = null;

/**
 * Garante que o `gradeStore` está utilizável fora da página do montador.
 *
 * O store só era inicializado ao montar `/planejamento/grade`; num carregamento
 * direto de `/planejamento/turmas` o `idUser`/`periodo` ficam nulos, `persistPool`
 * vira no-op e qualquer adição sumiria em silêncio. Aqui carregamos courseData,
 * período e o pool salvo, e chamamos `init`.
 *
 * Idempotente e à prova de chamadas concorrentes: se já há um carregamento em
 * curso, devolve a mesma promessa.
 */
export function garantirContextoGrade(): Promise<ContextoGrade> {
	if (contextoEmVoo) return contextoEmVoo;

	contextoEmVoo = (async (): Promise<ContextoGrade> => {
		try {
			if (!fluxogramaStore.state.courseData) {
				const matriz = authStore.getUser()?.dadosFluxograma?.matrizCurricular ?? null;
				if (!matriz) return null;
				await fluxogramaStore.loadCourseDataByCurriculoCompleto(matriz);
			}
			const idUser = authStore.getUser()?.idUser ?? null;
			const periodo = await getPeriodoAtivo();
			const pool = await construirMateriasGrade(lerPoolSalvo(idUser, periodo), periodo);
			gradeStore.init(pool, { idUser, periodo });
			return { periodo };
		} catch {
			contextoEmVoo = null; // deixa tentar de novo numa próxima navegação
			return null;
		}
	})();

	return contextoEmVoo;
}

/** Descarta o contexto memoizado — a página do montador reinicializa o store. */
export function invalidarContextoGrade(): void {
	contextoEmVoo = null;
}
