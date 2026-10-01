<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { goto, afterNavigate } from '$app/navigation';
	import { authStore, isLoading, currentUser, isAuthenticated, isAnonymous } from '$lib/stores/auth';
	// Importar a store já aplica as classes de acessibilidade no <html> e as mantém em dia.
	import '$lib/stores/a11y';
	import { authService } from '$lib/services/auth.service';
	import { checkAuth, isPublicRoute } from '$lib/guards/authGuard';
	import { isAuthRoute } from '$lib/config/routes';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import LoadingBar from '$lib/components/layout/LoadingBar.svelte';
	import PageTransition from '$lib/components/layout/PageTransition.svelte';
	import SuporteFab from '$lib/components/support/SuporteFab.svelte';
	import ReleaseNotesModal from '$lib/components/layout/ReleaseNotesModal.svelte';
	import { Toaster } from 'svelte-sonner';
	import '../app.css';

	let { children } = $props();

	// Redirect from / to /auth/reset-password when landing with recovery hash or query (Supabase sent redirect_to=origin/ instead of /auth/reset-password)
	// Redirect from / to /auth/callback when landing with OAuth code (Supabase redirectou para / em vez de /auth/callback)
	$effect(() => {
		if (!browser || $page.url.pathname !== '/') return;
		const code = $page.url.searchParams.get('code');
		if (code) {
			const next = $page.url.searchParams.get('next') || '/upload-historico';
			const q = new URLSearchParams();
			q.set('code', code);
			if (next !== '/upload-historico') q.set('next', next);
			goto(`/auth/callback?${q.toString()}`, { replaceState: true });
			return;
		}
		const hash = window.location.hash || '';
		const type = $page.url.searchParams.get('type');
		const tokenHash = $page.url.searchParams.get('token_hash');
		const hasRecoveryHash = hash.includes('type=recovery') || (hash.includes('access_token') && hash.includes('recovery'));
		const hasRecoveryQuery = type === 'recovery' && (tokenHash || $page.url.searchParams.get('token'));
		if (hasRecoveryHash) {
			goto(`/auth/reset-password${hash}`, { replaceState: true });
		} else if (hasRecoveryQuery) {
			const q = new URLSearchParams($page.url.searchParams);
			goto(`/auth/reset-password?${q.toString()}${hash ? hash : ''}`, { replaceState: true });
		}
	});

	// Determine layout visibility based on current route
	let showNavbar = $derived(
		!isAuthRoute($page.url.pathname) &&
		$page.url.pathname !== '/' &&
		// Página de apresentação acessada por link direto (QR/NFC/bio): sem navbar.
		!$page.url.pathname.startsWith('/conheca')
	);

	// WCAG 2.4.3: em navegação SPA o foco vai para o conteúdo principal, não fica perdido no
	// link clicado. Só depois da primeira navegação (na carga inicial o foco fica no documento).
	let firstNavigation = true;
	afterNavigate(() => {
		if (firstNavigation) {
			firstNavigation = false;
			return;
		}
		requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }));
	});

	// Watch for route changes and verify auth
	$effect(() => {
		if (browser && $page.url.pathname) {
			checkAuth($page.url.pathname);
		}
	});

	onMount(() => {
		// Set up auth state listener
		const {
			data: { subscription }
		} = authService.onAuthStateChange(async (event, session) => {
			console.log('Auth state changed:', event);

			if (event === 'SIGNED_OUT') {
				authStore.clear();
			} else if (event === 'SIGNED_IN' && session?.user?.email) {
				const currentUser = authStore.getUser();
				if (!currentUser) {
				const result = await authService.databaseSearchUser();
						if (result.success) {
							authStore.setUser(result.user);
						}
					}
			} else if (event === 'TOKEN_REFRESHED' && session?.access_token) {
				authStore.updateToken(session.access_token);
			}
		});

		// Initial session check (memoizado — o guard de rota protegida pode já ter disparado isso)
		authService.ensureSessionBootstrapped();

		return () => {
			subscription.unsubscribe();
		};
	});
</script>

<svelte:head>
	<title>NoFluxo UNB</title>
</svelte:head>

<!-- WCAG 2.4.1: primeiro elemento focável da página; só aparece ao receber foco. -->
<a href="#main-content" class="skip-link">Pular para o conteúdo</a>

<LoadingBar />
<PageTransition />

<div class="flex min-h-screen flex-col overflow-x-hidden">
	{#if showNavbar}
		<div class="navbar-glass sticky top-0 z-50 px-4 pb-2 pt-3 md:px-6 md:pb-2.5 md:pt-4">
			<div class="mx-auto w-full">
				<Navbar
					user={$currentUser}
					isAuthenticated={$isAuthenticated || $isAnonymous}
					isAnonymous={$isAnonymous}
					variant="floating"
				/>
			</div>
		</div>
	{/if}

	<main id="main-content" tabindex="-1" class="flex-1 outline-none">
		{#if $isLoading && !isPublicRoute($page.url.pathname)}
			<div class="flex min-h-[60vh] items-center justify-center">
				<div class="text-center">
					<div class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-foreground/10 border-t-primary"></div>
					<p class="mt-4 text-muted-foreground">Carregando...</p>
				</div>
			</div>
		{:else}
			{@render children()}
		{/if}
	</main>
</div>

{#if $isAuthenticated && !$isAnonymous && showNavbar}
	<SuporteFab />
{/if}

<!-- Novidades do release: 1x por usuário; pede reenvio do histórico se o dado for antigo -->
{#if $isAuthenticated && showNavbar}
	<ReleaseNotesModal />
{/if}

<Toaster richColors position="top-right" />
