<script lang="ts">
	import { planoFormaturaStore } from '$lib/stores/plano-formatura.store.svelte';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { Bot } from 'lucide-svelte';
	import ChatPanel from '$lib/components/chat/ChatPanel.svelte';
	import { authStore } from '$lib/stores/auth';

	let authState = $derived($authStore);
	const semestreAtual = $derived(authState.user?.dadosFluxograma?.semestreAtual ?? 1);

	// Código → nome para os chips do chat mostrarem o nome da matéria. Junta a
	// matriz do curso com o plano (que tem optativas fora da matriz, ex.: DIN0002).
	const nomesMaterias = $derived.by(() => {
		const map = new Map<string, string>();
		const norm = (c: string) => c.trim().toUpperCase();
		for (const m of fluxogramaStore.state.courseData?.materias ?? []) {
			if (m.codigoMateria && m.nomeMateria) map.set(norm(m.codigoMateria), m.nomeMateria);
		}
		const plano = planoFormaturaStore.plano as any;
		for (const s of plano?.plano ?? []) {
			for (const m of s.materias ?? []) {
				if (m.codigo && m.nome) map.set(norm(m.codigo), m.nome);
			}
		}
		for (const m of plano?.semestreAtual?.materias ?? []) {
			if (m.codigo && m.nome) map.set(norm(m.codigo), m.nome);
		}
		return map;
	});

	/** Nome da matéria em Title Case para o starter (o badge faz marquee se não couber). */
	function nomeParaBadge(codigo: string): string {
		const nome = nomesMaterias.get(codigo.trim().toUpperCase());
		if (!nome) return codigo;
		return nome.toLowerCase().replace(/(^|[\s(])\p{L}/gu, (c) => c.toUpperCase());
	}

	const promptStarters = $derived.by(() => {
		const starters = [];
		const plano = planoFormaturaStore.plano;

		if (!plano || !plano.plano || plano.plano.length === 0) {
			// Fallbacks
			starters.push({ prefix: 'Como', badge: 'antecipar', suffix: 'minha formatura?', message: 'Como posso antecipar minha formatura?' });
			starters.push({ prefix: 'Quais as turmas', badge: 'disponíveis?', suffix: '', message: 'Mostre as turmas ofertadas esse semestre' });
			return starters;
		}

		// 1. Semestre mais pesado (misturando créditos + dificuldades)
		const calcPeso = (s: any) => {
			return s.creditos + s.materias.reduce((acc: number, m: any) => acc + (m.dificuldadeEstimada || 5), 0);
		};
		const heaviest = plano.plano.reduce((prev, curr) => (calcPeso(prev) > calcPeso(curr) ? prev : curr));
		if (heaviest && (calcPeso(heaviest) >= 30 || heaviest.creditos >= 20)) {
			const num = semestreAtual + heaviest.indice + 1;
			starters.push({
				prefix: 'Semestre',
				badge: `${num}`,
				suffix: 'tá muito pesado',
				message: `O Semestre ${num} tá muito pesado, tem como dar uma aliviada?`
			});
		} else {
			starters.push({ prefix: 'Como', badge: 'antecipar', suffix: 'minha formatura?', message: 'Como posso antecipar minha formatura?' });
		}

		// 2. Turmas de uma matéria crítica
		const criticas = plano.plano.flatMap(s => s.materias).filter(m => 'critica' in m && m.critica);
		if (criticas.length > 0) {
			const m = criticas[0] as any;
			starters.push({ prefix: 'Ver turmas de', badge: nomeParaBadge(m.codigo), suffix: '', message: `/turmas ${m.codigo}` });
		} else {
			starters.push({ prefix: 'Buscar', badge: 'turmas disponíveis', suffix: '', message: 'Mostre turmas com vagas sobrando' });
		}

		// 3. Adiar matéria próxima
		const primeiraMat = plano.plano[0].materias.find(m => 'codigo' in m);
		if (primeiraMat) {
			const m = primeiraMat as any;
			starters.push({ prefix: 'Adiar a matéria', badge: nomeParaBadge(m.codigo), suffix: '', message: `Adie a matéria ${m.codigo} para o próximo semestre` });
		}

		// 4. Perguntas Gerais Fixas
		starters.push({ prefix: 'Como posso', badge: 'adiantar', suffix: 'o curso?', message: 'Como posso antecipar minha formatura?' });
		starters.push({ prefix: 'Tem como', badge: 'reduzir', suffix: 'a carga global?', message: 'Tem como reduzir a carga de créditos do meu plano?' });

		const uniqueStarters = Array.from(new Map(starters.map(item => [item.message, item])).values());
		return uniqueStarters.slice(0, 4);
	});

	function onSend(msg: string) {
		planoFormaturaStore.enviarMensagem(msg);
	}
</script>

<ChatPanel
	messages={planoFormaturaStore.chatMessages}
	loading={planoFormaturaStore.chatLoading}
	{promptStarters}
	{nomesMaterias}
	draggable={true}
	title="Darcy AI"
	assistantName="Darcy AI"
	placeholder="Ex: Adie Física 1 para o próximo semestre..."
	{onSend}
>
	{#snippet emptyState()}
		<div class="w-16 h-16 rounded-3xl bg-pink-500/10 border border-pink-500/50 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(236,72,153,0.15)] backdrop-blur-md shrink-0">
			<Bot class="h-8 w-8 text-pink-600 dark:text-pink-400" />
		</div>
		<h3 class="text-xl font-semibold text-foreground tracking-tight">Pergunte à nossa IA</h3>
		<p class="text-[12px] text-muted-foreground mt-2 max-w-[280px] leading-relaxed">
			Dica: Eu posso <span class="font-bold text-indigo-700 dark:text-indigo-200 dark:drop-shadow-[0_0_6px_rgba(129,140,248,0.8)]">adiar</span>, <span class="font-bold text-indigo-700 dark:text-indigo-200 dark:drop-shadow-[0_0_6px_rgba(129,140,248,0.8)]">antecipar</span> ou <span class="font-bold text-indigo-700 dark:text-indigo-200 dark:drop-shadow-[0_0_6px_rgba(129,140,248,0.8)]">remanejar</span> qualquer disciplina do seu plano. Pode pedir!
		</p>
	{/snippet}
</ChatPanel>
