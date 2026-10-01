<script lang="ts">
	import { Loader2 } from 'lucide-svelte';

	interface Props {
		progress: number;
		state: 'uploading' | 'processing';
	}

	let { progress, state }: Props = $props();

	let statusText = $derived(
		state === 'uploading' ? 'Enviando seu histórico…' : 'Processando disciplinas…'
	);
</script>

<div class="upload-progress">
	<div class="spinner-ring">
		<Loader2 class="size-9 animate-spin text-primary" stroke-width="2" />
	</div>

	<div class="text-block">
		<h3 class="status-title">{statusText}</h3>
		<p class="status-sub">Isso pode levar alguns segundos.</p>
	</div>

	<div class="bar-row">
		<div class="bar-track">
			<div class="bar-fill" style:width="{progress}%"></div>
		</div>
		<span class="bar-label">{progress}%</span>
	</div>
</div>

<style>
	.upload-progress {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		padding: 2rem 0.5rem;
	}

	.spinner-ring {
		display: flex;
		height: 4rem;
		width: 4rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: hsl(var(--primary) / 0.1);
		border: 1px solid hsl(var(--primary) / 0.18);
	}

	.text-block {
		text-align: center;
	}

	.status-title {
		font-size: 1.0625rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.status-sub {
		margin: 0.35rem 0 0;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.bar-row {
		display: flex;
		width: 100%;
		max-width: 20rem;
		align-items: center;
		gap: 0.75rem;
	}

	.bar-track {
		height: 0.5rem;
		flex: 1;
		overflow: hidden;
		border-radius: 9999px;
		background: hsl(var(--border));
	}

	:global(.dark) .bar-track {
		background: hsl(0 0% 100% / 0.08);
	}

	.bar-fill {
		height: 100%;
		border-radius: 9999px;
		background: hsl(var(--primary));
		transition: width 0.28s ease-out;
	}

	.bar-label {
		min-width: 2.75rem;
		text-align: right;
		font-size: 0.8125rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}
</style>
