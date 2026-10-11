<script lang="ts">
	import type { MateriaModel } from '$lib/types/materia';
	import type { CursoModel } from '$lib/types/curso';
	import { getOfertaDeMateria, type TurmaResolvida } from '$lib/services/oferta-turmas.service';
	import { formatLocalSigaa, formatVagas, horarioLegivel } from '$lib/utils/sigaa';
	import { vagaAssinaturasStore } from '$lib/stores/vaga-assinaturas.store.svelte';
	import SeguirVagaButton from '$lib/components/materia/SeguirVagaButton.svelte';
	import { Loader2 } from 'lucide-svelte';

	interface Props {
		materia: MateriaModel;
		courseData: CursoModel;
		isActive: boolean;
	}

	let { materia, courseData, isActive }: Props = $props();

	let turmas = $state<TurmaResolvida[]>([]);
	let turmasLoading = $state(false);
	let turmasError = $state<string | null>(null);
	let turmasCarregadasPara = $state<number | null>(null);

	$effect(() => {
		if (!isActive || turmasCarregadasPara === materia.idMateria) return;
		turmasLoading = true;
		turmasError = null;
		getOfertaDeMateria(materia.codigoMateria, materia.idMateria, courseData.equivalencias ?? [])
			.then((rows) => {
				turmas = rows;
				turmasCarregadasPara = materia.idMateria;
			})
			.catch(() => {
				turmasError = 'Não foi possível carregar as turmas agora.';
			})
			.finally(() => {
				turmasLoading = false;
			});
		if (!vagaAssinaturasStore.carregado) void vagaAssinaturasStore.load();
	});

	function localLegivel(local: string | null): string {
		const linhas = formatLocalSigaa(local ?? '');
		return linhas.length > 0 ? linhas.join(' · ') : 'Local a definir';
	}
</script>

<div class="space-y-2">
	{#if turmasLoading}
		<div class="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
			<Loader2 class="h-4 w-4 animate-spin" />
			Carregando turmas...
		</div>
	{:else if turmasError}
		<p class="py-4 text-center text-sm text-red-700 dark:text-red-300/80">{turmasError}</p>
	{:else if turmas.length === 0}
		<p class="py-4 text-center text-sm text-muted-foreground">
			Nenhuma turma ofertada no período letivo atual.
		</p>
	{:else}
		{#if turmas[0]?.codigoOfertado}
			<p
				class="rounded-lg border border-sky-300/25 bg-sky-500/10 px-3 py-2 text-xs leading-snug text-sky-800 dark:text-sky-200/90"
			>
				Esta matéria é ofertada como
				<span class="font-mono font-semibold">{turmas[0].codigoOfertado}</span> neste período —
				é nesse código que você se matricula.
			</p>
		{/if}
		{#each turmas as { turma: t } (t.id_turmas)}
			<div class="rounded-lg bg-foreground/5 px-3 py-2.5">
				<div class="flex items-center justify-between gap-2">
					<span class="text-sm font-semibold text-foreground/90">Turma {t.turma}</span>
					<span class="rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-foreground/70">
						{formatVagas(t.vagas_sobrando, t.vagas_ofertadas, t.vagas_ocupadas)} vaga(s)
					</span>
				</div>
				{#if t.docente}
					<p class="mt-1 text-xs text-muted-foreground">{t.docente}</p>
				{/if}
				<p class="mt-1 text-xs text-muted-foreground">{horarioLegivel(t.horario)}</p>
				<p class="text-xs text-muted-foreground">{localLegivel(t.local)}</p>
				<div class="mt-2">
					<SeguirVagaButton turma={t} />
				</div>
			</div>
		{/each}
	{/if}
</div>
