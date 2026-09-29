<script lang="ts">
	import type { MateriaModel } from '$lib/types/materia';
	import type { CursoModel } from '$lib/types/curso';
	import type { EquivalenciaModel } from '$lib/types/equivalencia';
	import { getDirectPrerequisites, getCorequisites } from '$lib/types/curso';
	import { getStatusLabel, isOptativa, type SubjectStatusValue, SubjectStatusEnum } from '$lib/types/materia';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { X, BookOpen, GitBranch, GraduationCap, Repeat2, Loader2, Trash2, CalendarClock } from 'lucide-svelte';
		import { portal } from '$lib/actions/portal';
import { ROUTES } from '$lib/config/routes';
	import { formatLocalSigaa, formatVagas, horarioLegivel } from '$lib/utils/sigaa';
	import { getPrereqDisplay } from '$lib/utils/prereq-display';
	import ManualStatusEditor from './ManualStatusEditor.svelte';
	import SubjectClassesTab from './SubjectClassesTab.svelte';

	interface Props {
		materia: MateriaModel;
		courseData: CursoModel;
		onclose?: () => void;
	}

	let { materia, courseData, onclose }: Props = $props();

	let activeTab = $state<'info' | 'prereqs' | 'equivalencias' | 'turmas'>('info');
	let removendoPlanejada = $state(false);

	const store = fluxogramaStore;

	let status = $derived(store.getSubjectStatus(materia));
	let optativaPlanejada = $derived.by(() => {
		void store.diagramLayoutRevision;
		return store.isOptativaPlanejada(materia.codigoMateria);
	});
	let userData = $derived(store.getSubjectUserData(materia.codigoMateria));
	let prereqs = $derived(getDirectPrerequisites(courseData, materia.codigoMateria));
	let coreqs = $derived(getCorequisites(courseData, materia.codigoMateria));

	/** Pré-requisitos desta matéria (com expressao_original e expressao_logica para exibição). */
	let prereqModels = $derived.by(() =>
		courseData.preRequisitos.filter((pr) => pr.idMateria === materia.idMateria)
	);

	let equivalencias = $derived.by(() => {
		return courseData.equivalencias.filter(
			(eq) => eq.codigoMateriaOrigem === materia.codigoMateria
		);
	});

	const statusGradientMap: Record<SubjectStatusValue, string> = {
		[SubjectStatusEnum.COMPLETED]: 'from-green-500/20 to-green-700/10',
		[SubjectStatusEnum.IN_PROGRESS]: 'from-purple-500/20 to-purple-700/10',
		[SubjectStatusEnum.AVAILABLE]: 'from-amber-500/20 to-amber-700/10',
		[SubjectStatusEnum.FAILED]: 'from-red-500/20 to-red-700/10',
		[SubjectStatusEnum.LOCKED]: 'from-gray-500/20 to-gray-700/10',
		[SubjectStatusEnum.NOT_STARTED]: 'from-gray-500/20 to-gray-700/10'
	};

	const statusDotColor: Record<SubjectStatusValue, string> = {
		[SubjectStatusEnum.COMPLETED]: 'bg-green-500',
		[SubjectStatusEnum.IN_PROGRESS]: 'bg-purple-500',
		[SubjectStatusEnum.AVAILABLE]: 'bg-amber-500',
		[SubjectStatusEnum.FAILED]: 'bg-red-500',
		[SubjectStatusEnum.LOCKED]: 'bg-gray-500',
		[SubjectStatusEnum.NOT_STARTED]: 'bg-gray-500'
	};

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose?.();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose?.();
	}

	const tabs = [
		{ id: 'info' as const, label: 'Info', icon: BookOpen },
		{ id: 'prereqs' as const, label: 'Pré-requisitos', icon: GitBranch },
		{ id: 'equivalencias' as const, label: 'Equivalências', icon: Repeat2 },
		{ id: 'turmas' as const, label: 'Turmas', icon: CalendarClock }
	];
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	use:portal
	class="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4"
	onclick={handleBackdropClick}
>
	<div
		class="relative max-h-[90dvh] w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-gray-900/95 shadow-2xl backdrop-blur-xl sm:max-h-[85dvh] sm:rounded-2xl"
		role="dialog"
		aria-modal="true"
		aria-label="Detalhes da matéria"
	>
		<!-- Header -->
		<div class="bg-gradient-to-r {statusGradientMap[status]} border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
			<div class="flex items-start justify-between gap-2 sm:gap-3">
				<div class="min-w-0 flex-1">
					<div class="mb-1 flex items-center gap-2">
						<span class="text-xs font-semibold uppercase tracking-wider text-white/60">
							{materia.codigoMateria}
						</span>
						<div class="flex items-center gap-1.5">
							<div class="h-2 w-2 rounded-full {statusDotColor[status]}"></div>
							<span class="text-xs text-white/60">{getStatusLabel(status)}</span>
						</div>
					</div>
					<h2 class="text-base font-bold text-white sm:text-lg">{materia.nomeMateria}</h2>
					<p class="mt-1 text-sm text-white/50">{materia.creditos > 0 ? `${materia.creditos} créditos` : 'Créditos não informados'}</p>
					{#if materia.idMateria < 0}
						<!-- Componente fora da matriz (monitoria, eletiva de outro curso). -->
						<span
							class="mt-2 inline-block rounded-full bg-teal-500/25 px-2.5 py-0.5 text-xs font-medium text-teal-200"
						>
							Módulo livre: cursada fora da matriz do curso
						</span>
					{:else if isOptativa(materia)}
						{@const exigidaPor =
							fluxogramaStore.optatorias.get(materia.codigoMateria.trim().toUpperCase()) ?? []}
						{#if exigidaPor.length > 0}
							{@const nomeDe = (cod: string) =>
								courseData.materias.find(
									(m) => m.codigoMateria.trim().toUpperCase() === cod.trim().toUpperCase()
								)?.nomeMateria ?? cod}
							<div class="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2">
								<p class="text-xs font-semibold uppercase tracking-wider text-amber-300">
									Optatória
								</p>
								<p class="mt-1 text-xs leading-relaxed text-white/80">
									No SIGAA ela consta como <strong>optativa</strong>, mas é pré-requisito de
									{#each exigidaPor as cod, i (cod)}{#if i > 0},
										{/if}<strong
											class="cursor-help underline decoration-dotted underline-offset-2"
											title={cod}>{nomeDe(cod)}</strong
										>{/each}. Na prática, você vai precisar cursá-la para avançar nas
									obrigatórias.
								</p>
							</div>
						{:else}
							<span
								class="mt-2 inline-block rounded-full bg-purple-500/25 px-2.5 py-0.5 text-xs font-medium text-purple-200"
							>
								Optativa: conta para a carga horária optativa
							</span>
						{/if}
					{/if}
				</div>
				<button
					onclick={onclose}
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
					aria-label="Fechar"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			{#if userData}
				<div class="mt-3 space-y-2">
					{#if userData.tipoDado === 'equivalencia'}
						{@const cursandoEquiv = String(userData.status ?? '').toUpperCase() === 'MATR'}
						<div class="rounded-lg border border-purple-400/40 bg-purple-500/10 px-3 py-2">
							<p class="text-xs font-semibold uppercase tracking-wider text-purple-300">
								{cursandoEquiv ? 'Cursando por equivalência' : 'Concluída por equivalência'}
							</p>
							{#if userData.codigoEquivalente || userData.nomeEquivalente}
								<p class="mt-1 text-sm text-white/80">
									{cursandoEquiv ? 'Cursando como' : 'Cursada como'}: {userData.codigoEquivalente ??
										''}
									{userData.nomeEquivalente ? `— ${userData.nomeEquivalente}` : ''}
								</p>
							{/if}
							{#if userData.anoPeriodo}
								<p class="mt-0.5 text-xs text-white/50">Período: {userData.anoPeriodo}</p>
							{/if}
						</div>
					{:else if String(userData.status ?? '').toUpperCase() === 'CUMP'}
						<!-- Aproveitamento de estudos: o SIGAA registra CUMP sem período/menção —
						     tipicamente disciplina aproveitada de outra instituição ou curso. -->
						<div class="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2">
							<p class="text-xs font-semibold uppercase tracking-wider text-emerald-300">
								Aproveitamento de estudos
							</p>
							<p class="mt-1 text-sm text-white/80">
								Componente ganho por aproveitamento, cursado em outra instituição ou curso e
								aceito pela UnB.
							</p>
						</div>
					{/if}
					<div class="flex flex-wrap gap-2">
						{#if userData.status && userData.status !== '-'}
							<span class="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
								Status (SIGAA): {userData.status}
							</span>
						{/if}
						{#if userData.anoPeriodo && userData.anoPeriodo !== '-'}
							<span class="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
								Semestre cursado: {userData.anoPeriodo}
							</span>
						{/if}
						{#if userData.mencao && userData.mencao !== '-'}
							<span class="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
								Menção: {userData.mencao}
							</span>
						{/if}
						{#if userData.frequencia != null && Number(userData.frequencia) > 0}
							<span class="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
								Frequência: {userData.frequencia}%
							</span>
						{/if}
						{#if userData.professor && userData.professor !== '-'}
							<span class="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/80">
								Prof: {userData.professor}
							</span>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Tabs -->
		<div class="flex border-b border-white/10">
			{#each tabs as tab}
				<button
					onclick={() => (activeTab = tab.id)}
					class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors {activeTab === tab.id ? 'border-b-2 border-purple-400 text-purple-300' : 'text-white/50 hover:text-white/80'}"
				>
					<tab.icon class="h-3.5 w-3.5" />
					{tab.label}
				</button>
			{/each}
		</div>

		<!-- Tab content -->
		<div class="custom-scrollbar max-h-[50vh] overflow-y-auto px-6 py-4 [scrollbar-width:thin]">
			{#if activeTab === 'info'}
				<div class="space-y-4">
					{#if materia.ementa}
						<div>
							<h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
								Ementa
							</h3>
							<p class="text-sm leading-relaxed text-white/80">{materia.ementa}</p>
						</div>
					{/if}

					<div class="grid grid-cols-2 gap-3">
						<div class="rounded-lg bg-white/5 p-3">
							<span class="text-xs text-white/50">Semestre</span>
							<p class="text-sm font-semibold text-white">
								{materia.nivel > 0 ? `${materia.nivel}º` : '—'}
							</p>
						</div>
						<div class="rounded-lg bg-white/5 p-3">
							<span class="text-xs text-white/50">Créditos</span>
							<p class="text-sm font-semibold text-white">{materia.creditos > 0 ? materia.creditos : '—'}</p>
						</div>
					</div>

					{#if coreqs.length > 0}
						<div>
							<h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
								Co-requisitos
							</h3>
							<div class="space-y-1">
								{#each coreqs as coreq}
									<div class="rounded-lg bg-white/5 px-3 py-2 text-sm text-white/80">
										<span class="text-white/50">{coreq.codigoMateria}</span> — {coreq.nomeMateria}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'prereqs'}
				<div class="space-y-3">
					{#if prereqModels.length === 0}
						<p class="py-4 text-center text-sm text-white/50">
							Esta matéria não possui pré-requisitos.
						</p>
					{:else}
						{#each prereqModels as pr}
							{@const display = getPrereqDisplay(pr)}
							<div class="rounded-lg bg-white/5 px-3 py-2.5">
								{#if display.kind === 'groups'}
									{@const logicGroups = display.groups}
									{#if logicGroups.length > 0}
										<div class="space-y-3">
											{#if logicGroups.length > 1}
												<p class="text-xs text-white/70">Você precisa cumprir <strong class="font-semibold text-white/95">uma das opções</strong> abaixo:</p>
											{:else}
												<p class="text-xs text-white/70">Você precisa cumprir todas as matérias desta regra:</p>
											{/if}
											<div class="flex flex-col gap-2">
												{#each logicGroups as group, i}
													<div class="rounded-xl border border-white/10 bg-black/20 p-2.5">
														{#if logicGroups.length > 1}
															<p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Opção {i + 1}</p>
														{/if}
														<div class="flex flex-wrap gap-2">
															{#each group as cod}
																{@const prereqMateria = courseData.materias.find((p) => p.codigoMateria.toUpperCase() === cod.toUpperCase())}
																{#if prereqMateria}
																	{@const prereqStatus = store.getSubjectStatus(prereqMateria)}
																	<div
																		class="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#7f9cf5]/35 bg-[#7f9cf5]/10 px-2.5 py-1 text-xs text-[#b8adff]"
																		title={cod}
																	>
																		<span class="h-1.5 w-1.5 shrink-0 rounded-full {statusDotColor[prereqStatus]}"></span>
																		<span class="min-w-0 truncate text-white/85">{prereqMateria.nomeMateria}</span>
																		<span class="hidden shrink-0 font-mono font-medium sm:inline">· {cod}</span>
																		<span class="shrink-0 text-white/50">· {getStatusLabel(prereqStatus)}</span>
																	</div>
																{:else}
																	<div class="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs text-white/80">
																		<span class="font-mono font-medium">{cod}</span>
																	</div>
																{/if}
															{/each}
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								{:else if display.kind === 'raw'}
									<!-- Regra que não se conseguiu interpretar: texto cru em vez de card vazio. -->
									<p class="font-mono text-xs text-white/70">{display.text}</p>
								{:else}
									{@const prereq = prereqs.find((p) => p.codigoMateria.toUpperCase() === display.code.toUpperCase())}
									{#if prereq}
										{@const prereqStatus = store.getSubjectStatus(prereq)}
										<div class="flex items-center gap-2 rounded-lg border border-[#7f9cf5]/35 bg-[#7f9cf5]/10 px-3 py-2 text-xs text-[#b8adff]">
											<div class="h-2.5 w-2.5 shrink-0 rounded-full {statusDotColor[prereqStatus]}"></div>
											<div class="flex-1">
												<span class="font-mono font-medium">{prereq.codigoMateria}</span>
												<span class="text-white/60"> · {prereq.nomeMateria}</span>
												<span class="ml-1 text-white/50">· {getStatusLabel(prereqStatus)}</span>
											</div>
										</div>
									{:else}
										<div class="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs text-white/80">
											<span class="font-mono font-medium">{display.code}</span>
										</div>
									{/if}
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			{:else if activeTab === 'equivalencias'}
				<div class="space-y-2">
					{#if equivalencias.length === 0}
						<p class="py-4 text-center text-sm text-white/50">
							Nenhuma equivalência registrada.
						</p>
					{:else}
						{#each equivalencias as eq}
							<div class="rounded-lg bg-white/5 px-3 py-2.5">
								<div class="flex flex-wrap items-center gap-1.5">
									{#if eq.idCurso != null || (eq.curriculo != null && eq.curriculo !== '')}
										<span class="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-300">
											Específica para seu currículo
										</span>
									{:else}
										<span class="rounded bg-cyan-500/20 px-1.5 py-0.5 text-xs font-medium text-cyan-300">
											Geral
										</span>
									{/if}
								</div>
								<p class="mt-1 text-sm font-medium text-white/90">{eq.nomeMateriaOrigem} ↔ equivalência</p>
								{#if eq.expressao}
									<p class="mt-1 text-xs text-purple-300/70">Expressão: {eq.expressao}</p>
								{/if}
								{#if eq.curriculo}
									<p class="mt-0.5 text-xs text-white/50">Currículo: {eq.curriculo}</p>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			{:else if activeTab === 'turmas'}
				<SubjectClassesTab {materia} {courseData} isActive={activeTab === 'turmas'} />
			{/if}

			<!-- Ações de edição manual e planejamento (Movido para DENTRO do scroll) -->
			{#if !store.state.isAnonymous}
				<ManualStatusEditor {materia} />
			{/if}

			{#if !store.state.isAnonymous && optativaPlanejada}
				<div class="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
					<p class="mb-2 text-center text-xs text-white/50">Disciplina planejada no fluxograma.</p>
					<button
						type="button"
						disabled={removendoPlanejada}
						onclick={async () => {
							removendoPlanejada = true;
							try {
								const ok = await store.removeOptativaPlanejada(materia.codigoMateria);
								if (ok) onclose?.();
							} finally {
								removendoPlanejada = false;
							}
						}}
						class="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/35 bg-red-500/15 px-4 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if removendoPlanejada}
							<Loader2 class="h-4 w-4 animate-spin" />
							Removendo…
						{:else}
							<Trash2 class="h-4 w-4" />
							Remover do fluxograma
						{/if}
					</button>
				</div>
			{:else if !store.state.isAnonymous && materia.idMateria > 0 && isOptativa(materia) && (status === SubjectStatusEnum.AVAILABLE || status === SubjectStatusEnum.NOT_STARTED || status === SubjectStatusEnum.LOCKED)}
				<div class="mt-4">
					<a
						href={ROUTES.PLANO_FORMATURA}
						class="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:from-purple-500 hover:to-purple-600"
					>
						<GraduationCap class="h-4 w-4" />
						Adicionar à previsão de formatura
					</a>
				</div>
			{:else if store.state.isAnonymous && optativaPlanejada}
				<div class="mt-4">
					<button
						type="button"
						onclick={() => {
							store.removeOptativa(materia.codigoMateria);
							onclose?.();
						}}
						class="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
					>
						<Trash2 class="h-4 w-4" />
						Remover do fluxograma (sessão anônima)
					</button>
				</div>
			{/if}

		</div>
	</div>
</div>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 6px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.02);
		border-radius: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 4px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.25);
	}
</style>
