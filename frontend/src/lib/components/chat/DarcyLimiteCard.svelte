<script lang="ts">
	import { MoonStar, PauseCircle } from 'lucide-svelte';
	import { darcyCotaStore } from '$lib/stores/darcy-cota.store.svelte';
	import { MSG_TETO_GLOBAL } from '$lib/utils/darcy-cota';

	/**
	 * Aviso no lugar do erro quando o Darcy está bloqueado para o aluno:
	 * - 'cota': usou as perguntas do dia → botão "Pedir mais perguntas" (abre o
	 *   pedido, que vira um ticket no suporte);
	 * - 'teto': o assistente pausou para todo mundo até amanhã.
	 */
	let { tipo }: { tipo: 'cota' | 'teto' } = $props();
	const limite = $derived(darcyCotaStore.cota?.limite ?? 30);
</script>

<div
	class="mb-3 rounded-2xl border border-border bg-card p-4 text-left text-card-foreground shadow-lg"
	role="status"
	aria-live="polite"
>
	{#if tipo === 'cota'}
		<div class="flex items-start gap-3">
			<div
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-status-danger/40 bg-status-danger/10"
			>
				<MoonStar class="h-4 w-4 text-status-danger" />
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-card-foreground">Você usou suas {limite} perguntas de hoje</p>
				<p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
					O limite renova à meia-noite. Precisa de mais?
				</p>
				<button
					type="button"
					onclick={() => darcyCotaStore.abrirPedido()}
					class="mt-3 inline-flex items-center rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none"
				>
					Pedir mais perguntas
				</button>
			</div>
		</div>
	{:else}
		<div class="flex items-start gap-3">
			<div
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-status-warning/40 bg-status-warning/10"
			>
				<PauseCircle class="h-4 w-4 text-status-warning" />
			</div>
			<p class="text-sm leading-relaxed text-card-foreground">
				{darcyCotaStore.mensagemTeto ?? MSG_TETO_GLOBAL}
			</p>
		</div>
	{/if}
</div>
