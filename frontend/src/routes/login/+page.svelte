<script lang="ts">
	import LoginForm from '$lib/components/auth/LoginForm.svelte';
	import AuthHomeLink from '$lib/components/auth/AuthHomeLink.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import { authService } from '$lib/services/auth.service';
	import { goto } from '$app/navigation';
	import { UserX } from 'lucide-svelte';

	function handleAnonymousLogin() {
		authService.setAnonymous();
		goto('/fluxogramas');
	}
</script>

<PageMeta title="Entrar" description="Acesse sua conta do NoFluxo UNB." noIndex={true} />

<AuthHomeLink />
<PageBackground />

<div class="flex min-h-screen items-start justify-center overflow-x-hidden px-3 py-8 sm:px-4 sm:py-10">
	<div class="flex w-full max-w-md flex-col items-center gap-4">
		<a href="/" class="nf-wordmark nf-wordmark--hero drop-shadow-sm" aria-label="NoFluxo UNB — início">
			<span class="nf-wordmark-noflx">NOFLX</span><span class="nf-wordmark-unb">UNB</span>
		</a>
		<button
			type="button"
			class="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-primary shadow-nofluxo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-0 dark:bg-white/95 dark:text-blue-700 dark:shadow-md dark:hover:bg-white dark:focus-visible:ring-blue-500 dark:focus-visible:ring-offset-blue-700"
			on:click={handleAnonymousLogin}
		>
			<UserX class="h-4 w-4" />
			<span>Entrar como visitante</span>
		</button>
		<div class="auth-card w-full mt-8">
			<LoginForm />
		</div>
	</div>
</div>
