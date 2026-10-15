<script lang="ts">
	import { Loader2, Scale, Check, X, Minus, AlertTriangle, BookOpen, ClipboardList, ChevronDown } from 'lucide-svelte';
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
	type Tom = 'roxo' | 'verde' | 'laranja' | 'azul';
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

	let cumpridos = $derived(requisitos.filter((r) => r.status === 'ok'));
	let naoCumpridos = $derived(requisitos.filter((r) => r.status === 'fail'));
	let aConferir = $derived(requisitos.filter((r) => r.status === 'unknown'));
	let totalVerificaveis = $derived(requisitos.filter((r) => r.status !== 'manual').length);

	let veredito = $derived<'apto' | 'nao-apto' | 'incompleto'>(
		naoCumpridos.length > 0
			? 'nao-apto'
			: requisitos.some((r) => r.status === 'unknown')
				? 'incompleto'
				: 'apto'
	);

	const tons: Record<Tom, { card: string; icone: string; texto: string; borda: string }> = {
	roxo:    { card: 'border-[#2a2142] bg-[#1d1630]', icone: 'bg-[#2c1f4a] text-[#b57bff]', texto: 'text-[#c9a6ff]', borda: 'border-[#2a2142]' },
	verde:   { card: 'border-[#1a3a2b] bg-[#0f2319]', icone: 'bg-[#13402b] text-[#2ee59d]', texto: 'text-[#2ee59d]', borda: 'border-[#1a3a2b]' },
	laranja: { card: 'border-[#3b2518] bg-[#2a1a12]', icone: 'bg-[#4a2a14] text-[#ff8a1f]', texto: 'text-[#ffa04d]', borda: 'border-[#3b2518]' },
	azul:    { card: 'border-[#1c2c48] bg-[#111c30]', icone: 'bg-[#16294d] text-[#4a90ff]', texto: 'text-[#6aa5ff]', borda: 'border-[#1c2c48]' }
};

</script>

{#snippet stat(valor: number, label: string, tom: Tom, Icone: typeof Check)}
	<div class="flex flex-col items-center rounded-xl border px-3 py-4 text-center {tons[tom].card}">
		<span class="mb-2 flex h-8 w-8 items-center justify-center rounded-full {tons[tom].icone}">
			<Icone class="h-4 w-4" />
		</span>
		<span class="text-2xl font-bold">{valor}</span>
		<span class="mt-0.5 text-[11px] opacity-70">{label}</span>
	</div>
{/snippet}

{#snippet acordeao(titulo: string, itens: Requisito[], tom: Tom)}
	{#if itens.length}
		<details class="group rounded-xl border {tons[tom].card}">
			<summary
				class="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden {tons[tom].texto}"
			>
				<span>{titulo} ({itens.length})</span>
				<ChevronDown class="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
			</summary>
			<ul class="space-y-3 border-t px-4 py-3 {tons[tom].borda}">
				{#each itens as r (r.id)}
					<li class="text-[12px]">
						<div class="flex items-center justify-between gap-2">
							<span class="font-medium">{r.titulo}</span>
							{#if r.valor}<span class="font-mono text-[10px] opacity-70">{r.valor}</span>{/if}
						</div>
						<p class="mt-0.5 leading-relaxed opacity-70">{r.detalhe}</p>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
{/snippet}

<div class="rounded-xl border border-white/12 bg-black/35 p-3.5 text-sm shadow-lg backdrop-blur-md sm:p-4">
	<!-- Cabeçalho -->
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<h3 class="flex items-center gap-2 font-semibold">
			<Scale class="h-4 w-4 shrink-0 text-cyan-400" />
			Requisitos de mudança de curso
		</h3>

		{#if avaliacao && !avaliacaoRodando}
			{#if veredito === 'apto'}
				<span class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold {tons.verde.card} {tons.verde.texto}">
					<Check class="h-3 w-3" /> APTO
				</span>
			{:else if veredito === 'nao-apto'}
				<span class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold {tons.laranja.card} {tons.laranja.texto}">
					<X class="h-3 w-3" /> NÃO APTO
				</span>
			{:else}
				<span class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold {tons.azul.card} {tons.azul.texto}">
					<Minus class="h-3 w-3" /> INCOMPLETO
				</span>
			{/if}
		{/if}
	</div>

	{#if avaliacaoRodando || integralizacaoLoading}
		<div class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-4 text-xs opacity-70">
			<Loader2 class="h-4 w-4 shrink-0 animate-spin text-cyan-400" />
			Analisando seu histórico…
		</div>
	{:else if !integralizacao}
		<p class="text-xs opacity-60">Carregue a integralização para ver o indicativo de elegibilidade.</p>
	{:else if avaliacao}
		<!-- Resumo -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{@render stat(totalVerificaveis, 'Requisitos', 'roxo', BookOpen)}
			{@render stat(cumpridos.length, 'Cumpridos', 'verde', Check)}
			{@render stat(naoCumpridos.length, 'Não cumpridos', 'laranja', AlertTriangle)}
			{@render stat(aConferir.length, 'A conferir', 'azul', ClipboardList)}
		</div>

		<!-- Detalhes -->
		<div class="mt-4 space-y-2">
			{@render acordeao('Requisitos não cumpridos', naoCumpridos, 'laranja')}
			{@render acordeao('Requisitos cumpridos', cumpridos, 'verde')}
			{@render acordeao('A conferir (dados ausentes ou edital)', aConferir, 'azul')}
		</div>

		<p class="mt-3 text-[10px] leading-relaxed opacity-50">
			Guia rápido: a decisão oficial segue o PPC, o histórico no SIGAA e o edital vigente.
		</p>
	{/if}
</div>