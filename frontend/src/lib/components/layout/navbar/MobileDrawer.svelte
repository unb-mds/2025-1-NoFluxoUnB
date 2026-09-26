<!-- frontend/src/lib/components/layout/navbar/MobileDrawer.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { authStore } from '$lib/stores/auth';
	import { ROUTES } from '$lib/config/routes';
	import { X, LifeBuoy, LogOut, GitBranch, BookOpen, ShieldCheck } from 'lucide-svelte';
	import { ticketsNaoLidas } from '$lib/stores/ticketsNaoLidas';
	import ModeToggle from './ModeToggle.svelte';
	import A11yMenu from '$lib/components/a11y/A11yMenu.svelte';
	import { type NavEntry, isEntryActive, isLinkActive } from './nav-config';
	import type { UserModel } from '$lib/types';

	interface Props {
		open: boolean;
		entries: NavEntry[];
		pathname: string;
		isAuthenticated: boolean;
		isAnonymous: boolean;
		user: UserModel | null;
		isAdmin: boolean;
		onClose: () => void;
		onLogout: () => void;
	}

	let { open, entries, pathname, isAuthenticated, isAnonymous, user, isAdmin, onClose, onLogout }: Props =
		$props();

	// Backdrop is not keyboard-focusable (tabindex="-1") and nothing auto-focuses it, so
	// Escape is handled at the window level instead, guarded to only act while open.
	function handleWindowKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-[2px]"
		onclick={onClose}
		role="button"
		tabindex="-1"
		aria-label="Fechar menu"
	></div>
	<div class="mobile-drawer-portal">
		<div class="flex flex-col gap-1 p-4">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-sm font-medium text-muted-foreground">Menu</span>
				<button type="button" class="mobile-close-btn" onclick={onClose} aria-label="Fechar menu">
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Tema: segmentado (sem portal) porque o drawer fica em z-index 9999, acima do popover. -->
			<ModeToggle layout="segmented" class="mb-3" />
			<A11yMenu layout="list" class="mb-4" />

			{#if isAuthenticated}
				<div class="mb-4 border-b border-border pb-4">
					{#if isAnonymous}
						<p class="text-lg font-semibold text-foreground">Visitante</p>
						<p class="text-sm text-muted-foreground">Modo anônimo</p>
					{:else}
						<p class="text-lg font-semibold text-foreground">{user?.nomeCompleto || 'Usuário'}</p>
						<p class="text-sm text-muted-foreground">{user?.email}</p>
					{/if}
				</div>

				{#each entries as entry}
					{#if entry.kind === 'link'}
						{@const LinkIcon = entry.icon}
						<a
							href={entry.href}
							class="mobile-nav-item"
							class:active={isEntryActive(entry, pathname)}
							onclick={onClose}
						>
							<LinkIcon class="h-5 w-5" />
							<span>{entry.label}</span>
						</a>
					{:else}
						<div class="mobile-nav-section-label">{entry.label}</div>
						{#each entry.children as child}
							{@const ChildIcon = child.icon}
							<a
								href={child.href}
								class="mobile-nav-item mobile-nav-subitem"
								class:active={isLinkActive(child.href, pathname)}
								onclick={onClose}
							>
								<ChildIcon class="h-5 w-5" />
								<span>{child.label}</span>
								{#if child.badge}
									<span
										class="ml-auto rounded-full border border-accent-foreground/40 bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
									>
										{child.badge}
									</span>
								{/if}
							</a>
						{/each}
					{/if}
				{/each}

				<hr class="my-3 border-border" />

				{#if !isAnonymous}
					<a
						href={$ticketsNaoLidas > 0 ? `${ROUTES.SUPORTE}?tab=meus` : ROUTES.SUPORTE}
						class="mobile-nav-item"
						class:active={isLinkActive(ROUTES.SUPORTE, pathname)}
						onclick={onClose}
					>
						<LifeBuoy class="h-5 w-5" />
						<span>Suporte</span>
						{#if $ticketsNaoLidas > 0}
							<span
								class="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-700 px-1 text-[10px] font-bold leading-none text-white dark:bg-[#25d366] dark:text-[#05240f]"
							>
								{$ticketsNaoLidas > 9 ? '9+' : $ticketsNaoLidas}
							</span>
						{/if}
					</a>
				{/if}

				{#if isAdmin}
					<a
						href={ROUTES.ADMIN_TICKETS}
						class="mobile-nav-item"
						class:active={isLinkActive(ROUTES.ADMIN_TICKETS, pathname)}
						onclick={onClose}
					>
						<ShieldCheck class="h-5 w-5" />
						<span>Admin</span>
					</a>
				{/if}

				{#if isAnonymous}
					<button
						onclick={() => { authStore.clear(); onClose(); goto(ROUTES.LOGIN); }}
						class="mobile-nav-item text-amber-700 dark:text-amber-400"
					>
						<LogOut class="h-5 w-5" />
						<span>Entrar / Criar conta</span>
					</button>
				{:else}
					<button onclick={() => { onLogout(); onClose(); }} class="mobile-nav-item text-destructive dark:text-red-400">
						<LogOut class="h-5 w-5" />
						<span>Sair</span>
					</button>
				{/if}
			{:else}
				<a
					href={ROUTES.FLUXOGRAMAS}
					class="mobile-nav-item"
					class:active={isLinkActive(ROUTES.FLUXOGRAMAS, pathname)}
					onclick={onClose}
				>
					<GitBranch class="h-5 w-5" />
					<span>Fluxogramas</span>
				</a>
				<a
					href={ROUTES.DISCIPLINAS}
					class="mobile-nav-item"
					class:active={isLinkActive(ROUTES.DISCIPLINAS, pathname)}
					onclick={onClose}
				>
					<BookOpen class="h-5 w-5" />
					<span>Disciplinas</span>
				</a>
				<hr class="my-3 border-border" />
				<a href={ROUTES.LOGIN} class="mobile-nav-item" onclick={onClose}>Entrar</a>
				<Button href={ROUTES.SIGNUP} class="mt-2 w-full rounded-full" onclick={onClose}>
					Criar conta
				</Button>
			{/if}
		</div>

		<div class="mt-auto border-t border-border p-4 text-center text-xs text-muted-foreground">
			NoFluxo UNB © {new Date().getFullYear()}
		</div>
	</div>
{/if}

<style>
	.mobile-drawer-portal {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(300px, 88vw);
		max-width: 100vw;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		padding-bottom: env(safe-area-inset-bottom, 0px);
		padding-top: env(safe-area-inset-top, 0px);
		background: hsl(var(--card) / 0.97);
		border-left: 1px solid hsl(var(--border));
		/* Light: sombra discreta; .dark mantém o valor histórico */
		box-shadow: -16px 0 48px hsl(var(--foreground) / 0.12);
		animation: slideIn 200ms ease-out;
	}

	:global(.dark) .mobile-drawer-portal {
		box-shadow: -16px 0 48px hsl(0 0% 0% / 0.4);
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.mobile-nav-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 10px;
		color: hsl(var(--foreground));
		font-weight: 500;
		text-decoration: none;
		transition: background 160ms ease;
		border: none;
		background: none;
		width: 100%;
		text-align: left;
		cursor: pointer;
		font-size: 15px;
	}

	.mobile-nav-item:hover {
		background: hsl(var(--foreground) / 0.06);
	}

	.mobile-nav-item.active {
		background: hsl(var(--secondary) / 0.85);
		border-left: 3px solid hsl(var(--primary));
		padding-left: 11px;
	}

	.mobile-nav-subitem {
		padding-left: 34px;
		font-size: 14px;
	}

	.mobile-nav-subitem.active {
		padding-left: 33px;
	}

	.mobile-nav-section-label {
		padding: 10px 14px 4px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}

	.mobile-close-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 36px;
		width: 36px;
		border-radius: 9999px;
		border: none;
		background: hsl(var(--foreground) / 0.06);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.mobile-close-btn:hover {
		background: hsl(var(--foreground) / 0.1);
		color: hsl(var(--foreground));
	}
</style>
