<script lang="ts">
	import { Loader2, Scale, Check, X, Minus, AlertTriangle } from 'lucide-svelte';
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

	type Status = 'ok' | 'fail' | 'unknown' | 'manual';
	type Requisito = {
		id: String;
		grupo: 'origem' | 'destino' | 'edital';
		titulo: string;
		detalhe: string;
		valor?: string;
		status: Status;
	};	
	
	let avaliacao = $state<AvaliacaoMudancaCurso | null>(null);
	let avaliacaoRodando = $state(false);
	let seq = 0;

	$effect(() => {
		const id = ++seq;
		(async () => {
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
		})();
	});

	const impeditivo = (v: boolean | null): Status => (v === null ? 'unknown' : v ? 'fail' : 'ok');

let requisitos = $derived.by<Requisito[]>(() => {
		if (!avaliacao) return [];
		const { origem: o, destino: d } = avaliacao;
		const faltam = o.codigosPendentes.length;

		const lista: Requisito[] = [
			{
				id: 'obrig12',
				grupo: 'origem',
				titulo: 'Obrigatórias dos 1º e 2º períodos',
				valor: `${o.obrigatoriosConcluidos}/${o.obrigatoriosPeriodos12Total}`,
				status: !o.podeAvaliar ? 'unknown' : faltam === 0 ? 'ok' : 'fail',
				detalhe: !o.podeAvaliar
					? 'Não foi possível carregar a grade do curso de origem.'
					: faltam === 0
						? 'Todas as obrigatórias dos dois primeiros períodos foram integralizadas.'
						: `Faltam ${faltam}: ${o.codigosPendentes.slice(0, 5).join(', ')}${faltam > 5 ? '…' : ''}`
			},
			{
				id: 'ch75',
				grupo: 'origem',
				titulo: 'Carga horária concluída abaixo de 75%',
				valor: o.percentualCargaConcluida !== null ? `${o.percentualCargaConcluida}%` : undefined,
				status: impeditivo(o.ultrapassou75PorcentoCarga),
				detalhe:
					o.ultrapassou75PorcentoCarga === null
						? 'Não foi possível calcular o percentual de carga concluída.'
						: o.ultrapassou75PorcentoCarga
							? 'Impeditivo: você já concluiu 75% ou mais da carga do curso de origem.'
							: 'Dentro do limite permitido.'
			},
			{
				id: 'tempo50',
				grupo: 'origem',
				titulo: 'Tempo de permanência abaixo de 50% do prazo',
				status: impeditivo(o.ultrapassou50PorcentoTempo),
				detalhe:
					o.ultrapassou50PorcentoTempo === null
						? 'Prazo máximo de permanência não verificado.'
						: o.ultrapassou50PorcentoTempo
							? 'Impeditivo: você atingiu 50% ou mais do prazo máximo.'
							: 'Dentro do limite permitido.'
			},
			{
				id: 'chDestino',
				grupo: 'destino',
				titulo: `Mínimo de ${d.minimoHorasInstitucional} h no curso pretendido`,
				valor: `${d.horasObrigatoriasEOptativas.toLocaleString('pt-BR')} h`,
				status: d.atendeCargaDestino ? 'ok' : 'fail',
				detalhe: d.atendeCargaDestino
					? 'Carga horária mínima atingida (obrigatórias + optativas).'
					: `Faltam ${Math.max(0, d.minimoHorasInstitucional - d.horasObrigatoriasEOptativas).toLocaleString('pt-BR')} h.`
			},
			{
				id: 'vaga',
				grupo: 'edital',
				titulo: 'Vaga remanescente no curso pretendido',
				status: 'manual',
				detalhe: 'Depende da oferta do edital vigente.'
			},
			{
				id: 'unica',
				grupo: 'edital',
				titulo: 'Mudança de curso feita apenas uma vez',
				status: 'manual',
				detalhe: 'Não consta no histórico carregado. Confirme que você ainda não usou essa autorização.'
			}
		];

		if (d.requerHabilidadeEspecifica) {
			lista.push({
				id: 'phe',
				grupo: 'edital',
				titulo: 'Certificação na Prova de Habilidade Específica (PHE)',
				status: 'manual',
				detalhe: 'Exigida para Música (licenciatura e bacharelado), dentro do prazo de validade.'
			});
		}
		return lista;
	});

	let verificaveis = $derived(requisitos.filter((r) => r.status !== 'manual'));
	let cumpridos = $derived(verificaveis.filter((r) => r.status === 'ok').length);
	let pct = $derived(verificaveis.length ? (cumpridos / verificaveis.length) * 100 : 0);
	let veredito = $derived<'apto' | 'nao-apto' | 'incompleto'>(
		verificaveis.some((r) => r.status === 'fail')
			? 'nao-apto'
			: verificaveis.some((r) => r.status === 'unknown')
				? 'incompleto'
				: 'apto'
	);

	const estilos: Record<Status, { box: string; row: string; texto: string }> = {
		ok:      { box: 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300', row: 'border-emerald-400/20', texto: 'text-white/60' },
		fail:    { box: 'border-rose-400/60 bg-rose-500/20 text-rose-300',          row: 'border-rose-400/30',    texto: 'text-rose-200/90' },
		unknown: { box: 'border-white/25 bg-white/5 text-white/40',                 row: 'border-white/10',       texto: 'text-white/45' },
		manual:  { box: 'border-amber-400/50 bg-amber-500/15 text-amber-300',       row: 'border-amber-400/25',   texto: 'text-amber-200/80' }
	};

	const grupos = [
		{ id: 'origem', titulo: 'Curso de origem', sub: 'Conclusão do fluxo inicial e ausência de travas de permanência' },
		{ id: 'destino', titulo: 'Curso pretendido', sub: 'Carga horária em componentes equivalentes do destino' },
		{ id: 'edital', titulo: 'Conferir no edital', sub: 'Não dá para verificar automaticamente' }
	] as const;
</script>

{#snippet checkbox(status: Status)}
	<span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border {estilos[status].box}">
		{#if status === 'ok'}<Check class="h-3.5 w-3.5" strokeWidth={3} />
		{:else if status === 'fail'}<X class="h-3.5 w-3.5" strokeWidth={3} />
		{:else if status === 'manual'}<AlertTriangle class="h-3 w-3" />
		{:else}<Minus class="h-3.5 w-3.5" />{/if}
	</span>
{/snippet}

<div
	class="rounded-xl border border-white/12 bg-black/35 p-3.5 text-sm shadow-lg backdrop-blur-md sm:p-4"
>

<!-- Cabeçalho -->
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
		<h3 class="flex items-center gap-2 font-semibold text-white/92">
			<Scale class="h-4 w-4 shrink-0 text-cyan-400" />
			Requisitos de mudança de curso
		</h3>

		{#if avaliacao && !avaliacaoRodando}
			<div>
				{#if veredito === 'apto'}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300"
					>
						<Check class="h-3 w-3" /> APTO PARA MUDANÇA
					</span>
				{:else if veredito === 'nao-apto'}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300"
					>
						<X class="h-3 w-3" /> NÃO APTO
					</span>
				{:else}
					<span class="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/70">
						<Minus class="h-3 w-3" /> ANÁLISE INCOMPLETA
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
	{:else if avaliacao}
		<!-- Progresso -->
		<div class="mb-4">
			<div class="mb-1.5 flex items-center justify-between text-[11px] text-white/60">
				<span>{cumpridos} de {verificaveis.length} requisitos cumpridos</span>
				<span class="font-mono">{Math.round(pct)}%</span>
			</div>
			<div class="h-1.5 overflow-hidden rounded-full bg-white/10">
				<div
					class="h-full rounded-full transition-all duration-500 {veredito === 'nao-apto' ? 'bg-rose-400' : 'bg-emerald-400'}"
					style="width: {pct}%"
				></div>
			</div>
		</div>

		<div class="space-y-4">
			{#each grupos as g (g.id)}
				{@const itens = requisitos.filter((r) => r.grupo === g.id)}
				{#if itens.length}
					<section>
						<div class="mb-2">
							<p class="text-[13px] font-medium text-white/90">{g.titulo}</p>
							<p class="text-[11px] text-white/50">{g.sub}</p>
						</div>

						<ul class="space-y-2">
							{#each itens as r (r.id)}
								<li class="flex items-start gap-2.5 rounded-lg border bg-black/25 px-3 py-2.5 {estilos[r.status].row}">
									{@render checkbox(r.status)}
									<div class="min-w-0 flex-1">
										<div class="flex items-center justify-between gap-2">
											<span class="text-[12px] font-medium text-white/90">{r.titulo}</span>
											{#if r.valor}
												<span class="font-mono text-[10px] text-white/70">{r.valor}</span>
											{/if}
										</div>
										<p class="mt-0.5 text-[11px] leading-relaxed {estilos[r.status].texto}">{r.detalhe}</p>
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			{/each}
		</div>

		<!-- Classificação e desempate -->
		<details class="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-white/50">
			<summary class="cursor-pointer font-semibold text-white/70">Critérios de classificação e desempate (edital UnB)</summary>
			<div class="mt-2 space-y-1">
				<p>• <strong>Classificação:</strong> maior carga horária total em componentes obrigatórios do curso pretendido.</p>
				<p>• <strong>Desempate:</strong> 1º) média ponderada das menções (obrigatórios e optativos do pretendido, cursados na UnB); 2º) maior CH total no pretendido; 3º) maior IRA.</p>
			</div>
		</details>

		<!-- Legenda + aviso -->
		<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-white/45">
			<span class="flex items-center gap-1"><Check class="h-3 w-3 text-emerald-300" /> cumprido</span>
			<span class="flex items-center gap-1"><X class="h-3 w-3 text-rose-300" /> não cumprido</span>
			<span class="flex items-center gap-1"><Minus class="h-3 w-3" /> não verificado</span>
			<span class="flex items-center gap-1"><AlertTriangle class="h-3 w-3 text-amber-300" /> conferir no edital</span>
		</div>
		<p class="mt-2 text-[10px] leading-relaxed text-white/40">
			Guia rápido: a decisão oficial segue o PPC, o histórico no SIGAA e o edital vigente. O primeiro dia útil após as inscrições costuma ser a data de referência.
		</p>
	{/if}
</div>