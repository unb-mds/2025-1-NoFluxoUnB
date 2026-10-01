<script lang="ts">
	/**
	 * O que ainda falta ao aluno para se formar — a informação que faz o Montador
	 * deixar de ser só um encaixador de horários.
	 *
	 * Explica o que a montagem automática decidiu por trás: quando ele vê "optativa
	 * cumprida" aqui, a ausência de optativas na lista deixa de parecer bug. E é
	 * daqui que sai a pergunta de módulo livre, que só faz sentido para quem ainda
	 * deve essa carga.
	 *
	 * Números em horas ou créditos conforme a preferência da tela — mas a fonte é
	 * sempre horas, que é como a matriz declara a exigência.
	 */
	import type { SituacaoAcademica, NaturezaCH } from '$lib/services/situacao-academica.service';
	import { unidadeCargaStore } from '$lib/stores/unidade-carga.store.svelte';
	import { horasParaCreditos } from '$lib/types/matriz';
	import { GraduationCap, Check, Info, Sparkles, Loader2 } from 'lucide-svelte';
	import HelpTip from '$lib/components/onboarding/HelpTip.svelte';

	let {
		situacao,
		carregando = false,
		compacto = false,
		obrigatoriasSemOferta = [],
		periodo = null,
		moduloLivre = null,
		buscandoModuloLivre = false,
		sugestoes = [],
		naGrade = new Set<string>(),
		onResponderModuloLivre,
		onBuscarModuloLivre,
		onIncluir
	}: {
		situacao: SituacaoAcademica | null;
		carregando?: boolean;
		compacto?: boolean;
		obrigatoriasSemOferta?: string[];
		periodo?: string | null;
		/** Resposta já dada pelo aluno, ou `null` se ainda não perguntamos. */
		moduloLivre?: { quer: boolean | null; tema?: string } | null;
		buscandoModuloLivre?: boolean;
		sugestoes?: Array<{ codigo: string; nome: string; creditos: number }>;
		naGrade?: Set<string>;
		onResponderModuloLivre?: (quer: boolean, tema?: string) => void;
		onBuscarModuloLivre?: (tema: string) => void;
		onIncluir?: (codigo: string) => void;
	} = $props();

	const ROTULOS: Record<NaturezaCH, string> = {
		obrigatoria: 'Obrigatórias',
		optativa: 'Optativas',
		modulo_livre: 'Módulo livre'
	};

	/** Cores por natureza, as mesmas do painel de carga horária do fluxograma. */
	const CORES: Record<NaturezaCH, string> = {
		obrigatoria: 'bg-blue-600 dark:bg-blue-400',
		optativa: 'bg-purple-600 dark:bg-purple-400',
		modulo_livre: 'bg-amber-700 dark:bg-amber-400'
	};

	/**
	 * As barras a mostrar. Módulo livre só aparece quando a matriz o exige —
	 * inventar uma exigência que o curso não faz confundiria mais do que ajudaria.
	 */
	const linhas = $derived.by(() => {
		if (!situacao) return [];
		const naturezas: NaturezaCH[] = ['obrigatoria', 'optativa'];
		if (situacao.exigeModuloLivre) naturezas.push('modulo_livre');

		return naturezas.map((n) => {
			const faltam = situacao.faltam[n];
			const exigido = situacao.exigido[n];
			const realizado = situacao.realizado[n];
			return {
				natureza: n,
				rotulo: ROTULOS[n],
				cor: CORES[n],
				faltam,
				exigido,
				realizado,
				// `null` é "não deu para saber": a barra fica vazia e cinza, e o texto diz
				// isso em vez de mostrar um zero que o aluno leria como "está tudo certo".
				desconhecido: faltam === null,
				cumprida: faltam !== null && faltam <= 0,
				pct: exigido > 0 ? Math.min(100, Math.round((realizado / exigido) * 100)) : 0
			};
		});
	});

	/** Formata horas na unidade que o aluno escolheu na barra do montador. */
	function formatar(horas: number): string {
		return unidadeCargaStore.unidade === 'horas'
			? `${horas.toLocaleString('pt-BR')}h`
			: `${horasParaCreditos(horas).toLocaleString('pt-BR')} cr`;
	}

	/** Pergunta pendente: a matriz exige módulo livre, ainda falta, e ele não respondeu. */
	const perguntarModuloLivre = $derived(
		!!situacao &&
			situacao.exigeModuloLivre &&
			situacao.faltam.modulo_livre !== null &&
			situacao.faltam.modulo_livre > 0 &&
			(moduloLivre?.quer ?? null) === null
	);

	const querModuloLivre = $derived(moduloLivre?.quer === true);

	let tema = $state('');
	$effect(() => {
		tema = moduloLivre?.tema ?? '';
	});

	function confirmarTema(): void {
		const t = tema.trim();
		if (t.length < 2) return;
		onResponderModuloLivre?.(true, t);
		onBuscarModuloLivre?.(t);
	}
</script>

<section class="rounded-2xl border border-border bg-card dark:bg-background/80 p-3" data-tour="situacao">
	<header class="mb-2.5 flex items-center justify-between border-b border-border pb-2">
		<p
			class="flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-foreground/80 uppercase"
		>
			<GraduationCap class="h-3.5 w-3.5" />
			{compacto ? 'Situação' : '1 · Situação'}
			<HelpTip
				title="O que ainda falta pra você"
				text="A carga horária que seu curso exige contra a que você já cumpriu. É por isto que o “Montar grade” prioriza umas matérias e para de sugerir outras."
			/>
		</p>
	</header>

	{#if carregando}
		<p class="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
			<Loader2 class="h-3.5 w-3.5 animate-spin" /> Vendo sua situação…
		</p>
	{:else if !situacao}
		<!--
			Falhar aqui não pode contaminar o resto: o montador continua montando, só
			sem saber o saldo. Dizer isso é melhor do que sumir com o painel, senão o
			aluno não entende por que a aba está vazia.
		-->
		<p class="py-5 text-center text-xs text-muted-foreground">
			Não consegui carregar sua situação agora. A grade continua sendo montada
			normalmente.
		</p>
	{:else}
		<ul class="space-y-2.5">
			{#each linhas as l (l.natureza)}
				<li>
					<div class="flex items-baseline justify-between gap-2">
						<span class="text-[11px] font-medium text-foreground/75">{l.rotulo}</span>
						{#if l.desconhecido}
							<span class="text-[10px] text-muted-foreground">sem dado</span>
						{:else}
							<span class="text-[10px] tabular-nums text-muted-foreground">
								{formatar(l.realizado)} / {formatar(l.exigido)}
							</span>
						{/if}
					</div>
					<span class="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
						{#if !l.desconhecido}
							<span
								class="block h-full rounded-full transition-all {l.cumprida
									? 'bg-emerald-700 dark:bg-emerald-400'
									: l.cor}"
								style="width: {l.pct}%"
							></span>
						{/if}
					</span>
					<p class="mt-1 text-[10px] {l.cumprida ? 'text-emerald-800 dark:text-emerald-300/90' : 'text-muted-foreground'}">
						{#if l.desconhecido}
							<!--
								Só a carga complementar cai aqui: o cálculo por disciplinas nunca
								classifica uma matéria como complementar, então o realizado dela é
								zero por ausência de dado, não por medição. Dizer "faltam 120h"
								nesse caso seria inventar.
							-->
							Seu histórico não traz essa carga — não dá pra afirmar quanto falta.
						{:else if l.cumprida}
							<span class="inline-flex items-center gap-1">
								<Check class="h-3 w-3" /> cumprida
							</span>
						{:else}
							faltam {formatar(l.faltam ?? 0)}
						{/if}
					</p>
				</li>
			{/each}
		</ul>

		{#if obrigatoriasSemOferta.length > 0}
			<!--
				Obrigatória que falta e não é ofertada não entra na lista (sem turma não
				vira bloco no calendário), mas some calada seria pior: é informação que
				muda o planejamento — não adianta esperar por ela neste semestre.
			-->
			<p
				class="mt-2.5 rounded-lg border border-border bg-foreground/5 px-2.5 py-2 text-[10px] text-muted-foreground"
			>
				{obrigatoriasSemOferta.length === 1
					? 'Uma obrigatória sua não tem'
					: `${obrigatoriasSemOferta.length} obrigatórias suas não têm`}
				turma em {periodo ?? 'neste semestre'}: {obrigatoriasSemOferta.slice(0, 6).join(' · ')}{obrigatoriasSemOferta.length >
				6
					? ` e mais ${obrigatoriasSemOferta.length - 6}`
					: ''}.
			</p>
		{/if}

		{#if perguntarModuloLivre}
			<!--
				Card, não modal: a tela já abre com o tour e o changelog disputando a
				atenção do aluno, e uma terceira interrupção seria demais.
			-->
			<div
				class="mt-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-300/25 dark:bg-amber-500/8 px-2.5 py-2.5"
			>
				<p class="flex items-start gap-1.5 text-[11px] text-amber-900 dark:text-amber-100/90">
					<Info class="mt-px h-3.5 w-3.5 shrink-0" />
					<span>
						Faltam {formatar(situacao.faltam.modulo_livre ?? 0)} de módulo livre — matéria
						de fora do seu curso. Quer incluir na grade?
					</span>
				</p>
				<div class="mt-2 flex gap-1.5">
					<button
						type="button"
						onclick={() => onResponderModuloLivre?.(true)}
						class="flex-1 touch-manipulation rounded-full bg-amber-400/90 px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-amber-300"
					>
						Quero
					</button>
					<button
						type="button"
						onclick={() => onResponderModuloLivre?.(false)}
						class="flex-1 touch-manipulation rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5"
					>
						Agora não
					</button>
				</div>
			</div>
		{:else if querModuloLivre}
			<div class="mt-3 rounded-xl border border-border bg-foreground/[0.03] px-2.5 py-2.5">
				<p class="flex items-center gap-1.5 text-[11px] font-medium text-foreground/70">
					<Sparkles class="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" /> Módulo livre
				</p>
				<!--
					O tema não é enfeite: módulo livre é tudo o que está fora da matriz, ou
					seja, o catálogo inteiro da UnB. Sem um recorte não há recomendação a
					fazer — só uma lista em ordem de código fingindo ser uma.
				-->
				<p class="mt-1 text-[10px] text-muted-foreground">
					Sobre o que te interessa? Ex.: música, libras, robótica, direito.
				</p>
				<div class="mt-1.5 flex gap-1.5">
					<input
						type="text"
						bind:value={tema}
						onkeydown={(e) => e.key === 'Enter' && confirmarTema()}
						placeholder="um assunto"
						class="min-w-0 flex-1 rounded-lg border border-border-strong bg-background px-2.5 py-1.5 text-[11px] text-foreground/85 placeholder:text-muted-foreground focus:border-amber-700 dark:border-border dark:bg-black/30 dark:focus:border-amber-300/40 focus:outline-none"
					/>
					<button
						type="button"
						onclick={confirmarTema}
						disabled={tema.trim().length < 2 || buscandoModuloLivre}
						class="shrink-0 touch-manipulation rounded-lg bg-amber-400/90 px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-amber-300 disabled:opacity-40"
					>
						{#if buscandoModuloLivre}
							<Loader2 class="h-3.5 w-3.5 animate-spin" />
						{:else}
							Buscar
						{/if}
					</button>
				</div>

				{#if sugestoes.length > 0}
					<ul class="mt-2 space-y-1.5">
						{#each sugestoes as s (s.codigo)}
							{@const dentro = naGrade.has(s.codigo)}
							<li class="flex items-start gap-2 rounded-lg bg-muted/50 dark:bg-black/20 px-2 py-1.5">
								<div class="min-w-0 flex-1">
									<p class="font-mono text-[11px] font-semibold text-foreground/85">{s.codigo}</p>
									<p class="truncate text-[10px] text-muted-foreground">{s.nome}</p>
								</div>
								<button
									type="button"
									onclick={() => onIncluir?.(s.codigo)}
									disabled={dentro}
									class="shrink-0 touch-manipulation rounded-full border px-2 py-1 text-[10px] font-medium transition-colors {dentro
										? 'border-emerald-300 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300/80'
										: 'border-border text-muted-foreground hover:bg-foreground/10'}"
								>
									{dentro ? 'na lista' : 'Incluir'}
								</button>
							</li>
						{/each}
					</ul>
				{:else if tema.trim().length >= 2 && !buscandoModuloLivre}
					<p class="mt-2 text-[10px] text-muted-foreground">
						Nada com turma neste semestre sobre isso. Tente outro assunto ou veja a
						oferta completa na busca de turmas.
					</p>
				{/if}
			</div>
		{:else if moduloLivre?.quer === false && situacao.exigeModuloLivre}
			<!-- Dispensar a sugestão não apaga a pendência: as horas continuam faltando. -->
			<p class="mt-2.5 text-[10px] text-muted-foreground">
				Você dispensou o módulo livre por ora.
				<button
					type="button"
					onclick={() => onResponderModuloLivre?.(true)}
					class="underline decoration-dotted underline-offset-2 hover:text-muted-foreground"
				>
					mudar
				</button>
			</p>
		{/if}

		<!--
			Proveniência: sem isto o aluno não entende por que o número aqui pode
			divergir do que ele lê no SIGAA.
		-->
		<p class="mt-2.5 border-t border-border pt-2 text-[10px] text-muted-foreground">
			{situacao.complementarConfiavel
				? 'Fonte: carga horária do seu histórico do SIGAA.'
				: 'Fonte: soma das disciplinas concluídas na sua matriz.'}
		</p>
	{/if}
</section>
