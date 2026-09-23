/**
 * Grade Store — Montador de Grade v2.
 * Store baseado em runes (Svelte 5) que gerencia:
 *  - um **pool** de matérias candidatas (recomendadas ∪ buscadas ∪ vindas do chat);
 *  - **cenários** nomeados (simular grades diferentes), cada um com sua seleção;
 *  - bloqueio de conflito de horário, montagem automática e persistência em
 *    localStorage por usuário + período.
 */
import {
	hasConflict,
	autoMontarGrade,
	autoMontarGradeOpcoes,
	diagnosticarEssenciais,
	epsilonSeguro,
	slotMaskFromHorario,
	turmaRespeitaTurnos,
	maskDosTurnos,
	type TurmaComMask,
	type TurmaCandidata,
	type MateriaTurmas,
	type RankingStrategy,
	type OpcaoGrade,
	type ErroMontagem,
	type Turno
} from '$lib/utils/horario-slots';
import type { TurmaOferta } from '$lib/services/turmas.service';
import { saturada, type SituacaoAcademica } from '$lib/services/situacao-academica.service';
import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
import {
	evaluateExpressaoLogica,
	getCodigosFromExpressaoLogica
} from '$lib/utils/expressao-logica';

export interface MateriaGrade {
	codigo: string;
	nome: string;
	creditos: number;
	idMateria: number;
	/**
	 * Turmas ofertadas para a matéria, já com máscara de horário. `codigoOfertado` vem
	 * preenchido quando a matéria mudou de código e a turma está publicada sob outro —
	 * é nesse código que o aluno se matricula.
	 * Spec: docs/superpowers/specs/2026-08-03-equivalencias-oferta-turmas-design.md
	 */
	turmas: Array<TurmaComMask<TurmaOferta> & { codigoOfertado?: string }>;
	/** Aviso quando o aluno ainda não satisfaz os pré-requisitos (não bloqueia). */
	avisoPreRequisito?: string | null;
	/**
	 * Quão grave é o aviso: `em-curso` é dependência encaminhada (o pré-requisito é
	 * matéria que ele cursa agora, então depende de passar); `pendente` é o que não
	 * fecha nem assim. Ausente/`null` = cumprido. Ver `estadoPreRequisito`.
	 */
	nivelPreRequisito?: 'em-curso' | 'pendente' | null;
	/** Códigos de co-requisitos (matérias que precisam ser cursadas juntas). */
	coRequisitos?: string[];
	/**
	 * Natureza na matriz do aluno — é o que faz `montarAutomatico` preferir
	 * obrigatória a optativa quando as duas disputam o mesmo horário. Ausente
	 * (`undefined`) quando quem montou a matéria não resolveu a matriz; nesse caso
	 * a montagem trata como optativa, que é o comportamento antigo.
	 */
	natureza?: 'obrigatoria' | 'optativa' | 'modulo_livre';
	/**
	 * Optativa que é pré-requisito de uma obrigatória que o aluno AINDA deve.
	 *
	 * Fato sobre a matéria, não sobre a situação dele: por isso mora aqui, e não
	 * é recalculado a cada montagem. É o que impede a montagem de descartá-la
	 * junto com as outras optativas quando a carga optativa já está cumprida.
	 */
	optatoria?: boolean;
}

interface Cenario {
	id: string;
	nome: string;
	/** código da matéria → id_turmas selecionado. */
	selecao: Record<string, number>;
	/**
	 * Como este cenário nasceu: `usuario` é o padrão (criado na mão, ou é a "Grade 1"
	 * inicial); `opcao-solver` é um cenário populado a partir de uma `OpcaoGrade` do
	 * `montarOpcoes` (`popularOpcoes`) — o switcher de cenários usa isto pra
	 * diferenciar visualmente (implementação de outro agente). Cenários salvos antes
	 * deste campo existir voltam como `usuario` (ver `init`).
	 */
	origem: 'opcao-solver' | 'usuario';
}

export interface SelecaoResultado {
	ok: boolean;
	/** Código da matéria já selecionada que impediu a troca, se houve conflito. */
	conflitaCom: string | null;
}

export interface MontagemResultado {
	naoAlocadas: string[];
	/** A busca parou no teto de nós: grade válida, mas talvez não a melhor possível. */
	truncado: boolean;
	/**
	 * Quantas matérias chegaram a ser candidatas — depois dos filtros de travada e
	 * de "matérias em curso", antes do solver.
	 *
	 * Sem isto a tela não distingue "havia candidatas e nenhuma coube" de "não
	 * havia candidata nenhuma", e as duas terminam com `naoAlocadas` vazio quando o
	 * filtro esvaziou a lista. O aviso então culpava a oferta de turmas — que nesse
	 * caso está intacta, o que manda o aluno procurar defeito no lugar errado.
	 */
	candidatas: number;
	/**
	 * Diagnóstico estruturado de por que a matéria `essencial` (se houver) não
	 * coube — `undefined` quando não há `essencial` nesta montagem, ou quando ela
	 * coube. Calculado por `diagnosticarEssenciais` só quando a essencial cai em
	 * `naoAlocadas`, com o contexto de turno/pré-requisito que só o store tem.
	 */
	erros?: ErroMontagem[];
}

/**
 * Fator entre dois degraus vizinhos da escada de pesos.
 *
 * `autoMontarGrade` maximiza a SOMA dos pesos, então um degrau só é de fato
 * superior ao seguinte se nem uma grade inteira cheia do degrau de baixo
 * alcançar uma única matéria do de cima: `fator > N`, com N = máximo de matérias
 * que cabem juntas numa solução.
 *
 * N **não** é o teto de créditos dividido pela menor matéria, embora seja
 * tentador: `montarAutomatico` pode rodar sem `limiteCreditos` nenhum (o
 * argumento é opcional), o slider da tela vai a 40 créditos, e matéria EAD ou
 * "A DEFINIR" tem máscara `0n` — não conflita com ninguém e não é limitada pela
 * geometria dos 96 slots da semana. O único limite honesto é `N ≤ pool.length`.
 *
 * Daí 1000: um pool que cabe na tela tem dezenas de matérias, e quebrar a ordem
 * exigiria mil de um degrau colidindo com uma do degrau acima. No pior caso de
 * soma (200 matérias no degrau mais alto) dá 2e14, bem abaixo de
 * `Number.MAX_SAFE_INTEGER` — a aritmética continua exata.
 */
export const FATOR_ENTRE_DEGRAUS = 1000;

/**
 * Escada de prioridade da montagem automática.
 *
 * Por que nesta ordem:
 * - `CURSANDO`: a matrícula já aconteceu. Tirá-la da grade não desmatricula
 *   ninguém, só esconde a matéria do aluno.
 * - `PRIORITARIA`: o aluno marcou a estrela. Escolha explícita ganha de heurística
 *   nossa — senão a estrela numa optativa não serviria para nada.
 * - `OBRIGATORIA`: é o que atrasa formatura quando fica de fora. Inclui a
 *   "optatória" (optativa que destrava obrigatória pendente), que é obrigatória
 *   disfarçada de optativa no SIGAA.
 * - `NECESSARIA`: carga optativa ou de módulo livre que ainda falta. Conta para a
 *   formatura, mas nenhuma quantidade dela substitui uma obrigatória.
 * - `SATURADO`: a carga dessa natureza já está cumprida. Continua entrando num
 *   buraco livre — cursar a mais é escolha legítima do aluno —, mas nunca tira da
 *   grade uma matéria de que ele ainda precisa.
 *
 * Encaixar no buraco que sobra sempre vale: quem está embaixo soma, só não desloca.
 *
 * Se um dia entrar `bonus` por turma (o solver aceita), a invariante documentada
 * em `horario-slots.ts` continua valendo: a soma máxima de bônus tem de ficar
 * abaixo de `PESO_SATURADO`, ou preferência passa a deslocar necessidade.
 */
const PESO_CURSANDO = 1_000_000_000_000;
export const PESO_PRIORITARIA = 1_000_000_000;
export const PESO_OBRIGATORIA = 1_000_000;
export const PESO_NECESSARIA = 1_000;
export const PESO_SATURADO = 1;

/**
 * Quanto vale encaixar esta matéria, dado o que ainda falta ao aluno.
 *
 * Pura e exportada para ser testável sozinha: aqui mora a POLÍTICA (quem vale
 * mais), enquanto `montarAutomatico` cuida do EFEITO dela sobre a grade.
 *
 * `situacao` nula — integralização que falhou, aluno sem matriz, PDF sem carga —
 * cai no mesmo par de degraus de antes (obrigatória acima do resto). É o que faz
 * toda falha desta camada degradar para o montador anterior, nunca para um pior.
 */
export function pesoDaNatureza(
	natureza: MateriaGrade['natureza'],
	situacao: SituacaoAcademica | null,
	ehOptatoria: boolean
): number {
	// Optatória: o SIGAA a lista como optativa, mas ela é pré-requisito de uma
	// obrigatória que o aluno ainda deve. Descartá-la junto com as demais quando a
	// carga optativa fecha o deixaria travado numa obrigatória por causa de uma
	// conta de horas que já está satisfeita.
	if (ehOptatoria) return PESO_OBRIGATORIA;

	// Obrigatória NUNCA satura por carga horária, e isto é deliberado: quem decide
	// se ainda falta obrigatória é a lista de pendentes da matriz, não a conta de
	// horas. As duas divergem de verdade — quem mudou de matriz ou cumpriu matéria
	// por equivalência tem um `carga_horaria_integralizada` que fala de outro
	// currículo. Entre esconder uma obrigatória pendente e sugerir uma a mais, o
	// erro barato é o segundo.
	if (natureza === 'obrigatoria') return PESO_OBRIGATORIA;

	// Matéria cuja matriz não foi resolvida chega sem natureza. Tratá-la como
	// optativa era o comportamento antigo; o que não pode é sumir por falta de dado.
	if (!natureza) return PESO_NECESSARIA;

	if (!situacao) return PESO_NECESSARIA;

	return saturada(situacao, natureza) ? PESO_SATURADO : PESO_NECESSARIA;
}

/** Docentes comparáveis: sem espaços redundantes, caixa alta. */
function normDocente(nome: string | null | undefined): string {
	return (nome ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * O campo `docente` de uma turma pode trazer vários nomes separados por vírgula
 * (turma com mais de um professor). Comparar a string crua inteira contra o alvo
 * (como o filtro rígido antigo fazia) cruza fronteira de nome — "ANA" bateria em
 * "MARIANA" só por causa de substring cru, ou pior, o pedaço de um nome podia
 * colar com o pedaço do próximo depois da vírgula. Aqui o split vem primeiro:
 * cada nome é normalizado e comparado individualmente contra o alvo.
 */
export function docenteBate(docenteCru: string | null | undefined, alvo: string): boolean {
	const alvoNorm = normDocente(alvo);
	if (!alvoNorm) return false;
	return (docenteCru ?? '')
		.split(',')
		.map((nome) => normDocente(nome))
		.some((nome) => nome.length > 0 && nome.includes(alvoNorm));
}

/** Quantidade de dias distintos (de 6) que uma máscara de horário ocupa. */
function diasOcupadosPelaMask(mask: bigint): number {
	let dias = 0;
	for (let dia = 0; dia < 6; dia++) {
		if (((mask >> BigInt(dia * 16)) & 0xffffn) !== 0n) dias++;
	}
	return dias;
}

/** Módulos ocupados (de 16) num dia específico (0=Seg..5=Sáb) da máscara. */
function modulosOcupadosNoDia(mask: bigint, dia: number): number {
	let seg = (mask >> BigInt(dia * 16)) & 0xffffn;
	let n = 0;
	while (seg > 0n) {
		if (seg & 1n) n++;
		seg >>= 1n;
	}
	return n;
}

/** Amplitude (último módulo − primeiro + 1) ocupada num dia — mede dispersão interna. */
function amplitudeNoDia(mask: bigint, dia: number): number {
	let min = -1;
	let max = -1;
	for (let bit = 0; bit < 16; bit++) {
		if ((mask & (1n << BigInt(dia * 16 + bit))) === 0n) continue;
		if (min === -1) min = bit;
		max = bit;
	}
	return min === -1 ? 0 : max - min + 1;
}

/**
 * Turnos com pelo menos uma turma ofertando, ANTES do filtro de turno permitido —
 * insumo de `diagnosticarEssenciais` pra distinguir "fora do turno escolhido" de
 * "sem oferta nenhuma".
 */
function turnosDaOferta(turmas: ReadonlyArray<{ mask: bigint }>): Array<'M' | 'T' | 'N'> {
	const vistos: Array<'M' | 'T' | 'N'> = [];
	for (const turno of ['M', 'T', 'N'] as const) {
		if (turmas.some((t) => (t.mask & maskDosTurnos([turno])) !== 0n)) vistos.push(turno);
	}
	return vistos;
}

/**
 * Códigos de pré-requisito que a matéria `essencial` ainda não cumpre, contra o
 * histórico do aluno (`fluxogramaStore.completedCodes`) — insumo de
 * `diagnosticarEssenciais` para `ESSENCIAL_PRE_REQUISITO`. Usa `expressaoLogica`
 * do curso quando existe (mesma fonte que `satisfazPreRequisitos` em
 * `types/curso.ts`); sem curso carregado ou sem pré-requisito cadastrado, vazio —
 * degrada para as outras causas (`ESSENCIAL_SEM_VAGA`/`ESSENCIAL_CONFLITO`).
 */
function pendenciasPreRequisitoDe(idMateria: number): string[] {
	const curso = fluxogramaStore.state.courseData;
	if (!curso) return [];
	const completos = fluxogramaStore.completedCodes ?? new Set<string>();
	const prereqs = curso.preRequisitos.filter((pr) => pr.idMateria === idMateria);
	const pendentes = new Set<string>();
	for (const pr of prereqs) {
		if (pr.expressaoLogica != null) {
			if (!evaluateExpressaoLogica(pr.expressaoLogica, completos)) {
				for (const c of getCodigosFromExpressaoLogica(pr.expressaoLogica)) pendentes.add(c);
			}
			continue;
		}
		const req = (pr.codigoMateriaRequisito || '').trim().toUpperCase();
		if (req && ![...completos].some((c) => c.trim().toUpperCase() === req)) pendentes.add(req);
	}
	return [...pendentes];
}

/**
 * As 3 `RankingStrategy` padrão de `montarOpcoes`: cada uma pontua uma turma
 * isoladamente (o solver não enxerga o resto da seleção nesse ponto), então são
 * heurísticas de VIÉS — o que de fato compara as opções depois é a métrica
 * agregada que `autoMontarGradeOpcoes` calcula sobre a grade inteira já montada.
 * O papel de cada estratégia aqui é só puxar o solver pra soluções distintas o
 * bastante pra valer a pena comparar.
 *
 * `epsilon` é o mesmo teto de `epsilonSeguro` usado para o bônus de professor —
 * a documentação de `epsilonSeguro` já reserva a folga de 2× exatamente para os
 * dois bônus (professor + estratégia) conviverem na mesma turma sem um deslocar
 * matéria por cima do outro.
 */
function construirEstrategiasPadrao(epsilon: number): RankingStrategy<TurmaOferta>[] {
	return [
		{
			// Prefere turmas que ocupam menos dias distintos — concentra a semana.
			nome: 'Menos dias',
			pontuar: (t) => epsilon * (6 - diasOcupadosPelaMask(t.mask))
		},
		{
			// Prefere turmas sem buraco interno (amplitude == módulos ocupados no dia).
			nome: 'Menos lacunas',
			pontuar: (t) => {
				let bonus = 0;
				for (let dia = 0; dia < 6; dia++) {
					const ocupados = modulosOcupadosNoDia(t.mask, dia);
					if (ocupados === 0) continue;
					if (amplitudeNoDia(t.mask, dia) === ocupados) bonus += epsilon;
				}
				return bonus;
			}
		},
		{
			// Prefere turmas espalhadas por mais dias — o oposto de "Menos dias",
			// pra reduzir a carga concentrada num único dia.
			nome: 'Semana equilibrada',
			pontuar: (t) => epsilon * diasOcupadosPelaMask(t.mask)
		}
	];
}

/** Paleta dark-mode, uma cor estável por matéria (por ordem no pool). */
export const MATERIA_CORES: ReadonlyArray<{ cell: string; dot: string; text: string }> = [
	{ cell: 'bg-purple-500/25 border-purple-400/50', dot: 'bg-purple-400', text: 'text-purple-100' },
	{ cell: 'bg-sky-500/25 border-sky-400/50', dot: 'bg-sky-400', text: 'text-sky-100' },
	{
		cell: 'bg-emerald-500/25 border-emerald-400/50',
		dot: 'bg-emerald-400',
		text: 'text-emerald-100'
	},
	{ cell: 'bg-amber-500/25 border-amber-400/50', dot: 'bg-amber-400', text: 'text-amber-100' },
	{ cell: 'bg-pink-500/25 border-pink-400/50', dot: 'bg-pink-400', text: 'text-pink-100' },
	{ cell: 'bg-cyan-500/25 border-cyan-400/50', dot: 'bg-cyan-400', text: 'text-cyan-100' },
	{ cell: 'bg-orange-500/25 border-orange-400/50', dot: 'bg-orange-400', text: 'text-orange-100' },
	{ cell: 'bg-teal-500/25 border-teal-400/50', dot: 'bg-teal-400', text: 'text-teal-100' }
];

function novoId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function poolKey(idUser: number | null, periodo: string | null): string | null {
	return idUser != null && periodo ? `nofluxo:grade:${idUser}:${periodo}:pool` : null;
}
function cenariosKey(idUser: number | null, periodo: string | null): string | null {
	return idUser != null && periodo ? `nofluxo:grade:${idUser}:${periodo}:cenarios` : null;
}

/** Lê (fora do store) os códigos do pool salvo — a página usa p/ rehidratar turmas. */
export function lerPoolSalvo(idUser: number | null, periodo: string): string[] {
	const key = poolKey(idUser, periodo);
	if (!key || typeof localStorage === 'undefined') return [];
	try {
		const arr = JSON.parse(localStorage.getItem(key) ?? '[]');
		return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/** Códigos removidos pelo aluno — a página exclui do re-semeio do recomendado. */
export function lerRemovidasSalvo(idUser: number | null, periodo: string): string[] {
	const key = cenariosKey(idUser, periodo);
	if (!key || typeof localStorage === 'undefined') return [];
	try {
		const obj = JSON.parse(localStorage.getItem(key) ?? '{}');
		return Array.isArray(obj?.removidas)
			? obj.removidas.filter((x: unknown): x is string => typeof x === 'string')
			: [];
	} catch {
		return [];
	}
}

function createGradeStore() {
	let pool = $state<MateriaGrade[]>([]);
	let grades = $state<Cenario[]>([]);
	let activeId = $state<string>('');
	let idUser = $state<number | null>(null);
	let periodo = $state<string | null>(null);
	let ultimaMontagem = $state<MontagemResultado | null>(null);
	/** Matéria sob o mouse (lista/resumo) — o calendário destaca os blocos dela. */
	let hoverCodigo = $state<string | null>(null);
	/** Códigos priorizados: a montagem automática tenta encaixá-los primeiro. */
	let prioritarias = $state<Set<string>>(new Set());
	/** Turnos permitidos ao montar a grade (M/T/N). Os 3 = sem filtro. */
	let turnosPermitidos = $state<Set<Turno>>(new Set<Turno>(['M', 'T', 'N']));
	/** Códigos que o aluno removeu — não voltam ao re-semear o recomendado. */
	let removidas = $state<Set<string>>(new Set());
	/**
	 * Professor obrigatório por matéria, confirmado numa sessão anterior (vem do
	 * banco — tabela `preferencias_grade`) e reaplicado em toda montagem automática,
	 * não só na que veio do chat. Quem carrega é a rota (`definirDocentesPersistidos`);
	 * o store só guarda e usa como filtro rígido.
	 */
	let docentesPersistidos = $state<Record<string, string>>({});
	/**
	 * O que ainda falta ao aluno, por natureza. Quem carrega é a rota
	 * (`definirSituacao`), em segundo plano — o store só guarda e usa para pesar.
	 *
	 * `null` é o estado normal enquanto não chega, e o estado final quando a
	 * integralização falha: nesse caso a montagem é exatamente a de antes.
	 */
	let situacao = $state<SituacaoAcademica | null>(null);
	/**
	 * Códigos que o aluno já está cursando agora, vindos do fluxograma. Entram na
	 * lista sozinhos pra não conflitar com o que o aluno for adicionar; quando o
	 * histórico traz a turma real da matrícula, a rota também a pré-seleciona. Quem
	 * define é a rota (`definirCursandoAtual`), logo depois do init. Se elas ocupam
	 * a grade é decisão do aluno — ver `incluirCursando`.
	 */
	let cursandoAtual = $state<Set<string>>(new Set());
	/**
	 * Códigos travados: `montarAutomatico` nunca reatribui a turma deles, só ocupa o
	 * horário pras outras matérias otimizarem em volta. Uma matéria de `cursandoAtual`
	 * trava sozinha assim que o aluno escolhe a turma real dela (`selecionarTurma`) —
	 * sem isso, "Montar grade" poderia trocar a turma de uma matéria que ele já está
	 * cursando de verdade, o que não faz sentido (a matrícula real já aconteceu).
	 */
	let travadas = $state<Set<string>>(new Set());
	/**
	 * As matérias que o aluno já cursa entram na grade? Ligado por padrão.
	 *
	 * O Montador não diz mais qual semestre está montando — ele monta uma grade com a
	 * oferta real mais recente. Com isso, "matrícula em curso é intocável" deixou de
	 * ser lei e virou escolha: ligado, o aluno vê a semana inteira dele; desligado,
	 * ele olha o que dá pra pegar depois, e a matrícula atual só ocuparia espaço.
	 *
	 * Medido em 24 alunos reais antes desta opção existir: 67% das matérias montadas
	 * eram matérias já em curso, e num deles a grade era 100% disso — com 13
	 * obrigatórias ofertadas de fora.
	 */
	let incluirCursando = $state(true);

	/**
	 * Matérias em curso que valem para esta montagem. Desligado o modo, o conjunto é
	 * vazio: elas não pontuam, não gastam crédito e não ocupam horário — mas
	 * `cursandoAtual` continua intacto, então religar devolve tudo sem recarregar.
	 */
	const cursandoAtivo = $derived(incluirCursando ? cursandoAtual : new Set<string>());

	/**
	 * Travas que valem para esta montagem. Só matéria em curso trava, então com o
	 * modo desligado não sobra nenhuma.
	 */
	const travadasAtivas = $derived.by(() => {
		if (incluirCursando) return travadas;
		return new Set([...travadas].filter((c) => !cursandoAtual.has(c)));
	});

	const indicePorCodigo = $derived.by(() => {
		const m = new Map<string, number>();
		pool.forEach((mat, i) => m.set(mat.codigo, i));
		return m;
	});

	const cenarioAtivo = $derived(grades.find((g) => g.id === activeId) ?? null);

	/** Seleção do cenário ativo, resolvida contra o pool (código → turma). */
	const selecaoAtiva = $derived.by(() => {
		const map = new Map<string, TurmaComMask<TurmaOferta>>();
		if (!cenarioAtivo) return map;
		for (const [codigo, idTurma] of Object.entries(cenarioAtivo.selecao)) {
			const mat = pool.find((m) => m.codigo === codigo);
			const tg = mat?.turmas.find((t) => t.turma.id_turmas === idTurma);
			if (tg) map.set(codigo, tg);
		}
		return map;
	});

	const combinedMask = $derived.by(() => {
		let mask = 0n;
		for (const t of selecaoAtiva.values()) mask |= t.mask;
		return mask;
	});

	const ocupacao = $derived.by(() => {
		const map = new Map<number, string>();
		for (const [codigo, t] of selecaoAtiva) {
			let mask = t.mask;
			let i = 0;
			while (mask > 0n) {
				if (mask & 1n) map.set(i, codigo);
				mask >>= 1n;
				i++;
			}
		}
		return map;
	});

	const creditosSelecionados = $derived.by(() => {
		let total = 0;
		for (const codigo of selecaoAtiva.keys()) {
			total += pool.find((m) => m.codigo === codigo)?.creditos ?? 0;
		}
		return total;
	});

	function persistPool(): void {
		const key = poolKey(idUser, periodo);
		if (!key || typeof localStorage === 'undefined') return;
		localStorage.setItem(key, JSON.stringify(pool.map((m) => m.codigo)));
	}
	function persistCenarios(): void {
		const key = cenariosKey(idUser, periodo);
		if (!key || typeof localStorage === 'undefined') return;
		localStorage.setItem(
			key,
			JSON.stringify({
				grades,
				activeId,
				prioritarias: [...prioritarias],
				turnos: [...turnosPermitidos],
				removidas: [...removidas],
				incluirCursando
			})
		);
	}

	/** Remove seleções cuja turma sumiu do pool ou que passaram a conflitar. */
	function reconciliar(sel: Record<string, number>): Record<string, number> {
		const out: Record<string, number> = {};
		let acc = 0n;
		for (const [codigo, idTurma] of Object.entries(sel)) {
			const tg = pool
				.find((m) => m.codigo === codigo)
				?.turmas.find((t) => t.turma.id_turmas === idTurma);
			if (tg && !hasConflict(tg.mask, acc)) {
				out[codigo] = idTurma;
				acc |= tg.mask;
			}
		}
		return out;
	}

	/** Atualiza a seleção do cenário ativo de forma imutável (dispara reatividade). */
	function updateAtivo(fn: (sel: Record<string, number>) => Record<string, number>): void {
		grades = grades.map((g) => (g.id === activeId ? { ...g, selecao: fn(g.selecao) } : g));
		ultimaMontagem = null;
		persistCenarios();
	}

	/** Máscara das turmas do cenário ativo, exceto a da matéria informada. */
	function maskExcluindo(codigo: string): bigint {
		let mask = 0n;
		for (const [c, t] of selecaoAtiva) if (c !== codigo) mask |= t.mask;
		return mask;
	}

	/** Opções de `montarAutomatico`/`montarOpcoes` — as duas montam a mesma entrada do solver. */
	interface MontarOpts {
		/**
		 * Professor preferido por matéria — agora é BÔNUS de desempate (via
		 * `docenteBate` + `epsilonSeguro`), não filtro rígido: a matéria nunca fica
		 * de fora só porque nenhuma turma bateu com o professor, ela só deixa de
		 * ganhar o bônus. Mescla com `docentesPersistidos` (confirmados numa sessão
		 * anterior); o argumento vence em caso de conflito.
		 */
		docentesObrigatorios?: Record<string, string>;
		/** Teto de créditos do semestre (o slider da tela). */
		limiteCreditos?: number;
		/**
		 * Código da matéria que NUNCA pode ficar de fora — vira `essencial`/`obrigatoria`
		 * em `MateriaTurmas` (ver docstring de `essencial` em `horario-slots.ts`).
		 */
		essencial?: string;
		/** Professor preferido especificamente para a `essencial` — mesmo bônus, mesmo mecanismo. */
		professorPreferidoEssencial?: string;
		/**
		 * Turnos específicos da `essencial` (preferência por disciplina, coluna
		 * `preferencias_grade.turnos`) — filtro ADICIONAL só pra ela, por cima do
		 * `turnosPermitidos` global da tela (interseção das duas). Vazio/ausente = só
		 * o filtro global vale, como sempre foi.
		 */
		turnosEssencial?: Turno[];
		/**
		 * Que universo de matérias considerar — o store sempre resolve sobre `pool`
		 * como ele está no momento da chamada; quem decide o que ENTRA em `pool` para
		 * cada escopo é a semeadura de cima (rota, via `onSemear`/`grade-pool.service`,
		 * Fase 2 da UI), não este método. Aceito aqui só para fechar o contrato com
		 * `MontadorParametros`/`MontadorGradeView` — sem efeito próprio no solver hoje.
		 */
		escopo?: 'periodo-atual' | 'todas-pendentes';
	}

	/**
	 * Monta a entrada do solver (`MateriaTurmas[]` + máscara travada + orçamento)
	 * a partir do estado do store — compartilhada por `montarAutomatico` (uma
	 * grade) e `montarOpcoes` (várias, uma por `RankingStrategy`), que não podem
	 * divergir em COMO os candidatos são filtrados/pesados, só em qual bônus extra
	 * cada turma recebe por cima.
	 */
	function construirEntradaSolver(opts?: MontarOpts): {
		materiasSolver: Array<MateriaTurmas<TurmaOferta>>;
		mascaraTravada: bigint;
		orcamento: number | undefined;
		candidatasCount: number;
		essencialCodigo: string | undefined;
		bonusProfessor: number;
		turmasAntesDoFiltroDeTurno: Map<string, unknown[]>;
		turnosComOferta: Map<string, Array<'M' | 'T' | 'N'>>;
	} {
		const essencialCodigo = opts?.essencial?.trim().toUpperCase() || undefined;
		const docentesEfetivos = { ...docentesPersistidos, ...(opts?.docentesObrigatorios ?? {}) };
		if (essencialCodigo && opts?.professorPreferidoEssencial) {
			docentesEfetivos[essencialCodigo] = opts.professorPreferidoEssencial;
		}

		const mascaraTravada = [...travadasAtivas].reduce((acc, codigo) => {
			const tg = selecaoAtiva.get(codigo);
			return tg ? acc | tg.mask : acc;
		}, 0n);

		// As travadas continuam na grade final, então o crédito delas já está gasto
		// antes do solver começar — o orçamento que sobra é o do resto.
		const creditosTravados = [...travadasAtivas].reduce((acc, codigo) => {
			if (!selecaoAtiva.has(codigo)) return acc;
			return acc + (pool.find((m) => m.codigo === codigo)?.creditos ?? 0);
		}, 0);
		const orcamento =
			opts?.limiteCreditos === undefined ? undefined : opts.limiteCreditos - creditosTravados;

		const candidatas = pool
			// Modo desligado: a matéria em curso não é candidata — sai da grade e
			// devolve o horário e o crédito dela para as outras.
			.filter((m) => !travadasAtivas.has(m.codigo))
			.filter((m) => incluirCursando || !cursandoAtual.has(m.codigo));

		// Bônus seguro de professor — mesmo teto para todas as matérias desta
		// montagem, dado o tamanho do pool que pode entrar junto na mesma grade.
		const bonusProfessor = epsilonSeguro(PESO_SATURADO, Math.max(candidatas.length, 1));

		const turmasAntesDoFiltroDeTurno = new Map<string, unknown[]>();
		const turnosComOferta = new Map<string, Array<'M' | 'T' | 'N'>>();

		const materiasSolver: Array<MateriaTurmas<TurmaOferta>> = candidatas.map((m) => {
			const docenteAlvo = docentesEfetivos[m.codigo];
			turmasAntesDoFiltroDeTurno.set(m.codigo, m.turmas);
			turnosComOferta.set(m.codigo, turnosDaOferta(m.turmas));

			// Turno continua sendo filtro rígido (o aluno não quer ver grade fora do
			// turno escolhido). Professor não: agora é bônus por cima da turma que já
			// passou no turno, não mais um segundo filtro que podia esvaziar a matéria.
			let turmasNoTurno = m.turmas.filter((t) => turmaRespeitaTurnos(t.mask, turnosPermitidos));
			// `turnosEssencial` é preferência POR DISCIPLINA (só a essencial), a mais
			// da tela — interseção com o filtro global, nunca substitui.
			const essencialAqui = essencialCodigo !== undefined && m.codigo === essencialCodigo;
			if (essencialAqui && opts?.turnosEssencial && opts.turnosEssencial.length > 0) {
				const turnosEssencialSet = new Set<Turno>(opts.turnosEssencial);
				turmasNoTurno = turmasNoTurno.filter((t) => turmaRespeitaTurnos(t.mask, turnosEssencialSet));
			}
			const turmas: Array<TurmaCandidata<TurmaOferta>> = docenteAlvo
				? turmasNoTurno.map((t) =>
						docenteBate(t.turma.docente, docenteAlvo) ? { ...t, bonus: bonusProfessor } : t
					)
				: turmasNoTurno;

			// CUIDADO com o nome: o campo `obrigatoria` de `MateriaTurmas` NÃO é
			// "obrigatória da matriz" — é "não pode ser barrada pelo teto de
			// créditos", e isso vale para a matrícula que já aconteceu OU para a
			// `essencial` (que também não pode ser barrada por crédito). A natureza
			// da matriz entra pelo `peso`, logo abaixo.
			const matriculaReal = cursandoAtivo.has(m.codigo);
			return {
				chave: m.codigo,
				turmas,
				creditos: m.creditos,
				obrigatoria: matriculaReal || essencialAqui,
				essencial: essencialAqui,
				peso: matriculaReal
					? PESO_CURSANDO
					: prioritarias.has(m.codigo)
						? PESO_PRIORITARIA
						: pesoDaNatureza(m.natureza, situacao, m.optatoria === true)
			};
		});

		return {
			materiasSolver,
			mascaraTravada,
			orcamento,
			candidatasCount: candidatas.length,
			essencialCodigo,
			bonusProfessor,
			turmasAntesDoFiltroDeTurno,
			turnosComOferta
		};
	}

	return {
		get pool() {
			return pool;
		},
		get grades() {
			return grades;
		},
		get activeId() {
			return activeId;
		},
		get cenarioAtivo() {
			return cenarioAtivo;
		},
		get selecao() {
			return selecaoAtiva;
		},
		get combinedMask() {
			return combinedMask;
		},
		/** Slots livres = universo dos turnos permitidos menos o que já está selecionado. */
		get freeMask(): bigint {
			return maskDosTurnos(turnosPermitidos) & ~combinedMask;
		},
		get ocupacao() {
			return ocupacao;
		},
		get creditosSelecionados() {
			return creditosSelecionados;
		},
		get ultimaMontagem() {
			return ultimaMontagem;
		},
		get hoverCodigo() {
			return hoverCodigo;
		},

		setHover(codigo: string | null): void {
			hoverCodigo = codigo;
		},

		isPrioritaria(codigo: string): boolean {
			return prioritarias.has(codigo);
		},

		/** Marca/desmarca a matéria como prioritária na montagem automática. */
		togglePrioridade(codigo: string): void {
			const next = new Set(prioritarias);
			if (next.has(codigo)) next.delete(codigo);
			else next.add(codigo);
			prioritarias = next;
			persistCenarios();
		},

		get temPrioritarias() {
			return prioritarias.size > 0;
		},

		/**
		 * Docentes distintos que oferecem a matéria, em ordem alfabética — usado pelo
		 * botão "Perguntar pra Darcy" pra o aluno escolher um nome real em vez de
		 * digitar de cabeça.
		 */
		docentesDe(codigo: string): string[] {
			const mat = pool.find((m) => m.codigo === codigo);
			if (!mat) return [];
			const vistos = new Map<string, string>();
			for (const t of mat.turmas) {
				const nome = (t.turma.docente ?? '').trim();
				if (nome) vistos.set(nome.toUpperCase(), nome);
			}
			return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
		},

		get docentesPersistidos() {
			return docentesPersistidos;
		},

		/** Carrega as preferências de professor confirmadas antes (vêm do banco). */
		get situacao() {
			return situacao;
		},

		/**
		 * Informa o saldo de carga horária do aluno. Chamado pela rota depois de a
		 * tela já estar de pé — a montagem funciona sem isto, só menos informada.
		 */
		definirSituacao(s: SituacaoAcademica | null): void {
			situacao = s;
		},

		definirDocentesPersistidos(mapa: Record<string, string>): void {
			docentesPersistidos = mapa;
		},

		/** Foto da seleção atual — pra poder voltar se o aluno recusar um rearranjo. */
		snapshotSelecao(): Record<string, number> {
			return { ...(cenarioAtivo?.selecao ?? {}) };
		},

		/**
		 * Caminho ÚNICO para aplicar uma seleção pronta (código → id_turmas) no
		 * cenário ativo — usado tanto pelo clique numa `OpcaoGrade` já montada na tela
		 * quanto pelo handler do chat quando a Darcy manda `opcaoGrade` pronta (em vez
		 * da tag de texto, que ainda passa por `montarAutomatico`). Reconcilia contra
		 * o pool antes de aplicar: turma que sumiu ou passou a conflitar não entra —
		 * mesma rede de segurança que `init` já aplica em cenário restaurado do
		 * localStorage.
		 *
		 * `selecao` vem de `OpcaoGrade.resultado.selecao` (via `montarOpcoes`), que
		 * NUNCA inclui as travadas — elas são horário pré-ocupado passado pro solver
		 * via `mascaraTravada`, não candidatas dele (mesmo motivo por trás do merge em
		 * `montarAutomatico`, linhas ~1174-1179). Sem mesclar aqui, aplicar uma opção
		 * apagaria a turma de qualquer matéria travada do cenário ativo.
		 */
		aplicarSelecao(selecao: Record<string, number>): void {
			const comTravadas: Record<string, number> = {};
			for (const codigo of travadasAtivas) {
				const tg = selecaoAtiva.get(codigo);
				if (tg) comTravadas[codigo] = tg.turma.id_turmas;
			}
			updateAtivo(() => reconciliar({ ...comTravadas, ...selecao }));
		},

		/** Restaura uma seleção tirada por `snapshotSelecao` — mesmo caminho de `aplicarSelecao`. */
		restaurarSelecao(snapshot: Record<string, number>): void {
			this.aplicarSelecao(snapshot);
		},

		/**
		 * Mapeia cada `OpcaoGrade` (uma por `RankingStrategy` de `montarOpcoes`) para
		 * um cenário novo, nomeado pela estratégia — não mexe no cenário ativo, só
		 * populam a lista pra o aluno comparar lado a lado antes de escolher uma. A
		 * tela troca de cenário direto por `selecionarCenario` no clique (não passa
		 * por `aplicarSelecao`), então cada cenário criado aqui já precisa vir com a
		 * seleção completa — inclusive as travadas, pelo mesmo motivo documentado em
		 * `aplicarSelecao`: `opcao.resultado.selecao` nunca inclui quem está travado.
		 */
		popularOpcoes(opcoes: OpcaoGrade<TurmaOferta>[]): void {
			if (opcoes.length === 0) return;
			const selecaoTravadas: Record<string, number> = {};
			for (const codigo of travadasAtivas) {
				const tg = selecaoAtiva.get(codigo);
				if (tg) selecaoTravadas[codigo] = tg.turma.id_turmas;
			}
			const novos: Cenario[] = opcoes.map((opcao) => ({
				id: novoId(),
				nome: opcao.estrategia,
				selecao: {
					...selecaoTravadas,
					...Object.fromEntries(
						[...opcao.resultado.selecao].map(([codigo, t]) => [codigo, t.turma.id_turmas])
					)
				},
				origem: 'opcao-solver'
			}));
			grades = [...grades, ...novos];
			persistCenarios();
		},

		get turnosPermitidos() {
			return turnosPermitidos;
		},

		/**
		 * Códigos que o aluno tirou da lista na mão. Exposto porque quem re-semeia o
		 * pool (a rota, ao montar a grade automaticamente) precisa respeitar essa
		 * escolha — `addMateriaAoPool` limpa a marca, então filtrar é com o chamador.
		 */
		get removidas() {
			return removidas;
		},

		/** Filtro de turno ativo (1 ou 2 turnos selecionados; 0 ou 3 = sem filtro). */
		get temFiltroTurno() {
			return turnosPermitidos.size > 0 && turnosPermitidos.size < 3;
		},

		/** Liga/desliga um turno; nunca deixa os 3 desligados. */
		toggleTurno(t: Turno): void {
			const next = new Set(turnosPermitidos);
			if (next.has(t)) {
				if (next.size > 1) next.delete(t);
			} else {
				next.add(t);
			}
			turnosPermitidos = next;
			persistCenarios();
		},

		/** Define diretamente os turnos permitidos (usado pelo chat). Vazio = todos. */
		setTurnos(turnos: string[]): void {
			const validos = turnos
				.map((t) => t.trim().toUpperCase())
				.filter((t): t is Turno => t === 'M' || t === 'T' || t === 'N');
			turnosPermitidos = new Set<Turno>(validos.length > 0 ? validos : ['M', 'T', 'N']);
			persistCenarios();
		},

		get incluirCursando() {
			return incluirCursando;
		},

		/**
		 * O aluno tem matrícula em curso nesta lista? Sem isso o botão de ligar/desligar
		 * não tem o que ligar — some da barra em vez de virar enfeite.
		 */
		get temCursando() {
			return cursandoAtual.size > 0;
		},

		/**
		 * Liga/desliga a entrada das matérias em curso na montagem.
		 *
		 * Não mexe em `cursandoAtual`: a informação de que o aluno cursa aquilo continua
		 * valendo (etiqueta na lista, pré-requisito satisfeito). O que muda é só se elas
		 * disputam vaga na grade.
		 */
		setIncluirCursando(valor: boolean): void {
			if (incluirCursando === valor) return;
			incluirCursando = valor;
			persistCenarios();
		},

		/** Co-requisitos da matéria que NÃO estão na grade atual (só p/ selecionadas). */
		/**
		 * Obrigatórias que exigem esta optativa — o "por que" da etiqueta de
		 * optatória. Lista vazia quando ela não destrava nada.
		 */
		obrigatoriasQueExigem(codigo: string): string[] {
			return fluxogramaStore.optatorias?.get(codigo) ?? [];
		},

		coReqsFaltando(codigo: string): string[] {
			const mat = pool.find((m) => m.codigo === codigo);
			if (!mat?.coRequisitos?.length || !selecaoAtiva.has(codigo)) return [];
			const naGrade = new Set([...selecaoAtiva.keys()].map((c) => c.toUpperCase()));
			return mat.coRequisitos.filter((c) => !naGrade.has(c.trim().toUpperCase()));
		},

		/** Carrega o pool e restaura cenários salvos (ou cria "Grade 1"). */
		init(poolInicial: MateriaGrade[], ctx: { idUser: number | null; periodo: string }): void {
			pool = poolInicial;
			idUser = ctx.idUser;
			periodo = ctx.periodo;
			ultimaMontagem = null;
			// Não persistem no localStorage: um init novo (navegação SPA de volta ao
			// montador) não pode herdar travas/cursando da sessão anterior do store —
			// quem sabe o estado atual é a rota, via `definirCursandoAtual` logo após.
			cursandoAtual = new Set();
			travadas = new Set();

			const key = cenariosKey(idUser, periodo);
			let restaurado: {
				grades: Array<{
					id: string;
					nome: string;
					selecao?: Record<string, number>;
					/** Ausente em cenário salvo antes deste campo existir. */
					origem?: Cenario['origem'];
				}>;
				activeId: string;
				prioritarias?: string[];
				turnos?: Turno[];
				removidas?: string[];
				incluirCursando?: boolean;
			} | null = null;
			if (key && typeof localStorage !== 'undefined') {
				try {
					const raw = localStorage.getItem(key);
					if (raw) restaurado = JSON.parse(raw);
				} catch {
					restaurado = null;
				}
			}

			prioritarias = new Set(
				Array.isArray(restaurado?.prioritarias) ? restaurado!.prioritarias : []
			);
			turnosPermitidos = new Set<Turno>(
				Array.isArray(restaurado?.turnos) && restaurado!.turnos.length > 0
					? restaurado!.turnos
					: ['M', 'T', 'N']
			);
			removidas = new Set(Array.isArray(restaurado?.removidas) ? restaurado!.removidas : []);
			// Ausente no storage (cenário salvo antes desta opção existir) = ligado, que
			// é o comportamento de sempre.
			incluirCursando =
				typeof restaurado?.incluirCursando === 'boolean' ? restaurado.incluirCursando : true;

			if (restaurado && Array.isArray(restaurado.grades) && restaurado.grades.length > 0) {
				grades = restaurado.grades.map((g) => ({
					id: g.id,
					nome: g.nome,
					selecao: reconciliar(g.selecao ?? {}),
					origem: g.origem === 'opcao-solver' ? 'opcao-solver' : 'usuario'
				}));
				activeId = grades.some((g) => g.id === restaurado!.activeId)
					? restaurado.activeId
					: grades[0].id;
			} else {
				const id = novoId();
				grades = [{ id, nome: 'Grade 1', selecao: {}, origem: 'usuario' }];
				activeId = id;
			}

			persistPool();
			persistCenarios();
		},

		hasMateria(codigo: string): boolean {
			return pool.some((m) => m.codigo === codigo);
		},

		/** Adiciona uma matéria (com turmas) ao pool, se ainda não estiver lá. */
		addMateriaAoPool(materia: MateriaGrade): void {
			if (pool.some((m) => m.codigo === materia.codigo)) return;
			pool = [...pool, materia];
			if (removidas.has(materia.codigo)) {
				const nr = new Set(removidas);
				nr.delete(materia.codigo);
				removidas = nr;
			}
			persistPool();
			persistCenarios();
		},

		/** Remove a matéria do pool: tira das seleções, prioridade e não volta no reload. */
		removerMateriaDoPool(codigo: string): void {
			pool = pool.filter((m) => m.codigo !== codigo);
			grades = grades.map((g) => {
				if (!(codigo in g.selecao)) return g;
				const { [codigo]: _omit, ...rest } = g.selecao;
				return { ...g, selecao: rest };
			});
			if (prioritarias.has(codigo)) {
				const np = new Set(prioritarias);
				np.delete(codigo);
				prioritarias = np;
			}
			if (cursandoAtual.has(codigo)) {
				const nc = new Set(cursandoAtual);
				nc.delete(codigo);
				cursandoAtual = nc;
			}
			if (travadas.has(codigo)) {
				const nt = new Set(travadas);
				nt.delete(codigo);
				travadas = nt;
			}
			const nr = new Set(removidas);
			nr.add(codigo);
			removidas = nr;
			ultimaMontagem = null;
			persistPool();
			persistCenarios();
		},

		corDaMateria(codigo: string) {
			const i = indicePorCodigo.get(codigo) ?? 0;
			return MATERIA_CORES[i % MATERIA_CORES.length];
		},

		turmaSelecionada(codigo: string): TurmaComMask<TurmaOferta> | undefined {
			return selecaoAtiva.get(codigo);
		},

		podeSelecionar(codigo: string, tg: TurmaComMask<TurmaOferta>): boolean {
			return !hasConflict(tg.mask, maskExcluindo(codigo));
		},

		conflitaCom(codigo: string, tg: TurmaComMask<TurmaOferta>): string | null {
			for (const [c, t] of selecaoAtiva) {
				if (c === codigo) continue;
				if (hasConflict(tg.mask, t.mask)) return c;
			}
			return null;
		},

		/**
		 * Seleciona/troca a turma; retorna feedback de conflito p/ o "tenta inserir".
		 *
		 * A matéria trava sozinha aqui. Escolher turma na mão é uma decisão do aluno —
		 * "Montar grade" passa a respeitá-la e a só preencher o que sobrou, em vez de
		 * remontar tudo do zero por cima dela. O cadeado fica visível na lista e o
		 * aluno solta quando quiser que o solver remexa naquela matéria.
		 *
		 * Só o caminho manual passa por aqui: `montarAutomatico` escreve a seleção
		 * direto, então o resultado do solver NÃO sai travado — senão a segunda
		 * montagem já não teria o que otimizar.
		 */
		selecionarTurma(codigo: string, idTurma: number): SelecaoResultado {
			const tg = pool
				.find((m) => m.codigo === codigo)
				?.turmas.find((t) => t.turma.id_turmas === idTurma);
			if (!tg) return { ok: false, conflitaCom: null };
			const conflito = this.conflitaCom(codigo, tg);
			if (conflito) return { ok: false, conflitaCom: conflito };
			updateAtivo((sel) => ({ ...sel, [codigo]: idTurma }));
			if (!travadas.has(codigo)) travadas = new Set([...travadas, codigo]);
			return { ok: true, conflitaCom: null };
		},

		/** Tira a turma escolhida — e destrava, se era uma matéria travada. */
		removerTurma(codigo: string): void {
			updateAtivo((sel) => {
				const { [codigo]: _omit, ...rest } = sel;
				return rest;
			});
			if (travadas.has(codigo)) {
				const nt = new Set(travadas);
				nt.delete(codigo);
				travadas = nt;
			}
		},

		isCursandoAtual(codigo: string): boolean {
			return cursandoAtual.has(codigo);
		},

		isTravada(codigo: string): boolean {
			return travadasAtivas.has(codigo);
		},

		/**
		 * Marca quais códigos do pool já são matérias que o aluno está cursando agora
		 * — a rota chama isso logo depois do `init`. Se a turma já estava escolhida
		 * (restaurada do localStorage), trava de novo — sem isso a trava se perderia
		 * a cada reload mesmo com a seleção intacta.
		 */
		definirCursandoAtual(codigos: Iterable<string>): void {
			cursandoAtual = new Set([...codigos].map((c) => c.trim().toUpperCase()));
			const jaEscolhidas = [...cursandoAtual].filter((c) => selecaoAtiva.has(c));
			if (jaEscolhidas.length > 0) travadas = new Set([...travadas, ...jaEscolhidas]);
		},

		/** Destrava manualmente — o aluno quer que "Montar grade" mexa nessa também. */
		destravar(codigo: string): void {
			if (!travadas.has(codigo)) return;
			const nt = new Set(travadas);
			nt.delete(codigo);
			travadas = nt;
		},

		/**
		 * `docentesObrigatorios` (código → nome) hoje é BÔNUS de desempate (via
		 * `docenteBate`), não mais filtro rígido — a matéria nunca fica de fora só
		 * porque nenhuma turma bateu com o professor, ela só deixa de ganhar o
		 * bônus e pode sair com outro professor. Mescla com `docentesPersistidos`
		 * (confirmados numa sessão anterior); o argumento vence em caso de conflito.
		 *
		 * Matérias travadas (`travadas` — cursando agora, turma real já escolhida)
		 * ficam de fora do solver: a turma delas é fixa, só o horário conta como já
		 * ocupado pras outras otimizarem em volta (`mascaraInicial` do `autoMontarGrade`).
		 *
		 * `limiteCreditos` é o teto de créditos do semestre (o slider da tela). Sem
		 * ele a montagem enche a grade como sempre fez. Com ele, as matérias que o
		 * aluno já está cursando (`cursandoAtual`) entram primeiro e comem o
		 * orçamento — se elas sozinhas já estouram o teto, ninguém mais entra, mas
		 * nenhuma delas sai: a matrícula já aconteceu de verdade.
		 *
		 * `essencial` (código) é a única matéria desta montagem que NUNCA pode
		 * ficar de fora — ver docstring de `essencial` em `horario-slots.ts`. Se
		 * mesmo assim ela cair em `naoAlocadas`, o resultado vem com `erros`
		 * (`diagnosticarEssenciais`, chamado só neste caso — é a única situação em
		 * que vale o custo de classificar a causa).
		 */
		montarAutomatico(opts?: MontarOpts): MontagemResultado {
			const entrada = construirEntradaSolver(opts);
			const r = autoMontarGrade(entrada.materiasSolver, entrada.mascaraTravada, entrada.orcamento);

			let erros: ErroMontagem[] | undefined;
			if (entrada.essencialCodigo && r.naoAlocadas.includes(entrada.essencialCodigo)) {
				const materiaEssencial = pool.find((m) => m.codigo === entrada.essencialCodigo);
				const pendenciasPreRequisito = new Map<string, string[]>();
				if (materiaEssencial) {
					const pendencias = pendenciasPreRequisitoDe(materiaEssencial.idMateria);
					if (pendencias.length > 0) pendenciasPreRequisito.set(entrada.essencialCodigo, pendencias);
				}
				erros = diagnosticarEssenciais(entrada.materiasSolver, r.naoAlocadas, {
					turmasAntesDoFiltroDeTurno: entrada.turmasAntesDoFiltroDeTurno,
					turnosComOferta: entrada.turnosComOferta,
					pendenciasPreRequisito,
					mascaraInicial: entrada.mascaraTravada
				});
			}

			const novaSel: Record<string, number> = {};
			for (const codigo of travadasAtivas) {
				const tg = selecaoAtiva.get(codigo);
				if (tg) novaSel[codigo] = tg.turma.id_turmas;
			}
			for (const [codigo, t] of r.selecao) novaSel[codigo] = t.turma.id_turmas;
			grades = grades.map((g) => (g.id === activeId ? { ...g, selecao: novaSel } : g));
			ultimaMontagem = {
				naoAlocadas: r.naoAlocadas,
				truncado: r.truncado,
				candidatas: entrada.candidatasCount,
				...(erros ? { erros } : {})
			};
			persistCenarios();
			return ultimaMontagem;
		},

		/**
		 * Facade do frontend para `autoMontarGradeOpcoes`: monta até 6 grades
		 * alternativas (uma por `RankingStrategy` escolhida — "Menos dias", "Menos
		 * lacunas", "Semana equilibrada"), reaproveitando a MESMA entrada de
		 * candidatos que `montarAutomatico` — os dois não podem divergir em quem é
		 * candidato, só no bônus extra que cada estratégia soma por cima. Não aplica
		 * nada no cenário ativo sozinho — quem decide o que fazer com as opções é
		 * `popularOpcoes` (lista lado a lado, cenário por opção) ou `aplicarSelecao`
		 * (aplica uma seleção pronta direto), a critério de quem chama.
		 *
		 * `estrategias` (nomes) filtra as 3 padrão pelo que o aluno marcou no Passo 1
		 * do wizard (`MontadorParametros`) — nomes desconhecidos são ignorados; lista
		 * vazia/ausente cai nas 3 padrão (nunca gera zero opções por causa disto).
		 *
		 * Cada `OpcaoGrade.resultado.naoAlocadas`/`.selecao` já basta para quem chama
		 * decidir se a `essencial` coube (`MontadorGradeView` faz isso direto,
		 * `opcoes.some(o => o.resultado.selecao.has(essencial))`); quem quiser a causa
		 * estruturada (turno/pré-requisito/conflito) chama `diagnosticarEssenciais`
		 * por cima — mesmo padrão de `montarAutomatico`, só que não roda aqui de
		 * graça: com múltiplas opções o chamador é quem sabe se already tem o que
		 * precisa só olhando `naoAlocadas`.
		 */
		montarOpcoes(
			opts?: MontarOpts & { estrategias?: string[]; maxOpcoes?: number }
		): OpcaoGrade<TurmaOferta>[] {
			const entrada = construirEntradaSolver(opts);
			const epsilon = epsilonSeguro(PESO_SATURADO, Math.max(entrada.candidatasCount, 1));
			const padrao = construirEstrategiasPadrao(epsilon);
			const nomesEscolhidos = new Set(opts?.estrategias ?? []);
			const estrategias =
				nomesEscolhidos.size > 0 ? padrao.filter((e) => nomesEscolhidos.has(e.nome)) : padrao;

			return autoMontarGradeOpcoes(
				entrada.materiasSolver,
				entrada.mascaraTravada,
				entrada.orcamento,
				estrategias.length > 0 ? estrategias : padrao,
				opts?.maxOpcoes,
				(turma) => turma.id_turmas
			);
		},

		/**
		 * Diagnóstico estruturado de por que a `essencial` não coube em nenhuma
		 * `OpcaoGrade` de `montarOpcoes` — separado da montagem em si (ao contrário
		 * de `montarAutomatico`, que já embute isso em `erros`) porque, com múltiplas
		 * opções, saber SE coube é tão barato quanto `opcoes.some(...)` — só vale
		 * calcular a causa estruturada quando o chamador realmente precisa mostrá-la.
		 */
		diagnosticarEssencialDasOpcoes(
			opts: MontarOpts,
			naoAlocadas: string[]
		): ErroMontagem[] {
			const entrada = construirEntradaSolver(opts);
			if (!entrada.essencialCodigo) return [];
			const materiaEssencial = pool.find((m) => m.codigo === entrada.essencialCodigo);
			const pendenciasPreRequisito = new Map<string, string[]>();
			if (materiaEssencial) {
				const pendencias = pendenciasPreRequisitoDe(materiaEssencial.idMateria);
				if (pendencias.length > 0) pendenciasPreRequisito.set(entrada.essencialCodigo, pendencias);
			}
			return diagnosticarEssenciais(entrada.materiasSolver, naoAlocadas, {
				turmasAntesDoFiltroDeTurno: entrada.turmasAntesDoFiltroDeTurno,
				turnosComOferta: entrada.turnosComOferta,
				pendenciasPreRequisito,
				mascaraInicial: entrada.mascaraTravada
			});
		},

		/**
		 * Esvazia a grade (a lista de matérias continua).
		 *
		 * Destrava tudo junto: matéria travada fica fora do solver — a turma dela seria
		 * fixa — e, sem seleção, também fica fora da grade. Deixar trava órfã aqui fazia
		 * a matéria sumir da montagem seguinte sem nenhum aviso.
		 */
		limpar(): void {
			updateAtivo(() => ({}));
			travadas = new Set();
		},

		/**
		 * Esvazia tudo — lista de matérias e grade — e marca cada código como
		 * removido, para o recarregamento da página não re-semear o que o aluno
		 * acabou de apagar. "Voltar ao início" é o caminho de volta: ele zera as
		 * `removidas` e refaz o preenchimento automático.
		 */
		limparTudo(): void {
			const nr = new Set(removidas);
			// Matrícula em curso nunca entra em `removidas`: ela é fato consumado, não
			// sugestão do app. A rota filtra as em curso por `removidas` ao carregar, então
			// marcá-las aqui fazia "Limpar tudo" apagar em definitivo, de todo carregamento
			// seguinte, as matérias em que o aluno JÁ está matriculado.
			for (const m of pool) if (!cursandoAtual.has(m.codigo)) nr.add(m.codigo);
			removidas = nr;
			pool = [];
			prioritarias = new Set();
			travadas = new Set();
			const id = novoId();
			grades = [{ id, nome: 'Grade 1', selecao: {}, origem: 'usuario' }];
			activeId = id;
			ultimaMontagem = null;
			persistPool();
			persistCenarios();
		},

		/**
		 * Volta o montador ao estado de início: pool recém-semeado, um único cenário
		 * "Grade 1" com a seleção dada (turmas reais das matérias em curso), sem
		 * removidas/prioridades/travas/filtro de turno de sessões passadas. Quem
		 * calcula pool e seleção é a rota — o store só aplica e persiste.
		 */
		resetarParaInicio(poolInicial: MateriaGrade[], selecao: Record<string, number> = {}): void {
			pool = poolInicial;
			removidas = new Set();
			prioritarias = new Set();
			travadas = new Set();
			cursandoAtual = new Set();
			turnosPermitidos = new Set<Turno>(['M', 'T', 'N']);
			const id = novoId();
			grades = [{ id, nome: 'Grade 1', selecao: reconciliar(selecao), origem: 'usuario' }];
			activeId = id;
			ultimaMontagem = null;
			persistPool();
			persistCenarios();
		},

		/**
		 * Tira matérias da seleção até caber em `limite` créditos — usado pelo slider
		 * de créditos: puramente aditivo em relação ao que já está selecionado, nunca
		 * roda o solver de novo (arrastar o slider não deveria trocar turmas que o
		 * aluno já escolheu, só encolher a lista).
		 *
		 * A ordem de corte é a MESMA escada de prioridade da montagem (`PESO_*`),
		 * invertida: sai primeiro a optativa, depois a obrigatória da matriz, e a
		 * prioritária só quando não sobra mais nada. Dentro de cada degrau, a de mais
		 * crédito primeiro — sai menos matéria para abrir o mesmo espaço.
		 *
		 * A natureza precisa entrar aqui também, e não só no solver: ordenar apenas por
		 * crédito cortava a obrigatória de 4 créditos e preservava duas optativas de 2,
		 * desfazendo pelo slider exatamente a priorização que a montagem tinha acabado
		 * de fazer.
		 *
		 * Matéria que o aluno já está cursando (`cursandoAtual`) nunca é candidata — o
		 * slider não desmatricula ninguém de uma matéria de matrícula já efetivada.
		 * É `cursandoAtivo` que garante isso, e não a trava: a trava só nasce quando o
		 * aluno escolhe turma na mão, então logo depois de "Montar grade" o conjunto
		 * `travadas` está vazio e era justamente aí que o slider jogava MATR fora.
		 *
		 * Matéria travada na mão, essa SAI: o slider é o aluno pedindo menos créditos,
		 * e alguma coisa tem de ceder. Sai destravando junto — trava sem seleção deixa
		 * a matéria fora do solver e fora da grade, isto é, some sem aviso.
		 */
		ajustarParaLimite(limite: number): void {
			if (creditosSelecionados <= limite) return;
			/**
			 * Quanto vale manter — a MESMA escada da montagem, não uma segunda
			 * opinião: o slider corta pelo mesmo critério que o solver usou para
			 * escolher, senão arrastá-lo desfaz a priorização que acabou de acontecer.
			 * Deriva de `pesoDaNatureza` justamente para as duas não divergirem.
			 */
			const valorDe = (codigo: string): number => {
				if (prioritarias.has(codigo)) return PESO_PRIORITARIA;
				const m = pool.find((x) => x.codigo === codigo);
				return pesoDaNatureza(m?.natureza, situacao, m?.optatoria === true);
			};
			const candidatos = [...selecaoAtiva.keys()]
				.filter((codigo) => !cursandoAtivo.has(codigo))
				.map((codigo) => ({
					codigo,
					valor: valorDe(codigo),
					creditos: pool.find((m) => m.codigo === codigo)?.creditos ?? 0
				}))
				.sort(
					(a, b) => a.valor - b.valor || b.creditos - a.creditos || a.codigo.localeCompare(b.codigo)
				);

			let atual = creditosSelecionados;
			const remover = new Set<string>();
			for (const c of candidatos) {
				if (atual <= limite) break;
				remover.add(c.codigo);
				atual -= c.creditos;
			}
			if (remover.size === 0) return;
			updateAtivo((sel) => {
				const out = { ...sel };
				for (const codigo of remover) delete out[codigo];
				return out;
			});
			if ([...remover].some((c) => travadas.has(c))) {
				travadas = new Set([...travadas].filter((c) => !remover.has(c)));
			}
			ultimaMontagem = null;
		},

		// ─── Cenários ────────────────────────────────────────────────────────────
		criarCenario(nome?: string): void {
			const id = novoId();
			grades = [
				...grades,
				{ id, nome: nome?.trim() || `Grade ${grades.length + 1}`, selecao: {}, origem: 'usuario' }
			];
			activeId = id;
			ultimaMontagem = null;
			persistCenarios();
		},

		renomearCenario(id: string, nome: string): void {
			grades = grades.map((g) => (g.id === id ? { ...g, nome: nome.trim() || g.nome } : g));
			persistCenarios();
		},

		removerCenario(id: string): void {
			if (grades.length <= 1) {
				// Nunca fica sem cenário: limpa o único que existe.
				grades = grades.map((g) => ({ ...g, selecao: {} }));
				ultimaMontagem = null;
				persistCenarios();
				return;
			}
			const idx = grades.findIndex((g) => g.id === id);
			grades = grades.filter((g) => g.id !== id);
			if (activeId === id) activeId = grades[Math.max(0, idx - 1)]?.id ?? grades[0].id;
			ultimaMontagem = null;
			persistCenarios();
		},

		selecionarCenario(id: string): void {
			if (grades.some((g) => g.id === id)) {
				activeId = id;
				ultimaMontagem = null;
				persistCenarios();
			}
		}
	};
}

export const gradeStore = createGradeStore();

/** Reexport utilitário para a página construir máscaras a partir do horário. */
export { slotMaskFromHorario };
