import { createSupabaseBrowserClient } from '$lib/supabase/client';
import type {
	AiCostMetrics,
	DarcyUsoMetrics,
	DashboardOverview,
	GrowthBucket,
	PeriodoLetivo,
	ScrapingHealth,
	SecurityHealth,
	TicketMetrics,
	TopCurso,
	TurmasDemanda,
	UserGrowthPoint
} from '$lib/types/dashboard';

export class DashboardService {
	private supabase = createSupabaseBrowserClient();

	async getOverview(): Promise<DashboardOverview> {
		const { data, error } = await this.supabase.rpc('get_dashboard_overview');
		if (error) throw new Error(error.message);
		return data as DashboardOverview;
	}

	async getUserGrowth(days = 30, bucket: GrowthBucket = 'day'): Promise<UserGrowthPoint[]> {
		const { data, error } = await this.supabase.rpc('get_user_growth', {
			p_days: days,
			p_bucket: bucket
		});
		if (error) throw new Error(error.message);
		return (data ?? []) as UserGrowthPoint[];
	}

	async getTopCursos(limit = 10): Promise<TopCurso[]> {
		const { data, error } = await this.supabase.rpc('get_top_cursos', { p_limit: limit });
		if (error) throw new Error(error.message);
		return (data ?? []) as TopCurso[];
	}

	async getTicketMetrics(): Promise<TicketMetrics> {
		const { data, error } = await this.supabase.rpc('get_ticket_metrics');
		if (error) throw new Error(error.message);
		return data as TicketMetrics;
	}

	async getAiCostMetrics(days = 30): Promise<AiCostMetrics> {
		const { data, error } = await this.supabase.rpc('get_ai_cost_metrics', { p_days: days });
		if (error) throw new Error(error.message);
		return data as AiCostMetrics;
	}

	/** Uso das cotas do Darcy hoje (migration 20260929_darcy_cota.sql). */
	async getDarcyUsoMetrics(): Promise<DarcyUsoMetrics> {
		const { data, error } = await this.supabase.rpc('get_darcy_uso_metrics');
		if (error) throw new Error(error.message);
		return data as DarcyUsoMetrics;
	}

	async getTurmasDemanda(periodo: string | null = null): Promise<TurmasDemanda> {
		const { data, error } = await this.supabase.rpc('get_turmas_demanda', {
			p_periodo: periodo
		});
		if (error) throw new Error(error.message);
		return data as TurmasDemanda;
	}

	/**
	 * Período letivo vigente direto do calendário acadêmico no banco — mesma
	 * fonte que o scraper e o filtro de turmas usam, então o card do dashboard
	 * não pode divergir do resto do sistema.
	 */
	async getPeriodoLetivo(): Promise<PeriodoLetivo> {
		const { data, error } = await this.supabase.rpc('periodo_letivo_vigente');
		if (error) throw new Error(error.message);
		// A RPC devolve TABLE -> PostgREST responde com um array de uma linha.
		const row = (Array.isArray(data) ? data[0] : data) as PeriodoLetivo | undefined;
		if (!row) throw new Error('periodo_letivo_vigente não devolveu nenhuma linha.');
		return row;
	}

	async getScrapingHealth(): Promise<ScrapingHealth> {
		const { data, error } = await this.supabase.rpc('get_scraping_health');
		if (error) throw new Error(error.message);
		return data as ScrapingHealth;
	}

	async getSecurityHealth(): Promise<SecurityHealth> {
		const { data, error } = await this.supabase.rpc('get_security_health');
		if (error) throw new Error(error.message);
		return data as SecurityHealth;
	}
}

export const dashboardService = new DashboardService();
