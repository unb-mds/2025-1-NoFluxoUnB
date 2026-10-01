<script lang="ts">
	import type { PreferenciasPlano } from '$lib/types/plano-formatura';
	import { DEFAULT_PREFERENCIAS, LIMITE_CREDITOS_MAX } from '$lib/types/plano-formatura';
	import { GraduationCap, Briefcase, Zap, Scale, ChevronRight, X, Sparkles } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		open: boolean;
		onConfirm: (prefs: PreferenciasPlano, interesses?: string) => void;
		onClose: () => void;
	}

	let { open, onConfirm, onClose }: Props = $props();

	let step = $state(1);
	const TOTAL_STEPS = 3;

	let trabalha = $state(DEFAULT_PREFERENCIAS.trabalha);
	let limiteCreditos = $state<number>(DEFAULT_PREFERENCIAS.limiteCreditos);
	let objetivo = $state<'velocidade' | 'equilibrio'>(DEFAULT_PREFERENCIAS.objetivo);
	let interesses = $state('');

	function next() {
		if (step < TOTAL_STEPS) step++;
	}

	function prev() {
		if (step > 1) step--;
	}

	function confirm() {
		onConfirm(
			{
				trabalha,
				limiteCreditos,
				objetivo,
				onboardingConcluido: true
			},
			interesses.trim() || undefined
		);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	const stepTitles = [
		'Você trabalha ou estagia?',
		'Quantas matérias por semestre?',
		'Qual é o seu objetivo?'
	];
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		transition:fade={{ duration: 180 }}
		role="dialog"
		aria-modal="true"
		aria-label="Configurar plano de formatura"
	>
		<!-- Overlay -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute inset-0 bg-black/70 backdrop-blur-sm"
			onclick={onClose}
			onkeydown={(e) => e.key === 'Enter' && onClose()}
		></div>

		<!-- Modal panel -->
		<div
			class="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-nofluxoLg dark:border-foreground/10 dark:bg-[#0e1117] dark:shadow-2xl"
			transition:fly={{ y: 24, duration: 250 }}
		>
			<!-- Header -->
			<div class="relative border-b border-border px-6 py-5">
				<div class="flex items-center gap-3">
					<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/20">
						<GraduationCap class="h-5 w-5 text-blue-700 dark:text-blue-400" />
					</div>
					<div>
						<p class="text-[11px] font-semibold uppercase tracking-widest text-blue-700 dark:text-blue-400">
							Configurar plano
						</p>
						<h2 class="text-base font-semibold text-foreground leading-tight">
							Plano de Formatura
						</h2>
					</div>
				</div>
				<button
					type="button"
					onclick={onClose}
					class="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground/80"
					aria-label="Fechar"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Progress bar -->
			<div class="h-0.5 bg-foreground/[0.06]">
				<div
					class="h-full bg-blue-500 transition-all duration-400 ease-out"
					style="width: {(step / TOTAL_STEPS) * 100}%"
				></div>
			</div>

			<!-- Step content -->
			<div class="px-6 py-7">
				<!-- Step indicator -->
				<p class="mb-1 text-[11px] font-medium text-muted-foreground">
					Passo {step} de {TOTAL_STEPS}
				</p>
				<h3 class="mb-6 text-lg font-semibold text-foreground">
					{stepTitles[step - 1]}
				</h3>

				{#if step === 1}
					<!-- Question 1: trabalha? -->
					<div class="flex flex-col gap-3">
						<button
							type="button"
							onclick={() => { trabalha = true; }}
							class="group flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all duration-150
								{trabalha
									? 'border-blue-500/60 bg-blue-600/12 ring-1 ring-blue-500/30'
									: 'border-border bg-muted/60 hover:border-border-strong hover:bg-muted'}"
						>
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg
								{trabalha ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400' : 'bg-foreground/[0.06] text-muted-foreground group-hover:text-foreground/70'}">
								<Briefcase class="h-5 w-5" />
							</div>
							<div>
								<p class="text-sm font-medium text-foreground">Sim, trabalho ou estagio</p>
								<p class="mt-0.5 text-xs text-muted-foreground">Carga sugerida mais leve</p>
							</div>
							{#if trabalha}
								<div class="ml-auto h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400"></div>
							{/if}
						</button>

						<button
							type="button"
							onclick={() => { trabalha = false; }}
							class="group flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all duration-150
								{!trabalha
									? 'border-blue-500/60 bg-blue-600/12 ring-1 ring-blue-500/30'
									: 'border-border bg-muted/60 hover:border-border-strong hover:bg-muted'}"
						>
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg
								{!trabalha ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400' : 'bg-foreground/[0.06] text-muted-foreground group-hover:text-foreground/70'}">
								<GraduationCap class="h-5 w-5" />
							</div>
							<div>
								<p class="text-sm font-medium text-foreground">Não, só estudo</p>
								<p class="mt-0.5 text-xs text-muted-foreground">Pode assumir carga maior</p>
							</div>
							{#if !trabalha}
								<div class="ml-auto h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400"></div>
							{/if}
						</button>
					</div>

				{:else if step === 2}
					<!-- Question 2: limite de créditos (exibido como matérias/horas) -->
					<div class="flex flex-col gap-3">
						<!-- Presets: leve, o padrão, e o teto do sistema. -->
					{#each [16, DEFAULT_PREFERENCIAS.limiteCreditos, LIMITE_CREDITOS_MAX] as limite}
							{@const materias = limite / 4}
							{@const horas = limite * 15}
							{@const labels: Record<number, { subtitle: string }> = {
								16: { subtitle: 'Leve — mais fôlego no semestre' },
								24: { subtitle: 'Moderado — equilíbrio recomendado' },
								32: { subtitle: 'Intenso — velocidade máxima' }
							}}
							<button
								type="button"
								onclick={() => { limiteCreditos = limite; }}
								class="group flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all duration-150
									{limiteCreditos === limite
										? 'border-blue-500/60 bg-blue-600/12 ring-1 ring-blue-500/30'
										: 'border-border bg-muted/60 hover:border-border-strong hover:bg-muted'}"
							>
								<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold
									{limiteCreditos === limite ? 'bg-blue-500/20 text-blue-800 dark:text-blue-300' : 'bg-foreground/[0.06] text-muted-foreground group-hover:text-foreground/70'}">
									{materias}
								</div>
								<div>
									<p class="text-sm font-medium text-foreground">
										~{materias} matérias
										<span class="font-normal text-muted-foreground">(≈{horas}h no semestre)</span>
									</p>
									<p class="mt-0.5 text-xs text-muted-foreground">{labels[limite].subtitle}</p>
								</div>
								{#if limiteCreditos === limite}
									<div class="ml-auto h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400"></div>
								{/if}
							</button>
						{/each}
					</div>

				{:else if step === 3}
					<!-- Question 3: objetivo -->
					<div class="flex flex-col gap-3">
						<button
							type="button"
							onclick={() => { objetivo = 'velocidade'; }}
							class="group flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all duration-150
								{objetivo === 'velocidade'
									? 'border-blue-500/60 bg-blue-600/12 ring-1 ring-blue-500/30'
									: 'border-border bg-muted/60 hover:border-border-strong hover:bg-muted'}"
						>
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg
								{objetivo === 'velocidade' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400' : 'bg-foreground/[0.06] text-muted-foreground group-hover:text-foreground/70'}">
								<Zap class="h-5 w-5" />
							</div>
							<div>
								<p class="text-sm font-medium text-foreground">Velocidade máxima</p>
								<p class="mt-0.5 text-xs text-muted-foreground">Prioriza se formar mais rápido</p>
							</div>
							{#if objetivo === 'velocidade'}
								<div class="ml-auto h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400"></div>
							{/if}
						</button>

						<button
							type="button"
							onclick={() => { objetivo = 'equilibrio'; }}
							class="group flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all duration-150
								{objetivo === 'equilibrio'
									? 'border-blue-500/60 bg-blue-600/12 ring-1 ring-blue-500/30'
									: 'border-border bg-muted/60 hover:border-border-strong hover:bg-muted'}"
						>
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg
								{objetivo === 'equilibrio' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400' : 'bg-foreground/[0.06] text-muted-foreground group-hover:text-foreground/70'}">
								<Scale class="h-5 w-5" />
							</div>
							<div>
								<p class="text-sm font-medium text-foreground">Equilíbrio</p>
								<p class="mt-0.5 text-xs text-muted-foreground">Distribui melhor a carga ao longo do tempo</p>
							</div>
							{#if objetivo === 'equilibrio'}
								<div class="ml-auto h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400"></div>
							{/if}
						</button>

						<!-- Interesses (opcional): dispara sugestão de optativas pelo Darcy AI após gerar o plano -->
						<div class="mt-2 rounded-xl border border-pink-500/25 bg-pink-500/6 px-4 py-4">
							<div class="flex items-center gap-2">
								<Sparkles class="h-4 w-4 shrink-0 text-pink-600 dark:text-pink-400" />
								<p class="text-sm font-medium text-foreground">Quer sugestões de optativas?</p>
								<span class="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground dark:text-foreground/30">Opcional</span>
							</div>
							<p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
								Conte seus interesses dentro da sua área (ex.: games, IA, segurança) e o
								<span class="font-semibold text-pink-700 dark:text-pink-300">Darcy AI</span> sugere optativas da UnB que combinam com você, junto do seu plano.
							</p>
							<input
								type="text"
								bind:value={interesses}
								placeholder="Ex.: desenvolvimento de games, inteligência artificial..."
								maxlength="120"
								class="mt-3 w-full rounded-lg border border-border-strong bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:placeholder:text-foreground/25 outline-none transition-colors focus:border-pink-500/50 dark:border-foreground/10 dark:bg-foreground/[0.04] dark:focus:bg-foreground/[0.06]"
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer actions -->
			<div class="flex items-center justify-between border-t border-border px-6 py-4">
				{#if step > 1}
					<button
						type="button"
						onclick={prev}
						class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground/70"
					>
						Voltar
					</button>
				{:else}
					<div></div>
				{/if}

				{#if step < TOTAL_STEPS}
					<button
						type="button"
						onclick={next}
						class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 dark:hover:bg-blue-500 dark:active:bg-blue-700"
					>
						Próximo
						<ChevronRight class="h-4 w-4" />
					</button>
				{:else}
					<button
						type="button"
						onclick={confirm}
						class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800 dark:hover:bg-blue-500 dark:active:bg-blue-700"
					>
						<GraduationCap class="h-4 w-4" />
						Gerar meu plano
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
