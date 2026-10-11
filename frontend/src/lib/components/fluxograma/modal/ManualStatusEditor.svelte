<script lang="ts">
	import type { MateriaModel } from '$lib/types/materia';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { authStore } from '$lib/stores/auth';
	import { Loader2 } from 'lucide-svelte';

	interface Props {
		materia: MateriaModel;
	}

	let { materia }: Props = $props();

	const store = fluxogramaStore;
	let userData = $derived(authStore.getUser()?.dadosFluxograma);

	let manualStatus = $state('');
	let manualMencao = $state('');
	let manualProfessor = $state('');
	let manualEquivalencia = $state('');
	let salvandoManual = $state(false);
	let expandirOpcoes = $state(false);

	$effect(() => {
		if (materia) {
			const currentData = store.getSubjectUserData(materia.codigoMateria);
			manualStatus = currentData?.status && ['APR', 'REP', 'MATR', 'TRC'].includes(currentData.status as string) ? currentData.status as string : '';
			manualMencao = currentData?.mencao && currentData.mencao !== '-' ? currentData.mencao as string : '';
			manualProfessor = currentData?.professor && currentData.professor !== '-' ? currentData.professor : '';
			manualEquivalencia = currentData?.codigoEquivalente || '';
		}
	});

	async function salvarManual() {
		salvandoManual = true;
		try {
			await store.registrarDisciplinaManual(materia, manualStatus || 'APR', materia.nivel || 1, {
				mencao: manualMencao || undefined,
				professor: manualProfessor || undefined,
				equivalencia: manualEquivalencia || undefined
			});
		} finally {
			salvandoManual = false;
		}
	}

	async function setQuickStatus(status: string) {
		manualStatus = status;
		await salvarManual();
	}

	async function removerManual() {
		salvandoManual = true;
		try {
			await store.removerDisciplinaManual(materia.codigoMateria);
			manualStatus = '';
			manualMencao = '';
			manualProfessor = '';
			manualEquivalencia = '';
		} finally {
			salvandoManual = false;
		}
	}
</script>

<div class="mt-6 rounded-xl border border-border bg-muted/50 dark:bg-black/20 p-4">
	<div class="mb-3 flex items-center justify-between">
		<h3 class="text-sm font-semibold text-foreground/90">Status da Disciplina</h3>
		{#if userData?.isManual}
			<button type="button" disabled={salvandoManual} onclick={removerManual} class="text-[11px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 transition-colors hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50">
				Remover
			</button>
		{/if}
	</div>
	
	<div class="grid grid-cols-4 gap-2">
		<button 
			type="button"
			disabled={salvandoManual}
			onclick={() => setQuickStatus('APR')} 
			class="rounded-lg border {manualStatus === 'APR' ? 'border-green-500 bg-green-500/20 text-emerald-800 dark:text-green-300' : 'border-border bg-foreground/5 text-muted-foreground hover:bg-foreground/10'} py-2 text-xs font-medium transition-all disabled:opacity-50"
		>
			APR
		</button>
		<button 
			type="button"
			disabled={salvandoManual}
			onclick={() => setQuickStatus('REP')} 
			class="rounded-lg border {manualStatus === 'REP' ? 'border-red-500 bg-red-500/20 text-red-700 dark:text-red-300' : 'border-border bg-foreground/5 text-muted-foreground hover:bg-foreground/10'} py-2 text-xs font-medium transition-all disabled:opacity-50"
		>
			REP
		</button>
		<button 
			type="button"
			disabled={salvandoManual}
			onclick={() => setQuickStatus('MATR')} 
			class="rounded-lg border {manualStatus === 'MATR' ? 'border-blue-500 bg-blue-500/20 text-blue-800 dark:text-blue-300' : 'border-border bg-foreground/5 text-muted-foreground hover:bg-foreground/10'} py-2 text-xs font-medium transition-all disabled:opacity-50"
		>
			MATR
		</button>
		<button 
			type="button"
			disabled={salvandoManual}
			onclick={() => setQuickStatus('TRC')} 
			class="rounded-lg border {manualStatus === 'TRC' ? 'border-border-strong bg-muted-foreground/20 text-foreground/80 dark:border-gray-500 dark:text-gray-300' : 'border-border bg-foreground/5 text-muted-foreground hover:bg-foreground/10'} py-2 text-xs font-medium transition-all disabled:opacity-50"
		>
			TRC
		</button>
	</div>

	{#if manualStatus}
		<div class="mt-4 border-t border-border pt-3">
			<button 
				type="button"
				onclick={() => expandirOpcoes = !expandirOpcoes}
				class="mt-2 flex w-full items-center justify-center rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-accent-foreground dark:text-purple-300 transition-all hover:bg-primary/20 hover:text-accent-foreground dark:hover:text-purple-200"
			>
				{expandirOpcoes ? 'Ocultar opções avançadas' : '+ Menção, Professor ou Equivalência'}
			</button>
			
			{#if expandirOpcoes}
				<div class="mt-3 space-y-3">
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label for="manual-mencao" class="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Menção</label>
							<select id="manual-mencao" bind:value={manualMencao} class="w-full rounded-md border border-border-strong bg-foreground/5 px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none">
								<option value="">-</option>
								<option value="SS">SS</option>
								<option value="MS">MS</option>
								<option value="MM">MM</option>
								<option value="MI">MI</option>
								<option value="II">II</option>
								<option value="SR">SR</option>
							</select>
						</div>
						<div>
							<label for="manual-equivalencia" class="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Equivalência</label>
							<input id="manual-equivalencia" type="text" bind:value={manualEquivalencia} placeholder="Ex: FGA0168" class="w-full rounded-md border border-border-strong bg-foreground/5 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground dark:placeholder:text-foreground/30 focus:border-ring focus:outline-none" />
						</div>
					</div>
					<div>
						<label for="manual-professor" class="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Professor</label>
						<input id="manual-professor" type="text" bind:value={manualProfessor} placeholder="Nome do professor" class="w-full rounded-md border border-border-strong bg-foreground/5 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground dark:placeholder:text-foreground/30 focus:border-ring focus:outline-none" />
					</div>
					<button type="button" disabled={salvandoManual} onclick={salvarManual} class="w-full rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 dark:bg-purple-600 dark:hover:bg-purple-500 disabled:opacity-50">
						{#if salvandoManual}<Loader2 class="inline h-3 w-3 animate-spin" />{:else}Salvar Opções{/if}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
