<script lang="ts">
	import { Loader2, BookOpenCheck, Scale, ShieldAlert } from 'lucide-svelte';
	import type { DadosFluxogramaUser } from '$lib/types/user';
	import type { IntegralizacaoResult } from '$lib/types/matriz';
	import {
		avaliarRequisitosMudancaCurso,
		type AvaliacaoMudancaCurso
	} from '$lib/services/mudanca-curso-requisitos.service';

	type Props = {
		dadosFluxograma: DadosFluxogramaUser;
		integralizacao: IntegralizacaoResult | null;
		integralizacaoLoading?: boolean;
	};
	let { dadosFluxograma, integralizacao, integralizacaoLoading = false }: Props = $props();

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
			const r = await avaliarRequisitosMudancaCurso(dadosFluxograma, integralizacao);
			if (id !== seq) return;
			avaliacao = r;
			avaliacaoRodando = false;
		}
		void run();
	});
</script>

<div
	class="rounded-xl border border-border bg-background/80 dark:bg-black/35 p-3.5 text-sm shadow-nofluxo backdrop-blur-md sm:p-4 dark:shadow-lg"
>
	<h3 class="mb-3 flex flex-wrap items-center gap-2 font-semibold text-foreground/90">
		<Scale class="h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-400" />
		Requisitos de mudança de curso (referência institucional)
	</h3>

	{#if avaliacaoRodando || integralizacaoLoading}
		<div class="flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-4 text-xs text-muted-foreground">
			<Loader2 class="h-4 w-4 shrink-0 animate-spin text-cyan-700 dark:text-cyan-400" />
			Analisando seu histórico em relação a essas regras…
		</div>
	{:else if !integralizacao}
		<p class="text-xs text-muted-foreground">Carregue a integralização para ver o indicativo de elegibilidade.</p>
	{:else}
		<p class="mb-4 text-[11px] leading-relaxed text-muted-foreground">
			Use como guia rápido. A decisão oficial segue sempre o PPC, o histórico consolidado no SIGAA e o edital vigente da
			mudança de curso. O primeiro dia útil após as inscrições costuma servir como data de referência para a análise.
		</p>

		<div class="space-y-3">
			<div class="rounded-lg border border-cyan-500/30 bg-cyan-500/[0.07] px-3 py-2.5 text-cyan-900/90 dark:text-cyan-100/90">
				<div class="mb-1.5 flex items-start gap-2">
					<BookOpenCheck class="mt-0.5 h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-400/90" />
					<div>
						<p class="font-medium text-[13px] text-foreground/90">Integralização · curso de origem</p>
						<p class="mt-1 text-[11px] leading-relaxed text-foreground/70">
							É preciso ter <span class="text-foreground/80">todos os componentes curriculares obrigatórios dos dois primeiros
								períodos</span> da estrutura do <span class="text-foreground/80">curso atual</span> com aproveitamento
							<strong class="font-medium text-foreground/85">aprovado e consolidado</strong>. Optativas e reprovações não
							contam para esse requisito. Confira a grade oficial no PPC do seu curso.
						</p>
					</div>
				</div>

				{#if avaliacao && avaliacao.origem.podeAvaliar && avaliacao.origem.atendeIntegralizacaoOrigem !== null}
					{#if avaliacao.origem.atendeIntegralizacaoOrigem}
						<p
							class="mt-2 rounded-md border border-emerald-400/25 bg-background/60 dark:bg-black/25 px-2 py-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200/95"
						>
							Indicativo: obrigatórias dos períodos equivalentes aos níveis 1 e 2 da grade deste app parecem
							<strong> todas integralizadas</strong> pelo histórico (com equivalências declaradas quando houver).
						</p>
					{:else}
						<p
							class="mt-2 rounded-md border border-amber-400/25 bg-background/60 dark:bg-black/25 px-2 py-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-100/92"
						>
							Indicativo:
							<strong> faltam {avaliacao.origem.codigosPendentes.length}</strong> de
							{avaliacao.origem.obrigatoriosPeriodos12Total} obrigatória(s) nesses períodos
							{#if avaliacao.origem.codigosPendentes.length > 0}
								— ex.: <span class="font-mono text-[10px]">{avaliacao.origem.codigosPendentes.slice(0, 6).join(', ')}{avaliacao.origem.codigosPendentes.length > 6 ? '…' : ''}</span>
							{/if}
						</p>
					{/if}
				{:else if avaliacao && !avaliacao.origem.podeAvaliar}
					<p class="mt-2 text-[11px] text-muted-foreground">
						Não conseguimos mapear obrigatórias dos dois primeiros períodos na sua matriz salva —
						valide pelo PPC ou atualize seu currículo no perfil.
					</p>
				{/if}
			</div>

			<div class="rounded-lg border border-cyan-500/30 bg-cyan-500/[0.07] px-3 py-2.5 text-cyan-900/90 dark:text-cyan-100/90">
				<div class="mb-1.5 flex items-start gap-2">
					<ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400/95" />
					<div>
						<p class="font-medium text-[13px] text-foreground/90">Integralização · curso pretendido</p>
						<p class="mt-1 text-[11px] leading-relaxed text-foreground/70">
							É preciso acumular <span class="text-foreground/80">pelo menos 360 horas</span> em componentes
							<strong class="font-medium text-foreground/85">obrigatórios ou optativos</strong> do curso de destino, também com
							aproveitamento aprovado e consolidado até a data de análise. Contabiliza-se a carga horária total já
							integralizada desses componentes no histórico para o destino aqui simulado.
						</p>
					</div>
				</div>

				{#if avaliacao}
					{#if avaliacao.destino.atendeCargaDestino}
						<p
							class="mt-2 rounded-md border border-emerald-400/25 bg-background/60 dark:bg-black/25 px-2 py-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200/95"
						>
							Indicativo nesta simulação:
							<strong>{avaliacao.destino.horasObrigatoriasEOptativas.toLocaleString('pt-BR')} h</strong> em obrigatorias +
							optativas do destino —
							<strong>≥ {avaliacao.destino.minimoHorasInstitucional} h</strong>.
						</p>
					{:else}
						<p
							class="mt-2 rounded-md border border-amber-400/25 bg-background/60 dark:bg-black/25 px-2 py-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-100/92"
						>
							Indicativo nesta simulação:
							<strong>{avaliacao.destino.horasObrigatoriasEOptativas.toLocaleString('pt-BR')} h</strong>
							(obrigatorias + optativas) —
							<strong>faltam {Math.max(0, avaliacao.destino.minimoHorasInstitucional - avaliacao.destino.horasObrigatoriasEOptativas).toLocaleString('pt-BR')} h</strong>
							para atingir {avaliacao.destino.minimoHorasInstitucional} h.
						</p>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>
