<script lang="ts">
	/**
	 * Wordmark /cria._nex> que se recolhe na carinha da logo /._> e volta.
	 * Ciclo: palavra → "cria" e "nex" somem, os caracteres que sobram ganham as
	 * cores da logo (/ roxo, . texto, _ verde, > rosa) → o olho pisca → volta.
	 * Com prefers-reduced-motion fica parado na palavra. Leitores de tela leem
	 * sempre "Crianex".
	 *
	 * modo="loop": repete sem parar (rodapé). modo="entrada": toca UMA vez quando
	 * entra na tela e de novo ao passar o mouse — para não ter dois loops
	 * competindo na mesma página.
	 */
	interface Props {
		/** Duração de um ciclo completo, em segundos. */
		ciclo?: number;
		modo?: 'loop' | 'entrada';
	}

	let { ciclo = 7, modo = 'loop' }: Props = $props();

	let raiz: HTMLSpanElement | undefined = $state();
	// modo entrada: a animação só existe enquanto `tocando` (um ciclo por vez)
	let tocando = $state(false);

	$effect(() => {
		const el = raiz;
		if (!el || modo !== 'entrada') return;
		// começa parado na palavra; toca uma vez quando aparece na tela
		const io = new IntersectionObserver(
			([entrada]) => {
				if (entrada.isIntersecting) {
					tocando = true;
					io.disconnect();
				}
			},
			{ threshold: 0.6 }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	function aoPassarMouse() {
		// não reinicia se ainda está no meio do ciclo
		if (modo === 'entrada' && !tocando) tocando = true;
	}

	function aoTerminar(e: AnimationEvent) {
		// .cria é a animação mais longa do ciclo: quando ela acaba, o ciclo acabou
		if (modo === 'entrada' && e.animationName.includes('recolhe-cria')) tocando = false;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
	bind:this={raiz}
	class="wordmark"
	class:loop={modo === 'loop'}
	class:tocando
	style={`--ciclo: ${ciclo}s`}
	aria-label="Crianex"
	role="img"
	onpointerenter={aoPassarMouse}
	onanimationend={aoTerminar}
>
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
	}

	.nex {
		max-width: 3ch;
	}

	.olho {
		transform-origin: 50% 80%;
	}

	/* loop: repete sempre · tocando: um ciclo (modo entrada) */
	.wordmark:is(.loop, .tocando) {
		--repeticoes: infinite;
	}

	.wordmark.tocando {
		--repeticoes: 1;
	}

	.wordmark:is(.loop, .tocando) .cria {
		animation: recolhe-cria var(--ciclo) ease-in-out var(--repeticoes);
	}

	.wordmark:is(.loop, .tocando) .nex {
		animation: recolhe-nex var(--ciclo) ease-in-out var(--repeticoes);
	}

	.wordmark:is(.loop, .tocando) .barra {
		animation: vira-violeta var(--ciclo) ease-in-out var(--repeticoes);
	}

	.wordmark:is(.loop, .tocando) .seta {
		animation: vira-magenta var(--ciclo) ease-in-out var(--repeticoes);
	}

	.wordmark:is(.loop, .tocando) .olho {
		animation: pisca var(--ciclo) ease-in-out var(--repeticoes);
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
		.wordmark :is(.cria, .nex, .barra, .seta, .olho) {
			animation: none !important;
		}
	}
</style>
