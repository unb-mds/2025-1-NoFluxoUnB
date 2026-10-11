<script lang="ts">
	import { Wallet } from 'lucide-svelte';
	import type { AiSaldoStatus, AiSaldoTipoRegistro } from '$lib/types/dashboard';
	import {
		fmtDataHora,
		fmtMoeda,
		parseValorReais,
		textoPrevisao,
		textoUltimoRegistro,
		TEXTO_ESTIMATIVA,
		URL_PAINEL_MARITACA
	} from '$lib/utils/ia-saldo';

	/**
	 * Saldo estimado da Maritaca e o formulário em que o admin informa o saldo
	 * que vê no painel (a Maritaca não tem API de saldo) ou registra uma
	 * recarga. `onRegistrar` chama a RPC registrar_ai_saldo e devolve o status
	 * novo — quem guarda o estado é a página.
	 */
	let {
		status,
		onRegistrar,
		agora = new Date()
	}: {
		status: AiSaldoStatus | null;
		onRegistrar: (tipo: AiSaldoTipoRegistro, valor: number, observacao: string | null) => Promise<void>;
		agora?: Date;
	} = $props();

	let tipo = $state<AiSaldoTipoRegistro>('saldo_atual');
	let valorTxt = $state('');
	let observacao = $state('');
	let enviando = $state(false);
	let erro = $state<string | null>(null);
	let registrado = $state(false);

	const configurado = $derived(Boolean(status?.configurado));
	const corSaldo = $derived(
		status?.alertas.includes('urgente')
			? 'text-status-danger'
			: status?.alertas.includes('atencao')
				? 'text-status-warning'
				: 'text-card-foreground'
	);

	function escolher(t: AiSaldoTipoRegistro) {
		tipo = t;
		erro = null;
		registrado = false;
	}

	async function enviar(e: SubmitEvent) {
		e.preventDefault();
		erro = null;
		registrado = false;
		const valor = parseValorReais(valorTxt, tipo);
		if (valor === null) {
			erro =
				tipo === 'recarga'
					? 'Informe o valor da recarga, maior que zero (ex.: 50 ou 50,00).'
					: 'Informe o saldo em reais (ex.: 123,45).';
			return;
		}
		enviando = true;
		try {
			await onRegistrar(tipo, valor, observacao.trim() || null);
			valorTxt = '';
			observacao = '';
			registrado = true;
		} catch (err) {
			erro = err instanceof Error ? err.message : 'Não foi possível registrar.';
		} finally {
			enviando = false;
		}
	}
</script>

<section class="rounded-xl border border-border bg-card px-5 py-4 text-card-foreground">
	<h2 class="mb-3.5 flex items-center gap-2 text-sm font-bold text-card-foreground">
		<Wallet class="h-4 w-4" /> Saldo da IA (Maritaca)
	</h2>

	{#if !status}
		<p class="text-[13px] text-muted-foreground">
			Saldo indisponível — aplique a migration <code>20260930_ai_saldo.sql</code>.
		</p>
	{:else}
		<div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
			<div class="flex flex-col gap-1.5">
				<span class="rotulo">Saldo estimado</span>
				<span class="text-2xl font-bold {corSaldo}" data-testid="saldo-estimado">
					{configurado ? fmtMoeda(status.saldo_estimado, status.moeda) : '—'}
				</span>
				{#if status.base}
					<span class="text-xs text-muted-foreground">
						{fmtMoeda(status.base.valor, status.moeda)} informados em {fmtDataHora(status.base.registrado_em)}
						{#if status.base.n_recargas > 0}
							+ {fmtMoeda(status.base.recargas, status.moeda)} em {status.base.n_recargas}
							{status.base.n_recargas === 1 ? 'recarga' : 'recargas'}
						{/if}
						− {fmtMoeda(status.custo_desde_base, status.moeda)} gastos desde então
					</span>
				{:else}
					<span class="text-xs text-muted-foreground">Informe o saldo do painel da Maritaca abaixo.</span>
				{/if}
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="rotulo">Previsão</span>
				<span class="text-[13px] text-card-foreground" data-testid="saldo-previsao">{textoPrevisao(status)}</span>
			</div>
			<div class="flex flex-col gap-1.5">
				<span class="rotulo">Último registro</span>
				<span class="text-[13px] text-card-foreground" data-testid="saldo-ultimo">
					{textoUltimoRegistro(status, agora)}
				</span>
				{#if status.ultimo_registro}
					<span class="text-xs text-muted-foreground">
						{fmtDataHora(status.ultimo_registro.registrado_em)}{status.ultimo_registro.observacao
							? ` — “${status.ultimo_registro.observacao}”`
							: ''}
					</span>
				{/if}
			</div>
		</div>

		{#if status.modelos_maritaca_sem_preco.length > 0}
			<p class="mt-3 text-[13px] text-status-warning">
				Sem preço em ai_pricing (entram como R$ 0 no gasto): {status.modelos_maritaca_sem_preco.join(', ')}.
			</p>
		{/if}

		<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
			{TEXTO_ESTIMATIVA}
			<a class="link" href={URL_PAINEL_MARITACA} target="_blank" rel="noopener noreferrer">
				Ver o saldo real em plataforma.maritaca.ai
			</a>
		</p>

		<form class="mt-4 flex flex-col gap-3 border-t border-border pt-4" onsubmit={enviar}>
			<div class="flex flex-wrap gap-2" role="group" aria-label="O que registrar">
				<button
					type="button"
					class="rounded-md border px-3 py-1.5 text-[13px] font-semibold {tipo === 'saldo_atual'
						? 'border-primary bg-primary text-primary-foreground'
						: 'border-border bg-card text-card-foreground hover:bg-muted'}"
					aria-pressed={tipo === 'saldo_atual'}
					onclick={() => escolher('saldo_atual')}
				>
					Informar saldo atual
				</button>
				<button
					type="button"
					class="rounded-md border px-3 py-1.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 {tipo ===
					'recarga'
						? 'border-primary bg-primary text-primary-foreground'
						: 'border-border bg-card text-card-foreground hover:bg-muted'}"
					aria-pressed={tipo === 'recarga'}
					disabled={!configurado}
					title={configurado ? undefined : 'Informe o saldo atual antes de registrar uma recarga.'}
					onclick={() => escolher('recarga')}
				>
					Registrar recarga
				</button>
			</div>
			<p class="text-xs text-muted-foreground">
				{tipo === 'saldo_atual'
					? 'O valor que o painel da Maritaca mostra agora. Substitui a base da estimativa.'
					: 'Crédito comprado depois do último saldo informado. Soma à base da estimativa.'}
			</p>
			<div class="flex flex-wrap items-end gap-3">
				<label class="flex flex-col gap-1 text-xs font-semibold text-card-foreground">
					Valor (R$)
					<input
						class="w-36 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground"
						inputmode="decimal"
						autocomplete="off"
						placeholder="0,00"
						bind:value={valorTxt}
						required
					/>
				</label>
				<label class="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-semibold text-card-foreground">
					Observação (opcional)
					<input
						class="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground"
						maxlength="500"
						placeholder="ex.: conferido no painel às 10h"
						bind:value={observacao}
					/>
				</label>
				<button
					type="submit"
					class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
					disabled={enviando}
				>
					{enviando ? 'Registrando…' : tipo === 'saldo_atual' ? 'Salvar saldo' : 'Salvar recarga'}
				</button>
			</div>
			{#if erro}
				<p class="text-[13px] text-status-danger" role="alert">{erro}</p>
			{:else if registrado}
				<p class="text-[13px] text-status-success" role="status">Registrado.</p>
			{/if}
		</form>
	{/if}
</section>

<style>
	.rotulo {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}
	.link {
		font-weight: 600;
		color: hsl(var(--primary));
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	/* No escuro o --primary não chega a 4,5:1 sobre o card; o lilás --ai passa. */
	:global(.dark) .link {
		color: hsl(var(--ai));
	}
</style>
