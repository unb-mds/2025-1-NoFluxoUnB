<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { config } from '$lib/config';
	import type { UserModel } from '$lib/types/auth';

	const DEV_IMPERSONATE_KEY = 'nofluxo_dev_impersonate';

	type Preset = {
		label: string;
		description: string;
		user: UserModel;
	};

	const presets: Preset[] = [
		{
			label: 'Estudante padrão',
			description: 'idUser=1, sem admin, sem fluxograma carregado',
			user: {
				idUser: 1,
				email: 'estudante@dev.local',
				nomeCompleto: 'Estudante de Teste',
				token: null,
				isAdmin: false,
				dadosFluxograma: null
			}
		},
		{
			label: 'Admin (escopo tickets)',
			description: 'idUser=2, isAdmin=true, scopes=["tickets"]',
			user: {
				idUser: 2,
				email: 'admin@dev.local',
				nomeCompleto: 'Admin de Teste',
				token: null,
				isAdmin: true,
				adminRole: 'admin',
				adminScopes: ['tickets'],
				dadosFluxograma: null
			}
		},
		{
			label: 'Superadmin',
			description: 'idUser=3, todos os escopos liberados',
			user: {
				idUser: 3,
				email: 'super@dev.local',
				nomeCompleto: 'Superadmin de Teste',
				token: null,
				isAdmin: true,
				adminRole: 'superadmin',
				adminScopes: ['tickets', 'dashboard'],
				dadosFluxograma: null
			}
		}
	];

	let idUser = $state(1);
	let email = $state('estudante@dev.local');
	let nomeCompleto = $state('Estudante de Teste');
	let isAdmin = $state(false);
	let adminRole = $state<'admin' | 'superadmin' | ''>('');
	let adminScopes = $state('');
	let redirectTo = $state('/upload-historico');
	let status = $state<string | null>(null);

	function applyPreset(preset: Preset) {
		idUser = preset.user.idUser;
		email = preset.user.email;
		nomeCompleto = preset.user.nomeCompleto;
		isAdmin = preset.user.isAdmin ?? false;
		adminRole = preset.user.adminRole ?? '';
		adminScopes = (preset.user.adminScopes ?? []).join(',');
	}

	function impersonate() {
		const user: UserModel = {
			idUser,
			email,
			nomeCompleto,
			token: null,
			isAdmin,
			adminRole: adminRole || null,
			adminScopes: adminScopes
				? adminScopes.split(',').map((s) => s.trim()).filter(Boolean)
				: [],
			dadosFluxograma: null
		};
		localStorage.setItem(DEV_IMPERSONATE_KEY, 'true');
		authStore.setUser(user);
		status = `Impersonando ${email}. Redirecionando para ${redirectTo}...`;
		setTimeout(() => goto(redirectTo), 300);
	}

	function clearImpersonation() {
		localStorage.removeItem(DEV_IMPERSONATE_KEY);
		authStore.clear();
		status = 'Impersonação removida. authStore limpo.';
	}
</script>

<svelte:head>
	<title>Dev · Impersonar usuário</title>
</svelte:head>

<main class="wrap">
	<header>
		<h1>Dev · Impersonar usuário</h1>
		<p class="warn">
			Modo de desenvolvimento — <strong>não funciona em produção</strong>. PUBLIC_ENVIRONMENT atual:
			<code>{config.isProd ? 'production' : 'development/other'}</code>.
		</p>
	</header>

	<section class="presets">
		<h2>Presets</h2>
		<div class="preset-grid">
			{#each presets as preset}
				<button type="button" class="preset" onclick={() => applyPreset(preset)}>
					<strong>{preset.label}</strong>
					<span>{preset.description}</span>
				</button>
			{/each}
		</div>
	</section>

	<section class="form">
		<h2>Usuário customizado</h2>
		<label>
			idUser
			<input type="number" bind:value={idUser} min="1" data-testid="idUser" />
		</label>
		<label>
			Email (deve existir em <code>public.users</code> se você for chamar endpoints autenticados)
			<input type="email" bind:value={email} data-testid="email" />
		</label>
		<label>
			Nome completo
			<input type="text" bind:value={nomeCompleto} data-testid="nomeCompleto" />
		</label>
		<label class="row">
			<input type="checkbox" bind:checked={isAdmin} data-testid="isAdmin" />
			isAdmin
		</label>
		{#if isAdmin}
			<label>
				adminRole
				<select bind:value={adminRole} data-testid="adminRole">
					<option value="">(nenhum)</option>
					<option value="admin">admin</option>
					<option value="superadmin">superadmin</option>
				</select>
			</label>
			<label>
				adminScopes (separados por vírgula, ex.: <code>tickets,dashboard</code>)
				<input type="text" bind:value={adminScopes} data-testid="adminScopes" />
			</label>
		{/if}
		<label>
			Redirecionar para
			<input type="text" bind:value={redirectTo} data-testid="redirectTo" />
		</label>

		<div class="actions">
			<button type="button" class="primary" onclick={impersonate} data-testid="submit">
				Impersonar
			</button>
			<button type="button" onclick={clearImpersonation} data-testid="clear">
				Limpar impersonação
			</button>
		</div>

		{#if status}
			<p class="status" data-testid="status">{status}</p>
		{/if}
	</section>

	<section class="docs">
		<h2>Como funciona</h2>
		<ul>
			<li>Esta rota injeta um <code>UserModel</code> sintético direto no <code>authStore</code> e marca
				<code>localStorage.nofluxo_dev_impersonate = "true"</code>.</li>
			<li>O <code>authGuard</code> reconhece a flag e pula <code>isSessionValid()</code> (que falharia sem sessão Supabase real).</li>
			<li>O <code>auth.service.getAuthHeaders()</code> manda <code>X-Dev-Impersonate: &lt;email&gt;</code> em vez de Bearer token.</li>
			<li>O backend (<code>Utils.checkAuthorization</code>) honra esse header só quando <code>NODE_ENV !== "production"</code>, fazendo lookup do usuário em <code>public.users</code> por <code>id_user</code> e comparando o email.</li>
			<li>Para impersonar um usuário real do banco, use o <code>idUser</code> e <code>email</code> que existem em <code>public.users</code>. Para teste puro de UI, qualquer valor funciona (chamadas autenticadas só falham no backend lookup).</li>
		</ul>
	</section>
</main>

<style>
	/* Página de dev: usa só tokens do tema (funciona no light e no dark). */
	.wrap {
		max-width: 720px;
		margin: 2rem auto;
		padding: 0 1.5rem;
		font-family: system-ui, -apple-system, sans-serif;
		color: hsl(var(--foreground));
	}
	h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
	h2 { font-size: 1.1rem; margin-top: 2rem; margin-bottom: 0.75rem; }
	.warn {
		background: rgba(245, 158, 11, 0.12);
		border-left: 4px solid #d97706;
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		border-radius: 4px;
	}
	.preset-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.5rem;
	}
	@media (min-width: 640px) {
		.preset-grid { grid-template-columns: 1fr 1fr 1fr; }
	}
	.preset {
		text-align: left;
		padding: 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		cursor: pointer;
	}
	.preset:hover { border-color: hsl(var(--primary)); background: hsl(var(--accent)); }
	.preset strong { display: block; margin-bottom: 0.25rem; }
	.preset span { font-size: 0.8rem; color: hsl(var(--muted-foreground)); }
	label {
		display: block;
		margin: 0.5rem 0;
		font-size: 0.9rem;
	}
	label.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	input[type=text], input[type=email], input[type=number], select {
		display: block;
		width: 100%;
		padding: 0.4rem 0.5rem;
		font-size: 0.95rem;
		border: 1px solid hsl(var(--border-strong));
		border-radius: 4px;
		margin-top: 0.2rem;
		background: hsl(var(--input));
		color: hsl(var(--foreground));
	}
	.actions { margin-top: 1rem; display: flex; gap: 0.75rem; }
	button.primary {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		padding: 0.6rem 1.2rem;
		font-weight: 600;
		border-radius: 4px;
		cursor: pointer;
	}
	button.primary:hover { background: hsl(var(--accent-foreground)); }
	button:not(.primary):not(.preset) {
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border-strong));
		padding: 0.6rem 1.2rem;
		border-radius: 4px;
		cursor: pointer;
	}
	.status {
		margin-top: 1rem;
		padding: 0.5rem 0.75rem;
		background: rgba(16, 185, 129, 0.12);
		border-left: 4px solid #059669;
		border-radius: 4px;
		font-size: 0.9rem;
	}
	.docs ul { font-size: 0.9rem; line-height: 1.5; padding-left: 1.25rem; }
	code {
		background: hsl(var(--muted));
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		font-size: 0.85em;
	}
</style>
