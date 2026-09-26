<script lang="ts">
	import { vagaNotificacaoService } from '$lib/services/vaga-notificacao.service';
	import { getPeriodoAtivo } from '$lib/services/turmas.service';
	import { getOfertaDeMateria, type TurmaResolvida } from '$lib/services/oferta-turmas.service';
	import type { LinhaEquivalencia } from '$lib/utils/oferta-equivalencia';
	import type { VagaAssinatura } from '$lib/types/notificacao';
	import { Bell, BellOff, Loader2 } from 'lucide-svelte';
	import { toast } from '$lib/utils/toast';

	interface Props {
		idMateria: number;
		codigoMateria?: string;
		nomeMateria?: string;
		/**
		 * Equivalências da matriz, quando a tela tem curso carregado. Sem elas a busca
		 * degrada para a oferta do próprio código (caso da matéria global, sem matriz).
		 */
		equivalencias?: LinhaEquivalencia[];
	}

	let { idMateria, codigoMateria, nomeMateria, equivalencias = [] }: Props = $props();

	// Oferta resolvida por equivalência — a matéria pode ter mudado de código e a turma
	// ser publicada sob o novo. Mesma regra do Montador de Grade e da aba Turmas do
	// fluxograma (ver oferta-turmas.service.ts).
	let turmas = $state<TurmaResolvida[]>([]);
	let carregandoTurmas = $state(false);
	let erroTurmas = $state<string | null>(null);

	/** Código sob o qual a oferta saiu, quando difere do da matriz. */
	const codigoOfertado = $derived(turmas[0]?.codigoOfertado ?? null);

	let assinaturas = $state<VagaAssinatura[]>([]);
	let carregandoAssinaturas = $state(false);

	let acaoEmAndamento = $state<string | null>(null);
	let erroAcao = $state<string | null>(null);

	let periodoAtual = $state<string | null>(null);

	/**
	 * A assinatura de vaga é gravada contra a matéria que de fato tem a oferta — que é o
	 * substituto quando a matéria mudou de código, senão a própria.
	 */
	const idMateriaOferta = $derived(turmas[0]?.turma.id_materia ?? idMateria);

	function assinaturaKey(turma: string | null, anoPeriodo: string): string {
		return `${turma ?? '__toda__'}::${anoPeriodo}`;
	}

	function encontrarAssinatura(turma: string | null, anoPeriodo: string): VagaAssinatura | null {
		return (
			assinaturas.find(
				(a) =>
					a.ativa &&
					a.id_materia === idMateriaOferta &&
					(a.turma ?? null) === turma &&
					a.ano_periodo === anoPeriodo
			) ?? null
		);
	}

	async function carregarTurmas() {
		carregandoTurmas = true;
		erroTurmas = null;
		try {
			periodoAtual = await getPeriodoAtivo();
			turmas = await getOfertaDeMateria(
				codigoMateria ?? '',
				idMateria,
				equivalencias,
				periodoAtual
			);
		} catch (e: unknown) {
			erroTurmas = e instanceof Error ? e.message : 'Erro ao carregar turmas.';
			turmas = [];
		} finally {
			carregandoTurmas = false;
		}
	}

	async function carregarAssinaturas() {
		carregandoAssinaturas = true;
		try {
			assinaturas = await vagaNotificacaoService.listarMinhasAssinaturas();
		} catch {
			// Falha ao carregar assinaturas não deve travar a listagem de turmas.
			assinaturas = [];
		} finally {
			carregandoAssinaturas = false;
		}
	}

	async function alternarSeguir(turma: string | null, anoPeriodo: string) {
		const key = assinaturaKey(turma, anoPeriodo);
		acaoEmAndamento = key;
		erroAcao = null;
		try {
			const existente = encontrarAssinatura(turma, anoPeriodo);
			if (existente) {
				await vagaNotificacaoService.deixarDeSeguir(existente.id_assinatura);
				toast.success('Você não vai mais receber avisos dessa turma.');
			} else {
				await vagaNotificacaoService.seguirMateria(idMateriaOferta, turma, anoPeriodo);
				toast.success('Pronto! Você vai ser avisado quando abrir vaga.');
			}
			await carregarAssinaturas();
		} catch (e: unknown) {
			erroAcao = e instanceof Error ? e.message : 'Erro ao atualizar acompanhamento.';
			toast.error(erroAcao);
		} finally {
			acaoEmAndamento = null;
		}
	}

	$effect(() => {
		void idMateria;
		void codigoMateria;
		turmas = [];
		carregarTurmas();
		carregarAssinaturas();
	});
</script>

<section class="rounded-2xl border border-border bg-card/80 dark:bg-background/80 p-4 sm:p-5">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
		<p class="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/80">
			Turmas e vagas{#if codigoMateria} · <span class="font-mono text-ai">{codigoMateria}</span>{/if}
			{#if periodoAtual}
				<span class="ml-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] normal-case tracking-normal text-muted-foreground">
					{periodoAtual}
				</span>
			{/if}
		</p>
		{#if !carregandoTurmas && !erroTurmas && turmas.length > 0 && periodoAtual}
			<button
				type="button"
				disabled={acaoEmAndamento === assinaturaKey(null, periodoAtual)}
				onclick={() => alternarSeguir(null, periodoAtual!)}
				class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 {encontrarAssinatura(
					null,
					periodoAtual
				)
					? 'border-primary/45 bg-primary/15 text-accent-foreground hover:bg-primary/25'
					: 'border-border bg-muted/60 text-foreground/70 hover:bg-muted'}"
			>
				{#if acaoEmAndamento === assinaturaKey(null, periodoAtual)}
					<Loader2 class="h-3 w-3 animate-spin" />
				{:else if encontrarAssinatura(null, periodoAtual)}
					<Bell class="h-3 w-3" />
				{:else}
					<BellOff class="h-3 w-3" />
				{/if}
				{encontrarAssinatura(null, periodoAtual) ? 'Seguindo toda a matéria' : 'Seguir toda a matéria'}
			</button>
		{/if}
	</div>

	{#if erroAcao}
		<p class="mb-2 text-xs text-red-700 dark:text-red-300/85">{erroAcao}</p>
	{/if}

	{#if carregandoTurmas}
		<p class="flex items-center gap-2 text-xs text-muted-foreground">
			<Loader2 class="h-3.5 w-3.5 animate-spin" /> Carregando turmas...
		</p>
	{:else if erroTurmas}
		<p class="text-xs text-red-700 dark:text-red-300/85">{erroTurmas}</p>
	{:else if turmas.length === 0}
		<p class="text-xs text-muted-foreground">
			Nenhuma turma cadastrada{#if nomeMateria} para {nomeMateria}{/if} no período {periodoAtual ??
				'atual'}.
		</p>
	{:else}
		<div class="space-y-2">
			{#if codigoOfertado}
				<p class="rounded-xl border border-sky-300/25 bg-sky-500/10 px-3 py-2 text-[11px] leading-snug text-sky-800 dark:text-sky-200/90">
					Ofertada como <span class="font-mono font-semibold">{codigoOfertado}</span> neste período —
					é nesse código que você se matricula.
				</p>
			{/if}
			{#each turmas as { turma: t } (t.id_turmas)}
				{@const seguindo = encontrarAssinatura(t.turma, t.ano_periodo)}
				{@const key = assinaturaKey(t.turma, t.ano_periodo)}
				<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/80 dark:bg-black/25 px-3 py-2.5">
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-mono text-xs font-semibold text-ai">Turma {t.turma}</span>
							<span class="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
								{t.ano_periodo}
							</span>
							{#if t.vagas_sobrando != null}
								<span
									class="rounded-full border px-2 py-0.5 text-[10px] font-semibold {t.vagas_sobrando > 0
										? 'border-emerald-300/45 bg-emerald-500/18 text-emerald-800 dark:text-emerald-100'
										: 'border-red-300/40 bg-red-500/15 text-red-800 dark:text-red-200'}"
								>
									{t.vagas_sobrando > 0 ? `${t.vagas_sobrando} vaga(s) livre(s)` : 'Sem vagas'}
								</span>
							{/if}
						</div>
						<p class="mt-1 text-xs text-muted-foreground">
							{#if t.docente}{t.docente}{:else}Docente não informado{/if}
							{#if t.horario} · {t.horario}{/if}
							{#if t.local} · {t.local}{/if}
						</p>
						{#if t.vagas_ofertadas != null || t.vagas_ocupadas != null}
							<p class="mt-0.5 text-[11px] text-muted-foreground">
								Ofertadas: {t.vagas_ofertadas ?? '—'} · Ocupadas: {t.vagas_ocupadas ?? '—'}
							</p>
						{/if}
					</div>
					<button
						type="button"
						disabled={acaoEmAndamento === key}
						onclick={() => alternarSeguir(t.turma, t.ano_periodo)}
						class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 {seguindo
							? 'border-primary/45 bg-primary/15 text-accent-foreground hover:bg-primary/25'
							: 'border-border bg-muted/60 text-foreground/70 hover:bg-muted'}"
					>
						{#if acaoEmAndamento === key}
							<Loader2 class="h-3 w-3 animate-spin" />
						{:else if seguindo}
							<Bell class="h-3 w-3" />
						{:else}
							<BellOff class="h-3 w-3" />
						{/if}
						{seguindo ? 'Parar de seguir' : 'Seguir esta turma'}
					</button>
				</div>
			{/each}
		</div>
	{/if}
	{#if carregandoAssinaturas && !carregandoTurmas}
		<p class="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
			<Loader2 class="h-3 w-3 animate-spin" /> Sincronizando suas assinaturas...
		</p>
	{/if}
</section>
