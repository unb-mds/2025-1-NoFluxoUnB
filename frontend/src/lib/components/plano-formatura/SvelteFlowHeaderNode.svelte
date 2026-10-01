<script lang="ts">
	import { type NodeProps } from '@xyflow/svelte';
	import { CalendarDays } from 'lucide-svelte';

	let { data }: NodeProps = $props();
</script>

<div class="flex flex-col items-center justify-center gap-1 w-[260px] rounded-xl border border-border bg-card px-4 py-3 shadow-nofluxo backdrop-blur-md dark:border-foreground/10 dark:bg-transparent dark:bg-gradient-to-b dark:from-foreground/5 dark:to-transparent dark:shadow-lg">
	<div class="flex items-center justify-center gap-2.5">
		<CalendarDays class="h-5 w-5 text-blue-700 opacity-90 dark:text-blue-400" />
		<span class="text-[16px] font-black tracking-wide text-foreground/90">
			{data.label}
		</span>
	</div>
	{#if data.sublabel}
		<span class="text-[11px] font-semibold tracking-wide text-emerald-800 dark:text-emerald-300/80">
			{data.sublabel}
		</span>
	{/if}
</div>
