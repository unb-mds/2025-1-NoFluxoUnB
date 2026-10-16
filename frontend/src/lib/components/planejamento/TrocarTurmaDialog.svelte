<script lang="ts">
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { unidadeCargaStore } from '$lib/stores/unidade-carga.store.svelte';
	import { darcyStore } from '$lib/stores/darcy.store.svelte';
	import TurmaOption from './TurmaOption.svelte';
	import TurmaStatusBadge from './TurmaStatusBadge.svelte';
	import MateriaNaturezaBadge from '$lib/components/materia/MateriaNaturezaBadge.svelte';
	import ResponsiveSheet from '$lib/components/ui/ResponsiveSheet.svelte';
	import type { Turno } from '$lib/utils/horario-slots';
	import { Ban, Bot, Check, Info, Lock, Trash2, TriangleAlert } from 'lucide-svelte';

	/**
	 * Detalhes da disciplina: é aqui que se escolhe ou troca a turma. Abre tanto
	 * pelo bloco na grade quanto pelo chip em "Suas matérias" — um lugar só para
	 * turma, avisos e o pedido de professor/horário para a Darcy.
	 */
	let { codigo, onClose }: { codigo: string | null; onClose: () => void } = $props();

	const materia = $derived(codigo ? (gradeStore.pool.find((m) => m.codigo === codigo) ?? null) : null);
	const selecionada = $derived(materia ? gradeStore.turmaSelecionada(materia.codigo) : undefined);
	let feedback = $state<string | null>(null);

	// Matéria que mudou de código: as turmas vêm todas do substituto, então basta a 1ª.
	const codigoOfertado = $derived(materia?.turmas[0]?.codigoOfertado);
	const coReqs = $derived(materia && selecionada ? gradeStore.coReqsFaltando(materia.codigo) : []);

	// Limpa o aviso e o painel da Darcy ao abrir/trocar de matéria.
	$effect(() => {
		void codigo;
		feedback = null;
		pedidoAberto = false;
		turnosPedido = [];
		docentePedido = null;
	});

	function escolher(idTurma: number) {
		if (!codigo) return;
		if (gradeStore.turmaSelecionada(codigo)?.turma.id_turmas === idTurma) {
			gradeStore.removerTurma(codigo);
			feedback = null;
			return;
		}
		const r = gradeStore.selecionarTurma(codigo, idTurma);
		feedback = r.ok ? null : r.conflitaCom ? `Conflita com ${r.conflitaCom}.` : 'Não foi possível inserir.';
	}

	/**
	 * Turno/professor específico vira pedido em linguagem natural para a Darcy (não
	 * é filtro do montador): o aluno marca de uma lista real em vez de errar o nome
	 * de cabeça, confere a frase no chat e manda.
	 */
	let pedidoAberto = $state(false);
	let turnosPedido = $state<Turno[]>([]);
	let docentePedido = $state<string | null>(null);
	const TURNOS: ReadonlyArray<[Turno, string, string]> = [
		['M', 'Manhã', 'de manhã'],
		['T', 'Tarde', 'à tarde'],
		['N', 'Noite', 'à noite']
	];

	function pedirPraDarcy() {
		if (!materia) return;
		const partes: string[] = [];
		const turnos = TURNOS.filter(([t]) => turnosPedido.includes(t)).map(([, , frase]) => frase);
		if (turnos.length > 0) partes.push(turnos.join(' ou '));
		if (docentePedido) partes.push(`com o(a) professor(a) ${docentePedido}`);
		const pedido = partes.length > 0 ? ` ${partes.join(', ')}` : ' com ';
		darcyStore.pedirAbertura(`Quero ${materia.nome} (${materia.codigo})${pedido}`);
		onClose();
	}
</script>

{#if materia}
	<ResponsiveSheet
		aberto={true}
		{onClose}
		eyebrow="Detalhes da disciplina"
		titulo={materia.codigo}
		subtitulo={materia.nome}
	>
		<div class="space-y-3 px-5 pb-4">
			<div class="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
				<MateriaNaturezaBadge
					natureza={materia.optatoria ? 'optatoria' : (materia.natureza ?? 'obrigatoria')}
					nomesQueExigem={gradeStore.obrigatoriasQueExigem(materia.codigo)}
				/>
				<span>{unidadeCargaStore.formatar(materia.creditos)}</span>
				{#if selecionada}
					<span>· Turma {selecionada.turma.turma}{selecionada.turma.docente ? ` · ${selecionada.turma.docente}` : ''}</span>
				{/if}
			</div>

			{#if gradeStore.isCursandoAtual(materia.codigo)}
				<TurmaStatusBadge status="cursando-travada">
					{#if gradeStore.isTravada(materia.codigo)}
						<span class="flex flex-wrap items-center gap-1">
							<Lock class="h-2.5 w-2.5 shrink-0" /> Já cursando — turma travada, a montagem não troca.
							<button
								type="button"
								onclick={() => gradeStore.destravar(materia.codigo)}
								class="underline decoration-dotted underline-offset-2"
							>
								Destravar
							</button>
						</span>
					{:else}
						<span>Já cursando — escolha abaixo a turma em que você está.</span>
					{/if}
				</TurmaStatusBadge>
			{:else if gradeStore.isTravada(materia.codigo)}
				<TurmaStatusBadge status="travada-manual">
					<span class="flex flex-wrap items-center gap-1">
						Turma escolhida por você — a montagem não troca.
						<button
							type="button"
							onclick={() => gradeStore.destravar(materia.codigo)}
							class="underline decoration-dotted underline-offset-2"
						>
							Destravar
						</button>
					</span>
				</TurmaStatusBadge>
			{/if}

			{#if codigoOfertado}
				<p class="flex items-start gap-1.5 text-[11px] text-sky-700 dark:text-sky-300/90">
					<Info class="mt-px h-3.5 w-3.5 shrink-0" />
					<span>
						Ofertada como <span class="font-mono font-semibold">{codigoOfertado}</span> — é nesse código
						que você se matricula.
					</span>
				</p>
			{/if}
			{#if materia.avisoPreRequisito}
				<p class="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300/90">
					<TriangleAlert class="mt-px h-3.5 w-3.5 shrink-0" />
					<span>Pré-requisito pendente: {materia.avisoPreRequisito}</span>
				</p>
			{/if}
			{#if coReqs.length > 0}
				<p class="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300/90">
					<TriangleAlert class="mt-px h-3.5 w-3.5 shrink-0" />
					<span>Co-requisito fora da grade: {coReqs.join(', ')}</span>
				</p>
			{/if}

			{#if feedback}
				<p
					class="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-300/20 dark:bg-red-500/10 dark:text-red-200"
				>
					<Ban class="h-3.5 w-3.5 shrink-0" />{feedback}
				</p>
			{/if}

			<div>
				<span class="mg-eyebrow">Turmas em oferta</span>
				{#if materia.turmas.length === 0}
					<p class="py-4 text-center text-xs text-muted-foreground">Sem turma ofertada neste período.</p>
				{:else}
					<div class="space-y-1.5">
						{#each materia.turmas as tg (tg.turma.id_turmas)}
							<TurmaOption codigo={materia.codigo} {tg} onToggle={() => escolher(tg.turma.id_turmas)} />
						{/each}
					</div>
				{/if}
			</div>

			{#if materia.turmas.length > 0}
				{@const docentes = gradeStore.docentesDe(materia.codigo)}
				<div>
					<button
						type="button"
						onclick={() => (pedidoAberto = !pedidoAberto)}
						aria-expanded={pedidoAberto}
						class="inline-flex touch-manipulation items-center gap-1.5 rounded-full border border-ai/30 bg-ai-soft px-3 py-1.5 text-[11px] font-medium text-ai transition-colors hover:bg-primary/15"
					>
						<Bot class="h-3.5 w-3.5" /> Prefiro um horário ou professor específico
					</button>
					{#if pedidoAberto}
						<div class="mg-sunken mt-2 space-y-2.5 rounded-xl p-3">
							<div class="flex flex-wrap items-center gap-1.5">
								<span class="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Turno</span>
								{#each TURNOS as [t, label] (t)}
									<button
										type="button"
										aria-pressed={turnosPedido.includes(t)}
										onclick={() =>
											(turnosPedido = turnosPedido.includes(t)
												? turnosPedido.filter((x) => x !== t)
												: [...turnosPedido, t])}
										class="mg-choice px-2.5 py-1 text-[11px] font-medium"
									>
										{label}
									</button>
								{/each}
							</div>
							{#if docentes.length > 0}
								<label class="flex items-center gap-2">
									<span class="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Prof.</span>
									<select
										value={docentePedido ?? ''}
										onchange={(e) => (docentePedido = (e.currentTarget as HTMLSelectElement).value || null)}
										class="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-ring/50 focus:outline-none"
									>
										<option value="">Tanto faz</option>
										{#each docentes as d (d)}
											<option value={d}>{d}</option>
										{/each}
									</select>
								</label>
							{/if}
							<button type="button" onclick={pedirPraDarcy} class="mg-btn mg-btn-secondary w-full text-xs">
								<Bot class="h-3.5 w-3.5" /> Perguntar pra Darcy
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#snippet footer()}
			<footer class="flex items-center gap-2 border-t border-border px-5 py-3">
				{#if selecionada}
					<button
						type="button"
						onclick={() => {
							gradeStore.removerTurma(materia.codigo);
							onClose();
						}}
						class="mg-btn mg-btn-secondary text-xs"
					>
						<Trash2 class="h-3.5 w-3.5" /> Tirar da grade
					</button>
				{/if}
				<button type="button" onclick={onClose} class="mg-btn mg-btn-primary ml-auto text-xs">
					<Check class="h-3.5 w-3.5" />
					{selecionada ? 'Manter esta turma' : 'Fechar'}
				</button>
			</footer>
		{/snippet}
	</ResponsiveSheet>
{/if}
