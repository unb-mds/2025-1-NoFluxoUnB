<script lang="ts">
	import { onMount } from 'svelte';
	import { navigating } from '$app/stores';

	/**
	 * Splash de transição entre telas: um véu translúcido suave (sem cobrir
	 * a tela de forma opaca) enquanto as letras do wordmark NOFLX UNB se
	 * formam uma a uma, como tinta assentando; um traço de gradiente da
	 * marca se desenha por baixo. Se a navegação demorar, o splash segura
	 * com o wordmark pulsando (feedback de carregamento) e depois dissolve.
	 *
	 * Toca só nos momentos de "chegada" ao produto (SPLASH_TRANSITIONS):
	 * histórico recém-importado e entrada anônima na tabela de fluxogramas.
	 */

	type Phase = 'idle' | 'in' | 'hold' | 'out';

	// Pares from -> to que disparam o splash
	const SPLASH_TRANSITIONS = [
		// Histórico importado: upload salva e navega para o fluxograma pronto
		{ from: '/upload-historico', to: '/meu-fluxograma' },
		// Entrada anônima: vai direto ver a tabela de fluxogramas
		{ from: '/login-anonimo', to: '/fluxogramas' }
	];

	const NOFLX = 'NOFLX'.split('');
	const UNB = 'UNB'.split('');
	const LETTER_STAGGER_MS = 70; // intervalo entre letras
	const LETTER_MS = 380; // duração da formação de cada letra
	const IN_MS = (NOFLX.length + UNB.length) * LETTER_STAGGER_MS + LETTER_MS; // ~940ms
	const MIN_HOLD_MS = 120; // tempo mínimo com o wordmark completo
	const OUT_MS = 380; // dissolução

	let phase = $state<Phase>('idle');
	let formStart = 0;
	let navDone = false;
	let timers: ReturnType<typeof setTimeout>[] = [];

	function clearTimers() {
		timers.forEach(clearTimeout);
		timers = [];
	}

	function startSplash() {
		clearTimers();
		navDone = false;
		formStart = Date.now();
		phase = 'in';
		timers.push(
			setTimeout(() => {
				if (phase === 'in') phase = 'hold';
				if (navDone) scheduleDissolve();
			}, IN_MS)
		);
	}

	function scheduleDissolve() {
		const remaining = Math.max(0, IN_MS + MIN_HOLD_MS - (Date.now() - formStart));
		timers.push(
			setTimeout(() => {
				phase = 'out';
				timers.push(
					setTimeout(() => {
						if (phase === 'out') phase = 'idle';
					}, OUT_MS)
				);
			}, remaining)
		);
	}

	onMount(() => {
		const unsubscribe = navigating.subscribe((nav) => {
			if (nav) {
				const from = nav.from?.url.pathname;
				const to = nav.to?.url.pathname;
				if (!SPLASH_TRANSITIONS.some((t) => from === t.from && to === t.to)) return;
				startSplash();
			} else if (phase === 'in' || phase === 'hold') {
				navDone = true;
				if (phase === 'hold') scheduleDissolve();
			}
		});
		return () => {
			unsubscribe();
			clearTimers();
		};
	});
</script>

{#if phase !== 'idle'}
	<div class="nf-splash nf-splash--{phase}" aria-hidden="true">
		<div class="nf-splash-veil"></div>
		<div class="nf-splash-mark">
			<span class="nf-splash-word">
				<span class="nf-splash-noflx">
					{#each NOFLX as letter, i (i)}
						<span class="nf-splash-letter" style="--i: {i}">{letter}</span>
					{/each}
				</span>
				<span class="nf-splash-unb">
					{#each UNB as letter, i (i)}
						<span class="nf-splash-letter" style="--i: {NOFLX.length + i}">{letter}</span>
					{/each}
				</span>
			</span>
			<span class="nf-splash-stroke"></span>
		</div>
	</div>
{/if}

<style>
	.nf-splash {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	/* Véu translúcido: escurece e desfoca de leve, sem "piscar" a tela */
	.nf-splash-veil {
		position: absolute;
		inset: 0;
		background: hsl(var(--background) / 0.72);
		backdrop-filter: blur(7px);
		-webkit-backdrop-filter: blur(7px);
		opacity: 0;
	}

	/* Dark mantém o véu escuro histórico */
	:global(.dark) .nf-splash-veil {
		background: hsl(240 12% 2.4% / 0.62);
	}

	.nf-splash--in .nf-splash-veil {
		animation: nf-splash-veil-in 320ms ease-out forwards;
	}

	.nf-splash--hold .nf-splash-veil {
		opacity: 1;
	}

	.nf-splash--out .nf-splash-veil {
		opacity: 1;
		animation: nf-splash-fade-out 380ms ease forwards;
	}

	@keyframes nf-splash-veil-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes nf-splash-fade-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}

	/* Wordmark com leve rotação de "tag" */
	.nf-splash-mark {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.28rem;
		font-family: 'Permanent Marker', cursive;
		font-size: clamp(2.2rem, 6vw, 3.6rem);
		line-height: 1;
		letter-spacing: 0.015em;
		transform: rotate(-2deg);
	}

	.nf-splash-word {
		display: inline-flex;
		align-items: baseline;
		gap: 0.22em;
	}

	.nf-splash-noflx,
	.nf-splash-unb {
		display: inline-flex;
	}

	.nf-splash-noflx {
		color: hsl(var(--foreground));
		text-shadow: 0 4px 32px hsl(var(--primary) / 0.45);
	}

	:global(.dark) .nf-splash-noflx {
		color: hsl(0 0% 100%);
	}

	.nf-splash-unb {
		color: hsl(var(--primary));
		text-shadow: 0 4px 32px hsl(330 80% 55% / 0.35);
	}

	/* Cada letra se forma: sobe suave, desborra e assenta */
	.nf-splash-letter {
		display: inline-block;
		opacity: 0;
	}

	.nf-splash--in .nf-splash-letter {
		animation: nf-splash-letter-in 380ms cubic-bezier(0.2, 1.1, 0.35, 1) forwards;
		animation-delay: calc(var(--i) * 70ms);
	}

	.nf-splash--hold .nf-splash-letter,
	.nf-splash--out .nf-splash-letter {
		opacity: 1;
	}

	@keyframes nf-splash-letter-in {
		from {
			opacity: 0;
			transform: translateY(0.32em) scale(1.18);
			filter: blur(7px);
		}
		60% {
			opacity: 1;
			filter: blur(1px);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
			filter: blur(0);
		}
	}

	/* Traço de gradiente da marca se desenhando sob o wordmark */
	.nf-splash-stroke {
		width: 100%;
		height: 4px;
		border-radius: 999px;
		background: linear-gradient(90deg, #6c63ff 0%, #9c27b0 55%, #e91e63 100%);
		box-shadow: 0 2px 18px hsl(270 91% 62% / 0.4);
		transform: scaleX(0);
		transform-origin: left;
	}

	.nf-splash--in .nf-splash-stroke {
		animation: nf-splash-stroke-in 520ms cubic-bezier(0.6, 0, 0.2, 1) 260ms forwards;
	}

	.nf-splash--hold .nf-splash-stroke,
	.nf-splash--out .nf-splash-stroke {
		transform: scaleX(1);
	}

	@keyframes nf-splash-stroke-in {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	/* Navegação lenta: wordmark completo respira enquanto carrega */
	.nf-splash--hold .nf-splash-mark {
		animation: nf-splash-breathe 1.6s ease-in-out infinite;
	}

	@keyframes nf-splash-breathe {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.75;
		}
	}

	/* Dissolução: o wordmark inteiro esvai com leve blur */
	.nf-splash--out .nf-splash-mark {
		animation: nf-splash-mark-out 320ms ease-in forwards;
	}

	@keyframes nf-splash-mark-out {
		to {
			opacity: 0;
			filter: blur(5px);
			transform: rotate(-2deg) scale(0.97);
		}
	}

	/* Acessibilidade: com movimento reduzido tudo vira fade simples */
	@media (prefers-reduced-motion: reduce) {
		.nf-splash--in .nf-splash-letter {
			animation: nf-splash-veil-in 200ms ease forwards;
			animation-delay: 0ms;
		}

		.nf-splash--in .nf-splash-stroke,
		.nf-splash--hold .nf-splash-stroke {
			animation: none;
			transform: scaleX(1);
		}

		.nf-splash--hold .nf-splash-mark {
			animation: none;
		}

		.nf-splash--out .nf-splash-mark {
			animation: nf-splash-fade-out 200ms ease forwards;
		}
	}
</style>
