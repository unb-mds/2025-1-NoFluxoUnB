<script lang="ts">
	import { Loader2, GraduationCap, Percent, ShieldCheck } from 'lucide-svelte';
	import type { DadosFluxogramaUser } from '$lib/types/user';
	import type { IntegralizacaoResult } from '$lib/types/matriz';
	import type { MateriaModel } from '$lib/types/materia';
	import {
		avaliarRequisitosDuplaDiplomacao,
		type AvaliacaoDuplaDiplomacao
	} from '$lib/services/dupla-diplomacao-requisitos.service';

	type Props = {
		dadosFluxograma: DadosFluxogramaUser;
		integralizacao: IntegralizacaoResult | null;
		integralizacaoLoading?: boolean;
		materiasDestino: MateriaModel[];
	};
	let { dadosFluxograma, integralizacao, integralizacaoLoading = false, materiasDestino }: Props = $props();

	let avaliacao = $state<AvaliacaoDuplaDiplomacao | null>(null);
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
			const r = await avaliarRequisitosDuplaDiplomacao(dadosFluxograma, integralizacao, materiasDestino);
			if (id !== seq) return;
			avaliacao = r;
			avaliacaoRodando = false;
		}
		void run();
	});

	function pctFmt(v: number | null): string {
		if (v === null) return '—';
		return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
	}
</script>

<div
	class="rounded-xl border border-white/12 bg-black/35 p-3.5 text-sm shadow-lg backdrop-blur-md sm:p-4"
>
	<h3 class="mb-3 flex flex-wrap items-center gap-2 font-semibold text-white/92">
		<GraduationCap class="h-4 w-4 shrink-0 text-emerald-400" />
		Requisitos de dupla diplomação (referência institucional)
	</h3>

	{#if avaliacaoRodando || integralizacaoLoading}
		<div class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-4 text-xs text-white/55">
			<Loader2 class="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
			Analisando seu histórico em relação a essas regras…
		</div>
	{:else if !integralizacao}
		<p class="text-xs text-white/55">Carregue a integralização para ver o indicativo de elegibilidade.</p>
	{:else}
		<p class="mb-4 text-[11px] leading-relaxed text-white/45">
			Use como guia rápido. A decisão oficial segue sempre o PPC, o histórico consolidado no SIGAA e o edital vigente de
			dupla diplomação. Não verificamos aqui se você já ingressou no curso atual por dupla diplomação — confira essa
			condição você mesmo(a).
		</p>

		<div class="space-y-3">
			<div class="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2.5 text-emerald-100/90">
				<div class="mb-1.5 flex items-start gap-2">
					<GraduationCap class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/90" />
					<div>
						<p class="font-medium text-[13px] text-white/90">Provável formando · curso atual</p>
						<p class="mt-1 text-[11px] leading-relaxed text-white/62">
							É preciso já ter integralizado <span class="text-white/80">pelo menos 90%</span> da CH total do
							<span class="text-white/80">curso atual</span> para ser considerado(a) provável formando no semestre
							corrente. Confira a data de referência oficial da coordenação.
						</p>
					</div>
				</div>

				{#if avaliacao?.formando.podeAvaliar && avaliacao.formando.atendeProvavelFormando !== null}
					{#if avaliacao.formando.atendeProvavelFormando}
						<p
							class="mt-2 rounded-md border border-emerald-400/25 bg-black/25 px-2 py-1.5 text-[11px] font-medium text-emerald-200/95"
						>
							Indicativo: <strong>{pctFmt(avaliacao.formando.pctIntegralizacaoOrigem)}</strong> da CH do curso atual
							integralizada — atende ao mínimo de 90%.
						</p>
					{:else}
						<p
							class="mt-2 rounded-md border border-amber-400/25 bg-black/25 px-2 py-1.5 text-[11px] font-medium text-amber-100/92"
						>
							Indicativo: <strong>{pctFmt(avaliacao.formando.pctIntegralizacaoOrigem)}</strong> da CH do curso atual
							integralizada — abaixo do mínimo de 90%.
						</p>
					{/if}
				{:else}
					<p class="mt-2 text-[11px] text-white/50">
						Não conseguimos calcular a CH exigida do seu curso atual — valide pelo PPC ou atualize seu currículo no
						perfil.
					</p>
				{/if}
			</div>

			<div class="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2.5 text-emerald-100/90">
				<div class="mb-1.5 flex items-start gap-2">
					<Percent class="mt-0.5 h-4 w-4 shrink-0 text-cyan-400/95" />
					<div>
						<p class="font-medium text-[13px] text-white/90">Integralização · curso pretendido</p>
						<p class="mt-1 text-[11px] leading-relaxed text-white/62">
							Fórmula usada <span class="font-mono text-white/75">X = (CH Total - CH Pendente) / (CH Total - CH Complementar - CH Estágio)</span>: mede o núcleo
							acadêmico (obrigatórias + optativas, limitada ao exigido), excluindo complementares e estágio
							obrigatório do denominador. É preciso <span class="text-white/80">X ≥ 70%</span>.
						</p>
					</div>
				</div>

				{#if avaliacao}
					{#if avaliacao.integralizacao.atende70porcento}
						<p
							class="mt-2 rounded-md border border-emerald-400/25 bg-black/25 px-2 py-1.5 text-[11px] font-medium text-emerald-200/95"
						>
							Indicativo nesta simulação: <strong>{pctFmt(avaliacao.integralizacao.pctIntegralizacaoDupla)}</strong> —
							atende ao mínimo de 70%.
						</p>
					{:else}
						<p
							class="mt-2 rounded-md border border-amber-400/25 bg-black/25 px-2 py-1.5 text-[11px] font-medium text-amber-100/92"
						>
							Indicativo nesta simulação: <strong>{pctFmt(avaliacao.integralizacao.pctIntegralizacaoDupla)}</strong> —
							abaixo do mínimo de 70%.
						</p>
					{/if}
				{/if}
			</div>

			<div class="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2.5 text-emerald-100/90">
				<div class="mb-1.5 flex items-start gap-2">
					<ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-amber-400/95" />
					<div>
						<p class="font-medium text-[13px] text-white/90">IRA</p>
						<p class="mt-1 text-[11px] leading-relaxed text-white/62">
							É preciso ter <span class="text-white/80">IRA ≥ 3,0</span>.
						</p>
					</div>
				</div>

				{#if avaliacao}
					{#if avaliacao.ira.atendeIra}
						<p
							class="mt-2 rounded-md border border-emerald-400/25 bg-black/25 px-2 py-1.5 text-[11px] font-medium text-emerald-200/95"
						>
							Indicativo: IRA <strong>{avaliacao.ira.ira.toLocaleString('pt-BR')}</strong> — atende ao mínimo de 3,0.
						</p>
					{:else}
						<p
							class="mt-2 rounded-md border border-amber-400/25 bg-black/25 px-2 py-1.5 text-[11px] font-medium text-amber-100/92"
						>
							Indicativo: IRA <strong>{avaliacao.ira.ira.toLocaleString('pt-BR')}</strong> — abaixo do mínimo de 3,0.
						</p>
					{/if}
				{/if}
			</div>

			{#if avaliacao}
				<div
					class="rounded-lg border px-3 py-2.5 text-[11px] font-medium {avaliacao.elegivel
						? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
						: 'border-white/10 bg-white/[0.04] text-white/60'}"
				>
					{#if avaliacao.elegivel}
						Indicativo geral: os três requisitos analisados parecem atendidos nesta simulação.
					{:else}
						Indicativo geral: pelo menos um dos requisitos analisados não é atendido nesta simulação.
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
