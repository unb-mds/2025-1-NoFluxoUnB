<script lang="ts">
	import { authService } from '$lib/services/auth.service';
	import { AlertTriangle, CheckCircle, Mail, ArrowLeft, Loader2 } from 'lucide-svelte';
	import { passwordRecoverySchema } from '$lib/schemas/auth';

	let email = $state('');
	let localError = $state('');
	let submitting = $state(false);
	let success = $state(false);
	let emailTouched = $state(false);

	let emailError = $derived.by(() => {
		if (!emailTouched || !email) return '';
		const result = passwordRecoverySchema.shape.email.safeParse(email);
		return result.success ? '' : result.error.issues[0]?.message ?? '';
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		emailTouched = true;

		if (!email) {
			localError = 'Informe seu email';
			return;
		}

		const parsed = passwordRecoverySchema.safeParse({ email });
		if (!parsed.success) {
			localError = parsed.error.issues[0]?.message ?? 'Email inválido';
			return;
		}

		submitting = true;
		localError = '';

		const result = await authService.sendPasswordResetEmail(email);

		if (result.success) {
			success = true;
		} else {
			localError = result.error || 'Erro ao enviar email de recuperação';
		}

		submitting = false;
	}
</script>

<form onsubmit={handleSubmit} class="w-full" novalidate>
	<h2 class="mb-2 text-center text-[28px] font-bold text-primary dark:text-blue-600">Recuperar Senha</h2>

	{#if success}
		<div class="flex flex-col items-center gap-4 py-4">
			<div class="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
				<Mail class="h-8 w-8 text-emerald-600" />
			</div>
			<div class="auth-success flex items-center gap-3">
				<CheckCircle class="h-5 w-5 shrink-0 text-emerald-600" />
				<span>Email de recuperação enviado! Verifique sua caixa de entrada.</span>
			</div>
			<p class="text-center text-sm text-muted-foreground">
				Se não encontrar o email, verifique a pasta de spam.
			</p>
			<a href="/login" class="auth-link mt-2 flex items-center gap-1.5 text-sm font-medium">
				<ArrowLeft class="h-4 w-4" />
				Voltar para login
			</a>
		</div>
	{:else}
		<p class="mb-6 text-center text-[0.95rem] leading-relaxed text-muted-foreground">
			Informe seu email cadastrado e enviaremos um link para redefinir sua senha.
		</p>

		{#if localError}
			<div class="auth-error">
				<AlertTriangle class="h-5 w-5 shrink-0 text-amber-600" />
				<span>{localError}</span>
			</div>
		{/if}

		<div class="mb-5">
			<label for="recovery-email" class="mb-1.5 block text-sm font-medium text-foreground/80 dark:text-gray-700">Email</label>
			<input
				type="email"
				id="recovery-email"
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

		<button type="submit" class="auth-btn" disabled={submitting || !email}>
			{#if submitting}
				<Loader2 class="h-5 w-5 animate-spin" />
				<span>Enviando...</span>
			{:else}
				Enviar link de recuperação
			{/if}
		</button>

		<div class="mt-6 text-center">
			<a href="/login" class="auth-link flex items-center justify-center gap-1.5 text-sm">
				<ArrowLeft class="h-4 w-4" />
				Voltar para login
			</a>
		</div>
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
