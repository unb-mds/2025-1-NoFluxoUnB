<script lang="ts">
	import { onMount } from 'svelte';
	import { Settings2, X } from 'lucide-svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';

	/**
	 * Aviso (só mobile) de que o fluxograma está mostrando TUDO — obrigatórias,
	 * optativas e módulos livres — e de que dá para enxugar a tela escondendo
	 * os dois últimos no menu de exibição (⚙).
	 *
	 * O padrão é mostrar tudo: esconder matéria por conta própria confunde mais
	 * do que ajuda (o aluno acha que o fluxograma dele está incompleto). Quem
	 * quiser menos ruído decide, e o aviso ensina como.
	 *
	 * Some ao ser dispensado (localStorage) ou assim que o aluno desliga algum
	 * dos filtros — nesse ponto ele já sabe onde eles ficam.
	 */

	const DISMISS_KEY = 'nf-fluxo-aviso-filtros-mobile';

	const store = fluxogramaStore;
	let dismissed = $state(true);

	onMount(() => {
		dismissed = localStorage.getItem(DISMISS_KEY) === '1';
	});

	function dismiss() {
		dismissed = true;
		localStorage.setItem(DISMISS_KEY, '1');
	}

	/** Enquanto os dois estiverem ligados, o aviso tem o que ensinar. */
	let mostrandoTudo = $derived(store.state.showOptativas && store.state.showModulosLivres);
</script>

{#if !dismissed && mostrandoTudo}
	<div
		class="mb-2 flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.12] px-3 py-2.5 text-xs leading-relaxed text-foreground/85 backdrop-blur-md md:hidden"
		role="note"
	>
		<Settings2 class="mt-0.5 h-4 w-4 shrink-0 text-primary dark:text-purple-300" aria-hidden="true" />
		<p class="min-w-0 flex-1">
			Estamos mostrando seu fluxograma completo, com
			<strong class="text-foreground">optativas</strong> e
			<strong class="text-foreground">módulos livres</strong>. Para uma visualização mais limpa no
			celular, você pode ocultá-los no menu de exibição (⚙).
		</p>
		<button
			type="button"
			onclick={dismiss}
			class="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
			aria-label="Dispensar aviso"
		>
			<X class="h-4 w-4" />
		</button>
	</div>
{/if}
