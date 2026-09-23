/**
 * Porto do núcleo algorítmico do Montador de Grade
 * (frontend/src/lib/utils/horario-slots.ts). Duplicado de
 * propósito — os dois projetos não compartilham pacote — mas os dois lados
 * DEVEM mudar juntos se o formato de horário SIGAA mudar. Ver também o
 * comentário espelhado no arquivo do frontend.
 *
 * Horários da UnB: 16 módulos possíveis por dia (M1–M5, T1–T7, N1–N4), semana
 * útil de segunda (2) a sábado (7). Horário SIGAA (ex.: "246M12 35T34") vira
 * um bitmask BigInt de 96 bits (6 dias × 16 módulos) — conflito de horário
 * fica uma operação bit-a-bit O(1).
 */

const DIA_INDEX: Record<string, number> = { "2": 0, "3": 1, "4": 2, "5": 3, "6": 4, "7": 5 };

export type Turno = "M" | "T" | "N";
const TURNO_OFFSET: Record<Turno, number> = { M: 0, T: 5, N: 12 };
const TURNO_MAX_MODULO: Record<Turno, number> = { M: 5, T: 7, N: 4 };
const TODOS_TURNOS: readonly Turno[] = ["M", "T", "N"];

const HORARIO_REGEX = /([2-7]+)\s*([MTN])\s*([1-7]+)/g;

export function slotMaskFromHorario(rawHorario: string | null | undefined): bigint {
    const raw = String(rawHorario ?? "").trim().toUpperCase();
    if (!raw) return 0n;

    let mask = 0n;
    const regex = new RegExp(HORARIO_REGEX.source, "g");
    let match: RegExpExecArray | null = regex.exec(raw);

    while (match) {
        const diasCod = match[1] ?? "";
        const turno = (match[2] ?? "M") as Turno;
        const modulosCod = match[3] ?? "";
        const maxModulo = TURNO_MAX_MODULO[turno];

        for (const d of diasCod) {
            const diaIndex = DIA_INDEX[d];
            if (diaIndex === undefined) continue;
            for (const m of modulosCod) {
                const modulo = Number(m);
                if (modulo < 1 || modulo > maxModulo) continue;
                const bitIndex = diaIndex * 16 + TURNO_OFFSET[turno] + (modulo - 1);
                mask |= 1n << BigInt(bitIndex);
            }
        }
        match = regex.exec(raw);
    }

    return mask;
}

export function hasConflict(a: bigint, b: bigint): boolean {
    return (a & b) !== 0n;
}

export function maskDosTurnos(turnos: Iterable<Turno>): bigint {
    const set = new Set(turnos);
    if (set.size === 0) return 0n;
    let mask = 0n;
    for (let dia = 0; dia < 6; dia++) {
        for (const turno of TODOS_TURNOS) {
            if (!set.has(turno)) continue;
            for (let m = 0; m < TURNO_MAX_MODULO[turno]; m++) {
                mask |= 1n << BigInt(dia * 16 + TURNO_OFFSET[turno] + m);
            }
        }
    }
    return mask;
}

/** Máscara livre = universo dos turnos permitidos menos o que já está ocupado. */
export function maskLivre(ocupada: bigint, turnosPermitidos: Iterable<Turno>): bigint {
    const universo = maskDosTurnos(turnosPermitidos);
    return universo & ~ocupada;
}

// ─── Metadados para renderização/agregação (espelha o frontend) ─────────────

/** Colunas da grade: segunda a sábado. */
export const DIAS_SEMANA: ReadonlyArray<{ cod: string; label: string }> = [
    { cod: "2", label: "Seg" },
    { cod: "3", label: "Ter" },
    { cod: "4", label: "Qua" },
    { cod: "5", label: "Qui" },
    { cod: "6", label: "Sex" },
    { cod: "7", label: "Sáb" },
];

export interface SlotMeta {
    turno: Turno;
    modulo: number;
    /** Deslocamento dentro do dia (0..15) — TURNO_OFFSET + (modulo-1). */
    offset: number;
    /** Rótulo compacto (ex.: "M1"). */
    label: string;
    /** Horário de início (ex.: "08:00"). */
    inicio: string;
    /** Horário de fim (ex.: "08:55"). */
    fim: string;
}

const HORA_INICIO: Record<Turno, Record<number, string>> = {
    M: { 1: "08:00", 2: "08:55", 3: "10:00", 4: "10:55", 5: "12:00" },
    T: { 1: "12:55", 2: "14:00", 3: "14:55", 4: "16:00", 5: "16:55", 6: "18:00", 7: "18:55" },
    N: { 1: "19:00", 2: "19:50", 3: "20:50", 4: "21:40" },
};

const HORA_FIM: Record<Turno, Record<number, string>> = {
    M: { 1: "08:55", 2: "09:50", 3: "10:55", 4: "11:50", 5: "12:55" },
    T: { 1: "13:50", 2: "14:55", 3: "15:50", 4: "16:55", 5: "17:50", 6: "18:55", 7: "19:50" },
    N: { 1: "19:50", 2: "20:40", 3: "21:40", 4: "22:30" },
};

/** Linhas da grade, em ordem: M1–M5, T1–T7, N1–N4. */
export const SLOTS_DIA: readonly SlotMeta[] = (["M", "T", "N"] as const).flatMap((turno) =>
    Array.from({ length: TURNO_MAX_MODULO[turno] }, (_, i): SlotMeta => {
        const modulo = i + 1;
        return {
            turno,
            modulo,
            offset: TURNO_OFFSET[turno] + i,
            label: `${turno}${modulo}`,
            inicio: HORA_INICIO[turno][modulo],
            fim: HORA_FIM[turno][modulo],
        };
    })
);

/** Índice do bit para um dia (cód. SIGAA) e o offset do slot dentro do dia. */
export function bitIndex(diaCod: string, offsetNoDia: number): number {
    return (DIA_INDEX[diaCod] ?? 0) * 16 + offsetNoDia;
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
    /** Código da matéria (ou marcador genérico) que ocupa o bloco. */
    codigo: string;
    /** Índice do primeiro slot (posição em `SLOTS_DIA`). */
    offsetStart: number;
    /** Quantos slots consecutivos o bloco cobre. */
    span: number;
}

/**
 * Agrupa módulos consecutivos do mesmo código num único bloco. Recebe, para um
 * dia, o código que ocupa cada posição de `SLOTS_DIA` (ou `null`/`undefined` se
 * livre). Buracos e trocas de código quebram o bloco.
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
     * Matéria que o aluno marcou como ESSENCIAL: nunca pode ficar de fora da
     * montagem quando existe alguma turma viável para ela. A escada de pesos fixa
     * do chamador (PESO_CURSANDO/PESO_PRIORITARIA/FATOR_ENTRE_DEGRAUS) já satura o
     * espaço numérico entre degraus, então "essencial" não usa um degrau fixo: o
     * peso efetivo dela é calculado DINAMICAMENTE por chamada em `autoMontarGrade`
     * (`pesoDominanteEssencial`, maior que a soma de todas as não-essenciais do
     * pool), garantindo por otimização que nenhuma combinação de não-essenciais
     * vale mais do que incluí-la. Ver comentário completo em `pesoDominanteEssencial`.
     */
    essencial?: boolean;
}

/**
 * Teto de nós explorados na montagem automática. Com a poda sensível ao acumulado
 * um pool real resolve em centenas de nós; o teto existe só para garantir que
 * nenhuma entrada inesperada trave a aba do aluno.
 */
const MAX_NOS_MONTAGEM = 200_000;

/** União discriminada dos motivos pelos quais uma matéria ESSENCIAL não entrou na grade. */
export type ErroMontagem =
    | { tipo: "ESSENCIAL_SEM_VAGA"; chave: string }
    | { tipo: "ESSENCIAL_PRE_REQUISITO"; chave: string; pendencias: string[] }
    | { tipo: "ESSENCIAL_FORA_DO_TURNO"; chave: string; turnosComOferta: Array<"M" | "T" | "N"> }
    | { tipo: "ESSENCIAL_CONFLITO"; chave: string; colideCom: string[] };

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
     * Diagnóstico de por que cada matéria ESSENCIAL não alocada ficou de fora.
     *
     * Best-effort SEM contexto externo (não sabe o que existia antes do filtro de
     * turno nem pré-requisito pendente — isso é responsabilidade de quem chama,
     * ver `diagnosticarEssenciais`): distingue só ESSENCIAL_SEM_VAGA (zero turmas
     * no pool recebido) de ESSENCIAL_CONFLITO (havia turma, mas colidiu). Quem tem
     * o contexto completo (turno antes do filtro, pré-requisito) deve chamar
     * `diagnosticarEssenciais` de novo por cima deste resultado para o diagnóstico
     * refinado — é o que a Facade (`montador_grade.service.ts`) faz.
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
 * Matérias `essencial: true` NUNCA são deixadas de fora por opção do solver — ver
 * a "Opção B" dentro de `recurse`.
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
     * Peso efetivo de `essencial`: dominante sobre a soma de todas as
     * não-essenciais do pool, calculado por chamada (não um degrau fixo — a escada
     * do chamador não tem espaço sobrando entre PRIORITARIA e CURSANDO). Ver nota
     * completa no espelho frontend (`frontend/src/lib/utils/horario-slots.ts`,
     * mesmo comentário em `MateriaTurmas.essencial` e aqui). Isto substitui uma
     * tentativa anterior de desabilitar a Opção B só para essencial, que não
     * bastava: numa essencial que CONFLITA com uma matéria de peso alto, a
     * otimização por soma de peso a descarta na alocação em si, sem nunca passar
     * pela Opção B — só o peso dominante resolve os dois casos (conflito e
     * ausência de turma) com o mesmo mecanismo.
     */
    const somaNaoEssenciais = materias.reduce(
        (acc, m) => acc + (m.essencial === true ? 0 : pesoBase(m)),
        0
    );
    const pesoDominanteEssencial = somaNaoEssenciais + 1;
    const pesoDe = (m: MateriaTurmas<T>) =>
        m.essencial === true ? pesoDominanteEssencial : pesoBase(m);
    const creditosDe = (m: MateriaTurmas<T>) => m.creditos ?? 0;
    const bonusDe = (t: TurmaCandidata<T>) => t.bonus ?? 0;
    /**
     * Cabe no teto de créditos, dado o quanto já foi gasto? Obrigatória e essencial
     * sempre cabem — sem orçamento, todo mundo cabe. Checar `essencial` aqui
     * também (defesa em profundidade, não só confiar que quem monta os dados setou
     * `obrigatoria = matriculaReal || essencial`) garante "essencial ignora o
     * limite de horas" nesta função, não como disciplina do chamador.
     */
    const cabeNoOrcamento = (m: MateriaTurmas<T>, gasto: number): boolean =>
        orcamentoCreditos === undefined || m.obrigatoria === true || m.essencial === true
            ? true
            : gasto + creditosDe(m) <= orcamentoCreditos;
    const melhorBonusDe = (m: MateriaTurmas<T>) =>
        m.turmas.reduce((max, t) => Math.max(max, bonusDe(t)), 0);

    // Matérias de maior peso primeiro (e essenciais nos primeiros índices — ver
    // efeito colateral documentado abaixo) e, dentro de cada uma, as turmas que mais
    // atendem à preferência — assim o primeiro mergulho já encontra uma solução boa
    // e a poda descarta o resto cedo.
    //
    // Turmas com a mesma máscara são intercambiáveis para o encaixe (só o horário
    // importa), então basta manter a de maior bônus: corta um fator de ramificação
    // grande, já que é comum a matéria ter várias turmas no mesmo horário.
    const ordenadas = [...materias]
        .sort((a, b) => {
            if (a.essencial === true && b.essencial !== true) return -1;
            if (a.essencial !== true && b.essencial === true) return 1;
            return pesoDe(b) - pesoDe(a);
        })
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
        // para essencial — o peso dominante acima garante "nunca pulada quando
        // cabe"; desabilitar esta opção para essencial travava a busca inteira
        // quando ela não tinha turma nenhuma (sem Opção A nem B, o ramo morria sem
        // recursar pras matérias seguintes).
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

    // `erros` fica sempre vazio aqui — mesmo contrato do espelho frontend.
    // `autoMontarGrade` não tem contexto de turno/pré-requisito (só quem chama
    // tem), e diagnosticar aqui dentro criaria recursão infinita: o passo
    // ESSENCIAL_CONFLITO de `diagnosticarEssenciais` roda um sub-solve chamando
    // `autoMontarGrade` de novo — se este também autodiagnosticasse no retorno,
    // cada sub-solve dispararia outro diagnóstico, que dispararia outro sub-solve,
    // sem parar. Preencher `erros` é responsabilidade de quem chama
    // (`diagnosticarEssenciais`, explicitamente, depois do solve principal).
    return { selecao: melhorSelecao, naoAlocadas, preferenciasNaoAtendidas, truncado, erros: [] };
}

/**
 * Classifica por que cada matéria ESSENCIAL de `naoAlocadas` ficou de fora,
 * em ordem fixa de checagem (Fase 1a do plano — função sequencial simples, não
 * Chain of Responsibility, mesmo estilo já usado no resto do arquivo):
 *
 * 1. `ESSENCIAL_FORA_DO_TURNO` — zero turmas depois do filtro de turno, mas
 *    existiam turmas antes dele (`contexto.turmasAntesDoFiltroDeTurno`).
 * 2. `ESSENCIAL_SEM_VAGA` — zero turmas mesmo sem filtro de turno.
 * 3. `ESSENCIAL_PRE_REQUISITO` — pré-requisito pendente (checado por quem chama,
 *    via `evaluateExpressaoLogica`-equivalente; `horario-slots.ts` não conhece
 *    matriz/histórico).
 * 4. `ESSENCIAL_CONFLITO` — nenhuma das anteriores explica: conflito real com
 *    outra essencial/travada. A lista de quem colide vem de um solve auxiliar
 *    rodado só com o subconjunto `essencial === true` (pool pequeno) — o mesmo
 *    mecanismo estrutural de `autoMontarGrade` garante que, se a combinação
 *    não fecha, `naoAlocadas` desse solve auxiliar aponta os culpados.
 *
 * Não essenciais em `naoAlocadas` são ignoradas — o diagnóstico só existe para
 * "nunca pode ficar de fora".
 */
export function diagnosticarEssenciais<T>(
    materias: Array<MateriaTurmas<T>>,
    naoAlocadas: string[],
    contexto: {
        turmasAntesDoFiltroDeTurno: Map<string, unknown[]>;
        turnosComOferta: Map<string, Array<"M" | "T" | "N">>;
        pendenciasPreRequisito: Map<string, string[]>;
        /**
         * Horário já ocupado fora de `materias` (matérias travadas) no solve
         * original — mesmo papel que `mascaraInicial` em `autoMontarGrade`. Campo
         * opcional e aditivo: sem ele o sub-solve de ESSENCIAL_CONFLITO assume
         * `0n`, o que ainda classifica corretamente conflitos entre essenciais mas
         * não enxerga conflito com uma trava externa.
         */
        mascaraInicial?: bigint;
    }
): ErroMontagem[] {
    const erros: ErroMontagem[] = [];

    for (const chave of naoAlocadas) {
        const m = materias.find((materia) => materia.chave === chave);
        if (!m || m.essencial !== true) continue; // Não essencial: diagnóstico não se aplica.

        // Passo 1: turno zerou candidatas que existiam antes do filtro.
        const antesDoFiltro = contexto.turmasAntesDoFiltroDeTurno.get(chave) ?? [];
        if (m.turmas.length === 0 && antesDoFiltro.length > 0) {
            erros.push({
                tipo: "ESSENCIAL_FORA_DO_TURNO",
                chave,
                turnosComOferta: contexto.turnosComOferta.get(chave) ?? [],
            });
            continue;
        }

        // Passo 2: zero turmas mesmo sem filtro de turno.
        if (m.turmas.length === 0) {
            erros.push({ tipo: "ESSENCIAL_SEM_VAGA", chave });
            continue;
        }

        // Passo 3: pré-requisito pendente.
        const pendencias = contexto.pendenciasPreRequisito.get(chave) ?? [];
        if (pendencias.length > 0) {
            erros.push({ tipo: "ESSENCIAL_PRE_REQUISITO", chave, pendencias });
            continue;
        }

        // Passo 4: sobra conflito real — resolve auxiliar só com o subconjunto
        // essencial (+ o que já estava travado fora do pool, via `mascaraInicial`).
        // Nenhuma essencial pode ficar de fora por opção nesse sub-solve (mesmo
        // peso dominante de `autoMontarGrade`), então se a combinação não fecha,
        // `naoAlocadas` dele aponta quem colide — sem reimplementar detecção de
        // conflito par-a-par aqui.
        const essenciais = materias.filter((materia) => materia.essencial === true);
        const subResultado = autoMontarGrade(essenciais, contexto.mascaraInicial ?? 0n, undefined);
        const colideCom = subResultado.selecao.has(chave)
            ? // A própria chave coube no sub-solve: quem colide é quem sobrou de
              // fora desse universo restrito, junto dela.
              subResultado.naoAlocadas.filter((c) => c !== chave)
            : // Nem sozinha (contra `mascaraInicial`/as demais essenciais) ela
              // coube no sub-solve: reporta quem ficou no lugar dela.
              [...subResultado.selecao.keys()];
        erros.push({ tipo: "ESSENCIAL_CONFLITO", chave, colideCom });
    }

    return erros;
}

// ─── Múltiplas opções com scoring (Fase 1c) ──────────────────────────────────

/** Strategy de ranking: cada estratégia pontua turma×matéria e vira uma OpcaoGrade. */
export interface RankingStrategy<T> {
    nome: string;
    pontuar(turma: TurmaCandidata<T>, materia: MateriaTurmas<T>): number;
}

export interface MetricasOpcao {
    diasComAula: number;
    minutosDeLacuna: number;
    horasTotais: number;
    variancaCargaDiaria: number;
    professorEssencialAtendido: boolean;
}

export interface OpcaoGrade<T> {
    estrategia: string;
    resultado: AutoMontarResult<T>;
    metricas: MetricasOpcao;
}

function minutosDesde(horaStr: string): number {
    const [h, m] = horaStr.split(":").map(Number);
    return h * 60 + m;
}

/**
 * Métricas agregadas de uma seleção, calculadas só sobre `agruparBlocosDia` e
 * `SLOTS_DIA` já existentes — nenhuma geometria nova (Fase 1c do plano).
 */
function calcularMetricas<T>(
    selecao: Map<string, TurmaCandidata<T>>,
    professorEssencialAtendido: boolean
): MetricasOpcao {
    let mask = 0n;
    for (const t of selecao.values()) mask |= t.mask;

    let diasComAula = 0;
    let minutosDeLacuna = 0;
    let minutosTotais = 0;
    const minutosPorDia: number[] = [];

    for (let dia = 0; dia < DIAS_SEMANA.length; dia++) {
        const codigosPorOffset: Array<string | null> = SLOTS_DIA.map((slot) =>
            (mask & (1n << BigInt(dia * 16 + slot.offset))) !== 0n ? "X" : null
        );
        const blocos = agruparBlocosDia(codigosPorOffset);
        if (blocos.length === 0) {
            minutosPorDia.push(0);
            continue;
        }
        diasComAula++;
        let minutosNoDia = 0;
        for (const bloco of blocos) {
            const primeiro = SLOTS_DIA[bloco.offsetStart];
            const ultimo = SLOTS_DIA[bloco.offsetStart + bloco.span - 1];
            minutosNoDia += minutosDesde(ultimo.fim) - minutosDesde(primeiro.inicio);
        }
        // Lacuna: intervalo entre blocos do mesmo dia (nunca antes do primeiro nem
        // depois do último — isso não é "furo", é o dia começar/terminar ali).
        for (let i = 1; i < blocos.length; i++) {
            const fimAnterior = SLOTS_DIA[blocos[i - 1].offsetStart + blocos[i - 1].span - 1].fim;
            const inicioAtual = SLOTS_DIA[blocos[i].offsetStart].inicio;
            minutosDeLacuna += Math.max(0, minutosDesde(inicioAtual) - minutosDesde(fimAnterior));
        }
        minutosPorDia.push(minutosNoDia);
        minutosTotais += minutosNoDia;
    }

    const mediaPorDia = minutosPorDia.reduce((a, b) => a + b, 0) / (minutosPorDia.length || 1);
    const variancaCargaDiaria =
        minutosPorDia.reduce((acc, m) => acc + (m - mediaPorDia) ** 2, 0) / (minutosPorDia.length || 1);

    return {
        diasComAula,
        minutosDeLacuna,
        horasTotais: minutosTotais / 60,
        variancaCargaDiaria,
        professorEssencialAtendido,
    };
}

/**
 * Assinatura canônica de uma seleção — usada para dedupe entre opções. Não há
 * hoje, no repositório, uma `assinaturaSelecao()` de referência em
 * `+page.svelte` (a Fase 2 de tela ainda não foi implementada nesta sessão);
 * esta é uma implementação self-contained equivalente: código+turma
 * ordenados. `chaveTurma` deixa o chamador escolher a chave estável da turma
 * (ex.: `id_turmas`); sem ela cai para `JSON.stringify` da turma inteira.
 */
function assinaturaDeSelecao<T>(
    selecao: Map<string, TurmaCandidata<T>>,
    chaveTurma?: (turma: T) => string | number
): string {
    return [...selecao.entries()]
        .map(([chave, t]) => `${chave}=${chaveTurma ? chaveTurma(t.turma) : JSON.stringify(t.turma)}`)
        .sort()
        .join("|");
}

/**
 * Reparo guloso O(pool), só quando `autoMontarGrade` truncou (Fase 1d): tenta
 * encaixar cada não-alocada na melhor turma (maior bônus) que não conflita com
 * o acumulado e ainda cabe no orçamento — sem reabrir a busca exaustiva.
 * Maximalidade já é garantida pela otimalidade do branch-and-bound quando a
 * busca NÃO trunca; este reparo cobre só o caso truncado, onde pode sobrar
 * matéria que na verdade caberia.
 */
function repararGulosoSobTruncamento<T>(
    materias: Array<MateriaTurmas<T>>,
    resultado: AutoMontarResult<T>,
    mascaraInicial: bigint,
    orcamentoCreditos: number | undefined
): AutoMontarResult<T> {
    const porChave = new Map(materias.map((m) => [m.chave, m]));
    const selecao = new Map(resultado.selecao);
    let accMask = mascaraInicial;
    for (const t of selecao.values()) accMask |= t.mask;

    let gasto = 0;
    for (const chave of selecao.keys()) {
        const m = porChave.get(chave);
        if (m && m.obrigatoria !== true) gasto += m.creditos ?? 0;
    }

    const naoAlocadas: string[] = [];
    for (const chave of resultado.naoAlocadas) {
        const m = porChave.get(chave);
        if (!m) {
            naoAlocadas.push(chave);
            continue;
        }
        const cabeNoOrcamento =
            orcamentoCreditos === undefined || m.obrigatoria === true
                ? true
                : gasto + (m.creditos ?? 0) <= orcamentoCreditos;
        if (!cabeNoOrcamento) {
            naoAlocadas.push(chave);
            continue;
        }
        const candidata = [...m.turmas]
            .sort((a, b) => (b.bonus ?? 0) - (a.bonus ?? 0))
            .find((t) => !hasConflict(t.mask, accMask));
        if (!candidata) {
            naoAlocadas.push(chave);
            continue;
        }
        selecao.set(chave, candidata);
        accMask |= candidata.mask;
        if (m.obrigatoria !== true) gasto += m.creditos ?? 0;
    }

    const preferenciasNaoAtendidas: string[] = [];
    for (const [chave, t] of selecao) {
        const m = porChave.get(chave);
        if (!m) continue;
        const melhor = m.turmas.reduce((max, x) => Math.max(max, x.bonus ?? 0), 0);
        if (melhor > 0 && (t.bonus ?? 0) < melhor) preferenciasNaoAtendidas.push(chave);
    }

    const erros = diagnosticarEssenciais(materias, naoAlocadas, {
        turmasAntesDoFiltroDeTurno: new Map(),
        turnosComOferta: new Map(),
        pendenciasPreRequisito: new Map(),
    });

    return { ...resultado, selecao, naoAlocadas, preferenciasNaoAtendidas, erros };
}

/**
 * Gera até `maxOpcoes` grades (default 6), uma por `RankingStrategy`, cada uma
 * rodando `autoMontarGrade` com o bônus da estratégia somado por CIMA do bônus
 * que o chamador já tiver definido (nunca substitui). Dedupe por assinatura de
 * seleção — estratégias diferentes podem convergir pra mesma grade.
 */
export function autoMontarGradeOpcoes<T>(
    materias: Array<MateriaTurmas<T>>,
    mascaraInicial: bigint,
    orcamentoCreditos: number | undefined,
    estrategias: RankingStrategy<T>[],
    maxOpcoes: number = 6,
    chaveTurma?: (turma: T) => string | number
): OpcaoGrade<T>[] {
    const opcoes: OpcaoGrade<T>[] = [];
    const assinaturasVistas = new Set<string>();
    const essenciais = materias.filter((m) => m.essencial === true).map((m) => m.chave);

    for (const estrategia of estrategias) {
        if (opcoes.length >= maxOpcoes) break;

        const materiasComBonus = materias.map((m) => ({
            ...m,
            turmas: m.turmas.map((t) => ({
                ...t,
                bonus: (t.bonus ?? 0) + estrategia.pontuar(t, m),
            })),
        }));

        let resultado = autoMontarGrade(materiasComBonus, mascaraInicial, orcamentoCreditos);
        if (resultado.truncado) {
            resultado = repararGulosoSobTruncamento(materiasComBonus, resultado, mascaraInicial, orcamentoCreditos);
        }

        const assinatura = assinaturaDeSelecao(resultado.selecao, chaveTurma);
        if (assinaturasVistas.has(assinatura)) continue;
        assinaturasVistas.add(assinatura);

        const professorEssencialAtendido =
            essenciais.length === 0
                ? true
                : essenciais.every(
                      (c) => resultado.selecao.has(c) && !resultado.preferenciasNaoAtendidas.includes(c)
                  );

        opcoes.push({
            estrategia: estrategia.nome,
            resultado,
            metricas: calcularMetricas(resultado.selecao, professorEssencialAtendido),
        });
    }

    return opcoes;
}
