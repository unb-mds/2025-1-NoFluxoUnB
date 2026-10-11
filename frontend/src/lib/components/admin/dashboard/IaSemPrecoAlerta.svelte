<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';
	import type { AiModeloSemPreco } from '$lib/types/dashboard';
	import { textoSemPreco } from '$lib/utils/dashboard-admin';

	/**
	 * Modelo presente no ai_usage_log sem preço em ai_pricing (ou com preço 0):
	 * o custo dele entra como R$ 0 no total. Mostra o alerta em vez de deixar o
	 * card de custo parecer barato em silêncio.
	 */
	let { modelos }: { modelos: AiModeloSemPreco[] | undefined } = $props();
	const texto = $derived(textoSemPreco(modelos));
</script>

{#if texto}
	<div
		class="mb-3 flex gap-2.5 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3.5 py-3 text-[13px] leading-relaxed text-card-foreground"
		role="alert"
	>
		<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
		<span><strong>Sem preço cadastrado.</strong> {texto}</span>
	</div>
{/if}
