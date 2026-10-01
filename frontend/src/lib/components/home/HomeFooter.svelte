<script lang="ts">
	import { Github } from 'lucide-svelte';

	const currentYear = new Date().getFullYear();

	const links = [
		{ label: 'Home', href: '/' },
		{ label: 'Fluxogramas', href: '/fluxogramas' },
		{ label: 'Sobre', href: '/#sobre-nos' }
	];

	const socialLinks = [
		{
			icon: Github,
			href: 'https://github.com/unb-mds/2025-1-NoFluxoUNB',
			label: 'GitHub'
		}
	];
</script>

<footer class="home-footer">
	<div class="footer-content">
		<div class="footer-brand">
			<p class="footer-logo">
				<span class="text-foreground">NOFLX</span><span class="text-primary"> UNB</span>
			</p>
			<p class="footer-copyright">© {currentYear} NoFluxo UNB — todos os direitos reservados</p>
		</div>

		<nav class="footer-links">
			{#each links as link}
				<a href={link.href} class="footer-link">{link.label}</a>
			{/each}
		</nav>

		<div class="footer-contact">
			<p class="contact-label">Contato</p>
			<a class="contact-email" href="mailto:unbnofluxo@gmail.com">unbnofluxo@gmail.com</a>
		</div>

		<div class="footer-social">
			{#each socialLinks as social}
				<a
					href={social.href}
					target="_blank"
					rel="noopener noreferrer"
					class="social-link"
					aria-label={social.label}
				>
					<social.icon class="h-5 w-5" />
				</a>
			{/each}
		</div>
	</div>
</footer>

<style>
	.home-footer {
		background: hsl(var(--background));
		/* divisória: foreground ≈ branco no dark → mesmo valor visual de antes */
		border-top: 1px solid hsl(var(--foreground) / 0.07);
	}

	.footer-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	@media (min-width: 768px) {
		.footer-content {
			flex-direction: row;
			justify-content: space-between;
			padding: 2rem 2rem;
		}
	}

	.footer-brand {
		text-align: center;
	}

	@media (min-width: 768px) {
		.footer-brand {
			text-align: left;
		}
	}

	.footer-logo {
		font-weight: 800;
		font-size: 1rem;
		letter-spacing: -0.02em;
		margin-bottom: 0.25rem;
	}

	.footer-copyright {
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
	}

	.footer-links {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1rem;
	}

	@media (min-width: 768px) {
		.footer-links {
			gap: 1.5rem;
		}
	}

	.footer-link {
		color: hsl(var(--muted-foreground));
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: color 0.16s ease;
	}

	.footer-link:hover {
		color: hsl(var(--foreground));
	}

	.footer-contact {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.contact-label {
		color: hsl(var(--muted-foreground));
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.contact-email {
		color: hsl(var(--foreground));
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: color 0.16s ease;
	}

	.contact-email:hover {
		color: hsl(var(--primary));
	}

	@media (min-width: 768px) {
		.footer-contact {
			align-items: flex-start;
		}
	}

	.footer-social {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.social-link {
		color: hsl(var(--muted-foreground));
		padding: 0.5rem;
		transition: color 0.16s ease;
	}

	.social-link:hover {
		color: hsl(var(--foreground));
	}
</style>
