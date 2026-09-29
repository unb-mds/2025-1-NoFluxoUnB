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
	class="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left shadow-lg backdrop-blur-xl"
	role="status"
	aria-live="polite"
>
	{#if tipo === 'cota'}
		<div class="flex items-start gap-3">
			<div
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-400/40 bg-rose-500/10"
			>
				<MoonStar class="h-4 w-4 text-rose-300" />
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-sm font-semibold text-white">Você usou suas {limite} perguntas de hoje</p>
				<p class="mt-0.5 text-[12px] leading-relaxed text-white/60">
					O limite renova à meia-noite. Precisa de mais?
				</p>
				<button
					type="button"
					onclick={() => darcyCotaStore.abrirPedido()}
					class="mt-3 inline-flex items-center rounded-full border border-indigo-500/40 bg-indigo-600/30 px-4 py-1.5 text-xs font-semibold text-indigo-50 shadow-[0_0_15px_rgba(99,102,241,0.15)] transition-colors hover:bg-indigo-600/50 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none"
				>
					Pedir mais perguntas
				</button>
			</div>
		</div>
	{:else}
		<div class="flex items-start gap-3">
			<div
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/10"
			>
				<PauseCircle class="h-4 w-4 text-amber-300" />
			</div>
			<p class="text-sm leading-relaxed text-white/80">
				{darcyCotaStore.mensagemTeto ?? MSG_TETO_GLOBAL}
			</p>
		</div>
	{/if}
</div>
