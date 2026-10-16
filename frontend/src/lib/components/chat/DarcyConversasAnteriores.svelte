<script lang="ts">
	/**
	 * "Conversas anteriores" da Darcy — ocupa o corpo do ChatPanel no lugar das
	 * mensagens. Lista as conversas arquivadas (por "Nova conversa" ou por horas sem
	 * falar com a Darcy), abre uma para ler, retoma ou apaga. A conversa atual não
	 * aparece aqui: ela é a que está no chat.
	 *
	 * Só leitura ao abrir: chips, cards de turma e botões de uma conversa antiga não
	 * agem (a grade/turmas de então podem nem existir mais) — viram texto.
	 */
	import { onMount } from 'svelte';
	import { ArrowLeft, Trash2, MessageSquareText, RotateCcw } from 'lucide-svelte';
	import ChatBubble from '$lib/components/chat/ChatBubble.svelte';
	import {
		chatService,
		type ConversaAnterior,
		type MensagemHistorico
	} from '$lib/services/chat.service';
	import { darcyStore } from '$lib/stores/darcy.store.svelte';
	import { parseMensagemChat, textoDaBolha } from '$lib/utils/chat-markers';

	let { onFechar }: { onFechar: () => void } = $props();

	let conversas = $state<ConversaAnterior[] | null>(null);
	let erro = $state<string | null>(null);
	let aberta = $state<{ conversa: ConversaAnterior; mensagens: MensagemHistorico[] | null } | null>(
		null
	);
	let ocupado = $state(false);
	let confirmandoApagar = $state<string | null>(null);
	let confirmandoEsquecer = $state(false);

	async function carregar() {
		erro = null;
		try {
			conversas = await chatService.conversas();
		} catch {
			conversas = [];
			erro = 'Não deu para carregar suas conversas agora. Tente de novo em instantes.';
		}
	}

	onMount(() => {
		void carregar();
	});

	async function abrir(conversa: ConversaAnterior) {
		aberta = { conversa, mensagens: null };
		erro = null;
		try {
			const mensagens = await chatService.conversa(conversa.id);
			if (aberta?.conversa.id === conversa.id) aberta = { conversa, mensagens };
		} catch {
			aberta = null;
			erro = 'Não deu para abrir essa conversa. Tente de novo em instantes.';
		}
	}

	async function retomar(conversa: ConversaAnterior) {
		ocupado = true;
		erro = null;
		try {
			await darcyStore.retomarConversa(conversa.id);
			onFechar();
		} catch {
			erro = 'Não deu para continuar essa conversa. Tente de novo em instantes.';
		} finally {
			ocupado = false;
		}
	}

	async function apagar(conversa: ConversaAnterior) {
		ocupado = true;
		erro = null;
		try {
			await chatService.apagarConversa(conversa.id);
			conversas = (conversas ?? []).filter((c) => c.id !== conversa.id);
			if (aberta?.conversa.id === conversa.id) aberta = null;
		} catch {
			erro = 'Não deu para apagar essa conversa. Tente de novo em instantes.';
		} finally {
			ocupado = false;
			confirmandoApagar = null;
		}
	}

	async function esquecerTudo() {
		ocupado = true;
		try {
			await darcyStore.novaConversa({ esquecer: true });
			conversas = [];
			aberta = null;
		} finally {
			ocupado = false;
			confirmandoEsquecer = false;
		}
	}

	const formatoData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
	const formatoHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

	/** "Hoje, 14:20" · "Ontem, 09:05" · "3 de out." */
	function quando(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const hoje = new Date();
		const ontem = new Date(hoje);
		ontem.setDate(hoje.getDate() - 1);
		const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
		if (mesmoDia(d, hoje)) return `Hoje, ${formatoHora.format(d)}`;
		if (mesmoDia(d, ontem)) return `Ontem, ${formatoHora.format(d)}`;
		return formatoData.format(d);
	}

	/** Texto puro de uma mensagem antiga: marcadores viram texto legível. */
	function textoDe(conteudo: string): string {
		return parseMensagemChat(conteudo)
			.map((bloco) => {
				if (bloco.tipo === 'bolha') return textoDaBolha(bloco);
				if (bloco.tipo === 'turma')
					return `Turma ${bloco.turma.turma}${bloco.turma.codigo ? ` · ${bloco.turma.codigo}` : ''}`;
				if (bloco.tipo === 'grade') return `Grade: ${bloco.codigos.join(', ')}`;
				return '';
			})
			.filter((t) => t.trim())
			.join('\n');
	}
</script>

<div class="flex min-h-0 flex-1 flex-col">
	{#if aberta}
		{@const conversa = aberta.conversa}
		<div
			class="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2 dark:border-white/5"
		>
			<button
				type="button"
				onclick={() => (aberta = null)}
				class="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
				aria-label="Voltar para a lista de conversas"
				title="Voltar"
			>
				<ArrowLeft class="h-4 w-4" />
			</button>
			<div class="min-w-0 flex-1">
				<p class="text-foreground truncate text-sm font-semibold">{conversa.titulo}</p>
				<p class="text-muted-foreground text-[11px]">{quando(conversa.fim)}</p>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto p-5">
			{#if aberta.mensagens === null}
				<p class="text-muted-foreground py-8 text-center text-sm">Abrindo conversa…</p>
			{:else}
				{#each aberta.mensagens as msg, i (i)}
					<ChatBubble role={msg.role} name={msg.role === 'user' ? 'Você' : 'Darcy'}>
						<span class="whitespace-pre-wrap">{textoDe(msg.content)}</span>
					</ChatBubble>
				{/each}
			{/if}
		</div>

		<div class="border-border shrink-0 border-t p-4 dark:border-white/5">
			{#if erro}
				<p class="text-destructive mb-2 text-[12px]" role="alert">{erro}</p>
			{/if}
			<button
				type="button"
				onclick={() => retomar(conversa)}
				disabled={ocupado || darcyStore.carregando}
				class="bg-primary text-primary-foreground hover:bg-primary/90 flex min-h-10 w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
			>
				<RotateCcw class="h-4 w-4" />
				Continuar esta conversa
			</button>
			<p class="text-muted-foreground mt-2 text-center text-[11px]">
				A conversa atual fica guardada aqui nas anteriores.
			</p>
		</div>
	{:else}
		<div
			class="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2 dark:border-white/5"
		>
			<button
				type="button"
				onclick={onFechar}
				class="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
				aria-label="Voltar para o chat"
				title="Voltar para o chat"
			>
				<ArrowLeft class="h-4 w-4" />
			</button>
			<p class="text-foreground text-sm font-semibold">Conversas anteriores</p>
		</div>

		<div class="flex-1 overflow-y-auto p-3">
			{#if erro}
				<p class="text-destructive px-2 pb-2 text-[12px]" role="alert">{erro}</p>
			{/if}
			{#if conversas === null}
				<div class="space-y-2" aria-busy="true">
					{#each [0, 1, 2] as i (i)}
						<div class="bg-foreground/5 h-14 animate-pulse rounded-xl"></div>
					{/each}
				</div>
			{:else if conversas.length === 0}
				<div class="flex flex-col items-center px-6 py-10 text-center">
					<MessageSquareText class="text-muted-foreground/60 mb-3 h-8 w-8" />
					<p class="text-foreground text-sm font-medium">Nenhuma conversa anterior</p>
					<p class="text-muted-foreground mt-1 max-w-64 text-[12px]">
						Ao começar uma nova conversa, a atual fica guardada aqui. A Darcy continua lembrando do
						que importa sobre você.
					</p>
					<button
						type="button"
						onclick={onFechar}
						class="border-border text-foreground hover:bg-foreground/10 mt-4 rounded-full border px-4 py-1.5 text-[12px] font-medium transition-colors"
					>
						Voltar para o chat
					</button>
				</div>
			{:else}
				<ul class="space-y-1">
					{#each conversas as conversa (conversa.id)}
						<li
							class="group hover:bg-foreground/5 flex items-center gap-1 rounded-xl transition-colors"
						>
							{#if confirmandoApagar === conversa.id}
								<div class="flex min-h-14 flex-1 flex-wrap items-center gap-2 px-3 py-2">
									<span class="text-foreground mr-auto text-[12px]"
										>Apagar “{conversa.titulo}”?</span
									>
									<button
										type="button"
										onclick={() => apagar(conversa)}
										disabled={ocupado}
										class="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-[12px] font-medium text-red-700 transition-colors hover:bg-red-500/25 disabled:opacity-50 dark:text-red-100"
									>
										Apagar conversa
									</button>
									<button
										type="button"
										onclick={() => (confirmandoApagar = null)}
										class="text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-full px-3 py-1 text-[12px] transition-colors"
									>
										Cancelar
									</button>
								</div>
							{:else}
								<button
									type="button"
									onclick={() => abrir(conversa)}
									class="focus-visible:ring-ring min-h-14 min-w-0 flex-1 rounded-xl px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
								>
									<span class="text-foreground block truncate text-[13px] font-medium"
										>{conversa.titulo}</span
									>
									<span class="text-muted-foreground block text-[11px]">
										{quando(conversa.fim)} · {conversa.mensagens}
										{conversa.mensagens === 1 ? 'mensagem' : 'mensagens'}
									</span>
								</button>
								<button
									type="button"
									onclick={() => (confirmandoApagar = conversa.id)}
									class="text-muted-foreground focus-visible:ring-ring mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full opacity-100 transition-colors hover:bg-red-500/15 hover:text-red-600 focus-visible:ring-2 focus-visible:outline-none sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 dark:hover:text-red-300"
									aria-label="Apagar conversa “{conversa.titulo}”"
									title="Apagar conversa"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="border-border shrink-0 border-t px-4 py-3 text-center dark:border-white/5">
			{#if confirmandoEsquecer}
				<p class="text-foreground mb-2 text-[12px]">
					Apagar a conversa atual, todas as anteriores e o que a Darcy lembra de você?
				</p>
				<div class="flex justify-center gap-2">
					<button
						type="button"
						onclick={esquecerTudo}
						disabled={ocupado || darcyStore.carregando}
						class="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-[12px] font-medium text-red-700 transition-colors hover:bg-red-500/25 disabled:opacity-50 dark:text-red-100"
					>
						Esquecer tudo
					</button>
					<button
						type="button"
						onclick={() => (confirmandoEsquecer = false)}
						class="text-muted-foreground hover:bg-foreground/10 hover:text-foreground rounded-full px-3 py-1 text-[12px] transition-colors"
					>
						Cancelar
					</button>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => (confirmandoEsquecer = true)}
					class="text-muted-foreground text-[12px] underline-offset-2 transition-colors hover:text-red-600 hover:underline dark:hover:text-red-300"
				>
					Esquecer tudo (conversas e memória da Darcy)
				</button>
			{/if}
		</div>
	{/if}
</div>
