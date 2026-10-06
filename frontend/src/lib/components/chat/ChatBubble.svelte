<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		role: 'user' | 'assistant';
		name?: string;
		children: Snippet;
	}

	let { role, name, children }: Props = $props();

	const isUser = $derived(role === 'user');
</script>

<div class="flex flex-col mb-4 {isUser ? 'items-end' : 'items-start'} relative z-10">
	{#if name}
		<span class="text-[10px] font-medium mb-1.5 px-1 uppercase tracking-widest {isUser ? 'text-muted-foreground dark:text-white/40' : 'text-accent-foreground dark:text-white/40'}">{name}</span>
	{/if}
	
	<div
		class="max-w-[88%] px-5 py-3.5 text-[14px] leading-[1.75] [text-wrap:pretty] backdrop-blur-xl shadow-sm dark:shadow-lg my-1 transition-all {isUser
				? 'bg-primary text-primary-foreground rounded-[24px] rounded-tr-[8px] border border-primary/60 dark:bg-white/15 dark:text-white dark:border-white/20'
				: 'bg-accent text-foreground rounded-[24px] rounded-tl-[8px] border border-ai/20 dark:bg-black/30 dark:text-white/85 dark:border-white/10'}"
	>
		{@render children()}
	</div>
</div>
