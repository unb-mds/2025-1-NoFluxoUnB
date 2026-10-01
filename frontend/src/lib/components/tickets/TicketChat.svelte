<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { ticketService } from '$lib/services/ticket.service';
	import {
		isTerminalStatus,
		MAX_MESSAGE_LENGTH,
		type TicketMessage,
		type TicketStatus
	} from '$lib/types/ticket';
	import { toast } from '$lib/utils/toast';
	import { CheckCircle2, History, Loader2, Send } from 'lucide-svelte';

	interface Props {
		ticketId: number;
		ticketStatus: TicketStatus;
		/** 'admin' = página de admin (eu sou o suporte); 'user' = página de suporte (eu sou o dono). */
		perspective: 'admin' | 'user';
		/** Nome do outro lado da conversa, quando a página já o conhece. */
		counterpartName?: string | null;
		/**
		 * Chamado após uma tentativa de envio — sucesso OU falha — porque as duas
		 * podem revelar mudança de status do ticket no servidor.
		 */
		onMessageSent?: () => void;
	}

	let { ticketId, ticketStatus, perspective, counterpartName = null, onMessageSent }: Props =
		$props();

	const PAGE_SIZE = 30;
	const POLL_INTERVAL_MS = 20_000;
	const NEAR_BOTTOM_PX = 120;
	const COUNTER_THRESHOLD = 1800;
	// composer cresce com o texto até ~6 parágrafos; depois rola internamente
	const COMPOSER_MAX_PX = 200;

	let messages = $state<TicketMessage[]>([]);
	let loading = $state(true);
	let loadingOlder = $state(false);
	let sending = $state(false);
	let hasMore = $state(false);
	let meuAuthId = $state<string | null>(null);
	let draft = $state('');

	let scrollEl = $state<HTMLDivElement>();
	let textareaEl = $state<HTMLTextAreaElement>();

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let fetchingNewer = false;
	// notificação chegou com fetch em voo — re-busca no finally pra não perder mensagem
	let refetchPendente = false;
	// ids temporários negativos pra bolha otimista (nunca colidem com ids reais do banco)
	let tempIdSeq = -1;

	const encerrado = $derived(isTerminalStatus(ticketStatus));
	const draftLength = $derived(draft.length);
	const podeEnviar = $derived(!sending && draft.trim().length > 0);

	// Carrega o histórico e assina o realtime sempre que o ticket muda.
	// O cleanup remove o canal e o polling — nada vaza ao trocar de ticket ou desmontar.
	$effect(() => {
		const id = ticketId;
		let vivo = true;

		untrack(() => {
			messages = [];
			loading = true;
			hasMore = false;
			draft = '';
			sending = false;
			loadingOlder = false;
		});

		void (async () => {
			try {
				const [authId, iniciais] = await Promise.all([
					ticketService.getAuthUserId(),
					ticketService.listMessages(id, { limit: PAGE_SIZE })
				]);
				if (!vivo) return;
				meuAuthId = authId;
				// merge em vez de substituir: preserva bolha otimista de envio feito durante o
				// load e mensagens que o realtime já anexou (tudo isso é mais novo que o snapshot)
				const idsIniciais = new Set(iniciais.map((m) => m.id));
				messages = [...iniciais, ...messages.filter((m) => !idsIniciais.has(m.id))]; // ASC
				hasMore = iniciais.length === PAGE_SIZE;
				loading = false;
				// o usuário está vendo a conversa — zera o contador de não lidas
				void ticketService.markTicketRead(id).catch(() => {});
				await tick();
				scrollToBottom();
			} catch (e) {
				if (!vivo) return;
				loading = false;
				toast.error(e instanceof Error ? e.message : 'Erro ao carregar as mensagens.');
			}
		})();

		const unsubscribe = ticketService.subscribeToMessages(
			id,
			() => {
				if (vivo) void buscarNovas(id);
			},
			(subscribed) => {
				if (!vivo) return;
				if (subscribed) {
					pararPolling();
				} else {
					// canal caiu — polling de fallback até o realtime voltar
					iniciarPolling(id);
				}
			}
		);

		return () => {
			vivo = false;
			unsubscribe();
			pararPolling();
		};
	});

	function iniciarPolling(id: number) {
		pararPolling();
		pollTimer = setInterval(() => void buscarNovas(id), POLL_INTERVAL_MS);
	}

	function pararPolling() {
		if (pollTimer !== null) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	/** Maior id real (positivo) já conhecido — ignora bolhas otimistas. */
	function ultimoIdConhecido(): number | null {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].id > 0) return messages[i].id;
		}
		return null;
	}

	/** Busca incremental (realtime/polling) com dedupe — o eco da própria mensagem pode chegar pelo canal. */
	async function buscarNovas(id: number) {
		if (fetchingNewer) {
			// não descarta a notificação: o fetch em voo pode não enxergar essa mensagem
			refetchPendente = true;
			return;
		}
		fetchingNewer = true;
		try {
			const afterId = ultimoIdConhecido();
			const novas = await ticketService.listMessages(
				id,
				afterId !== null ? { afterId } : { limit: PAGE_SIZE }
			);
			if (id !== ticketId) return; // trocou de ticket no meio da busca
			await appendComDedupe(novas);
			// mensagem nova chegou com a conversa aberta — já conta como lida
			if (novas.length > 0) void ticketService.markTicketRead(id).catch(() => {});
		} catch {
			// silencioso — a próxima notificação/poll tenta de novo
		} finally {
			fetchingNewer = false;
			if (refetchPendente) {
				refetchPendente = false;
				if (id === ticketId) void buscarNovas(id);
			}
		}
	}

	async function appendComDedupe(novas: TicketMessage[]) {
		const existentes = new Set(messages.map((m) => m.id));
		const frescas = novas.filter((m) => !existentes.has(m.id));
		if (frescas.length === 0) return;
		const seguirParaOFim = estaPertoDoFim();
		messages = [...messages, ...frescas];
		if (seguirParaOFim) {
			await tick();
			scrollToBottom();
		}
	}

	async function carregarAnteriores() {
		if (loadingOlder || !hasMore) return;
		const primeira = messages.find((m) => m.id > 0);
		if (!primeira) return;
		loadingOlder = true;
		const alturaAntes = scrollEl?.scrollHeight ?? 0;
		try {
			const antigas = await ticketService.listMessages(ticketId, {
				beforeId: primeira.id,
				limit: PAGE_SIZE
			});
			hasMore = antigas.length === PAGE_SIZE;
			const existentes = new Set(messages.map((m) => m.id));
			messages = [...antigas.filter((m) => !existentes.has(m.id)), ...messages];
			// preserva a posição aproximada de leitura após o prepend
			await tick();
			if (scrollEl) scrollEl.scrollTop += scrollEl.scrollHeight - alturaAntes;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Erro ao carregar mensagens anteriores.');
		} finally {
			loadingOlder = false;
		}
	}

	async function enviar() {
		const conteudo = draft.trim();
		if (sending || encerrado) return;
		if (conteudo.length === 0 || conteudo.length > MAX_MESSAGE_LENGTH) return;

		const rascunhoOriginal = draft;
		// bolha otimista: aparece na hora, é trocada pela mensagem real quando a RPC responder
		const temp: TicketMessage = {
			id: tempIdSeq--,
			ticket_id: ticketId,
			author_id: meuAuthId ?? '',
			author_role: perspective === 'admin' ? 'tech' : 'user',
			content: conteudo,
			created_at: new Date().toISOString(),
			author_name: null
		};

		sending = true;
		draft = '';
		messages = [...messages, temp];
		await tick();
		scrollToBottom();

		try {
			const real = await ticketService.sendMessage(ticketId, conteudo);
			// dedupe: o eco do realtime pode ter chegado antes da resposta da RPC
			const semEco = messages.filter((m) => m.id !== real.id);
			messages = semEco.map((m) => (m.id === temp.id ? real : m));
			onMessageSent?.();
		} catch (e) {
			messages = messages.filter((m) => m.id !== temp.id);
			draft = rascunhoOriginal;
			// as RPCs já devolvem mensagens amigáveis em pt-BR
			toast.error(e instanceof Error ? e.message : 'Erro ao enviar mensagem.');
			// a falha pode revelar mudança de status no servidor (ex.: chamado resolvido
			// com o chat aberto) — a página re-busca o ticket e a UI converge
			onMessageSent?.();
		} finally {
			sending = false;
			await tick();
			// draft mudou (limpo no sucesso, restaurado no erro) — realinha a altura
			ajustarAlturaComposer();
			textareaEl?.focus();
		}
	}

	/** Auto-grow do composer: acompanha o conteúdo até COMPOSER_MAX_PX. */
	function ajustarAlturaComposer() {
		if (!textareaEl) return;
		textareaEl.style.height = 'auto';
		textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, COMPOSER_MAX_PX)}px`;
	}

	function onKeydown(e: KeyboardEvent) {
		// Enter confirmando composição de IME (japonês/chinês/coreano) não envia
		if (e.isComposing || e.keyCode === 229) return;
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void enviar();
		}
	}

	function estaPertoDoFim(): boolean {
		if (!scrollEl) return true;
		return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < NEAR_BOTTOM_PX;
	}

	function scrollToBottom() {
		if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
	}

	function ehMinha(m: TicketMessage): boolean {
		if (meuAuthId) return m.author_id === meuAuthId;
		// fallback sem auth id: admin ↔ tech, user ↔ user
		return perspective === 'admin' ? m.author_role === 'tech' : m.author_role === 'user';
	}

	function nomeDe(m: TicketMessage): string {
		if (ehMinha(m)) return 'Você';
		return m.author_name ?? counterpartName ?? (perspective === 'user' ? 'Suporte' : 'Usuário');
	}

	function formatarHora(value: string): string {
		try {
			return new Date(value).toLocaleString('pt-BR', {
				day: '2-digit',
				month: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return value;
		}
	}
</script>

<div class="chat">
	<div class="mensagens" bind:this={scrollEl} role="log" aria-live="polite" aria-label="Mensagens do chamado">
		{#if loading}
			<div class="estado-vazio">
				<Loader2 class="h-5 w-5 animate-spin" />
				<span>Carregando conversa…</span>
			</div>
		{:else}
			{#if hasMore}
				<button
					type="button"
					class="carregar-anteriores"
					onclick={() => void carregarAnteriores()}
					disabled={loadingOlder}
				>
					{#if loadingOlder}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
						<span>Carregando…</span>
					{:else}
						<History class="h-3.5 w-3.5" />
						<span>Carregar mensagens anteriores</span>
					{/if}
				</button>
			{/if}

			{#if messages.length === 0}
				<div class="estado-vazio">
					<span>
						{perspective === 'user'
							? 'Envie uma mensagem para o time de suporte.'
							: 'Nenhuma mensagem ainda. Responda o usuário por aqui.'}
					</span>
				</div>
			{:else}
				{#each messages as m (m.id)}
					{@const minha = ehMinha(m)}
					<div class="linha" class:minha>
						<div class="balao" class:minha class:enviando={m.id < 0}>
							<div class="balao-meta">
								<span class="autor">{nomeDe(m)}</span>
								{#if m.author_role === 'tech' && perspective === 'user'}
									<span class="chip-suporte">suporte</span>
								{/if}
								<span class="hora">
									{#if m.id < 0}
										enviando…
									{:else}
										{formatarHora(m.created_at)}
									{/if}
								</span>
							</div>
							<p class="conteudo">{m.content}</p>
						</div>
					</div>
				{/each}
			{/if}
		{/if}
	</div>

	{#if encerrado}
		<div class="aviso-encerrado">
			<CheckCircle2 class="h-4 w-4 shrink-0" />
			<span>Este chamado foi resolvido — a conversa está encerrada.</span>
		</div>
	{:else}
		<form
			class="composer"
			onsubmit={(e) => {
				e.preventDefault();
				void enviar();
			}}
		>
			<textarea
				bind:this={textareaEl}
				bind:value={draft}
				class="textarea"
				rows={2}
				maxlength={MAX_MESSAGE_LENGTH}
				placeholder="Escreva sua mensagem… (Enter envia, Shift+Enter quebra linha)"
				aria-label="Escrever mensagem"
				disabled={sending}
				onkeydown={onKeydown}
				oninput={ajustarAlturaComposer}
			></textarea>
			<div class="composer-rodape">
				{#if draftLength >= COUNTER_THRESHOLD}
					<span class="contador" class:estourado={draftLength >= MAX_MESSAGE_LENGTH}>
						{draftLength}/{MAX_MESSAGE_LENGTH}
					</span>
				{/if}
				<button type="submit" class="enviar-btn" aria-label="Enviar mensagem" disabled={!podeEnviar}>
					{#if sending}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Send class="h-4 w-4" />
					{/if}
					<span>Enviar</span>
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	/* Light = padrão (tokens). O bloco :global(.dark) no fim restaura, verbatim, os valores históricos do tema escuro. */
	.chat {
		display: flex;
		flex-direction: column;
		gap: 12px;
		background: hsl(var(--card));
		backdrop-filter: blur(10px);
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		padding: 14px;
	}

	.mensagens {
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow-y: auto;
		/* palavra gigante sem espaço não pode alargar o chat/dialog */
		overflow-x: hidden;
		/* em telas baixas o chat encolhe pra caber com header + composer no viewport */
		max-height: min(420px, 45dvh);
		min-height: 160px;
		padding: 4px 6px 4px 2px;
		scrollbar-width: thin;
	}

	.estado-vazio {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 140px;
		color: hsl(var(--muted-foreground));
		font-size: 13px;
		text-align: center;
	}

	.carregar-anteriores {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		align-self: center;
		padding: 5px 12px;
		border-radius: 999px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--muted-foreground));
		font-size: 12px;
		cursor: pointer;
		transition: color 150ms, background 150ms;
	}
	.carregar-anteriores:hover:not(:disabled) {
		background: hsl(var(--muted) / 0.7);
		color: hsl(var(--foreground));
	}
	.carregar-anteriores:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.linha {
		display: flex;
		justify-content: flex-start;
	}
	.linha.minha {
		justify-content: flex-end;
	}

	.balao {
		max-width: 85%;
		/* flex item encolhe abaixo do min-content — sem isso, palavra sem espaço estoura o layout */
		min-width: 0;
		padding: 8px 12px;
		border-radius: 14px;
		border-top-left-radius: 4px;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		transition: opacity 150ms;
	}
	.balao.minha {
		border-radius: 14px;
		border-top-right-radius: 4px;
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.35);
	}
	.balao.enviando {
		opacity: 0.55;
	}

	.balao-meta {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 3px;
	}
	.autor {
		font-size: 11px;
		font-weight: 600;
		color: hsl(var(--foreground) / 0.75);
	}
	.chip-suporte {
		display: inline-flex;
		padding: 1px 6px;
		border-radius: 4px;
		border: 1px solid hsl(var(--primary) / 0.4);
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
		font-size: 9px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.hora {
		font-size: 10px;
		color: hsl(var(--muted-foreground));
	}

	.conteudo {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.55;
		color: hsl(var(--foreground) / 0.9);
		white-space: pre-wrap;
		/* 'anywhere' (≠ break-word) reduz a largura mínima intrínseca e quebra palavra gigante */
		overflow-wrap: anywhere;
	}

	.aviso-encerrado {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 8px;
		font-size: 13px;
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.3);
		/* emerald-800: 7,3:1 sobre o card; .dark volta ao #6ee7b7 */
		color: #065f46;
	}

	.composer {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.textarea {
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		color: hsl(var(--foreground));
		padding: 10px 12px;
		font-size: 14px;
		font-family: inherit;
		transition: border-color 150ms;
		width: 100%;
		/* altura controlada pelo auto-grow (ajustarAlturaComposer) */
		resize: none;
		overflow-y: auto;
		min-height: 56px;
		max-height: 200px;
	}
	.textarea::placeholder {
		color: hsl(var(--muted-foreground));
	}
	.textarea:focus {
		outline: none;
		border-color: hsl(var(--ring));
	}
	.textarea:disabled {
		opacity: 0.7;
	}

	.composer-rodape {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
	}
	.contador {
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.contador.estourado {
		color: hsl(var(--destructive));
	}

	.enviar-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 9px 16px;
		border-radius: 8px;
		border: none;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		transition: transform 120ms, opacity 150ms;
	}
	.enviar-btn:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.enviar-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	/* Dark: receita histórica, sem alteração de aparência */
	:global(.dark) .balao.minha {
		background: rgba(147, 51, 234, 0.18);
		border-color: rgba(147, 51, 234, 0.4);
	}
	:global(.dark) .chip-suporte {
		border-color: rgba(147, 51, 234, 0.4);
		background: rgba(147, 51, 234, 0.2);
		color: #e9d5ff;
	}
	:global(.dark) .aviso-encerrado {
		color: #6ee7b7;
	}
	:global(.dark) .textarea:focus {
		border-color: #9333ea;
	}
	:global(.dark) .contador.estourado {
		color: #fca5a5;
	}
	:global(.dark) .enviar-btn {
		background: linear-gradient(90deg, #9333ea, #ec4899);
		color: white;
	}
</style>
