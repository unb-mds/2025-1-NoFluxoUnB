<!-- frontend/src/lib/components/layout/navbar/NavTooltip.svelte
     Rótulo ao passar o mouse (ou focar) nos botões só-ícone da navbar.
     O filho recebe os props do gatilho e os espalha no elemento interativo. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';

	interface Props {
		label: string;
		side?: 'top' | 'bottom' | 'left' | 'right';
		children: Snippet<[Record<string, unknown>]>;
	}

	let { label, side = 'bottom', children }: Props = $props();
</script>

<Tooltip.Provider delayDuration={250} skipDelayDuration={400}>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render children(props)}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content {side} sideOffset={8} class="font-medium shadow-nofluxo">
			{label}
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
