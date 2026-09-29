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
	<Dialog.Content class="border-white/10 bg-zinc-950 text-white sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-base text-white">
				<MessageCirclePlus class="h-5 w-5 text-pink-400" />
				<span>Pedir mais perguntas</span>
			</Dialog.Title>
			<Dialog.Description class="text-sm text-white/60">
				O pedido vai para a equipe do NoFluxo como um chamado de suporte. A resposta chega na
				conversa do chamado.
			</Dialog.Description>
		</Dialog.Header>

		{#if ticketCriado !== null}
			<div class="flex flex-col items-center gap-3 py-2 text-center">
				<CheckCircle2 class="h-10 w-10 text-emerald-400" />
				<p class="text-sm text-white/80">Pedido enviado (chamado #{ticketCriado}).</p>
				<a
					href={ROUTES.SUPORTE}
					onclick={fechar}
					class="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/5"
				>
					Acompanhar no Suporte
				</a>
			</div>
		{:else}
			<form class="space-y-4" onsubmit={enviar}>
				<fieldset class="space-y-2">
					<legend class="mb-1 text-xs font-semibold tracking-wide text-white/70 uppercase">
						O que você precisa?
					</legend>
					{#each Object.entries(OPCOES_PEDIDO) as [valor, rotulo] (valor)}
						<label
							class="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors {opcao ===
							valor
								? 'border-indigo-400/60 bg-indigo-500/15 text-white'
								: 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'}"
						>
							<input
								type="radio"
								name="opcao-pedido"
								value={valor}
								bind:group={opcao}
								class="accent-indigo-400"
							/>
							{rotulo}
						</label>
					{/each}
				</fieldset>

				<div class="space-y-1.5">
					<label for="motivo-pedido" class="text-xs font-semibold tracking-wide text-white/70 uppercase">
						Motivo <span class="text-rose-300">*</span>
					</label>
					<textarea
						id="motivo-pedido"
						bind:value={motivo}
						rows="3"
						maxlength="500"
						required
						placeholder="Ex.: estou montando a grade da matrícula e ainda tenho dúvidas sobre optativas."
						class="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
					></textarea>
					{#if motivo.length > 0 && !motivoValido}
						<p class="text-[11px] text-white/50">Conte um pouco mais (mínimo {MIN_MOTIVO} caracteres).</p>
					{/if}
				</div>

				{#if darcyCotaStore.cota}
					<p class="text-[11px] text-white/45">
						Vai junto no pedido: {darcyCotaStore.cota.usadas} de {darcyCotaStore.cota.limite} perguntas
						usadas hoje.
					</p>
				{/if}

				{#if erro}
					<p class="text-xs text-rose-300" role="alert">{erro}</p>
				{/if}

				<Dialog.Footer>
					<button
						type="button"
						onclick={fechar}
						class="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5"
					>
						Cancelar
					</button>
					<button
						type="submit"
						disabled={!motivoValido || enviando}
						class="inline-flex items-center gap-2 rounded-full bg-pink-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-pink-400 disabled:opacity-40"
					>
						{#if enviando}<Loader2 class="h-3.5 w-3.5 animate-spin" />{/if}
						Enviar pedido
					</button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
