<script lang="ts">
	import { onMount } from 'svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import { searchTurmas, getPeriodoAtivo, type TurmaComMateria } from '$lib/services/turmas.service';
	import { vagaAssinaturasStore } from '$lib/stores/vaga-assinaturas.store.svelte';
	import { authStore } from '$lib/stores/auth';
	import { gradeStore, slotMaskFromHorario } from '$lib/stores/grade.store.svelte';
	import {
		garantirContextoGrade,
		construirMateriasGrade,
		motivoParaNaoAdicionar,
		pendenciasPreRequisito,
		naturezaDoCodigo,
		type PendenciaPreRequisito
	} from '$lib/services/grade-pool.service';
	import PreRequisitoConfirmDialog from '$lib/components/planejamento/PreRequisitoConfirmDialog.svelte';
	import TurmaOption from '$lib/components/planejamento/TurmaOption.svelte';
	import MateriaNaturezaBadge from '$lib/components/materia/MateriaNaturezaBadge.svelte';
	import { ROUTES } from '$lib/config/routes';
	import { Search, Loader2, X, CalendarPlus, TriangleAlert, ArrowLeft } from 'lucide-svelte';

	let termo = $state('');
	let resultados = $state<TurmaComMateria[]>([]);
	let buscando = $state(false);
	let erro = $state<string | null>(null);
	let periodo = $state<string | null>(null);
	/** Termo que gerou os resultados atuais — evita mostrar "nada encontrado" antes da 1ª busca. */
	let termoBuscado = $state('');


	/** Contexto do montador pronto — até lá os cartões ficam só de leitura. */
	let gradePronta = $state(false);
	let avisoGrade = $state<string | null>(null);
	/** Códigos sendo resolvidos (busca da oferta completa) — evita clique duplo. */
	let adicionando = $state<Set<string>>(new Set());

	onMount(() => {
		void getPeriodoAtivo()
			.then((p) => (periodo = p))
			.catch(() => (periodo = null));
		if (!vagaAssinaturasStore.carregado) void vagaAssinaturasStore.load();
		// O montador precisa do pool salvo hidratado para saber o que conflita.
		void garantirContextoGrade().then((ctx) => (gradePronta = ctx !== null));
	});

	/**
	 * Põe a turma na grade (ou tira, se já for a selecionada).
	 *
	 * A matéria entra no pool com a **oferta completa** do período, não com os
	 * resultados da busca: procurar pelo nome de um professor devolve só as turmas
	 * dele, e o montador precisa de todas para conseguir rearranjar depois.
	 */
	/**
	 * Pré-requisito pendente vira confirmação antes de a matéria entrar no pool.
	 *
	 * `courseData` já está carregado aqui — `gradePronta` só vira true depois do
	 * `garantirContextoGrade()`, e é ele que libera o botão que chama esta função.
	 */
	let pendencias = $state<PendenciaPreRequisito[]>([]);
	let acaoPendente = $state<(() => Promise<void>) | null>(null);

	async function confirmarPendencias(): Promise<void> {
		const acao = acaoPendente;
		pendencias = [];
		acaoPendente = null;
		if (acao) await acao();
	}

	function descartarPendencias(): void {
		pendencias = [];
		acaoPendente = null;
	}

	async function toggleNaGrade(
		codigo: string,
		t: TurmaComMateria,
		jaConfirmado = false
	): Promise<void> {
		avisoGrade = null;
		const c = codigo.trim().toUpperCase();
		if (adicionando.has(c)) return;

		if (gradeStore.turmaSelecionada(c)?.turma.id_turmas === t.id_turmas) {
			gradeStore.removerTurma(c);
			return;
		}

		if (!gradeStore.hasMateria(c)) {
			const impedimento = motivoParaNaoAdicionar(c);
			if (impedimento) {
				avisoGrade = impedimento;
				return;
			}
			if (!jaConfirmado) {
				const p = pendenciasPreRequisito([c]);
				if (p.length > 0) {
					pendencias = p;
					// Retoma o toggle inteiro (pool + seleção da turma), não só o pool:
					// o aluno clicou numa turma específica e é ela que ele espera ver.
					acaoPendente = () => toggleNaGrade(codigo, t, true);
					return;
				}
			}
			if (!periodo) return;
			adicionando = new Set(adicionando).add(c);
			try {
				const [m] = await construirMateriasGrade([c], periodo);
				if (!m) {
					avisoGrade = `Não encontrei a matéria ${c}.`;
					return;
				}
				gradeStore.addMateriaAoPool(m);
			} catch {
				avisoGrade = `Erro ao adicionar ${c}.`;
				return;
			} finally {
				const n = new Set(adicionando);
				n.delete(c);
				adicionando = n;
			}
		}

		const r = gradeStore.selecionarTurma(c, t.id_turmas);
		if (!r.ok) {
			avisoGrade = r.conflitaCom
				? `${c} entrou no montador, mas a turma ${t.turma} conflita com ${r.conflitaCom} — use o Rearranjar ou escolha outra.`
				: `A turma ${t.turma} não está na oferta de ${c} deste período.`;
		}
	}

	// Debounce: a busca dispara sozinha enquanto o aluno digita, mas só depois da pausa.
	let debounce: ReturnType<typeof setTimeout> | null = null;
	let buscaEmVoo = 0;

	function aoDigitar(valor: string): void {
		termo = valor;
		if (debounce) clearTimeout(debounce);
		if (valor.trim().length < 2) {
			resultados = [];
			termoBuscado = '';
			erro = null;
			buscando = false;
			return;
		}
		buscando = true;
		debounce = setTimeout(() => void buscar(valor), 350);
	}

	async function buscar(valor: string): Promise<void> {
		// Respostas fora de ordem não podem sobrescrever uma busca mais nova.
		const chamada = ++buscaEmVoo;
		erro = null;
		try {
			const achados = await searchTurmas(valor);
			if (chamada !== buscaEmVoo) return;
			resultados = achados;
			termoBuscado = valor.trim();
		} catch (e) {
			if (chamada !== buscaEmVoo) return;
			erro = e instanceof Error ? e.message : 'Erro ao buscar turmas.';
			resultados = [];
		} finally {
			if (chamada === buscaEmVoo) buscando = false;
		}
	}

	function limpar(): void {
		if (debounce) clearTimeout(debounce);
		termo = '';
		termoBuscado = '';
		resultados = [];
		erro = null;
		buscando = false;
	}

	/** Resultados agrupados por matéria, preservando a ordem já vinda do serviço. */
	const porMateria = $derived.by(() => {
		const grupos = new Map<string, { codigo: string; nome: string; turmas: TurmaComMateria[] }>();
		for (const t of resultados) {
			const g = grupos.get(t.codigoMateria) ?? {
				codigo: t.codigoMateria,
				nome: t.nomeMateria,
				turmas: []
			};
			g.turmas.push(t);
			grupos.set(t.codigoMateria, g);
		}
		return [...grupos.values()];
	});

</script>

<PageMeta
	title="Buscar turmas | NoFluxo UNB"
	description="Busque na oferta do semestre por professor, horário, sala ou matéria."
	noIndex={true}
/>

<PageBackground />

<div class="relative z-10 mx-auto w-full max-w-4xl px-3 py-5 sm:px-5 sm:py-6">
	<header class="mb-4">
		<a
			href={ROUTES.MONTADOR_GRADE}
			class="mb-3 inline-flex touch-manipulation items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground/80"
		>
			<ArrowLeft class="h-3.5 w-3.5" /> Voltar ao montador
		</a>
		<div class="flex items-center gap-2.5">
			<Search class="h-6 w-6 shrink-0 text-ai dark:text-purple-300" />
			<div>
				<h1 class="text-lg font-bold text-foreground sm:text-xl">Buscar turmas</h1>
				<p class="text-xs text-muted-foreground">
					Procure na oferta inteira{#if periodo} de <span class="font-mono">{periodo}</span>{/if} por
					professor, horário, sala ou matéria.
				</p>
			</div>
		</div>
	</header>

	<div class="relative mb-4">
		<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70 dark:text-white/30" />
		<input
			type="search"
			value={termo}
			oninput={(e) => aoDigitar((e.currentTarget as HTMLInputElement).value)}
			placeholder="Ex.: nome do professor, 2M34, CIC0004, ICC ANF"
			aria-label="Buscar turmas por professor, horário, sala ou matéria"
			class="w-full rounded-2xl border border-border-strong bg-card py-3 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground dark:placeholder:text-white/25 dark:border-border dark:bg-background/80 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30 dark:focus:border-purple-300/45 dark:focus:ring-purple-400/30"
		/>
		{#if termo}
			<button
				type="button"
				onclick={limpar}
				aria-label="Limpar busca"
				class="absolute right-2.5 top-1/2 -translate-y-1/2 touch-manipulation rounded-lg p-1.5 text-muted-foreground/80 dark:text-white/35 transition-colors hover:bg-foreground/10 hover:text-foreground/70"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>

	{#if buscando}
		<p class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
			<Loader2 class="h-4 w-4 animate-spin" /> Procurando na oferta...
		</p>
	{:else if erro}
		<p class="rounded-2xl border border-red-300 bg-red-50 dark:border-red-300/30 dark:bg-red-500/10 px-4 py-5 text-center text-sm text-red-800 dark:text-red-200">
			{erro}
		</p>
	{:else if termo.trim().length > 0 && termo.trim().length < 2}
		<p class="py-10 text-center text-xs text-muted-foreground dark:text-white/35">Digite pelo menos 2 caracteres.</p>
	{:else if termoBuscado && resultados.length === 0}
		<p class="py-10 text-center text-sm text-muted-foreground">
			Nada encontrado para <strong class="text-foreground/70">{termoBuscado}</strong> na oferta atual.
		</p>
	{:else if resultados.length > 0}
		<p class="mb-2 text-[11px] text-muted-foreground dark:text-white/35">
			{resultados.length} turma(s) em {porMateria.length} matéria(s)
		</p>
		{#if avisoGrade}
			<div class="mb-2 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-300/30 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
				<TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
				<span>{avisoGrade}</span>
				<a href={ROUTES.MONTADOR_GRADE} class="ml-auto shrink-0 underline underline-offset-2 hover:text-foreground">
					Abrir montador
				</a>
			</div>
		{/if}
		<div class="space-y-3">
			{#each porMateria as grupo (grupo.codigo)}
				<section class="rounded-2xl border border-border bg-card dark:bg-background/80 p-3 sm:p-4">
					<header class="mb-2.5 border-b border-border pb-2">
						<p class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span class="font-mono text-sm font-semibold text-ai dark:text-purple-200">{grupo.codigo}</span>
							<span class="text-xs text-muted-foreground">{grupo.nome}</span>
							{#if gradePronta}
								<MateriaNaturezaBadge natureza={naturezaDoCodigo(grupo.codigo)} />
							{/if}
						</p>
						{#if gradePronta}
							<p class="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground dark:text-white/35">
								<CalendarPlus class="h-3 w-3 shrink-0" />
								Clique numa turma para pôr na sua grade; clicar de novo tira.
							</p>
						{/if}
					</header>
					<div class="space-y-2">
						{#each grupo.turmas as t (t.id_turmas)}
							<TurmaOption
								codigo={grupo.codigo}
								tg={{ turma: t, mask: slotMaskFromHorario(t.horario) }}
								interativa={gradePronta}
								onToggle={() => void toggleNaGrade(grupo.codigo, t)}
							/>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{:else}
		<div class="rounded-2xl border border-border bg-card dark:bg-background/80 px-4 py-8 text-center">
			<p class="text-sm text-muted-foreground">Busque na oferta do semestre.</p>
			<p class="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
				Dá para procurar pelo nome de um professor e ver tudo que ele dá, por um horário SIGAA
				(<span class="font-mono">2M34</span>), pela sala, ou pelo código/nome da matéria.
			</p>
		</div>
	{/if}
</div>

<PreRequisitoConfirmDialog
	{pendencias}
	onConfirmar={confirmarPendencias}
	onCancelar={descartarPendencias}
/>
