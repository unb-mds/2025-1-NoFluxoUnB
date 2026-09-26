<script lang="ts">
	import type { IntegralizacaoResult } from '$lib/types/matriz';
	import { horasParaCreditos } from '$lib/types/matriz';
	import { GraduationCap, ChevronDown, ChevronUp } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

	type UnidadeExibicao = 'horas' | 'creditos';

	interface Props {
		/** Dados de integralização (realizado vs exigido da matriz). */
		dadosUser: IntegralizacaoResult | null;
		/** Simulação: +Xh se aprovado nas disciplinas matriculadas (MATR). */
		simulacaoMatr?: { chMatriculadas: number; totalSimulado: number } | null;
	}

	let { dadosUser, simulacaoMatr = null }: Props = $props();
	let unidade = $state<UnidadeExibicao>('horas');
	let expandido = $state<Record<string, boolean>>({
		obrigatoria: false,
		optativa: false,
		complementar: false
	});

	const temComplementar = $derived(
		dadosUser ? (dadosUser.exigido.chComplementar ?? 0) > 0 : false
	);

	function circleProgress(percent: number, radius = 32) {
		const circumference = 2 * Math.PI * radius;
		const offset = circumference - (percent / 100) * circumference;
		return { circumference, offset };
	}

	function formatarValor(valor: number, modo: UnidadeExibicao): string {
		if (modo === 'creditos') {
			return horasParaCreditos(valor).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
		}
		return valor.toLocaleString('pt-BR') + 'h';
	}

	function toggleExpandir(chave: string) {
		expandido = { ...expandido, [chave]: !expandido[chave] };
	}

	const categorias = $derived([
		{
			chave: 'obrigatoria',
			label: 'Obrigatória',
			realizado: dadosUser?.realizado.chObrigatoria ?? 0,
			planejada: 0,
			exigido: dadosUser?.exigido.chObrigatoria ?? 0,
			faltam: dadosUser?.faltam.chObrigatoria ?? 0,
			faltamAposPlanejamento: undefined as number | undefined,
			pct: dadosUser?.pctObrigatoria ?? 0,
			pctComPlanejamento: dadosUser?.pctObrigatoria ?? 0,
			cor: 'var(--ch-obrig)',
			corClasse: 'text-blue-700 dark:text-blue-400',
			bgClasse: 'bg-blue-500/20',
			borderClasse: 'border-blue-500/30'
		},
		{
			chave: 'optativa',
			label: 'Optativa',
			realizado: dadosUser?.realizado.chOptativa ?? 0,
			planejada: dadosUser?.chOptativaPlanejada ?? 0,
			exigido: dadosUser?.exigido.chOptativa ?? 0,
			faltam: dadosUser?.faltam.chOptativa ?? 0,
			faltamAposPlanejamento: dadosUser?.faltamChOptativaAposPlanejamento,
			pct: dadosUser?.pctOptativa ?? 0,
			pctComPlanejamento: dadosUser?.pctOptativaComPlanejamento ?? dadosUser?.pctOptativa ?? 0,
			cor: 'var(--ch-opt)',
			corClasse: 'text-primary dark:text-purple-400',
			bgClasse: 'bg-purple-500/20',
			borderClasse: 'border-purple-500/30'
		},
		...(temComplementar
			? [
					{
						chave: 'complementar',
						label: 'Complementar',
						realizado: dadosUser?.realizado.chComplementar ?? 0,
						planejada: 0,
						exigido: dadosUser?.exigido.chComplementar ?? 0,
						faltam: dadosUser?.faltam.chComplementar ?? 0,
						faltamAposPlanejamento: undefined as number | undefined,
						pct: dadosUser?.pctComplementar ?? 0,
						pctComPlanejamento: dadosUser?.pctComplementar ?? 0,
						cor: 'var(--ch-comp)',
						corClasse: 'text-amber-800 dark:text-amber-400',
						bgClasse: 'bg-amber-500/20',
						borderClasse: 'border-amber-500/30'
					}
				]
			: [])
	]);

	const totalRealizado = $derived(dadosUser?.realizado.chTotal ?? 0);
	const totalExigido = $derived(dadosUser?.exigido.chTotal ?? 0);
	const totalExibido = $derived(
		unidade === 'creditos'
			? `${horasParaCreditos(totalRealizado).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} / ${horasParaCreditos(totalExigido).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} cr`
			: `${totalRealizado.toLocaleString('pt-BR')}h / ${totalExigido.toLocaleString('pt-BR')}h`
	);
	const sublabel = $derived(unidade === 'creditos' ? 'créditos integralizados' : 'horas integralizadas');
	const pctTotal = $derived(dadosUser?.pctTotal ?? 0);
	const mainCircle = $derived(circleProgress(pctTotal, 38));
</script>

{#if dadosUser}
	<div class="ch-dash min-w-0 rounded-xl border border-border bg-background/80 dark:bg-black/40 p-3 backdrop-blur-md sm:p-4">
		<!-- Header: título + toggle Horas/Créditos -->
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:gap-3">
			<div class="flex min-w-0 items-center gap-1.5 text-emerald-700 dark:text-green-400">
				<GraduationCap class="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
				<span class="truncate text-[10px] font-semibold uppercase tracking-wider sm:text-xs">Carga horária (SIGAA)</span>
			</div>
			<div class="flex rounded-lg border border-border bg-muted/60 p-0.5">
				<button
					type="button"
					onclick={() => (unidade = 'horas')}
					class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {unidade === 'horas'
						? 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-400'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Horas
				</button>
				<button
					type="button"
					onclick={() => (unidade = 'creditos')}
					class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {unidade === 'creditos'
						? 'bg-cyan-500/20 text-cyan-800 dark:text-cyan-400'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Créditos
				</button>
			</div>
		</div>

		<!-- Card principal: círculo + total -->
		<div class="mb-3 flex items-center gap-3 rounded-xl border border-border bg-muted/60 p-3 sm:mb-4 sm:gap-4 sm:p-4">
			<div class="relative h-20 w-20 shrink-0">
				<svg class="h-20 w-20 -rotate-90" viewBox="0 0 88 88">
					<circle cx="44" cy="44" r="38" class="stroke-foreground/10" stroke-width="6" fill="none" />
					<circle
						cx="44"
						cy="44"
						r="38"
						style:stroke="var(--ch-total)"
						stroke-width="6"
						fill="none"
						stroke-linecap="round"
						stroke-dasharray={mainCircle.circumference}
						stroke-dashoffset={mainCircle.offset}
						class="transition-all duration-700"
					/>
				</svg>
				<div class="absolute inset-0 flex flex-col items-center justify-center">
					<span class="text-lg font-bold text-foreground">{pctTotal}%</span>
				</div>
			</div>
			<div class="min-w-0 flex-1">
				<p class="text-lg font-bold text-foreground">{totalExibido}</p>
				<p class="text-xs text-muted-foreground">{sublabel}</p>
				{#if simulacaoMatr}
					{@const totalExigido = dadosUser?.exigido.chTotal ?? 0}
					{@const pctSimulado = totalExigido > 0 ? Math.round((simulacaoMatr.totalSimulado / totalExigido) * 100) : null}
					<p
						class="mt-2 text-[11px] text-muted-foreground"
						title="+{simulacaoMatr.chMatriculadas.toLocaleString('pt-BR')}h se for aprovado nas disciplinas em que está matriculado"
					>
						Se aprovar em todas as disciplinas que está cursando neste semestre, ficará com <span class="font-medium text-cyan-800 dark:text-cyan-300/90">{pctSimulado ?? '—'}%</span> integralizado no próximo semestre.
					</p>
				{/if}
			</div>
		</div>

		<!-- Cards expansíveis por categoria -->
		<div class="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each categorias as cat}
				{@const pctExibir = cat.planejada > 0 ? cat.pctComPlanejamento : cat.pct}
				{@const c = circleProgress(pctExibir, 24)}
				<div
					class="overflow-hidden rounded-xl border bg-muted/60 transition-colors {cat.borderClasse}"
				>
					<button
						type="button"
						onclick={() => toggleExpandir(cat.chave)}
						class="flex w-full items-center justify-between p-4 text-left"
					>
						<div class="flex items-center gap-3">
							<div class="relative h-14 w-14 shrink-0">
								<svg class="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
									<circle cx="28" cy="28" r="24" class="stroke-foreground/[0.08]" stroke-width="4" fill="none" />
									<circle
										cx="28"
										cy="28"
										r="24"
										style:stroke={cat.cor}
										stroke-width="4"
										fill="none"
										stroke-linecap="round"
										stroke-dasharray={c.circumference}
										stroke-dashoffset={c.offset}
										class="transition-all duration-500"
									/>
								</svg>
								<div class="absolute inset-0 flex items-center justify-center">
									<span class="text-sm font-bold text-foreground">{pctExibir}%</span>
								</div>
							</div>
							<div>
								<p class="text-sm font-semibold {cat.corClasse}">{cat.label}</p>
								<p class="text-xs text-muted-foreground">
									{#if cat.planejada > 0}
										{formatarValor(cat.realizado + cat.planejada, unidade)} / {formatarValor(
											cat.exigido,
											unidade
										)}
										<span class="block text-[10px] text-muted-foreground"
											>({formatarValor(cat.realizado, unidade)} aprov. + {formatarValor(
												cat.planejada,
												unidade
											)} planej.)</span
										>
									{:else}
										{formatarValor(cat.realizado, unidade)} / {formatarValor(cat.exigido, unidade)}
									{/if}
								</p>
							</div>
						</div>
						{#if expandido[cat.chave]}
							<ChevronUp class="h-4 w-4 shrink-0 text-muted-foreground" />
						{:else}
							<ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground" />
						{/if}
					</button>
					{#if expandido[cat.chave]}
						<div
							transition:slide={{ duration: 200 }}
							class="border-t border-border px-4 py-3 {cat.bgClasse}"
						>
							<p class="text-xs text-foreground/80">
								Realizado (aprovado): {formatarValor(cat.realizado, unidade)}
							</p>
							{#if cat.planejada > 0}
								<p class="text-xs text-foreground/80">
									Planejado no fluxograma: {formatarValor(cat.planejada, unidade)}
								</p>
							{/if}
							<p class="text-xs text-foreground/80">
								Exigido: {formatarValor(cat.exigido, unidade)}
							</p>
							{#if cat.planejada > 0 && cat.faltamAposPlanejamento !== undefined}
								{#if cat.faltamAposPlanejamento > 0}
									<p class="mt-1 text-xs {cat.corClasse}">
										Faltam após o planejamento: {formatarValor(cat.faltamAposPlanejamento, unidade)}
									</p>
								{:else if cat.exigido > 0}
									<p class="mt-1 text-xs {cat.corClasse}">Optativas cobertas (aprovado + planejado)</p>
								{/if}
							{:else if cat.faltam > 0}
								<p class="mt-1 text-xs {cat.corClasse}">Faltam: {formatarValor(cat.faltam, unidade)}</p>
							{:else if cat.exigido > 0}
								<p class="mt-1 text-xs {cat.corClasse}">Completo</p>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	/* Cores dos anéis SVG: tons 600/700 no light (≥ 3:1 sobre o card); .dark mantém os hex históricos. */
	.ch-dash {
		--ch-total: #059669;
		--ch-obrig: #1d4ed8;
		--ch-opt: hsl(var(--primary));
		--ch-comp: #b45309;
	}
	:global(.dark) .ch-dash {
		--ch-total: #22c55e;
		--ch-obrig: #3b82f6;
		--ch-opt: #a855f7;
		--ch-comp: #f59e0b;
	}
</style>
