<script lang="ts">
	import { isOptativa, type MateriaModel, type OptativaAdicionada } from '$lib/types/materia';
	import type { DadosMateria } from '$lib/types/user';
	import SubjectCard from '$lib/components/fluxograma/cards/SubjectCard.svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';

	interface Props {
		semester: number;
		subjects: MateriaModel[];
		/** Optativas planejadas pelo usuário neste semestre. */
		optPlanned?: OptativaAdicionada[];
		/** Optativas/eletivas do histórico cursadas/aproveitadas neste semestre. */
		extrasCursadas?: { materia: MateriaModel; dados: DadosMateria }[];
		onSubjectClick?: (materia: MateriaModel) => void;
		onSubjectOpenChain?: (materia: MateriaModel) => void;
		onSubjectLongPress?: (materia: MateriaModel) => void;
		/** Label customizado para o header. Se não fornecido, usa "Semestre {semester}". */
		headerLabel?: string;
	}

	let {
		semester,
		subjects,
		optPlanned = [],
		extrasCursadas = [],
		onSubjectClick,
		onSubjectOpenChain,
		onSubjectLongPress,
		headerLabel
	}: Props = $props();

	const store = fluxogramaStore;

	/**
	 * Filtros de exibição (menu ⚙): optativas e módulos livres podem ser
	 * ocultados — no mobile começam ocultos. Módulo livre = card sintetizado
	 * pelo store com idMateria negativo (cursado fora da matriz).
	 * Optatórias (optativas exigidas como pré-requisito de obrigatória) nunca
	 * são ocultadas: o aluno precisa delas para destravar o curso.
	 */
	function ehOptatoria(m: MateriaModel): boolean {
		return store.optatorias.has(m.codigoMateria.trim().toUpperCase());
	}
	let subjectsVisiveis = $derived(
		store.state.showOptativas
			? subjects
			: subjects.filter((m) => !isOptativa(m) || ehOptatoria(m))
	);
	let optPlannedVisiveis = $derived(
		store.state.showOptativas ? optPlanned : optPlanned.filter((o) => ehOptatoria(o.materia))
	);
	let extrasVisiveis = $derived(
		extrasCursadas.filter((e) => {
			if (e.materia.idMateria < 0) return store.state.showModulosLivres;
			return store.state.showOptativas || ehOptatoria(e.materia);
		})
	);

	/** Espaço vertical entre cards — mais ar para leitura confortável. */
	const BASE_GAP_REM = 1; // conexões off / diretas / cadeia
	const MIN_GAP_REM = 1.25; // mínimo no modo "todas"
	const MAX_GAP_REM = 5.5; // teto no modo "todas" (densidade alta)
	const GAP_PER_CONNECTION = 0.28; // rem extra por conexão na coluna

	let verticalGap = $derived.by(() => {
		if (store.state.connectionMode !== 'all') return `${BASE_GAP_REM}rem`;

		const density = store.connectionDensityBySemester.get(semester) ?? 0;
		const gap = Math.min(MAX_GAP_REM, Math.max(MIN_GAP_REM, MIN_GAP_REM + density * GAP_PER_CONNECTION));
		return `${gap}rem`;
	});

	function codeConcluido(codigo: string, completed: Set<string>): boolean {
		const u = codigo.trim().toUpperCase();
		for (const c of completed) {
			if (c.trim().toUpperCase() === u) return true;
		}
		return false;
	}

	// Badge: horas/créditos do semestre (exigido e realizado), inclui optativas planejadas na coluna
	const stats = $derived.by(() => {
		void store.diagramLayoutRevision;
		void store.userFluxograma;
		const completed = store.completedCodes;
		const totalCredits =
			subjectsVisiveis.reduce((s, m) => s + (m.creditos ?? 0), 0) +
			optPlannedVisiveis.reduce((s, o) => s + (o.materia.creditos ?? 0), 0) +
			extrasVisiveis.reduce((s, e) => s + (e.materia.creditos ?? 0), 0);
		const totalHours = Math.round(totalCredits * 15);
		const completedCredits =
			subjectsVisiveis.reduce(
				(s, m) => (codeConcluido(m.codigoMateria, completed) ? s + (m.creditos ?? 0) : s),
				0
			) +
			optPlannedVisiveis.reduce(
				(s, o) =>
					codeConcluido(o.materia.codigoMateria, completed) ? s + (o.materia.creditos ?? 0) : s,
				0
			) +
			extrasVisiveis.reduce(
				(s, e) =>
					codeConcluido(e.materia.codigoMateria, completed) ? s + (e.materia.creditos ?? 0) : s,
				0
			);
		const completedHours = Math.round(completedCredits * 15);
		return {
			totalCredits: Math.round(totalCredits * 10) / 10,
			totalHours,
			completedCredits: Math.round(completedCredits * 10) / 10,
			completedHours
		};
	});

	const displayUnit = $derived(store.state.displayUnit);
	const badgeLabel = $derived.by(() => {
		if (displayUnit === 'creditos') {
			const ex = stats.totalCredits;
			const re = stats.completedCredits;
			if (store.state.isAnonymous || !store.userFluxograma) return `${ex}cr`;
			return `${re} / ${ex}cr`;
		}
		const ex = stats.totalHours;
		const re = stats.completedHours;
		if (store.state.isAnonymous || !store.userFluxograma) return `${ex}h`;
		return `${re} / ${ex}h`;
	});
</script>

<div
	data-semester={semester}
	class="semester-column flex w-[220px] shrink-0 snap-start scroll-ml-4 flex-col gap-3 [container-type:inline-size] sm:w-[240px]"
>
	<!-- sticky funciona porque o zoom (CSS zoom) não cria containing block como transform criava -->
	<div
		class="sticky top-0 z-10 rounded-[10px] border border-primary/35 px-3 py-1.5 text-center"
		style="background: hsl(var(--primary) / 0.18); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 12px hsl(var(--primary) / 0.15);"
	>
		<span class="text-[length:clamp(12px,5.8cqw,14px)] font-bold uppercase tracking-wider text-foreground/95">
			{headerLabel ?? `Semestre ${semester}`}
		</span>
	</div>

	<!-- Badge: horas/créditos no topo (menos transparência para fácil leitura) -->
	{#if subjectsVisiveis.length > 0 || optPlannedVisiveis.length > 0 || extrasVisiveis.length > 0}
		<div
			class="flex justify-center rounded-lg border border-border bg-foreground/5 px-2 py-1.5 text-center shadow-sm backdrop-blur-sm"
			title={displayUnit === 'creditos'
				? `${stats.completedCredits} de ${stats.totalCredits} créditos do semestre`
				: `${stats.completedHours} de ${stats.totalHours}h do semestre`}
		>
			<span class="text-[length:clamp(12px,5.6cqw,13.5px)] font-semibold text-foreground/90">{badgeLabel}</span>
		</div>
	{/if}

	<div class="flex flex-col" style="gap: {verticalGap}; transition: gap 0.3s ease;">
		{#each subjectsVisiveis as materia (materia.idMateria)}
			<SubjectCard
				{materia}
				onOpenDetails={() => onSubjectClick?.(materia)}
				onOpenChain={() => onSubjectOpenChain?.(materia)}
				onlongpress={() => onSubjectLongPress?.(materia)}
			/>
		{/each}
		{#each optPlannedVisiveis as opt (`opt-${opt.materia.codigoMateria}-${semester}`)}
			<SubjectCard
				materia={opt.materia}
				showOptBadge={true}
				onOpenDetails={() => onSubjectClick?.(opt.materia)}
				onOpenChain={() => onSubjectOpenChain?.(opt.materia)}
				onlongpress={() => onSubjectLongPress?.(opt.materia)}
			/>
		{/each}
		<!-- Optativas/eletivas do histórico (cursadas, cursando ou aproveitadas) -->
		{#each extrasVisiveis as extra (`extra-${extra.materia.codigoMateria}-${extra.dados.anoPeriodo ?? 'cump'}-${semester}`)}
			<SubjectCard
				materia={extra.materia}
				showOptBadge={true}
				onOpenDetails={() => onSubjectClick?.(extra.materia)}
				onOpenChain={() => onSubjectOpenChain?.(extra.materia)}
				onlongpress={() => onSubjectLongPress?.(extra.materia)}
			/>
		{/each}
	</div>
</div>
