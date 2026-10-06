<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { CheckCircle2, Loader2, MessageCirclePlus } from 'lucide-svelte';
	import { ROUTES } from '$lib/config/routes';
	import { ticketService } from '$lib/services/ticket.service';
	import { darcyCotaStore } from '$lib/stores/darcy-cota.store.svelte';
	import {
		montarPedidoMaisPerguntas,
		OPCOES_PEDIDO,
		type OpcaoPedido
	} from '$lib/utils/darcy-cota';

	/**
	 * Pedido de mais perguntas no Darcy. Não é um sistema à parte: cria um ticket
	 * no suporte existente ("Mais perguntas no Darcy", metadata.tipo =
	 * 'darcy_mais_perguntas', com usadas/limite no corpo). O admin aprova ou
	 * recusa no painel de tickets e responde na conversa do próprio ticket.
	 */
	const MIN_MOTIVO = 10;

	let motivo = $state('');
	let opcao = $state<OpcaoPedido>('hoje');
	let enviando = $state(false);
	let erro = $state<string | null>(null);
	let ticketCriado = $state<number | null>(null);

	const motivoValido = $derived(motivo.trim().length >= MIN_MOTIVO);

	function fechar() {
		darcyCotaStore.fecharPedido();
		// Limpa depois da animação de saída.
		setTimeout(() => {
			motivo = '';
			opcao = 'hoje';
			erro = null;
			ticketCriado = null;
		}, 200);
	}

	async function enviar(e: SubmitEvent) {
		e.preventDefault();
		if (!motivoValido || enviando) return;
		enviando = true;
		erro = null;
		try {
			const pedido = montarPedidoMaisPerguntas(motivo, opcao, darcyCotaStore.cota);
			const ticket = await ticketService.createTicket({
				title: pedido.title,
				description: pedido.description,
				category: 'duvida',
				metadata: pedido.metadata
			});
			ticketCriado = ticket.id;
		} catch (err) {
			erro = err instanceof Error ? err.message : 'Não foi possível enviar o pedido.';
		} finally {
			enviando = false;
		}
	}
</script>

<Dialog.Root
	open={darcyCotaStore.pedidoAberto}
	onOpenChange={(v) => {
		if (!v) fechar();
	}}
>
	<Dialog.Content class="text-foreground sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-base text-foreground">
				<MessageCirclePlus class="h-5 w-5 text-primary" />
				<span>Pedir mais perguntas</span>
			</Dialog.Title>
			<Dialog.Description class="text-sm text-muted-foreground">
				O pedido vai para a equipe do NoFluxo como um chamado de suporte. A resposta chega na
				conversa do chamado.
			</Dialog.Description>
		</Dialog.Header>

		{#if ticketCriado !== null}
			<div class="flex flex-col items-center gap-3 py-2 text-center">
				<CheckCircle2 class="h-10 w-10 text-status-success" />
				<p class="text-sm text-foreground">Pedido enviado (chamado #{ticketCriado}).</p>
				<a
					href={ROUTES.SUPORTE}
					onclick={fechar}
					class="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
				>
					Acompanhar no Suporte
				</a>
			</div>
		{:else}
			<form class="space-y-4" onsubmit={enviar}>
				<fieldset class="space-y-2">
					<legend class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						O que você precisa?
					</legend>
					{#each Object.entries(OPCOES_PEDIDO) as [valor, rotulo] (valor)}
						<label
							class="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors {opcao ===
							valor
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-border text-foreground hover:bg-muted'}"
						>
							<input
								type="radio"
								name="opcao-pedido"
								value={valor}
								bind:group={opcao}
								class="border-muted-foreground bg-background text-primary accent-primary focus:ring-ring"
							/>
							{rotulo}
						</label>
					{/each}
				</fieldset>

				<div class="space-y-1.5">
					<label for="motivo-pedido" class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Motivo <span class="text-status-danger">*</span>
					</label>
					<textarea
						id="motivo-pedido"
						bind:value={motivo}
						rows="3"
						maxlength="500"
						required
						placeholder="Ex.: estou montando a grade da matrícula e ainda tenho dúvidas sobre optativas."
						class="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
					></textarea>
					{#if motivo.length > 0 && !motivoValido}
						<p class="text-[11px] text-muted-foreground">Conte um pouco mais (mínimo {MIN_MOTIVO} caracteres).</p>
					{/if}
				</div>

				{#if darcyCotaStore.cota}
					<p class="text-[11px] text-muted-foreground">
						Vai junto no pedido: {darcyCotaStore.cota.usadas} de {darcyCotaStore.cota.limite} perguntas
						usadas hoje.
					</p>
				{/if}

				{#if erro}
					<p class="text-xs text-status-danger" role="alert">{erro}</p>
				{/if}

				<Dialog.Footer>
					<button
						type="button"
						onclick={fechar}
						class="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
					>
						Cancelar
					</button>
					<button
						type="submit"
						disabled={!motivoValido || enviando}
						class="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
					>
						{#if enviando}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
						Enviar pedido
					</button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
