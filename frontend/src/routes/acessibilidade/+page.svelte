<!-- frontend/src/routes/acessibilidade/+page.svelte -->
<script lang="ts">
	import { Accessibility, RotateCcw, ExternalLink, Keyboard, Moon } from 'lucide-svelte';
	import { a11y, a11yActiveCount } from '$lib/stores/a11y';
	import { A11Y_OPTIONS } from '$lib/components/a11y/a11y-options';
	import A11ySwitch from '$lib/components/a11y/A11ySwitch.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
</script>

<PageMeta
	title="Acessibilidade"
	description="Ajustes de acessibilidade do NoFluxo UNB: alto contraste, texto ampliado, fonte de leitura facilitada, redução de movimento e foco reforçado, seguindo a WCAG 2.2."
/>

<div class="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
	<header class="mb-8 flex items-start gap-4">
		<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
			<Accessibility class="h-6 w-6" aria-hidden="true" />
		</div>
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Acessibilidade</h1>
			<p class="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
				Ajustes que seguem a WCAG 2.2 nível AA. Eles ficam salvos neste navegador e valem para
				todas as páginas, nos temas claro e escuro.
			</p>
		</div>
	</header>

	<section aria-labelledby="a11y-prefs" class="rounded-2xl border border-border bg-card p-4 shadow-nofluxo md:p-6">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<h2 id="a11y-prefs" class="text-lg font-semibold text-foreground">Preferências</h2>
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				onclick={() => a11y.reset()}
				disabled={$a11yActiveCount === 0}
			>
				<RotateCcw class="h-4 w-4" aria-hidden="true" />
				Restaurar padrões
			</button>
		</div>

		<div class="flex flex-col gap-3" role="group" aria-labelledby="a11y-prefs">
			{#each A11Y_OPTIONS as opt (opt.key)}
				<A11ySwitch
					id={`a11y-page-${opt.key}`}
					checked={$a11y[opt.key]}
					label={opt.label}
					description={opt.description}
					hint={opt.wcag}
					icon={opt.icon}
					onchange={(v) => a11y.set(opt.key, v)}
				/>
			{/each}
		</div>

		<p class="mt-4 text-xs text-muted-foreground" aria-live="polite">
			{#if $a11yActiveCount === 0}
				Nenhuma preferência ativa.
			{:else}
				{$a11yActiveCount} {$a11yActiveCount === 1 ? 'preferência ativa' : 'preferências ativas'}.
			{/if}
		</p>
	</section>

	<section aria-labelledby="a11y-builtin" class="mt-6 rounded-2xl border border-border bg-card p-4 md:p-6">
		<h2 id="a11y-builtin" class="text-lg font-semibold text-foreground">O que já vem ligado</h2>
		<ul class="mt-3 space-y-3 text-sm text-muted-foreground">
			<li class="flex gap-3">
				<Keyboard class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
				<span>
					<span class="font-medium text-foreground">Navegação por teclado.</span>
					Um link "Pular para o conteúdo" aparece ao apertar Tab no início de cada página, e o
					foco vai para o conteúdo principal a cada troca de rota.
				</span>
			</li>
			<li class="flex gap-3">
				<Moon class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
				<span>
					<span class="font-medium text-foreground">Tema claro e escuro.</span>
					Os dois cumprem contraste mínimo de 4,5:1 no texto. Troque pelo ícone de sol e lua na barra.
				</span>
			</li>
			<li class="flex gap-3">
				<Accessibility class="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
				<span>
					<span class="font-medium text-foreground">Leitores de tela.</span>
					Status de disciplina, erros de formulário e a página atual são anunciados por texto, não
					só por cor.
				</span>
			</li>
		</ul>
	</section>

	<footer class="mt-6 text-sm text-muted-foreground">
		<a
			href="https://www.w3.org/WAI/WCAG22/quickref/"
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1.5 text-primary underline underline-offset-4 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
		>
			Referência rápida da WCAG 2.2
			<ExternalLink class="h-4 w-4" aria-hidden="true" />
			<span class="sr-only">(abre em nova aba)</span>
		</a>
	</footer>
</div>
