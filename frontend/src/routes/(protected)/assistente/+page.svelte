<script lang="ts">
	import { onMount } from 'svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import ChatPanel from '$lib/components/chat/ChatPanel.svelte';
	import { assistenteChatStore } from '$lib/stores/assistente-chat.store.svelte';
	import { authStore } from '$lib/stores/auth';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { Bot } from 'lucide-svelte';

	// Carrega os dados do curso (se o aluno tiver fluxograma) para que o store
	// monte o planoInput e o agente ganhe as tools de plano/histórico. Sem matriz,
	// segue em modo leve (recomendação/ementa/turmas) — não redireciona.
	onMount(async () => {
		if (!fluxogramaStore.state.courseData) {
			const curriculoCompleto = authStore.getUser()?.dadosFluxograma?.matrizCurricular ?? null;
			if (curriculoCompleto) {
				try {
					await fluxogramaStore.loadCourseDataByCurriculoCompleto(curriculoCompleto);
				} catch {
					// Falha ao carregar curso → agente opera em modo leve.
				}
			}
		}
	});

	// Starters do chat-agente da Assistente: recomendação, ementa, turmas e histórico.
	// O primeiro é personalizado — pergunta a opinião real de alunos sobre uma
	// matéria que o próprio aluno está cursando agora, quando o fluxograma já
	// carregou (mesmo padrão de starters dinâmicos do PlannerChatPanel).
	const promptStarters = $derived.by(() => {
		const starters = [];

		const courseData = fluxogramaStore.state.courseData;
		const currentCodes = fluxogramaStore.currentCodes;
		if (courseData && currentCodes.size > 0) {
			const materiaAtual = courseData.materias.find((m) => currentCodes.has(m.codigoMateria));
			if (materiaAtual) {
				starters.push({
					prefix: 'O que os alunos acham de',
					badge: materiaAtual.nomeMateria,
					suffix: '?',
					message: `O que os alunos acham de ${materiaAtual.nomeMateria} (${materiaAtual.codigoMateria})? Vale a pena eu me preparar mais pra ela?`
				});
			}
		}

		starters.push({ prefix: 'Recomenda matérias sobre', badge: 'IA', suffix: '', message: 'Quero descobrir disciplinas sobre inteligência artificial' });
		starters.push({ prefix: 'Explica a ementa de', badge: 'Cálculo 1', suffix: '', message: 'Explique o conteúdo de Cálculo 1' });
		starters.push({ prefix: 'Quais as', badge: 'turmas', suffix: 'de uma matéria?', message: 'Quais as turmas de MAT0025?' });
		starters.push({ prefix: 'O que já', badge: 'concluí', suffix: 'no meu curso?', message: 'O que eu já concluí no meu curso?' });

		return starters.slice(0, 4);
	});

	function onSend(msg: string) {
		assistenteChatStore.enviarMensagem(msg);
	}
</script>

<PageMeta
	title="Darcy AI"
	description="Converse com o assistente inteligente do NoFluxo: recomendações, ementas, turmas e seu progresso"
	noIndex={true}
/>

<PageBackground />

<div class="relative z-10 mx-auto flex h-[calc(100dvh-5.75rem)] min-h-0 w-full max-w-none flex-col px-2 pb-2 sm:h-[calc(100dvh-6.5rem)] sm:px-3 sm:pb-3 lg:px-6">
	<ChatPanel
		messages={assistenteChatStore.chatMessages}
		loading={assistenteChatStore.chatLoading}
		{promptStarters}
		title="Darcy AI"
		assistantName="Darcy AI"
		placeholder="Ex: recomenda matérias sobre redes, ou /turmas MAT0025..."
		interactiveBadges={true}
		{onSend}
	>
		{#snippet emptyState()}
			<div class="w-16 h-16 rounded-3xl bg-pink-500/10 border border-pink-500/50 flex items-center justify-center mb-4 shadow-sm dark:shadow-[0_0_30px_rgba(236,72,153,0.15)] backdrop-blur-md shrink-0">
				<Bot class="h-8 w-8 text-pink-600 dark:text-pink-400" />
			</div>
			<h3 class="text-xl font-semibold text-foreground tracking-tight">Como posso ajudar?</h3>
			<p class="text-[12px] text-muted-foreground mt-2 max-w-[300px] leading-relaxed">
				Eu recomendo disciplinas por assunto, explico ementas, mostro turmas e — se você tiver o fluxograma carregado — respondo sobre o seu progresso (o que já fez, quanto falta, IRA).
			</p>
		{/snippet}
	</ChatPanel>
</div>
