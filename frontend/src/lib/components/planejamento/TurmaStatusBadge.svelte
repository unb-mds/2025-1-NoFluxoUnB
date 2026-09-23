<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Users, Ban, Lock, GraduationCap, Check } from 'lucide-svelte';

	/**
	 * Badge de status de turma/matéria, consolidando o que antes eram 2-3
	 * implementações soltas (vagas em `TurmaOption.svelte`, travada/cursando em
	 * `SubjectTurmaSelector.svelte`, vagas de novo em `TurmasVagasPanel.svelte`).
	 *
	 * Dois formatos, escolhidos pelo `status`:
	 * - pílula compacta (vagas/sem-vagas/fora-do-turno/professor-preferido): usada
	 *   inline no cabeçalho do card de turma, sem texto livre — é só um selo.
	 * - linha com ícone (cursando-travada/travada-manual): usada abaixo do
	 *   cabeçalho da matéria, onde o texto varia (trava automática vs. manual,
	 *   com ou sem botão "Destravar") — por isso aceita `children` em vez de um
	 *   texto fixo, preservando exatamente o comportamento visual anterior.
	 */
	let {
		status,
		quantidade,
		children
	}: {
		status:
			| 'vagas'
			| 'sem-vagas'
			| 'cursando-travada'
			| 'travada-manual'
			| 'fora-do-turno'
			| 'professor-preferido';
		/** Só usado por `status === 'vagas'` — quantas vagas sobrando. */
		quantidade?: number;
		/** Só usado pelas linhas com ícone — o texto/ações específicos do caso. */
		children?: Snippet;
	} = $props();
</script>

{#if status === 'vagas'}
	<span
		class="flex items-center gap-1 rounded-full border border-emerald-300/45 bg-emerald-500/18 px-2 py-0.5 text-[10px] font-semibold text-emerald-100"
	>
		<Users class="h-2.5 w-2.5" />{quantidade ?? 0} vaga(s)
	</span>
{:else if status === 'sem-vagas'}
	<span
		class="flex items-center gap-1 rounded-full border border-red-300/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-200"
	>
		<Users class="h-2.5 w-2.5" />Sem vagas
	</span>
{:else if status === 'fora-do-turno'}
	<span
		class="flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200"
	>
		<Ban class="h-2.5 w-2.5" />Fora do turno
	</span>
{:else if status === 'professor-preferido'}
	<span
		class="flex items-center gap-1 rounded-full border border-sky-300/45 bg-sky-500/18 px-2 py-0.5 text-[10px] font-semibold text-sky-100"
	>
		<Check class="h-2.5 w-2.5" />Professor preferido
	</span>
{:else if status === 'cursando-travada'}
	<p class="mt-1 flex items-start gap-1 text-[10px] font-medium text-emerald-300/90">
		<GraduationCap class="mt-px h-3 w-3 shrink-0" />
		{#if children}{@render children()}{:else}<span>Já cursando — turma travada.</span>{/if}
	</p>
{:else if status === 'travada-manual'}
	<p class="mt-1 flex items-start gap-1 text-[10px] font-medium text-white/60">
		<Lock class="mt-px h-2.5 w-2.5 shrink-0" />
		{#if children}{@render children()}{:else}<span>Turma escolhida por você.</span>{/if}
	</p>
{/if}
