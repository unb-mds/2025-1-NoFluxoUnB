<!--
  Fluxograma abstrato animado: a cada passo um semestre é concluído, as setas de
  pré-requisito se desenham e liberam as matérias do semestre seguinte. Loop contínuo.
  Com prefers-reduced-motion (e no SSR) mostra o estado final, estático.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	const LARG_NO = 72;
	const ALT_NO = 30;
	const GAP_COL = 118;
	const GAP_LIN = 64;
	const CENTRO_Y = 160;

	/** Matérias por semestre. */
	const colunas = [4, 4, 3, 3, 2];

	/** Pré-requisitos: [coluna, linha] → [coluna, linha]. */
	const arestas: [[number, number], [number, number]][] = [
		[[0, 0], [1, 0]],
		[[0, 0], [1, 1]],
		[[0, 1], [1, 1]],
		[[0, 1], [1, 2]],
		[[0, 2], [1, 2]],
		[[0, 3], [1, 3]],
		[[1, 0], [2, 0]],
		[[1, 1], [2, 0]],
		[[1, 2], [2, 1]],
		[[1, 3], [2, 2]],
		[[2, 0], [3, 0]],
		[[2, 1], [3, 1]],
		[[2, 1], [3, 2]],
		[[2, 2], [3, 2]],
		[[3, 0], [4, 0]],
		[[3, 1], [4, 0]],
		[[3, 2], [4, 1]]
	];

	const x = (c: number) => 12 + c * GAP_COL;
	const y = (c: number, l: number) => CENTRO_Y - ((colunas[c] - 1) * GAP_LIN) / 2 + l * GAP_LIN - ALT_NO / 2;

	const nos = colunas.flatMap((qtd, c) =>
		Array.from({ length: qtd }, (_, l) => ({ c, l, x: x(c), y: y(c, l), barra: 0.45 + ((c * 3 + l * 7) % 5) * 0.1 }))
	);

	const linhas = arestas.map(([[c1, l1], [c2, l2]]) => {
		const x1 = x(c1) + LARG_NO;
		const y1 = y(c1, l1) + ALT_NO / 2;
		const x2 = x(c2) - 7;
		const y2 = y(c2, l2) + ALT_NO / 2;
		const meio = (x1 + x2) / 2;
		return { c: c1, d: `M${x1} ${y1} C${meio} ${y1}, ${meio} ${y2}, ${x2} ${y2}`, x2, y2 };
	});

	const LARGURA = x(colunas.length - 1) + LARG_NO + 12;

	/** Passo atual: semestres com índice < passo estão concluídos. */
	const PASSOS_PAUSA = 3;
	let passo = $state(colunas.length);

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		passo = 0;
		const id = setInterval(() => {
			passo = passo >= colunas.length + PASSOS_PAUSA ? 0 : passo + 1;
		}, 950);
		return () => clearInterval(id);
	});

	const estado = (c: number) => (c < passo ? 'feita' : c === passo ? 'liberada' : 'bloqueada');
</script>

<svg class="fluxo" viewBox="0 0 {LARGURA} 320" role="img" aria-label="Fluxograma sendo concluído semestre a semestre">
	{#each colunas as _, c}
		<text class="sem" x={x(c) + LARG_NO / 2} y="20" text-anchor="middle">{c + 1}º</text>
	{/each}

	{#each linhas as linha}
		<g class="aresta" class:desenhada={linha.c < passo}>
			<path class="linha" d={linha.d} pathLength="1" />
			<path class="ponta" d="M{linha.x2} {linha.y2 - 4.5} L{linha.x2 + 7} {linha.y2} L{linha.x2} {linha.y2 + 4.5} Z" />
		</g>
	{/each}

	{#each nos as no}
		<g class="no no-{estado(no.c)}">
			<rect x={no.x} y={no.y} width={LARG_NO} height={ALT_NO} rx="8" />
			<rect class="texto" x={no.x + 10} y={no.y + 10} width={(LARG_NO - 20) * no.barra} height="4" rx="2" />
			<rect class="texto" x={no.x + 10} y={no.y + 17} width={(LARG_NO - 20) * 0.35} height="3" rx="1.5" />
		</g>
	{/each}
</svg>

<style>
	.fluxo {
		width: 100%;
		height: auto;
		overflow: visible;
	}

	.sem {
		font-size: 11px;
		font-weight: 700;
		fill: hsl(var(--muted-foreground));
	}

	.linha {
		fill: none;
		stroke: hsl(var(--ai));
		stroke-width: 1.6;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		opacity: 0.25;
		transition:
			stroke-dashoffset 0.7s ease,
			opacity 0.4s ease;
	}

	.ponta {
		fill: hsl(var(--ai));
		opacity: 0;
		transition: opacity 0.25s ease;
	}

	.desenhada .linha {
		stroke-dashoffset: 0;
		opacity: 0.85;
	}

	.desenhada .ponta {
		opacity: 1;
		transition-delay: 0.55s;
	}

	.no rect:first-child {
		transition:
			fill 0.45s ease,
			stroke 0.45s ease,
			filter 0.45s ease;
		stroke-width: 1.5;
	}

	.no .texto {
		transition: fill 0.45s ease;
	}

	.no-bloqueada rect:first-child {
		fill: hsl(0 0% 100% / 0.05);
		stroke: hsl(0 0% 100% / 0.1);
	}

	.no-bloqueada .texto {
		fill: hsl(0 0% 100% / 0.1);
	}

	.no-liberada rect:first-child {
		fill: hsl(var(--ai-soft));
		stroke: hsl(var(--ai));
		filter: drop-shadow(0 0 6px hsl(var(--ai) / 0.55));
	}

	.no-liberada .texto {
		fill: hsl(var(--ai) / 0.7);
	}

	.no-feita rect:first-child {
		fill: hsl(var(--primary));
		stroke: hsl(var(--primary));
	}

	.no-feita .texto {
		fill: hsl(0 0% 100% / 0.75);
	}

	@media (prefers-reduced-motion: reduce) {
		.linha,
		.ponta,
		.no rect,
		.no .texto {
			transition: none;
		}
	}
</style>
