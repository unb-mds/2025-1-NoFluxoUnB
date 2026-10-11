<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	class={cn(
		"bg-card/95 text-card-foreground shadow-nofluxo flex flex-col gap-6 rounded-card border border-foreground/[0.08] py-6",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
