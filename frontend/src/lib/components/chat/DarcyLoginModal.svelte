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
	<Dialog.Content class="text-foreground sm:max-w-sm">
		<Dialog.Header>
			<div
				class="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10"
			>
				<Bot class="h-6 w-6 text-primary" />
			</div>
			<Dialog.Title class="text-base text-foreground">Faça login para usar o assistente</Dialog.Title>
			<Dialog.Description class="text-sm text-muted-foreground">
				O Darcy é gratuito para quem tem conta no NoFluxo. Fluxogramas e disciplinas continuam
				abertos para visitantes.
			</Dialog.Description>
		</Dialog.Header>

		<Dialog.Footer class="gap-2 sm:justify-start">
			<a
				href={`/login?redirect=${redirect}`}
				onclick={() => darcyCotaStore.fecharLogin()}
				class="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
			>
				Entrar
			</a>
			<a
				href={`/signup?redirect=${redirect}`}
				onclick={() => darcyCotaStore.fecharLogin()}
				class="inline-flex items-center justify-center rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				Criar conta
			</a>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
