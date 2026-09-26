<script lang="ts">
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Avatar from '$lib/components/ui/avatar';
	import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import { createSupabaseBrowserClient } from '$lib/supabase/client';
	import { authStore } from '$lib/stores/auth';
	import { ROUTES } from '$lib/config/routes';
	import { LogOut, LayoutDashboard, LifeBuoy, ShieldCheck } from 'lucide-svelte';
	import type { UserModel } from '$lib/types';
	import { onDestroy, onMount } from 'svelte';
	import {
		ticketsNaoLidas,
		iniciarPollingTicketsNaoLidas,
		pararPollingTicketsNaoLidas
	} from '$lib/stores/ticketsNaoLidas';

	interface Props {
		user: UserModel | null;
		isAnonymous: boolean;
		hasHistorico: boolean;
		isAdmin: boolean;
	}

	let { user, isAnonymous, hasHistorico, isAdmin }: Props = $props();
	const supabase = createSupabaseBrowserClient();

	// Badge de respostas do suporte não lidas (estilo WhatsApp) no avatar.
	onMount(() => {
		if (!isAnonymous && user) iniciarPollingTicketsNaoLidas();
	});
	onDestroy(() => pararPollingTicketsNaoLidas());

	async function handleLogout() {
		await supabase.auth.signOut();
		authStore.clear();
		goto(ROUTES.LOGIN);
	}
</script>

{#if isAnonymous}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class={cn(
				buttonVariants({ variant: 'outline', size: 'sm' }),
				'rounded-full border-border bg-secondary/55'
			)}
		>
			Visitante
		</DropdownMenu.Trigger>
		<DropdownMenu.Content class="w-56" align="end">
			<DropdownMenu.Label class="font-normal text-muted-foreground">
				Modo anônimo — algumas funções limitadas
			</DropdownMenu.Label>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onclick={() => { authStore.clear(); goto(ROUTES.LOGIN); }}>
				<LogOut class="mr-2 h-4 w-4" />
				Entrar / Criar conta
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{:else}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger
			class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-none bg-transparent p-0 transition-opacity hover:opacity-90"
			aria-label="Menu da conta"
		>
			<Avatar.Root class="h-10 w-10 shadow-[0_12px_40px_-4px_hsl(var(--primary)/0.52)] ring-2 ring-primary/35">
				<Avatar.Fallback class="bg-primary text-sm font-bold uppercase text-primary-foreground">
					{user?.nomeCompleto?.charAt(0).toUpperCase() || 'U'}
				</Avatar.Fallback>
			</Avatar.Root>
			{#if $ticketsNaoLidas > 0}
				<span
					class="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-700 px-1 text-[10px] font-bold leading-none text-white dark:bg-[#25d366] dark:text-[#05240f] ring-2 ring-background"
					aria-label="{$ticketsNaoLidas} resposta{$ticketsNaoLidas > 1 ? 's' : ''} do suporte não lida{$ticketsNaoLidas > 1 ? 's' : ''}"
				>
					{$ticketsNaoLidas > 9 ? '9+' : $ticketsNaoLidas}
				</span>
			{/if}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content class="w-56" align="end">
			<DropdownMenu.Label class="font-normal">
				<div class="flex flex-col space-y-1">
					<p class="text-sm font-medium leading-none">{user?.nomeCompleto || 'Usuário'}</p>
					<p class="text-xs leading-none text-muted-foreground">{user?.email}</p>
				</div>
			</DropdownMenu.Label>
			<DropdownMenu.Separator />
			{#if !hasHistorico}
				<DropdownMenu.Item onclick={() => goto(ROUTES.MEU_FLUXOGRAMA)}>
					<LayoutDashboard class="mr-2 h-4 w-4" />
					Meu Fluxograma
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
			{/if}
			<DropdownMenu.Item
				onclick={() => goto($ticketsNaoLidas > 0 ? `${ROUTES.SUPORTE}?tab=meus` : ROUTES.SUPORTE)}
			>
				<LifeBuoy class="mr-2 h-4 w-4" />
				Suporte
				{#if $ticketsNaoLidas > 0}
					<span
						class="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-700 px-1 text-[10px] font-bold leading-none text-white dark:bg-[#25d366] dark:text-[#05240f]"
					>
						{$ticketsNaoLidas > 9 ? '9+' : $ticketsNaoLidas}
					</span>
				{/if}
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			{#if isAdmin}
				<DropdownMenu.Item onclick={() => goto(ROUTES.ADMIN_TICKETS)}>
					<ShieldCheck class="mr-2 h-4 w-4" />
					Admin
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
			{/if}
			<DropdownMenu.Item onclick={handleLogout} class="text-destructive">
				<LogOut class="mr-2 h-4 w-4" />
				Sair
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
