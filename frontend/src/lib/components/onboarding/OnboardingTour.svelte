<script lang="ts">
	import { tourStore } from './tour.store.svelte';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';

	/**
	 * Coach marks com spotlight: escurece a página inteira, recorta o elemento do
	 * passo atual e ancora um card ao lado dele. Passo sem alvo (ou com alvo que
	 * não existe na tela) vira card centralizado, então o tour nunca trava.
	 */

	interface Rect {
		top: number;
		left: number;
		width: number;
		height: number;
	}

	const MARGEM = 14;
	const CARD_W = 340;

	// Só `alvo` e `cardPos` são reativos: são o que o template desenha. Medidas de
	// apoio ficam fora do grafo — lê-las e escrevê-las dentro do mesmo efeito criaria
	// um laço de atualização (o Svelte aborta e a reatividade da página inteira morre).
	let alvo = $state<Rect | null>(null);
	let cardPos = $state<{ top: number; left: number } | null>(null);
	let cardEl = $state<HTMLElement | null>(null);
	let viewport = { w: 0, h: 0 };

	const step = $derived(tourStore.stepAtual);

	function medir(): void {
		const s = untrack(() => tourStore.stepAtual);
		if (!s) return;

		viewport = { w: window.innerWidth, h: window.innerHeight };

		const el = s.target ? document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`) : null;
		if (!el) {
			alvo = null;
			cardPos = null;
			return;
		}

		const pad = s.padding ?? 8;
		const r = el.getBoundingClientRect();
		alvo = {
			top: r.top - pad,
			left: r.left - pad,
			width: r.width + pad * 2,
			height: r.height + pad * 2
		};
		cardPos = posicionarCard(alvo, s.side ?? 'bottom');
	}

	/** Escolhe o lado com espaço; cai para o oposto e, no aperto, centraliza embaixo. */
	function posicionarCard(r: Rect, preferido: 'top' | 'bottom' | 'left' | 'right') {
		const card = untrack(() => cardEl);
		const alturaCard = card?.offsetHeight ?? 210;
		const larguraCard = card?.offsetWidth ?? CARD_W;
		const { w, h } = viewport;

		const cabe = {
			top: r.top - MARGEM - alturaCard > 8,
			bottom: r.top + r.height + MARGEM + alturaCard < h - 8,
			left: r.left - MARGEM - larguraCard > 8,
			right: r.left + r.width + MARGEM + larguraCard < w - 8
		};

		const oposto = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const;
		const ordem = [preferido, oposto[preferido], 'bottom', 'top', 'right', 'left'] as const;
		const lado = ordem.find((l) => cabe[l]) ?? 'bottom';

		let top: number;
		let left: number;
		if (lado === 'top') {
			top = r.top - MARGEM - alturaCard;
			left = r.left + r.width / 2 - larguraCard / 2;
		} else if (lado === 'bottom') {
			top = r.top + r.height + MARGEM;
			left = r.left + r.width / 2 - larguraCard / 2;
		} else if (lado === 'left') {
			top = r.top + r.height / 2 - alturaCard / 2;
			left = r.left - MARGEM - larguraCard;
		} else {
			top = r.top + r.height / 2 - alturaCard / 2;
			left = r.left + r.width + MARGEM;
		}

		return {
			top: Math.min(Math.max(top, 8), Math.max(8, h - alturaCard - 8)),
			left: Math.min(Math.max(left, 8), Math.max(8, w - larguraCard - 8))
		};
	}

	// Reposiciona a cada troca de passo — com o alvo já rolado para a tela.
	// IMPORTANTE: nenhuma escrita de $state no corpo do efeito. Ao fechar, o passo
	// vira null durante o desmonte do bloco; escrever estado aqui nesse momento
	// interrompia a remoção do overlay, que ficava invisível bloqueando a página.
	// medir() (via rAF/timeout) já zera alvo/cardPos quando o passo não tem alvo.
	$effect(() => {
		const s = tourStore.stepAtual;
		if (!s) return;

		const el = s.target ? document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`) : null;
		el?.scrollIntoView({ block: 'center', behavior: 'smooth' });

		// Todas as medições saem do efeito (rAF/timeout): medir() escreve estado, e
		// fazer isso de dentro do efeito que observa o passo realimenta o grafo.
		const raf = requestAnimationFrame(medir);
		// Uma medida depois do scroll suave e outra com o card já montado — a altura
		// real dele muda de que lado ele cabe.
		const t1 = setTimeout(medir, 80);
		const t2 = setTimeout(medir, 440);
		return () => {
			cancelAnimationFrame(raf);
			clearTimeout(t1);
			clearTimeout(t2);
		};
	});

	$effect(() => {
		if (!tourStore.aberto) return;
		const onChange = () => medir();
		window.addEventListener('resize', onChange);
		window.addEventListener('scroll', onChange, true);
		return () => {
			window.removeEventListener('resize', onChange);
			window.removeEventListener('scroll', onChange, true);
		};
	});

	/** "Pular" é saída explícita: persiste e ensina onde reabrir. */
	function pular(): void {
		tourStore.concluir();
		toast.info('Sem problema! Reveja o passo a passo quando quiser em "Como funciona", no topo.');
	}

	function onKeydown(event: KeyboardEvent): void {
		if (!tourStore.aberto) return;
		if (event.key === 'Escape') {
			// Dispensa acidental: fecha sem gravar — o tour volta na próxima visita.
			event.preventDefault();
			tourStore.fechar();
		} else if (event.key === 'ArrowRight' || event.key === 'Enter') {
			event.preventDefault();
			tourStore.proximo();
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			tourStore.anterior();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if tourStore.aberto && step}
	<!--
		Véu + recorte. Clique fora FECHA sem marcar como visto: no celular esse é o
		gesto natural de dispensar, e avançar aqui queimava o tour inteiro sem o
		aluno ler nada — ele volta a se oferecer na próxima visita.
	-->
	<!-- Só transição de ENTRADA: outros (out:) neste bloco já falharam em completar
	     e deixavam o overlay invisível preso no DOM, bloqueando a página inteira.
	     Remoção síncrona é a opção segura para um véu fixed de tela cheia. -->
	<div
		class="tour-overlay"
		in:fade={{ duration: 220 }}
		role="presentation"
		onclick={() => tourStore.fechar()}
	>
		{#if alvo}
			<div
				class="tour-spotlight"
				style={`top:${alvo.top}px; left:${alvo.left}px; width:${alvo.width}px; height:${alvo.height}px;`}
			></div>
			<div
				class="tour-pulse"
				style={`top:${alvo.top}px; left:${alvo.left}px; width:${alvo.width}px; height:${alvo.height}px;`}
			></div>
		{:else}
			<div class="tour-veil"></div>
		{/if}
	</div>

	<div
		bind:this={cardEl}
		class="tour-card nf-card-surface"
		class:tour-card-centered={!cardPos}
		style={cardPos ? `top:${cardPos.top}px; left:${cardPos.left}px;` : undefined}
		in:fly={{ y: 12, duration: 320, easing: cubicOut }}
		role="dialog"
		aria-modal="true"
		aria-label={step.title}
	>
		<header class="tour-card-head">
			<span class="tour-step-badge">
				<Sparkles class="h-3 w-3" />
				Passo {tourStore.index + 1} de {tourStore.total}
			</span>
			<button
				type="button"
				class="tour-close"
				onclick={() => tourStore.fechar()}
				aria-label="Fechar tour"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</header>

		<h2 class="tour-title">{step.title}</h2>
		<p class="tour-desc">{step.description}</p>
		{#if step.hint}
			<p class="tour-hint">{step.hint}</p>
		{/if}

		<div class="tour-dots" role="tablist" aria-label="Progresso do tour">
			{#each tourStore.steps as s, i (s.title)}
				<button
					type="button"
					class="tour-dot"
					class:active={i === tourStore.index}
					class:done={i < tourStore.index}
					onclick={() => tourStore.irPara(i)}
					aria-label={`Ir para o passo ${i + 1}: ${s.title}`}
					aria-selected={i === tourStore.index}
					role="tab"
				></button>
			{/each}
		</div>

		<footer class="tour-actions">
			<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={pular}>Pular</Button>
			<div class="tour-actions-right">
				{#if !tourStore.isPrimeiro}
					<Button variant="outline" size="sm" onclick={() => tourStore.anterior()}>
						<ArrowLeft class="h-3.5 w-3.5" />
						Voltar
					</Button>
				{/if}
				<Button size="sm" class="nf-cta-glow-hover" onclick={() => tourStore.proximo()}>
					{#if tourStore.isUltimo}
						<Check class="h-3.5 w-3.5" />
						Entendi!
					{:else}
						Próximo
						<ArrowRight class="h-3.5 w-3.5" />
					{/if}
				</Button>
			</div>
		</footer>
	</div>
{/if}

<style>
	.tour-overlay {
		position: fixed;
		inset: 0;
		z-index: 120;
	}

	.tour-veil {
		position: absolute;
		inset: 0;
		background: hsl(240 14% 3% / 0.72);
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
	}

	/* O "buraco" do spotlight é a própria sombra gigante ao redor do recorte. */
	.tour-spotlight {
		position: absolute;
		border-radius: 16px;
		box-shadow:
			0 0 0 9999px hsl(240 14% 3% / 0.72),
			inset 0 0 0 1.5px hsl(var(--primary) / 0.65);
		transition:
			top 0.42s cubic-bezier(0.4, 0, 0.2, 1),
			left 0.42s cubic-bezier(0.4, 0, 0.2, 1),
			width 0.42s cubic-bezier(0.4, 0, 0.2, 1),
			height 0.42s cubic-bezier(0.4, 0, 0.2, 1);
		pointer-events: none;
	}

	.tour-pulse {
		position: absolute;
		border-radius: 16px;
		pointer-events: none;
		box-shadow: 0 0 0 0 hsl(var(--primary) / 0.45);
		animation: tour-pulse 2.4s ease-out infinite;
		transition:
			top 0.42s cubic-bezier(0.4, 0, 0.2, 1),
			left 0.42s cubic-bezier(0.4, 0, 0.2, 1),
			width 0.42s cubic-bezier(0.4, 0, 0.2, 1),
			height 0.42s cubic-bezier(0.4, 0, 0.2, 1);
	}

	@keyframes tour-pulse {
		0% {
			box-shadow:
				0 0 0 0 hsl(var(--primary) / 0.4),
				0 0 22px hsl(var(--primary) / 0.25);
		}
		70% {
			box-shadow:
				0 0 0 12px hsl(var(--primary) / 0),
				0 0 22px hsl(var(--primary) / 0.1);
		}
		100% {
			box-shadow:
				0 0 0 0 hsl(var(--primary) / 0),
				0 0 22px hsl(var(--primary) / 0);
		}
	}

	.tour-card {
		position: fixed;
		z-index: 130;
		width: min(340px, calc(100vw - 2rem));
		padding: 1rem 1.1rem 0.9rem;
		box-shadow:
			inset 0 1px 0 hsl(0 0% 100% / 0.09),
			0 0 0 1px hsl(var(--primary) / 0.18),
			0 24px 60px hsl(0 0% 0% / 0.6),
			0 0 60px hsl(var(--primary) / 0.12);
	}

	.tour-card-centered {
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	.tour-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}

	.tour-step-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--primary) / 0.3);
		background: hsl(var(--primary) / 0.14);
		/* Light: roxo escuro sobre o tint (5,1:1). Dark mantém o branco histórico abaixo. */
		color: hsl(var(--primary));
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	:global(.dark) .tour-step-badge {
		color: hsl(var(--primary-foreground));
	}

	.tour-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: background 0.18s ease;
	}

	.tour-close:hover {
		background: hsl(var(--foreground) / 0.08);
		color: hsl(var(--foreground));
	}

	.tour-title {
		color: hsl(var(--foreground));
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: -0.015em;
		margin: 0 0 0.35rem;
	}

	.tour-desc {
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		line-height: 1.6;
		margin: 0;
	}

	.tour-hint {
		display: flex;
		gap: 0.4rem;
		margin: 0.6rem 0 0;
		padding: 0.5rem 0.65rem;
		border-radius: 10px;
		border: 1px solid hsl(var(--ai) / 0.22);
		background: hsl(var(--ai-soft) / 0.4);
		color: hsl(var(--ai) / 0.92);
		font-size: 0.75rem;
		line-height: 1.5;
	}

	.tour-dots {
		display: flex;
		gap: 0.3rem;
		margin: 0.9rem 0 0.75rem;
	}

	.tour-dot {
		width: 18px;
		height: 4px;
		border-radius: 999px;
		border: none;
		padding: 0;
		cursor: pointer;
		background: hsl(var(--foreground) / 0.14);
		transition:
			background 0.25s ease,
			width 0.25s ease;
	}

	.tour-dot.done {
		background: hsl(var(--primary) / 0.45);
	}

	.tour-dot.active {
		width: 26px;
		background: hsl(var(--primary));
	}

	.tour-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.tour-actions-right {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.tour-spotlight,
		.tour-pulse {
			transition: none;
			animation: none;
		}
	}
</style>
