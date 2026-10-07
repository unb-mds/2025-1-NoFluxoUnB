<script lang="ts">
	import { onMount } from 'svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import ChatPanel from '$lib/components/chat/ChatPanel.svelte';
	import { darcyStore } from '$lib/stores/darcy.store.svelte';
	import { authStore } from '$lib/stores/auth';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { Bot } from 'lucide-svelte';
	import { isOptativa } from '$lib/types/materia';
	import { satisfazPreRequisitos } from '$lib/types/curso';

	// Tela cheia da MESMA conversa das outras telas (`darcyStore`). O contexto do
	// aluno a Darcy lê do banco; o curso só é carregado aqui pros starters
	// personalizados e pros nomes nos chips. Sem `acoes`, o ChatPanel usa as de
	// fora do Montador ("Ver turmas", "Abrir no Montador").
	$effect(() =>
		darcyStore.registrarSuperficie({ superficie: 'assistente', estado: () => ({ tipo: 'assistente' }) })
	);

	onMount(async () => {
		if (!fluxogramaStore.state.courseData) {
			const curriculoCompleto = authStore.getUser()?.dadosFluxograma?.matrizCurricular ?? null;
			if (curriculoCompleto) {
				try {
					await fluxogramaStore.loadCourseDataByCurriculoCompleto(curriculoCompleto);
				} catch {
					// Sem curso carregado só perdemos o starter personalizado.
				}
			}
		}
	});

	/** "CÁLCULO 2" → "Cálculo 2" para o badge do starter. */
	function nomeCurto(nome: string): string {
		return nome.toLowerCase().replace(/(^|[\s(])\p{L}/gu, (c) => c.toUpperCase());
	}

	// Starters do /assistente a partir do que o aluno tem de fato: uma matéria que
	// ele cursa agora e a próxima obrigatória que já pode pegar. Sem fluxograma
	// carregado, só os genéricos (que não citam matéria nenhuma).
	const promptStarters = $derived.by(() => {
		const starters = [];
		const courseData = fluxogramaStore.state.courseData;
		const cursando = fluxogramaStore.currentCodes;
		const concluidas = fluxogramaStore.completedCodes;

		if (courseData) {
			const atual = courseData.materias.find((m) => cursando.has(m.codigoMateria));
			if (atual) {
				starters.push({
					prefix: 'Dicas pra',
					badge: nomeCurto(atual.nomeMateria),
					suffix: '',
					message: `Estou cursando ${atual.nomeMateria} (${atual.codigoMateria}). O que os alunos acham dela e como me preparar?`
				});
			}

			const proxima = courseData.materias
				.filter(
					(m) =>
						!isOptativa(m) &&
						!concluidas.has(m.codigoMateria) &&
						!cursando.has(m.codigoMateria) &&
						satisfazPreRequisitos(
							courseData.preRequisitos.filter((pr) => pr.idMateria === m.idMateria),
							concluidas
						)
				)
				.sort((a, b) => a.nivel - b.nivel)[0];
			if (proxima) {
				starters.push({
					prefix: 'Turmas de',
					badge: nomeCurto(proxima.nomeMateria),
					suffix: '',
					message: `/turmas ${proxima.codigoMateria}`
				});
			}
		}

		starters.push({ prefix: 'Quanto', badge: 'falta', suffix: 'pra me formar?', message: 'Quanto falta pra eu me formar?' });
		starters.push({
			prefix: 'Recomenda',
			badge: 'optativas',
			suffix: 'sobre um tema',
			message: 'Recomende optativas sobre ',
			populateOnly: true
		});

		return starters.slice(0, 4);
	});

	function onSend(msg: string) {
		darcyStore.enviar(msg);
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
		messages={darcyStore.mensagens}
		loading={darcyStore.carregando}
		{promptStarters}
		title="Darcy AI"
		assistantName="Darcy AI"
		placeholder="Ex: recomenda matérias sobre redes, ou quantos créditos me faltam?"
		{onSend}
		onNovaConversa={() => darcyStore.novaConversa()}
	>
		{#snippet emptyState()}
			<div class="w-16 h-16 rounded-3xl bg-pink-500/10 border border-pink-500/50 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(236,72,153,0.15)] backdrop-blur-md shrink-0">
				<Bot class="h-8 w-8 text-pink-400" />
			</div>
			<h3 class="text-xl font-semibold text-white tracking-tight">Como posso ajudar?</h3>
			<p class="text-[12px] text-white/50 mt-2 max-w-[300px] leading-relaxed">
				Eu recomendo disciplinas por assunto, explico ementas, mostro turmas e — se você tiver o fluxograma carregado — respondo sobre o seu progresso (o que já fez, quanto falta, IRA).
			</p>
		{/snippet}
	</ChatPanel>
</div>
