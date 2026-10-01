<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { formatDate } from '$lib/utils';
	import { vagaNotificacaoService } from '$lib/services/vaga-notificacao.service';
	import { Bell } from 'lucide-svelte';
	import NavTooltip from './NavTooltip.svelte';
	import type { Notificacao } from '$lib/types/notificacao';

	const POLL_INTERVAL_MS = 60000;

	let notificacoes = $state<Notificacao[]>([]);
	let totalNaoLidas = $state(0);
	let pollInterval: ReturnType<typeof setInterval> | undefined;

	async function carregarNotificacoes() {
		try {
			const { items, totalNaoLidas: total } = await vagaNotificacaoService.listarNotificacoes();
			notificacoes = items;
			totalNaoLidas = total;
		} catch (error) {
			console.error('Erro ao carregar notificações:', error);
		}
	}

	async function marcarNotificacoesComoLidas() {
		try {
			await vagaNotificacaoService.marcarComoLida();
			await carregarNotificacoes();
		} catch (error) {
			console.error('Erro ao marcar notificações como lidas:', error);
		}
	}

	function handleOpenChange(open: boolean) {
		if (open) {
			marcarNotificacoesComoLidas();
		}
	}

	onMount(() => {
		carregarNotificacoes();
		pollInterval = setInterval(carregarNotificacoes, POLL_INTERVAL_MS);
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});
</script>

<DropdownMenu.Root onOpenChange={handleOpenChange}>
	<NavTooltip label={totalNaoLidas > 0 ? `Notificações · ${totalNaoLidas} não lida${totalNaoLidas > 1 ? 's' : ''}` : 'Notificações'}>
	{#snippet children(tip)}
	<DropdownMenu.Trigger
		{...tip}
		class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-none bg-transparent p-0 transition-opacity hover:opacity-90"
		aria-label="Notificações"
	>
		<Bell class="h-5 w-5 text-foreground/90" />
		{#if totalNaoLidas > 0}
			<span
				class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground"
			>
				{totalNaoLidas > 9 ? '9+' : totalNaoLidas}
			</span>
		{/if}
	</DropdownMenu.Trigger>
	{/snippet}
	</NavTooltip>
	<DropdownMenu.Content class="w-80" align="end">
		<DropdownMenu.Label class="flex items-center justify-between font-normal">
			<span>Notificações</span>
			{#if totalNaoLidas > 0}
				<button
					type="button"
					class="text-xs font-medium text-primary hover:underline"
					onclick={marcarNotificacoesComoLidas}
				>
					Marcar todas como lidas
				</button>
			{/if}
		</DropdownMenu.Label>
		<DropdownMenu.Separator />
		{#if notificacoes.length === 0}
			<p class="px-2 py-4 text-center text-sm text-muted-foreground">
				Nenhuma notificação por enquanto.
			</p>
		{:else}
			<div class="flex max-h-80 flex-col gap-1 overflow-y-auto">
				{#each notificacoes as notificacao (notificacao.id_notificacao)}
					<div
						class="flex flex-col gap-0.5 rounded-sm px-2 py-1.5 text-sm"
						class:bg-secondary={!notificacao.lida}
					>
						<div class="flex items-center gap-1.5">
							{#if !notificacao.lida}
								<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>
							{/if}
							<p class="font-medium leading-none">{notificacao.titulo}</p>
						</div>
						<p class="text-xs text-muted-foreground">{notificacao.mensagem}</p>
						<p class="text-[11px] text-muted-foreground/70">{formatDate(notificacao.created_at)}</p>
					</div>
				{/each}
			</div>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
