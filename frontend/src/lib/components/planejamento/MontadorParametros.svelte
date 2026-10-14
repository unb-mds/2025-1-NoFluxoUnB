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
		/** Só obrigatórias (e optatórias): a Darcy sugere as optativas depois. */
		apenasObrigatorias: boolean;
	}
</script>

<script lang="ts">
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { setHasCodeIgnoreCase } from '$lib/utils/subject-codes';
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
		periodoAtual = null,
		ofertaProximo = null,
		onGerar,
		onIncluir
	}: {
		limiteCreditosInicial: number;
		/** A geração está rodando (desabilita o botão, evita clique duplo). */
		gerando?: boolean;
		/** Reabrir o painel preserva o que já foi escolhido. */
		valorInicial?: ParametrosMontagem | null;
		/** Período vigente e o seguinte — para dizer qual oferta cada opção usa. */
		periodoAtual?: string | null;
		ofertaProximo?: { periodo: string; temOferta: boolean } | null;
		onGerar: (params: ParametrosMontagem) => void;
		/** Põe na lista a essencial escolhida da matriz que ainda não estava nela. */
		onIncluir?: (codigo: string) => void;
	} = $props();

	let estrategia = $state(valorInicial?.estrategiaPreferida ?? 'Semana equilibrada');
	let apenasObrigatorias = $state(valorInicial?.apenasObrigatorias ?? false);
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

	/**
	 * "Para qual semestre?" é o `incluirCursando` do store dito na língua do aluno.
	 * Este semestre: a matrícula já feita entra na grade e o resto se encaixa em
	 * volta (quem monta nas férias, antes das aulas). Próximo: o que ele cursa agora
	 * conta como concluído — destrava pré-requisito e não ocupa carga nem horário.
	 */
	const SEMESTRES = [
		{
			valor: 'atual',
			incluirCursando: true,
			titulo: 'Este semestre',
			descricao: 'Sua matrícula atual entra na grade'
		},
		{
			valor: 'proximo',
			incluirCursando: false,
			titulo: 'Próximo semestre',
			descricao: 'O que você cursa agora conta como feito'
		}
	] as const;

	// Disciplina essencial: busca nas matérias da lista. Diferente da estrela —
	// prioritária ainda pode ficar de fora se nada couber; essencial nunca fica.
	let busca = $state('');
	let essencialCodigo = $state<string | null>(valorInicial?.essencial ?? null);
	let professor = $state<string | null>(valorInicial?.professorPreferidoEssencial ?? null);

	/**
	 * De qual semestre são as turmas usadas — principalmente para dizer quando o
	 * "Próximo semestre" ainda é estimativa (oferta dele não publicada no SIGAA).
	 */
	const fonteOferta = $derived.by(() => {
		if (gradeStore.incluirCursando) return periodoAtual ? `Turmas de ${periodoAtual}.` : null;
		if (!ofertaProximo) return null;
		if (ofertaProximo.temOferta) return `Turmas de ${ofertaProximo.periodo}, o próximo semestre.`;
		return `A oferta de ${ofertaProximo.periodo} ainda não saiu no SIGAA. Até lá, os horários são uma estimativa com as turmas de ${periodoAtual ?? 'agora'}.`;
	});

	type Opcao = { codigo: string; nome: string };

	/** Planejando o próximo semestre, matéria em curso não é candidata a essencial. */
	const essencialPossivel = (codigo: string) =>
		gradeStore.incluirCursando ||
		!setHasCodeIgnoreCase(fluxogramaStore.currentCodes ?? new Set<string>(), codigo);

	/**
	 * Onde a essencial é buscada: a lista do Montador mais o que falta da matriz,
	 * como na busca "Manual". Só a lista não bastava: depois de "Limpar tudo", ou em
	 * "Próximo semestre" (quando a lista era quase só matrícula), a busca voltava
	 * vazia para qualquer termo.
	 */
	const opcoesEssencial = $derived.by((): Opcao[] => {
		const vistos = new Set<string>();
		const out: Opcao[] = [];
		const add = (codigo: string, nome: string) => {
			const c = codigo.trim().toUpperCase();
			if (vistos.has(c) || !essencialPossivel(c)) return;
			vistos.add(c);
			out.push({ codigo: c, nome });
		};
		for (const m of gradeStore.pool) add(m.codigo, m.nome);
		for (const m of fluxogramaStore.state.courseData?.materias ?? []) {
			if (setHasCodeIgnoreCase(fluxogramaStore.completedCodes, m.codigoMateria)) continue;
			add(m.codigoMateria, m.nomeMateria);
		}
		return out;
	});

	const resultados = $derived.by(() => {
		const q = busca.trim().toUpperCase();
		if (q.length < 2) return [];
		return opcoesEssencial
			.filter((m) => m.codigo.includes(q) || m.nome.toUpperCase().includes(q))
			.slice(0, 6);
	});
	const essencial = $derived(
		essencialCodigo ? (opcoesEssencial.find((m) => m.codigo === essencialCodigo) ?? null) : null
	);
	const docentes = $derived(essencial ? gradeStore.docentesDe(essencial.codigo) : []);

	function escolherEssencial(m: Opcao): void {
		if (!gradeStore.hasMateria(m.codigo)) onIncluir?.(m.codigo);
		essencialCodigo = m.codigo;
		professor = null;
		busca = '';
	}

	function gerar(): void {
		if (gerando) return;
		onGerar({
			escopo: valorInicial?.escopo ?? 'periodo-atual',
			limiteCreditos,
			essencial: essencial?.codigo ?? null,
			professorPreferidoEssencial: essencial ? professor : null,
			turnosEssencial: [],
			estrategias: ESTRATEGIAS.map((e) => e.nome),
			estrategiaPreferida: estrategia,
			apenasObrigatorias
		});
	}
</script>

<div class="space-y-5 px-5 pb-5">
	{#if gradeStore.temCursando}
		<!--
			Primeira pergunta, e não um interruptor no meio: é o que mais muda o
			resultado. Com "Este semestre" (o padrão) a matrícula ocupa quase toda a
			carga, e quem estava planejando o semestre seguinte via a grade "focar" no
			que já cursa — a essencial entrava sozinha ao lado da matrícula.
		-->
		<fieldset>
			<legend class="mg-eyebrow mb-2">Para qual semestre?</legend>
			<div class="grid grid-cols-2 gap-2">
				{#each SEMESTRES as s (s.valor)}
					<button
						type="button"
						aria-pressed={gradeStore.incluirCursando === s.incluirCursando}
						onclick={() => gradeStore.setIncluirCursando(s.incluirCursando)}
						class="mg-choice flex min-h-16 flex-col items-start gap-1 p-2.5 text-left"
					>
						<span class="text-xs font-semibold text-foreground">{s.titulo}</span>
						<span class="text-[10px] leading-tight">{s.descricao}</span>
					</button>
				{/each}
			</div>
			{#if fonteOferta}
				<p class="mt-1.5 text-[11px] leading-snug text-muted-foreground">{fonteOferta}</p>
			{/if}
		</fieldset>
	{/if}

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
		<legend class="mg-eyebrow mb-2">O que entra na grade?</legend>
		<div class="grid grid-cols-2 gap-2">
			{#each [{ valor: false, titulo: 'Tudo', descricao: 'Obrigatórias e optativas' }, { valor: true, titulo: 'Só obrigatórias', descricao: 'A Darcy sugere optativas depois' }] as o (o.titulo)}
				<button
					type="button"
					aria-pressed={apenasObrigatorias === o.valor}
					onclick={() => (apenasObrigatorias = o.valor)}
					class="mg-choice flex min-h-16 flex-col items-start gap-1 p-2.5 text-left"
				>
					<span class="text-xs font-semibold text-foreground">{o.titulo}</span>
					<span class="text-[10px] leading-tight">{o.descricao}</span>
				</button>
			{/each}
		</div>
	</fieldset>

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
			{:else if busca.trim().length >= 2}
				<p class="mt-1.5 px-1 text-[11px] text-muted-foreground">
					Nenhuma matéria pendente da sua matriz com esse nome.
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
