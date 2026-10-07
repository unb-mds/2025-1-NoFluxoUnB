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
		<span class="text-[10px] font-medium text-white/40 mb-1.5 px-1 uppercase tracking-widest">{name}</span>
	{/if}
	
	<div
		class="max-w-[88%] min-w-0 px-4 py-3 text-[14px] leading-[1.75] [overflow-wrap:anywhere] break-words [text-wrap:pretty] backdrop-blur-xl sm:px-5 sm:py-3.5 shadow-lg my-1 transition-all {isUser
				? 'bg-white/15 text-white rounded-[24px] rounded-tr-[8px] border border-white/20'
				: 'bg-black/30 text-white/85 rounded-[24px] rounded-tl-[8px] border border-white/10'}"
	>
		{@render children()}
	</div>
</div>
