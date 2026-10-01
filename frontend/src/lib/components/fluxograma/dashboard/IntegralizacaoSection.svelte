<script lang="ts">
	import type { IntegralizacaoResult } from '$lib/types/matriz';
	import { parseCurriculoCompleto } from '$lib/types/matriz';
	import CargaHorariaDashboard from '$lib/components/fluxograma/dashboard/CargaHorariaDashboard.svelte';

	interface Props {
		integralizacao: IntegralizacaoResult | null;
		matrizes?: Array<{ curriculoCompleto: string }>;
		curriculoCompletoAtual?: string | null;
		onMatrizChange?: (curriculoCompleto: string) => void;
		/** Simulação: +Xh se aprovado nas matriculadas (MATR). */
		simulacaoMatr?: { chMatriculadas: number; totalSimulado: number } | null;
	}

	let { integralizacao, matrizes = [], curriculoCompletoAtual = null, onMatrizChange, simulacaoMatr = null }: Props = $props();

	function parsed(curriculoCompleto: string) {
		const p = parseCurriculoCompleto(curriculoCompleto);
		return `${p.codigoCurso}/${p.versao} ${p.ano ? `- ${p.ano}` : ''}`;
	}
</script>

{#if integralizacao}
	<div class="min-w-0 rounded-xl border border-border bg-background/80 dark:bg-black/40 p-3 backdrop-blur-md sm:p-4">
		{#if matrizes.length > 1 && onMatrizChange}
			<div class="mb-3 flex justify-end">
				<select
					class="rounded-lg border border-border-strong bg-muted/60 px-2 py-1.5 text-xs text-foreground focus:border-cyan-700 focus:outline-none dark:focus:border-cyan-500"
					value={curriculoCompletoAtual ?? integralizacao.curriculoCompleto}
					onchange={(e) => onMatrizChange((e.target as HTMLSelectElement).value)}
				>
					{#each matrizes as m}
						<option value={m.curriculoCompleto}>{parsed(m.curriculoCompleto)}</option>
					{/each}
				</select>
			</div>
		{/if}
		<CargaHorariaDashboard dadosUser={integralizacao} {simulacaoMatr} />
	</div>
{/if}
