<script lang="ts">
	/**
	 * Harness do chat do assistente (ChatPanel real), sem auth nem backend.
	 * Mensagens fixas com negrito, códigos de matéria e marcadores, para
	 * conferir contraste nos temas claro e escuro (coberto pelo a11y.spec).
	 */
	import ChatPanel from '$lib/components/chat/ChatPanel.svelte';

	const messages = [
		{ role: 'user' as const, content: 'Quais matérias eu posso pegar no próximo semestre?' },
		{
			role: 'assistant' as const,
			content:
				'Com o seu histórico, você já pode cursar **Estruturas de Dados 2** (FGA0030) e **Orientação a Objetos** (FGA0158).\n\nRecomendo priorizar **FGA0030**, porque ela libera **três** disciplinas do próximo período.'
		},
		{ role: 'user' as const, content: 'E se eu quiser **só de manhã**?' },
		{
			role: 'assistant' as const,
			content:
				'Dá sim: as duas têm turma **pela manhã** nesta oferta.\n\n• **Pré-requisito:** Estruturas de Dados 1\n• **Vagas:** poucas, matricule cedo\n\n[TURMA|01|Fulano de Tal|35M12|FGA S1|12 vagas|2026.2]\n\n[BOTAO|Ver ementa|Mostre a ementa de FGA0030][BOTAO|Outras turmas]\n\n[MONTAR_GRADE|FGA0030,FGA0158|M]'
		}
	];
</script>

<div class="mx-auto flex h-[100dvh] max-w-2xl flex-col p-4">
	<ChatPanel
		{messages}
		controleDeUso={false}
		interactiveBadges
		onSend={() => {}}
		onMontarGrade={() => {}}
	/>
</div>
