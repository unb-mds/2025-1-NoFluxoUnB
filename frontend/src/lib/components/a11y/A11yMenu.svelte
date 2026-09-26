<!-- frontend/src/lib/components/a11y/A11yMenu.svelte -->
<script lang="ts">
	import { RotateCcw, SlidersHorizontal } from 'lucide-svelte';
	import UniversalAccessIcon from './UniversalAccessIcon.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { a11y, a11yActiveCount } from '$lib/stores/a11y';
	import { A11Y_OPTIONS } from './a11y-options';
	import A11ySwitch from './A11ySwitch.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		/** Botão menor (size-9) para barras compactas. */
		compact?: boolean;
		/**
		 * 'dropdown' — botão com ícone de acessibilidade e menu de interruptores.
		 * 'list' — os interruptores em lista, sem portal; para drawers/sheets com z-index alto.
		 */
		layout?: 'dropdown' | 'list';
		align?: 'start' | 'center' | 'end';
		class?: string;
	}

	let { compact = false, layout = 'dropdown', align = 'end', class: className }: Props = $props();
</script>

{#if layout === 'list'}
	<section class={cn('flex flex-col gap-2', className)} aria-labelledby="a11y-list-heading">
		<div class="flex items-center justify-between">
			<h2 id="a11y-list-heading" class="text-sm font-medium text-muted-foreground">Acessibilidade</h2>
			<a href="/acessibilidade" class="text-xs text-primary underline underline-offset-4">Todas as opções</a>
		</div>
		{#each A11Y_OPTIONS as opt (opt.key)}
			<A11ySwitch
				id={`a11y-drawer-${opt.key}`}
				checked={$a11y[opt.key]}
				label={opt.label}
				icon={opt.icon}
				onchange={(v) => a11y.set(opt.key, v)}
				class="p-2.5"
			/>
		{/each}
	</section>
{:else}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size={compact ? 'icon-sm' : 'icon'}
					class={cn('relative rounded-full', className)}
					aria-label={$a11yActiveCount > 0
						? `Acessibilidade, ${$a11yActiveCount} ${$a11yActiveCount === 1 ? 'opção ativa' : 'opções ativas'}`
						: 'Acessibilidade'}
				>
					<UniversalAccessIcon class="h-[1.25rem] w-[1.25rem]" />
					{#if $a11yActiveCount > 0}
						<span
							aria-hidden="true"
							class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground"
						>
							{$a11yActiveCount}
						</span>
					{/if}
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content {align} class="w-64">
			<DropdownMenu.Label>Acessibilidade</DropdownMenu.Label>
			<DropdownMenu.Separator />
			{#each A11Y_OPTIONS as opt (opt.key)}
				{@const Icon = opt.icon}
				<DropdownMenu.CheckboxItem
					checked={$a11y[opt.key]}
					onCheckedChange={(v) => a11y.set(opt.key, v === true)}
					closeOnSelect={false}
				>
					<Icon class="h-4 w-4" />
					{opt.label}
				</DropdownMenu.CheckboxItem>
			{/each}
			<DropdownMenu.Separator />
			<DropdownMenu.Item onclick={() => a11y.reset()} disabled={$a11yActiveCount === 0}>
				<RotateCcw class="h-4 w-4" />
				Restaurar padrões
			</DropdownMenu.Item>
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href="/acessibilidade">
						<SlidersHorizontal class="h-4 w-4" />
						Todas as opções
					</a>
				{/snippet}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
