<script lang="ts">
	import { X, Search } from 'lucide-svelte';
	import { portal } from '$lib/actions/portal';
	import type { DadosFluxogramaUser, DadosMateria } from '$lib/types/user';
	import { isMateriaAprovada } from '$lib/types/user';
	import type { MateriaModel } from '$lib/types/materia';
	import { isOptativa } from '$lib/types/materia';

	interface Props {
		dadosFluxograma: DadosFluxogramaUser;
		materiasCurso?: MateriaModel[];
		equivalenciasSimulacao?: Array<{
			origem: string;
			nomeOrigem: string;
			categoriaNaMatriz: 'obrigatoria' | 'optativa' | 'fora_da_matriz';
			materiasQueSatisfizeram: string[];
			viaCadeia: boolean;
			expressao: string | null;
		}>;
		mostrarEquivalenciasSimulacao?: boolean;
		onclose: () => void;
	}

	type MateriaConcluidaItem = {
		codigoMateria: string;
		/** Nome resolvido pela matriz do curso (null quando fora da matriz). */
		nomeMateria: string | null;
		status: string;
		mencao: string;
		anoPeriodo: string;
		categoria: 'obrigatoria' | 'optativa' | 'sem_categoria';
		fonte: 'historico' | 'simulacao';
		viaEquivalencia: boolean;
		codigoEquivalente: string | null;
		nomeEquivalente: string | null;
		materiasQueSatisfizeram?: string[];
		viaCadeia?: boolean;
		orderIndex: number;
	};

	let {
		dadosFluxograma,
		materiasCurso = [],
		equivalenciasSimulacao = [],
		mostrarEquivalenciasSimulacao = false,
		onclose
	}: Props = $props();
	let searchQuery = $state('');

	function parseAnoPeriodo(v: string | null | undefined): { ano: number; periodo: number } | null {
		const s = String(v ?? '').trim();
		const m = s.match(/^(\d{4})\.(\d)$/);
		if (!m) return null;
		return { ano: Number(m[1]), periodo: Number(m[2]) };
	}

	function compararAnoPeriodo(a: string, b: string): number {
		const pa = parseAnoPeriodo(a);
		const pb = parseAnoPeriodo(b);
		if (pa && pb) {
			if (pa.ano !== pb.ano) return pa.ano - pb.ano;
			return pa.periodo - pb.periodo;
		}
		if (pa && !pb) return 1;
		if (!pa && pb) return -1;
		return 0;
	}

	function buildConcluidas(dados: DadosFluxogramaUser, materias: MateriaModel[]): MateriaConcluidaItem[] {
		const categoriaByCode = new Map<string, 'obrigatoria' | 'optativa'>();
		const nomeByCode = new Map<string, string>();
		for (const m of materias) {
			const cod = String(m.codigoMateria ?? '').trim().toUpperCase();
			if (!cod) continue;
			categoriaByCode.set(cod, isOptativa(m) ? 'optativa' : 'obrigatoria');
			const nome = String(m.nomeMateria ?? '').trim();
			if (nome) nomeByCode.set(cod, nome);
		}
		const byCode = new Map<string, MateriaConcluidaItem>();
		let orderIndex = 0;
		for (const semestre of dados.dadosFluxograma) {
			for (const materia of semestre) {
				const item = materia as DadosMateria;
				if (!isMateriaAprovada(item)) continue;
				const codigoMateria = String(item.codigoMateria ?? '').trim().toUpperCase();
				if (!codigoMateria) continue;

				const codigoEquivalenteRaw = String(item.codigoEquivalente ?? '').trim();
				const nomeEquivalenteRaw = String(item.nomeEquivalente ?? '').trim();
				const viaEquivalencia =
					String(item.tipoDado ?? '').toLowerCase() === 'equivalencia' ||
					(codigoEquivalenteRaw !== '' && codigoEquivalenteRaw.toUpperCase() !== codigoMateria) ||
					nomeEquivalenteRaw !== '';

				const candidato: MateriaConcluidaItem = {
					codigoMateria,
					nomeMateria: nomeByCode.get(codigoMateria) ?? null,
					status: String(item.status ?? '').trim().toUpperCase() || '-',
					mencao: String(item.mencao ?? '-').trim().toUpperCase() || '-',
					anoPeriodo: String(item.anoPeriodo ?? '').trim(),
					categoria: categoriaByCode.get(codigoMateria) ?? 'sem_categoria',
					fonte: 'historico',
					viaEquivalencia,
					codigoEquivalente: codigoEquivalenteRaw || null,
					nomeEquivalente: nomeEquivalenteRaw || null,
					orderIndex: orderIndex++
				};

				const atual = byCode.get(codigoMateria);
				if (!atual) {
					byCode.set(codigoMateria, candidato);
					continue;
				}

				const cmpPeriodo = compararAnoPeriodo(atual.anoPeriodo, candidato.anoPeriodo);
				const substituir = cmpPeriodo < 0 || (cmpPeriodo === 0 && candidato.orderIndex > atual.orderIndex);
				if (substituir) byCode.set(codigoMateria, candidato);
			}
		}

		return [...byCode.values()].sort((a, b) => a.codigoMateria.localeCompare(b.codigoMateria, 'pt-BR'));
	}

	let concluidas = $derived(buildConcluidas(dadosFluxograma, materiasCurso));
	let concluidasFiltradas = $derived.by(() => {
		const q = searchQuery.trim().toUpperCase();
		if (!q) return concluidas;
		return concluidas.filter((m) => {
			const base = `${m.codigoMateria} ${m.nomeMateria ?? ''} ${m.codigoEquivalente ?? ''} ${m.nomeEquivalente ?? ''}`.toUpperCase();
			return base.includes(q);
		});
	});
	let equivalenciasSimulacaoFiltradas = $derived.by(() => {
		if (!mostrarEquivalenciasSimulacao) return [];
		const q = searchQuery.trim().toUpperCase();
		if (!q) return equivalenciasSimulacao;
		return equivalenciasSimulacao.filter((e) => {
			const base = `${e.origem} ${e.nomeOrigem ?? ''} ${(e.materiasQueSatisfizeram ?? []).join(' ')} ${e.expressao ?? ''}`.toUpperCase();
			return base.includes(q);
		});
	});
	let simulacaoComoItens = $derived.by((): MateriaConcluidaItem[] => {
		if (!mostrarEquivalenciasSimulacao) return [];
		return equivalenciasSimulacaoFiltradas
			.map((e) => ({
				codigoMateria: String(e.origem ?? '').trim().toUpperCase(),
				nomeMateria: String(e.nomeOrigem ?? '').trim() || null,
				status: 'APR',
				mencao: '-',
				anoPeriodo: '',
				categoria:
					e.categoriaNaMatriz === 'obrigatoria'
						? 'obrigatoria'
						: e.categoriaNaMatriz === 'optativa'
							? 'optativa'
							: 'sem_categoria',
				fonte: 'simulacao' as const,
				viaEquivalencia: true,
				codigoEquivalente: null,
				nomeEquivalente: null,
				materiasQueSatisfizeram: [...(e.materiasQueSatisfizeram ?? [])],
				viaCadeia: !!e.viaCadeia,
				orderIndex: 0
			}));
	});
	let itensCombinados = $derived.by(() => {
		const byCode = new Map<string, MateriaConcluidaItem>();
		for (const item of concluidasFiltradas) {
			byCode.set(item.codigoMateria, { ...item });
		}
		for (const sim of simulacaoComoItens) {
			const atual = byCode.get(sim.codigoMateria);
			if (!atual) {
				byCode.set(sim.codigoMateria, { ...sim });
				continue;
			}
			// Se já existe no histórico, preserva status/menção/ano e adiciona o rastro da equivalência da simulação.
			byCode.set(sim.codigoMateria, {
				...atual,
				viaEquivalencia: true,
				materiasQueSatisfizeram:
					(sim.materiasQueSatisfizeram && sim.materiasQueSatisfizeram.length > 0)
						? [...sim.materiasQueSatisfizeram]
						: atual.materiasQueSatisfizeram,
				viaCadeia: sim.viaCadeia ?? atual.viaCadeia
			});
		}
		return [...byCode.values()].sort((a, b) => a.codigoMateria.localeCompare(b.codigoMateria, 'pt-BR'));
	});
	let totalPorEquivalencia = $derived(concluidas.filter((m) => m.viaEquivalencia).length);
	let obrigatorias = $derived(itensCombinados.filter((m) => m.categoria === 'obrigatoria'));
	let optativas = $derived(itensCombinados.filter((m) => m.categoria === 'optativa'));
	let semCategoria = $derived(itensCombinados.filter((m) => m.categoria === 'sem_categoria'));
	let temResultadosConcluidas = $derived(itensCombinados.length > 0);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	use:portal
	class="fixed inset-0 z-[5600] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onclose()}
>
	<div class="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-nofluxoLg backdrop-blur-xl dark:bg-gray-900/95 dark:shadow-2xl">
		<div class="flex items-center justify-between border-b border-fuchsia-400/30 bg-gradient-to-r from-fuchsia-600/25 via-purple-600/20 to-cyan-600/20 px-4 py-3 sm:px-6">
			<div>
				<h2 class="text-base font-bold text-foreground sm:text-lg">Materias concluidas do usuario</h2>
				<p class="text-xs text-foreground/70">
					Total: {concluidas.length} · Por equivalencia: {totalPorEquivalencia}
				</p>
			</div>
			<button
				type="button"
				onclick={onclose}
				class="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-foreground/70 transition-colors hover:bg-foreground/20 hover:text-foreground"
				aria-label="Fechar"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<div class="border-b border-border bg-foreground/[0.02] px-4 py-3 sm:px-6">
			<div class="relative">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="search"
					placeholder="Buscar por codigo ou equivalencia..."
					bind:value={searchQuery}
					class="w-full rounded-lg border border-border-strong bg-foreground/5 py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-cyan-500/40 dark:placeholder:text-foreground/40"
				/>
			</div>
		</div>

		<div class="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-6">
			{#if !temResultadosConcluidas}
				<p class="py-8 text-center text-sm text-muted-foreground">Nenhuma materia concluida para exibir na busca atual.</p>
			{:else}
				<section class="space-y-2">
						<div class="flex items-center justify-between rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
							<h3 class="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Obrigatorias</h3>
							<span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:text-emerald-100">{obrigatorias.length}</span>
						</div>
						{#if obrigatorias.length === 0}
							<p class="px-1 text-xs text-muted-foreground">Nenhuma obrigatoria concluida na lista filtrada.</p>
						{:else}
							<div class="space-y-2">
								{#each obrigatorias as materia (materia.codigoMateria)}
									<div class="rounded-lg border border-emerald-400/25 bg-gradient-to-r from-emerald-500/10 to-transparent px-3 py-2.5">
										<div class="flex flex-wrap items-center justify-between gap-2">
											<div class="min-w-0">
												{#if materia.nomeMateria}
													<p class="text-sm font-semibold text-foreground" title={materia.codigoMateria}>{materia.nomeMateria}</p>
													<p class="font-mono text-[11px] text-muted-foreground">{materia.codigoMateria}</p>
												{:else}
													<p class="font-mono text-sm font-semibold text-foreground">{materia.codigoMateria}</p>
												{/if}
												<p class="text-xs text-muted-foreground">
													{materia.status}
													{#if materia.mencao !== '-'}
														· mencao {materia.mencao}
													{/if}
													{#if materia.anoPeriodo}
														· {materia.anoPeriodo}
													{/if}
													{#if materia.fonte === 'simulacao'}
														· simulação
													{/if}
												</p>
											</div>
											{#if materia.viaEquivalencia}
												<span class="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-800 dark:text-cyan-200">
													Equivalencia
												</span>
											{/if}
										</div>
										{#if materia.viaEquivalencia}
											<p class="mt-1 text-xs text-cyan-900 dark:text-cyan-100/85">
												{#if materia.fonte === 'simulacao' || (materia.materiasQueSatisfizeram ?? []).length > 0}
													Concluida por equivalencia:
													{#if (materia.materiasQueSatisfizeram ?? []).length > 0}
														{#each materia.materiasQueSatisfizeram ?? [] as m, i}
															<span class="font-mono">{m}</span>{i < (materia.materiasQueSatisfizeram?.length ?? 0) - 1 ? ' / ' : ''}
														{/each}
													{:else}
														<span class="text-muted-foreground">sem rastreio de materia</span>
													{/if}
													{#if materia.viaCadeia}
														<span class="ml-1 rounded-full border border-amber-400/35 bg-amber-500/15 px-1.5 py-[1px] text-[10px] text-amber-900 dark:text-amber-100">cadeia</span>
													{/if}
												{:else}
													Concluida por equivalencia
													{#if materia.codigoEquivalente}
														: <span class="font-mono">{materia.codigoEquivalente}</span>
													{/if}
													{#if materia.nomeEquivalente}
														<span> · {materia.nomeEquivalente}</span>
													{/if}
												{/if}
											</p>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
				</section>

				<section class="space-y-2">
						<div class="flex items-center justify-between rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2">
							<h3 class="text-sm font-semibold text-violet-800 dark:text-violet-200">Optativas</h3>
							<span class="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-900 dark:text-violet-100">{optativas.length}</span>
						</div>
						{#if optativas.length === 0}
							<p class="px-1 text-xs text-muted-foreground">Nenhuma optativa concluida na lista filtrada.</p>
						{:else}
							<div class="space-y-2">
								{#each optativas as materia (materia.codigoMateria)}
									<div class="rounded-lg border border-violet-400/25 bg-gradient-to-r from-violet-500/10 to-transparent px-3 py-2.5">
										<div class="flex flex-wrap items-center justify-between gap-2">
											<div class="min-w-0">
												{#if materia.nomeMateria}
													<p class="text-sm font-semibold text-foreground" title={materia.codigoMateria}>{materia.nomeMateria}</p>
													<p class="font-mono text-[11px] text-muted-foreground">{materia.codigoMateria}</p>
												{:else}
													<p class="font-mono text-sm font-semibold text-foreground">{materia.codigoMateria}</p>
												{/if}
												<p class="text-xs text-muted-foreground">
													{materia.status}
													{#if materia.mencao !== '-'}
														· mencao {materia.mencao}
													{/if}
													{#if materia.anoPeriodo}
														· {materia.anoPeriodo}
													{/if}
													{#if materia.fonte === 'simulacao'}
														· simulação
													{/if}
												</p>
											</div>
											{#if materia.viaEquivalencia}
												<span class="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-800 dark:text-cyan-200">
													Equivalencia
												</span>
											{/if}
										</div>
										{#if materia.viaEquivalencia}
											<p class="mt-1 text-xs text-cyan-900 dark:text-cyan-100/85">
												{#if materia.fonte === 'simulacao' || (materia.materiasQueSatisfizeram ?? []).length > 0}
													Concluida por equivalencia:
													{#if (materia.materiasQueSatisfizeram ?? []).length > 0}
														{#each materia.materiasQueSatisfizeram ?? [] as m, i}
															<span class="font-mono">{m}</span>{i < (materia.materiasQueSatisfizeram?.length ?? 0) - 1 ? ' / ' : ''}
														{/each}
													{:else}
														<span class="text-muted-foreground">sem rastreio de materia</span>
													{/if}
													{#if materia.viaCadeia}
														<span class="ml-1 rounded-full border border-amber-400/35 bg-amber-500/15 px-1.5 py-[1px] text-[10px] text-amber-900 dark:text-amber-100">cadeia</span>
													{/if}
												{:else}
													Concluida por equivalencia
													{#if materia.codigoEquivalente}
														: <span class="font-mono">{materia.codigoEquivalente}</span>
													{/if}
													{#if materia.nomeEquivalente}
														<span> · {materia.nomeEquivalente}</span>
													{/if}
												{/if}
											</p>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
				</section>

				{#if semCategoria.length > 0}
					<section class="space-y-2">
						<div class="flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
							<h3 class="text-sm font-semibold text-amber-800 dark:text-amber-200">Sem categoria na matriz atual</h3>
							<span class="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-100">{semCategoria.length}</span>
						</div>
						<div class="space-y-2">
							{#each semCategoria as materia (materia.codigoMateria)}
								<div class="rounded-lg border border-amber-400/25 bg-gradient-to-r from-amber-500/10 to-transparent px-3 py-2.5">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<div class="min-w-0">
											{#if materia.nomeMateria}
													<p class="text-sm font-semibold text-foreground" title={materia.codigoMateria}>{materia.nomeMateria}</p>
													<p class="font-mono text-[11px] text-muted-foreground">{materia.codigoMateria}</p>
												{:else}
													<p class="font-mono text-sm font-semibold text-foreground">{materia.codigoMateria}</p>
												{/if}
											<p class="text-xs text-muted-foreground">
													{materia.status}
													{#if materia.mencao !== '-'}
														· mencao {materia.mencao}
													{/if}
												{#if materia.anoPeriodo}
													· {materia.anoPeriodo}
												{/if}
													{#if materia.fonte === 'simulacao'}
														· simulação
													{/if}
											</p>
										</div>
										{#if materia.viaEquivalencia}
											<span class="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-800 dark:text-cyan-200">
												Equivalencia
											</span>
										{/if}
									</div>
										{#if materia.viaEquivalencia}
										<p class="mt-1 text-xs text-cyan-900 dark:text-cyan-100/85">
												{#if materia.fonte === 'simulacao' || (materia.materiasQueSatisfizeram ?? []).length > 0}
													Concluida por equivalencia:
													{#if (materia.materiasQueSatisfizeram ?? []).length > 0}
														{#each materia.materiasQueSatisfizeram ?? [] as m, i}
															<span class="font-mono">{m}</span>{i < (materia.materiasQueSatisfizeram?.length ?? 0) - 1 ? ' / ' : ''}
														{/each}
													{:else}
														<span class="text-muted-foreground">sem rastreio de materia</span>
													{/if}
													{#if materia.viaCadeia}
														<span class="ml-1 rounded-full border border-amber-400/35 bg-amber-500/15 px-1.5 py-[1px] text-[10px] text-amber-900 dark:text-amber-100">cadeia</span>
													{/if}
												{:else}
													Concluida por equivalencia
													{#if materia.codigoEquivalente}
														: <span class="font-mono">{materia.codigoEquivalente}</span>
													{/if}
													{#if materia.nomeEquivalente}
														<span> · {materia.nomeEquivalente}</span>
													{/if}
												{/if}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/if}
			{/if}
		</div>
	</div>
</div>
