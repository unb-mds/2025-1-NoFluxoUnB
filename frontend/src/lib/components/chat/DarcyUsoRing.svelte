<script lang="ts">
	import { estadoRodinha, type CotaIA } from '$lib/utils/darcy-cota';

	/**
	 * Rodinha de uso diário do Darcy, ao lado do botão de enviar: anel de
	 * progresso (usadas/limite) — azul no normal, âmbar quando restam ≤ 20%,
	 * vermelho no limite. O texto completo vai no tooltip e no aria-label.
	 */
	let { cota }: { cota: Pick<CotaIA, 'usadas' | 'limite'> } = $props();

	const RAIO = 9;
	const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

	const estado = $derived(estadoRodinha(cota));
	const COR_TRACO: Record<string, string> = {
		azul: 'stroke-sky-400',
		ambar: 'stroke-amber-400',
		vermelho: 'stroke-rose-500'
	};
</script>

<span
	class="group relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
	role="img"
	aria-label={estado.rotulo}
	data-cor={estado.cor}
>
	<svg viewBox="0 0 24 24" class="h-7 w-7 -rotate-90" aria-hidden="true">
		<circle cx="12" cy="12" r={RAIO} fill="none" class="stroke-white/15" stroke-width="3" />
		<circle
			cx="12"
			cy="12"
			r={RAIO}
			fill="none"
			class="{COR_TRACO[estado.cor]} transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
			stroke-width="3"
			stroke-linecap="round"
			stroke-dasharray={CIRCUNFERENCIA}
			stroke-dashoffset={CIRCUNFERENCIA * (1 - estado.fracao)}
		/>
	</svg>
	<span
		class="pointer-events-none absolute right-0 bottom-full mb-2 hidden w-max max-w-56 rounded-lg border border-white/10 bg-zinc-950/95 px-2.5 py-1.5 text-[11px] leading-snug text-white/80 shadow-lg group-hover:block"
		aria-hidden="true"
	>
		{estado.rotulo}
	</span>
</span>
