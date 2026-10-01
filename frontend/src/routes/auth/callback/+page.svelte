<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authService } from '$lib/services/auth.service';
	import { hasFluxogramaData } from '$lib/types/guards';
	import { resolvePostLoginRedirect } from '$lib/utils/post-login-redirect';

	let status = $state('Processando autenticação...');
	let error = $state('');

	onMount(async () => {
		const code = $page.url.searchParams.get('code');
		const explicitNext = $page.url.searchParams.get('next') ?? '';
		const errorParam = $page.url.searchParams.get('error');

		if (errorParam) {
			goto(`/login?error=${errorParam}`);
			return;
		}

		if (code) {
			try {
				// Usa o mesmo cliente para exchange + callback (importante para novos usuários Google)
				const result = await authService.exchangeCodeForSessionAndHandleCallback(code);

				if (result.success) {
					status = 'Login realizado com sucesso!';
					goto(resolvePostLoginRedirect(explicitNext, hasFluxogramaData(result.user)));
				} else {
					error = result.error;
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				
				// Se for erro de PKCE code verifier, dar uma mensagem mais clara
				if (errorMessage.includes('code verifier') || errorMessage.includes('PKCE')) {
					error = 'Erro na autenticação: o processo foi iniciado em outra aba ou navegador. Tente fazer login novamente.';
				} else {
					error = errorMessage;
				}
				console.error('Callback error:', err);
			}
		} else {
			try {
				const result = await authService.handleOAuthCallback();

				if (result.success) {
					status = 'Login realizado com sucesso!';
					goto(resolvePostLoginRedirect(explicitNext, hasFluxogramaData(result.user)));
				} else {
					error = result.error;
				}
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
				console.error('Callback error:', err);
			}
		}
	});
</script>

<svelte:head>
	<title>Autenticando... - NoFluxo UNB</title>
</svelte:head>

<div class="callback-container">
	{#if error}
		<div class="error">
			<h2>Erro na autenticação</h2>
			<p>{error}</p>
			<a href="/login" class="auth-link">Voltar para login</a>
		</div>
	{:else}
		<div class="loading">
			<div class="spinner"></div>
			<p>{status}</p>
		</div>
	{/if}
</div>

<style>
	.callback-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--background));
	}

	.loading {
		text-align: center;
	}

	.loading p {
		color: hsl(var(--foreground));
	}

	.spinner {
		width: 48px;
		height: 48px;
		border: 4px solid hsl(var(--foreground) / 0.1);
		border-top-color: hsl(var(--primary));
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error {
		text-align: center;
		padding: 2rem;
	}

	.error h2 {
		color: hsl(var(--destructive));
		margin-bottom: 1rem;
	}

	.error p {
		color: hsl(var(--muted-foreground));
		margin-bottom: 1rem;
	}

	/* Dark: valores históricos (fundo preto, texto branco, spinner #6C63FF) */
	:global(.dark) .callback-container {
		background: #0a0a0a;
	}

	:global(.dark) .loading p {
		color: white;
	}

	:global(.dark) .spinner {
		border-color: rgba(255, 255, 255, 0.1);
		border-top-color: #6c63ff;
	}

	:global(.dark) .error h2 {
		color: #f87171;
	}

	:global(.dark) .error p {
		color: #d1d5db;
	}
</style>
