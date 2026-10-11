<script lang="ts">
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	let { children }: Props = $props();
</script>

<div class="chat-shell relative flex flex-col h-full w-full overflow-hidden bg-card">
	<!-- Ambient Background Blobs for Glassmorphism Effect -->
	<div class="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-40">
		<div class="absolute -top-[20%] -left-[10%] w-[70%] h-[50%] rounded-full bg-indigo-600/30 blur-[120px]"></div>
		<div class="absolute top-[40%] -right-[20%] w-[60%] h-[60%] rounded-full bg-fuchsia-600/20 blur-[120px]"></div>
		<div class="absolute -bottom-[20%] left-[20%] w-[80%] h-[50%] rounded-full bg-blue-600/20 blur-[100px]"></div>
	</div>

	<!-- Render rest of chat layout here -->
	{@render children()}
</div>

<style>
	/* Dark: mantém o preto histórico do painel (#09090b ≠ token --card). */
	:global(.dark) .chat-shell {
		background-color: #09090b;
	}
</style>
