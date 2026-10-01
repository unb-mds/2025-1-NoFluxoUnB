<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const badgeVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/35 aria-invalid:ring-destructive/35 aria-invalid:border-destructive inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] [&>svg]:pointer-events-none [&>svg]:size-3",
		variants: {
			variant: {
				default:
					"border-transparent bg-primary text-primary-foreground [a&]:hover:brightness-110",
				secondary:
					"border-foreground/10 bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/85",
				ai: "nf-chip-ai border-0 px-2.5 font-medium text-[12px]",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground [a&]:hover:brightness-110 focus-visible:ring-destructive/30",
				outline:
					"border-foreground/12 bg-transparent text-muted-foreground [a&]:hover:bg-secondary/55 [a&]:hover:text-foreground",
				muted:
					"border-foreground/10 bg-secondary/50 text-muted-foreground [a&]:hover:border-foreground/14 [a&]:hover:text-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? "a" : "span"}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
