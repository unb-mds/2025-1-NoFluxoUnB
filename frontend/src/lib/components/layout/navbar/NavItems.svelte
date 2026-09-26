<!-- frontend/src/lib/components/layout/navbar/NavItems.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { ChevronDown } from 'lucide-svelte';
	import { type NavEntry, isEntryActive } from './nav-config';

	interface Props {
		entries: NavEntry[];
		pathname: string;
		/** Classe base do link (varia por variante — herda de navDesktopClass do Navbar). */
		linkClass: string;
	}

	let { entries, pathname, linkClass }: Props = $props();
</script>

{#each entries as entry}
	{#if entry.kind === 'link'}
		<a href={entry.href} class={linkClass} class:active={isEntryActive(entry, pathname)}>
			{entry.label}
		</a>
	{:else}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="{linkClass} cursor-pointer border-none bg-transparent p-0 {isEntryActive(
					entry,
					pathname
				)
					? 'active'
					: ''}"
			>
				<span class="inline-flex items-center gap-1">
					{entry.label}
					<ChevronDown class="h-3.5 w-3.5 shrink-0" />
				</span>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-52" align="center">
				{#each entry.children as child}
					{@const ChildIcon = child.icon}
					<DropdownMenu.Item onclick={() => goto(child.href)}>
						<ChildIcon class="mr-2 h-4 w-4" />
						{child.label}
						{#if child.badge}
							<span
								class="ml-auto rounded-full border border-accent-foreground/40 bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
							>
								{child.badge}
							</span>
						{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
{/each}
