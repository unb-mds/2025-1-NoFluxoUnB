<script lang="ts">
	/**
	 * Etiqueta de natureza da matéria (optativa / módulo livre), no visual que o
	 * fluxograma já usava nos cards. Obrigatória não rende etiqueta — é o caso
	 * normal da matriz e poluiria todo card.
	 *
	 * `optatoria` é um caso à parte do fluxograma: consta como optativa no SIGAA
	 * mas é pré-requisito de outra matéria, então na prática o aluno vai precisar
	 * dela. Precisa dos nomes de quem a exige para explicar isso no title.
	 */
	let {
		natureza,
		nomesQueExigem = []
	}: {
		natureza: 'obrigatoria' | 'optativa' | 'modulo_livre' | 'optatoria';
		nomesQueExigem?: string[];
	} = $props();
</script>

{#if natureza === 'modulo_livre'}
	<span
		class="rounded bg-teal-400/90 px-1.5 py-0.5 text-[length:var(--materia-badge-fs,9px)] font-medium text-black"
		title="Módulo livre: componente cursado fora da matriz do curso (monitoria, eletiva de outro curso). Conta para a carga horária de módulo livre"
	>mód. livre</span>
{:else if natureza === 'optatoria'}
	<span
		class="rounded bg-amber-500/90 px-1.5 py-0.5 text-[length:var(--materia-badge-fs,9px)] font-medium text-black"
		title={`Optatória: consta como optativa no SIGAA, mas é pré-requisito de ${nomesQueExigem.join(', ')}. Na prática você vai precisar dela`}
	>optatória</span>
{:else if natureza === 'optativa'}
	<span
		class="rounded bg-blue-600 px-1.5 py-0.5 text-[length:var(--materia-badge-fs,9px)] font-medium text-white dark:bg-blue-500/85"
		title="Optativa: não é exigida individualmente, mas conta para a carga horária optativa"
	>opt.</span>
{/if}
