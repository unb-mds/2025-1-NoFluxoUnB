<script lang="ts">
	import { Loader2, BookOpenCheck, Scale, ShieldAlert,
			Clock, Percent, AlertTriangle, Check, X
	 } from 'lucide-svelte';
	import type { DadosFluxogramaUser } from '$lib/types/user';
	import type { IntegralizacaoResult } from '$lib/types/matriz';
	import {
		avaliarRequisitosMudancaCurso,
		type AvaliacaoMudancaCurso
	} from '$lib/services/mudanca-curso-requisitos.service';

	type Props = {
		dadosFluxograma: DadosFluxogramaUser;
		integralizacao: IntegralizacaoResult | null;
		integralizacaoOrigem?: IntegralizacaoResult | null;
		integralizacaoLoading?: boolean;
	};
	let { dadosFluxograma, integralizacao, 
		integralizacaoOrigem, integralizacaoLoading = false }: Props = $props();

	let avaliacao = $state<AvaliacaoMudancaCurso | null>(null);
	let avaliacaoRodando = $state(false);

	let seq = 0;

	$effect(() => {
		const id = ++seq;

		async function run() {
			if (!integralizacao || integralizacaoLoading) {
				avaliacao = null;
				if (id === seq) avaliacaoRodando = false;
				return;
			}
			avaliacaoRodando = true;
			avaliacao = null;
			const r = await avaliarRequisitosMudancaCurso(dadosFluxograma, integralizacao, integralizacaoOrigem);
			if (id !== seq) return;
			avaliacao = r;
			avaliacaoRodando = false;
		}
		void run();
	});

	let isApto = $derived(
		Boolean(avaliacao?.origem.atendeIntegralizacaoOrigem && avaliacao?.destino.atendeCargaDestino)
	);

</script>

<div
	class="rounded-xl border border-white/12 bg-black/35 p-3.5 text-sm shadow-lg backdrop-blur-md sm:p-4"
>

<!-- Cabeçalho -->
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
		<h3 class="flex items-center gap-2 font-semibold text-white/92">
			<Scale class="h-4 w-4 shrink-0 text-cyan-400" />
			Requisitos de mudança de curso (referência institucional)
		</h3>

		{#if avaliacao && !avaliacaoRodando && !integralizacaoLoading}
			<div>
				{#if isApto}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300"
					>
						<Check class="h-3 w-3" /> APTO PARA MUDANÇA
					</span>
				{:else}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300"
					>
						<X class="h-3 w-3" /> NÃO APTO
					</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if avaliacaoRodando || integralizacaoLoading}
		<div class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-4 text-xs text-white/55">
			<Loader2 class="h-4 w-4 shrink-0 animate-spin text-cyan-400" />
			Analisando seu histórico em relação a essas regras…
		</div>
	{:else if !integralizacao}
		<p class="text-xs text-white/55">Carregue a integralização para ver o indicativo de elegibilidade.</p>
	{:else}
		<p class="mb-4 text-[11px] leading-relaxed text-white/45">
			Use como guia rápido. A decisão oficial segue sempre o PPC, o histórico consolidado no SIGAA e o edital vigente da
			mudança de curso. O primeiro dia útil após as inscrições costuma servir como data de referência para a análise.
		</p>

		<div class="space-y-3">
			<!-- BLCO 1: CURSO DE ORIGEM -->
			<div class="rounded-lg border border-cyan-500/30 bg-cyan-500/[0.07] px-3 py-2.5 text-cyan-100/90 space-y-2.5">
				<div class="flex items-start gap-2">
					<BookOpenCheck class="mt-0.5 h-4 w-4 shrink-0 text-cyan-400/90" />
					<div>
						<p class="font-medium text-[13px] text-white/90">Curso de Origem · Requisitos e Limites</p>
						<p class="mt-0.5 text-[11px] leading-relaxed text-white/62">
							Exige conclusão do fluxo inicial e ausência de travas impeditivas de permanência.
						</p>
					</div>
				</div>

				{#if avaliacao}
					<!-- 1.1 Obrigatórias 1º e 2º períodos -->
					<div class="rounded-md border bg-black/25 px-2.5 py-2 text-[11px]
						{avaliacao.origem.codigosPendentes.length === 0 ? 'border-emerald-400/25 text-emerald-200/95' : 'border-amber-400/25 text-amber-100/92'}">
						<div class="flex items-center justify-between font-medium">
							<span>1. Obrigatórias dos 1º e 2º períodos (Níveis 1 e 2):</span>
							<span class="font-mono text-[10px]">
								{avaliacao.origem.obrigatoriosConcluidos}/{avaliacao.origem.obrigatoriosPeriodos12Total}
							</span>
						</div>
						{#if avaliacao.origem.atendeIntegralizacaoOrigem || avaliacao.origem.codigosPendentes.length === 0}
							<p class="mt-1 text-white/80">
								✓ Todas as obrigatórias dos dois primeiros períodos foram integralizadas.
							</p>
						{:else}
							<p class="mt-1">
								Faltam <strong>{avaliacao.origem.codigosPendentes.length}</strong> de
								{avaliacao.origem.obrigatoriosPeriodos12Total} obrigatória(s) — ex.:
								<span class="font-mono text-[10px] text-white/80"
									>{avaliacao.origem.codigosPendentes.slice(0, 5).join(', ')}{avaliacao.origem.codigosPendentes.length > 5 ? '…' : ''}</span
								>
							</p>
						{/if}
					</div>

					<!-- 1.2 Impeditivo: Limite de 75% da Carga Horária -->
					<div class="rounded-md border bg-black/25 px-2.5 py-2 text-[11px]
						{avaliacao.origem.ultrapassou75PorcentoCarga === false ? 'border-emerald-400/25 text-emerald-200/95' : avaliacao.origem.ultrapassou75PorcentoCarga === true ? 'border-rose-400/30 text-rose-200' : 'border-white/10 text-white/60'}">
						<div class="flex items-center justify-between font-medium">
							<span class="flex items-center gap-1.5">
								<Percent class="h-3.5 w-3.5 text-cyan-400/80" />
								2. Conclusão de Carga Horária (&lt; 75% do curso):
							</span>
							{#if avaliacao.origem.percentualCargaConcluida !== null}
								<span class="font-mono text-[10px]">{avaliacao.origem.percentualCargaConcluida}%</span>
							{/if}
						</div>
						{#if avaliacao.origem.ultrapassou75PorcentoCarga === true}
							<p class="mt-1 font-semibold text-rose-300">
								✕ Impeditivo: Você concluiu {avaliacao.origem.percentualCargaConcluida}% da carga total exigida pelo curso de origem (máximo permitido: 75%).
							</p>
						{:else if avaliacao.origem.ultrapassou75PorcentoCarga === false}
							<p class="mt-1 text-white/80">
								✓ Carga horária integralizada no curso atual está abaixo do limite de 75%.
							</p>
						{:else}
							<p class="mt-1 text-white/50">
								Não foi possível calcular o percentual de carga concluída da origem.
							</p>
						{/if}
					</div>

					<!-- 1.3 Impeditivo: Tempo de Permanência (50%) -->
					<div class="rounded-md border bg-black/25 px-2.5 py-2 text-[11px]
						{avaliacao.origem.ultrapassou50PorcentoTempo === false ? 'border-emerald-400/25 text-emerald-200/95' : avaliacao.origem.ultrapassou50PorcentoTempo === true ? 'border-rose-400/30 text-rose-200' : 'border-white/10 text-white/60'}">
						<div class="flex items-center justify-between font-medium">
							<span class="flex items-center gap-1.5">
								<Clock class="h-3.5 w-3.5 text-cyan-400/80" />
								3. Tempo de Permanência (&lt; 50% do prazo máximo):
							</span>
						</div>
						{#if avaliacao.origem.ultrapassou50PorcentoTempo === true}
							<p class="mt-1 font-semibold text-rose-300">
								✕ Impeditivo: Você atingiu ou ultrapassou 50% do tempo máximo de permanência do curso de origem.
							</p>
						{:else if avaliacao.origem.ultrapassou50PorcentoTempo === false}
							<p class="mt-1 text-white/80">
								✓ Tempo decorrido está dentro do limite máximo de 50% do prazo do curso.
							</p>
						{:else}
							<p class="mt-1 text-white/50">
								Tempo máximo de permanência não verificado.
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- BLOCO 2: CURSO PRETENDIDO (DESTINO) -->
			<div class="rounded-lg border border-cyan-500/30 bg-cyan-500/[0.07] px-3 py-2.5 text-cyan-100/90 space-y-2">
				<div class="flex items-start gap-2">
					<ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber-400/95" />
					<div>
						<p class="font-medium text-[13px] text-white/90">Integralização · Curso Pretendido</p>
						<p class="mt-0.5 text-[11px] leading-relaxed text-white/62">
							Acúmulo de carga horária em componentes equivalentes do curso de destino.
						</p>
					</div>
				</div>

				{#if avaliacao}
					<div class="rounded-md border bg-black/25 px-2.5 py-2 text-[11px]
						{avaliacao.destino.atendeCargaDestino ? 'border-emerald-400/25 text-emerald-200/95' : 'border-amber-400/25 text-amber-100/92'}">
						<p>
							Indicativo nesta simulação:
							<strong>{avaliacao.destino.horasObrigatoriasEOptativas.toLocaleString('pt-BR')} h</strong> em
							obrigatórias + optativas do destino.
						</p>
						{#if avaliacao.destino.atendeCargaDestino}
							<p class="mt-1 text-white/80">
								✓ Você já atinge a carga horária mínima exigida (≥ {avaliacao.destino.minimoHorasInstitucional} h).
							</p>
						{:else}
							<p class="mt-1">
								Faltam <strong>{Math.max(0, avaliacao.destino.minimoHorasInstitucional - avaliacao.destino.horasObrigatoriasEOptativas).toLocaleString('pt-BR')} h</strong> para atingir o mínimo institucional de {avaliacao.destino.minimoHorasInstitucional} h.
							</p>
						{/if}
					</div>

					<!-- Alerta Prova de Habilidade Específica (Música) -->
					{#if avaliacao.destino.requerHabilidadeEspecifica}
						<div class="rounded-md border border-amber-400/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200/90 flex items-start gap-2">
							<AlertTriangle class="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
							<div>
								<span class="font-semibold text-white/90">Prova de Habilidade Específica (PHE):</span>
								Este curso exige aprovação e certificação válida na Prova de Habilidade Específica no momento da seleção.
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<!-- BLOCO 3: CRITÉRIOS DE CLASSIFICAÇÃO (INFORMATIVO) -->
			<div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[10px] leading-relaxed text-white/50 space-y-1">
				<p class="font-semibold text-white/70">ℹ️ Critérios de Classificação e Desempate (Edital UnB):</p>
				<p>• <strong>Classificação:</strong> Ordem decrescente de maior Carga Horária obtida em componentes obrigatórios do curso pretendido.</p>
				<p>• <strong>Desempate:</strong> 1º) Média ponderada no curso pretendido; 2º) Maior CH total no curso pretendido; 3º) Maior IRA.</p>
			</div>
		</div>
	{/if}
</div>