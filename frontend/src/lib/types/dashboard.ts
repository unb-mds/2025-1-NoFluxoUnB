export interface DashboardOverview {
	total_users: number;
	com_historico: number;
	com_fluxograma: number;
	tickets_abertos: number;
	novos_users_30d: number;
	taxa_ativacao: number;
}

export interface UserGrowthPoint {
	bucket: string;
	novos: number;
	acumulado: number;
}

export interface TopCurso {
	curso: string;
	usuarios: number;
}

export interface TicketMetrics {
	total: number;
	por_status: Record<string, number>;
	por_categoria: Record<string, number>;
	tempo_medio_horas: number;
}

export type GrowthBucket = 'day' | 'week' | 'month';

export interface AiModelCost {
	requisicoes: number;
	tokens: number;
	custo: number;
}

export interface AiCostDay {
	/** Dia de Brasília (YYYY-MM-DD). */
	dia: string;
	custo: number;
	requisicoes: number;
	/** Perguntas distintas no dia (migration 20260929_darcy_cota.sql). */
	perguntas?: number;
}

export interface AiEndpointCost {
	requisicoes: number;
	perguntas: number;
	custo: number;
}

export interface AiCostMetrics {
	moeda: string;
	total_requisicoes: number;
	total_tokens: number;
	custo_total: number;
	tokens_medios_por_req: number;
	por_modelo: Record<string, AiModelCost>;
	por_dia: AiCostDay[];
	precos_nao_configurados: boolean;
	// Campos da migration 20260929_darcy_cota.sql (ausentes antes dela):
	/** Perguntas distintas (uma pergunta pode gerar várias chamadas ao modelo). */
	total_perguntas?: number;
	/** Custo desde a meia-noite de Brasília. */
	custo_hoje?: number;
	/** Linhas com 0 tokens (não entram no custo). */
	requisicoes_sem_tokens?: number;
	por_endpoint?: Record<string, AiEndpointCost>;
}

export interface DarcyUsoTopUsuario {
	nome: string | null;
	email: string | null;
	usadas: number;
	limite: number;
}

/** Uso das cotas do Darcy hoje (get_darcy_uso_metrics). */
export interface DarcyUsoMetrics {
	dia: string;
	perguntas_hoje: number;
	usuarios_hoje: number;
	usuarios_no_limite: number;
	custo_hoje: number;
	concessoes_vigentes: number;
	pedidos_pendentes: number;
	top_usuarios: DarcyUsoTopUsuario[];
}

export interface TurmaConcorrida {
	codigo: string;
	nome: string;
	ofertadas: number;
	ocupadas: number;
	ocupacao: number;
}

export interface TurmasDemanda {
	periodo: string;
	periodos: string[];
	vagas_ofertadas: number;
	vagas_ocupadas: number;
	vagas_sobrando: number;
	taxa_ocupacao: number;
	top_concorridas: TurmaConcorrida[];
}

export interface ScrapingHealth {
	turmas_atualizado_em: string | null;
	turmas_mais_antigo_em: string | null;
	materias_total: number;
	materias_sem_ementa: number;
	materias_sem_ementa_pct: number;
	cursos_sem_matriz: number;
}

export interface SecurityFinding {
	fingerprint: string;
	rule: string;
	file: string;
	commit: string;
}

export interface SecurityHealth {
	ultimo_scan_em: string | null;
	ultimo_status: 'ok' | 'leaks_found' | null;
	novos_achados: number;
	ultimo_tipo: string | null;
	ultimo_run_url: string | null;
	ultimo_ok_em: string | null;
	scans_7d: number;
	falhas_7d: number;
	achados: SecurityFinding[];
}

export type FasePeriodo = 'pre_matricula' | 'matricula' | 'letivo' | 'recesso' | 'desconhecido';

/**
 * Período letivo vigente segundo `calendario_academico` (RPC
 * `periodo_letivo_vigente`). As datas são ISO (YYYY-MM-DD) e vêm nulas quando o
 * calendário não cobre a data de hoje — aí `fase` é 'desconhecido' e `periodo`
 * caiu no fallback por mês.
 */
export interface PeriodoLetivo {
	periodo: string;
	fase: FasePeriodo;
	data_inicio: string | null;
	data_fim: string | null;
	limite_matricula_25pct: string | null;
}
