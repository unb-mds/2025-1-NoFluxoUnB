<script lang="ts">
	import { estadoRodinha, TOKEN_RODINHA, type CotaIA } from '$lib/utils/darcy-cota';

	/**
	 * Rodinha de uso diário do Darcy, ao lado do botão de enviar: anel de
	 * progresso (usadas/limite) — azul no normal, âmbar quando restam ≤ 20%,
	 * vermelho no limite. O texto completo vai no tooltip e no aria-label.
	 *
	 * Cores só por token (`--status-*`, com par light/dark) e disco próprio em
	 * `bg-card`: o contraste do anel (≥ 3:1) não depende da superfície do chat.
	 */
	let { cota }: { cota: Pick<CotaIA, 'usadas' | 'limite'> } = $props();

	const RAIO = 9;
	const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

	const estado = $derived(estadoRodinha(cota));
	// Classes literais (o Tailwind só gera o que aparece escrito no código).
	const COR_TRACO: Record<(typeof TOKEN_RODINHA)[keyof typeof TOKEN_RODINHA], string> = {
		'status-info': 'stroke-status-info',
		'status-warning': 'stroke-status-warning',
		'status-danger': 'stroke-status-danger'
	};
</script>

<span
	class="group relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card"
	role="img"
	aria-label={estado.rotulo}
	data-cor={estado.cor}
>
	<svg viewBox="0 0 24 24" class="h-7 w-7 -rotate-90" aria-hidden="true">
		<circle cx="12" cy="12" r={RAIO} fill="none" class="stroke-border" stroke-width="3" />
		<circle
			cx="12"
			cy="12"
			r={RAIO}
			fill="none"
			class="{COR_TRACO[
				TOKEN_RODINHA[estado.cor]
			]} transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
			stroke-width="3"
			stroke-linecap="round"
			stroke-dasharray={CIRCUNFERENCIA}
			stroke-dashoffset={CIRCUNFERENCIA * (1 - estado.fracao)}
		/>
	</svg>
	<span
		class="pointer-events-none absolute right-0 bottom-full mb-2 hidden w-max max-w-56 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] leading-snug text-popover-foreground shadow-lg group-hover:block"
		aria-hidden="true"
	>
		{estado.rotulo}
	</span>
</span>
