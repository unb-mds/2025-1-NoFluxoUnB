<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button';

	function handleClick() {
		const user = $currentUser;
		if (user) {
			if (user.dadosFluxograma) {
				goto('/meu-fluxograma');
			} else {
				goto('/upload-historico');
			}
		} else {
			goto('/signup');
		}
	}
</script>

<section class="pronto-section">
	<h2 class="section-heading">Pronto para organizar seu fluxo?</h2>
	<p class="pronto-lead">
		Crie sua conta, envie seu histórico e use o mesmo ecossistema visual em fluxograma, upload e assistente.
	</p>
	<Button size="lg" class="nf-cta-glow nf-cta-glow-hover rounded-xl px-8 uppercase tracking-wide" onclick={handleClick}>
		Começar agora
	</Button>
</section>

<style>
	.pronto-section {
		padding: clamp(3.5rem, 8vw, 4.5rem) 1.5rem;
		background: hsl(var(--background) / 0.92);
		/* divisória: foreground ≈ branco no dark → mesmo valor visual de antes */
		border-top: 1px solid hsl(var(--foreground) / 0.06);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.section-heading {
		font-size: clamp(1.375rem, 3vw, 1.75rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		color: hsl(var(--foreground));
		margin: 0 0 1rem;
	}

	.pronto-lead {
		color: hsl(var(--muted-foreground));
		font-size: clamp(0.875rem, 1.5vw, 1rem);
		max-width: 520px;
		margin: 0 0 1.75rem;
		line-height: 1.6;
	}
</style>
