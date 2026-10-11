<script lang="ts">
	import { LifeBuoy } from 'lucide-svelte';
	import {
		CATEGORY_LABELS,
		STATUS_LABELS,
		type TicketCategory,
		type TicketStatus
	} from '$lib/types/ticket';
	import type { TicketMetrics } from '$lib/types/dashboard';
	import { fmtHoras } from '$lib/utils/dashboard-admin';

	/**
	 * Card "Suporte" do dashboard. Com a migration 20260929b mostra o backlog
	 * que importa (aguardando o suporte, sem nenhuma resposta), mediana e P90
	 * em vez de só a média (um ticket esquecido distorce a média) e a janela
	 * dos últimos 30 dias ao lado do histórico. Sem a migration, cai no card
	 * antigo (total, média, por status e categoria).
	 */
	let { metricas, hrefTickets }: { metricas: TicketMetrics; hrefTickets: string } = $props();

	const novo = $derived(metricas.nao_resolvidos !== undefined);
	const j = $derived(metricas.ultimos_30d);
</script>

<section class="rounded-xl border border-border bg-card px-5 py-4 text-card-foreground">
	<h2 class="mb-3.5 flex items-center gap-2 text-sm font-bold text-card-foreground">
		<LifeBuoy class="h-4 w-4" /> Suporte
	</h2>

	{#if novo}
		<div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
			<div class="bloco">
				<span class="rotulo">Aguardando o suporte</span>
				<span class="grande {metricas.aguardando_suporte ? 'text-status-warning' : ''}"
					>{metricas.aguardando_suporte ?? 0}</span
				>
				<span class="sub">não resolvidos com a última fala do aluno</span>
				<span class="sub">{metricas.sem_resposta ?? 0} sem nenhuma resposta</span>
			</div>
			<div class="bloco">
				<span class="rotulo">Não resolvidos</span>
				<span class="grande">{metricas.nao_resolvidos}</span>
				<span class="sub">aberto, em andamento ou aguardando info</span>
			</div>
			<div class="bloco">
				<span class="rotulo">1ª resposta (mediana)</span>
				<span class="grande">{fmtHoras(metricas.primeira_resposta_mediana_horas)}</span>
				<span class="sub">P90 {fmtHoras(metricas.primeira_resposta_p90_horas)} · histórico</span>
			</div>
			<div class="bloco">
				<span class="rotulo">Resolução (mediana)</span>
				<span class="grande">{fmtHoras(metricas.tempo_mediana_horas)}</span>
				<span class="sub">
					P90 {fmtHoras(metricas.tempo_p90_horas)} · média {fmtHoras(metricas.tempo_medio_horas)}
				</span>
			</div>
		</div>

		<div class="mt-5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
			{#if j}
				<div class="bloco">
					<span class="rotulo">Últimos {j.dias} dias</span>
					<ul class="kv">
						<li><span>Abertos</span><strong>{j.abertos}</strong></li>
						<li><span>Resolvidos</span><strong>{j.resolvidos}</strong></li>
						<li><span>Resolução (mediana)</span><strong>{fmtHoras(j.tempo_mediana_horas)}</strong></li>
						<li><span>Resolução (P90)</span><strong>{fmtHoras(j.tempo_p90_horas)}</strong></li>
						<li>
							<span>1ª resposta (mediana)</span><strong
								>{fmtHoras(j.primeira_resposta_mediana_horas)}</strong
							>
						</li>
					</ul>
				</div>
			{/if}
			<div class="bloco">
				<span class="rotulo">Por status · {metricas.total} no total</span>
				<ul class="kv">
					{#each Object.entries(metricas.por_status) as [k, v] (k)}
						<li>
							<span>{STATUS_LABELS[k as TicketStatus] ?? k}</span><strong>{v}</strong>
						</li>
					{/each}
				</ul>
			</div>
			<div class="bloco">
				<span class="rotulo">Por categoria</span>
				<ul class="kv">
					{#each Object.entries(metricas.por_categoria) as [k, v] (k)}
						<li>
							<span>{CATEGORY_LABELS[k as TicketCategory] ?? k}</span><strong>{v}</strong>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
			<div class="bloco">
				<span class="rotulo">Total</span>
				<span class="grande">{metricas.total}</span>
				<span class="sub">Tempo médio resolução: {metricas.tempo_medio_horas}h</span>
			</div>
			<div class="bloco">
				<span class="rotulo">Por status</span>
				<ul class="kv">
					{#each Object.entries(metricas.por_status) as [k, v] (k)}
						<li>
							<span>{STATUS_LABELS[k as TicketStatus] ?? k}</span><strong>{v}</strong>
						</li>
					{/each}
				</ul>
			</div>
			<div class="bloco">
				<span class="rotulo">Por categoria</span>
				<ul class="kv">
					{#each Object.entries(metricas.por_categoria) as [k, v] (k)}
						<li>
							<span>{CATEGORY_LABELS[k as TicketCategory] ?? k}</span><strong>{v}</strong>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}
	<a class="link" href={hrefTickets}>Ver todos os tickets →</a>
</section>

<style>
	.bloco {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.rotulo {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}
	.grande {
		font-size: 24px;
		font-weight: 700;
		color: hsl(var(--card-foreground));
	}
	.grande.text-status-warning {
		color: hsl(var(--status-warning));
	}
	.sub {
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	.kv {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.kv li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
	.kv strong {
		color: hsl(var(--card-foreground));
	}
	.link {
		display: inline-block;
		margin-top: 14px;
		font-size: 13px;
		font-weight: 600;
		color: hsl(var(--primary));
		text-decoration: none;
	}
	.link:hover {
		text-decoration: underline;
	}
	/* No escuro o --primary fica em 4,2:1 sobre o card; o lilás --ai passa de 4,5:1. */
	:global(.dark) .link {
		color: hsl(var(--ai));
	}
</style>
