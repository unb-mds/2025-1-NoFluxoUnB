<script lang="ts">
	import { onMount } from 'svelte';
	import { authService } from '$lib/services/auth.service';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isLoading, authError, authStore } from '$lib/stores/auth';
	import { browser } from '$app/environment';
	import { AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-svelte';
	import GoogleIcon from '$lib/components/icons/GoogleIcon.svelte';
	import { loginSchema } from '$lib/schemas/auth';
	import { hasFluxogramaData } from '$lib/types/guards';
	import { resolvePostLoginRedirect } from '$lib/utils/post-login-redirect';

	const REMEMBER_KEY = 'nofluxo_remember_email';

	// D5 Vini (Médio): exibe a mensagem de sessão expirada quando o authGuard
	// redirecionou com ?error=session_expired. Antes, o param chegava na URL e
	// morria silenciosamente porque o LoginForm não lia $page.url.searchParams.
	let queryError = $derived.by(() => {
		const code = page.url?.searchParams?.get('error');
		switch (code) {
			case 'session_expired':
				return 'Sua sessão expirou. Faça login novamente.';
			case 'access_denied':
				return 'Você não tem permissão para acessar essa página.';
			default:
				return '';
		}
	});

	// D7 Vini (Médio): honra ?redirect= depois do login bem-sucedido em vez de
	// mandar todo mundo cego para /upload-historico. Whitelist defensiva: aceita
	// apenas paths internos (começando com '/' e sem '//' para evitar redirect
	// para origem externa).
	function getSafeRedirect(hasFluxograma: boolean): string {
		const candidate = page.url?.searchParams?.get('redirect') ?? '';
		const decoded = candidate ? decodeURIComponent(candidate) : '';
		return resolvePostLoginRedirect(decoded, hasFluxograma);
	}

	let email = $state('');
	let password = $state('');
	let rememberMe = $state(false);
	let localError = $state('');
	let submitting = $state(false);
	let showPassword = $state(false);

	// Field-level validation errors (shown after blur)
	let emailTouched = $state(false);
	let passwordTouched = $state(false);

	// Limpa erro global ao abrir a tela de login (evita mostrar erro de cadastro aqui)
	onMount(() => {
		authStore.setError(null);
	});

	let emailError = $derived.by(() => {
		if (!emailTouched || !email) return '';
		const result = loginSchema.shape.email.safeParse(email);
		return result.success ? '' : result.error.issues[0]?.message ?? '';
	});

	let passwordError = $derived.by(() => {
		if (!passwordTouched || !password) return '';
		return password.length === 0 ? 'Por favor, insira sua senha' : '';
	});

	let formValid = $derived(email.length > 0 && password.length > 0);

	// Restore remembered email on mount
	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem(REMEMBER_KEY);
			if (saved) {
				email = saved;
				rememberMe = true;
			}
		}
	});

	async function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		emailTouched = true;
		passwordTouched = true;

		if (!email || !password) {
			localError = 'Preencha todos os campos';
			return;
		}

		const parsed = loginSchema.safeParse({ email, password, rememberMe });
		if (!parsed.success) {
			localError = parsed.error.issues[0]?.message ?? 'Dados inválidos';
			return;
		}

		submitting = true;
		localError = '';

		// Persist or clear "remember me"
		if (browser) {
			if (rememberMe) {
				localStorage.setItem(REMEMBER_KEY, email);
			} else {
				localStorage.removeItem(REMEMBER_KEY);
			}
		}

		const result = await authService.signIn(email, password);

		if (result.success) {
			await goto(getSafeRedirect(hasFluxogramaData(result.user)));
		} else {
			localError = result.error;
		}

		submitting = false;
	}

	async function handleGoogleLogin() {
		submitting = true;
		localError = '';
		try {
			await authService.signInWithGoogle();
		} catch {
			localError = 'Erro ao iniciar login com Google';
			submitting = false;
		}
	}

</script>

<form onsubmit={handleLogin} class="w-full" novalidate>
	<!-- Title -->
	

	<!-- Error banner (inclui mensagem vinda do ?error= na URL — D5 Vini) -->
	{#if localError || $authError || queryError}
		<div class="auth-error" data-testid="login-error">
			<AlertTriangle class="h-5 w-5 shrink-0 text-amber-600" />
			<span>{localError || $authError || queryError}</span>
		</div>
	{/if}

	<!-- Email -->
	<div class="mb-4">
		<label for="login-email" class="mb-1.5 block text-sm font-medium text-foreground/80 dark:text-gray-700">Email</label>
		<input
			type="email"
			id="login-email"
			class="auth-input"
			class:border-red-400={emailTouched && emailError}
			bind:value={email}
			onblur={() => (emailTouched = true)}
			placeholder="seu@email.com"
			disabled={submitting}
		/>
		{#if emailTouched && emailError}
			<p class="mt-1 text-xs text-red-700 dark:text-red-500">{emailError}</p>
		{/if}
	</div>

	<!-- Password -->
	<div class="mb-2">
		<label for="login-password" class="mb-1.5 block text-sm font-medium text-foreground/80 dark:text-gray-700">Senha</label>
		<div class="relative">
			<input
				type={showPassword ? 'text' : 'password'}
				id="login-password"
				class="auth-input pr-12"
				bind:value={password}
				onblur={() => (passwordTouched = true)}
				placeholder="••••••••"
				disabled={submitting}
			/>
			<button
				type="button"
				class="absolute right-3.5 top-1/2 -translate-y-1/2 border-none bg-transparent p-1 cursor-pointer"
				onclick={() => (showPassword = !showPassword)}
				tabindex={-1}
				aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
			>
				{#if showPassword}
					<EyeOff class="h-5 w-5 text-muted-foreground dark:text-gray-400" />
				{:else}
					<Eye class="h-5 w-5 text-muted-foreground dark:text-gray-400" />
				{/if}
			</button>
		</div>
	</div>

	<!-- Remember me + Forgot password row -->
	<div class="mb-5 flex items-center justify-between">
		<label class="flex items-center gap-2 cursor-pointer select-none text-sm text-muted-foreground dark:text-gray-600">
			<input
				type="checkbox"
				bind:checked={rememberMe}
				disabled={submitting}
				class="h-4 w-4 rounded border-border-strong text-primary accent-primary dark:text-blue-600 dark:accent-blue-600"
			/>
			Lembrar-me
		</label>
		<a href="/password-recovery" class="auth-link text-sm">Esqueceu a senha?</a>
	</div>

	<!-- Submit -->
	<button type="submit" class="auth-btn" disabled={submitting || $isLoading || !formValid}>
		{#if submitting}
			<Loader2 class="h-5 w-5 animate-spin" />
			<span>Entrando...</span>
		{:else}
			Entrar
		{/if}
	</button>

	<!-- Register -->
	<a href="/signup" class="auth-btn-google no-underline" data-sveltekit-preload-data>
		Cadastrar
	</a>

	<!-- Divider -->
	<div class="auth-divider">
		<span>ou</span>
	</div>

	<!-- Google -->
	<button
		type="button"
		class="auth-btn-google"
		onclick={handleGoogleLogin}
		disabled={submitting}
	>
		<GoogleIcon />
		Continuar com Google
	</button>

</form>

<style>
	.auth-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
</style>
