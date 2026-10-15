<script lang="ts">
	import { fly } from 'svelte/transition';
	import { CircleCheck, X } from 'lucide-svelte';

	type Props = {
		open: boolean;
		mensagem: string;
		titulo?: string;
		duracao?: number; // ms até fechar sozinho
	};
	let { open = $bindable(false), mensagem, titulo = 'Simulação concluída', duracao = 6000 }: Props = $props();

	// Fecha sozinho depois de `duracao`; limpa o timer se `open` mudar antes
	$effect(() => {
		if (!open) return;
		const timer = setTimeout(() => (open = false), duracao);
		return () => clearTimeout(timer);
	});
</script>

{#if open}
	<div
		role="status"
		aria-live="polite"
		transition:fly={{ y: 16, duration: 250 }}
		class="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm items-start gap-3 rounded-xl border border-emerald-900/40 bg-emerald-950/80 p-3.5 shadow-xl backdrop-blur-md"
	>
		<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-900/50 text-emerald-400">
			<CircleCheck class="h-4 w-4" />
		</span>

		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold text-emerald-400">{titulo}</p>
			<p class="mt-0.5 text-[12px] leading-relaxed text-white/60">{mensagem}</p>
		</div>

		<button
			type="button"
			onclick={() => (open = false)}
			aria-label="Fechar aviso"
			class="shrink-0 rounded-md p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
		>
			<X class="h-3.5 w-3.5" />
		</button>
	</div>
{/if}