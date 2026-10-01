<script lang="ts">
	import { ArrowUpRight } from 'lucide-svelte';

	// Textos e produtos conforme crianex.com (set/2026).
	const produtos = [
		{ nome: 'No Fluxo', descricao: 'Fluxograma e planejamento acadêmico da UnB' },
		{ nome: 'Pontua', descricao: 'Avaliações de metodologias de aprendizagem ativa' },
		{ nome: 'Avalí', descricao: 'Gestão de avaliações e análise de desempenho' }
	];
</script>

<section class="crianex-section" id="crianex" aria-labelledby="crianex-title">
	<div class="crianex-card nf-card-surface">
		<p class="crianex-kicker">Um produto</p>
		<h2 id="crianex-title" class="crianex-wordmark" aria-label="Crianex">
			<span class="wm-base">/cria.</span><span class="wm-accent">_nex&gt;</span>
		</h2>

		<blockquote class="crianex-quote">
			“Tecnologia para resolver problemas, não para empilhar ferramentas.”
		</blockquote>

		<p class="crianex-text">
			O No Fluxo nasceu em 2025 como projeto de estudantes da UnB e hoje faz parte da Crianex, um
			estúdio de tecnologia que cria soluções sob medida: da pesquisa com quem usa até a manutenção
			contínua do produto.
		</p>

		<ul class="crianex-produtos" aria-label="Produtos da Crianex">
			{#each produtos as produto}
				<li class="produto">
					<span class="produto-nome">{produto.nome}</span>
					<span class="produto-desc">{produto.descricao}</span>
				</li>
			{/each}
		</ul>

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
		max-width: 820px;
		padding: clamp(1.75rem, 4vw, 2.5rem);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.crianex-kicker {
		margin: 0;
		font-size: 0.75rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}

	.crianex-wordmark {
		margin: 0;
		font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
		font-size: clamp(1.75rem, 5vw, 2.5rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.wm-base {
		color: hsl(var(--foreground));
	}

	.wm-accent {
		color: hsl(var(--crianex));
	}

	.crianex-quote {
		margin: 0;
		font-size: clamp(0.95rem, 2vw, 1.125rem);
		font-weight: 600;
		color: hsl(var(--foreground));
		max-width: 560px;
	}

	.crianex-text {
		margin: 0;
		color: hsl(var(--muted-foreground));
		font-size: clamp(0.8125rem, 1.5vw, 1rem);
		line-height: 1.7;
		max-width: 620px;
	}

	.crianex-produtos {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		width: 100%;
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
	}

	@media (min-width: 640px) {
		.crianex-produtos {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.produto {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.875rem 1rem;
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		background: hsl(var(--muted) / 0.35);
	}

	.produto-nome {
		font-weight: 700;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
	}

	.produto-desc {
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.crianex-cta {
		margin-top: 0.5rem;
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
