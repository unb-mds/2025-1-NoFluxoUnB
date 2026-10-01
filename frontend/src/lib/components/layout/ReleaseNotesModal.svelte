<script lang="ts">
	/**
	 * Modal de novidades do release — aparece UMA vez por usuário por RELEASE_ID
	 * (marcado em localStorage). Se o fluxograma salvo do usuário for de uma
	 * versão de schema anterior, destaca o convite para reenviar o histórico —
	 * é o reenvio que ativa os recursos que dependem de dado novo (módulo
	 * livre, equivalências do próprio histórico). Nunca bloqueia: fechar segue
	 * usando o app normalmente.
	 */
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import { Sparkles, X, Upload, PartyPopper, Heart } from 'lucide-svelte';
	import { authStore } from '$lib/stores/auth';
	import { ROUTES } from '$lib/config/routes';
	import {
		RELEASE_ID,
		RELEASE_TITULO,
		RELEASE_NOVIDADES,
		RELEASE_NOTA_EQUIPE,
		FLUXOGRAMA_SCHEMA_VERSION
	} from '$lib/config/release';

	type Segmento = { negrito: boolean; valor: string; href?: string };

	function segmentosNegrito(texto: string): Segmento[] {
		return texto
			.split(/\*\*([^*]+)\*\*/g)
			.map((valor, i) => ({ negrito: i % 2 === 1, valor }))
			.filter((s) => s.valor !== '');
	}

	/** Trechos entre **asteriscos** viram negrito; [texto](url) vira link em negrito. */
	function segmentos(texto: string): Segmento[] {
		const out: Segmento[] = [];
		const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
		let ultimo = 0;
		let m: RegExpExecArray | null;
		while ((m = linkRe.exec(texto)) !== null) {
			if (m.index > ultimo) out.push(...segmentosNegrito(texto.slice(ultimo, m.index)));
			out.push({ negrito: true, valor: m[1], href: m[2] });
			ultimo = m.index + m[0].length;
		}
		if (ultimo < texto.length) out.push(...segmentosNegrito(texto.slice(ultimo)));
		return out;
	}

	let authState = $derived($authStore);
	let visivel = $state(false);

	const chaveStorage = (idUser: number) => `nofluxo:release-vista:${idUser}`;

	$effect(() => {
		if (!browser) return;
		const u = authState.user;
		if (!u || authState.isLoading) return;
		try {
			if (localStorage.getItem(chaveStorage(u.idUser)) === RELEASE_ID) return;
		} catch {
			return; // sem localStorage (ex.: modo privativo estrito): não insiste
		}
		visivel = true;
	});

	/** Já enviou histórico alguma vez, mas com o schema antigo (ou sem versão). */
	const dadosDesatualizados = $derived.by(() => {
		const dados = authState.user?.dadosFluxograma;
		if (!dados) return false;
		return (dados.schemaVersion ?? 1) < FLUXOGRAMA_SCHEMA_VERSION;
	});

	function marcarVisto() {
		const u = authState.user;
		if (u) {
			try {
				localStorage.setItem(chaveStorage(u.idUser), RELEASE_ID);
			} catch {
				/* sem localStorage: paciência, mostra de novo na próxima */
			}
		}
		visivel = false;
	}

	function reenviarHistorico() {
		marcarVisto();
		goto(ROUTES.UPLOAD_HISTORICO);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && visivel) marcarVisto();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visivel}
	<div
		class="fixed inset-0 z-[110] flex items-center justify-center p-4"
		transition:fade={{ duration: 180 }}
		role="dialog"
		aria-modal="true"
		aria-label={RELEASE_TITULO}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute inset-0 bg-black/70 backdrop-blur-sm"
			onclick={marcarVisto}
			onkeydown={(e) => e.key === 'Enter' && marcarVisto()}
		></div>

		<!--
			Altura em dvh (não vh): no mobile, 100vh é a altura SEM a barra do
			navegador, então o card estourava a área visível e o rodapé com
			"Entendi" ficava fora da tela — sem scroll no overlay e sem backdrop
			sobrando para tocar, o usuário ficava preso. Mesmo padrão do
			TrocarTurmaDialog.
		-->
		<div
			class="relative z-10 flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-nofluxoLg dark:shadow-2xl"
			transition:fly={{ y: 24, duration: 250 }}
		>
			<!-- Header -->
			<div class="relative border-b border-border px-6 py-5">
				<div class="flex items-center gap-3">
					<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-500/15">
						<PartyPopper class="h-5 w-5 text-pink-700 dark:text-pink-400" />
					</div>
					<div>
						<p class="text-[11px] font-semibold uppercase tracking-widest text-pink-700 dark:text-pink-400">
							Atualização
						</p>
						<h2 class="text-base font-semibold leading-tight text-foreground">{RELEASE_TITULO}</h2>
					</div>
				</div>
				<button
					type="button"
					onclick={marcarVisto}
					class="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Fechar"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Novidades (overscroll-contain: rolar aqui não arrasta a página) -->
			<div class="min-h-0 overflow-y-auto overscroll-contain px-6 py-6">
				<ul class="flex flex-col gap-3">
					{#each RELEASE_NOVIDADES as novidade}
						<li class="flex items-start gap-2.5">
							<Sparkles class="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
							<span class="text-[13.5px] leading-relaxed text-foreground/80">{novidade}</span>
						</li>
					{/each}
				</ul>

				{#if dadosDesatualizados}
					<div class="mt-5 rounded-xl border border-amber-500/25 bg-amber-600/10 px-4 py-3.5">
						<p class="text-xs leading-relaxed text-amber-800 dark:text-amber-200/85">
							Seu histórico foi enviado antes dessas melhorias. Para o fluxograma reconhecer
							<strong class="text-amber-900 dark:text-amber-100">módulo livre e equivalências</strong> com os dados
							novos, reenvie o PDF do histórico: leva menos de um minuto.
						</p>
					</div>
				{/if}

				{#if RELEASE_NOTA_EQUIPE.agradecimento}
					<!-- Nota da equipe -->
					<div class="mt-5 rounded-xl border border-purple-500/25 bg-gradient-to-br from-purple-500/10 to-pink-500/10 px-4 py-4">
						<div class="mb-2.5 flex items-center gap-2">
							<Heart class="h-3.5 w-3.5 shrink-0 text-pink-700 dark:text-pink-400" />
							<p class="text-[11px] font-semibold uppercase tracking-widest text-pink-700 dark:text-pink-300">
								Uma nota da equipe
							</p>
						</div>
						<p class="text-xs leading-relaxed text-foreground/75">
							{#each segmentos(RELEASE_NOTA_EQUIPE.agradecimento) as s}
								{#if s.href}<a
										href={s.href}
										target="_blank"
										rel="noopener noreferrer"
										class="font-semibold text-pink-700 underline decoration-pink-700/50 underline-offset-2 hover:text-pink-800 dark:text-pink-300 dark:decoration-pink-400/50 dark:hover:text-pink-200"
										>{s.valor}</a
									>{:else if s.negrito}<strong class="text-foreground">{s.valor}</strong>{:else}{s.valor}{/if}
							{/each}
						</p>
						<p class="my-3 border-l-2 border-pink-400/60 pl-3 text-[13px] font-medium italic leading-relaxed text-foreground dark:text-purple-100">
							“{RELEASE_NOTA_EQUIPE.lema}”
						</p>
						<p class="text-xs leading-relaxed text-foreground/75">
							{#each segmentos(RELEASE_NOTA_EQUIPE.corpo) as s}
								{#if s.negrito}<strong class="text-foreground">{s.valor}</strong>{:else}{s.valor}{/if}
							{/each}
						</p>
						<p class="mt-3 text-right text-[11.5px] font-semibold text-pink-700 dark:text-pink-200/90">
							{RELEASE_NOTA_EQUIPE.assinatura}
						</p>
					</div>
				{/if}
			</div>

			<!-- Ações (shrink-0 + safe area: o rodapé nunca some nem fica sob a
			     barra de gestos do iPhone) -->
			<div
				class="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
			>
				<button
					type="button"
					onclick={marcarVisto}
					class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground/70"
				>
					{dadosDesatualizados ? 'Agora não' : 'Entendi'}
				</button>
				{#if dadosDesatualizados}
					<button
						type="button"
						onclick={reenviarHistorico}
						class="flex items-center gap-1.5 rounded-lg bg-pink-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-pink-500 active:bg-pink-700"
					>
						<Upload class="h-4 w-4" />
						Reenviar histórico
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
