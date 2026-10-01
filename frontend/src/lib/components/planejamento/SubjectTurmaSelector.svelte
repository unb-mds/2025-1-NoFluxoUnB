<script lang="ts">
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { unidadeCargaStore } from '$lib/stores/unidade-carga.store.svelte';
	import { montadorChatStore } from '$lib/stores/assistente-chat.store.svelte';
	import TurmaOption from './TurmaOption.svelte';
	import MateriaNaturezaBadge from '$lib/components/materia/MateriaNaturezaBadge.svelte';
	import type { Turno } from '$lib/utils/horario-slots';
	import { TriangleAlert, Star, Trash2, Info, Bot, GraduationCap, Lock } from 'lucide-svelte';

	// Alterna a turma de uma matéria: clicar na já selecionada remove; senão seleciona.
	function toggle(codigo: string, idTurma: number) {
		if (gradeStore.turmaSelecionada(codigo)?.turma.id_turmas === idTurma) {
			gradeStore.removerTurma(codigo);
		} else {
			gradeStore.selecionarTurma(codigo, idTurma);
		}
	}

	/**
	 * Painel "Perguntar pra Darcy" aberto por matéria, e o que o aluno marcou nele.
	 * Fica só neste componente (não é filtro do `gradeStore` — vira frase pro chat,
	 * então não precisa sobreviver a um reload) e escolhido, não digitado: o aluno
	 * marca turno/professor de uma lista real em vez de errar o nome de cabeça.
	 */
	let painelAberto = $state<string | null>(null);
	let turnoEscolhido = $state<Record<string, Turno[]>>({});
	let docenteEscolhido = $state<Record<string, string | null>>({});

	const TURNOS: ReadonlyArray<[Turno, string]> = [
		['M', 'Manhã'],
		['T', 'Tarde'],
		['N', 'Noite']
	];
	const TURNO_FRASE: Record<Turno, string> = { M: 'de manhã', T: 'à tarde', N: 'à noite' };

	function toggleTurnoEscolhido(codigo: string, t: Turno) {
		const atual = turnoEscolhido[codigo] ?? [];
		turnoEscolhido = {
			...turnoEscolhido,
			[codigo]: atual.includes(t) ? atual.filter((x) => x !== t) : [...atual, t]
		};
	}

	/**
	 * Abre o chat da Darcy com a matéria e o que o aluno escolheu (turno/professor)
	 * já em frase no campo de mensagem — ele confere e manda, ou completa à mão.
	 */
	function pedirPraDarcy(codigo: string, nome: string) {
		const turnos = turnoEscolhido[codigo] ?? [];
		const docente = docenteEscolhido[codigo];
		const partes: string[] = [];
		if (turnos.length > 0) partes.push(TURNOS.filter(([t]) => turnos.includes(t)).map(([t]) => TURNO_FRASE[t]).join(' ou '));
		if (docente) partes.push(`com o(a) professor(a) ${docente}`);
		const pedido = partes.length > 0 ? ` ${partes.join(', ')}` : ' com ';
		montadorChatStore.pedirAbertura(`Quero ${nome} (${codigo})${pedido}`);
	}

	function handleOutsideInteraction(e: Event) {
		const target = e.target as HTMLElement | null;
		if (target && !target.closest('section[data-materia-card="true"]')) {
			gradeStore.setHover(null);
		}
	}
</script>

<svelte:window onclick={handleOutsideInteraction} ontouchstart={handleOutsideInteraction} />


<div class="space-y-3" data-tour="escolher-turma">
	{#each gradeStore.pool as materia (materia.codigo)}
		{@const cor = gradeStore.corDaMateria(materia.codigo)}
		{@const selecionada = gradeStore.turmaSelecionada(materia.codigo)}
		{@const prioritaria = gradeStore.isPrioritaria(materia.codigo)}
		<!-- Matéria que mudou de código: as turmas vêm todas do substituto, então basta a 1ª. -->
		{@const codigoOfertado = materia.turmas[0]?.codigoOfertado}
		<section
			class="rounded-2xl border border-border bg-card dark:bg-background/80 p-3"
			role="group"
			data-materia-card="true"
			onmouseenter={() => gradeStore.setHover(materia.codigo)}
			onmouseleave={() => gradeStore.setHover(null)}
		>
			<header class="mb-2.5 flex items-start gap-2.5 border-b border-border pb-2.5">
				<span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full {cor.dot}"></span>
				<div class="min-w-0 flex-1">
					<p class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
						<span class="font-mono text-sm font-semibold text-foreground/90">{materia.codigo}</span>
						<!--
							Sem a etiqueta o aluno não distingue o que a montagem priorizou:
							obrigatória, optativa e módulo livre saíam com a mesma cara na lista,
							e a ordem parecia arbitrária.
						-->
						<MateriaNaturezaBadge
							natureza={materia.optatoria ? 'optatoria' : (materia.natureza ?? 'obrigatoria')}
							nomesQueExigem={gradeStore.obrigatoriasQueExigem(materia.codigo)}
						/>
						<span class="truncate text-xs text-muted-foreground">{materia.nome}</span>
					</p>
					<p class="mt-0.5 text-[11px] text-muted-foreground">
						{unidadeCargaStore.formatar(materia.creditos)} ·
						{#if selecionada}
							<span class="text-foreground/70">Turma {selecionada.turma.turma} selecionada</span>
						{:else if materia.turmas.length === 0}
							<span class="text-amber-800 dark:text-amber-300/80">Sem turma ofertada neste período</span>
						{:else}
							{materia.turmas.length} turma(s) disponível(is)
						{/if}
					</p>
					{#if gradeStore.isCursandoAtual(materia.codigo)}
						<p class="mt-1 flex items-start gap-1 text-[10px] font-medium text-emerald-800 dark:text-emerald-300/90">
							<GraduationCap class="mt-px h-3 w-3 shrink-0" />
							{#if gradeStore.isTravada(materia.codigo)}
								<span class="flex items-center gap-1">
									<Lock class="h-2.5 w-2.5 shrink-0" /> Já cursando — turma travada, "Montar grade"
									não troca.
									<button
										type="button"
										onclick={() => gradeStore.destravar(materia.codigo)}
										class="underline decoration-dotted underline-offset-2 hover:text-emerald-900 dark:hover:text-emerald-200"
									>
										Destravar
									</button>
								</span>
							{:else}
								<span>Já cursando — escolha a turma real que você está abaixo.</span>
							{/if}
						</p>
						{:else if gradeStore.isTravada(materia.codigo)}
							<!--
								Trava de escolha manual. Sem este aviso o cadeado ficaria invisível
								para quem não está cursando a matéria: o aluno escolheria a turma,
								"Montar grade" (com razão) não mexeria mais nela, e ele não teria
								como saber por quê nem como soltar.
							-->
							<p class="mt-1 flex items-start gap-1 text-[10px] font-medium text-muted-foreground">
								<Lock class="mt-px h-2.5 w-2.5 shrink-0" />
								<span class="flex items-center gap-1">
									Turma escolhida por você — "Montar grade" não troca.
									<button
										type="button"
										onclick={() => gradeStore.destravar(materia.codigo)}
										class="underline decoration-dotted underline-offset-2 hover:text-foreground/90"
									>
										Destravar
									</button>
								</span>
							</p>
					{/if}
					{#if codigoOfertado}
						<p class="mt-1 flex items-start gap-1 text-[10px] font-medium text-sky-700 dark:text-sky-300/90">
							<Info class="mt-px h-3 w-3 shrink-0" />
							<span>
								Ofertada como <span class="font-mono font-semibold">{codigoOfertado}</span> — é nesse
								código que você se matricula
							</span>
						</p>
					{/if}
					{#if materia.avisoPreRequisito}
						<p class="mt-1 flex items-start gap-1 text-[10px] font-medium text-amber-800 dark:text-amber-300/90">
							<TriangleAlert class="mt-px h-3 w-3 shrink-0" />
							<span>Pré-requisito pendente: {materia.avisoPreRequisito}</span>
						</p>
					{/if}
				</div>
				<div class="flex shrink-0 items-center gap-0.5">
					<button
						type="button"
						onclick={() => gradeStore.togglePrioridade(materia.codigo)}
						title={prioritaria
							? 'Prioritária ao montar a grade — clique p/ remover'
							: 'Priorizar ao montar a grade'}
						aria-pressed={prioritaria}
						class="touch-manipulation rounded-lg p-1.5 transition-colors {prioritaria
							? 'text-amber-600 hover:bg-amber-400/10 dark:text-amber-300'
							: 'text-muted-foreground/70 hover:bg-foreground/10 hover:text-muted-foreground'}"
					>
						<Star class="h-4 w-4 {prioritaria ? 'fill-current' : ''}" />
					</button>
					<button
						type="button"
						onclick={() => gradeStore.removerMateriaDoPool(materia.codigo)}
						title="Remover matéria da lista"
						aria-label="Remover {materia.codigo} da lista"
						class="touch-manipulation rounded-lg p-1.5 text-muted-foreground/70 transition-colors hover:bg-red-500/15 hover:text-red-700 dark:hover:text-red-300"
					>
						<Trash2 class="h-4 w-4" />
					</button>
				</div>
			</header>

			{#if materia.turmas.length > 0}
				{@const docentes = gradeStore.docentesDe(materia.codigo)}
				{@const aberto = painelAberto === materia.codigo}
				{@const turnosSel = turnoEscolhido[materia.codigo] ?? []}

				<!-- Turno/professor específico não é mais um filtro manual (era bônus
				     fraco de desempate e raramente mudava algo visível) — o aluno escolhe
				     aqui e isso vira pedido em linguagem natural pra Darcy resolver. -->
				<div class="mb-2">
					<button
						type="button"
						onclick={() => (painelAberto = aberto ? null : materia.codigo)}
						aria-expanded={aberto}
						class="inline-flex max-w-full touch-manipulation items-center gap-1.5 rounded-full border border-ai/30 bg-ai-soft px-2.5 py-1 text-[10px] font-medium text-ai transition-colors hover:bg-primary/15 dark:border-pink-300/30 dark:bg-pink-500/10 dark:text-pink-100 dark:hover:bg-pink-500/20"
					>
						<Bot class="h-3 w-3 shrink-0" />
						Prefiro um horário ou professor específico
					</button>

					{#if aberto}
						<div class="mt-2 space-y-2 rounded-xl border border-border bg-background dark:bg-black/30 p-2.5">
							<div class="flex flex-wrap items-center gap-1.5">
								<span class="text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
									>Turno</span
								>
								{#each TURNOS as [t, label] (t)}
									{@const ativo = turnosSel.includes(t)}
									<button
										type="button"
										onclick={() => toggleTurnoEscolhido(materia.codigo, t)}
										aria-pressed={ativo}
										class="touch-manipulation rounded-full border px-2 py-1 text-[10px] font-medium transition-colors {ativo
											? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-300/45 dark:bg-sky-500/20 dark:text-sky-100'
											: 'border-border bg-foreground/5 text-muted-foreground hover:bg-foreground/10'}"
									>
										{label}
									</button>
								{/each}
							</div>

							{#if docentes.length > 0}
								<label class="flex items-center gap-2">
									<span class="text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
										>Prof.</span
									>
									<select
										value={docenteEscolhido[materia.codigo] ?? ''}
										onchange={(e) =>
											(docenteEscolhido = {
												...docenteEscolhido,
												[materia.codigo]: (e.currentTarget as HTMLSelectElement).value || null
											})}
										class="min-w-0 flex-1 rounded-lg border border-border bg-background dark:bg-zinc-900 px-2 py-1 text-[11px] text-foreground/80 focus:ring-1 focus:ring-ring/50 dark:focus:ring-sky-400/50 focus:outline-none"
									>
										<option value="">Tanto faz</option>
										{#each docentes as d (d)}
											<option value={d}>{d}</option>
										{/each}
									</select>
								</label>
							{:else}
								<p class="text-[10px] text-muted-foreground">Nenhuma turma tem docente informado.</p>
							{/if}

							<button
								type="button"
								onclick={() => pedirPraDarcy(materia.codigo, materia.nome)}
								class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-ai/30 bg-ai-soft px-2.5 py-1.5 text-[11px] font-semibold text-ai transition-colors hover:bg-primary/15 dark:border-pink-300/35 dark:bg-pink-500/15 dark:text-pink-100 dark:hover:bg-pink-500/25"
							>
								<Bot class="h-3.5 w-3.5" /> Perguntar pra Darcy
							</button>
						</div>
					{/if}
				</div>

				<div class="max-h-60 space-y-1.5 overflow-y-auto pr-0.5">
					{#each materia.turmas as tg (tg.turma.id_turmas)}
						<TurmaOption
							codigo={materia.codigo}
							{tg}
							onToggle={() => toggle(materia.codigo, tg.turma.id_turmas)}
						/>
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</div>
