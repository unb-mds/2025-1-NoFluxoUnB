<!-- frontend/src/lib/components/a11y/A11ySwitch.svelte -->
<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		id: string;
		checked: boolean;
		label: string;
		description?: string;
		/** Texto pequeno à direita da descrição (ex.: critério WCAG). */
		hint?: string;
		icon?: typeof import('lucide-svelte').Contrast;
		onchange: (next: boolean) => void;
		class?: string;
	}

	let { id, checked, label, description, hint, icon: Icon, onchange, class: className }: Props = $props();

	const labelId = $derived(`${id}-label`);
	const descId = $derived(`${id}-desc`);
</script>

<div class={cn('flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3', className)}>
	<div class="flex min-w-0 items-start gap-3">
		{#if Icon}
			<Icon class="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
		{/if}
		<div class="min-w-0">
			<span id={labelId} class="block text-sm font-medium text-foreground">{label}</span>
			{#if description}
				<span id={descId} class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
					{description}
					{#if hint}
						<span class="ml-1 whitespace-nowrap rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">WCAG {hint}</span>
					{/if}
				</span>
			{/if}
		</div>
	</div>
	<button
		type="button"
		{id}
		role="switch"
		aria-checked={checked}
		aria-labelledby={labelId}
		aria-describedby={description ? descId : undefined}
		onclick={() => onchange(!checked)}
		class={cn(
			'relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
			checked ? 'border-primary bg-primary' : 'border-border-strong bg-muted'
		)}
	>
		<span
			aria-hidden="true"
			class={cn(
				'inline-block h-5 w-5 rounded-full shadow transition-transform motion-reduce:transition-none',
				checked ? 'translate-x-5 bg-primary-foreground' : 'translate-x-0.5 bg-foreground/70'
			)}
		></span>
	</button>
</div>
