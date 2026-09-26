<script lang="ts">
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type IconComponent = new (...args: any[]) => any;

	interface Props {
		icon: IconComponent;
		title: string;
		description: string;
	}

	let { icon: Icon, title, description }: Props = $props();

	const titleParts = $derived.by(() => {
		const words = title.trim().split(/\s+/).filter(Boolean);
		if (words.length === 0) return { main: '', accent: '' };
		if (words.length === 1) return { main: '', accent: words[0] ?? '' };
		const accent = words.at(-1) ?? '';
		const main = words.slice(0, -1).join(' ');
		return { main, accent };
	});
</script>

<article class="feature-card">
	<div class="feature-card-inner">
		<div class="feature-card-icon" aria-hidden="true">
			<Icon class="feature-card-icon-svg" stroke-width="2" />
		</div>
		<div class="feature-card-content">
			<h3 class="feature-card-title">
				{#if titleParts.main}
					{titleParts.main}{' '}
				{/if}<span class="title-accent">{titleParts.accent}</span>
			</h3>
			<p class="feature-card-desc">{description}</p>
		</div>
	</div>
</article>

<style>
	.feature-card {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 16px;
		text-align: left;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--primary) / 0.28);
		border-radius: 16px;
		padding: 24px;
		/* Sombra discreta no light; glow roxo original no dark (tokens em app.css) */
		box-shadow: var(--nf-shadow-glow);
		transition:
			transform 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.feature-card:hover {
		transform: translateY(-2px);
		border-color: hsl(var(--primary) / 0.6);
		box-shadow: var(--nf-shadow-glow-hover);
	}

	.feature-card-inner {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		gap: 16px;
	}

	.feature-card-icon {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--primary) / 0.85);
		border: 2px solid hsl(var(--primary) / 0.6);
		/* --primary-foreground é branco nos dois temas */
		color: hsl(var(--primary-foreground));
		box-shadow:
			0 0 16px hsl(var(--primary) / 0.4),
			inset 0 1px 0 hsl(var(--primary-foreground) / 0.2);
	}

	.feature-card-icon :global(.feature-card-icon-svg) {
		width: 1.5rem;
		height: 1.5rem;
		flex-shrink: 0;
		opacity: 1;
		color: hsl(var(--primary-foreground));
		stroke: hsl(var(--primary-foreground));
	}

	.feature-card-content {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.feature-card-title {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1.3;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: hsl(var(--foreground));
	}

	.feature-card-title :global(.title-accent) {
		color: hsl(var(--primary));
	}

	.feature-card-desc {
		margin: 0;
		font-size: 13px;
		line-height: 1.625;
		color: hsl(var(--muted-foreground));
	}
</style>
