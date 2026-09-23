/**
 * Núcleo algorítmico do Montador de Grade.
 *
 * Os horários da UnB são discretos: por dia há 16 módulos possíveis
 * (M1–M5, T1–T7, N1–N4) e a semana útil vai de segunda (2) a sábado (7).
 * Cada horário SIGAA (ex.: "246M12 35T34") é convertido num **bitmask BigInt**
 * de 96 bits (6 dias × 16 módulos), o que torna a detecção de conflito uma
 * simples operação bit-a-bit — exata e O(1), sem edge cases de intervalo.
 *
 * Layout do bit: `diaIndex(0..5) * 16 + offsetTurno + (modulo - 1)`,
 * com offsetTurno M=0, T=5, N=12. Reaproveita o mesmo padrão de código do
 * parser de exibição em `sigaa.ts` (formatHorarioSigaa).
 */

/** '2'(Seg)..'7'(Sáb) → 0..5. */
const DIA_INDEX: Record<string, number> = { '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5 };

/** Deslocamento do turno dentro do dia (16 slots/dia). */
const TURNO_OFFSET: Record<'M' | 'T' | 'N', number> = { M: 0, T: 5, N: 12 };

/** Módulo máximo válido por turno (evita colisão entre turnos). */
const TURNO_MAX_MODULO: Record<'M' | 'T' | 'N', number> = { M: 5, T: 7, N: 4 };

// Mesmo padrão usado em sigaa.ts: dias + turno + módulos (ex.: 24M12, 6N1234).
const HORARIO_REGEX = /([2-7]+)\s*([MTN])\s*([1-7]+)/g;

/**
 * Converte um horário SIGAA num bitmask de slots da semana.
 * Retorna `0n` para entradas vazias, nulas ou sem padrão reconhecível
 * (ex.: EAD / "A DEFINIR") — máscara vazia nunca conflita.
 */
export function slotMaskFromHorario(rawHorario: string | null | undefined): bigint {
	const raw = String(rawHorario ?? '')
		.trim()
		.toUpperCase();
	if (!raw) return 0n;

	let mask = 0n;
	// Regex global é stateful; instância local evita problemas de reentrância.
	const regex = new RegExp(HORARIO_REGEX.source, 'g');
	let match: RegExpExecArray | null = regex.exec(raw);

	while (match) {
		const diasCod = match[1] ?? '';
		const turno = (match[2] ?? 'M') as 'M' | 'T' | 'N';
		const modulosCod = match[3] ?? '';
		const maxModulo = TURNO_MAX_MODULO[turno];

		for (const d of diasCod) {
			const diaIndex = DIA_INDEX[d];
			if (diaIndex === undefined) continue;
			for (const m of modulosCod) {
				const modulo = Number(m);
				if (modulo < 1 || modulo > maxModulo) continue; // fora da faixa do turno
				const bitIndex = diaIndex * 16 + TURNO_OFFSET[turno] + (modulo - 1);
				mask |= 1n << BigInt(bitIndex);
			}
		}
		match = regex.exec(raw);
	}

	return mask;
}

/** Duas máscaras conflitam se compartilham ao menos um slot. */
export function hasConflict(a: bigint, b: bigint): boolean {
	return (a & b) !== 0n;
}

// ─── Metadados para renderização da grade ────────────────────────────────────

/** Colunas da grade: segunda a sábado. */
export const DIAS_SEMANA: ReadonlyArray<{ cod: string; label: string }> = [
	{ cod: '2', label: 'Seg' },
	{ cod: '3', label: 'Ter' },
	{ cod: '4', label: 'Qua' },
	{ cod: '5', label: 'Qui' },
	{ cod: '6', label: 'Sex' },
	{ cod: '7', label: 'Sáb' }
];

export interface SlotMeta {
	turno: 'M' | 'T' | 'N';
	modulo: number;
	/** Deslocamento dentro do dia (0..15) — TURNO_OFFSET + (modulo-1). */
	offset: number;
	/** Rótulo compacto (ex.: "M1"). */
	label: string;
	/** Horário de início (ex.: "08:00"). Espelha o SLOT_MAP de sigaa.ts. */
	inicio: string;
	/** Horário de fim (ex.: "08:55"). */
	fim: string;
}

const HORA_INICIO: Record<'M' | 'T' | 'N', Record<number, string>> = {
	M: { 1: '08:00', 2: '08:55', 3: '10:00', 4: '10:55', 5: '12:00' },
	T: { 1: '12:55', 2: '14:00', 3: '14:55', 4: '16:00', 5: '16:55', 6: '18:00', 7: '18:55' },
	N: { 1: '19:00', 2: '19:50', 3: '20:50', 4: '21:40' }
};

const HORA_FIM: Record<'M' | 'T' | 'N', Record<number, string>> = {
	M: { 1: '08:55', 2: '09:50', 3: '10:55', 4: '11:50', 5: '12:55' },
	T: { 1: '13:50', 2: '14:55', 3: '15:50', 4: '16:55', 5: '17:50', 6: '18:55', 7: '19:50' },
	N: { 1: '19:50', 2: '20:40', 3: '21:40', 4: '22:30' }
};

/** Linhas da grade, em ordem: M1–M5, T1–T7, N1–N4. */
export const SLOTS_DIA: readonly SlotMeta[] = (['M', 'T', 'N'] as const).flatMap((turno) =>
	Array.from({ length: TURNO_MAX_MODULO[turno] }, (_, i): SlotMeta => {
		const modulo = i + 1;
		return {
			turno,
			modulo,
			offset: TURNO_OFFSET[turno] + i,
			label: `${turno}${modulo}`,
			inicio: HORA_INICIO[turno][modulo],
			fim: HORA_FIM[turno][modulo]
		};
	})
);

/** Índice do bit para um dia (cód. SIGAA) e o offset do slot dentro do dia. */
export function bitIndex(diaCod: string, offsetNoDia: number): number {
	return (DIA_INDEX[diaCod] ?? 0) * 16 + offsetNoDia;
}

export type Turno = 'M' | 'T' | 'N';
const TODOS_TURNOS: readonly Turno[] = ['M', 'T', 'N'];

/** Máscara com todos os slots dos turnos indicados, em todos os dias da semana. */
export function maskDosTurnos(turnos: Iterable<Turno>): bigint {
	const set = new Set(turnos);
	if (set.size === 0) return 0n;
	let mask = 0n;
	for (let dia = 0; dia < DIAS_SEMANA.length; dia++) {
		for (const slot of SLOTS_DIA) {
			if (set.has(slot.turno)) mask |= 1n << BigInt(dia * 16 + slot.offset);
		}
	}
	return mask;
}

/**
 * A turma cabe apenas nos turnos permitidos? Sem filtro (retorna true) quando o
 * conjunto está vazio ou tem os 3 turnos. Turma sem horário (mask 0n) sempre cabe.
 */
export function turmaRespeitaTurnos(mask: bigint, turnosPermitidos: Set<Turno>): boolean {
	if (turnosPermitidos.size === 0 || turnosPermitidos.size === 3) return true;
	const proibidos = TODOS_TURNOS.filter((t) => !turnosPermitidos.has(t));
	return (mask & maskDosTurnos(proibidos)) === 0n;
}

export interface BlocoDia {
	/** Código da matéria que ocupa o bloco. */
	codigo: string;
	/** Índice do primeiro slot (posição em `SLOTS_DIA`). */
	offsetStart: number;
	/** Quantos slots consecutivos o bloco cobre. */
	span: number;
}

/**
 * Agrupa módulos consecutivos da mesma matéria num único bloco (para o calendário
 * estilo "Google Agenda"). Recebe, para um dia, o código que ocupa cada posição de
 * `SLOTS_DIA` (ou `null`/`undefined` se livre). Buracos e trocas de matéria quebram
 * o bloco.
 */
export function agruparBlocosDia(
	codigosPorOffset: ReadonlyArray<string | null | undefined>
): BlocoDia[] {
	const blocos: BlocoDia[] = [];
	const n = codigosPorOffset.length;
	let i = 0;
	while (i < n) {
		const codigo = codigosPorOffset[i];
		if (!codigo) {
			i++;
			continue;
		}
		let j = i + 1;
		while (j < n && codigosPorOffset[j] === codigo) j++;
		blocos.push({ codigo, offsetStart: i, span: j - i });
		i = j;
	}
	return blocos;
}

// ─── Montagem automática (interval scheduling / backtracking) ────────────────

export interface TurmaComMask<T> {
	mask: bigint;
	turma: T;
}

/** Turma candidata na montagem automática, com o bônus de preferência já calculado. */
export type TurmaCandidata<T> = TurmaComMask<T> & {
	/**
	 * O quanto esta turma atende às preferências do aluno (horário/professor).
	 * É só critério de **desempate**: quem calcula os bônus deve manter
	 * `peso` de matéria > soma máxima de bônus possível, para que encaixar mais uma
	 * matéria nunca perca para agradar uma preferência (ver grade.store).
	 */
	bonus?: number;
};

export interface MateriaTurmas<T> {
	/** Identificador da matéria (código ou id) usado como chave da seleção. */
	chave: string;
	/** Turmas ofertadas para a matéria, cada uma com sua máscara de horário. */
	turmas: Array<TurmaCandidata<T>>;
	/**
	 * Peso para priorização na montagem automática (default 1). Quanto maior, mais
	 * o montador prefere encaixá-la quando nem tudo cabe sem conflito.
	 */
	peso?: number;
	/**
	 * Quanto a matéria consome do `orcamentoCreditos` (default 0). Sem orçamento o
	 * campo é ignorado.
	 */
	creditos?: number;
	/**
	 * Matéria que entra de qualquer jeito: gasta do orçamento, mas nunca é barrada
	 * por ele. É o caso da matrícula que já aconteceu de verdade (MATR) — deixá-la
	 * de fora pra caber no teto de créditos não muda a realidade do aluno, só
	 * esconde a matéria da grade.
	 */
	obrigatoria?: boolean;
	/**
	 * Matéria que NUNCA pode ficar de fora da grade — não é "prioridade alta", é
	 * restrição rígida. A escada de pesos já usada pelo chamador (`PESO_CURSANDO` >
	 * `PESO_PRIORITARIA` > ...) não tem espaço sobrando entre dois degraus para
	 * inserir um degrau numérico novo ali (ver `pesoDominanteEssencial` em
	 * `autoMontarGrade`), então o peso efetivo de uma `essencial` é calculado
	 * DINAMICAMENTE por chamada — maior que a soma de todas as matérias
	 * não-essenciais do pool — em vez de ser um degrau fixo na escada do chamador.
	 * Isso garante "nunca pulada quando cabe" pela própria otimização por soma de
	 * peso: nenhuma combinação de não-essenciais consegue valer mais do que incluir
	 * a essencial. (Uma versão anterior tentou resolver isso desabilitando a opção
	 * "deixar de fora" do backtracking só para quem é essencial — não bastava: numa
	 * essencial que CONFLITA em horário com uma matéria de peso alto, a otimização
	 * por soma de peso descarta a essencial na alocação em si, sem nunca passar
	 * pela opção de "deixar de fora" — só o peso dominante resolve os dois casos.)
	 *
	 * Isto NÃO cobre o orçamento de créditos por conta própria: quem monta
	 * `MateriaTurmas` fora desta função é responsável por também setar
	 * `obrigatoria = matriculaReal || essencial` (embora `autoMontarGrade` também
	 * trate `essencial` como budget-exempt internamente, em defesa de profundidade).
	 */
	essencial?: boolean;
}

/**
 * Motivo estruturado de uma matéria `essencial` não ter sido alocada —
 * devolvido por `diagnosticarEssenciais`, não por `autoMontarGrade` (que não
 * tem contexto de turno/pré-requisito: isso é responsabilidade de quem chama).
 */
export type ErroMontagem =
	| { tipo: 'ESSENCIAL_SEM_VAGA'; chave: string }
	| { tipo: 'ESSENCIAL_PRE_REQUISITO'; chave: string; pendencias: string[] }
	| { tipo: 'ESSENCIAL_FORA_DO_TURNO'; chave: string; turnosComOferta: Array<'M' | 'T' | 'N'> }
	| { tipo: 'ESSENCIAL_CONFLITO'; chave: string; colideCom: string[] };

/**
 * Teto de nós explorados na montagem automática. Com a poda sensível ao acumulado
 * um pool real resolve em centenas de nós; o teto existe só para garantir que
 * nenhuma entrada inesperada trave a aba do aluno.
 */
export const MAX_NOS_MONTAGEM = 200_000;

/**
 * `bonus` por turma, com o default de 0 já aplicado. Compartilhado entre
 * `autoMontarGrade`, o reparo de maximalidade e o cálculo de métricas das
 * opções — todos precisam da mesma leitura, então mora num só lugar.
 */
function bonusDe(t: { bonus?: number }): number {
	return t.bonus ?? 0;
}

export interface AutoMontarResult<T> {
	/** Turma escolhida por matéria (chave → turma selecionada). */
	selecao: Map<string, TurmaCandidata<T>>;
	/** Chaves das matérias que não couberam — por conflito ou por teto de créditos. */
	naoAlocadas: string[];
	/**
	 * Chaves alocadas numa turma que não atinge o melhor bônus disponível para a
	 * matéria — ou seja, a preferência declarada teve de ceder para caber na grade.
	 */
	preferenciasNaoAtendidas: string[];
	/**
	 * A busca bateu no teto de nós e parou antes de esgotar as combinações. A grade
	 * devolvida é válida e sem conflito, mas pode não ser a melhor possível.
	 */
	truncado: boolean;
	/**
	 * Diagnóstico estruturado de por que alguma `essencial` não coube. Sempre `[]`
	 * aqui — `autoMontarGrade` não tem o contexto de turno/pré-requisito necessário
	 * para classificar a causa (isso mora em quem chama). Ver `diagnosticarEssenciais`.
	 */
	erros: ErroMontagem[];
}

/**
 * Escolhe, via *branch and bound*, uma turma por matéria de modo que nenhuma
 * sobreponha horário com outra, **maximizando** o número de matérias alocadas.
 *
 * Preferências de horário/professor entram como `bonus` por turma e funcionam só
 * como desempate: desde que o chamador mantenha `peso` de matéria maior que a soma
 * máxima de bônus, encaixar mais uma matéria sempre ganha de agradar uma
 * preferência. Quem teve de ceder volta em `preferenciasNaoAtendidas`.
 *
 * A poda de `limiteSuperior` é o que mantém isso viável: sem ela, qualquer pool em
 * que o ótimo teórico seja inalcançável — uma matéria sem oferta no semestre, ou
 * turmas descartadas pelo filtro de turno — varre o espaço de busca inteiro
 * (~10 matérias × ~12 turmas passa de 10⁸ nós) e trava a thread principal por
 * minutos.
 *
 * Matérias sem turma disponível — ou que não couberam — voltam em `naoAlocadas`.
 *
 * `mascaraInicial` é horário já ocupado por fora de `materias` — matérias travadas
 * (ex.: o aluno já está cursando e escolheu a turma real) que o solver não pode
 * mexer nem sobrepor, mas conta pra poda de conflito como se fosse mais uma turma
 * escolhida desde o nó raiz (ver `gradeStore.montarAutomatico`).
 *
 * `orcamentoCreditos` (opcional) é o teto de créditos da grade: matéria comum só é
 * alocada se couber no que sobra, e matéria `obrigatoria` entra de qualquer forma —
 * gastando do orçamento, o que pode saturá-lo e barrar todas as outras. Sem o
 * argumento os créditos são ignorados por completo.
 */
export function autoMontarGrade<T>(
	materias: Array<MateriaTurmas<T>>,
	mascaraInicial: bigint = 0n,
	orcamentoCreditos?: number
): AutoMontarResult<T> {
	const pesoBase = (m: MateriaTurmas<T>) => m.peso ?? 1;
	/**
	 * Peso efetivo de uma matéria `essencial`: dominante sobre a soma de TODAS as
	 * não-essenciais do pool, não um degrau numérico fixo na escada do chamador
	 * (que não tem espaço sobrando — ver nota em `MateriaTurmas.essencial`).
	 *
	 * Isso é o que garante "nunca pulada quando cabe" — não a ausência de Opção B.
	 * A tentativa anterior desabilitava a Opção B só para essencial e achava que
	 * bastava; não basta: quando a essencial CONFLITA com uma matéria de peso alto
	 * (em vez de simplesmente estar ausente do ramo), a otimização por soma de peso
	 * escolhe a de peso maior de qualquer jeito — a Opção B nunca precisa ser
	 * tentada para isso acontecer, o conflito descarta a essencial na Opção A. Só um
	 * peso que domine a soma de tudo que poderia substituí-la resolve os dois casos
	 * (conflito e ausência) com o mesmo mecanismo já usado no resto do arquivo
	 * (mesma ideia de `FATOR_ENTRE_DEGRAUS` em `grade.store.svelte.ts`, computada
	 * aqui dinamicamente por pool em vez de graduada estaticamente, porque a escada
	 * do chamador já não tem espaço entre PRIORITARIA e CURSANDO).
	 */
	const somaNaoEssenciais = materias.reduce(
		(acc, m) => acc + (m.essencial === true ? 0 : pesoBase(m)),
		0
	);
	const pesoDominanteEssencial = somaNaoEssenciais + 1;
	const pesoDe = (m: MateriaTurmas<T>) =>
		m.essencial === true ? pesoDominanteEssencial : pesoBase(m);
	const creditosDe = (m: MateriaTurmas<T>) => m.creditos ?? 0;
	/**
	 * Cabe no teto de créditos, dado o quanto já foi gasto? Obrigatória e essencial
	 * sempre cabem (uma é a realidade, a outra é o que o aluno decidiu que tem que
	 * entrar — nenhuma das duas é o que o teto de créditos deveria filtrar). Sem
	 * orçamento, todo mundo cabe. Checar `essencial` aqui também (e não só confiar
	 * que quem monta os dados setou `obrigatoria = matriculaReal || essencial`) é
	 * defesa em profundidade: "essencial ignora o limite de horas" é garantia desta
	 * função, não depende de disciplina do chamador.
	 */
	const cabeNoOrcamento = (m: MateriaTurmas<T>, gasto: number): boolean =>
		orcamentoCreditos === undefined || m.obrigatoria === true || m.essencial === true
			? true
			: gasto + creditosDe(m) <= orcamentoCreditos;
	const melhorBonusDe = (m: MateriaTurmas<T>) =>
		m.turmas.reduce((max, t) => Math.max(max, bonusDe(t)), 0);

	// Matérias de maior peso primeiro e, dentro de cada uma, as turmas que mais
	// atendem à preferência — assim o primeiro mergulho já encontra uma solução boa
	// e a poda descarta o resto cedo.
	//
	// Turmas com a mesma máscara são intercambiáveis para o encaixe (só o horário
	// importa), então basta manter a de maior bônus: corta um fator de ramificação
	// grande, já que é comum a matéria ter várias turmas no mesmo horário.
	const ordenadas = [...materias]
		.sort((a, b) => pesoDe(b) - pesoDe(a))
		.map((m) => {
			const porMask = new Map<bigint, TurmaCandidata<T>>();
			for (const t of [...m.turmas].sort((x, y) => bonusDe(y) - bonusDe(x))) {
				if (!porMask.has(t.mask)) porMask.set(t.mask, t);
			}
			return { ...m, turmas: [...porMask.values()] };
		});

	let melhorSelecao: Map<string, TurmaCandidata<T>> = new Map();
	let melhorPeso = -1;
	const atual = new Map<string, TurmaCandidata<T>>();
	let pesoAtual = 0;
	/** Créditos já comprometidos no ramo em exploração. */
	let creditosAtual = 0;
	let nos = 0;
	let truncado = false;

	/**
	 * Limite superior do que ainda dá para somar do índice `i` em diante, dado o
	 * horário já ocupado (`accMask`).
	 *
	 * O ponto crucial é ele ser **sensível ao acumulado**: uma matéria cujas turmas
	 * já colidem todas com `accMask` não pode mais entrar (a máscara só cresce), e
	 * por isso não conta. Um limite estático — "toda matéria na sua melhor turma" —
	 * fica frouxo demais justo nos casos que interessam: basta uma matéria sem
	 * oferta para o ótimo teórico virar inalcançável, nenhuma poda disparar e a
	 * busca varrer o espaço inteiro.
	 *
	 * As turmas estão ordenadas por bônus decrescente, então a primeira compatível
	 * já é a de maior bônus da matéria.
	 *
	 * O orçamento entra pelo mesmo motivo: quem sozinha já não cabe no que sobra de
	 * crédito não pode mais entrar em ramo nenhum. É uma relaxação da mochila (ignora
	 * que duas que cabem sozinhas podem não caber juntas), então continua sendo um
	 * limite superior legítimo — só bem mais apertado que ignorar créditos.
	 */
	function limiteSuperior(i: number, accMask: bigint, gasto: number): number {
		let total = 0;
		for (let j = i; j < ordenadas.length; j++) {
			const m = ordenadas[j];
			if (!cabeNoOrcamento(m, gasto)) continue;
			for (const t of m.turmas) {
				if (hasConflict(t.mask, accMask)) continue;
				total += pesoDe(m) + bonusDe(t);
				break;
			}
		}
		return total;
	}

	function recurse(i: number, accMask: bigint): void {
		// Maximiza a soma dos pesos alocados (não só a contagem).
		if (pesoAtual > melhorPeso) {
			melhorPeso = pesoAtual;
			melhorSelecao = new Map(atual);
		}
		if (i >= ordenadas.length) return;
		// Rede de segurança: isto roda síncrono no clique do aluno. Num pool
		// patológico, para a busca e devolve a melhor grade encontrada até aqui —
		// que é sempre válida e sem conflito, só não comprovadamente ótima.
		if (nos >= MAX_NOS_MONTAGEM) {
			truncado = true;
			return;
		}
		nos++;
		// Poda: nem alocando tudo o que ainda cabe dá para superar o melhor achado.
		if (pesoAtual + limiteSuperior(i, accMask, creditosAtual) <= melhorPeso) return;

		const m = ordenadas[i];

		// Opção A: tentar alocar uma turma que não conflite com o acumulado — só se
		// a matéria ainda couber no orçamento de créditos.
		if (cabeNoOrcamento(m, creditosAtual)) {
			for (const t of m.turmas) {
				if (hasConflict(t.mask, accMask)) continue;
				atual.set(m.chave, t);
				pesoAtual += pesoDe(m) + bonusDe(t);
				creditosAtual += creditosDe(m);
				recurse(i + 1, accMask | t.mask);
				creditosAtual -= creditosDe(m);
				pesoAtual -= pesoDe(m) + bonusDe(t);
				atual.delete(m.chave);
			}
		}

		// Opção B: deixar esta matéria de fora e seguir. Sempre disponível, mesmo
		// para essencial — é o peso dominante (`pesoDominanteEssencial`) que garante
		// "nunca pulada quando cabe", não a ausência desta opção. Desabilitar a
		// Opção B só para essencial (tentativa anterior) quebrava o caso em que ela
		// não tem turma nenhuma: sem Opção A nem B, o ramo morria sem recursar pras
		// matérias seguintes, travando a busca inteira em vez de só reportar a
		// essencial em `naoAlocadas` e continuar montando o resto.
		recurse(i + 1, accMask);
	}

	recurse(0, mascaraInicial);

	const naoAlocadas: string[] = [];
	const preferenciasNaoAtendidas: string[] = [];
	for (const m of materias) {
		const escolhida = melhorSelecao.get(m.chave);
		if (!escolhida) {
			naoAlocadas.push(m.chave);
			continue;
		}
		const melhor = melhorBonusDe(m);
		// Só reporta quem declarou preferência (melhor > 0) e não conseguiu o melhor.
		if (melhor > 0 && bonusDe(escolhida) < melhor) preferenciasNaoAtendidas.push(m.chave);
	}

	return { selecao: melhorSelecao, naoAlocadas, preferenciasNaoAtendidas, truncado, erros: [] };
}

/**
 * Classifica por que cada `essencial` em `naoAlocadas` não coube, em ordem de
 * causa mais específica primeiro. Função sequencial simples (não formalizada
 * como Chain of Responsibility — poucas checagens fixas, `if/else` documentado
 * já é o padrão deste arquivo) porque `autoMontarGrade` não sabe nada de turno
 * ou pré-requisito: esse contexto só existe na camada de cima (`grade.store` /
 * `montador_grade.service`), que chama isto depois do solve.
 *
 * Ordem de classificação (a primeira que bate decide):
 * 1. `ESSENCIAL_FORA_DO_TURNO` — existiam turmas antes do filtro de turno, mas
 *    nenhuma sobrou depois. O filtro de turno é a causa, não a oferta.
 * 2. `ESSENCIAL_SEM_VAGA` — zero turmas mesmo sem filtro de turno nenhum. Não
 *    tem o que a montagem automática pudesse ter feito.
 * 3. `ESSENCIAL_PRE_REQUISITO` — existem turmas, mas o aluno não pode cursar
 *    (pré-requisito pendente, checado por quem chama via `evaluateExpressaoLogica`).
 * 4. `ESSENCIAL_CONFLITO` — nenhuma das anteriores explica: sobrou conflito de
 *    horário real com outra essencial (ou com `mascaraInicial`, ex. matéria já
 *    cursando/travada). Resolvido rodando um sub-solve enxuto só com o
 *    subconjunto `essencial: true` — pool pequeno, não é o gargalo do solve
 *    principal — e reportando quem não coube junto dela nesse universo restrito.
 */
export function diagnosticarEssenciais<T>(
	materias: Array<MateriaTurmas<T>>,
	naoAlocadas: string[],
	contexto: {
		/** chave -> turmas ANTES do filtro de turno (ausente = não se aplica). */
		turmasAntesDoFiltroDeTurno: Map<string, unknown[]>;
		turnosComOferta: Map<string, Array<'M' | 'T' | 'N'>>;
		/** vazio/ausente = sem pendência. */
		pendenciasPreRequisito: Map<string, string[]>;
		/**
		 * Horário já ocupado fora de `materias` (matérias travadas) no solve
		 * original — mesmo papel que `mascaraInicial` em `autoMontarGrade`. Campo
		 * opcional e aditivo: sem ele o sub-solve de `ESSENCIAL_CONFLITO` assume
		 * `0n`, o que ainda classifica corretamente conflitos entre essenciais mas
		 * não enxerga conflito com uma trava externa (ver nota no relatório final).
		 */
		mascaraInicial?: bigint;
	}
): ErroMontagem[] {
	const erros: ErroMontagem[] = [];

	for (const chave of naoAlocadas) {
		const materia = materias.find((m) => m.chave === chave);
		if (!materia || materia.essencial !== true) continue;

		const antesDoFiltro = contexto.turmasAntesDoFiltroDeTurno.get(chave);
		const semTurmaDepoisDoFiltro = materia.turmas.length === 0;

		if (antesDoFiltro && antesDoFiltro.length > 0 && semTurmaDepoisDoFiltro) {
			erros.push({
				tipo: 'ESSENCIAL_FORA_DO_TURNO',
				chave,
				turnosComOferta: contexto.turnosComOferta.get(chave) ?? []
			});
			continue;
		}

		if (semTurmaDepoisDoFiltro) {
			erros.push({ tipo: 'ESSENCIAL_SEM_VAGA', chave });
			continue;
		}

		const pendencias = contexto.pendenciasPreRequisito.get(chave);
		if (pendencias && pendencias.length > 0) {
			erros.push({ tipo: 'ESSENCIAL_PRE_REQUISITO', chave, pendencias });
			continue;
		}

		const essenciais = materias.filter((m) => m.essencial === true);
		const subResultado = autoMontarGrade(essenciais, contexto.mascaraInicial ?? 0n, undefined);
		const colideCom = subResultado.selecao.has(chave)
			? // A própria chave coube no sub-solve: quem colide é quem sobrou de fora
				// desse universo restrito, junto dela.
				subResultado.naoAlocadas.filter((c) => c !== chave)
			: // Nem sozinha (contra `mascaraInicial`/as demais essenciais) ela coube
				// no sub-solve: reporta quem ficou no lugar dela.
				[...subResultado.selecao.keys()];
		erros.push({ tipo: 'ESSENCIAL_CONFLITO', chave, colideCom });
	}

	return erros;
}

/**
 * Teto seguro de bônus por turma, dado o menor degrau de peso da escada do
 * chamador (`PESO_SATURADO` em `grade.store.svelte.ts` — este arquivo continua
 * puro, sem importar o store) e o tamanho máximo esperado do pool de turmas
 * que pode entrar junto na mesma grade.
 *
 * Reaproveita a mesma invariante já documentada em `TurmaCandidata.bonus`: a
 * soma máxima de bônus tem de ficar abaixo do menor peso de matéria, ou
 * preferência passa a deslocar necessidade (o oposto do que `bonus` deveria
 * fazer — é só desempate). No pior caso, `tamanhoMaximoPool` turmas entram na
 * mesma grade, cada uma no teto do próprio bônus; por isso o teto por turma é
 * `menorPeso / (2 * tamanhoMaximoPool)`: a soma máxima possível
 * (`tamanhoMaximoPool * teto`) fica em `menorPeso / 2`, com folga de 2× que
 * absorve o bônus de professor (b) e o bônus adicional de uma `RankingStrategy`
 * (c) coexistindo na mesma turma sem juntos furarem a invariante.
 */
export function epsilonSeguro(menorPeso: number, tamanhoMaximoPool: number): number {
	if (tamanhoMaximoPool <= 0) return menorPeso;
	return menorPeso / (2 * tamanhoMaximoPool);
}

// ─── Múltiplas opções com scoring (Strategy) ──────────────────────────────────

/**
 * Uma forma de pontuar turmas na montagem automática (ex.: "menos dias",
 * "menos lacunas", "semana equilibrada"). `autoMontarGradeOpcoes` roda o
 * solver uma vez por estratégia e soma `pontuar` como bônus ADICIONAL sobre o
 * `bonus` que a turma já tinha (preferência de horário/professor do aluno) —
 * as duas fontes de bônus convivem, a estratégia nunca substitui a preferência.
 */
export interface RankingStrategy<T> {
	nome: string;
	pontuar(turma: TurmaCandidata<T>, materia: MateriaTurmas<T>): number;
}

export interface MetricasOpcao {
	diasComAula: number;
	minutosDeLacuna: number;
	horasTotais: number;
	/** Variância populacional dos minutos totais de aula por dia (dias vazios = 0). */
	variancaCargaDiaria: number;
	/**
	 * Para a(s) matéria(s) `essencial`: a turma escolhida tem `bonus > 0`? Sem
	 * nenhuma essencial no pool, vacuamente `true` (nada para atender).
	 */
	professorEssencialAtendido: boolean;
}

export interface OpcaoGrade<T> {
	estrategia: string;
	resultado: AutoMontarResult<T>;
	metricas: MetricasOpcao;
}

/** Minutos desde 00:00 de um horário "HH:MM" (mesmo formato de `SlotMeta`). */
function minutosDoDia(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
}

/** Duração real (minutos) do slot em `offset` de `SLOTS_DIA`. */
function duracaoMinutos(offset: number): number {
	const slot = SLOTS_DIA[offset];
	return minutosDoDia(slot.fim) - minutosDoDia(slot.inicio);
}

/**
 * Métricas de uma seleção já montada, reaproveitando a geometria que já existe
 * (`agruparBlocosDia`/`SLOTS_DIA`/`DIAS_SEMANA`) em vez de reinventar cálculo de
 * horário — só agregação por cima do que o calendário semanal já usa.
 */
function calcularMetricas<T>(
	materiasOriginais: Array<MateriaTurmas<T>>,
	resultado: AutoMontarResult<T>
): MetricasOpcao {
	// Reconstrói, por dia, qual matéria ocupa cada posição de `SLOTS_DIA` — mesma
	// forma que `agruparBlocosDia` espera (índice = offset, valor = código ou null).
	const codigosPorDia: Array<Array<string | null>> = Array.from(
		{ length: DIAS_SEMANA.length },
		() => new Array<string | null>(SLOTS_DIA.length).fill(null)
	);
	for (const [chave, turma] of resultado.selecao) {
		for (let bit = 0; bit < 96; bit++) {
			if ((turma.mask & (1n << BigInt(bit))) === 0n) continue;
			codigosPorDia[Math.floor(bit / 16)][bit % 16] = chave;
		}
	}

	let diasComAula = 0;
	let minutosDeLacuna = 0;
	let minutosTotais = 0;
	const minutosPorDia: number[] = [];

	for (let dia = 0; dia < DIAS_SEMANA.length; dia++) {
		const blocos = agruparBlocosDia(codigosPorDia[dia]);
		if (blocos.length > 0) diasComAula++;

		let minutosDoDiaAtual = 0;
		for (const bloco of blocos) {
			for (let o = bloco.offsetStart; o < bloco.offsetStart + bloco.span; o++) {
				minutosDoDiaAtual += duracaoMinutos(o);
			}
		}
		minutosTotais += minutosDoDiaAtual;
		minutosPorDia.push(minutosDoDiaAtual);

		// Lacuna = minutos entre o fim de um bloco e o início do próximo, no mesmo
		// dia. Buracos antes do primeiro bloco ou depois do último não contam —
		// isso é "hora livre no fim do dia", não um furo na grade.
		for (let b = 1; b < blocos.length; b++) {
			const fimAnterior = blocos[b - 1].offsetStart + blocos[b - 1].span - 1;
			const inicioAtual = blocos[b].offsetStart;
			const minutos = minutosDoDia(SLOTS_DIA[inicioAtual].inicio) - minutosDoDia(SLOTS_DIA[fimAnterior].fim);
			minutosDeLacuna += Math.max(0, minutos);
		}
	}

	const media = minutosPorDia.reduce((soma, m) => soma + m, 0) / minutosPorDia.length;
	const variancaCargaDiaria =
		minutosPorDia.reduce((soma, m) => soma + (m - media) ** 2, 0) / minutosPorDia.length;

	const essenciais = materiasOriginais.filter((m) => m.essencial === true);
	const professorEssencialAtendido =
		essenciais.length === 0 ||
		essenciais.every((m) => {
			const turma = resultado.selecao.get(m.chave);
			return !!turma && bonusDe(turma) > 0;
		});

	return {
		diasComAula,
		minutosDeLacuna,
		horasTotais: minutosTotais / 60,
		variancaCargaDiaria,
		professorEssencialAtendido
	};
}

/**
 * Maximalidade sob truncamento (extensão d): `autoMontarGrade` já é ótimo por
 * construção — peso positivo nunca deixa sobrar matéria que caberia — então o
 * único jeito de terminar aquém do maximal é bater no teto de nós
 * (`truncado === true`) antes de provar a otimalidade. Nesse caso (só nesse),
 * roda um reparo guloso O(pool): para cada `naoAlocada`, tenta a turma de maior
 * `bonus` que não conflita com o horário já ocupado e cabe no orçamento
 * restante. Greedy aqui é seguro porque o objetivo já não é achar o ótimo — é
 * só garantir que a grade devolvida não deixa espaço óbvio na mesa.
 */
function repararMaximalidade<T>(
	resultado: AutoMontarResult<T>,
	materias: Array<MateriaTurmas<T>>,
	mascaraInicial: bigint,
	orcamentoCreditos: number | undefined
): AutoMontarResult<T> {
	if (!resultado.truncado) return resultado;

	const selecao = new Map(resultado.selecao);
	let accMask = mascaraInicial;
	for (const t of selecao.values()) accMask |= t.mask;

	let creditosGastos = 0;
	for (const m of materias) {
		if (selecao.has(m.chave)) creditosGastos += m.creditos ?? 0;
	}

	const naoAlocadas: string[] = [];
	for (const chave of resultado.naoAlocadas) {
		const materia = materias.find((m) => m.chave === chave);
		if (!materia) {
			naoAlocadas.push(chave);
			continue;
		}

		const cabeNoOrcamento =
			orcamentoCreditos === undefined || materia.obrigatoria === true
				? true
				: creditosGastos + (materia.creditos ?? 0) <= orcamentoCreditos;
		if (!cabeNoOrcamento) {
			naoAlocadas.push(chave);
			continue;
		}

		let melhor: TurmaCandidata<T> | undefined;
		for (const t of materia.turmas) {
			if (hasConflict(t.mask, accMask)) continue;
			if (!melhor || bonusDe(t) > bonusDe(melhor)) melhor = t;
		}

		if (!melhor) {
			naoAlocadas.push(chave);
			continue;
		}
		selecao.set(chave, melhor);
		accMask |= melhor.mask;
		creditosGastos += materia.creditos ?? 0;
	}

	return { ...resultado, selecao, naoAlocadas };
}

/**
 * Gera até `maxOpcoes` grades, uma por `RankingStrategy`, cada uma rodando
 * `autoMontarGrade` com o bônus da estratégia somado ao bônus que o chamador já
 * tinha calculado (preferência de horário/professor). Aplica o reparo de
 * maximalidade (d) quando o solve trunca, calcula métricas por agregação sobre
 * a geometria já existente, deduplica por assinatura de seleção e corta o
 * resultado priorizando diversidade de CONJUNTO de matérias sobre variantes do
 * mesmo conjunto (mesma seleção de matérias, turma/professor diferente).
 *
 * `chaveTurma` é opcional: como `T` é genérico, a assinatura de dedupe não tem
 * um id de turma nativo para comparar — quem chama pode fornecer um extrator
 * (ex.: `t => t.id_turmas`). Sem ele, cai no fallback de usar a própria máscara
 * de horário como identidade da turma, que já é suficiente para distinguir
 * escolhas diferentes dentro da mesma matéria.
 */
export function autoMontarGradeOpcoes<T>(
	materias: Array<MateriaTurmas<T>>,
	mascaraInicial: bigint,
	orcamentoCreditos: number | undefined,
	estrategias: RankingStrategy<T>[],
	maxOpcoes: number = 6,
	chaveTurma?: (turma: T) => string | number
): OpcaoGrade<T>[] {
	const brutas: OpcaoGrade<T>[] = estrategias.map((estrategia) => {
		const materiasComBonus = materias.map((m) => ({
			...m,
			turmas: m.turmas.map((t) => ({
				...t,
				bonus: bonusDe(t) + estrategia.pontuar(t, m)
			}))
		}));

		const bruto = autoMontarGrade(materiasComBonus, mascaraInicial, orcamentoCreditos);
		const resultado = repararMaximalidade(bruto, materiasComBonus, mascaraInicial, orcamentoCreditos);
		const metricas = calcularMetricas(materias, resultado);

		return { estrategia: estrategia.nome, resultado, metricas };
	});

	const assinaturaDe = (opcao: OpcaoGrade<T>): string =>
		[...opcao.resultado.selecao.entries()]
			.map(([chave, t]) => `${chave}:${chaveTurma ? chaveTurma(t.turma) : t.mask.toString()}`)
			.sort()
			.join(',');

	const vistas = new Set<string>();
	const unicas: OpcaoGrade<T>[] = [];
	for (const opcao of brutas) {
		const assinatura = assinaturaDe(opcao);
		if (vistas.has(assinatura)) continue;
		vistas.add(assinatura);
		unicas.push(opcao);
	}

	// Diversidade de conjunto de matérias antes de variantes do mesmo conjunto:
	// a primeira opção a apresentar um dado conjunto de chaves entra na leva
	// "diversa"; qualquer opção posterior com o MESMO conjunto (ex.: mesma
	// seleção de matérias, professor diferente) vira "variante" e só entra se
	// sobrar espaço depois de toda a diversidade possível.
	const conjuntoDe = (opcao: OpcaoGrade<T>): string =>
		[...opcao.resultado.selecao.keys()].sort().join(',');
	const conjuntosVistos = new Set<string>();
	const diversas: OpcaoGrade<T>[] = [];
	const variantes: OpcaoGrade<T>[] = [];
	for (const opcao of unicas) {
		const conjunto = conjuntoDe(opcao);
		if (conjuntosVistos.has(conjunto)) {
			variantes.push(opcao);
		} else {
			conjuntosVistos.add(conjunto);
			diversas.push(opcao);
		}
	}

	return [...diversas, ...variantes].slice(0, maxOpcoes);
}
