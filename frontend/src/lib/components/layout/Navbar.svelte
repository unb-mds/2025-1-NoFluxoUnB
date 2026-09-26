<!-- frontend/src/lib/components/layout/Navbar.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { createSupabaseBrowserClient } from '$lib/supabase/client';
	import { authStore } from '$lib/stores/auth';
	import { ROUTES } from '$lib/config/routes';
	import { Menu, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import NavItems from './navbar/NavItems.svelte';
	import AccountMenu from './navbar/AccountMenu.svelte';
	import NotificationsMenu from './navbar/NotificationsMenu.svelte';
	import MobileDrawer from './navbar/MobileDrawer.svelte';
	import ModeToggle from './navbar/ModeToggle.svelte';
	import { buildNavEntries, isLinkActive } from './navbar/nav-config';
	import type { UserModel } from '$lib/types';

	interface Props {
		user: UserModel | null;
		isAuthenticated: boolean;
		isAnonymous?: boolean;
		variant?: 'bar' | 'floating';
	}

	let { user, isAuthenticated, isAnonymous = false, variant = 'bar' }: Props = $props();

	let mobileMenuOpen = $state(false);
	const supabase = createSupabaseBrowserClient();

	const hasHistorico = $derived(!!user?.dadosFluxograma);
	const isAdmin = $derived(!!user?.isAdmin);
	const pathname = $derived($page.url.pathname);
	const entries = $derived(buildNavEntries({ isAnonymous, hasHistorico, isAdmin }));

	async function handleLogout() {
		await supabase.auth.signOut();
		authStore.clear();
		goto(ROUTES.LOGIN);
	}

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	const navDesktopClass = $derived(
		variant === 'floating'
			? 'nav-link nav-link-premium text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/90 lg:text-xs'
			: 'nav-link text-sm font-medium text-foreground/90 lg:text-[15px]'
	);
</script>

<header
	class="z-50 w-full max-w-[100vw]"
	class:nf-glass-header={variant === 'bar'}
	class:nf-glass-header-floating={variant === 'floating'}
	class:navbar-floating-pill={variant === 'floating'}
	class:sticky={variant === 'bar'}
	class:top-0={variant === 'bar'}
>
	<nav
		class="nf-nav-root mx-auto flex min-h-[2.5rem] w-full max-w-full items-center gap-3 px-[max(0.75rem,env(safe-area-inset-left))] py-1 pt-[max(0.25rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] md:min-h-0 md:gap-5 md:px-8 md:py-3 md:pt-3"
	>
		<a
			href="/"
			class="nf-wordmark min-w-0 shrink-0"
			class:nf-wordmark--floating={variant === 'floating'}
			aria-label="NoFluxo UNB — início"
		>
			<span class="nf-wordmark-noflx">NOFLX</span><span class="nf-wordmark-unb">UNB</span>
		</a>

		{#if variant === 'floating'}
			<!-- Cluster central (desktop ≥ lg). -->
			<div
				class="hidden min-w-0 flex-1 items-center justify-center gap-5 lg:flex lg:gap-9"
				aria-label="Navegação principal"
			>
				{#if isAuthenticated}
					<NavItems {entries} {pathname} linkClass={navDesktopClass} />
				{:else}
					<a
						href={ROUTES.FLUXOGRAMAS}
						class={navDesktopClass}
						class:active={isLinkActive(ROUTES.FLUXOGRAMAS, pathname)}
					>
						Fluxogramas
					</a>
					<a
						href={ROUTES.DISCIPLINAS}
						class={navDesktopClass}
						class:active={isLinkActive(ROUTES.DISCIPLINAS, pathname)}
					>
						Disciplinas
					</a>
					<a href={ROUTES.LOGIN} class={navDesktopClass}>Entrar</a>
				{/if}
			</div>

			<div
				class="flex min-w-0 flex-1 items-center justify-end lg:flex-initial lg:justify-end lg:gap-1"
			>
				<div class="hidden items-center gap-1.5 lg:flex">
					<ModeToggle />
					{#if isAuthenticated}
						<div class="flex items-center gap-1.5">
							{#if !isAnonymous}
								<NotificationsMenu />
							{/if}
							<AccountMenu {user} {isAnonymous} {hasHistorico} {isAdmin} />
						</div>
					{:else}
						<Button href={ROUTES.SIGNUP} size="sm" class="rounded-full px-6 font-semibold"
							>Criar conta</Button
						>
					{/if}
				</div>
				<button
					type="button"
					class="text-foreground/90 hover:text-foreground ring-offset-background focus-visible:ring-ring/40 inline-flex shrink-0 touch-manipulation items-center justify-center rounded-lg p-1.5 outline-none focus-visible:ring-2 lg:hidden"
					onclick={toggleMobileMenu}
					aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
				>
					{#if mobileMenuOpen}
						<X class="h-7 w-7" />
					{:else}
						<Menu class="h-7 w-7" />
					{/if}
				</button>
			</div>
		{:else}
			<!-- Variante bar: não usada por nenhuma rota hoje (todas passam variant="floating"); verificada só por typecheck, não em browser. -->
			<!-- Variante bar: linha única à direita (desktop ≥ lg). -->
			<div class="hidden items-center lg:ml-auto lg:flex lg:gap-8">
				{#if isAuthenticated}
					<NavItems {entries} {pathname} linkClass={navDesktopClass} />
					<div class="flex items-center gap-1.5">
						<ModeToggle />
						{#if !isAnonymous}
							<NotificationsMenu />
						{/if}
						<AccountMenu {user} {isAnonymous} {hasHistorico} {isAdmin} />
					</div>
				{:else}
					<a
						href={ROUTES.FLUXOGRAMAS}
						class={navDesktopClass}
						class:active={isLinkActive(ROUTES.FLUXOGRAMAS, pathname)}
					>
						Fluxogramas
					</a>
					<a
						href={ROUTES.DISCIPLINAS}
						class={navDesktopClass}
						class:active={isLinkActive(ROUTES.DISCIPLINAS, pathname)}
					>
						Disciplinas
					</a>
					<a href={ROUTES.LOGIN} class={navDesktopClass}>Entrar</a>
					<ModeToggle />
					<Button href={ROUTES.SIGNUP} size="sm" class="ml-1 rounded-full px-6 font-semibold"
						>Criar conta</Button
					>
				{/if}
			</div>
			<button
				type="button"
				class="text-foreground/90 hover:text-foreground ring-offset-background focus-visible:ring-ring/40 ml-auto inline-flex shrink-0 touch-manipulation items-center justify-center rounded-lg p-1.5 outline-none focus-visible:ring-2 lg:hidden"
				onclick={toggleMobileMenu}
				aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
			>
				{#if mobileMenuOpen}
					<X class="h-7 w-7" />
				{:else}
					<Menu class="h-7 w-7" />
				{/if}
			</button>
		{/if}
	</nav>
</header>

<MobileDrawer
	open={mobileMenuOpen}
	{entries}
	{pathname}
	{isAuthenticated}
	{isAnonymous}
	{user}
	{isAdmin}
	onClose={closeMobileMenu}
	onLogout={handleLogout}
/>

<style>
	/* Floating home navbar — pílula com vidro, borda e glow */
	header.navbar-floating-pill {
		background: hsl(var(--background) / 0.75);
		backdrop-filter: blur(18px) saturate(1.5);
		-webkit-backdrop-filter: blur(18px) saturate(1.5);
		border: 1px solid hsl(var(--border) / 0.9);
		border-radius: 999px;
		/* Mobile: pílula mais baixa — o espaço vertical é do fluxograma */
		padding: 4px 20px;
		/* Light: sombra discreta; .dark mantém o valor histórico */
		box-shadow:
			0 0 0 1px hsl(var(--primary) / 0.12),
			0 8px 32px hsl(var(--foreground) / 0.08);
	}

	:global(.dark) header.navbar-floating-pill {
		box-shadow:
			0 0 0 1px hsl(var(--primary) / 0.12),
			0 8px 32px hsl(0 0% 0% / 0.4);
	}

	@media (min-width: 768px) {
		header.navbar-floating-pill {
			padding: 12px 28px;
		}
	}

	:global(.nf-wordmark--floating .nf-wordmark-noflx),
	:global(.nf-wordmark--floating .nf-wordmark-unb) {
		font-size: 1.32rem;
	}

	@media (min-width: 768px) {
		:global(.nf-wordmark--floating .nf-wordmark-noflx),
		:global(.nf-wordmark--floating .nf-wordmark-unb) {
			font-size: 1.52rem;
		}
	}
</style>
