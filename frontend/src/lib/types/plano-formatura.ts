/**
 * Frontend types for Motor 2 — Plano de Formatura.
 * Mirrors the backend response shape from POST /planejamento/gerar-plano.
 */

// ─── Restrições de alocação ──────────────────────────────────────────────────

export interface RestricoesPlano {
	/** Códigos que não entram no próximo semestre. */
	adiar: string[];
	/** Códigos priorizados para entrar no semestre mais cedo. */
	priorizar: string[];
	/** Limite de créditos customizado por índice de semestre. */
	limitesPersonalizados?: Record<number, number>;
	/** Optativas que o aluno adicionou ao plano via chat. */
	adicionar?: string[];
	/** Semestre escolhido por optativa adicionada (código → índice no plano). */
	adicionarEm?: Record<string, number>;
}

// ─── Mensagens de chat ───────────────────────────────────────────────────────

export type PlannerChatRole = 'user' | 'assistant';

/**
 * Seleção exata que o backend já resolveu no orquestrador (`opcaoGrade` de
 * `ChatService.OrquestradorChatResponse`) — espelhada aqui pra `PlannerChatMessage`
 * poder carregar isso por mensagem sem acoplar o tipo de mensagem do chat ao
 * client HTTP. Ver `assistente-chat.store.svelte.ts` (quem preenche) e
 * `ChatPanel.svelte` (quem lê, no clique do botão "Montar grade").
 */
export interface OpcaoGradeChat {
	estrategia: string;
	selecao: Array<{ codigo: string; idTurma: number }>;
}

export interface PlannerChatMessage {
	role: PlannerChatRole;
	content: string;
	/**
	 * Só populado em respostas do chat do Montador de Grade quando o backend já
	 * resolveu a montagem (não usado pelo chat do Plano de Formatura). `undefined`
	 * é o caso comum — o handler cai no fallback de reconstruir a partir da tag de
	 * texto `[MONTAR_GRADE|...]`.
	 */
	opcaoGrade?: OpcaoGradeChat;
}

export interface PlannerChatResponse {
	reply: string;
	plano?: PlanoFormaturav2;
	restricoes: RestricoesPlano;
}

// ─── Preferências do usuário (onboarding) ───────────────────────────────────

export type ObjetivoPlano = 'velocidade' | 'equilibrio';

/**
 * Resposta do aluno sobre módulo livre no Montador de Grade.
 *
 * `quer: null` é "ainda não perguntamos" e é diferente de `false` ("não quero"):
 * só o primeiro autoriza a tela a perguntar. Sem essa distinção o card voltaria a
 * cada visita para quem já disse não.
 */
export interface PreferenciaModuloLivre {
	/** `null` = ainda não perguntamos. */
	quer: boolean | null;
	/** Assunto que o aluno procura. Sem ele não há o que buscar no catálogo. */
	tema?: string;
	/**
	 * Matriz em que a resposta foi dada. Quem muda de curso tem outra exigência de
	 * carga complementar, então a pergunta volta em vez de herdar a resposta antiga.
	 */
	curriculoCompleto?: string;
}

export interface PreferenciasPlano {
	/** Limite de créditos por semestre — slider de 8 a 32 (valor em créditos). */
	limiteCreditos: number;
	/** Objetivo de formatura: velocidade máxima ou equilíbrio. */
	objetivo: ObjetivoPlano;
	/** Indica se o aluno trabalha ou estagia. */
	trabalha: boolean;
	/** Indica se o onboarding já foi concluído pelo aluno. */
	onboardingConcluido: boolean;
	/** Restrições ativas (adiar/priorizar). */
	restricoes?: RestricoesPlano;
	/** Resposta sobre módulo livre no Montador. Ausente = ainda não perguntamos. */
	moduloLivre?: PreferenciaModuloLivre;
}

/**
 * Teto de carga por semestre: 32 créditos (480 horas).
 *
 * É o mesmo teto que o Motor 2 aplica no backend (`Math.min(..., 480)` em
 * `plano_formatura.service.ts`) e o que o agente do chat aceita ("entre 8 e 32").
 * Aqui ele existe para o slider não oferecer ao aluno uma carga que o resto do
 * sistema recusaria depois.
 *
 * Não é regra publicada da UnB — `docs/unb-domain.md` não documenta teto de
 * matrícula, e o 480 do backend é empírico. É um limite nosso, e o comentário
 * fica para quem um dia encontrar a norma real.
 */
export const LIMITE_CREDITOS_MAX = 32;

/**
 * Piso de carga por semestre: 8 créditos (120 horas).
 *
 * Mesmo piso que o Motor 2 usa ao distribuir (`Math.max(120, ...)`). Vale
 * sobretudo porque o limite passou a ser PERSISTIDO: sem piso, um arraste até
 * zero viraria a preferência salva do aluno, e a visita seguinte abriria com
 * limite zero — nenhuma matéria semeada e uma tela vazia sem explicação. Para
 * esvaziar a grade existe o botão "Limpar".
 */
export const LIMITE_CREDITOS_MIN = 8;

export const DEFAULT_PREFERENCIAS: PreferenciasPlano = {
	limiteCreditos: 24,
	objetivo: 'equilibrio',
	trabalha: false,
	onboardingConcluido: false
};

// ─── Matéria no plano (item do semestre) ─────────────────────────────────────

export type TipoMateriaPlano = 'recomendado' | 'estimado' | 'critico';

export interface MateriaPlano {
	/** Código da disciplina (ex: "CIC0110"). */
	codigo: string;
	/** Nome completo da disciplina. */
	nome: string;
	/** Carga horária em créditos. */
	creditos: number;
	/** Indica se a matéria é crítica (atrasa a formatura se não cursada). */
	critica: boolean;
	/** Quantidade de matérias desbloqueadas diretamente por esta. */
	desbloqueia_direto: number;
	/** Quantidade de matérias desbloqueadas indiretamente (cadeia completa). */
	desbloqueia_indireto: number;
	/** Motivo pelo qual a matéria está neste semestre. */
	motivo: string;
	/** Dificuldade estimada pela IA (1 a 10). */
	dificuldadeEstimada?: number;
	/** Justificativa da IA para a dificuldade calculada. */
	motivoDificuldade?: string;
	/** true quando a matéria não é obrigatória (optativa adicionada pelo aluno). */
	optativa?: boolean;
}

// ─── Slots genéricos para créditos ────────────────────────────────────────────

export interface OptativaSlot {
	tipo: 'optativa_slot';
	ch: number;
	descricao: string;
}

export interface ComplementarSlot {
	tipo: 'complementar_slot';
	ch: number;
	descricao: string;
}

// ─── Semestre no plano ────────────────────────────────────────────────────────

export type TipoSemestre = 'recomendado' | 'estimado' | 'em_curso';

export type ItemSemestre = MateriaPlano | OptativaSlot | ComplementarSlot;

export interface SemestrePlano {
	/** Identificador do semestre (ex: "2025.2"). */
	semestre?: string;
	/** Índice 0-based do semestre dentro do plano. */
	indice: number;
	/** Tipo: "em_curso" (semestre atual), "recomendado" (próximo), ou "estimado" (futuros). */
	tipo: TipoSemestre;
	/** Total de créditos neste semestre. */
	creditos: number;
	/**
	 * INTERNO: Valor exato em horas para evitar arredondamento duplo.
	 * Evita perda de ~3-14h por semestre causada por conversão horas→creditos→horas.
	 * Preenchido pelo backend em distribuirPorSemestres; consumido em distribuirSlots.
	 */
	_horasInternas?: number;
	/** Lista de matérias planejadas ou slots genéricos para este semestre. */
	materias: ItemSemestre[];
}

// ─── Matéria em curso (semestre atual) ────────────────────────────────────────

export interface MateriaSemestreAtual {
	/** Código da disciplina. */
	codigo: string;
	/** Nome da disciplina (opcional). */
	nome?: string;
	/** Créditos. */
	creditos: number;
	/** Status fixo. */
	status: 'MATR';
}

// ─── Plano de formatura completo ──────────────────────────────────────────────

/**
 * Legacy PlanoFormatura v1 interface (snake_case fields).
 * Kept for backwards compatibility.
 */
export interface PlanoFormaturav1 {
	/** Número de semestres restantes até a formatura. */
	semestres_restantes: number;
	/** Semestre estimado de formatura (ex: "2027.1"). */
	formatura_estimada: string;
	/** Sequência de semestres com matérias planejadas. */
	plano: SemestrePlano[];
}

/**
 * PlanoFormatura v2 interface (camelCase fields).
 * Matches the backend PlanoFormaturav2 response from Motor 2.
 */
export interface PlanoFormaturav2 {
	/** Número de semestres restantes até a formatura. */
	semestresRestantes: number;
	/** Semestre estimado de formatura (ex: "2027.1"). */
	formaturaEstimada?: string;
	/** Semestre atual com matérias em curso (opcional). */
	semestreAtual?: {
		tipo: 'em_curso';
		materias: MateriaSemestreAtual[];
	};
	/** Sequência de semestres com matérias planejadas. */
	plano: SemestrePlano[];
	/** Matérias não alocadas no plano. */
	materiasNaoAlocadas: string[];
	/** Créditos obrigatórios faltando. */
	chObrigatoriaFaltante: number;
	/** Créditos optativos faltando. */
	chOptativaFaltante: number;
	/** Créditos complementares faltando. */
	chComplementarFaltante: number;
	/**
	 * Fotografia da integralização em horas, para projetar o % acumulado a cada
	 * semestre do plano (integralizadas + em curso + semestres sobre o exigido).
	 */
	integralizacao?: {
		horasIntegralizadas: number;
		horasEmCurso: number;
		horasExigidasTotal: number;
	};
}

/**
 * Tipo compatível com ambas as versões.
 */
export type PlanoFormatura = PlanoFormaturav1 | PlanoFormaturav2;

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Dado o semestre atual do aluno e a quantidade de semestres restantes,
 * computa o semestre estimado de formatura no formato "AAAA.P".
 *
 * Exemplo: semestreAtual=3, semestresRestantes=5, anoBase=2025, periodo=2
 * → avança 5 semestres a partir de 2025.2 → 2028.1
 */
export function computeFormaturaEstimada(
	semestresRestantes: number,
	anoBase: number = new Date().getFullYear(),
	periodoBase: 1 | 2 = (new Date().getMonth() < 7 ? 1 : 2) as 1 | 2
): string {
	if (semestresRestantes <= 0) return `${anoBase}.${periodoBase}`;

	let ano = anoBase;
	let periodo = periodoBase;

	for (let i = 0; i < semestresRestantes; i++) {
		if (periodo === 1) {
			periodo = 2;
		} else {
			periodo = 1;
			ano += 1;
		}
	}

	return `${ano}.${periodo}`;
}
