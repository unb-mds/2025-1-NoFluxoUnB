<!-- frontend/src/lib/components/a11y/UniversalAccessIcon.svelte
     Símbolo de acesso universal (pessoa de braços abertos num círculo), no traço do Lucide.
     Preferido ao ícone de cadeira de rodas, que representa só mobilidade. -->
<script lang="ts">
	interface Props {
		class?: string;
		strokeWidth?: number;
	}
	let { class: className = 'h-5 w-5', strokeWidth = 2 }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
	focusable="false"
>
	<circle cx="12" cy="12" r="10" />
	<circle cx="12" cy="7.25" r="1" fill="currentColor" stroke="none" />
	<path d="M6.75 10.25c3.4 1.1 7.1 1.1 10.5 0" />
	<path d="M12 11.25v3" />
	<path d="M12 14.25 9.75 18.75" />
	<path d="M12 14.25l2.25 4.5" />
</svg>
