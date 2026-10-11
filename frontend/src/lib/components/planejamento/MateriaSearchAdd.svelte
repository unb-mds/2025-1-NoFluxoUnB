<script lang="ts">
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { setHasCodeIgnoreCase } from '$lib/utils/subject-codes';
	import { Search, Plus } from 'lucide-svelte';
	import HelpTip from '$lib/components/onboarding/HelpTip.svelte';
	import PreRequisitoConfirmDialog from './PreRequisitoConfirmDialog.svelte';
	import {
		pendenciaPreRequisito,
		type PendenciaPreRequisito
	} from '$lib/services/grade-pool.service';

	// Adiciona uma matéria da matriz do curso ao pool. A página resolve turmas.
	// `compacto` = coluna única (celular): a aba já se chama "Matérias", então o
	// card com título repetido só empurraria a busca para baixo — fica só o campo.
	let { onAdd, compacto = false }: { onAdd: (codigo: string) => void; compacto?: boolean } =
		$props();

	let query = $state('');

	const resultados = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q.length < 2) return [];
		const mats = fluxogramaStore.state.courseData?.materias ?? [];
		return mats
			.filter(
				(m) =>
					!gradeStore.hasMateria(m.codigoMateria) &&
					// Concluída ou já cursando nunca é resultado clicável — sem isso a
					// busca mostrava a matéria e só recusava (com aviso) depois do clique.
					!setHasCodeIgnoreCase(fluxogramaStore.completedCodes, m.codigoMateria) &&
					!setHasCodeIgnoreCase(
						fluxogramaStore.currentCodes ?? new Set<string>(),
						m.codigoMateria
					) &&
					(m.codigoMateria.toLowerCase().includes(q) || m.nomeMateria.toLowerCase().includes(q))
			)
			.slice(0, 8);
	});

	// Pendência aguardando confirmação — o código fica guardado à parte porque a
	// pendência traz o código já normalizado e `onAdd` deve receber o original.
	let pendencias = $state<PendenciaPreRequisito[]>([]);
	let aguardando = $state<string | null>(null);

	function adicionar(codigo: string) {
		const p = pendenciaPreRequisito(codigo);
		if (p) {
			pendencias = [p];
			aguardando = codigo;
			return;
		}
		confirmar(codigo);
	}

	function confirmar(codigo: string) {
		onAdd(codigo);
		query = '';
	}

	function aoConfirmar() {
		const codigo = aguardando;
		pendencias = [];
		aguardando = null;
		if (codigo) confirmar(codigo);
	}

	function aoCancelar() {
		pendencias = [];
		aguardando = null;
	}
</script>

<div
	class={compacto ? '' : 'rounded-2xl border border-border bg-card dark:bg-background/80 p-3'}
	data-tour="buscar-materia"
>
	{#if !compacto}
		<div class="mb-2 flex items-center justify-between gap-2">
			<p class="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
				1 · Matérias
			</p>
			<HelpTip
				title="Como achar a matéria"
				text="Digite o código (ex.: CIC0004) ou parte do nome. Só aparecem matérias da sua matriz que ainda não estão na lista. Precisa de algo fora da matriz? Use “Buscar turmas” no topo."
			/>
		</div>
	{/if}
	<div class="relative">
		<Search
			class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground dark:text-white/40"
		/>
		<input
			type="text"
			bind:value={query}
			placeholder="Adicionar matéria (código ou nome)..."
			class="w-full rounded-full border border-border-strong bg-background py-2 pr-3 pl-9 text-xs text-foreground placeholder:text-muted-foreground dark:placeholder:text-white/40 focus:border-ring dark:border-border dark:bg-foreground/5 dark:focus:border-foreground/30 focus:outline-none"
		/>
	</div>

	{#if resultados.length > 0}
		<div class="mt-2 space-y-1">
			{#each resultados as m (m.idMateria)}
				<button
					type="button"
					onclick={() => adicionar(m.codigoMateria)}
					class="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/50 dark:bg-black/20 px-2.5 py-1.5 text-left transition-colors hover:bg-foreground/5 dark:hover:bg-white/5"
				>
					<Plus class="h-3.5 w-3.5 shrink-0 text-ai dark:text-purple-300" />
					<span class="font-mono text-[11px] font-semibold text-foreground/85">{m.codigoMateria}</span>
					<span class="truncate text-[11px] text-muted-foreground">{m.nomeMateria}</span>
				</button>
			{/each}
		</div>
	{:else if query.trim().length >= 2}
		<p class="mt-2 px-1 text-[11px] text-muted-foreground dark:text-white/40">
			Nenhuma matéria nova encontrada na sua matriz.
		</p>
	{/if}
</div>

<PreRequisitoConfirmDialog {pendencias} onConfirmar={aoConfirmar} onCancelar={aoCancelar} />
