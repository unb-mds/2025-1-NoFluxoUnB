<script lang="ts">
	import { Check, Gem, Github, Linkedin } from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import MemberCard from './MemberCard.svelte';

	const founders = [
		{
			name: 'Guilherme Gusmão',
			githubUsername: 'gusmoles',
			funcao: 'Interfaces e identidade visual do produto',
			specialties: ['Frontend', 'UX/UI', 'Design'],
			linkedin: 'https://www.linkedin.com/in/guilherme-gusmão-nepomuceno-9b44a826a/',
			email: ''
		},
		{
			name: 'Vitor Marconi',
			githubUsername: 'Vitor-Trancoso',
			funcao: 'Fullstack, arquitetura visual e manutenção do produto',
			specialties: ['Fullstack', 'Design', 'Arquitetura visual'],
			linkedin: 'https://www.linkedin.com/in/vitor-marconi-4a069524a/',
			email: ''
		},
		{
			name: 'Gustavo Choueiri',
			githubUsername: 'staann',
			funcao: 'IA, automações e pipelines de dados',
			specialties: ['Inteligência Artificial', 'Automações', 'Engenharia de Dados'],
			linkedin: 'https://www.linkedin.com/in/gustavochoueiri',
			email: ''
		},
		{
			name: 'Felipe Pedroza',
			githubUsername: 'darkymeubem',
			funcao: 'Banco de dados, ciência de dados e backend',
			specialties: ['Banco de dados', 'Ciência de dados', 'Fullstack'],
			linkedin: 'https://www.linkedin.com/in/felipe-lopes-pedroza-74b7a527b/',
			email: ''
		},
		{
			name: 'Vinícius Pereira',
			githubUsername: 'Vinicius-Ribeiro04',
			funcao: 'Frontend e renderização do fluxograma',
			specialties: ['Frontend', 'Design', 'Canvas'],
			linkedin: 'https://www.linkedin.com/in/vinicius-ribeiro-6192b2270/',
			email: ''
		},
		{
			name: 'Arthur Fernandes',
			githubUsername: 'hisarxt',
			funcao: 'Qualidade, testes e modelagem de dados',
			specialties: ['QA Analyst', 'Banco de dados', 'Frontend'],
			linkedin: 'https://www.linkedin.com/in/artxrz/',
			email: ''
		},
		{
			name: 'Erick Alves',
			githubUsername: 'erickaalves',
			funcao: 'Frontend e condução do Scrum',
			specialties: ['Frontend', 'Scrum', 'Trafego pago'],
			linkedin: '',
			email: ''
		},
		{
			name: 'Arthur Ramalho',
			githubUsername: 'ArthurNRamalho',
			funcao: 'Design, documentação e planejamento',
			specialties: ['Design', 'Documentação', 'Planejamento'],
			linkedin: '',
			email: ''
		},
		{
			name: 'Otavio Maya',
			githubUsername: 'knz13',
			funcao: 'Infraestrutura, integração e Dockerização',
			specialties: ['Fullstack', 'Integração', 'Dockerização'],
			linkedin: 'https://www.linkedin.com/in/otávio-maya-8416931a5/',
			email: ''
		}
	];

	const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR');

	const maintainers = founders
		.filter((member) => ['Vitor-Trancoso', 'darkymeubem', 'staann'].includes(member.githubUsername))
		.sort(byName);

	// menção honrosa: destaque fora do grid, também mantém as linhas alinhadas (8 cards = 2x4)
	const HONOR_USERNAME = 'knz13';
	const honorMember = founders.find((member) => member.githubUsername === HONOR_USERNAME)!;
	const foundersGrid = founders
		.filter((member) => member.githubUsername !== HONOR_USERNAME)
		.sort(byName);

	const showcase = [
		{
			id: 'atuais',
			label: 'Time atual',
			title: 'Quem mantém hoje',
			description: 'Os desenvolvedores que seguem cuidando do No Fluxo no dia a dia.',
			role: 'Mantenedor',
			variant: 'maintainer' as const,
			members: maintainers,
			honor: null
		},
		{
			id: 'fundadores',
			label: 'Fundadores',
			title: 'Quem começou tudo',
			description: 'O time original que tirou o No Fluxo do papel em 2025.',
			role: 'Fundador',
			variant: 'founder' as const,
			members: foundersGrid,
			honor: honorMember
		}
	];

	const ROTATION_MS = 9000;

	let activeIndex = $state(0);
	let direction = $state(1);
	let paused = $state(false);

	const activeGroup = $derived(showcase[activeIndex]);

	function selectGroup(index: number) {
		if (index === activeIndex) return;
		direction = index > activeIndex ? 1 : -1;
		activeIndex = index;
	}

	$effect(() => {
		// lê activeIndex para reiniciar a contagem sempre que o grupo muda (auto ou manual)
		const current = activeIndex;
		if (paused) return;
		const timer = setTimeout(() => {
			direction = 1;
			activeIndex = (current + 1) % showcase.length;
		}, ROTATION_MS);
		return () => clearTimeout(timer);
	});

	const features = [
		{ description: 'Feito por estudantes, pra estudantes da UnB.' },
		{ description: 'Pensado pra quem tem vida além da faculdade.' },
		{ description: 'Gratuito e construído com a comunidade em mente.' }
	];
</script>

<section class="sobre-section" id="sobre-nos">
	<h2 class="section-title">Sobre nós</h2>

	<div class="sobre-card nf-card-surface">
		<div class="sobre-body">
			<p class="sobre-lead">
				Tudo começou com um fluxograma impresso e uma caneta marca-texto.
			</p>

			<p class="sobre-text">
				Se você já chegou no fim do semestre tentando entender quais matérias liberar pro próximo,
				imprimindo o fluxograma de novo, riscando o que já passou, fazendo conta de cabeça pra
				projetar quando vai formar, você já sabe do que a gente tá falando.
			</p>

			<p class="sobre-text">
				O No Fluxo nasceu dessa dor. A vida do universitário não cabe num fluxograma "ideal": tem
				estágio, tem trabalho, tem projetos próprios, tem o semestre que não fechou o horário, a
				matéria equivalente que existe mas ninguém te contou. A UnB tem um monte de regra que o
				SIGAA não explica, e no fim quem se vira pra organizar tudo isso é você, geralmente
				sozinho, no Excel ou no papel.
			</p>

			<p class="sobre-text">
				Aí a gente fez uma pesquisa e percebeu que não era só com a gente. A maioria dos cursos da
				UnB nem tem um fluxograma visual decente, e os que têm ainda obrigam o aluno a grifar à mão
				toda vez que vai se matricular. Deu pra ver que dava pra fazer melhor.
			</p>

			<p class="sobre-text">
				O No Fluxo é um projeto da disciplina de Métodos de Desenvolvimento de Software, ministrada
				pela professora Dr Carla Rocha na FCTE/UnB. A ideia era construir um software que resolvesse um
				problema real da comunidade, e a gente escolheu resolver um que vivia toda semana.
			</p>
		</div>

		<!--
		<div class="sobre-note">
			<MessageCircle class="h-4 w-4 shrink-0 text-foreground/70" />
			<p>
				<strong>Observação:</strong> Inicialmente disponível para cursos da FGA/UnB, com perspectiva
				de expansão!
			</p>
		</div>
		-->
		<div class="sobre-features">
			{#each features as feature}
				<div class="sobre-feature">
					<span class="check-circle">
						<Check class="h-4 w-4 text-primary-foreground" />
					</span>
					<p>{feature.description}</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="showcase"
		onmouseenter={() => (paused = true)}
		onmouseleave={() => (paused = false)}
		onfocusin={() => (paused = true)}
		onfocusout={() => (paused = false)}
	>
		<div class="showcase-switch" role="tablist" aria-label="Vitrine da equipe">
			{#each showcase as group, index}
				<button
					class="switch-btn"
					class:active={activeIndex === index}
					role="tab"
					aria-selected={activeIndex === index}
					onclick={() => selectGroup(index)}
				>
					<span>{group.label}</span>
					<span class="switch-count">{group.members.length}</span>
				</button>
			{/each}
			<span class="switch-thumb" style={`transform: translateX(${activeIndex * 100}%)`}></span>
		</div>

		<div class="showcase-progress" aria-hidden="true">
			{#key activeIndex}
				<span class="progress-bar" class:paused style={`animation-duration: ${ROTATION_MS}ms`}
				></span>
			{/key}
		</div>

		<div class="showcase-stage">
			{#key activeIndex}
				<div
					class="showcase-panel"
					in:fly={{ x: 40 * direction, duration: 450, easing: cubicOut, delay: 240 }}
					out:fly={{ x: -40 * direction, duration: 220, easing: cubicOut }}
				>
					<header class="showcase-head">
						<h3>{activeGroup.title}</h3>
						<p>{activeGroup.description}</p>
					</header>

					<div class="team-grid" class:compact={activeGroup.members.length <= 3}>
						{#each activeGroup.members as member, memberIndex}
							<!-- TODO: add instagram={member.instagram} prop -->
							<div
								class="team-grid-item"
								style={`--stagger: ${Math.min(memberIndex, 8) * 55}ms`}
							>
								<MemberCard
									name={member.name}
									githubUsername={member.githubUsername}
									specialties={member.specialties}
									linkedin={member.linkedin}
									email={member.email}
									role={activeGroup.role}
									funcao={member.funcao}
									variant={activeGroup.variant}
								/>
							</div>
						{/each}
					</div>

					{#if activeGroup.honor}
						<div class="honor-card" style="--stagger: 520ms">
							<span class="honor-badge">
								<Gem size={13} />
								Menção honrosa
							</span>

							<div class="honor-body">
								<div class="honor-avatar-wrap">
									<img
										src={`https://avatars.githubusercontent.com/${activeGroup.honor.githubUsername}`}
										alt={activeGroup.honor.name}
										class="honor-avatar"
										loading="lazy"
									/>
								</div>

								<div class="honor-content">
									<h4 class="honor-name">{activeGroup.honor.name}</h4>
									<p class="honor-funcao">{activeGroup.honor.funcao}</p>
									<p class="honor-text">
										Foi a nossa salvação em vários momentos. Além do código, entregou conselho,
										trabalho e esforço quando o projeto mais precisou, e é por isso que esse card é
										de diamante.
									</p>

									<div class="honor-tags">
										{#each activeGroup.honor.specialties as specialty}
											<span class="honor-tag">{specialty}</span>
										{/each}
									</div>

									<div class="honor-links">
										<a
											href={`https://github.com/${activeGroup.honor.githubUsername}`}
											target="_blank"
											rel="noopener noreferrer"
										>
											<Github size={15} />
											@{activeGroup.honor.githubUsername}
										</a>
										{#if activeGroup.honor.linkedin}
											<a href={activeGroup.honor.linkedin} target="_blank" rel="noopener noreferrer">
												<Linkedin size={15} />
												LinkedIn
											</a>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/key}
		</div>
	</div>
</section>

<style>
	.section-title {
		font-size: clamp(1.375rem, 3vw, 1.75rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		text-align: center;
		color: hsl(var(--foreground));
		margin-bottom: 2.75rem;
	}

	.sobre-section {
		padding: clamp(3.5rem, 8vw, 4.5rem) 1.5rem;
		background: hsl(var(--background) / 0.9);
		border-top: 1px solid hsl(var(--foreground) / 0.06);
	}

	.sobre-card {
		max-width: 1120px;
		margin: 0 auto 2rem;
		padding: 2rem;
	}

	.sobre-body {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		margin-bottom: 1.75rem;
	}

	.sobre-lead {
		color: hsl(var(--foreground));
		font-size: clamp(1.0625rem, 2.2vw, 1.375rem);
		font-weight: 700;
		line-height: 1.4;
		letter-spacing: -0.01em;
		text-align: left;
	}

	.sobre-text {
		color: hsl(var(--muted-foreground));
		font-size: clamp(0.8125rem, 1.5vw, 1.0625rem);
		line-height: 1.7;
		text-align: left;
	}

	.sobre-features {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.sobre-feature {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.sobre-feature p {
		color: hsl(var(--foreground));
		font-size: clamp(0.75rem, 1.15vw, 0.9375rem);
		line-height: 1.45;
	}

	.check-circle {
		width: 28px;
		height: 28px;
		min-width: 28px;
		border-radius: 8px;
		background: hsl(var(--primary));
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 2px;
	}

	.showcase {
		max-width: 1120px;
		margin: 0 auto;
	}

	.showcase-switch {
		position: relative;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.25rem;
		width: min(100%, 380px);
		margin: 0 auto;
		padding: 0.3rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--foreground) / 0.08);
		background: hsl(var(--card) / 0.6);
		box-shadow: 0 1px 2px hsl(var(--foreground) / 0.04);
	}

	:global(.dark) .showcase-switch {
		box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.05);
	}

	.switch-btn {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		padding: 0.55rem 0.9rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: hsl(var(--muted-foreground));
		font-size: clamp(0.75rem, 1.4vw, 0.875rem);
		font-weight: 600;
		letter-spacing: -0.01em;
		cursor: pointer;
		transition: color 0.25s ease;
	}

	.switch-btn:hover {
		color: hsl(var(--foreground));
	}

	.switch-btn.active {
		color: hsl(var(--foreground));
	}

	.switch-count {
		min-width: 20px;
		padding: 0.05rem 0.35rem;
		border-radius: 999px;
		background: hsl(var(--foreground) / 0.1);
		font-size: 0.6875rem;
		font-weight: 700;
	}

	.switch-btn.active .switch-count {
		background: hsl(var(--primary) / 0.35);
	}

	.switch-thumb {
		position: absolute;
		top: 0.3rem;
		left: 0.3rem;
		width: calc(50% - 0.425rem);
		height: calc(100% - 0.6rem);
		border-radius: 999px;
		border: 1px solid hsl(var(--primary) / 0.35);
		background: linear-gradient(
			135deg,
			hsl(var(--primary) / 0.32) 0%,
			hsl(var(--primary) / 0.12) 100%
		);
		box-shadow: 0 0 18px hsl(var(--primary) / 0.25);
		transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.showcase-progress {
		width: min(100%, 380px);
		height: 2px;
		margin: 0.75rem auto 1.75rem;
		border-radius: 999px;
		background: hsl(var(--foreground) / 0.07);
		overflow: hidden;
	}

	.progress-bar {
		display: block;
		height: 100%;
		width: 100%;
		transform-origin: left center;
		border-radius: 999px;
		background: linear-gradient(90deg, hsl(var(--primary) / 0.2), hsl(var(--primary)));
		animation: showcase-progress linear forwards;
	}

	.progress-bar.paused {
		animation-play-state: paused;
	}

	@keyframes showcase-progress {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	.showcase-stage {
		display: grid;
	}

	.showcase-panel {
		grid-area: 1 / 1;
	}

	.showcase-head {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.showcase-head h3 {
		color: hsl(var(--foreground));
		font-size: clamp(1.0625rem, 2.2vw, 1.375rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		margin: 0 0 0.35rem;
	}

	.showcase-head p {
		color: hsl(var(--muted-foreground));
		font-size: clamp(0.8125rem, 1.4vw, 0.9375rem);
		margin: 0;
	}

	.team-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		max-width: 1120px;
		margin: 0 auto;
	}

	.team-grid-item {
		animation: card-in 0.5s cubic-bezier(0.4, 0, 0.2, 1) backwards;
		animation-delay: calc(120ms + var(--stagger, 0ms));
	}

	/* Mobile (grid de 2 colunas): card órfão de linha ímpar centraliza na própria linha,
	   com a largura de uma coluna — sem deixar "buraco" ao lado. */
	@media (max-width: 767.98px) {
		.team-grid > .team-grid-item:last-child:nth-child(odd) {
			grid-column: 1 / -1;
			justify-self: center;
			width: calc(50% - 0.5rem);
		}
	}

	/* menção honrosa — card "diamante".
	   --honor: azul legível no light (#075985, 7,6:1 sobre card); no dark alimenta só os tints,
	   e texto/borda mantêm os hex originais nos overrides :global(.dark) abaixo. */
	.honor-card {
		--honor: 201 90% 27%;
		position: relative;
		max-width: 1120px;
		margin: 1.5rem auto 0;
		padding: 1.5rem;
		border-radius: 18px;
		border: 1.5px solid hsl(var(--honor) / 0.45);
		background:
			radial-gradient(120% 140% at 12% 0%, hsl(var(--honor) / 0.1) 0%, transparent 55%),
			radial-gradient(120% 140% at 100% 100%, hsl(var(--primary) / 0.08) 0%, transparent 55%),
			hsl(var(--card));
		box-shadow:
			0 1px 2px hsl(var(--foreground) / 0.04),
			0 8px 24px hsl(var(--honor) / 0.1);
		overflow: hidden;
		animation: card-in 0.55s cubic-bezier(0.4, 0, 0.2, 1) backwards;
		animation-delay: calc(120ms + var(--stagger, 0ms));
	}

	:global(.dark) .honor-card {
		--honor: 200 100% 83%;
		border-color: rgba(168, 226, 255, 0.55);
		background:
			radial-gradient(120% 140% at 12% 0%, rgba(150, 220, 255, 0.14) 0%, transparent 55%),
			radial-gradient(120% 140% at 100% 100%, rgba(196, 168, 255, 0.14) 0%, transparent 55%),
			hsl(var(--card) / 0.72);
		box-shadow:
			0 0 0 1px rgba(168, 226, 255, 0.16),
			0 18px 48px rgba(90, 180, 255, 0.14),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
	}

	/* brilho de diamante atravessando o card */
	.honor-card::before {
		content: '';
		position: absolute;
		top: -60%;
		left: -30%;
		width: 40%;
		height: 220%;
		pointer-events: none;
		background: linear-gradient(
			100deg,
			transparent 0%,
			hsl(var(--honor) / 0.08) 45%,
			hsl(var(--honor) / 0.16) 50%,
			hsl(var(--honor) / 0.08) 55%,
			transparent 100%
		);
		transform: rotate(8deg);
		animation: diamond-shine 6.5s ease-in-out infinite;
	}

	:global(.dark) .honor-card::before {
		background: linear-gradient(
			100deg,
			transparent 0%,
			rgba(255, 255, 255, 0.16) 45%,
			rgba(190, 235, 255, 0.28) 50%,
			rgba(255, 255, 255, 0.16) 55%,
			transparent 100%
		);
	}

	@keyframes diamond-shine {
		0%,
		62% {
			transform: translateX(0) rotate(8deg);
			opacity: 0;
		}
		66% {
			opacity: 1;
		}
		100% {
			transform: translateX(420%) rotate(8deg);
			opacity: 0;
		}
	}

	.honor-badge {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--honor) / 0.5);
		background: linear-gradient(135deg, hsl(var(--honor) / 0.12), hsl(var(--primary) / 0.08));
		color: hsl(var(--honor));
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	:global(.dark) .honor-badge {
		border-color: rgba(168, 226, 255, 0.5);
		background: linear-gradient(135deg, rgba(168, 226, 255, 0.24), rgba(196, 168, 255, 0.14));
		color: #d8f1ff;
	}

	.honor-body {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		margin-top: 1rem;
		text-align: center;
	}

	.honor-avatar-wrap {
		width: 112px;
		height: 112px;
		flex-shrink: 0;
		border-radius: 50%;
		padding: 3px;
		background: linear-gradient(135deg, hsl(200 90% 60%) 0%, hsl(200 70% 85%) 35%, hsl(var(--primary) / 0.7) 70%, hsl(200 90% 55%) 100%);
		box-shadow: 0 0 24px hsl(var(--honor) / 0.2);
	}

	:global(.dark) .honor-avatar-wrap {
		background: linear-gradient(135deg, #bfe9ff 0%, #ffffff 35%, #c9b8ff 70%, #8fd7ff 100%);
		box-shadow: 0 0 24px rgba(150, 220, 255, 0.35);
	}

	.honor-avatar {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
		background: hsl(var(--muted));
		display: block;
	}

	:global(.dark) .honor-avatar {
		background: #374151;
	}

	.honor-name {
		color: hsl(var(--foreground));
		font-size: clamp(1.0625rem, 2vw, 1.375rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: 0;
	}

	.honor-funcao {
		color: hsl(var(--honor));
		font-size: clamp(0.8125rem, 1.4vw, 0.9375rem);
		font-weight: 600;
		margin: 0.15rem 0 0.5rem;
	}

	.honor-text {
		color: hsl(var(--muted-foreground));
		font-size: clamp(0.8125rem, 1.4vw, 0.9375rem);
		line-height: 1.65;
		margin: 0 0 0.85rem;
		max-width: 62ch;
	}

	.honor-tags {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
		margin-bottom: 0.85rem;
	}

	.honor-tag {
		padding: 0.25rem 0.65rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--honor) / 0.3);
		background: hsl(var(--honor) / 0.06);
		color: hsl(var(--honor));
		font-size: 0.75rem;
		font-weight: 500;
	}

	:global(.dark) .honor-tag {
		border-color: rgba(168, 226, 255, 0.3);
		background: rgba(168, 226, 255, 0.08);
		color: #e6f6ff;
	}

	.honor-links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1rem;
	}

	.honor-links a {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: hsl(var(--honor));
		font-size: 0.8125rem;
		text-decoration: none;
	}

	.honor-links a:hover {
		text-decoration: underline;
	}

	:global(.dark) .honor-funcao {
		color: #cfeaff;
	}

	:global(.dark) .honor-links a {
		color: #e6f6ff;
	}

	@media (min-width: 768px) {
		.honor-card {
			padding: 1.75rem 2rem;
		}

		.honor-body {
			flex-direction: row;
			align-items: center;
			text-align: left;
			gap: 1.75rem;
		}

		.honor-tags,
		.honor-links {
			justify-content: flex-start;
		}
	}

	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(14px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (min-width: 768px) {
		.team-grid {
			grid-template-columns: repeat(4, 1fr);
			gap: 1.5rem;
		}

		.team-grid.compact {
			grid-template-columns: repeat(auto-fit, minmax(0, 260px));
			justify-content: center;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.team-grid-item,
		.progress-bar,
		.honor-card,
		.honor-card::before {
			animation: none;
		}

		.switch-thumb {
			transition: none;
		}
	}
</style>
