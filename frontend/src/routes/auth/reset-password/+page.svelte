<script lang="ts">
	import { onMount } from 'svelte';
	import { authService } from '$lib/services/auth.service';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AuthHomeLink from '$lib/components/auth/AuthHomeLink.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import { AlertTriangle, CheckCircle, Eye, EyeOff } from 'lucide-svelte';

	let newPassword = $state('');
	let confirmPassword = $state('');
	let localError = $state('');
	let submitting = $state(false);
	let success = $state(false);
	let showPassword = $state(false);
	let showConfirm = $state(false);
	let verifying = $state(true);
	let linkValid = $state(false);

	onMount(async () => {
		const tokenHash = $page.url.searchParams.get('token_hash');
		const type = $page.url.searchParams.get('type');

		if (tokenHash && type === 'recovery') {
			const result = await authService.verifyRecoveryToken(tokenHash);
			verifying = false;
			linkValid = result.success;
			if (!result.success) {
				localError = result.error || 'Link inválido ou expirado. Solicite uma nova redefinição de senha.';
			}
			return;
		}

		// Sem token_hash: pode ser fluxo por hash na URL (cliente restaura sessão) ou acesso direto
		const session = await authService.getSession();
		verifying = false;
		linkValid = !!session;
		if (!session) {
			localError = 'Acesse pelo link enviado no seu e-mail para redefinir a senha.';
		}
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();

		if (!newPassword || !confirmPassword) {
			localError = 'Preencha todos os campos';
			return;
		}

		if (newPassword !== confirmPassword) {
			localError = 'As senhas não coincidem';
			return;
		}

		if (newPassword.length < 6) {
			localError = 'A senha deve ter pelo menos 6 caracteres';
			return;
		}

		submitting = true;
		localError = '';

		const result = await authService.updatePassword(newPassword);

		if (result.success) {
			success = true;
			// Encerra a sessão de recovery para não deixar o usuário logado; ele deve entrar com a nova senha
			await authService.signOut();
			setTimeout(() => {
				goto('/login');
			}, 3000);
		} else {
			localError = result.error || 'Erro ao atualizar senha';
		}

		submitting = false;
	}
</script>

<PageMeta title="Redefinir senha" description="Defina uma nova senha para sua conta NoFluxo UNB." noIndex={true} />

<PageBackground />

<div class="relative z-10 flex min-h-screen items-center justify-center px-4">
	<AuthHomeLink />
	<div class="flex w-full max-w-md flex-col items-center gap-4">
		<a href="/" class="nf-wordmark nf-wordmark--hero drop-shadow-sm" aria-label="NoFluxo UNB — início">
			<span class="nf-wordmark-noflx">NOFLX</span><span class="nf-wordmark-unb">UNB</span>
		</a>
		<div class="auth-card w-full">
		<form onsubmit={handleSubmit}>
			<h2>Redefinir Senha</h2>

			{#if verifying}
				<div class="auth-loading">
					<div class="spinner"></div>
					<span>Verificando link...</span>
				</div>
			{:else if !linkValid}
				<div class="auth-error">
					<AlertTriangle class="h-5 w-5 shrink-0 text-amber-600" />
					<span>{localError}</span>
				</div>
				<a href="/password-recovery" class="auth-link">Solicitar novo link</a>
				<a href="/login" class="auth-link">Voltar ao login</a>
			{:else if success}
				<div class="auth-success">
					<CheckCircle class="h-5 w-5 shrink-0 text-emerald-600" />
					<span>Senha atualizada. Faça login com sua nova senha. Redirecionando...</span>
				</div>
			{:else}
				{#if localError}
					<div class="auth-error">
						<AlertTriangle class="h-5 w-5 shrink-0 text-amber-600" />
						<span>{localError}</span>
					</div>
				{/if}

				<div class="form-group">
					<label for="newPassword">Nova Senha</label>
					<div class="password-wrapper">
						<input
							type={showPassword ? 'text' : 'password'}
							id="newPassword"
							class="auth-input"
							bind:value={newPassword}
							placeholder="Mínimo 6 caracteres"
							disabled={submitting}
							required
						/>
						<button type="button" class="password-toggle" onclick={() => showPassword = !showPassword} tabindex="-1">
							{#if showPassword}<EyeOff class="h-5 w-5 text-muted-foreground dark:text-gray-400" />{:else}<Eye class="h-5 w-5 text-muted-foreground dark:text-gray-400" />{/if}
						</button>
					</div>
				</div>

				<div class="form-group">
					<label for="confirmPassword">Confirmar Nova Senha</label>
					<div class="password-wrapper">
						<input
							type={showConfirm ? 'text' : 'password'}
							id="confirmPassword"
							class="auth-input"
							bind:value={confirmPassword}
							placeholder="Repita a nova senha"
							disabled={submitting}
							required
						/>
						<button type="button" class="password-toggle" onclick={() => showConfirm = !showConfirm} tabindex="-1">
							{#if showConfirm}<EyeOff class="h-5 w-5 text-muted-foreground dark:text-gray-400" />{:else}<Eye class="h-5 w-5 text-muted-foreground dark:text-gray-400" />{/if}
						</button>
					</div>
				</div>

				<button type="submit" class="auth-btn" disabled={submitting}>
					{#if submitting}
						Atualizando...
					{:else}
						Atualizar Senha
					{/if}
				</button>
			{/if}
		</form>
		</div>
	</div>
</div>

<style>
	form {
		width: 100%;
	}

	h2 {
		text-align: center;
		margin-bottom: 1.5rem;
		color: hsl(var(--primary));
		font-size: 28px;
		font-weight: 700;
	}

	.form-group {
		margin-bottom: 1rem;
	}

	.auth-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 0;
		color: hsl(var(--foreground) / 0.8);
	}

	.auth-loading .spinner {
		width: 32px;
		height: 32px;
		border: 3px solid hsl(var(--primary) / 0.2);
		border-top-color: hsl(var(--primary));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.auth-link {
		display: block;
		text-align: center;
		margin-top: 0.75rem;
		color: hsl(var(--primary));
		text-decoration: none;
		font-size: 14px;
	}

	.auth-link:hover {
		text-decoration: underline;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		font-size: 14px;
		color: hsl(var(--foreground) / 0.8);
	}

	/* Card branco legado no dark: mantém o azul/cinzas históricos */
	:global(.dark) h2,
	:global(.dark) .auth-link {
		color: #2563eb;
	}

	:global(.dark) .auth-loading,
	:global(.dark) label {
		color: #374151;
	}

	:global(.dark) .auth-loading .spinner {
		border-color: rgba(37, 99, 235, 0.2);
		border-top-color: #2563eb;
	}

	.password-wrapper {
		position: relative;
	}

	.password-toggle {
		position: absolute;
		right: 14px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
	}
</style>
