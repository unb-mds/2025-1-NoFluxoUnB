<script lang="ts">
	import { AlertTriangle, Clock, OctagonAlert } from 'lucide-svelte';
	import type { AiSaldoStatus } from '$lib/types/dashboard';
	import { alertasSaldo, URL_PAINEL_MARITACA, type AlertaSaldo, type TomAlerta } from '$lib/utils/ia-saldo';

	/**
	 * Alertas de saldo da IA no topo do dashboard, em ordem de prioridade:
	 * créditos acabaram (erro real da Maritaca nas últimas 24h), urgente,
	 * atenção e saldo desatualizado. Os níveis vêm decididos do banco
	 * (get_ai_saldo_status); aqui só o texto e o tom. Cores só por token.
	 */
	let { status, agora = new Date() }: { status: AiSaldoStatus | null; agora?: Date } = $props();

	const alertas = $derived(alertasSaldo(status, agora));

	const CAIXA: Record<TomAlerta, string> = {
		danger: 'border-status-danger/50 bg-status-danger/10',
		warning: 'border-status-warning/50 bg-status-warning/10',
		neutral: 'border-border bg-muted'
	};
	const COR_ICONE: Record<TomAlerta, string> = {
		danger: 'text-status-danger',
		warning: 'text-status-warning',
		neutral: 'text-muted-foreground'
	};
	const ICONE: Record<AlertaSaldo['nivel'], typeof Clock> = {
		sem_creditos: OctagonAlert,
		urgente: OctagonAlert,
		atencao: AlertTriangle,
		desatualizado: Clock
	};
</script>

{#if alertas.length > 0}
	<div class="mb-3 flex flex-col gap-2" data-testid="ia-saldo-alertas">
		{#each alertas as a (a.nivel)}
			{@const Icone = ICONE[a.nivel]}
			<!-- bg-card por baixo: o tom translúcido não depende do fundo da página -->
			<div class="rounded-lg bg-card">
				<div
					class="flex gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed text-card-foreground {CAIXA[a.tom]}"
					role={a.tom === 'neutral' ? 'status' : 'alert'}
					data-nivel={a.nivel}
				>
					<Icone class="mt-0.5 h-4 w-4 shrink-0 {COR_ICONE[a.tom]}" />
					<div>
						<strong class="block text-card-foreground">{a.titulo}</strong>
						<span>{a.texto}</span>
						<a class="link" href={URL_PAINEL_MARITACA} target="_blank" rel="noopener noreferrer">
							Abrir plataforma.maritaca.ai
						</a>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.link {
		margin-left: 4px;
		font-weight: 600;
		color: hsl(var(--primary));
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	/* No escuro o --primary não chega a 4,5:1 sobre o card; o lilás --ai passa. */
	:global(.dark) .link {
		color: hsl(var(--ai));
	}
</style>
