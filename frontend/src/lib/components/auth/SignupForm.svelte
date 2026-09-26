<script lang="ts">
	import { authService } from '$lib/services/auth.service';
	import { goto } from '$app/navigation';
	import { isLoading } from '$lib/stores/auth';
	import { AlertTriangle, Eye, EyeOff, CheckCircle, Circle, Loader2 } from 'lucide-svelte';
	import GoogleIcon from '$lib/components/icons/GoogleIcon.svelte';
	import { signupSchema, passwordRequirements } from '$lib/schemas/auth';

	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let displayName = $state('');
	let acceptTerms = $state(false);
	let localError = $state('');
	let submitting = $state(false);
	let success = $state(false);
	let showPassword = $state(false);
	let showConfirm = $state(false);

	// Touch tracking
	let nameTouched = $state(false);
	let emailTouched = $state(false);
	let passwordTouched = $state(false);
	let confirmTouched = $state(false);

	// Password strength checks (reactive)
	let pwChecks = $derived(
		passwordRequirements.map((req) => ({
			label: req.label,
			met: req.test(password)
		}))
	);

	let allPwChecksMet = $derived(pwChecks.every((c) => c.met));

	// Field-level validation
	let nameError = $derived.by(() => {
		if (!nameTouched || !displayName) return '';
		if (displayName.length < 3) return 'Nome deve ter pelo menos 3 caracteres';
		if (displayName.trim().split(/\s+/).length < 2) return 'Insira nome e sobrenome';
		return '';
	});

	let emailError = $derived.by(() => {
		if (!emailTouched || !email) return '';
		const result = signupSchema.shape.email.safeParse(email);
		return result.success ? '' : result.error.issues[0]?.message ?? '';
	});

	let confirmError = $derived.by(() => {
		if (!confirmTouched || !confirmPassword) return '';
		return password !== confirmPassword ? 'As senhas não coincidem' : '';
	});

	// Missing requirements for the "Falta preencher" section
	let missingRequirements = $derived.by(() => {
		const missing: string[] = [];
		if (!displayName || displayName.length < 3) missing.push('Nome completo');
		if (!email) missing.push('Email');
		if (!allPwChecksMet) missing.push('Senha válida');
		if (!confirmPassword || password !== confirmPassword) missing.push('Confirmação de senha');
		if (!acceptTerms) missing.push('Aceitar termos');
		return missing;
	});

	let formValid = $derived(
		displayName.length >= 3 &&
			displayName.trim().split(/\s+/).length >= 2 &&
			email.length > 0 &&
			allPwChecksMet &&
			confirmPassword === password &&
			confirmPassword.length > 0 &&
			acceptTerms
	);

	async function handleSignup(e: SubmitEvent) {
		e.preventDefault();
		nameTouched = true;
		emailTouched = true;
		passwordTouched = true;
		confirmTouched = true;

		const parsed = signupSchema.safeParse({
			name: displayName,
			email,
			password,
			confirmPassword,
			acceptTerms
		});

		if (!parsed.success) {
			localError = parsed.error.issues[0]?.message ?? 'Dados inválidos';
			return;
		}

		submitting = true;
		localError = '';

		const result = await authService.signUp(email, password, displayName || undefined);

		if (result.success) {
			success = true;
			setTimeout(() => {
				goto('/login');
			}, 3000);
		} else {
			localError = result.error;
		}

		submitting = false;
	}

	async function handleGoogleSignup() {
		submitting = true;
		localError = '';
		try {
			await authService.signInWithGoogle();
		} catch {
			localError = 'Erro ao iniciar cadastro com Google';
			submitting = false;
		}
	}
</script>

<form onsubmit={handleSignup} class="w-full" novalidate>
	<h2 class="mb-6 text-center text-[28px] font-bold text-primary dark:text-blue-600">Criar Conta</h2>

	{#if success}
		<div class="auth-success flex items-center gap-3">
			<CheckCircle class="h-5 w-5 shrink-0 text-emerald-600" />
			<span>Conta criada com sucesso! Verifique seu email para confirmar o cadastro. Redirecionando...</span>
		</div>
	{:else}
		{#if localError}
			<div class="auth-error">
				<AlertTriangle class="h-5 w-5 shrink-0 text-amber-600" />
				<span>{localError}</span>
			</div>
		{/if}

		<!-- Name -->
		<div class="mb-4">
			<label for="signup-name" class="mb-1.5 block text-sm font-medium text-foreground/80 dark:text-gray-700">
				Nome Completo <span class="text-red-600 dark:text-red-400">*</span>
			</label>
			<input
				type="text"
				id="signup-name"
				class="auth-input"
				class:border-red-400={nameTouched && nameError}
				class:border-emerald-400={nameTouched && !nameError && displayName.length > 0}
				bind:value={displayName}
				onblur={() => (nameTouched = true)}
				placeholder="Seu nome completo"
				disabled={submitting}
			/>
			{#if nameTouched && nameError}
				<p class="mt-1 text-xs text-red-700 dark:text-red-500">{nameError}</p>
			{/if}
		</div>

		<!-- Email -->
		<div class="mb-4">
			<label for="signup-email" class="mb-1.5 block text-sm font-medium text-foreground/80 dark:text-gray-700">
				Email <span class="text-red-600 dark:text-red-400">*</span>
			</label>
			<input
				type="email"
				id="signup-email"
				class="auth-input"
				class:border-red-400={emailTouched && emailError}
				class:border-emerald-400={emailTouched && !emailError && email.length > 0}
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
			<label for="signup-password" class="mb-1.5 block text-sm font-medium text-foreground/80 dark:text-gray-700">
				Senha <span class="text-red-600 dark:text-red-400">*</span>
			</label>
			<div class="relative">
				<input
					type={showPassword ? 'text' : 'password'}
					id="signup-password"
					class="auth-input pr-12"
					bind:value={password}
					onblur={() => (passwordTouched = true)}
					placeholder="Mínimo 8 caracteres"
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

		<!-- Password strength indicators -->
		{#if password.length > 0}
			<div class="mb-4 rounded-xl bg-muted px-4 py-3">
				<p class="mb-2 text-xs font-medium text-muted-foreground">Requisitos da senha:</p>
				<ul class="space-y-1">
					{#each pwChecks as check}
						<li class="flex items-center gap-2 text-xs">
							{#if check.met}
								<CheckCircle class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
								<span class="text-emerald-700">{check.label}</span>
							{:else}
								<Circle class="h-3.5 w-3.5 text-border-strong" />
								<span class="text-muted-foreground dark:text-gray-400">{check.label}</span>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Confirm password -->
		<div class="mb-4">
			<label for="signup-confirm" class="mb-1.5 block text-sm font-medium text-foreground/80 dark:text-gray-700">
				Confirmar Senha <span class="text-red-600 dark:text-red-400">*</span>
			</label>
			<div class="relative">
				<input
					type={showConfirm ? 'text' : 'password'}
					id="signup-confirm"
					class="auth-input pr-12"
					class:border-red-400={confirmTouched && confirmError}
					class:border-emerald-400={confirmTouched && !confirmError && confirmPassword.length > 0}
					bind:value={confirmPassword}
					onblur={() => (confirmTouched = true)}
					placeholder="Repita a senha"
					disabled={submitting}
				/>
				<button
					type="button"
					class="absolute right-3.5 top-1/2 -translate-y-1/2 border-none bg-transparent p-1 cursor-pointer"
					onclick={() => (showConfirm = !showConfirm)}
					tabindex={-1}
					aria-label={showConfirm ? 'Ocultar senha' : 'Mostrar senha'}
				>
					{#if showConfirm}
						<EyeOff class="h-5 w-5 text-muted-foreground dark:text-gray-400" />
					{:else}
						<Eye class="h-5 w-5 text-muted-foreground dark:text-gray-400" />
					{/if}
				</button>
			</div>
			{#if confirmTouched && confirmError}
				<p class="mt-1 text-xs text-red-700 dark:text-red-500">{confirmError}</p>
			{/if}
		</div>

		<!-- Terms checkbox -->
		<label class="mb-5 flex items-start gap-2.5 cursor-pointer select-none text-sm text-muted-foreground dark:text-gray-600">
			<input
				type="checkbox"
				bind:checked={acceptTerms}
				disabled={submitting}
				class="mt-0.5 h-4 w-4 rounded border-border-strong text-primary accent-primary dark:text-blue-600 dark:accent-blue-600"
			/>
			<span>
				Li e aceito os
				<a href="/termos" class="auth-link" target="_blank" rel="noopener">Termos de Serviço</a>
				e a
				<a href="/privacidade" class="auth-link" target="_blank" rel="noopener">Política de Privacidade</a>
			</span>
		</label>

		<!-- Missing requirements -->
		{#if missingRequirements.length > 0 && (nameTouched || emailTouched || passwordTouched)}
			<div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
				<p class="mb-1 text-xs font-semibold text-amber-700">Falta preencher:</p>
				<ul class="list-disc pl-4 text-xs text-amber-800 dark:text-amber-600">
					{#each missingRequirements as req}
						<li>{req}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Submit -->
		<button
			type="submit"
			class="auth-btn"
			disabled={submitting || $isLoading || !formValid}
		>
			{#if submitting}
				<Loader2 class="h-5 w-5 animate-spin" />
				<span>Criando conta...</span>
			{:else}
				Criar Conta
			{/if}
		</button>

		<!-- Divider -->
		<div class="auth-divider">
			<span>ou</span>
		</div>

		<!-- Google signup -->
		<button
			type="button"
			class="auth-btn-google"
			onclick={handleGoogleSignup}
			disabled={submitting}
		>
			<GoogleIcon />
			Cadastrar com Google
		</button>

		<!-- Link to login -->
		<p class="mt-6 text-center text-sm text-muted-foreground">
			Já tem uma conta?
			<a href="/login" class="auth-link font-medium">Entrar</a>
		</p>
	{/if}
</form>

<style>
	.auth-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
</style>
