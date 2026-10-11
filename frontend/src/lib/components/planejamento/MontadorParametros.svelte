<script module lang="ts">
	import type { Turno } from '$lib/utils/horario-slots';

	export type EscopoMontagem = 'periodo-atual' | 'todas-pendentes';

	/**
	 * As 3 estratégias padrão do solver (`construirEstrategiasPadrao` em
	 * `grade.store.svelte.ts`) — `nome` tem de bater com a de lá, é por ele que
	 * `montarOpcoes` filtra e que o cenário gerado é nomeado.
	 */
	export const ESTRATEGIAS: ReadonlyArray<{ nome: string; titulo: string; descricao: string }> = [
		{ nome: 'Menos dias', titulo: 'Menos dias', descricao: 'Concentra as aulas' },
		{ nome: 'Menos lacunas', titulo: 'Menos janelas', descricao: 'Reduz intervalos' },
		{ nome: 'Semana equilibrada', titulo: 'Equilibrada', descricao: 'Distribui a carga' }
	];

	/**
	 * O que o painel "Gerar grade" coleta antes de chamar o solver.
	 * `limiteCreditos`/`essencial`/`professorPreferidoEssencial`/`turnosEssencial`
	 * mapeiam direto pro `MontarOpts` de `gradeStore.montarOpcoes`; `limiteCreditos`
	 * e `escopo` também vão para a semeadura (`onSemear`). As três estratégias são
	 * sempre geradas (viram as abas de opção); `estrategiaPreferida` é a que entra
	 * aplicada.
	 */
	export interface ParametrosMontagem {
		escopo: EscopoMontagem;
		limiteCreditos: number;
		/** Código da matéria essencial, ou `null` se o aluno não marcou nenhuma. */
		essencial: string | null;
		professorPreferidoEssencial: string | null;
		turnosEssencial: Turno[];
		/** Nomes das estratégias de ranking que o solver deve testar (nunca vazio). */
		estrategias: string[];
		estrategiaPreferida: string;
	}
</script>

<script lang="ts">
	import { gradeStore, type MateriaGrade } from '$lib/stores/grade.store.svelte';
	import { HORAS_POR_CREDITO } from '$lib/stores/unidade-carga.store.svelte';
	import { LIMITE_CREDITOS_MAX, LIMITE_CREDITOS_MIN } from '$lib/types/plano-formatura';
	import { Plus, Sparkles, X, Loader2 } from 'lucide-svelte';

	/**
	 * Só coleta: quem semeia a lista e chama o solver é `MontadorGradeView`, que tem
	 * `onSemear` e os toasts.
	 */
	let {
		limiteCreditosInicial,
		gerando = false,
		valorInicial = null,
		onGerar
	}: {
		limiteCreditosInicial: number;
		/** A geração está rodando (desabilita o botão, evita clique duplo). */
		gerando?: boolean;
		/** Reabrir o painel preserva o que já foi escolhido. */
		valorInicial?: ParametrosMontagem | null;
		onGerar: (params: ParametrosMontagem) => void;
	} = $props();

	let estrategia = $state(valorInicial?.estrategiaPreferida ?? 'Semana equilibrada');
	let limiteCreditos = $state(
		Math.min(
			LIMITE_CREDITOS_MAX,
			Math.max(LIMITE_CREDITOS_MIN, valorInicial?.limiteCreditos ?? limiteCreditosInicial)
		)
	);

	const TURNO_OPCOES: ReadonlyArray<[Turno, string]> = [
		['M', 'Manhã'],
		['T', 'Tarde'],
		['N', 'Noite']
	];

	// Disciplina essencial: busca nas matérias da lista. Diferente da estrela —
	// prioritária ainda pode ficar de fora se nada couber; essencial nunca fica.
	let busca = $state('');
	let essencialCodigo = $state<string | null>(valorInicial?.essencial ?? null);
	let professor = $state<string | null>(valorInicial?.professorPreferidoEssencial ?? null);

	const resultados = $derived.by(() => {
		const q = busca.trim().toUpperCase();
		if (!q) return [];
		return gradeStore.pool
			.filter((m) => m.codigo.toUpperCase().includes(q) || m.nome.toUpperCase().includes(q))
			.slice(0, 6);
	});
	const essencial = $derived(
		essencialCodigo ? (gradeStore.pool.find((m) => m.codigo === essencialCodigo) ?? null) : null
	);
	const docentes = $derived(essencial ? gradeStore.docentesDe(essencial.codigo) : []);

	function escolherEssencial(m: MateriaGrade): void {
		essencialCodigo = m.codigo;
		professor = null;
		busca = '';
	}

	function gerar(): void {
		if (gerando) return;
		onGerar({
			escopo: valorInicial?.escopo ?? 'periodo-atual',
			limiteCreditos,
			essencial: essencialCodigo,
			professorPreferidoEssencial: essencialCodigo ? professor : null,
			turnosEssencial: [],
			estrategias: ESTRATEGIAS.map((e) => e.nome),
			estrategiaPreferida: estrategia
		});
	}
</script>

<div class="space-y-5 px-5 pb-5">
	<fieldset>
		<legend class="mg-eyebrow mb-2">Como prefere sua semana?</legend>
		<div class="grid grid-cols-3 gap-2">
			{#each ESTRATEGIAS as e (e.nome)}
				<button
					type="button"
					aria-pressed={estrategia === e.nome}
					onclick={() => (estrategia = e.nome)}
					class="mg-choice flex min-h-16 flex-col items-start gap-1 p-2.5 text-left"
				>
					<span class="text-xs font-semibold text-foreground">{e.titulo}</span>
					<span class="text-[10px] leading-tight">{e.descricao}</span>
				</button>
			{/each}
		</div>
	</fieldset>

	<div>
		<div class="flex items-center justify-between">
			<label for="mg-carga" class="mg-eyebrow mb-0">Carga máxima</label>
			<span class="text-xs font-semibold text-foreground tabular-nums">
				{limiteCreditos} créditos
				<span class="font-normal text-muted-foreground">· {limiteCreditos * HORAS_POR_CREDITO}h</span>
			</span>
		</div>
		<input
			id="mg-carga"
			type="range"
			min={LIMITE_CREDITOS_MIN}
			max={LIMITE_CREDITOS_MAX}
			step="1"
			bind:value={limiteCreditos}
			class="mt-3 h-1 w-full cursor-pointer touch-manipulation accent-primary"
		/>
	</div>

	<fieldset>
		<legend class="mg-eyebrow mb-2">Turnos permitidos</legend>
		<div class="mg-sunken grid grid-cols-3 gap-1 rounded-[10px] p-1">
			{#each TURNO_OPCOES as [t, label] (t)}
				{@const ativo = gradeStore.turnosPermitidos.has(t)}
				<button
					type="button"
					aria-pressed={ativo}
					onclick={() => gradeStore.toggleTurno(t)}
					class="min-h-9 touch-manipulation rounded-lg text-xs font-medium transition-colors {ativo
						? 'bg-primary text-primary-foreground dark:bg-[#3a225b] dark:text-[#f1eaff]'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{label}
				</button>
			{/each}
		</div>
	</fieldset>

	{#if gradeStore.temCursando}
		<!--
			Mora aqui, e não só nas preferências: é o que mais muda o resultado. Desligado
			sem o aluno perceber, a montagem tirava tudo o que ele cursa e "não montava".
		-->
		<button
			type="button"
			role="switch"
			aria-checked={gradeStore.incluirCursando}
			onclick={() => gradeStore.setIncluirCursando(!gradeStore.incluirCursando)}
			class="mg-sunken flex w-full touch-manipulation items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left"
		>
			<span>
				<span class="block text-xs font-semibold text-foreground">Incluir matérias que já curso</span>
				<span class="block text-[10px] text-muted-foreground">
					{gradeStore.incluirCursando
						? 'Sua matrícula atual entra na grade e não sai.'
						: 'Desligado: monta só com o que você ainda vai pegar.'}
				</span>
			</span>
			<span class="mg-switch" aria-checked={gradeStore.incluirCursando}></span>
		</button>
	{/if}

	<div>
		<label for="mg-essencial" class="mg-eyebrow mb-2">
			Disciplina essencial <span class="font-medium tracking-normal normal-case">· opcional</span>
		</label>
		{#if essencial}
			<div class="mg-sunken flex items-start gap-2 rounded-[10px] px-3 py-2.5">
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-semibold text-foreground">
						<span class="font-mono">{essencial.codigo}</span> · {essencial.nome}
					</p>
					<p class="mt-0.5 text-[10px] text-muted-foreground">Entra em todas as opções, se couber.</p>
					{#if docentes.length > 0}
						<label class="mt-2 flex items-center gap-2">
							<span class="text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
								>Prof.</span
							>
							<select
								value={professor ?? ''}
								onchange={(e) => (professor = (e.currentTarget as HTMLSelectElement).value || null)}
								class="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:ring-1 focus:ring-ring/50 focus:outline-none"
							>
								<option value="">Tanto faz</option>
								{#each docentes as d (d)}
									<option value={d}>{d}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>
				<button
					type="button"
					onclick={() => {
						essencialCodigo = null;
						professor = null;
					}}
					class="shrink-0 touch-manipulation rounded-md p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
					aria-label="Remover disciplina essencial"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</div>
		{:else}
			<div class="mg-sunken flex min-h-10 items-center gap-2 rounded-[10px] px-3">
				<Plus class="h-4 w-4 shrink-0 text-muted-foreground" />
				<input
					id="mg-essencial"
					type="text"
					bind:value={busca}
					placeholder="Buscar por código ou nome"
					autocomplete="off"
					class="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-foreground shadow-none placeholder:text-muted-foreground focus:ring-0 focus:outline-none"
				/>
			</div>
			{#if resultados.length > 0}
				<ul class="mt-1.5 space-y-0.5">
					{#each resultados as m (m.codigo)}
						<li>
							<button
								type="button"
								onclick={() => escolherEssencial(m)}
								class="w-full touch-manipulation rounded-lg px-2.5 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-foreground/5"
							>
								<span class="font-mono font-semibold text-foreground">{m.codigo}</span> · {m.nome}
							</button>
						</li>
					{/each}
				</ul>
			{:else if busca.trim()}
				<p class="mt-1.5 px-1 text-[11px] text-muted-foreground">
					Nenhuma matéria da sua lista com esse nome. Adicione-a antes em “Manual”.
				</p>
			{/if}
		{/if}
	</div>

	<button
		type="button"
		onclick={gerar}
		disabled={gerando}
		class="mg-btn mg-btn-primary sticky bottom-0 w-full"
	>
		{#if gerando}
			<Loader2 class="h-4 w-4 animate-spin" /> Gerando opções…
		{:else}
			<Sparkles class="h-4 w-4" /> Gerar opções
		{/if}
	</button>
</div>
