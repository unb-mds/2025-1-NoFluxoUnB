<!--
  /conheca — apresentação pública do NoFluxo para quem chega por link direto
  (QR, NFC, bio do Instagram). Rota isolada: sem entrada na navbar e sem navbar global.
-->
<script lang="ts">
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import FluxoAnimado from '$lib/components/conheca/FluxoAnimado.svelte';
	import { onMount } from 'svelte';
	import {
		GitBranch,
		GraduationCap,
		Bot,
		TrendingDown,
		ShieldAlert,
		BarChart3,
		Building2,
		ChevronLeft,
		ChevronRight,
		ArrowRight,
		ArrowDown
	} from 'lucide-svelte';

	/** Alunos ativos exibidos no hero. `null` esconde o número (preencher com o dado real). */
	const ALUNOS_ATIVOS = null as number | null;

	const INSTAGRAM_URL = 'https://instagram.com/nofluxo_unb';
	const WHATSAPP_URL = 'https://wa.me/5561996731301';

	/**
	 * Passos do tour. `imagem` (opcional) aponta para um print real em /static;
	 * sem ela, o slide mostra a prévia ilustrada da tela.
	 */
	const tour: { id: 'fluxograma' | 'plano' | 'darcy'; titulo: string; texto: string; imagem?: string }[] = [
		{
			id: 'fluxograma',
			titulo: 'Seu fluxograma, do seu histórico',
			texto: 'Envie o PDF do histórico do SIGAA e veja o que já fez, o que pode cursar agora e o que ainda está travado.'
		},
		{
			id: 'plano',
			titulo: 'O caminho até a formatura',
			texto: 'O Plano de Formatura distribui o que falta semestre a semestre e se refaz a cada matéria concluída.'
		},
		{
			id: 'darcy',
			titulo: 'Pergunte pra Darcy',
			texto: 'Peça uma grade, pergunte sobre optativas ou pré-requisitos. Em português, como você falaria com um veterano.'
		}
	];

	const paraAluno = [
		{
			icon: GitBranch,
			titulo: 'Fluxograma interativo',
			texto:
				'Mostra o seu histórico real: matérias feitas, equivalências aproveitadas e pré-requisitos que liberam cada disciplina. Atualiza sempre que você envia um histórico novo.'
		},
		{
			icon: GraduationCap,
			titulo: 'Plano de Formatura',
			texto:
				'Monta o caminho até a formatura com o que falta cursar e recalcula a cada matéria concluída. Você sempre sabe quantos semestres faltam.'
		},
		{
			icon: Bot,
			titulo: 'Darcy AI',
			texto:
				'Assistente que monta grade e tira dúvidas sobre o seu curso em linguagem natural. Conhece o currículo e o seu histórico.',
			selo: 'Powered by Maritaca AI'
		}
	];

	const paraFaculdade = [
		{
			icon: TrendingDown,
			titulo: 'Disciplinas-gargalo',
			texto: 'Identificar as matérias que mais seguram o avanço dos alunos, com dado real de reprovação.'
		},
		{
			icon: ShieldAlert,
			titulo: 'Risco acadêmico',
			texto: 'Um modelo de risco para apoiar ações de retenção antes que o aluno desista do curso.'
		},
		{
			icon: BarChart3,
			titulo: 'Dados para planejamento',
			texto:
				'Dados agregados e anonimizados sobre evasão e planejamento curricular, em conformidade com a LGPD.'
		},
		{
			icon: Building2,
			titulo: 'Outras universidades',
			texto: 'Levar o modelo para outras universidades que usam o mesmo sistema acadêmico, o SIGAA.'
		}
	];

	let trilho = $state<HTMLDivElement>();
	let slideAtivo = $state(0);

	function irPara(i: number) {
		if (!trilho) return;
		const alvo = Math.max(0, Math.min(tour.length - 1, i));
		trilho.scrollTo({ left: alvo * trilho.clientWidth, behavior: 'smooth' });
	}

	function aoRolarTrilho() {
		if (!trilho) return;
		slideAtivo = Math.round(trilho.scrollLeft / trilho.clientWidth);
	}

	/** A barra de contato fixa só aparece depois que a primeira tela (que já tem os contatos) sai de vista. */
	let hero = $state<HTMLElement>();
	let heroVisivel = $state(true);

	onMount(() => {
		if (!hero) return;
		const obs = new IntersectionObserver(([e]) => (heroVisivel = e.isIntersecting), { threshold: 0.15 });
		obs.observe(hero);
		return () => obs.disconnect();
	});

	function abrirTour() {
		document.getElementById('tour')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		irPara(0);
	}
</script>

<PageMeta
	title="Conheça o NoFluxo"
	description="Fluxograma interativo, Plano de Formatura e a Darcy AI: o NoFluxo organiza o seu caminho na UnB a partir do seu histórico."
/>

<PageBackground />

<div class="conheca">
	<!-- 1. Primeira tela: resumo com as nossas informações -->
	<header class="hero" bind:this={hero}>
		<div class="hero-resumo nf-card-surface">
			<span class="nf-wordmark hero-logo" aria-label="NoFluxo UNB">
				<span class="nf-wordmark-noflx">NOFLX</span><span class="nf-wordmark-unb">UNB</span>
			</span>

			<h1 class="hero-titulo">
				Seu curso na UnB, <span class="text-primary">sem se perder no fluxo.</span>
			</h1>

			<p class="hero-sub">
				O NoFluxo lê o seu histórico do SIGAA e mostra o que falta, o que dá pra cursar agora e quando você se forma.
			</p>

			<ul class="hero-itens">
				<li><GitBranch class="size-4" aria-hidden="true" /> Fluxograma interativo</li>
				<li><GraduationCap class="size-4" aria-hidden="true" /> Plano de Formatura</li>
				<li><Bot class="size-4" aria-hidden="true" /> Darcy AI <span class="hero-selo">Maritaca AI</span></li>
			</ul>

			{#if ALUNOS_ATIVOS !== null}
				<p class="hero-stat">
					<strong>{ALUNOS_ATIVOS.toLocaleString('pt-BR')}+</strong>
					<span>alunos da UnB usando</span>
				</p>
			{/if}

			<!-- 2. CTA principal -->
			<button type="button" class="cta nf-cta-glow nf-cta-glow-hover" onclick={abrirTour}>
				Conheça o NoFluxo
				<ArrowDown class="size-4" aria-hidden="true" stroke-width="2.5" />
			</button>

			<a href="/" class="cta-site">
				Acessar o site
				<ArrowRight class="size-4" aria-hidden="true" stroke-width="2.5" />
			</a>

			<div class="hero-contato">
				<a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
					{@render iconeInstagram()}
					<span>@nofluxo_unb</span>
				</a>
				<a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
					{@render iconeWhatsApp()}
					<span>(61) 99673-1301</span>
				</a>
			</div>
		</div>

		<div class="hero-fluxo">
			<FluxoAnimado />
		</div>
	</header>

	<!-- Tour -->
	<section id="tour" class="secao secao-tour" aria-roledescription="carrossel" aria-label="Tour pelo NoFluxo">
		<p class="eyebrow">Tour rápido</p>
		<h2 class="secao-titulo">Veja funcionando</h2>

		<div class="trilho" bind:this={trilho} onscroll={aoRolarTrilho}>
			{#each tour as passo, i (passo.id)}
				<article
					class="slide"
					aria-roledescription="slide"
					aria-label="{i + 1} de {tour.length}: {passo.titulo}"
				>
					<div class="tela" aria-hidden="true">
						{#if passo.imagem}
							<img src={passo.imagem} alt="" loading="lazy" />
						{:else if passo.id === 'fluxograma'}
							<div class="mock-barra"><span>Meu Fluxograma</span><span class="mock-pill">62% concluído</span></div>
							<div class="mock-fluxo">
								{#each [['ok', 'ok', 'ok'], ['ok', 'ok', 'livre'], ['ok', 'livre', 'trava'], ['livre', 'trava', 'trava']] as semestre, s}
									<div class="mock-col">
										<span class="mock-sem">{s + 1}º</span>
										{#each semestre as estado}
											<span class="mock-materia mock-{estado}"></span>
										{/each}
									</div>
								{/each}
							</div>
							<div class="mock-legenda">
								<span><i class="mock-ok"></i>Feita</span>
								<span><i class="mock-livre"></i>Pode cursar</span>
								<span><i class="mock-trava"></i>Falta pré-requisito</span>
							</div>
						{:else if passo.id === 'plano'}
							<div class="mock-barra"><span>Plano de Formatura</span><span class="mock-pill">4 semestres</span></div>
							<ol class="mock-plano">
								{#each [5, 4, 4, 3] as qtd, s}
									<li class:mock-atual={s === 0}>
										<span class="mock-sem">{s === 0 ? 'Próximo' : `+${s}`}</span>
										<span class="mock-blocos">
											{#each Array(qtd) as _}<span></span>{/each}
										</span>
									</li>
								{/each}
								<li class="mock-formatura"><GraduationCap class="size-4" /> Formatura</li>
							</ol>
						{:else}
							<div class="mock-barra"><span>Darcy AI</span><span class="mock-pill">Maritaca AI</span></div>
							<div class="mock-chat">
								<p class="balao balao-aluno">Monta uma grade pra mim com 5 matérias, sem aula na sexta?</p>
								<p class="balao balao-darcy">
									Montei com 5 matérias que você já pode cursar, todas de segunda a quinta. Quer trocar alguma optativa?
								</p>
								<p class="balao balao-aluno">Qual optativa combina com dados?</p>
								<p class="balao balao-darcy balao-digitando"><span></span><span></span><span></span></p>
							</div>
						{/if}
					</div>
					<div class="slide-texto">
						<span class="slide-num">{i + 1}/{tour.length}</span>
						<h3>{passo.titulo}</h3>
						<p>{passo.texto}</p>
					</div>
				</article>
			{/each}
		</div>

		<div class="tour-controles">
			<button type="button" class="seta" onclick={() => irPara(slideAtivo - 1)} disabled={slideAtivo === 0} aria-label="Anterior">
				<ChevronLeft class="size-5" />
			</button>
			<div class="pontos">
				{#each tour as passo, i (passo.id)}
					<button
						type="button"
						class="ponto"
						class:ativo={slideAtivo === i}
						onclick={() => irPara(i)}
						aria-label="Ir para {passo.titulo}"
						aria-current={slideAtivo === i}
					></button>
				{/each}
			</div>
			<button
				type="button"
				class="seta"
				onclick={() => irPara(slideAtivo + 1)}
				disabled={slideAtivo === tour.length - 1}
				aria-label="Próximo"
			>
				<ChevronRight class="size-5" />
			</button>
		</div>

		<a href="/" class="link-site">Acessar o NoFluxo <ArrowRight class="size-4" aria-hidden="true" /></a>
	</section>

	<!-- 3. Para o aluno -->
	<section class="secao">
		<p class="eyebrow">Para o aluno</p>
		<h2 class="secao-titulo">O que o NoFluxo faz por você</h2>
		<div class="cards">
			{#each paraAluno as item (item.titulo)}
				<article class="card nf-card-surface">
					<span class="card-icone"><item.icon class="size-5" aria-hidden="true" /></span>
					<h3>{item.titulo}</h3>
					<p>{item.texto}</p>
					{#if item.selo}
						<span class="selo">{item.selo}</span>
					{/if}
				</article>
			{/each}
		</div>
		<p class="nota">
			A Darcy AI roda sobre o Maritaca AI, um modelo de linguagem brasileiro, treinado para o português.
		</p>
	</section>

	<!-- 4. Para a faculdade -->
	<section class="secao secao-instituicao">
		<p class="eyebrow">Para a universidade</p>
		<h2 class="secao-titulo">O que queremos devolver para a UnB</h2>
		<p class="secao-intro">
			O NoFluxo nasceu para o aluno, mas os mesmos dados podem ajudar a instituição a entender onde os alunos
			travam. Estes módulos são o <strong>próximo passo</strong> do produto: estão em desenvolvimento e ainda
			não estão disponíveis.
		</p>
		<div class="cards cards-inst">
			{#each paraFaculdade as item (item.titulo)}
				<article class="card card-inst">
					<span class="card-icone card-icone-inst"><item.icon class="size-5" aria-hidden="true" /></span>
					<div>
						<h3>{item.titulo} <span class="tag-breve">Próximo passo</span></h3>
						<p>{item.texto}</p>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<footer class="rodape">
		<span class="nf-wordmark" aria-hidden="true">
			<span class="nf-wordmark-noflx">NOFLX</span><span class="nf-wordmark-unb">UNB</span>
		</span>
		<p>Feito por alunos da UnB. Fale com a gente pelo Instagram ou WhatsApp.</p>
		<a href="/" class="cta cta-rodape">
			Acessar o NoFluxo
			<ArrowRight class="size-4" aria-hidden="true" stroke-width="2.5" />
		</a>
	</footer>
</div>

{#snippet iconeInstagram()}
	<svg viewBox="0 0 24 24" class="size-5" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
		<rect x="3" y="3" width="18" height="18" rx="5" />
		<circle cx="12" cy="12" r="4" />
		<circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
	</svg>
{/snippet}

{#snippet iconeWhatsApp()}
	<svg viewBox="0 0 24 24" class="size-5" aria-hidden="true" fill="currentColor">
		<path
			d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"
		/>
	</svg>
{/snippet}

<!-- 5. Contato fixo (aparece ao sair da primeira tela) -->
<nav class="contato" class:contato-oculto={heroVisivel} aria-label="Contato" inert={heroVisivel}>
	<a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" class="contato-btn">
		{@render iconeInstagram()}
		<span>@nofluxo_unb</span>
	</a>
	<a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" class="contato-btn contato-whats">
		{@render iconeWhatsApp()}
		<span>(61) 99673-1301</span>
	</a>
</nav>

<style>
	.conheca {
		max-width: 1080px;
		margin: 0 auto;
		padding: 0 1.25rem calc(6.5rem + env(safe-area-inset-bottom, 0px));
	}

	/* ---------- Primeira tela ---------- */
	.hero {
		display: grid;
		align-items: center;
		gap: 1.75rem;
		min-height: 100svh;
		padding: calc(1.25rem + env(safe-area-inset-top, 0px)) 0 1.75rem;
	}

	@media (min-width: 900px) {
		.hero {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
			gap: 3rem;
		}
	}

	.hero-resumo {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.9rem;
		padding: 1.5rem 1.35rem;
	}

	.hero-logo :global(.nf-wordmark-noflx),
	.hero-logo :global(.nf-wordmark-unb) {
		font-size: clamp(2rem, 9vw, 2.8rem);
	}

	.hero-titulo {
		font-size: clamp(1.55rem, 6.4vw, 2.3rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.12;
	}

	.hero-sub {
		color: hsl(var(--muted-foreground));
		font-size: 0.95rem;
		line-height: 1.55;
	}

	.hero-itens {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.hero-itens li {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.hero-itens :global(svg) {
		color: hsl(var(--primary));
	}

	.hero-selo {
		font-size: 0.66rem;
		font-weight: 700;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--ai) / 0.5);
		background: hsl(var(--ai-soft));
		color: hsl(var(--ai));
	}

	.hero-stat {
		display: inline-flex;
		align-items: baseline;
		gap: 0.45rem;
		padding: 0.4rem 0.9rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--primary) / 0.4);
		background: hsl(var(--primary) / 0.1);
		font-size: 0.85rem;
		color: hsl(var(--accent-foreground));
	}

	.hero-stat strong {
		font-size: 1.1rem;
		font-weight: 800;
		color: hsl(var(--foreground));
	}

	.cta {
		margin-top: 0.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		width: 100%;
		padding: 1rem 1.5rem;
		border-radius: 0.9rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-weight: 800;
		font-size: 0.9rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		transition:
			filter 0.15s ease,
			transform 0.15s ease;
	}

	.cta:hover {
		filter: brightness(1.1);
	}

	.cta:active {
		transform: scale(0.97);
	}

	.cta-site {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.9rem 1.5rem;
		border-radius: 0.9rem;
		border: 1.5px solid hsl(var(--primary) / 0.7);
		color: hsl(var(--foreground));
		font-weight: 800;
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}

	.cta-site:hover {
		background: hsl(var(--primary) / 0.12);
		border-color: hsl(var(--primary));
	}

	.cta-rodape {
		width: auto;
		margin-top: 0.5rem;
	}

	.hero-contato {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		width: 100%;
	}

	.hero-contato a {
		flex: 1 1 9rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		min-height: 2.75rem;
		border-radius: 0.8rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--foreground) / 0.03);
		font-size: 0.82rem;
		font-weight: 700;
		white-space: nowrap;
		transition: border-color 0.15s ease;
	}

	.hero-contato a:hover {
		border-color: hsl(var(--primary) / 0.6);
	}

	.hero-fluxo {
		width: 100%;
		max-width: 620px;
		justify-self: center;
	}

	/* ---------- Seções ---------- */
	.secao {
		padding: clamp(2.75rem, 8vw, 4.5rem) 0;
		border-top: 1px solid hsl(var(--foreground) / 0.06);
		scroll-margin-top: 1rem;
	}

	.eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: hsl(var(--primary));
		margin-bottom: 0.4rem;
	}

	.secao-titulo {
		font-size: clamp(1.4rem, 5.5vw, 2rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.15;
		margin-bottom: 1.5rem;
	}

	.secao-intro {
		color: hsl(var(--muted-foreground));
		line-height: 1.6;
		max-width: 62ch;
		margin: -0.5rem 0 1.75rem;
	}

	.secao-intro strong {
		color: hsl(var(--foreground));
	}

	/* ---------- Tour ---------- */
	.trilho {
		display: flex;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
		border-radius: 1.1rem;
	}

	.trilho::-webkit-scrollbar {
		display: none;
	}

	.slide {
		flex: 0 0 100%;
		scroll-snap-align: start;
		display: grid;
		gap: 1.25rem;
		padding: 0 0.1rem;
	}

	@media (min-width: 768px) {
		.slide {
			grid-template-columns: 1.3fr 1fr;
			align-items: center;
			gap: 2.5rem;
		}
	}

	.slide-num {
		font-size: 0.75rem;
		font-weight: 700;
		color: hsl(var(--primary));
	}

	.slide-texto h3 {
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: 0.2rem 0 0.5rem;
	}

	.slide-texto p {
		color: hsl(var(--muted-foreground));
		line-height: 1.6;
	}

	.tela {
		aspect-ratio: 4 / 3;
		max-width: 100%;
		border-radius: 1rem;
		border: 1px solid hsl(var(--primary) / 0.28);
		background: linear-gradient(170deg, hsl(var(--accent) / 0.7), hsl(var(--card)));
		box-shadow:
			0 1px 2px hsl(var(--foreground) / 0.04),
			0 12px 32px hsl(var(--primary) / 0.08);
		padding: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		overflow: hidden;
	}

	:global(.dark) .tela {
		background: linear-gradient(170deg, hsl(267 42% 8% / 0.9), hsl(240 14% 5%));
		box-shadow:
			inset 0 1px 0 hsl(0 0% 100% / 0.08),
			0 18px 48px hsl(0 0% 0% / 0.5),
			0 0 60px hsl(var(--primary) / 0.12);
	}

	.tela img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top;
		border-radius: 0.6rem;
	}

	.mock-barra {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.mock-pill {
		font-size: 0.68rem;
		font-weight: 600;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		background: hsl(var(--primary) / 0.18);
		color: hsl(var(--accent-foreground));
	}

	.mock-fluxo {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.55rem;
	}

	.mock-col {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.mock-sem {
		font-size: 0.65rem;
		font-weight: 700;
		color: hsl(var(--muted-foreground));
		text-align: center;
	}

	.mock-materia {
		flex: 1;
		border-radius: 0.45rem;
		animation: surgir 0.5s ease both;
	}

	.mock-ok {
		background: hsl(var(--primary));
	}

	.mock-livre {
		background: transparent;
		border: 1.5px solid hsl(var(--ai));
		box-shadow: 0 0 12px hsl(var(--ai) / 0.35);
	}

	.mock-trava {
		background: hsl(var(--foreground) / 0.07);
	}

	.mock-legenda {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		font-size: 0.65rem;
		color: hsl(var(--muted-foreground));
	}

	.mock-legenda i {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 0.15rem;
		margin-right: 0.3rem;
		vertical-align: -0.05rem;
	}

	.mock-plano {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.45rem;
	}

	.mock-plano li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.6rem;
		border-radius: 0.55rem;
		background: hsl(var(--foreground) / 0.04);
	}

	.mock-plano .mock-sem {
		width: 3.4rem;
		text-align: left;
	}

	.mock-plano li.mock-atual {
		background: hsl(var(--primary) / 0.16);
		outline: 1px solid hsl(var(--primary) / 0.5);
	}

	.mock-blocos {
		display: flex;
		gap: 0.3rem;
		flex: 1;
	}

	.mock-blocos span {
		flex: 1;
		max-width: 2.4rem;
		height: 0.8rem;
		border-radius: 0.25rem;
		background: hsl(var(--primary) / 0.7);
	}

	.mock-plano .mock-formatura {
		justify-content: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: hsl(var(--accent-foreground));
		background: transparent;
		border: 1px dashed hsl(var(--primary) / 0.5);
	}

	.mock-chat {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 0.45rem;
		font-size: 0.72rem;
		line-height: 1.4;
	}

	.balao {
		max-width: 82%;
		padding: 0.5rem 0.7rem;
		border-radius: 0.8rem;
	}

	.balao-aluno {
		align-self: flex-end;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-bottom-right-radius: 0.2rem;
	}

	.balao-darcy {
		align-self: flex-start;
		background: hsl(var(--foreground) / 0.08);
		border-bottom-left-radius: 0.2rem;
	}

	.balao-digitando {
		display: flex;
		gap: 0.25rem;
	}

	.balao-digitando span {
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 50%;
		background: hsl(var(--ai));
		animation: piscar 1.2s infinite ease-in-out;
	}

	.balao-digitando span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.balao-digitando span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes piscar {
		0%,
		80%,
		100% {
			opacity: 0.25;
		}
		40% {
			opacity: 1;
		}
	}

	@keyframes surgir {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	.tour-controles {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: 1.5rem;
	}

	.seta {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 50%;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		transition: border-color 0.15s ease;
	}

	.seta:hover:not(:disabled) {
		border-color: hsl(var(--primary) / 0.6);
	}

	.seta:disabled {
		opacity: 0.35;
	}

	.pontos {
		display: flex;
		gap: 0.25rem;
	}

	/* Área de toque de 24px; o ponto visível é o ::after. */
	.ponto {
		width: 1.5rem;
		height: 1.5rem;
		display: grid;
		place-items: center;
	}

	.ponto::after {
		content: '';
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: hsl(var(--foreground) / 0.25);
		transition:
			width 0.2s ease,
			background 0.2s ease;
	}

	.ponto.ativo::after {
		width: 1.2rem;
		background: hsl(var(--primary));
	}

	.link-site {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin-top: 1.25rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: hsl(var(--accent-foreground));
	}

	.link-site:hover {
		text-decoration: underline;
	}

	/* ---------- Cards ---------- */
	.cards {
		display: grid;
		gap: 0.9rem;
	}

	@media (min-width: 768px) {
		.cards {
			grid-template-columns: repeat(3, 1fr);
		}

		.cards-inst {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 1.35rem;
	}

	.card h3 {
		font-size: 1.05rem;
		font-weight: 800;
		letter-spacing: -0.01em;
	}

	.card p {
		color: hsl(var(--muted-foreground));
		font-size: 0.92rem;
		line-height: 1.6;
	}

	.card-icone {
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 50%;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		box-shadow: 0 0 20px hsl(var(--primary) / 0.4);
	}

	.selo {
		align-self: flex-start;
		margin-top: auto;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--ai) / 0.5);
		background: hsl(var(--ai-soft));
		color: hsl(var(--ai));
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.nota {
		margin-top: 1rem;
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
	}

	/* Instituição: tom mais sóbrio — contorno em vez de card preenchido. */
	.secao-instituicao {
		position: relative;
	}

	.card-inst {
		flex-direction: row;
		align-items: flex-start;
		gap: 0.9rem;
		border-radius: var(--radius-lg);
		border: 1px dashed hsl(var(--foreground) / 0.16);
		background: hsl(var(--foreground) / 0.02);
	}

	.card-inst h3 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.6rem;
		margin-bottom: 0.3rem;
	}

	.card-icone-inst {
		flex-shrink: 0;
		background: transparent;
		border: 1.5px solid hsl(var(--primary) / 0.6);
		color: hsl(var(--accent-foreground));
		box-shadow: none;
	}

	.tag-breve {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: hsl(var(--foreground) / 0.08);
		color: hsl(var(--muted-foreground));
	}

	/* ---------- Rodapé + contato fixo ---------- */
	.rodape {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 2.5rem 0 1rem;
		border-top: 1px solid hsl(var(--foreground) / 0.06);
		text-align: center;
		font-size: 0.85rem;
		color: hsl(var(--muted-foreground));
	}

	.contato {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
		background: hsl(var(--background) / 0.82);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-top: 1px solid hsl(var(--primary) / 0.18);
		transition:
			transform 0.25s ease,
			opacity 0.25s ease;
	}

	.contato-oculto {
		transform: translateY(100%);
		opacity: 0;
	}

	.contato-btn {
		flex: 1;
		max-width: 240px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 2.9rem;
		padding: 0 0.9rem;
		border-radius: 0.8rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		font-size: 0.85rem;
		font-weight: 700;
		white-space: nowrap;
		transition: border-color 0.15s ease;
	}

	.contato-btn:hover {
		border-color: hsl(var(--primary) / 0.6);
	}

	.contato-whats {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.contato-whats:hover {
		filter: brightness(1.1);
	}

	@media (max-width: 360px) {
		.contato-btn {
			font-size: 0.78rem;
			padding: 0 0.6rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.mock-materia,
		.balao-digitando span {
			animation: none;
		}
	}
</style>
