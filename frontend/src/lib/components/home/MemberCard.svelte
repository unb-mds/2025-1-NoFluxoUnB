<script lang="ts">
	import { ChevronLeft, ChevronRight, Github, Instagram, Linkedin, Mail } from 'lucide-svelte';

	interface Props {
		name: string;
		githubUsername: string;
		specialties?: string[];
		instagram?: string;
		linkedin?: string;
		email?: string;
		role?: string;
		funcao?: string;
		variant?: 'founder' | 'maintainer' | 'default';
		autoRotate?: boolean;
		rotateDelay?: number;
	}

	let {
		name,
		githubUsername,
		specialties = [],
		instagram = '',
		linkedin = '',
		email = '',
		role = 'Desenvolvedor',
		funcao = '',
		variant = 'default',
		autoRotate = false,
		rotateDelay = 0
	}: Props = $props();
	let imageError = $state(false);
	let currentSlide = $state(0);
	let hovered = $state(false);

	const totalSlides = 3;
	const SLIDE_MS = 4200;

	$effect(() => {
		if (!autoRotate || hovered) return;
		// lê currentSlide para reagendar a cada troca (automática ou manual)
		const current = currentSlide;
		const timer = setTimeout(
			() => {
				currentSlide = (current + 1) % totalSlides;
			},
			current === 0 && rotateDelay ? SLIDE_MS + rotateDelay : SLIDE_MS
		);
		return () => clearTimeout(timer);
	});

	const avatarUrl = $derived(`https://avatars.githubusercontent.com/${githubUsername}`);
	const githubUrl = $derived(`https://github.com/${githubUsername}`);
	const linkedinValue = $derived(linkedin.trim());
	const linkedinHandle = $derived(linkedinValue.replace('@', ''));
	const linkedinUrl = $derived(
		linkedinValue
			? linkedinValue.startsWith('http')
				? linkedinValue
				: `https://www.linkedin.com/in/${linkedinHandle}`
			: ''
	);

	function nextSlide() {
		currentSlide = (currentSlide + 1) % totalSlides;
	}

	function previousSlide() {
		currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
	}

	function goToSlide(slideIndex: number) {
		currentSlide = slideIndex;
	}
</script>

<div
	class="team-card nf-card-surface nf-card-interactive"
	class:is-founder={variant === 'founder'}
	class:is-maintainer={variant === 'maintainer'}
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
	role="group"
	aria-label={`${name} — ${role}`}
>
	<div class="carousel-header">
		<div class="carousel-controls">
			<button class="carousel-btn" onclick={previousSlide} aria-label="Card anterior">
				<ChevronLeft size={12} />
			</button>
			<button class="carousel-btn" onclick={nextSlide} aria-label="Próximo card">
				<ChevronRight size={12} />
			</button>
		</div>
	</div>

	{#if currentSlide === 0}
		<div class="member-slide">
			<div class="team-avatar-wrap">
				{#if imageError}
					<div class="fallback-avatar">
						<svg class="w-8 h-8 text-muted-foreground dark:text-foreground" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
				{:else}
					<img
						src={avatarUrl}
						alt={name}
						class="team-avatar"
						loading="lazy"
						onerror={() => (imageError = true)}
					/>
				{/if}
			</div>

			<h4 class="team-name">{name}</h4>
			<span class="team-role">{role}</span>
			{#if funcao}
				<span class="team-funcao">{funcao}</span>
			{/if}
		</div>
	{:else if currentSlide === 1}
		<div class="member-slide">
			<h4 class="slide-title">O que faz</h4>
			{#if funcao}
				<p class="slide-subtitle">{funcao}</p>
			{/if}
			<ul class="specialties-list">
				{#if specialties.length > 0}
					{#each specialties as specialty}
						<li>{specialty}</li>
					{/each}
				{:else}
					<li>Especialidades não informadas</li>
				{/if}
			</ul>
		</div>
	{:else}
		<div class="member-slide">
			<h4 class="slide-title">Contato</h4>
			<div class="contact-list">
				<div class="contact-item">
					<Github size={16} />
					<a href={githubUrl} target="_blank" rel="noopener noreferrer">@{githubUsername}</a>
				</div>
				<div class="contact-item">
					<Linkedin size={16} />
					{#if linkedinUrl}
						<a href={linkedinUrl} target="_blank" rel="noopener noreferrer">
							{linkedinValue.startsWith('http') ? 'Perfil no LinkedIn' : `@${linkedinHandle}`}
						</a>
					{:else}
						<span>LinkedIn não informado</span>
					{/if}
				</div>
				<div class="contact-item">
					<Mail size={16} />
					{#if email}
						<a href={`mailto:${email}`}>{email}</a>
					{:else}
						<span>E-mail não informado</span>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<div class="carousel-dots" aria-label="Navegação do carrossel">
		{#each Array(totalSlides) as _, index}
			<button
				class="dot"
				class:active={currentSlide === index}
				onclick={() => goToSlide(index)}
				aria-label={`Ir para card ${index + 1}`}
			></button>
		{/each}
	</div>
</div>

<style>
	.team-card {
		position: relative;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: 296px;
		height: 100%;
	}

	/* anel de destaque sobreposto: não conflita com a borda do nf-card-surface */
	.team-card.is-founder::after,
	.team-card.is-maintainer::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		border: 1.5px solid transparent;
	}

	.team-card.is-founder {
		box-shadow:
			0 0 0 1px rgba(233, 187, 92, 0.28),
			0 10px 32px rgba(233, 187, 92, 0.12);
	}

	.team-card.is-founder::after {
		border-color: rgba(240, 197, 106, 0.75);
		background:
			linear-gradient(
					160deg,
					rgba(255, 214, 128, 0.16) 0%,
					rgba(255, 214, 128, 0) 45%,
					rgba(255, 214, 128, 0.08) 100%
				)
				border-box;
	}

	.team-card.is-founder .team-avatar,
	.team-card.is-founder .fallback-avatar {
		box-shadow:
			0 0 0 2px rgba(240, 197, 106, 0.8),
			0 0 16px rgba(240, 197, 106, 0.3);
	}

	/* Dourado "Fundador": light usa tom escuro (≥ 5:1 sobre card/página); dark mantém o original. */
	.team-card.is-founder .team-role {
		color: hsl(40 90% 30%);
		font-weight: 600;
	}

	:global(.dark) .team-card.is-founder .team-role {
		color: #f0c56a;
	}

	.team-card.is-maintainer {
		box-shadow:
			0 0 0 1px hsl(var(--primary) / 0.35),
			0 10px 32px hsl(var(--primary) / 0.18);
	}

	.team-card.is-maintainer::after {
		border-color: hsl(var(--primary) / 0.75);
		background: linear-gradient(
				160deg,
				hsl(var(--primary) / 0.16) 0%,
				hsl(var(--primary) / 0) 45%,
				hsl(var(--primary) / 0.1) 100%
			)
			border-box;
	}

	.team-card.is-maintainer .team-avatar,
	.team-card.is-maintainer .fallback-avatar {
		box-shadow:
			0 0 0 2px hsl(var(--primary) / 0.85),
			0 0 16px hsl(var(--primary) / 0.35);
	}

	.team-card.is-maintainer .team-role {
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.carousel-header {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		margin-bottom: 0.625rem;
	}

	.carousel-controls {
		display: flex;
		gap: 0.375rem;
	}

	.carousel-btn {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		/* foreground ≈ branco no dark → mesmos valores de antes; no light vira chip cinza com ícone escuro */
		border: 1px solid hsl(var(--foreground) / 0.2);
		background: hsl(var(--foreground) / 0.08);
		color: hsl(var(--foreground));
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.carousel-btn:hover {
		background: hsl(var(--foreground) / 0.2);
	}

	.member-slide {
		animation: slide-in 0.42s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		flex: 1;
		gap: 0.5rem;
	}

	.team-avatar-wrap {
		width: 100px;
		height: 100px;
		margin-bottom: 0.5rem;
	}

	.fallback-avatar {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--muted));
		border-radius: 50%;
	}

	.team-avatar {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		object-fit: cover;
		background: hsl(var(--muted));
	}

	/* placeholder do avatar: valor histórico do dark */
	:global(.dark) .fallback-avatar,
	:global(.dark) .team-avatar {
		background: #374151;
	}

	.team-name {
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			sans-serif;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: hsl(var(--foreground));
		font-size: clamp(0.875rem, 2vw, 1.25rem);
		text-align: center;
		margin: 0;
	}

	.team-role {
		color: hsl(var(--foreground) / 0.7);
		font-size: clamp(0.75rem, 1.5vw, 1rem);
		letter-spacing: 0.5px;
	}

	.team-funcao {
		color: hsl(var(--muted-foreground));
		font-size: clamp(0.6875rem, 1.2vw, 0.8125rem);
		line-height: 1.3;
		max-width: 90%;
		/* altura fixa de 2 linhas mantém todos os cards alinhados */
		min-height: 2.6em;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.slide-title {
		color: hsl(var(--foreground));
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 0.25rem;
	}

	.slide-subtitle {
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		line-height: 1.35;
		margin: -0.15rem 0 0.35rem;
	}

	.specialties-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.specialties-list li {
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		font-weight: 500;
		letter-spacing: 0.01em;
		padding: 0.34rem 0.8rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--primary) / 0.32);
		background:
			linear-gradient(
				135deg,
				hsl(var(--primary) / 0.2) 0%,
				hsl(var(--primary) / 0.09) 40%,
				hsl(var(--card) / 0.65) 100%
			);
		box-shadow: var(--nf-shadow-pill);
	}

	.contact-list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.contact-item {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		color: hsl(var(--foreground));
		font-size: 0.8125rem;
	}

	.contact-item a {
		color: hsl(var(--foreground));
		text-decoration: none;
	}

	.contact-item a:hover {
		text-decoration: underline;
	}

	.carousel-dots {
		display: flex;
		justify-content: center;
		gap: 0.375rem;
		margin-top: 0.75rem;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		border: none;
		cursor: pointer;
		background: hsl(var(--foreground) / 0.5);
	}

	:global(.dark) .dot {
		background: hsl(var(--foreground) / 0.35);
	}

	.dot.active {
		background: hsl(var(--foreground));
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.member-slide {
			animation: none;
		}
	}
</style>
