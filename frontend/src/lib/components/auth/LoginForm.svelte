<script lang="ts">
	import { onMount } from 'svelte';
	import { authService } from '$lib/services/auth.service';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isLoading, authError, authStore } from '$lib/stores/auth';
	import { browser } from '$app/environment';
	import { AlertTriangle, Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-svelte';
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


	interface Props {
		/** Entrar como visitante (sem conta). */
		onVisitor?: () => void;
	}
	let { onVisitor }: Props = $props();
</script>

<form onsubmit={handleLogin} class="auth-form" novalidate>
	<header class="auth-head">
		<h1 class="auth-title">Bem-vindo de volta</h1>
		<p class="auth-subtitle">Entre para ver seu fluxograma e continuar de onde parou.</p>
	</header>

	<!-- Error banner (inclui mensagem vinda do ?error= na URL — D5 Vini) -->
	{#if localError || $authError || queryError}
		<div class="auth-error" data-testid="login-error" role="alert">
			<AlertTriangle class="h-5 w-5 shrink-0 text-amber-600" />
			<span>{localError || $authError || queryError}</span>
		</div>
	{/if}

	<div class="auth-fields">
		<!-- Email -->
		<div class="auth-field">
			<label for="login-email" class="auth-label">Email</label>
			<div class="auth-input-wrap">
				<Mail class="auth-input-icon" aria-hidden="true" />
				<input
					type="email"
					id="login-email"
					class="auth-input auth-input--icon"
					class:auth-input--invalid={emailTouched && emailError}
					aria-invalid={emailTouched && !!emailError}
					aria-describedby={emailTouched && emailError ? 'login-email-error' : undefined}
					autocomplete="email"
					bind:value={email}
					onblur={() => (emailTouched = true)}
					placeholder="seu@email.com"
					disabled={submitting}
				/>
			</div>
			{#if emailTouched && emailError}
				<p id="login-email-error" class="auth-field-error" aria-live="polite">{emailError}</p>
			{/if}
		</div>

		<!-- Password -->
		<div class="auth-field">
			<div class="flex items-center justify-between">
				<label for="login-password" class="auth-label">Senha</label>
				<a href="/password-recovery" class="auth-link text-xs font-medium">Esqueceu a senha?</a>
			</div>
			<div class="auth-input-wrap">
				<Lock class="auth-input-icon" aria-hidden="true" />
				<input
					type={showPassword ? 'text' : 'password'}
					id="login-password"
					class="auth-input auth-input--icon pr-12"
					autocomplete="current-password"
					bind:value={password}
					onblur={() => (passwordTouched = true)}
					placeholder="••••••••"
					disabled={submitting}
				/>
				<button
					type="button"
					class="auth-input-action"
					onclick={() => (showPassword = !showPassword)}
					aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
					aria-pressed={showPassword}
				>
					{#if showPassword}
						<EyeOff class="h-5 w-5" />
					{:else}
						<Eye class="h-5 w-5" />
					{/if}
				</button>
			</div>
		</div>

		<label class="auth-remember">
			<input type="checkbox" bind:checked={rememberMe} disabled={submitting} />
			<span>Lembrar-me neste dispositivo</span>
		</label>
	</div>

	<div class="auth-actions">
		<button type="submit" class="auth-btn" disabled={submitting || $isLoading || !formValid}>
			{#if submitting}
				<Loader2 class="h-5 w-5 animate-spin" />
				<span>Entrando...</span>
			{:else}
				Entrar
			{/if}
		</button>

		<div class="auth-divider"><span>ou continue com</span></div>

		<button type="button" class="auth-btn-google" onclick={handleGoogleLogin} disabled={submitting}>
			<GoogleIcon />
			Google
		</button>

		{#if onVisitor}
			<button type="button" class="auth-btn-ghost" onclick={onVisitor} disabled={submitting}>
				Continuar como visitante
			</button>
		{/if}
	</div>

	<footer class="auth-foot">
		<span>Não tem conta?</span>
		<a href="/signup" class="auth-link font-semibold" data-sveltekit-preload-data>Criar conta</a>
	</footer>
</form>
