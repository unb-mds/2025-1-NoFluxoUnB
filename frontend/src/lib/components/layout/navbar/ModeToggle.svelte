<!-- frontend/src/lib/components/layout/navbar/ModeToggle.svelte -->
<script lang="ts">
	import { Sun, Moon, Monitor } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { theme, type Theme } from '$lib/stores/theme';
	import { cn } from '$lib/utils';

	interface Props {
		/** Botão menor (size-9) para barras compactas. */
		compact?: boolean;
		/**
		 * 'dropdown' — Mode Toggle do shadcn (ícone sol/lua + menu Claro/Escuro/Sistema).
		 * 'segmented' — as três opções em linha, sem portal; para drawers/sheets com z-index alto.
		 */
		layout?: 'dropdown' | 'segmented';
		align?: 'start' | 'center' | 'end';
		class?: string;
	}

	let { compact = false, layout = 'dropdown', align = 'end', class: className }: Props = $props();

	const options: { value: Theme; label: string; icon: typeof Sun }[] = [
		{ value: 'light', label: 'Claro', icon: Sun },
		{ value: 'dark', label: 'Escuro', icon: Moon },
		{ value: 'system', label: 'Sistema', icon: Monitor }
	];

	function choose(value: Theme) {
		if (value === 'system') theme.setSystem();
		else theme.set(value);
	}
</script>

{#if layout === 'segmented'}
	<div
		class={cn('flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1', className)}
		role="group"
		aria-label="Tema"
	>
		{#each options as opt (opt.value)}
			{@const Icon = opt.icon}
			<button
				type="button"
				class={cn(
					'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 motion-reduce:transition-none',
					$theme === opt.value
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground hover:text-foreground'
				)}
				aria-pressed={$theme === opt.value}
				onclick={() => choose(opt.value)}
			>
				<Icon class="h-4 w-4" />
				<span>{opt.label}</span>
			</button>
		{/each}
	</div>
{:else}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size={compact ? 'icon-sm' : 'icon'}
					class={cn('relative rounded-full', className)}
				>
					<Sun
						class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all motion-reduce:transition-none dark:-rotate-90 dark:scale-0"
					/>
					<Moon
						class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all motion-reduce:transition-none dark:rotate-0 dark:scale-100"
					/>
					<span class="sr-only">Alternar tema</span>
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content {align} class="min-w-[9rem]">
			{#each options as opt (opt.value)}
				{@const Icon = opt.icon}
				<DropdownMenu.Item
					onclick={() => choose(opt.value)}
					class={$theme === opt.value ? 'font-semibold text-foreground' : undefined}
				>
					<Icon class="h-4 w-4" />
					{opt.label}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
