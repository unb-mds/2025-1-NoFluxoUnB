<script lang="ts">
	/**
	 * Wordmark /cria._nex> que se recolhe na carinha da logo /._> e volta.
	 * Ciclo: palavra → "cria" e "nex" somem, os caracteres que sobram ganham as
	 * cores da logo (/ roxo, . texto, _ verde, > rosa) → o olho pisca → volta.
	 * Com prefers-reduced-motion fica parado na palavra. Leitores de tela leem
	 * sempre "Crianex".
	 */
	interface Props {
		/** Duração de um ciclo completo, em segundos. */
		ciclo?: number;
	}

	let { ciclo = 7 }: Props = $props();
</script>

<span class="wordmark" style={`--ciclo: ${ciclo}s`} aria-label="Crianex" role="img">
	<span class="ch barra" aria-hidden="true">/</span><span class="sai cria" aria-hidden="true"
		>cria</span
	><span class="ch olho" aria-hidden="true">.</span><span class="ch boca" aria-hidden="true">_</span
	><span class="sai nex" aria-hidden="true">nex</span><span class="ch seta" aria-hidden="true"
		>&gt;</span
	>
</span>

<style>
	.wordmark {
		display: inline-flex;
		align-items: baseline;
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', SFMono-Regular, Menlo, Consolas,
			monospace;
		font-weight: 700;
		white-space: nowrap;
	}

	.ch,
	.sai {
		display: inline-block;
	}

	/* Estado de palavra: /cria. em texto, _nex> em verde (como na camiseta). */
	.barra,
	.cria,
	.olho {
		color: hsl(var(--foreground));
	}

	.boca,
	.nex,
	.seta {
		color: hsl(var(--crianex));
	}

	.sai {
		overflow: hidden;
		vertical-align: bottom;
	}

	.cria {
		max-width: 4ch;
		animation: recolhe-cria var(--ciclo) ease-in-out infinite;
	}

	.nex {
		max-width: 3ch;
		animation: recolhe-nex var(--ciclo) ease-in-out infinite;
	}

	.barra {
		animation: vira-violeta var(--ciclo) ease-in-out infinite;
	}

	.seta {
		animation: vira-magenta var(--ciclo) ease-in-out infinite;
	}

	.olho {
		transform-origin: 50% 80%;
		animation: pisca var(--ciclo) ease-in-out infinite;
	}

	/* 0–38% palavra · 38–48% recolhe · 48–86% carinha · 86–96% volta */
	@keyframes recolhe-cria {
		0%,
		38% {
			max-width: 4ch;
			opacity: 1;
		}
		48%,
		86% {
			max-width: 0;
			opacity: 0;
		}
		96%,
		100% {
			max-width: 4ch;
			opacity: 1;
		}
	}

	@keyframes recolhe-nex {
		0%,
		38% {
			max-width: 3ch;
			opacity: 1;
		}
		48%,
		86% {
			max-width: 0;
			opacity: 0;
		}
		96%,
		100% {
			max-width: 3ch;
			opacity: 1;
		}
	}

	@keyframes vira-violeta {
		0%,
		40% {
			color: hsl(var(--foreground));
		}
		48%,
		86% {
			color: hsl(var(--crianex-violeta));
		}
		94%,
		100% {
			color: hsl(var(--foreground));
		}
	}

	@keyframes vira-magenta {
		0%,
		40% {
			color: hsl(var(--crianex));
		}
		48%,
		86% {
			color: hsl(var(--crianex-magenta));
		}
		94%,
		100% {
			color: hsl(var(--crianex));
		}
	}

	@keyframes pisca {
		0%,
		64%,
		70%,
		100% {
			transform: scaleY(1);
		}
		67% {
			transform: scaleY(0.15);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cria,
		.nex,
		.barra,
		.seta,
		.olho {
			animation: none;
		}
	}
</style>
