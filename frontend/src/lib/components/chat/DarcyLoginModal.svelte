<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { page } from '$app/stores';
	import { Bot } from 'lucide-svelte';
	import { darcyCotaStore } from '$lib/stores/darcy-cota.store.svelte';

	/**
	 * "Faça login para usar o assistente" — aberto quando um visitante (login
	 * anônimo) tenta usar o Darcy ou quando o backend responde 401
	 * LOGIN_NECESSARIO (sessão expirou). Montado uma vez no layout raiz; o resto
	 * do app continua liberado para o visitante.
	 */
	const redirect = $derived(encodeURIComponent($page.url.pathname + $page.url.search));
</script>

<Dialog.Root
	open={darcyCotaStore.loginAberto}
	onOpenChange={(v) => {
		if (!v) darcyCotaStore.fecharLogin();
	}}
>
	<Dialog.Content class="border-white/10 bg-zinc-950 text-white sm:max-w-sm">
		<Dialog.Header>
			<div
				class="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-pink-500/50 bg-pink-500/10 shadow-[0_0_24px_rgba(236,72,153,0.15)]"
			>
				<Bot class="h-6 w-6 text-pink-400" />
			</div>
			<Dialog.Title class="text-base text-white">Faça login para usar o assistente</Dialog.Title>
			<Dialog.Description class="text-sm text-white/60">
				O Darcy é gratuito para quem tem conta no NoFluxo. Fluxogramas e disciplinas continuam
				abertos para visitantes.
			</Dialog.Description>
		</Dialog.Header>

		<Dialog.Footer class="gap-2 sm:justify-start">
			<a
				href={`/login?redirect=${redirect}`}
				onclick={() => darcyCotaStore.fecharLogin()}
				class="inline-flex items-center justify-center rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-pink-400 focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus-visible:outline-none"
			>
				Entrar
			</a>
			<a
				href={`/signup?redirect=${redirect}`}
				onclick={() => darcyCotaStore.fecharLogin()}
				class="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
			>
				Criar conta
			</a>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
