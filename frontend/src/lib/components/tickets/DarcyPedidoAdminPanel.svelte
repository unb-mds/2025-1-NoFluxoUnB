<script lang="ts">
	import { Bot, Check, Loader2, X } from 'lucide-svelte';
	import { ticketService } from '$lib/services/ticket.service';
	import { OPCOES_PEDIDO, type OpcaoPedido } from '$lib/utils/darcy-cota';
	import type { Ticket } from '$lib/types/ticket';

	/**
	 * Ações do admin num chamado "Mais perguntas no Darcy" (metadata.tipo =
	 * 'darcy_mais_perguntas'). Aprovar cria a concessão vinculada ao ticket, com
	 * aprovado_por = admin logado (RPC darcy_aprovar_pedido, exige is_ticket_admin);
	 * recusar exige o motivo. Nos dois casos a resposta vai para a conversa do
	 * próprio ticket e ele é resolvido.
	 */
	let { ticket, onConcluido }: { ticket: Ticket; onConcluido: () => void | Promise<void> } =
		$props();

	const QTD_PADRAO: Record<OpcaoPedido, number> = { hoje: 30, semana: 30, limite: 60 };
	const AJUDA: Record<OpcaoPedido, string> = {
		hoje: 'perguntas extras só hoje',
		semana: 'perguntas extras por dia, de hoje até daqui a 6 dias',
		limite: 'novo limite diário, sem data de fim'
	};

	const meta = $derived(ticket.metadata as Record<string, unknown>);
	const pedida = $derived(
		(typeof meta.opcao === 'string' && meta.opcao in OPCOES_PEDIDO ? meta.opcao : 'hoje') as OpcaoPedido
	);

	let opcao = $state<OpcaoPedido>('hoje');
	let quantidade = $state(30);
	let resposta = $state('');
	let enviando = $state<'aprovar' | 'recusar' | null>(null);
	let erro = $state<string | null>(null);

	// Troca de ticket: volta para o que o aluno pediu.
	let ticketAtual = -1;
	$effect(() => {
		if (ticket.id !== ticketAtual) {
			ticketAtual = ticket.id;
			opcao = pedida;
			quantidade = QTD_PADRAO[pedida];
			resposta = '';
			erro = null;
		}
	});

	const resolvido = $derived(ticket.status === 'resolvido');

	async function aprovar() {
		enviando = 'aprovar';
		erro = null;
		try {
			await ticketService.aprovarPedidoDarcy(ticket.id, opcao, quantidade, resposta);
			await onConcluido();
		} catch (e) {
			erro = e instanceof Error ? e.message : 'Erro ao aprovar.';
		} finally {
			enviando = null;
		}
	}

	async function recusar() {
		if (!resposta.trim()) {
			erro = 'Escreva para o aluno o motivo da recusa.';
			return;
		}
		enviando = 'recusar';
		erro = null;
		try {
			await ticketService.recusarPedidoDarcy(ticket.id, resposta.trim());
			await onConcluido();
		} catch (e) {
			erro = e instanceof Error ? e.message : 'Erro ao recusar.';
		} finally {
			enviando = null;
		}
	}
</script>

<section class="darcy-pedido">
	<h3 class="section-title flex items-center gap-1.5"><Bot class="h-3.5 w-3.5" /> Pedido de mais perguntas no Darcy</h3>

	<dl class="resumo">
		<div><dt>Pediu</dt><dd>{OPCOES_PEDIDO[pedida]}</dd></div>
		<div>
			<dt>Uso no dia do pedido</dt>
			<dd>{meta.usadas ?? '—'} de {meta.limite ?? '—'}</dd>
		</div>
		{#if typeof meta.motivo === 'string'}
			<div class="motivo"><dt>Motivo</dt><dd>{meta.motivo}</dd></div>
		{/if}
	</dl>

	{#if resolvido}
		<p class="nota">Chamado resolvido — a decisão está na conversa abaixo.</p>
	{:else}
		<div class="form">
			<label class="campo">
				<span>Conceder</span>
				<select bind:value={opcao} class="input" disabled={enviando !== null}>
					{#each Object.entries(OPCOES_PEDIDO) as [valor, rotulo] (valor)}
						<option value={valor}>{rotulo}</option>
					{/each}
				</select>
			</label>
			<label class="campo campo-qtd">
				<span>Quantidade</span>
				<input type="number" min="1" max="1000" bind:value={quantidade} class="input" disabled={enviando !== null} />
			</label>
			<p class="ajuda">{quantidade} {AJUDA[opcao]}.</p>
			<label class="campo campo-full">
				<span>Resposta ao aluno (obrigatória para recusar)</span>
				<input
					type="text"
					class="input"
					maxlength="2000"
					placeholder="Em branco na aprovação: mensagem padrão com o que foi concedido."
					bind:value={resposta}
					disabled={enviando !== null}
				/>
			</label>
		</div>

		{#if erro}
			<p class="erro" role="alert">{erro}</p>
		{/if}

		<div class="acoes">
			<button type="button" class="btn-aprovar" disabled={enviando !== null || quantidade < 1} onclick={aprovar}>
				{#if enviando === 'aprovar'}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Check class="h-3.5 w-3.5" />{/if}
				Aprovar
			</button>
			<button type="button" class="btn-recusar" disabled={enviando !== null} onclick={recusar}>
				{#if enviando === 'recusar'}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<X class="h-3.5 w-3.5" />{/if}
				Recusar
			</button>
		</div>
	{/if}
</section>

<style>
	/* Mesma linguagem visual do painel de tickets (escuro, brancos com alfa). */
	.darcy-pedido {
		border: 1px solid rgba(236, 72, 153, 0.35);
		background: rgba(236, 72, 153, 0.06);
		border-radius: 10px;
		padding: 14px;
		color: rgba(255, 255, 255, 0.85);
	}
	.section-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(255, 255, 255, 0.5);
		margin: 0 0 8px;
		font-weight: 700;
	}
	.resumo {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.5rem 1rem;
		font-size: 0.8rem;
		margin-bottom: 0.75rem;
	}
	.resumo dt {
		opacity: 0.6;
		font-size: 0.7rem;
	}
	.resumo .motivo {
		grid-column: 1 / -1;
	}
	.resumo dd {
		white-space: pre-wrap;
	}
	.form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
		align-items: flex-end;
	}
	.campo {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.7rem;
		opacity: 0.95;
	}
	.campo-qtd {
		width: 6.5rem;
	}
	.campo-full {
		flex-basis: 100%;
	}
	.input {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		color: white;
		padding: 7px 10px;
		font-size: 13px;
		width: 100%;
	}
	select.input option {
		background: #18181b;
		color: white;
	}
	.ajuda {
		font-size: 0.7rem;
		opacity: 0.6;
		flex: 1;
		min-width: 12rem;
		padding-bottom: 0.45rem;
	}
	.nota {
		font-size: 0.75rem;
		opacity: 0.7;
	}
	.erro {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: #fda4af;
	}
	.acoes {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.btn-aprovar,
	.btn-recusar {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border-radius: 9999px;
		padding: 0.4rem 0.9rem;
		font-size: 0.75rem;
		font-weight: 600;
		border: 1px solid transparent;
		transition: background-color 0.15s;
	}
	.btn-aprovar {
		background: rgb(16 185 129 / 0.25);
		border-color: rgb(16 185 129 / 0.45);
	}
	.btn-aprovar:hover:not(:disabled) {
		background: rgb(16 185 129 / 0.4);
	}
	.btn-recusar {
		background: rgb(244 63 94 / 0.15);
		border-color: rgb(244 63 94 / 0.4);
	}
	.btn-recusar:hover:not(:disabled) {
		background: rgb(244 63 94 / 0.3);
	}
	button:disabled {
		opacity: 0.5;
	}
</style>
