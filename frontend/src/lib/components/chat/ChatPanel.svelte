<script lang="ts">
	import { untrack } from 'svelte';
	import { Sparkles, SendHorizontal, Bot, CalendarPlus } from 'lucide-svelte';
	import { formatHorarioSigaa, compactarFaixasHorarias, formatLocalSigaa } from '$lib/utils/sigaa';
	import ChatWrapper from '$lib/components/chat/ChatWrapper.svelte';
	import ChatBubble from '$lib/components/chat/ChatBubble.svelte';
	import ChatLoader from '$lib/components/chat/ChatLoader.svelte';
	import MarqueeText from '$lib/components/ui/MarqueeText.svelte';
	import type { Snippet } from 'svelte';

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
	}

	let {
		messages,
		loading = false,
		promptStarters = [],
		title = 'Darcy AI',
		assistantName = 'Darcy AI',
		placeholder = 'Pergunte alguma coisa...',
		draggable = false,
		interactiveBadges = false,
		onSend,
		onAddToGrade,
		onMontarGrade,
		nomesMaterias,
		emptyState,
		prefillText,
		prefillNonce
	}: {
		messages: ChatMsg[];
		loading?: boolean;
		promptStarters?: Starter[];
		title?: string;
		assistantName?: string;
		placeholder?: string;
		draggable?: boolean;
		/** Quando true, os códigos de matéria viram botões clicáveis (envia o código). */
		interactiveBadges?: boolean;
		onSend: (msg: string) => void;
		/** Quando definido, cada badge de código ganha um botão "+ grade". */
		onAddToGrade?: (codigo: string) => void;
		/** Quando definido, o marcador [MONTAR_GRADE|COD,...|TURNOS|DOCENTES] vira um botão de ação. */
		onMontarGrade?: (
			codigos: string[],
			turnos?: string[],
			docentes?: Record<string, string>,
			incluirCursando?: boolean
		) => void;
		/** Mapa código→nome: chips de matéria exibem o nome (código vira tooltip). */
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
	} = $props();

	/** "INTRODUÇÃO A COMPUTAÇÃO GRÁFICA" → "Introdução A Computação Gráfica". */
	function nomeBonito(nome: string): string {
		return nome.toLowerCase().replace(/(^|[\s(])\p{L}/gu, (c) => c.toUpperCase());
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

	/**
	 * Fatia o texto sem cortar no meio de um marcador de formatação — um
	 * `[BOTAO|...]` ou `**negrito**` pela metade renderizaria cru no chat.
	 */
	function fatiaSegura(texto: string, n: number): string {
		let out = texto.slice(0, n);
		const abre = out.lastIndexOf('[');
		if (abre >= 0 && out.indexOf(']', abre) === -1) out = out.slice(0, abre);
		const asteriscos = out.split('**').length - 1;
		if (asteriscos % 2 === 1) out = out.slice(0, out.lastIndexOf('**'));
		return out;
	}

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

	// Parser compartilhado: badges de código, blocos [TURMA|...], [BOTAO|...] e **negrito**.
	function parseMessage(text: string) {
		// Tipografia: itens de lista viram bullet de verdade e o excesso de linhas
		// em branco é colapsado — o texto cru do modelo era corrido demais de ler.
		text = text
			.replace(/\n{3,}/g, '\n\n')
			.replace(/^[ \t]*[-*]\s+/gm, '•  ')
			.replace(/^[ \t]*(\d+)[.)]\s+/gm, '$1.  ');
		const regex =
			/(\b[A-Z]{3,4}\d{4}\b)|(\[TURMA\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|\]]+)(?:\|([^\]]+))?\])|(\[BOTAO\|([^|\]]+)(?:\|([^\]]+))?\])|(\*\*([^*\n]+)\*\*)|(\[MONTAR_GRADE\|([^\]]+)\])/g;
		const blocks: any[] = [];
		let currentBubble: any[] = [];
		let lastIndex = 0;
		let match;

		function flushBubble() {
			if (currentBubble.length > 0) {
				const hasContent = currentBubble.some(
					(s) =>
						s.type === 'badge' || s.type === 'bold' || (s.type === 'text' && s.value.trim() !== '')
				);
				if (hasContent) {
					blocks.push({ type: 'bubble', segments: currentBubble });
				}
				currentBubble = [];
			}
		}

		while ((match = regex.exec(text)) !== null) {
			if (match.index > lastIndex) {
				currentBubble.push({ type: 'text', value: text.substring(lastIndex, match.index) });
			}

			if (match[1]) {
				currentBubble.push({ type: 'badge', value: match[1] });
			} else if (match[2]) {
				flushBubble();
				blocks.push({
					type: 'turma',
					value: {
						turma: match[3].trim(),
						prof: match[4].trim(),
						horario: match[5].trim(),
						local: match[6].trim(),
						vagas: match[7].trim(),
						periodo: match[8] ? match[8].trim() : undefined
					}
				});
			} else if (match[9]) {
				flushBubble();
				blocks.push({
					type: 'button',
					label: match[10].trim().replace(/([a-z])([A-Z])/g, '$1 $2'),
					message: match[11] ? match[11].trim() : match[10].trim()
				});
			} else if (match[12]) {
				currentBubble.push({ type: 'bold', value: match[13] });
			} else if (match[14]) {
				flushBubble();
				// [MONTAR_GRADE|COD1,COD2|M,N|COD3=Fulano|0] → códigos (1º) + turnos (2º) +
				// professor por matéria (3º, opcional — "CODIGO=Nome" separados por ;) +
				// incluir as matérias em curso (4º, opcional: "0" = montar sem elas).
				// Campos ausentes são tolerados: a variante antiga de 2 campos segue válida.
				const partes = (match[15] ?? '').split('|');
				const codigos = (partes[0] ?? '')
					.split(',')
					.map((c) => c.trim().toUpperCase())
					.filter(Boolean);
				const turnos = (partes[1] ?? '')
					.split(',')
					.map((t) => t.trim().toUpperCase())
					.filter((t) => t === 'M' || t === 'T' || t === 'N');
				const docentes: Record<string, string> = {};
				for (const par of (partes[2] ?? '').split(';')) {
					const [cod, ...resto] = par.split('=');
					const codigo = (cod ?? '').trim().toUpperCase();
					const nome = resto.join('=').trim();
					if (codigo && nome) docentes[codigo] = nome;
				}
				// Só "0" desliga; ausente ou qualquer outra coisa mantém o padrão (ligado).
				const incluirCursando = (partes[3] ?? '').trim() === '0' ? false : undefined;
				if (
					codigos.length > 0 ||
					turnos.length > 0 ||
					Object.keys(docentes).length > 0 ||
					incluirCursando === false
				)
					blocks.push({ type: 'montarGrade', codigos, turnos, docentes, incluirCursando });
			}
			lastIndex = regex.lastIndex;
		}

		if (lastIndex < text.length) {
			currentBubble.push({ type: 'text', value: text.substring(lastIndex) });
		}
		flushBubble();

		// Agrupar botões consecutivos para ficarem lado a lado.
		const finalBlocks: any[] = [];
		for (const block of blocks) {
			if (block.type === 'button') {
				const lastBlock = finalBlocks[finalBlocks.length - 1];
				if (lastBlock && lastBlock.type === 'buttonGroup') {
					lastBlock.buttons.push(block);
				} else {
					finalBlocks.push({ type: 'buttonGroup', buttons: [block] });
				}
			} else {
				finalBlocks.push(block);
			}
		}

		return finalBlocks;
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
		class="relative z-10 flex shrink-0 items-center border-b border-border bg-background/60 px-4 py-3 backdrop-blur-xl dark:border-white/5 dark:bg-black/20 {draggable
			? 'chat-drag-handle cursor-move pr-20 select-none'
			: ''}"
	>
		<div
			class="inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 shadow-sm backdrop-blur-md"
		>
			<Sparkles class="h-3.5 w-3.5 shrink-0 text-pink-600 dark:text-pink-400" />
			<span class="shrink-0 text-[11px] font-bold tracking-[0.16em] text-foreground uppercase"
				>{title.toUpperCase()}</span
			>
			<span class="min-w-0 truncate text-[10.5px] font-normal text-muted-foreground dark:text-white/40"
				>Powered by Maritaca AI</span
			>
		</div>
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
								class="mb-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-pink-500/50 bg-pink-500/10 shadow-sm backdrop-blur-md dark:shadow-[0_0_30px_rgba(236,72,153,0.15)]"
							>
								<Bot class="h-8 w-8 text-pink-600 dark:text-pink-400" />
							</div>
							<h3 class="text-xl font-semibold tracking-tight text-foreground">Pergunte à nossa IA</h3>
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
										class="group flex shrink-0 cursor-pointer items-center rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1.5 text-[12px] font-medium text-foreground/80 shadow-sm backdrop-blur-md transition-all hover:border-primary/40 hover:bg-foreground/10 hover:text-foreground dark:hover:border-indigo-500/40 dark:hover:shadow-[0_0_15px_rgba(99,102,241,0.15)]"
									>
										<Sparkles
											class="mr-1.5 h-3 w-3 shrink-0 text-muted-foreground/70 transition-colors group-hover:text-primary dark:group-hover:text-indigo-400"
										/>
										<div class="flex-1 leading-snug">
											{starter.prefix}
											{#if starter.badge}
												<span
													class="mx-1 inline-flex items-center rounded-full border border-foreground/20 bg-foreground/5 px-1.5 py-px font-mono text-[10px] font-bold tracking-wide text-foreground transition-all duration-300 group-hover:border-primary/80 group-hover:bg-primary/15 group-hover:text-accent-foreground dark:group-hover:border-indigo-400/80 dark:group-hover:bg-indigo-500/20 dark:group-hover:text-indigo-200 dark:group-hover:shadow-[0_0_12px_rgba(129,140,248,0.5),inset_0_0_8px_rgba(129,140,248,0.3)]"
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
				{#each messages as msg (msg)}
					{@const conteudo =
						msg === typingMsg && typingShown < msg.content.length
							? fatiaSegura(msg.content, typingShown)
							: msg.content}
					{#each parseMessage(conteudo) as block, i}
						{#if block.type === 'bubble'}
							<ChatBubble
								role={msg.role}
								name={i === 0 ? (msg.role === 'user' ? 'Você' : assistantName) : undefined}
							>
								{#each block.segments as segment}
									{#if segment.type === 'badge'}
										{@const nomeChip = nomesMaterias?.get(segment.value)}
										{@const rotulo = nomeChip ? nomeBonito(nomeChip) : segment.value}
										<span class="mx-0.5 inline-flex max-w-full items-center gap-0.5">
											{#if interactiveBadges}
												<button
													type="button"
													onclick={() => enviarTexto(segment.value)}
													disabled={loading}
													title={nomeChip ? segment.value : `Ver ${segment.value}`}
													class="badge-glow inline-flex cursor-pointer items-center rounded-md border border-ai/40 bg-background/90 px-1.5 py-0.5 text-xs font-bold tracking-wide text-accent-foreground backdrop-blur-md transition-all hover:-translate-y-px hover:border-ai/70 hover:bg-background active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-400/60 dark:bg-indigo-500/20 dark:text-white dark:hover:border-indigo-300 dark:hover:bg-indigo-500/40 {nomeChip
														? ''
														: 'font-mono'}"><MarqueeText text={rotulo} maxWidth={220} /></button
												>
											{:else}
												<span
													title={nomeChip ? segment.value : undefined}
													class="inline-flex items-center rounded-md border border-ai/30 bg-background/90 px-1.5 py-0.5 text-xs font-bold tracking-wide text-accent-foreground shadow-sm backdrop-blur-md dark:border-white/20 dark:bg-white/10 dark:text-white {nomeChip
														? ''
														: 'font-mono'}"><MarqueeText text={rotulo} maxWidth={220} /></span
												>
											{/if}
											{#if onAddToGrade}
												<button
													type="button"
													onclick={() => onAddToGrade?.(segment.value)}
													title={`Adicionar ${segment.value} à grade`}
													class="inline-flex items-center rounded-md border border-emerald-600/60 bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-95 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/30"
													>+ grade</button
												>
											{/if}
										</span>
									{:else if segment.type === 'bold'}
										<strong class="font-bold text-current dark:text-white">{segment.value}</strong>
									{:else}
										<span class="whitespace-pre-wrap">{segment.value}</span>
									{/if}
								{/each}
							</ChatBubble>
						{:else if block.type === 'turma'}
							<div
								class="relative my-2 flex w-[95%] flex-col gap-4 self-center overflow-hidden rounded-3xl border border-border bg-card bg-linear-to-br from-indigo-500/10 to-fuchsia-500/10 p-5 shadow-nofluxo backdrop-blur-2xl sm:w-[85%] dark:border-indigo-500/40 dark:bg-transparent dark:shadow-2xl"
							>
								<div
									class="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-indigo-500/30 blur-2xl"
								></div>

								<div
									class="relative z-10 mb-1 flex flex-wrap items-center justify-between gap-2 border-b border-indigo-400/20 pb-3"
								>
									<div class="flex items-center gap-2.5">
										<span class="text-xl font-black tracking-tight text-foreground"
											>Turma {block.value.turma}</span
										>
										{#if block.value.periodo}
											<span
												class="rounded-full border border-indigo-400/40 bg-indigo-500/25 px-2.5 py-0.5 text-xs font-bold text-indigo-800 shadow-sm dark:text-indigo-200"
												>{block.value.periodo}</span
											>
										{/if}
									</div>
									<span
										class="rounded-full border border-indigo-400/30 bg-indigo-500/30 px-3 py-1.5 text-[11px] font-bold tracking-widest text-foreground shadow-inner"
										>{block.value.vagas} VAGAS</span
									>
								</div>

								<div class="relative z-10 space-y-4">
									<div>
										<p class="mb-1 text-[11px] font-bold tracking-widest text-indigo-700 uppercase dark:text-indigo-200">
											Professor
										</p>
										<p class="text-base font-bold text-foreground dark:drop-shadow-md">{block.value.prof}</p>
									</div>

									<div class="flex flex-col gap-5 sm:flex-row sm:gap-8">
										<div class="flex-1">
											<p
												class="mb-1.5 text-[11px] font-bold tracking-widest text-indigo-700 uppercase dark:text-indigo-200"
											>
												Horário
											</p>
											{#if formatHorarioSigaa(block.value.horario).length > 0}
												<div class="space-y-1.5">
													{#each formatHorarioSigaa(block.value.horario) as linha}
														<div class="flex items-center gap-3 text-[14px]">
															<span class="w-8 font-bold text-foreground">{linha.dia}</span>
															<span class="font-medium text-foreground/90"
																>{compactarFaixasHorarias(linha.faixas)}</span
															>
														</div>
													{/each}
												</div>
											{:else}
												<p class="text-[14px] font-medium text-foreground/90">{block.value.horario}</p>
											{/if}
										</div>

										<div class="flex-1">
											<p
												class="mb-1.5 text-[11px] font-bold tracking-widest text-indigo-700 uppercase dark:text-indigo-200"
											>
												Local
											</p>
											{#if formatLocalSigaa(block.value.local).length > 0}
												<div class="space-y-1.5">
													{#each formatLocalSigaa(block.value.local) as localLinha}
														<p class="text-[14px] leading-snug font-medium text-foreground/90">
															{localLinha}
														</p>
													{/each}
												</div>
											{:else}
												<p class="text-[14px] font-medium text-foreground/90">{block.value.local}</p>
											{/if}
										</div>
									</div>
								</div>
							</div>
						{:else if block.type === 'buttonGroup'}
							<div class="mt-2 mr-4 ml-10 flex w-[85%] flex-col gap-2 self-start">
								{#each block.buttons as btn}
									<button
										type="button"
										onclick={() => {
											messageInput = btn.message;
											enviar();
										}}
										class="w-full cursor-pointer rounded-xl border px-4 py-2.5 text-left text-sm font-medium tracking-wide shadow-sm backdrop-blur-md transition-all active:scale-[0.98] dark:shadow-md
											{btn.label.toLowerCase() === 'sim' || btn.label.toLowerCase().includes('aplicar')
											? 'border-emerald-600/60 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-600/30 dark:text-emerald-50 dark:shadow-[0_0_15px_rgba(16,185,129,0.15)] dark:hover:bg-emerald-600/50'
											: btn.label.toLowerCase() === 'não' ||
												  btn.label.toLowerCase() === 'nao' ||
												  btn.label.toLowerCase().includes('cancelar')
												? 'border-rose-600/60 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-600/30 dark:text-rose-50 dark:shadow-[0_0_15px_rgba(244,63,94,0.15)] dark:hover:bg-rose-600/50'
												: 'border-primary/40 bg-accent text-accent-foreground hover:bg-primary/15 dark:border-indigo-500/40 dark:bg-indigo-600/30 dark:text-indigo-50 dark:shadow-[0_0_15px_rgba(99,102,241,0.15)] dark:hover:bg-indigo-600/50'}"
									>
										{btn.label}
									</button>
								{/each}
							</div>
						{:else if block.type === 'montarGrade' && onMontarGrade}
							{@const nomesDocentes = Object.values(block.docentes ?? {})}
							<div class="mt-2 mr-4 ml-10 w-[85%] self-start">
								<button
									type="button"
									onclick={() =>
										onMontarGrade?.(
											block.codigos,
											block.turnos,
											block.docentes,
											block.incluirCursando
										)}
									class="flex w-full items-center gap-2 rounded-xl border border-emerald-600/60 bg-emerald-50 px-4 py-2.5 text-left text-sm font-semibold text-emerald-800 shadow-sm backdrop-blur-md transition-all hover:bg-emerald-100 active:scale-[0.98] dark:border-emerald-500/40 dark:bg-emerald-600/25 dark:text-emerald-50 dark:shadow-[0_0_15px_rgba(16,185,129,0.15)] dark:hover:bg-emerald-600/45"
								>
									<CalendarPlus class="h-4 w-4 shrink-0" />
									<span>
										{[
											'Montar grade',
											block.codigos.length > 0 ? `priorizando ${block.codigos.join(', ')}` : null,
											block.turnos.length > 0
												? `· ${block.turnos.map((t: string) => ({ M: 'manhã', T: 'tarde', N: 'noite' })[t] ?? t).join(' e ')}`
												: null,
											nomesDocentes.length > 0 ? `· com ${nomesDocentes.join(', ')}` : null
										]
											.filter(Boolean)
											.join(' ')}
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
			<div class="relative flex w-full items-center dark:shadow-2xl">
				<input
					type="text"
					bind:value={messageInput}
					bind:this={inputRef}
					{placeholder}
					disabled={loading}
					onkeydown={handleKeydown}
					class="w-full rounded-full border border-border-strong bg-card py-3.5 pr-12 pl-5 text-[14.5px] text-foreground shadow-sm backdrop-blur-2xl transition-all placeholder:text-muted-foreground focus:border-ring focus:outline-none disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:shadow-inner dark:focus:border-white/30 dark:focus:bg-white/15"
				/>
				<button
					type="button"
					onclick={enviar}
					disabled={loading || messageInput.trim() === ''}
					class="absolute right-2 cursor-pointer rounded-full border border-foreground/10 bg-foreground/10 p-2 text-foreground shadow-sm transition-all hover:bg-foreground/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground/40"
					aria-label="Enviar"
				>
					<SendHorizontal class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
</ChatWrapper>

<style>
	/* Glow pulsante nos códigos de matéria clicáveis — deixa óbvio que dá pra apertar. */
	.badge-glow {
		box-shadow:
			0 0 8px rgba(129, 140, 248, 0.55),
			inset 0 0 6px rgba(129, 140, 248, 0.25);
		animation: badgePulse 2s ease-in-out infinite;
	}
	.badge-glow:hover {
		animation: none;
		box-shadow:
			0 0 18px rgba(129, 140, 248, 0.95),
			inset 0 0 8px rgba(129, 140, 248, 0.4);
	}
	@keyframes badgePulse {
		0%,
		100% {
			box-shadow:
				0 0 6px rgba(129, 140, 248, 0.4),
				inset 0 0 5px rgba(129, 140, 248, 0.2);
		}
		50% {
			box-shadow:
				0 0 15px rgba(129, 140, 248, 0.9),
				inset 0 0 8px rgba(129, 140, 248, 0.4);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.badge-glow {
			animation: none;
		}
	}
</style>
