<script lang="ts">
	import LoginForm from '$lib/components/auth/LoginForm.svelte';
	import AuthHomeLink from '$lib/components/auth/AuthHomeLink.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import { authService } from '$lib/services/auth.service';
	import { goto } from '$app/navigation';

	function handleAnonymousLogin() {
		authService.setAnonymous();
		goto('/fluxogramas');
	}
</script>

<PageMeta title="Entrar" description="Acesse sua conta do NoFluxo UNB." noIndex={true} />

<AuthHomeLink />
<PageBackground />

<div class="flex min-h-screen items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6">
	<div class="flex w-full max-w-[440px] flex-col items-center gap-7">
		<!-- Marca + frase: a mesma abertura do app -->
		<div class="flex flex-col items-center gap-3 text-center">
			<a href="/" class="nf-wordmark nf-wordmark--hero drop-shadow-sm" aria-label="NoFluxo UNB — início">
				<span class="nf-wordmark-noflx">NOFLX</span><span class="nf-wordmark-unb">UNB</span>
			</a>
			<p class="max-w-[30ch] text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
				A vida do estudante não é linear.<br />Cada um tem o seu próprio fluxo.
			</p>
		</div>

		<div class="auth-card w-full">
			<LoginForm onVisitor={handleAnonymousLogin} />
		</div>
	</div>
</div>
