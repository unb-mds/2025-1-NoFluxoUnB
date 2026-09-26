<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { type VariantProps, tv } from "tailwind-variants";

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/35 aria-invalid:ring-destructive/30 dark:aria-invalid:ring-destructive/35 aria-invalid:border-destructive inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap outline-none transition-[color,background,border-color,filter,opacity] duration-150 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 active:brightness-[0.97]",
		variants: {
			variant: {
				default:
					"border border-transparent bg-primary text-primary-foreground shadow-none hover:brightness-[1.07]",
				destructive:
					"border border-transparent bg-destructive text-destructive-foreground shadow-none hover:brightness-1.05 focus-visible:ring-destructive/30",
				outline:
					"border border-foreground/12 bg-card text-foreground hover:border-foreground/18 hover:bg-muted dark:bg-secondary/40 dark:hover:bg-secondary/65",
				secondary:
					"border border-foreground/10 bg-secondary text-secondary-foreground hover:bg-secondary/90",
				ghost: "border border-transparent hover:bg-secondary/55 text-foreground",
				link: "border-transparent text-primary underline-offset-4 hover:underline font-medium",
			},
			size: {
				default: "h-10 px-4 py-2 min-h-10 has-[>svg]:px-3",
				sm: "h-9 gap-1.5 rounded-lg px-3 text-xs font-medium has-[>svg]:px-2.5 min-h-9",
				lg: "h-11 rounded-xl px-6 text-[15px] has-[>svg]:px-4 min-h-11",
				icon: "size-10 rounded-lg",
				"icon-sm": "size-9 rounded-lg",
				"icon-lg": "size-11 rounded-xl",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
