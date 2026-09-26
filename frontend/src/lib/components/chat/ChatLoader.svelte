<script lang="ts">
	import { fade } from 'svelte/transition';

	interface Props {
		text?: string;
		name?: string;
	}
	let { text, name = 'Darcy AI' }: Props = $props();

	// Frases rotativas enquanto o agente pensa — um texto fixo via prop `text`
	// desliga a rotação (ex.: "Enviando...").
	const FRASES = [
		'Pensando...',
		'Consultando o fluxograma...',
		'Destrinchando pré-requisitos...',
		'Contando créditos nos dedos...',
		'Fuçando as ementas...',
		'Driblando o SIGAA...',
		'Conferindo a oferta de turmas...',
		'Alinhando os semestres...',
		'Evitando choque de horário...',
		'Negociando com o algoritmo...',
		'Passando no RU antes de responder...',
		'Traçando a rota até a formatura...'
	];

	let idx = $state(Math.floor(Math.random() * FRASES.length));

	$effect(() => {
		if (text) return;
		const timer = setInterval(() => {
			// Pula uma quantidade aleatória para não ficar previsível, sem repetir a atual.
			idx = (idx + 1 + Math.floor(Math.random() * (FRASES.length - 1))) % FRASES.length;
		}, 2600);
		return () => clearInterval(timer);
	});

	const exibido = $derived(text ?? FRASES[idx]);
</script>

<div class="flex flex-col items-start mb-4 relative z-10">
	{#if name}
		<span class="text-[10px] font-medium text-accent-foreground dark:text-white/40 mb-1.5 px-1 uppercase tracking-widest">{name}</span>
	{/if}
	<div class="max-w-[85%] px-5 py-4 bg-accent dark:bg-black/30 backdrop-blur-xl border border-ai/20 dark:border-white/10 rounded-[24px] rounded-tl-[8px] shadow-sm dark:shadow-lg flex items-center gap-3">
		<div class="liquid-loader shrink-0 shadow-lg scale-75 origin-left">
			<div class="liquid-blob-1"></div>
			<div class="liquid-blob-2"></div>
		</div>
		{#key exibido}
			<span class="text-[13px] text-muted-foreground animate-pulse font-medium" in:fade={{ duration: 300 }}>{exibido}</span>
		{/key}
	</div>
</div>

<style>
	.liquid-loader {
		position: relative;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		overflow: hidden;
		background-color: transparent;
	}
	.liquid-blob-1 {
		position: absolute;
		width: 24px;
		height: 24px;
		background: #8b5cf6;
		border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
		animation: liquidMix 3s linear infinite;
		filter: blur(5px);
		/* Light: multiply pra manter a cor sobre fundo claro (screen viraria branco). */
		mix-blend-mode: multiply;
		opacity: 0.8;
	}
	.liquid-blob-2 {
		position: absolute;
		width: 24px;
		height: 24px;
		background: #3b82f6;
		border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
		animation: liquidMixReverse 4s linear infinite;
		filter: blur(5px);
		mix-blend-mode: multiply;
		opacity: 0.8;
	}
	/* Dark: valores originais (blend screen sobre fundo escuro). */
	:global(.dark) .liquid-blob-1,
	:global(.dark) .liquid-blob-2 {
		mix-blend-mode: screen;
	}
	@keyframes liquidMix {
		0% { transform: rotate(0deg) scale(1) translate(-2px, -2px); }
		50% { transform: rotate(180deg) scale(1.3) translate(2px, 2px); }
		100% { transform: rotate(360deg) scale(1) translate(-2px, -2px); }
	}
	@keyframes liquidMixReverse {
		0% { transform: rotate(360deg) scale(1) translate(2px, 2px); }
		50% { transform: rotate(180deg) scale(1.3) translate(-2px, -2px); }
		100% { transform: rotate(0deg) scale(1) translate(2px, 2px); }
	}
</style>
