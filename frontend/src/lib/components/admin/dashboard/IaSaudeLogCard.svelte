<script lang="ts">
	import { Activity, AlertTriangle } from 'lucide-svelte';
	import type { AiSaudeLog } from '$lib/types/dashboard';
	import {
		HORAS_SEM_LOG_ALERTA,
		HORARIO_USO,
		haQuanto,
		linhasSaude,
		logParado
	} from '$lib/utils/dashboard-admin';

	/**
	 * Saúde do ai_usage_log: quando foi a última chamada de IA registrada (geral
	 * e por rota) e quanto falhou. Se o logger quebrar ou o Darcy cair, o card
	 * de custo só mostra números baixos — aqui aparece o alerta.
	 */
	let { saude, dias = 30 }: { saude: AiSaudeLog; dias?: number } = $props();

	const agora = new Date();
	const parado = $derived(logParado(saude.ultimo_registro, agora));
	const linhas = $derived(linhasSaude(saude, agora));
	const taxa = $derived(Number(saude.taxa_falha) || 0);
</script>

<section class="rounded-xl border border-border bg-card px-5 py-4 text-card-foreground">
	<h2 class="mb-3.5 flex items-center gap-2 text-sm font-bold text-card-foreground">
		<Activity class="h-4 w-4" /> Saúde do log de IA ({dias} dias)
	</h2>

	{#if parado}
		<div
			class="mb-3 flex gap-2.5 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3.5 py-3 text-[13px] leading-relaxed text-card-foreground"
			role="alert"
		>
			<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
			<span>
				Nenhuma chamada de IA registrada há mais de {HORAS_SEM_LOG_ALERTA} h em horário de uso
				({HORARIO_USO.inicio}h–{HORARIO_USO.fim}h de Brasília). Confira se o backend e o mcp_agent estão
				no ar e se o insert em <code>ai_usage_log</code> está funcionando.
			</span>
		</div>
	{/if}

	<div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
		<div class="flex flex-col gap-1.5">
			<span class="rotulo">Último registro</span>
			<span class="text-2xl font-bold text-card-foreground">{haQuanto(saude.ultimo_registro, agora)}</span>
			<span class="text-xs text-muted-foreground">{saude.requisicoes.toLocaleString('pt-BR')} chamadas no período</span>
		</div>
		<div class="flex flex-col gap-1.5">
			<span class="rotulo">Falhas (success=false)</span>
			<span class="text-2xl font-bold {taxa > 0 ? 'text-status-danger' : 'text-card-foreground'}">
				{taxa.toLocaleString('pt-BR')}%
			</span>
			<span class="text-xs text-muted-foreground">{saude.falhas} de {saude.requisicoes}</span>
		</div>
	</div>

	{#if linhas.length > 0}
		<span class="rotulo mt-4 block">Por rota</span>
		<ul class="mt-2 flex flex-col gap-1">
			{#each linhas as l (l.endpoint)}
				<li class="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-[13px] text-muted-foreground">
					<span class="truncate" title={l.endpoint}>{l.endpoint}</span>
					<span>{l.haQuanto}</span>
					<strong
						class={l.falhaAlta ? 'text-status-danger' : 'text-card-foreground'}
						title={`${l.falhas} de ${l.requisicoes} chamadas com success=false`}
					>
						{Number(l.taxa_falha).toLocaleString('pt-BR')}% falha
					</strong>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.rotulo {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}
</style>
