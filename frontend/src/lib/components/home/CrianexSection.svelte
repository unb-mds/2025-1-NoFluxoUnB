<script lang="ts">
	import { ArrowUpRight } from 'lucide-svelte';
	import CrianexWordmark from '$lib/components/brand/CrianexWordmark.svelte';

	// História da Crianex (texto da própria Crianex, out/2026).
	const historia = [
		{
			quando: 'antes',
			texto:
				'Boas ideias ficavam no papel, e problemas reais eram aceitos como normais, resolvidos com planilha, improviso ou mais uma ferramenta que ninguém usa.'
		},
		{
			quando: 'então',
			texto:
				'Decidimos começar pelo outro lado. Entender a origem do problema antes de escrever código, validar antes de escalar e construir junto com quem vive a dor.'
		},
		{
			quando: 'hoje',
			texto:
				'Nossas crias estão no mundo. O NoFluxo orienta milhares de estudantes da UnB, o Pontua tira professores das planilhas, a Plataforma Agro acompanha o planejamento de cooperativas, e o Avalí está a caminho.'
		},
		{
			quando: 'amanhã',
			texto:
				'Cada cria anda com as próprias pernas e tem time próprio. E a Crianex segue sendo o lugar onde ideias saem do papel e pessoas crescem no caminho.'
		}
	];
</script>

<section class="crianex-section" id="crianex" aria-labelledby="crianex-title">
	<div class="crianex-card nf-card-surface">
		<p class="crianex-kicker">Um produto</p>
		<h2 id="crianex-title" class="crianex-titulo">
			<CrianexWordmark modo="entrada" />
		</h2>

		<ol class="historia" aria-label="A história da Crianex">
			{#each historia as etapa}
				<li class="etapa">
					<span class="etapa-quando">{etapa.quando}<span class="cursor">_</span></span>
					<p class="etapa-texto">{etapa.texto}</p>
				</li>
			{/each}
		</ol>

		<p class="crianex-frase">Tecnologia para resolver problemas, não para empilhar ferramentas.</p>

		<a class="crianex-cta" href="https://crianex.com" target="_blank" rel="noopener noreferrer">
			Conheça a Crianex
			<ArrowUpRight size={16} aria-hidden="true" />
		</a>
	</div>
</section>

<style>
	.crianex-section {
		padding: clamp(3rem, 7vw, 4rem) 1.5rem;
		display: flex;
		justify-content: center;
	}

	.crianex-card {
		width: 100%;
		max-width: 920px;
		padding: clamp(1.75rem, 4vw, 2.75rem);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
	}

	.crianex-kicker {
		margin: 0;
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}

	.crianex-titulo {
		margin: 0;
		font-size: clamp(1.75rem, 5vw, 2.5rem);
		letter-spacing: -0.02em;
		line-height: 1.1;
		cursor: default;
	}

	.historia {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		width: 100%;
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
	}

	@media (min-width: 720px) {
		.historia {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.etapa {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem 1.125rem;
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		background: hsl(var(--muted) / 0.35);
		text-align: left;
	}

	.etapa-quando {
		font-family: ui-monospace, 'JetBrains Mono', 'SF Mono', SFMono-Regular, Menlo, Consolas,
			monospace;
		font-weight: 700;
		font-size: 0.9375rem;
		color: hsl(var(--foreground));
	}

	.cursor {
		color: hsl(var(--crianex));
	}

	.etapa-texto {
		margin: 0;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		line-height: 1.65;
	}

	.crianex-frase {
		margin: 0.5rem 0 0;
		max-width: 620px;
		text-align: center;
		font-size: clamp(1rem, 2.2vw, 1.25rem);
		font-weight: 700;
		line-height: 1.4;
		color: hsl(var(--foreground));
	}

	.crianex-cta {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.625rem 1.125rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--crianex) / 0.6);
		color: hsl(var(--crianex));
		font-weight: 600;
		font-size: 0.9375rem;
		text-decoration: none;
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease;
	}

	.crianex-cta:hover {
		background: hsl(var(--crianex) / 0.1);
		border-color: hsl(var(--crianex));
	}

	.crianex-cta:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}
</style>
