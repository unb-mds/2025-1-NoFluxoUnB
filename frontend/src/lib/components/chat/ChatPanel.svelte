<script lang="ts">
	import { untrack } from 'svelte';
	import {
		Sparkles,
		SendHorizontal,
		Bot,
		CalendarPlus,
		MessageSquarePlus,
		MessageCircleQuestion,
		CalendarSearch,
		Plus,
		ArrowUpRight
	} from 'lucide-svelte';
	import { formatHorarioSigaa, compactarFaixasHorarias, formatLocalSigaa } from '$lib/utils/sigaa';
	import ChatWrapper from '$lib/components/chat/ChatWrapper.svelte';
	import ChatBubble from '$lib/components/chat/ChatBubble.svelte';
	import ChatLoader from '$lib/components/chat/ChatLoader.svelte';
	import MarqueeText from '$lib/components/ui/MarqueeText.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import {
		parseMensagemChat,
		fatiaSegura,
		indiceRespostaViva,
		mensagemPerguntarSobre
	} from '$lib/utils/chat-markers';
	import { acoesForaDoMontador, type AcoesChat } from '$lib/utils/chat-acoes';
	import type { Snippet } from 'svelte';
	import type { OpcaoGradeChat } from '$lib/types/plano-formatura';

	interface Starter {
		prefix: string;
		badge?: string;
		suffix?: string;
		message: string;
		/**
		 * Quando true, o clique só preenche o campo de mensagem (e foca nele) em vez
		 * de enviar direto — usado nos starters cujo badge representa uma variável
		 * que o usuário precisa completar (ex: "sobre um tema", "de uma matéria"),
		 * pra não mandar o exemplo fixo do `message` como se fosse a escolha dele.
		 */
		populateOnly?: boolean;
	}
	interface ChatMsg {
		role: 'user' | 'assistant';
		content: string;
		/** Ver `PlannerChatMessage.opcaoGrade` — só usado pelo botão "Montar grade". */
		opcaoGrade?: OpcaoGradeChat;
	}

	let {
		messages,
		loading = false,
		promptStarters = [],
		title = 'Darcy AI',
		assistantName = 'Darcy AI',
		placeholder = 'Pergunte alguma coisa...',
		draggable = false,
		acoes,
		onSend,
		nomesMaterias,
		emptyState,
		prefillText,
		prefillNonce,
		onNovaConversa
	}: {
		messages: ChatMsg[];
		loading?: boolean;
		promptStarters?: Starter[];
		title?: string;
		assistantName?: string;
		placeholder?: string;
		draggable?: boolean;
		/**
		 * O que chips de matéria, cards de turma e o bloco de grade fazem nesta tela
		 * (`$lib/utils/chat-acoes`). Sem a prop, vale o comportamento de fora do
		 * Montador: "Ver turmas" no chip e "Abrir no Montador" na grade.
		 */
		acoes?: AcoesChat;
		onSend: (msg: string) => void;
		/**
		 * Mapa código→nome extra (ex.: optativas do plano fora da matriz). A matriz
		 * do curso (`fluxogramaStore`) já entra sozinha.
		 */
		nomesMaterias?: Map<string, string>;
		emptyState?: Snippet;
		/**
		 * Texto pra preencher o campo de mensagem sem enviar — usado por quem abre o
		 * chat de fora (ex.: botão "Pedir pra Darcy" numa matéria) já com um começo de
		 * frase. Só some efeito quando `prefillNonce` muda, pra dar pra pedir o mesmo
		 * texto duas vezes seguidas.
		 */
		prefillText?: string;
		prefillNonce?: number;
		/**
		 * Quando definido, o cabeçalho ganha "Nova conversa" (com confirmação inline):
		 * a conversa é uma só entre as telas, então apagar vale pra todas.
		 */
		onNovaConversa?: () => void;
	} = $props();

	let confirmandoNovaConversa = $state(false);

	const acoesEfetivas = $derived<AcoesChat>(acoes ?? acoesForaDoMontador());

	/** Matriz do curso + o mapa extra da tela: chip mostra nome em toda tela. */
	const nomes = $derived.by(() => {
		const mapa = new Map<string, string>();
		for (const m of fluxogramaStore.state.courseData?.materias ?? []) {
			if (m.codigoMateria && m.nomeMateria) {
				mapa.set(m.codigoMateria.trim().toUpperCase(), m.nomeMateria);
			}
		}
		for (const [c, n] of nomesMaterias ?? []) mapa.set(c.trim().toUpperCase(), n);
		return mapa;
	});

	/** "INTRODUÇÃO A COMPUTAÇÃO GRÁFICA" → "Introdução A Computação Gráfica". */
	function nomeBonito(nome: string): string {
		return nome.toLowerCase().replace(/(^|[\s(])\p{L}/gu, (c) => c.toUpperCase());
	}

	function nomeDe(codigo: string): string | undefined {
		const n = nomes.get(codigo);
		return n ? nomeBonito(n) : undefined;
	}

	/** Só a última resposta (sem nada depois, sem carregando) tem ações vivas. */
	const respostaViva = $derived(indiceRespostaViva(messages, loading));

	/** Grade do bloco: `opcaoGrade` da mensagem manda; senão, os pares do marcador. */
	function opcaoDoBloco(
		msg: ChatMsg,
		selecao: Array<{ codigo: string; idTurma: number }>
	): OpcaoGradeChat | undefined {
		if (msg.opcaoGrade) return msg.opcaoGrade;
		return selecao.length > 0 ? { estrategia: 'Darcy', selecao } : undefined;
	}

	function rotuloGrade(pronta: boolean, codigos: string[]): string {
		if (acoesEfetivas.grade.modo === 'abrir') return 'Abrir no Montador';
		if (pronta) return 'Aplicar esta grade';
		const lista = codigos.map((c) => nomeDe(c) ?? c);
		return `Montar grade com ${lista.join(', ')}`;
	}

	let messageInput = $state('');
	let inputRef: HTMLInputElement;
	let chatViewport = $state<HTMLElement | null>(null);

	// Pré-preenchimento vindo de fora (ex.: "Pedir pra Darcy" numa matéria): só reage
	// à mudança do nonce, não do texto — permite pedir o mesmo texto de novo.
	$effect(() => {
		if (!prefillNonce) return;
		messageInput = prefillText ?? '';
		inputRef?.focus();
	});

	// ─── Animação de digitação da resposta ────────────────────────────────────
	// A última resposta do assistente é revelada progressivamente (estilo
	// Claude/GPT). Mensagens que já estavam no histórico ao montar não animam.
	const contagemInicial = untrack(() => messages.length);
	let typingMsg = $state<ChatMsg | null>(null);
	let typingShown = $state(0);
	// Controle NÃO-reativo de qual mensagem está animando — se o efeito lesse
	// typingMsg, mudá-lo dentro dele dispararia re-execução e mataria o timer.
	let animando: ChatMsg | null = null;

	$effect(() => {
		const ultima = messages[messages.length - 1];
		if (!ultima || ultima.role !== 'assistant' || messages.length <= contagemInicial) return;
		if (animando !== ultima) {
			animando = ultima;
			typingMsg = ultima;
			typingShown = 0;
		}
		const total = ultima.content.length;
		if (untrack(() => typingShown) >= total) return;
		const timer = setInterval(() => {
			typingShown = Math.min(total, typingShown + 4);
			if (chatViewport) chatViewport.scrollTop = chatViewport.scrollHeight;
			if (typingShown >= total) clearInterval(timer);
		}, 18);
		return () => clearInterval(timer);
	});

	function enviar() {
		if (messageInput.trim() === '' || loading) return;
		const msg = messageInput.trim();
		messageInput = '';
		onSend(msg);
	}

	// Envio direto (botões/badges) — não mexe no que o usuário está digitando.
	function enviarTexto(text: string) {
		if (!text.trim() || loading) return;
		onSend(text.trim());
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			enviar();
		}
	}

	$effect(() => {
		const msgs = messages.length;
		const isLoading = loading;
		if (msgs > 0 || isLoading) {
			setTimeout(() => {
				if (chatViewport) {
					chatViewport.scrollTop = chatViewport.scrollHeight;
				}
			}, 50);
		}
	});
</script>

<ChatWrapper>
	<!-- Header -->
	<div
		class="relative z-10 flex shrink-0 items-center border-b border-white/5 bg-black/20 px-4 py-3 backdrop-blur-xl {draggable
			? 'chat-drag-handle cursor-move pr-20 select-none'
			: ''}"
	>
		<div
			class="inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 shadow-sm backdrop-blur-md"
		>
			<Sparkles class="h-3.5 w-3.5 shrink-0 text-pink-400" />
			<span class="shrink-0 text-[11px] font-bold tracking-[0.16em] text-white uppercase"
				>{title.toUpperCase()}</span
			>
			<span class="min-w-0 truncate text-[10.5px] font-normal text-white/40"
				>Powered by Maritaca AI</span
			>
		</div>
		{#if onNovaConversa && messages.length > 0}
			<div class="ml-auto flex shrink-0 items-center gap-1 pl-2">
				{#if confirmandoNovaConversa}
					<span class="hidden text-[11px] text-white/60 sm:inline">Apagar a conversa?</span>
					<button
						type="button"
						onclick={() => {
							confirmandoNovaConversa = false;
							onNovaConversa?.();
						}}
						disabled={loading}
						class="rounded-full border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-100 transition-colors hover:bg-red-500/30 disabled:opacity-40"
					>
						Apagar conversa
					</button>
					<button
						type="button"
						onclick={() => (confirmandoNovaConversa = false)}
						class="rounded-full px-2 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
					>
						Cancelar
					</button>
				{:else}
					<button
						type="button"
						onclick={() => (confirmandoNovaConversa = true)}
						disabled={loading}
						class="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
						title="Começar uma conversa nova (apaga esta em todas as telas)"
						aria-label="Nova conversa"
					>
						<MessageSquarePlus class="h-3.5 w-3.5" />
						<span class="hidden sm:inline">Nova conversa</span>
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="relative z-10 flex flex-1 flex-col overflow-hidden p-0">
		<!-- Mensagens -->
		<div class="flex-1 space-y-4 overflow-y-auto p-5" bind:this={chatViewport}>
			{#if messages.length === 0}
				<div
					class="relative z-10 flex w-full flex-col items-center px-2 pt-8 pb-4 text-center sm:px-6"
				>
					<div class="flex w-full flex-col items-center">
						{#if emptyState}
							{@render emptyState()}
						{:else}
							<div
								class="mb-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-pink-500/50 bg-pink-500/10 shadow-[0_0_30px_rgba(236,72,153,0.15)] backdrop-blur-md"
							>
								<Bot class="h-8 w-8 text-pink-400" />
							</div>
							<h3 class="text-xl font-semibold tracking-tight text-white">Pergunte à nossa IA</h3>
						{/if}

						{#if promptStarters.length > 0}
							<div class="mt-6 flex w-full max-w-85 flex-wrap justify-center gap-2">
								{#each promptStarters as starter}
									<button
										type="button"
										onclick={() => {
											messageInput = starter.message;
											if (starter.populateOnly) {
												inputRef?.focus();
											} else {
												enviar();
											}
										}}
										class="group flex shrink-0 cursor-pointer items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-white/80 shadow-sm backdrop-blur-md transition-all hover:border-indigo-500/40 hover:bg-white/10 hover:text-white hover:shadow-[0_0_15px_rgba(99,102,241,0.15)]"
									>
										<Sparkles
											class="mr-1.5 h-3 w-3 shrink-0 text-white/30 transition-colors group-hover:text-indigo-400"
										/>
										<div class="flex-1 leading-snug">
											{starter.prefix}
											{#if starter.badge}
												<span
													class="mx-1 inline-flex items-center rounded-full border border-white/20 bg-white/5 px-1.5 py-px font-mono text-[10px] font-bold tracking-wide text-white transition-all duration-300 group-hover:border-indigo-400/80 group-hover:bg-indigo-500/20 group-hover:text-indigo-200 group-hover:shadow-[0_0_12px_rgba(129,140,248,0.5),inset_0_0_8px_rgba(129,140,248,0.3)]"
													><MarqueeText text={starter.badge} maxWidth={150} /></span
												>
											{/if}
											{starter.suffix ?? ''}
										</div>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{:else}
				{#each messages as msg, mi (msg)}
					{@const conteudo =
						msg === typingMsg && typingShown < msg.content.length
							? fatiaSegura(msg.content, typingShown)
							: msg.content}
					{@const viva = mi === respostaViva}
					{#each parseMensagemChat(conteudo) as block, i}
						{#if block.tipo === 'bolha'}
							<ChatBubble
								role={msg.role}
								name={i === 0 ? (msg.role === 'user' ? 'Você' : assistantName) : undefined}
							>
								{#each block.segmentos as segment}
									{#if segment.tipo === 'codigo'}
										{@const nomeChip = nomeDe(segment.valor)}
										{@const rotulo = nomeChip ?? segment.valor}
										{#if msg.role === 'assistant'}
											<!-- Chip de matéria: o clique abre as ações desta tela (catálogo em
											     docs/darcy-unificada.md). O ::after aumenta a área de toque para
											     ~32px sem mexer na altura da linha do texto. -->
											<DropdownMenu.Root>
												<DropdownMenu.Trigger
													title={nomeChip ? `${nomeChip} (${segment.valor})` : segment.valor}
													class="chip-materia relative mx-0.5 inline-flex max-w-full cursor-pointer items-center rounded-md border border-indigo-400/50 bg-indigo-500/20 px-1.5 py-px text-left align-baseline text-[12.5px] leading-snug font-semibold text-white transition-colors after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] hover:border-indigo-300 hover:bg-indigo-500/35 focus-visible:ring-2 focus-visible:ring-indigo-300/60 focus-visible:outline-none {nomeChip
														? ''
														: 'font-mono'}"
												>
													<span class="line-clamp-2 [overflow-wrap:anywhere]">{rotulo}</span>
												</DropdownMenu.Trigger>
												<DropdownMenu.Content
													align="start"
													class="z-[200] min-w-48 border-white/10 bg-zinc-900/95 text-white backdrop-blur-xl"
												>
													<DropdownMenu.Label class="max-w-64 truncate text-[11px] text-white/50">
														{segment.valor}{nomeChip ? ` · ${nomeChip}` : ''}
													</DropdownMenu.Label>
													<DropdownMenu.Item
														class="min-h-9 cursor-pointer"
														disabled={loading}
														onclick={() =>
															enviarTexto(mensagemPerguntarSobre(segment.valor, nomeChip))}
													>
														<MessageCircleQuestion class="h-4 w-4" /> Perguntar sobre
													</DropdownMenu.Item>
													{#if acoesEfetivas.verTurmas}
														<DropdownMenu.Item
															class="min-h-9 cursor-pointer"
															disabled={loading}
															onclick={() => enviarTexto(`/turmas ${segment.valor}`)}
														>
															<CalendarSearch class="h-4 w-4" /> Ver turmas
														</DropdownMenu.Item>
													{/if}
													{#if acoesEfetivas.adicionarAGrade}
														<DropdownMenu.Item
															class="min-h-9 cursor-pointer"
															onclick={() => acoesEfetivas.adicionarAGrade?.(segment.valor)}
														>
															<Plus class="h-4 w-4" /> Adicionar à grade
														</DropdownMenu.Item>
													{/if}
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										{:else}
											<span
												class="font-mono font-semibold {segment.negrito ? 'text-white' : ''}"
												>{segment.valor}</span
											>
										{/if}
									{:else if segment.negrito}
										<strong class="font-bold whitespace-pre-wrap text-white">{segment.valor}</strong>
									{:else}
										<span class="whitespace-pre-wrap">{segment.valor}</span>
									{/if}
								{/each}
							</ChatBubble>
						{:else if block.tipo === 'turma'}
							{@const t = block.turma}
							<div
								class="relative my-2 flex w-full max-w-[88%] min-w-0 flex-col gap-4 overflow-hidden rounded-3xl border border-indigo-500/40 bg-linear-to-br from-indigo-500/10 to-fuchsia-500/10 p-4 shadow-2xl backdrop-blur-2xl sm:p-5"
							>
								<div
									class="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-indigo-500/30 blur-2xl"
								></div>

								<div
									class="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-indigo-400/20 pb-3"
								>
									<div class="flex min-w-0 flex-wrap items-center gap-2">
										<span class="text-lg font-black tracking-tight text-white sm:text-xl"
											>Turma {t.turma}</span
										>
										{#if t.codigo}
											<span class="font-mono text-xs font-semibold text-indigo-200/80"
												>{nomeDe(t.codigo) ?? t.codigo}</span
											>
										{/if}
										{#if t.periodo}
											<span
												class="rounded-full border border-indigo-400/40 bg-indigo-500/25 px-2.5 py-0.5 text-xs font-bold text-indigo-200 shadow-sm"
												>{t.periodo}</span
											>
										{/if}
									</div>
									<span
										class="rounded-full border border-indigo-400/30 bg-indigo-500/30 px-3 py-1 text-[11px] font-bold tracking-wider text-white shadow-inner"
										>{t.vagas} vagas</span
									>
								</div>

								<div class="relative z-10 min-w-0 space-y-4">
									<div class="min-w-0">
										<p class="mb-1 text-[11px] font-bold tracking-widest text-indigo-200 uppercase">
											Professor
										</p>
										<p class="text-[15px] font-bold break-words text-white">{t.professor}</p>
									</div>

									<div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:gap-8">
										<div class="min-w-0 flex-1">
											<p
												class="mb-1.5 text-[11px] font-bold tracking-widest text-indigo-200 uppercase"
											>
												Horário
											</p>
											{#if formatHorarioSigaa(t.horario).length > 0}
												<div class="space-y-1.5">
													{#each formatHorarioSigaa(t.horario) as linha}
														<div class="flex items-baseline gap-3 text-[14px]">
															<span class="w-8 shrink-0 font-bold text-white">{linha.dia}</span>
															<span class="min-w-0 font-medium break-words text-white/90"
																>{compactarFaixasHorarias(linha.faixas)}</span
															>
														</div>
													{/each}
												</div>
											{:else}
												<p class="text-[14px] font-medium break-words text-white/90">{t.horario}</p>
											{/if}
										</div>

										<div class="min-w-0 flex-1">
											<p
												class="mb-1.5 text-[11px] font-bold tracking-widest text-indigo-200 uppercase"
											>
												Local
											</p>
											{#if formatLocalSigaa(t.local).length > 0}
												<div class="space-y-1.5">
													{#each formatLocalSigaa(t.local) as localLinha}
														<p
															class="text-[14px] leading-snug font-medium [overflow-wrap:anywhere] text-white/90"
														>
															{localLinha}
														</p>
													{/each}
												</div>
											{:else}
												<p class="text-[14px] font-medium [overflow-wrap:anywhere] text-white/90">
													{t.local}
												</p>
											{/if}
										</div>
									</div>
								</div>

								{#if acoesEfetivas.usarTurma && t.codigo && t.idTurma}
									{@const codigoTurma = t.codigo}
									{@const idTurma = t.idTurma}
									<button
										type="button"
										disabled={!viva}
										onclick={() => acoesEfetivas.usarTurma?.(codigoTurma, idTurma)}
										class="relative z-10 inline-flex min-h-9 items-center justify-center gap-1.5 self-start rounded-full border border-emerald-400/40 bg-emerald-500/20 px-4 py-1.5 text-sm font-semibold text-emerald-50 transition-colors hover:bg-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-40"
									>
										<CalendarPlus class="h-4 w-4 shrink-0" /> Usar esta turma
									</button>
								{/if}
							</div>
						{:else if block.tipo === 'botoes'}
							<!-- Respostas rápidas: pílulas que quebram linha; só a última resposta
							     responde (as antigas ficam só para leitura). -->
							<div class="mb-4 flex max-w-[88%] flex-wrap gap-2">
								{#each block.botoes as btn}
									{@const r = btn.rotulo.trim().toLowerCase()}
									<button
										type="button"
										disabled={!viva}
										onclick={() => enviarTexto(btn.mensagem)}
										title={btn.mensagem !== btn.rotulo ? btn.mensagem : undefined}
										class="min-h-9 max-w-full cursor-pointer rounded-full border px-4 py-1.5 text-left text-[13px] font-medium break-words whitespace-normal transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40
											{r === 'sim'
											? 'border-emerald-500/40 bg-emerald-600/25 text-emerald-50 hover:bg-emerald-600/45'
											: r === 'não' || r === 'nao'
												? 'border-rose-500/40 bg-rose-600/25 text-rose-50 hover:bg-rose-600/45'
												: 'border-indigo-500/40 bg-indigo-600/25 text-indigo-50 hover:bg-indigo-600/45'}"
									>
										{btn.rotulo}
									</button>
								{/each}
							</div>
						{:else if block.tipo === 'grade'}
							{@const opcao = opcaoDoBloco(msg, block.selecao)}
							{@const abrir = acoesEfetivas.grade.modo === 'abrir'}
							<!-- Aplicar/abrir uma grade sugerida antes continua valendo, por isso
							     este bloco não depende de ser a última resposta. -->
							<div class="mb-4 max-w-[88%]">
								<button
									type="button"
									onclick={() => acoesEfetivas.grade.executar(block.codigos, opcao)}
									class="flex w-full min-w-0 items-start gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-600/20 px-4 py-2.5 text-left text-emerald-50 transition-colors hover:bg-emerald-600/40 active:scale-[0.99]"
								>
									{#if abrir}
										<ArrowUpRight class="mt-0.5 h-4 w-4 shrink-0" />
									{:else}
										<CalendarPlus class="mt-0.5 h-4 w-4 shrink-0" />
									{/if}
									<span class="min-w-0">
										<span class="block text-sm font-semibold break-words"
											>{rotuloGrade(!!opcao, block.codigos)}</span
										>
										{#if abrir || opcao}
											<span class="mt-0.5 block text-[12px] break-words text-emerald-100/70">
												{block.codigos.map((c) => nomeDe(c) ?? c).join(' · ')}
											</span>
										{/if}
									</span>
								</button>
							</div>
						{/if}
					{/each}
				{/each}

				{#if loading}
					<ChatLoader />
				{/if}
			{/if}
		</div>

		<!-- Input -->
		<div class="relative z-10 bg-transparent p-5 pt-3 pb-6">
			<div class="relative flex w-full items-center shadow-2xl">
				<input
					type="text"
					bind:value={messageInput}
					bind:this={inputRef}
					{placeholder}
					disabled={loading}
					onkeydown={handleKeydown}
					class="w-full rounded-full border border-white/20 bg-white/10 py-3.5 pr-12 pl-5 text-[14.5px] text-white shadow-inner backdrop-blur-2xl transition-all placeholder:text-white/50 focus:border-white/30 focus:bg-white/15 focus:outline-none disabled:opacity-50"
				/>
				<button
					type="button"
					onclick={enviar}
					disabled={loading || messageInput.trim() === ''}
					class="absolute right-2 cursor-pointer rounded-full border border-white/10 bg-white/10 p-2 text-white shadow-sm transition-all hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/40"
					aria-label="Enviar"
				>
					<SendHorizontal class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
</ChatWrapper>
