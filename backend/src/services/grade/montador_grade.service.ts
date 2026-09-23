/**
 * Facade do Montador de Grade no backend — Fase 3 (Darcy) do plano
 * `montador-de-grade-resilient-muffin.md`.
 *
 * Espelha, do lado do backend, o que `grade.store.svelte.ts` (frontend) faz: carrega
 * oferta/matriz/pré-requisitos/histórico via `SupabaseWrapper`, monta
 * `MateriaTurmas<TurmaOferta>[]`, chama `autoMontarGradeOpcoes` e roda
 * `diagnosticarEssenciais` quando a essencial não entra. Segue o mesmo padrão de
 * "reimplementar, não reexportar" já documentado em `grade_actuator.ts` (~linhas
 * 83-89): a política de peso (`pesoDaNatureza`/escada) espelha
 * `frontend/src/lib/stores/grade.store.svelte.ts:150-176` só por LEITURA — nada é
 * importado do frontend.
 *
 * DESVIO do esboço de `ParametrosMontador` no plano original: o esboço não tinha
 * `curriculoCompleto`. Todo o resto do pipeline de atuadores (`recomendarPorHorarioLivre`,
 * `buscarOptativas`, módulo livre) recebe `curriculoCompleto` como parâmetro explícito —
 * o backend NUNCA resolve a matriz do aluno sozinho a partir só do email, quem manda é
 * sempre o cliente (ver `chat_controller.ts`). Sem esse campo, `montarDadosPlano` não
 * tem como resolver a matriz. Adicionado como campo obrigatório.
 */
import { SupabaseWrapper } from "../../supabase_wrapper";
import { montarDadosPlano, resolverPeriodoAtivo } from "../../controllers/PlanejamentoController";
import {
    parseFluxograma,
    isDesbloqueada,
    expandirCumpridasComEquivalencias,
} from "../plano_formatura.service";
import {
    getCodigosFromExpressaoLogica,
    parseExpressaoLogicaFromDb,
    type ExpressaoLogicaRecursiva,
} from "../../utils/expressao_logica";
import {
    slotMaskFromHorario,
    turmaRespeitaTurnos,
    maskDosTurnos,
    autoMontarGradeOpcoes,
    diagnosticarEssenciais,
    type MateriaTurmas,
    type TurmaCandidata,
    type ErroMontagem,
    type OpcaoGrade,
    type RankingStrategy,
    type Turno,
} from "../../utils/horario_slots";
import type { PlanoInput, MateriaInput } from "../../types/planejamento";

/** Turma ofertada — mesmas colunas de `frontend/src/lib/services/turmas.service.ts:TurmaOferta` (leitura só, não importado). */
export interface TurmaOferta {
    id_turmas: number;
    id_materia: number;
    turma: string;
    docente: string | null;
    horario: string | null;
    local: string | null;
    ano_periodo: string;
    vagas_ofertadas: number | null;
    vagas_ocupadas: number | null;
    vagas_sobrando: number | null;
}

export interface ParametrosMontador {
    email: string;
    /** Matriz do aluno (ex.: "8117/-2 - 2018.2") — sempre vem do cliente, ver nota acima. */
    curriculoCompleto: string;
    escopo: "periodo_atual" | "todas_pendentes";
    limiteCreditos?: number;
    turnosPermitidos?: Array<"M" | "T" | "N">;
    essencial?: string;
    professorPreferidoEssencial?: string;
    incluirCursando?: boolean;
}

export interface ResultadoMontador {
    opcoes: OpcaoGrade<TurmaOferta>[];
    erros: ErroMontagem[];
}

const PLANO_INPUT_PADRAO: Omit<PlanoInput, "curriculoCompleto"> = {
    completedCodes: [],
    numeroPeriodo: 1,
    preferencias: { limiteCreditos: 24, objetivo: "equilibrado", trabalha: false },
};

function norm(codigo: string): string {
    return (codigo || "").trim().toUpperCase();
}

/**
 * resolveIdUserPorEmail — reimplementado aqui, mesmo padrão de duplicação aceito no
 * resto do pipeline (ver `grade_actuator.ts`: "reimplementado aqui, não reexportado").
 */
async function resolveIdUserPorEmail(email: string): Promise<string | null> {
    const { data, error } = await SupabaseWrapper.get()
        .from("users")
        .select("id_user")
        .eq("email", email)
        .maybeSingle();
    if (error || !data?.id_user) return null;
    return String(data.id_user);
}

function parseExprOrNull(raw: unknown): ExpressaoLogicaRecursiva | null {
    if (raw == null) return null;
    if (typeof raw === "object" && raw !== null && "condicoes" in (raw as object)) {
        return raw as ExpressaoLogicaRecursiva;
    }
    return parseExpressaoLogicaFromDb(raw);
}

/** Docentes comparáveis: sem espaços redundantes, caixa alta — espelha grade.store.svelte.ts:normDocente. */
export function normDocente(nome: string | null | undefined): string {
    return (nome ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * A turma bate com o professor alvo? Split por VÍRGULA (uma turma pode ter mais de um
 * docente cadastrado) — nunca substring cru, que bate "Maria" dentro de "Ana Maria".
 * Fase 1(b) do plano. Exportada pra ser testável isoladamente, sem depender de como o
 * solver desempata quando o bônus é a única diferença entre duas turmas (ver
 * `montador-grade-service.test.ts`).
 */
export function docenteBate(docenteCru: string | null | undefined, alvoNorm: string): boolean {
    if (!docenteCru || !alvoNorm) return false;
    return docenteCru
        .split(",")
        .map((d) => normDocente(d))
        .includes(alvoNorm);
}

// ─── Escada de peso — espelho de grade.store.svelte.ts:109-176 (leitura só) ──────
//
// Só o subconjunto que esta Facade usa: não existe conceito de "prioritárias"
// explícitas na tool da Darcy (só ESSENCIAL), então PESO_PRIORITARIA não tem
// equivalente aqui. Os valores numéricos dos degraus usados são os MESMOS do
// frontend, para preservar a mesma garantia de dominância entre eles.
const PESO_CURSANDO = 1_000_000_000_000;
const PESO_OBRIGATORIA = 1_000_000;
const PESO_NECESSARIA = 1_000;
const PESO_SATURADO = 1;

/**
 * Bônus de professor preferido — precisa ficar MUITO abaixo de PESO_SATURADO (o menor
 * degrau da escada), senão preferência de horário passaria a deslocar necessidade
 * (invariante documentada em `horario_slots.ts:196-203`/`autoMontarGrade`). Com pools
 * realistas (dezenas de matérias, cada uma contribuindo no máximo UM bônus — só a
 * turma escolhida conta), a soma máxima fica ordens de grandeza abaixo de 1.
 */
const BONUS_PROFESSOR_PREFERIDO = 1e-4;
/** Bônus das estratégias de ranking — menor ainda, pra nunca competir com o de professor. */
const EPS_ESTRATEGIA = 1e-6;

type NaturezaCH = "obrigatoria" | "optativa" | "modulo_livre";

/**
 * Situação de integralização simplificada — equivalente ao `SituacaoAcademica` de
 * `situacao-academica.service.ts` (frontend), mas construída direto de
 * `dados.cargaHorariaIntegralizada`/`dados.exigidaMatriz` (já resolvidos por
 * `montarDadosPlano`), sem precisar do PDF/histórico que o frontend usa como fonte —
 * o backend já tem os números prontos, então não há caso "não deu pra saber" aqui.
 */
interface SituacaoAcademicaLite {
    faltam: Record<NaturezaCH, number>;
}

function montarSituacao(
    cargaHorariaIntegralizada: { obrigatoria: number; optativa: number; complementar: number },
    exigidaMatriz: { obrigatoria: number; optativa: number; complementar: number }
): SituacaoAcademicaLite {
    return {
        faltam: {
            obrigatoria: exigidaMatriz.obrigatoria - cargaHorariaIntegralizada.obrigatoria,
            optativa: exigidaMatriz.optativa - cargaHorariaIntegralizada.optativa,
            modulo_livre: exigidaMatriz.complementar - cargaHorariaIntegralizada.complementar,
        },
    };
}

function saturada(s: SituacaoAcademicaLite, n: NaturezaCH): boolean {
    return s.faltam[n] <= 0;
}

/**
 * Quanto vale encaixar esta matéria — espelho de `pesoDaNatureza` (grade.store.svelte.ts:150-176).
 * Sem o caso "natureza indefinida" do frontend: aqui `natureza` sempre vem de
 * `MateriaInput.obrigatoria`, nunca ausente.
 */
function pesoDaNatureza(natureza: "obrigatoria" | "optativa", situacao: SituacaoAcademicaLite, ehOptatoria: boolean): number {
    if (ehOptatoria) return PESO_OBRIGATORIA;
    if (natureza === "obrigatoria") return PESO_OBRIGATORIA;
    return saturada(situacao, natureza) ? PESO_SATURADO : PESO_NECESSARIA;
}

/**
 * Optativas que ainda destravam alguma obrigatória PENDENTE — espelho de
 * `optatoriasVivas()` (grade-pool.service.ts), mas calculado só sobre
 * `dados.materiasMapeadas` (que já é "o que falta ao aluno", não a matriz inteira).
 */
function calcularOptatoriasVivas(materias: MateriaInput[], cumpridas: Set<string>): Set<string> {
    const porCodigo = new Map(materias.map((m) => [norm(m.codigo), m]));
    const vivas = new Set<string>();
    for (const m of materias) {
        if (!m.obrigatoria) continue;
        const cod = norm(m.codigo);
        if (cumpridas.has(cod)) continue;
        const expr = parseExprOrNull(m.preRequisitos);
        if (!expr) continue;
        for (const reqCod of getCodigosFromExpressaoLogica(expr).map(norm)) {
            const req = porCodigo.get(reqCod);
            if (req && !req.obrigatoria) vivas.add(reqCod);
        }
    }
    return vivas;
}

function pendenciasPreRequisito(m: MateriaInput, cumpridas: Set<string>): string[] {
    const expr = parseExprOrNull(m.preRequisitos);
    if (!expr) return [];
    return getCodigosFromExpressaoLogica(expr)
        .map(norm)
        .filter((c) => !cumpridas.has(c));
}

/** Turnos (M/T/N) tocados por uma máscara. */
function turnosDaMask(mask: bigint): Turno[] {
    const turnos: Turno[] = [];
    for (const t of ["M", "T", "N"] as const) {
        if ((mask & maskDosTurnos([t])) !== 0n) turnos.push(t);
    }
    return turnos;
}

/** Quantos dos 6 dias úteis a máscara toca. */
function diasDistintos(mask: bigint): number {
    let dias = 0;
    for (let d = 0; d < 6; d++) {
        const diaMask = ((1n << 16n) - 1n) << BigInt(d * 16);
        if ((mask & diaMask) !== 0n) dias++;
    }
    return dias;
}

/**
 * Soma, por slot ocupado, a distância até a borda mais próxima do dia (0 ou 15).
 * Menor = turma concentrada nas pontas do dia, que tende a deixar menos furo entre
 * blocos de OUTRAS matérias no mesmo dia.
 */
function bordaScore(mask: bigint): number {
    let soma = 0;
    for (let bit = 0; bit < 96; bit++) {
        if ((mask & (1n << BigInt(bit))) === 0n) continue;
        const offsetNoDia = bit % 16;
        soma += Math.min(offsetNoDia, 15 - offsetNoDia);
    }
    return soma;
}

/**
 * Três estratégias de ranking (Fase 1c/3 do plano — Strategy pattern, já formalizado
 * em `horario_slots.ts:RankingStrategy`). Cada uma só enxerga UMA turma×matéria por
 * vez (contrato de `RankingStrategy.pontuar`), então são heurísticas por turma, não
 * cálculos sobre a grade inteira — a métrica exata e confiável (`MetricasOpcao`) só
 * existe DEPOIS do solve, sobre a seleção final. O objetivo aqui é só enviesar o
 * solver na direção de cada estratégia o bastante pra gerar opções diversas.
 */
const ESTRATEGIAS_RANKING: RankingStrategy<TurmaOferta>[] = [
    {
        nome: "Menos dias com aula",
        pontuar: (t) => -diasDistintos(t.mask) * EPS_ESTRATEGIA,
    },
    {
        nome: "Menos furos entre aulas",
        pontuar: (t) => -bordaScore(t.mask) * EPS_ESTRATEGIA,
    },
    {
        nome: "Semana equilibrada",
        // Oposto da 1ª: espalhar as horas da matéria por mais dias, em vez de
        // concentrar, tende a equilibrar a carga diária da semana inteira.
        pontuar: (t) => diasDistintos(t.mask) * EPS_ESTRATEGIA,
    },
];

interface EntradaBase {
    chave: string;
    turmas: Array<TurmaCandidata<TurmaOferta>>;
    peso: number;
    creditos: number;
    obrigatoria: boolean;
    essencial: boolean;
}

/**
 * Monta a grade horária do aluno: carrega oferta/matriz/pré-requisitos/histórico,
 * roda o solver (`autoMontarGradeOpcoes`) e diagnostica a essencial quando ela não
 * entra (`diagnosticarEssenciais`). Facade única — Fase 1(e)/3 do plano — pra não
 * duplicar esta orquestração dentro da tool da Darcy (`grade_actuator.ts`).
 *
 * Lança `Error` em falhas de infraestrutura (usuário não encontrado, currículo não
 * carregado) — `erros: ErroMontagem[]` no retorno é só pro diagnóstico de domínio da
 * ESSENCIAL, união discriminada fixa que não comporta um caso genérico de falha.
 */
export async function montarGrade(params: ParametrosMontador): Promise<ResultadoMontador> {
    const idUser = await resolveIdUserPorEmail(params.email);
    if (!idUser) throw new Error("Não encontrei o cadastro deste usuário.");

    const supabase = SupabaseWrapper.get();
    const periodoAtivo = await resolverPeriodoAtivo(supabase);

    const { dados, error } = await montarDadosPlano(idUser, {
        ...PLANO_INPUT_PADRAO,
        curriculoCompleto: params.curriculoCompleto,
    });
    if (error || !dados) throw new Error(error ?? "Não foi possível carregar o currículo do aluno.");

    const { completed, currentSemester } = parseFluxograma(dados.fluxogramaAtual);
    const completedNorm = new Set(completed);
    const cursandoNorm = new Set(currentSemester.map((m) => norm(m.codigo)));

    // MATR conta pra pré-requisito (estará concluída antes do semestre alvo — mesma
    // regra do Motor 2 / recomendarPorHorarioLivre), mas só sai do pool se o aluno
    // pediu pra excluir cursando (`incluirCursando === false`).
    const cumpridasBase = new Set(completedNorm);
    for (const c of cursandoNorm) cumpridasBase.add(c);
    const cumpridasExpandido = expandirCumpridasComEquivalencias(dados.materiasMapeadas, cumpridasBase);
    const aprovadasExpandido = expandirCumpridasComEquivalencias(dados.materiasMapeadas, completedNorm);

    const incluirCursando = params.incluirCursando !== false;
    const essencialNorm = params.essencial ? norm(params.essencial) : null;
    const professorAlvoNorm = params.professorPreferidoEssencial ? normDocente(params.professorPreferidoEssencial) : null;

    const pendentes = dados.materiasMapeadas.filter((m) => {
        const cod = norm(m.codigo);
        if (aprovadasExpandido.has(cod)) return false;
        if (cursandoNorm.has(cod) && !incluirCursando) return false;
        return true;
    });

    // "Período atual": nível atual/atrasado + toda optativa (nivel 0, sempre
    // disponível). "Todas pendentes": sem esse corte. Decisão de escopo documentada
    // aqui — não há precedente idêntico no frontend ainda (a Fase 2 de tela, que
    // introduziria esse conceito na UI, não foi implementada nesta sessão).
    const dentroDoEscopo = (m: MateriaInput): boolean => {
        if (params.escopo === "todas_pendentes") return true;
        return m.nivel === 0 || m.nivel <= dados.numeroPeriodo;
    };

    const elegiveis = pendentes.filter((m) => {
        const cod = norm(m.codigo);
        // A essencial nunca sai por escopo/oferta — só por pré-requisito, tratado à
        // parte no diagnóstico abaixo. Sem isto, pedir uma essencial fora do "período
        // atual" nunca geraria diagnóstico nenhum, só silêncio.
        if (cod === essencialNorm) return true;
        if (!dentroDoEscopo(m)) return false;
        return m.obrigatoria || dados.codigosComOferta.has(cod);
    });

    // Passo 1: código -> id_materia (turmas não tem codigo_materia direto — mesmo
    // padrão de dois passos de recomendarPorHorarioLivre/filtrarPorOfertaAtiva).
    const codigosParaResolver = [...new Set(elegiveis.map((m) => norm(m.codigo)))];
    if (essencialNorm && !codigosParaResolver.includes(essencialNorm)) codigosParaResolver.push(essencialNorm);

    const { data: materiasRows } = codigosParaResolver.length
        ? await supabase.from("materias").select("id_materia, codigo_materia").in("codigo_materia", codigosParaResolver)
        : { data: [] as any[] };
    const idPorCodigo = new Map<string, number>(
        ((materiasRows ?? []) as any[]).map((m) => [norm(m.codigo_materia), Number(m.id_materia)])
    );
    const codigoPorId = new Map<number, string>([...idPorCodigo].map(([cod, id]) => [id, cod]));
    const ids = [...idPorCodigo.values()];

    // Passo 2: turmas do período ativo para esses id_materia.
    const { data: turmasRows } = ids.length
        ? await supabase
              .from("turmas")
              .select("id_turmas, id_materia, turma, docente, horario, local, ano_periodo, vagas_ofertadas, vagas_ocupadas, vagas_sobrando")
              .eq("ano_periodo", periodoAtivo)
              .in("id_materia", ids)
        : { data: [] as any[] };

    const turmasPorCodigo = new Map<string, TurmaOferta[]>();
    for (const t of (turmasRows ?? []) as TurmaOferta[]) {
        const cod = codigoPorId.get(Number(t.id_materia));
        if (!cod) continue;
        const lista = turmasPorCodigo.get(cod) ?? [];
        lista.push(t);
        turmasPorCodigo.set(cod, lista);
    }

    const turnosPermitidosSet = new Set<Turno>(params.turnosPermitidos ?? []);
    const situacao = montarSituacao(dados.cargaHorariaIntegralizada, dados.exigidaMatriz);
    const optatoriasVivas = calcularOptatoriasVivas(dados.materiasMapeadas, aprovadasExpandido);

    const turmasAntesDoFiltroDeTurno = new Map<string, TurmaOferta[]>();
    const turnosComOferta = new Map<string, Turno[]>();
    const pendenciasPreRequisitoMap = new Map<string, string[]>();

    function construirEntrada(m: MateriaInput): EntradaBase {
        const cod = norm(m.codigo);
        const turmasReais = turmasPorCodigo.get(cod) ?? [];
        turmasAntesDoFiltroDeTurno.set(cod, turmasReais);

        const turnosDisponiveis = new Set<Turno>();
        for (const t of turmasReais) {
            for (const turno of turnosDaMask(slotMaskFromHorario(t.horario))) turnosDisponiveis.add(turno);
        }
        turnosComOferta.set(cod, [...turnosDisponiveis]);

        const ehEssencial = cod === essencialNorm;
        const turmasFiltradas = turmasReais.filter((t) =>
            turmaRespeitaTurnos(slotMaskFromHorario(t.horario), turnosPermitidosSet)
        );

        const candidatas: Array<TurmaCandidata<TurmaOferta>> = turmasFiltradas.map((t) => {
            const mask = slotMaskFromHorario(t.horario);
            const bonus =
                ehEssencial && professorAlvoNorm && docenteBate(t.docente, professorAlvoNorm)
                    ? BONUS_PROFESSOR_PREFERIDO
                    : 0;
            return { mask, turma: t, bonus };
        });

        const matriculaReal = cursandoNorm.has(cod);
        const ehOptatoriaFlag = optatoriasVivas.has(cod);
        const peso = matriculaReal
            ? PESO_CURSANDO
            : pesoDaNatureza(m.obrigatoria ? "obrigatoria" : "optativa", situacao, ehOptatoriaFlag);

        pendenciasPreRequisitoMap.set(cod, pendenciasPreRequisito(m, cumpridasExpandido));

        return {
            chave: cod,
            turmas: candidatas,
            peso,
            creditos: m.creditos,
            obrigatoria: matriculaReal || ehEssencial,
            essencial: ehEssencial,
        };
    }

    const materiasBase: EntradaBase[] = elegiveis.map(construirEntrada);

    // Essencial pedida mas fora de `elegiveis` (nem pendente na matriz do aluno) —
    // entrada sintética sem turma nenhuma, só pra o diagnóstico classificar certo
    // (cai em ESSENCIAL_SEM_VAGA, já que não há turma nenhuma pra reportar).
    if (essencialNorm && !materiasBase.some((e) => e.chave === essencialNorm)) {
        turmasAntesDoFiltroDeTurno.set(essencialNorm, []);
        turnosComOferta.set(essencialNorm, []);
        pendenciasPreRequisitoMap.set(essencialNorm, []);
        materiasBase.push({
            chave: essencialNorm,
            turmas: [],
            peso: PESO_OBRIGATORIA,
            creditos: 0,
            obrigatoria: true,
            essencial: true,
        });
    }

    // Fase 1(a): a "Opção B" (deixar de fora) é estruturalmente desabilitada pra
    // essencial dentro de `autoMontarGrade` — então uma essencial com pré-requisito
    // PENDENTE não pode ir pro solver como `essencial: true`, senão ele a força pra
    // dentro da grade mesmo sendo inviável (o aluno não consegue matricular sem o
    // pré-requisito). Ela some do pool de solve, mas continua em `materiasBase`
    // (turmas reais, essencial:true) pro diagnóstico abaixo reportar
    // ESSENCIAL_PRE_REQUISITO em vez de simplesmente not-a-thing.
    const essencialPendencias = essencialNorm ? pendenciasPreRequisitoMap.get(essencialNorm) ?? [] : [];
    const essencialBloqueadaPorPreRequisito = essencialNorm !== null && essencialPendencias.length > 0;

    const materiasParaSolver: Array<MateriaTurmas<TurmaOferta>> = materiasBase
        .filter((e) => !(e.essencial && essencialBloqueadaPorPreRequisito))
        .map((e) => ({
            chave: e.chave,
            turmas: e.turmas,
            peso: e.peso,
            creditos: e.creditos,
            obrigatoria: e.obrigatoria,
            essencial: e.essencial,
        }));

    const opcoes = autoMontarGradeOpcoes(
        materiasParaSolver,
        0n,
        params.limiteCreditos,
        ESTRATEGIAS_RANKING,
        6,
        (turma) => turma.id_turmas
    );

    let erros: ErroMontagem[] = [];
    if (essencialNorm) {
        const essencialAusenteDoSolver = !materiasParaSolver.some((e) => e.chave === essencialNorm);
        // "some", não "every": a alocabilidade da essencial não varia entre
        // estratégias (o peso dominante garante inclusão sempre que existe QUALQUER
        // turma sem conflito, independente do bônus de cada estratégia) — se uma
        // opção não alocou, nenhuma vai.
        const essencialNaoAlocada =
            opcoes.length === 0 || opcoes.some((o) => !o.resultado.selecao.has(essencialNorm));

        if (essencialAusenteDoSolver || essencialNaoAlocada) {
            const materiasParaDiagnostico: Array<MateriaTurmas<TurmaOferta>> = materiasBase.map((e) => ({
                chave: e.chave,
                turmas: e.turmas,
                essencial: e.essencial,
            }));
            erros = diagnosticarEssenciais(materiasParaDiagnostico, [essencialNorm], {
                turmasAntesDoFiltroDeTurno,
                turnosComOferta,
                pendenciasPreRequisito: pendenciasPreRequisitoMap,
            });
        }
    }

    return { opcoes, erros };
}
