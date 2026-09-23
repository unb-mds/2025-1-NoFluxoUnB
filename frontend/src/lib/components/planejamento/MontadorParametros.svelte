<script module lang="ts">
	import type { Turno } from '$lib/utils/horario-slots';

	export type EscopoMontagem = 'periodo-atual' | 'todas-pendentes';

	/**
	 * O que o Passo 1 ("Configurar") do wizard do Montador coleta antes de chamar o
	 * solver. `essencial`/`professorPreferidoEssencial`/`turnosEssencial` só valem
	 * quando uma disciplina essencial foi escolhida — nulos/vazios quando não.
	 *
	 * `limiteCreditos`/`essencial`/`professorPreferidoEssencial` mapeiam direto pro
	 * `MontarOpts` que `gradeStore.montarOpcoes` já aceita. `escopo` e
	 * `turnosEssencial` ainda não têm um parâmetro correspondente no store/rota —
	 * `escopo` fica só de UI por ora (a semeadura via `onSemear` já traz o que dá
	 * pra montar, sem distinguir os dois modos hoje) e `turnosEssencial` é
	 * persistido via `preferenciasGradeService.salvar` (não é filtro do solver:
	 * só o turno GLOBAL — `gradeStore.turnosPermitidos`, reusado abaixo — filtra
	 * turma hoje).
	 */
	export interface ParametrosMontagem {
		escopo: EscopoMontagem;
		limiteCreditos: number;
		/** Código da matéria essencial, ou `null` se o aluno não marcou nenhuma. */
		essencial: string | null;
		professorPreferidoEssencial: string | null;
		turnosEssencial: Turno[];
	}
</script>

<script lang="ts">
	import { gradeStore, type MateriaGrade } from '$lib/stores/grade.store.svelte';
	import { Wand2, Search, X, Sparkles, GraduationCap } from 'lucide-svelte';

	/**
	 * Passo 1 do wizard "Montar grade": coleta os parâmetros e devolve pro pai via
	 * `onGerar` — quem faz a chamada ao solver (e o "puxão" de matérias do plano) é
	 * `MontadorGradeView`, que já tem acesso a `onSemear`/toast; este componente só
	 * cuida da coleta.
	 */
	let {
		periodo,
		limiteCreditosInicial,
		gerando = false,
		valorInicial = null,
		onGerar,
		onCancelar
	}: {
		periodo: string | null;
		limiteCreditosInicial: number;
		/** A geração está rodando (desabilita o botão, evita clique duplo). */
		gerando?: boolean;
		/** Reabrir o passo 1 (botão "Voltar" do passo 2) preserva o que já foi escolhido. */
		valorInicial?: ParametrosMontagem | null;
		onGerar: (params: ParametrosMontagem) => void;
		onCancelar: () => void;
	} = $props();

	// Régua fixa do limite de créditos — os mesmos limites do slider já existente na
	// tela (Motor 2), pra não introduzir uma segunda régua com outra escala.
	const LIMITE_MIN = 0;
	const LIMITE_MAX = 40;

	let escopo = $state<EscopoMontagem>(valorInicial?.escopo ?? 'periodo-atual');
	let limiteCreditos = $state(valorInicial?.limiteCreditos ?? limiteCreditosInicial);

	/**
	 * As 3 estratégias padrão do solver (`construirEstrategiasPadrao` em
	 * `grade.store.svelte.ts`) — `montarOpcoes` sempre roda as 3, sem seleção do
	 * aluno (o solver não expõe um jeito de escolher um subconjunto), então aqui é
	 * só um preview informativo do que "Gerar opções" vai testar.
	 */
	const ESTRATEGIAS_PADRAO: ReadonlyArray<{ nome: string; descricao: string }> = [
		{ nome: 'Menos dias', descricao: 'Concentra as aulas no menor número de dias' },
		{ nome: 'Menos lacunas', descricao: 'Reduz os furos entre uma aula e outra' },
		{ nome: 'Semana equilibrada', descricao: 'Distribui a carga igual pelos dias' }
	];

	const TURNO_OPCOES: ReadonlyArray<[Turno, string]> = [
		['M', 'Manhã'],
		['T', 'Tarde'],
		['N', 'Noite']
	];

	// Disciplina essencial: busca por código/nome nas matérias que já estão na
	// lista do aluno. Toggle distinto da estrela de prioridade — prioritária ainda
	// pode ficar de fora se nada couber; essencial nunca fica.
	let buscaEssencial = $state('');
	let essencialCodigo = $state<string | null>(valorInicial?.essencial ?? null);
	let mostrarResultadosBusca = $state(false);

	const resultadosBusca = $derived.by(() => {
		const q = buscaEssencial.trim().toUpperCase();
		if (!q) return [];
		return gradeStore.pool
			.filter((m) => m.codigo.toUpperCase().includes(q) || m.nome.toUpperCase().includes(q))
			.slice(0, 8);
	});
	const materiaEssencial = $derived(
		essencialCodigo ? (gradeStore.pool.find((m) => m.codigo === essencialCodigo) ?? null) : null
	);

	function escolherEssencial(materia: MateriaGrade): void {
		essencialCodigo = materia.codigo;
		buscaEssencial = '';
		mostrarResultadosBusca = false;
	}
	function limparEssencial(): void {
		essencialCodigo = null;
		professorPreferidoEssencial = null;
		turnosEssencial = new Set();
	}

	/**
	 * Docentes distintos que oferecem a matéria, com o campo `docente` splitado por
	 * vírgula (o SIGAA às vezes traz mais de um nome no mesmo campo) — sem isso o
	 * autocomplete oferecia "Fulano, Beltrano" como se fosse um professor só.
	 */
	function docentesDaMateria(materia: MateriaGrade): string[] {
		const vistos = new Map<string, string>();
		for (const tg of materia.turmas) {
			for (const parte of (tg.turma.docente ?? '').split(',')) {
				const nome = parte.trim();
				if (nome) vistos.set(nome.toUpperCase(), nome);
			}
		}
		return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
	}
	const docentesEssencial = $derived(materiaEssencial ? docentesDaMateria(materiaEssencial) : []);

	let professorPreferidoEssencial = $state<string | null>(
		valorInicial?.professorPreferidoEssencial ?? null
	);
	let turnosEssencial = $state<Set<Turno>>(new Set(valorInicial?.turnosEssencial ?? []));
	function toggleTurnoEssencial(t: Turno): void {
		const next = new Set(turnosEssencial);
		if (next.has(t)) next.delete(t);
		else next.add(t);
		turnosEssencial = next;
	}

	function gerar(): void {
		if (gerando) return;
		onGerar({
			escopo,
			limiteCreditos,
			essencial: essencialCodigo,
			professorPreferidoEssencial: essencialCodigo ? professorPreferidoEssencial : null,
			turnosEssencial: essencialCodigo ? [...turnosEssencial] : []
		});
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between gap-2 px-1">
		<p
			class="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-white/55 uppercase"
		>
			<Sparkles class="h-3.5 w-3.5 text-purple-300" /> 1 · Configurar
		</p>
		<button
			type="button"
			onclick={onCancelar}
			class="touch-manipulation rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
			aria-label="Cancelar e voltar à lista de matérias"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Escopo -->
	<section>
		<p class="mb-1.5 text-[10px] font-medium tracking-wide text-white/40 uppercase">
			O que montar
		</p>
		<div class="grid grid-cols-2 gap-2">
			<button
				type="button"
				aria-pressed={escopo === 'periodo-atual'}
				onclick={() => (escopo = 'periodo-atual')}
				class="touch-manipulation rounded-xl border px-3 py-2 text-left transition-colors {escopo ===
				'periodo-atual'
					? 'border-purple-300/45 bg-purple-500/18 text-purple-100'
					: 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}"
			>
				<span class="block text-xs font-semibold">Período atual</span>
				<span class="block text-[10px] opacity-70">{periodo ?? 'Oferta atual'}</span>
			</button>
			<button
				type="button"
				aria-pressed={escopo === 'todas-pendentes'}
				onclick={() => (escopo = 'todas-pendentes')}
				class="touch-manipulation rounded-xl border px-3 py-2 text-left transition-colors {escopo ===
				'todas-pendentes'
					? 'border-purple-300/45 bg-purple-500/18 text-purple-100'
					: 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}"
			>
				<span class="block text-xs font-semibold">Todas as pendentes</span>
				<span class="block text-[10px] opacity-70">Inclui o que falta na matriz</span>
			</button>
		</div>
	</section>

	<!-- Estratégias — preview do que "Gerar opções" testa (sempre as 3, sem seleção). -->
	<section>
		<p class="mb-1.5 text-[10px] font-medium tracking-wide text-white/40 uppercase">
			Estratégias testadas automaticamente
		</p>
		<div class="grid gap-2 sm:grid-cols-3">
			{#each ESTRATEGIAS_PADRAO as estrategia (estrategia.nome)}
				<div class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/60">
					<span class="block text-xs font-semibold text-white/80">{estrategia.nome}</span>
					<span class="block text-[10px] opacity-70">{estrategia.descricao}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- Carga horária -->
	<section>
		<p class="mb-1.5 text-[10px] font-medium tracking-wide text-white/40 uppercase">
			Carga horária do semestre
		</p>
		<div
			class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2"
		>
			<input
				type="range"
				min={LIMITE_MIN}
				max={LIMITE_MAX}
				step="1"
				bind:value={limiteCreditos}
				class="h-1.5 min-w-[8rem] flex-1 touch-manipulation accent-purple-400"
				aria-label="Limite de créditos"
			/>
			<span class="shrink-0 text-xs tabular-nums text-white/70">{limiteCreditos} créditos</span>
		</div>
	</section>

	<!-- Turnos -->
	<section>
		<p class="mb-1.5 text-[10px] font-medium tracking-wide text-white/40 uppercase">
			Turnos permitidos
		</p>
		<div class="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/5 p-0.5">
			{#each TURNO_OPCOES as [t, label] (t)}
				{@const ativo = gradeStore.turnosPermitidos.has(t)}
				<button
					type="button"
					onclick={() => gradeStore.toggleTurno(t)}
					aria-pressed={ativo}
					class="touch-manipulation rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors {ativo
						? 'bg-purple-500/25 text-purple-100'
						: 'text-white/40 hover:text-white/70'}"
				>
					{label}
				</button>
			{/each}
		</div>
	</section>

	<!-- Disciplina essencial -->
	<section>
		<p class="mb-1.5 text-[10px] font-medium tracking-wide text-white/40 uppercase">
			Disciplina essencial
			<span class="normal-case text-white/30">— nunca fica de fora</span>
		</p>

		{#if materiaEssencial}
			<div class="flex items-start gap-2 rounded-xl border border-emerald-300/35 bg-emerald-500/12 px-3 py-2">
				<GraduationCap class="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-semibold text-emerald-100">
						{materiaEssencial.codigo} · {materiaEssencial.nome}
					</p>

					<!-- Professor preferido só aparece depois de escolhida a essencial. -->
					{#if docentesEssencial.length > 0}
						<label class="mt-1.5 flex items-center gap-2">
							<span class="text-[10px] font-medium tracking-wide text-white/40 uppercase"
								>Prof.</span
							>
							<select
								value={professorPreferidoEssencial ?? ''}
								onchange={(e) =>
									(professorPreferidoEssencial =
										(e.currentTarget as HTMLSelectElement).value || null)}
								class="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-white/80 focus:ring-1 focus:ring-emerald-400/50 focus:outline-none"
							>
								<option value="">Tanto faz</option>
								{#each docentesEssencial as d (d)}
									<option value={d}>{d}</option>
								{/each}
							</select>
						</label>
					{/if}

					<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
						<span class="text-[10px] font-medium tracking-wide text-white/40 uppercase"
							>Turno dela</span
						>
						{#each TURNO_OPCOES as [t, label] (t)}
							{@const ativo = turnosEssencial.has(t)}
							<button
								type="button"
								onclick={() => toggleTurnoEssencial(t)}
								aria-pressed={ativo}
								class="touch-manipulation rounded-full border px-2 py-1 text-[10px] font-medium transition-colors {ativo
									? 'border-emerald-300/45 bg-emerald-500/20 text-emerald-100'
									: 'border-white/10 bg-white/5 text-white/45 hover:bg-white/10'}"
							>
								{label}
							</button>
						{/each}
					</div>
				</div>
				<button
					type="button"
					onclick={limparEssencial}
					class="shrink-0 touch-manipulation rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
					aria-label="Remover disciplina essencial"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</div>
		{:else}
			<div class="relative">
				<div
					class="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2"
				>
					<Search class="h-3.5 w-3.5 shrink-0 text-white/35" />
					<input
						type="text"
						placeholder="Buscar matéria na sua lista (opcional)"
						bind:value={buscaEssencial}
						onfocus={() => (mostrarResultadosBusca = true)}
						onblur={() => setTimeout(() => (mostrarResultadosBusca = false), 150)}
						class="min-w-0 flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/30 focus:outline-none"
					/>
				</div>
				{#if mostrarResultadosBusca && resultadosBusca.length > 0}
					<ul
						class="absolute z-10 mt-1 w-full space-y-0.5 rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-xl"
					>
						{#each resultadosBusca as materia (materia.codigo)}
							<li>
								<button
									type="button"
									onclick={() => escolherEssencial(materia)}
									class="w-full touch-manipulation rounded-lg px-2 py-1.5 text-left text-[11px] text-white/70 hover:bg-white/10"
								>
									<span class="font-mono font-semibold text-white/90">{materia.codigo}</span>
									· {materia.nome}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</section>

	<button
		type="button"
		onclick={gerar}
		disabled={gerando}
		class="inline-flex w-full touch-manipulation items-center justify-center gap-1.5 rounded-full bg-purple-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_14px_rgba(168,85,247,0.4)] transition-colors hover:bg-purple-400 disabled:opacity-60"
	>
		<Wand2 class="h-4 w-4" />
		{gerando ? 'Gerando opções…' : 'Gerar opções'}
	</button>
</div>
