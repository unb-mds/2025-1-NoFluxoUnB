<script lang="ts">
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { isOptativa } from '$lib/types/materia';
	import { X, BookOpen, Save, Loader2, History } from 'lucide-svelte';

	const store = fluxogramaStore;
let temPendenciaSalvar = $derived(store.precisaSalvarPerfil);

	/** Reage ao histórico local e ao curso (nomes das disciplinas). */
	let historicoItens = $derived.by(() => {
		void store.diagramLayoutRevision;
		void store.userFluxograma;
		return store.historicoManualPendenteItens;
	});

	let saving = $state(false);
	let removendoCodigo = $state<string | null>(null);

	async function salvarPlanejamento() {
		saving = true;
		try {
			await store.saveOptativasPlanejadas();
		} finally {
			saving = false;
		}
	}

	async function removerOptativa(codigo: string) {
		if (store.state.isAnonymous) {
			store.removeOptativa(codigo);
			return;
		}
		removendoCodigo = codigo;
		try {
			await store.removeOptativaPlanejada(codigo);
		} finally {
			removendoCodigo = null;
		}
	}
</script>

{#if store.precisaSalvarPerfil || store.optativasAdicionadas.length > 0}
	<div class="min-w-0 rounded-xl border border-amber-500/25 bg-background/80 dark:bg-black/40 p-3 backdrop-blur-md sm:p-4">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<div class="flex items-center gap-2">
				<BookOpen class="h-4 w-4 text-amber-700 dark:text-amber-400" />
				<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/80">
					{temPendenciaSalvar ? 'Alterações para salvar' : 'Disciplinas planejadas'}
				</h3>
			</div>
			{#if !store.state.isAnonymous && temPendenciaSalvar}
				<button
					type="button"
					disabled={saving}
					onclick={salvarPlanejamento}
					class="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-primary/20 disabled:cursor-not-allowed dark:border-purple-500/40 dark:bg-purple-600/30 dark:text-purple-100 dark:hover:bg-purple-600/45 disabled:opacity-40"
				>
					{#if saving}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
						Salvando…
					{:else}
						<Save class="h-3.5 w-3.5" />
						Salvar no perfil
					{/if}
				</button>
			{/if}
		</div>

		{#if !store.state.isAnonymous && temPendenciaSalvar}
			<p class="mb-3 text-[11px] text-amber-800 dark:text-amber-200/85">
				Há mudanças locais ainda não enviadas ao servidor.
			</p>
		{:else if !store.state.isAnonymous}
			<p class="mb-3 text-[11px] text-emerald-800 dark:text-emerald-200/85">
				Planejamento sincronizado com o perfil.
			</p>
		{:else}
			<p class="mb-3 text-[11px] text-muted-foreground">
				Entre na conta para salvar planejamento e histórico.
			</p>
		{/if}

		{#if store.historicoManualPendenteSalvar && historicoItens.length > 0}
			<div
				class="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100/95"
			>
				<History class="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
				<span
					>Disciplina(s) abaixo foram marcadas como <strong class="text-foreground">concluídas</strong> no
					histórico local — “Salvar no perfil” envia tudo ao servidor.</span
				>
			</div>
			<p class="mb-2 text-[10px] font-medium uppercase tracking-wide text-emerald-800/90 dark:text-emerald-200/70">
				Histórico local (pendente de envio)
			</p>
			<div class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each historicoItens as item (`hist-${item.codigoMateria}`)}
					<div
						class="rounded-lg border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-emerald-800/5 px-4 py-3"
					>
						<p class="text-sm font-medium text-foreground/90">{item.nomeMateria}</p>
						<p class="text-xs text-muted-foreground">{item.codigoMateria}</p>
						<div class="mt-1.5">
							<span
								class="rounded-full bg-emerald-500/30 px-2 py-0.5 text-[9px] font-semibold text-emerald-900 dark:text-emerald-100"
								>Concluída (local)</span
							>
						</div>
					</div>
				{/each}
			</div>
		{:else if store.historicoManualPendenteSalvar}
			<div
				class="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100/95"
			>
				<History class="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
				<span>Alteração no histórico local — salve para sincronizar com o perfil.</span>
			</div>
		{/if}

		{#if store.optativasAdicionadas.length > 0}
			<p class="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Planejadas no fluxograma (futuras)</p>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{#each store.optativasAdicionadas as opt (`${opt.materia.codigoMateria}-${opt.semestre}`)}
					<div
						class="group relative rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-700/5 px-4 py-3 transition-colors hover:border-blue-500/30"
					>
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1">
								<p class="text-sm font-medium text-foreground/90">{opt.materia.nomeMateria}</p>
								<p class="text-xs text-muted-foreground">{opt.materia.codigoMateria}</p>
								<div class="mt-1.5 flex flex-wrap items-center gap-2">
									<span class="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground dark:bg-foreground/10">
										{opt.materia.creditos} cr
									</span>
									<span class="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground dark:bg-purple-500/20 dark:text-purple-300">
										{opt.semestre}º sem
									</span>
									<span
										class="rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold text-accent-foreground dark:bg-purple-500/35 dark:text-purple-100"
									>({isOptativa(opt.materia) ? 'opt' : 'obrig'})</span>
								</div>
							</div>
							<button
								type="button"
								disabled={removendoCodigo === opt.materia.codigoMateria}
								onclick={() => removerOptativa(opt.materia.codigoMateria)}
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-700 group-hover:opacity-100 dark:hover:text-red-400 disabled:cursor-wait disabled:opacity-60"
								title={store.state.isAnonymous ? 'Remover só neste aparelho' : 'Remover do fluxograma e salvar no perfil'}
								aria-label="Remover disciplina do fluxograma"
							>
								{#if removendoCodigo === opt.materia.codigoMateria}
									<Loader2 class="h-3.5 w-3.5 animate-spin text-red-700 dark:text-red-300" />
								{:else}
									<X class="h-3.5 w-3.5" />
								{/if}
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if historicoItens.length === 0 && store.optativasAdicionadas.length === 0 && !store.historicoManualPendenteSalvar}
			<p class="text-xs text-muted-foreground">
				Planejamento de disciplinas alterado (ex.: removeu todas). Salve para atualizar o perfil.
			</p>
		{/if}
	</div>
{/if}
