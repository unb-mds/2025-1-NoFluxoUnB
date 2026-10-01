<script lang="ts">
	import { HelpCircle } from 'lucide-svelte';

	interface Props {
		onclick: () => void;
	}

	let { onclick }: Props = $props();
</script>

<button type="button" class="help-btn" {onclick}>
	<HelpCircle class="size-4 shrink-0" stroke-width="2" />
	<span>Como obter seu histórico acadêmico?</span>
</button>

<style>
	.help-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1.15rem;
		border-radius: 9999px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		background: hsl(var(--secondary) / 0.55);
		border: 1px solid hsl(var(--border-strong) / 0.7);
		cursor: pointer;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}

	.help-btn:hover {
		background: hsl(var(--secondary) / 0.8);
		border-color: hsl(var(--border-strong));
	}

	:global(.dark) .help-btn {
		border-color: hsl(0 0% 100% / 0.12);
	}

	:global(.dark) .help-btn:hover {
		border-color: hsl(0 0% 100% / 0.16);
	}
</style>
