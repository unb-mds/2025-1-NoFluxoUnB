<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import CourseCard from '$lib/components/fluxograma/cards/CourseCard.svelte';
	import { fluxogramaService } from '$lib/services/fluxograma.service';
	import { ROUTES } from '$lib/config/routes';
	import { goto } from '$app/navigation';
	import type { MinimalCursoModel } from '$lib/types/curso';
	import { Search, Filter, ChevronLeft, ChevronRight, Loader2, AlertTriangle, GraduationCap } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import Error from '../+error.svelte';

	// Agora cada item representa uma MATRIZ (curso + currículo).
	let courses = $state<MinimalCursoModel[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let searchQuery = $state('');
	let selectedType = $state('');
	let selectedTurno = $state('');
	let selectedStatus = $state('');
	let currentPage = $state(1);
	const perPage = 6;

	function normalizeSearchText(value: string | null | undefined): string {
		return (value ?? '')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/ç/g, 'c')
			.replace(/Ç/g, 'C')
			.toLowerCase()
			.trim()
			.replace(/\s+/g, ' ');
	}

	// Tipos de curso para o filtro (valores únicos)
	let courseTypes = $derived.by(() => {
		const types = new Set(courses.map((c) => c.tipoCurso).filter(Boolean));
		return Array.from(types).sort();
	});

	const turnoOptions = [
		{ value: '', label: 'Todos os turnos' },
		{ value: 'DIURNO', label: 'Diurno' },
		{ value: 'NOTURNO', label: 'Noturno' }
	];

	const statusOptions = [
		{ value: '', label: 'Todas as matrizes' },
		{ value: 'ATIVA', label: 'Ativas' },
		{ value: 'INATIVA', label: 'Inativas' }
	];

	// Filtered courses: busca por nome (sempre); opcional por tipo, turno e texto em currículo
	let filtered = $derived.by(() => {
		let result = courses;
		// Busca por texto: nome do curso; se tiver tipo/turno, também busca neles
		if (searchQuery.trim()) {
			const q = normalizeSearchText(searchQuery);
			result = result.filter((c) => {
				const nome = normalizeSearchText(c.nomeCurso);
				if (nome.includes(q)) return true;
				const tipo = normalizeSearchText((c.tipoCurso ?? '').toString());
				if (tipo && tipo.includes(q)) return true;
				const turno = normalizeSearchText((c.turno ?? '').toString());
				if (turno && turno.includes(q)) return true;
				const curriculo = normalizeSearchText(c.matrizCurricular ?? '');
				if (curriculo.includes(q)) return true;
				return false;
			});
		}
		if (selectedType) {
			result = result.filter((c) => (c.tipoCurso ?? '') === selectedType);
		}
		if (selectedTurno) {
			result = result.filter((c) => (c.turno ?? '').toString().toUpperCase() === selectedTurno);
		}
		if (selectedStatus) {
			result = result.filter((c) => (c.status ?? '').toString().toUpperCase() === selectedStatus);
		}
		return result;
	});

	// Pagination
	let totalPages = $derived(Math.max(1, Math.ceil(filtered.length / perPage)));
	let paginated = $derived(filtered.slice((currentPage - 1) * perPage, currentPage * perPage));

	function onSearchOrFilterChange() {
		currentPage = 1;
	}

	// onMount(async () => {
	// 	try {
	// 		// Lista TODAS as matrizes com informações de curso
	// 		courses = await fluxogramaService.getAllMatrizesIndex();
	// 	} catch (err) {
	// 		error = err instanceof Error ? err.message : 'Erro ao carregar cursos';
	// 	} finally {
	// 		loading = false;
	// 	}
	// });

	onMount(async () => {
	    try {
		    // Lista todos os cursos únicos
		    courses = await fluxogramaService.getAllCursos();
		} catch (err) {
		    error = err instanceof Error ? err.message : 'Erro ao carregar cursos';
		    console.error('FluxogramaService.getAllCursos error:', err);
		} finally {
		    loading = false;
		}
    });

	function navigateToCourse(curso: MinimalCursoModel) {
		const url = ROUTES.meuFluxograma(curso.nomeCurso);
		const params = curso.matrizCurricular
			? `?matriz=${encodeURIComponent(curso.matrizCurricular)}`
			: '';
		goto(url + params);
	}

	// Generate page numbers with ellipsis
	// Returns array of page numbers or 'ellipsis' strings
	let paginationItems = $derived.by(() => {
		const total = totalPages;
		const current = currentPage;
		const items: (number | 'ellipsis')[] = [];

		if (total <= 7) {
			// Show all pages if 7 or fewer
			for (let i = 1; i <= total; i++) items.push(i);
			return items;
		}

		// Always show first page
		items.push(1);

		if (current <= 3) {
			// Near start: 1 2 3 4 ... N-1 N
			items.push(2, 3, 4);
			items.push('ellipsis');
			items.push(total - 1, total);
		} else if (current >= total - 2) {
			// Near end: 1 2 ... N-3 N-2 N-1 N
			items.push(2);
			items.push('ellipsis');
			items.push(total - 3, total - 2, total - 1, total);
		} else {
			// Middle: 1 ... N-1 N N+1 ... X
			items.push('ellipsis');
			items.push(current - 1, current, current + 1);
			items.push('ellipsis');
			items.push(total);
		}

		return items;
	});
</script>

<PageMeta
	title="Fluxogramas"
	description="Explore os fluxogramas de cursos disponíveis na UnB"
/>

<PageBackground />

<div
	class="relative z-10 container mx-auto min-w-0 max-w-6xl overflow-x-hidden px-3 pb-6 pt-3 sm:px-4 sm:pb-8 sm:pt-4"
>
	<!-- Header -->
	<div class="mb-4 sm:mb-6">
		<h1 class="text-xl font-bold text-foreground sm:text-2xl">Fluxogramas</h1>
		<p class="text-sm text-foreground/80 sm:text-base">Explore e selecione o fluxograma do seu curso.</p>
	</div>

	<!-- Search and Filter -->
	<div class="mb-6 flex flex-col gap-3 sm:flex-row">
		<div class="relative flex-1">
			<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<input
				type="text"
				bind:value={searchQuery}
				oninput={onSearchOrFilterChange}
				placeholder="Buscar por nome, tipo (ex.: Bacharelado) ou turno (Diurno/Noturno)..."
				class="w-full rounded-xl border border-border-strong bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground backdrop-blur-md outline-none focus:border-ring/50 focus:ring-1 focus:ring-ring/30 dark:bg-background/80 dark:placeholder:text-foreground/40"
			/>
		</div>

		{#if courseTypes.length > 0 || turnoOptions.length > 1}
			<div class="flex flex-wrap gap-3">
				{#if courseTypes.length > 0}
					<div class="relative w-full sm:w-auto">
						<Filter class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<select
							aria-label="Filtrar por tipo de curso"
							bind:value={selectedType}
							onchange={onSearchOrFilterChange}
							class="w-full appearance-none rounded-xl border border-border-strong bg-card py-2.5 pl-10 pr-8 text-sm text-foreground backdrop-blur-md outline-none focus:border-ring/50 focus:ring-1 focus:ring-ring/30 dark:bg-background/80 sm:w-auto"
						>
							<option value="">Todos os tipos</option>
							{#each courseTypes as type}
								<option value={type}>{type}</option>
							{/each}
						</select>
					</div>
				{/if}
				<select
					aria-label="Filtrar por turno"
					bind:value={selectedTurno}
					onchange={onSearchOrFilterChange}
					class="w-full appearance-none rounded-xl border border-border-strong bg-card py-2.5 pl-4 pr-8 text-sm text-foreground backdrop-blur-md outline-none focus:border-ring/50 focus:ring-1 focus:ring-ring/30 dark:bg-background/80 sm:w-auto"
				>
					{#each turnoOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
				
				<select
					aria-label="Filtrar por situação da matriz"
					bind:value={selectedStatus}
					onchange={onSearchOrFilterChange}
					class="w-full appearance-none rounded-xl border border-border-strong bg-card py-2.5 pl-4 pr-8 text-sm text-foreground backdrop-blur-md outline-none focus:border-ring/50 focus:ring-1 focus:ring-ring/30 dark:bg-background/80 sm:w-auto"
				>
					{#each statusOptions as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	<!-- Content -->
	{#if loading}
		<!-- Loading skeleton -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<div class="animate-pulse rounded-2xl border border-border bg-card p-5 backdrop-blur-md dark:bg-background/80">
					<div class="mb-3 flex items-start justify-between">
						<div class="h-10 w-10 rounded-xl bg-foreground/10"></div>
						<div class="h-5 w-16 rounded-full bg-foreground/10"></div>
					</div>
					<div class="mb-2 h-4 w-3/4 rounded bg-foreground/10"></div>
					<div class="h-3 w-1/2 rounded bg-foreground/10"></div>
				</div>
			{/each}
		</div>
	{:else if error}
		<div class="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center backdrop-blur-md">
			<AlertTriangle class="mx-auto mb-3 h-8 w-8 text-red-700 dark:text-red-400" />
			<h2 class="mb-2 text-lg font-semibold text-foreground">Erro ao carregar cursos</h2>
			<p class="text-sm text-red-700 dark:text-red-300/80">{error}</p>
		</div>
	{:else if filtered.length === 0}
		<div class="rounded-2xl border border-border bg-card p-8 text-center backdrop-blur-md dark:bg-background/80">
			<GraduationCap class="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
			<h2 class="mb-2 text-lg font-semibold text-foreground">Nenhum curso encontrado</h2>
			<p class="text-sm text-muted-foreground">Tente alterar os filtros de busca.</p>
		</div>
	{:else}
		<!-- Course grid -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each paginated as curso, i (`${curso.idCurso ?? 'curso'}-${curso.matrizCurricular ?? ''}-${i}`)}
				<CourseCard {curso} onclick={() => navigateToCourse(curso)} />
			{/each}
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="mt-6 flex items-center justify-center gap-1 sm:gap-2">
				<button
					onclick={() => (currentPage = Math.max(1, currentPage - 1))}
					disabled={currentPage <= 1}
					aria-label="Página anterior"
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-30 dark:bg-background/80 dark:hover:bg-foreground/10 disabled:cursor-not-allowed"
				>
					<ChevronLeft class="h-4 w-4" />
				</button>

				{#each paginationItems as item, idx}
					{#if item === 'ellipsis'}
						<span class="flex h-9 w-6 items-center justify-center text-muted-foreground">…</span>
					{:else}
						<button
							onclick={() => (currentPage = item)}
							aria-label={`Página ${item}`}
							aria-current={currentPage === item ? 'page' : undefined}
							class="flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors {currentPage === item ? 'border-primary/50 bg-primary/20 text-accent-foreground dark:text-purple-300' : 'border-border bg-card text-muted-foreground hover:bg-foreground/10 hover:text-foreground dark:bg-background/80 dark:hover:bg-foreground/10'}"
						>
							{item}
						</button>
					{/if}
				{/each}

				<button
					onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
					disabled={currentPage >= totalPages}
					aria-label="Próxima página"
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-30 dark:bg-background/80 dark:hover:bg-foreground/10 disabled:cursor-not-allowed"
				>
					<ChevronRight class="h-4 w-4" />
				</button>
			</div>
		{/if}

		<p class="mt-3 text-center text-xs text-muted-foreground">
			Mostrando {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} de {filtered.length} curso{filtered.length !== 1 ? 's' : ''}
		</p>
	{/if}
</div>
