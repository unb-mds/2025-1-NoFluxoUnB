<script lang="ts">
	/**
	 * Harness de depuração do toque no PlannerSvelteFlow.
	 * Monta o canvas com dados falsos, sem auth/backend, para isolar a
	 * configuração de pan/zoom do xyflow do resto da aplicação.
	 */
	import { onMount } from 'svelte';
	import PlannerSvelteFlow from '$lib/components/plano-formatura/PlannerSvelteFlow.svelte';
	import type { PlanoFormaturav2, MateriaPlano } from '$lib/types/plano-formatura';

	const mat = (codigo: string, nome: string, critica = false): MateriaPlano => ({
		codigo,
		nome,
		creditos: 4,
		critica,
		desbloqueia_direto: critica ? 3 : 0,
		desbloqueia_indireto: 0,
		motivo: 'Mock para teste de toque',
		dificuldadeEstimada: 6,
		motivoDificuldade: 'Mock'
	});

	const plano: PlanoFormaturav2 = {
		semestresRestantes: 3,
		formaturaEstimada: '2027.1',
		materiasNaoAlocadas: [],
		chObrigatoriaFaltante: 0,
		chOptativaFaltante: 0,
		chComplementarFaltante: 0,
		integralizacao: { horasIntegralizadas: 1800, horasEmCurso: 0, horasExigidasTotal: 3600 },
		plano: [
			{
				indice: 0,
				semestre: '2026.2',
				tipo: 'recomendado',
				creditos: 12,
				materias: [mat('FGA0211', 'Cálculo 1', true), mat('FGA0030', 'Algoritmos'), mat('CIC0110', 'Banco de Dados')]
			},
			{
				indice: 1,
				semestre: '2027.1',
				tipo: 'estimado',
				creditos: 8,
				materias: [mat('FGA0244', 'Engenharia de Software'), mat('FGA0147', 'Redes')]
			},
			{
				indice: 2,
				semestre: '2027.2',
				tipo: 'estimado',
				creditos: 8,
				materias: [mat('FGA0146', 'Compiladores'), mat('CIC0202', 'Sistemas Operacionais')]
			}
		]
	};

	// Espelha exatamente a heurística do componente.
	let coarse = $state(false);
	let largura = $state(0);
	let modoToqueEsperado = $derived(coarse || largura < 1024);

	let log = $state<string[]>([]);
	const push = (m: string) => (log = [m, ...log].slice(0, 14));

	onMount(() => {
		const medir = () => {
			coarse = window.matchMedia('(pointer: coarse)').matches;
			largura = window.innerWidth;
		};
		medir();
		window.addEventListener('resize', medir);

		const pane = () => document.querySelector('.svelte-flow__pane') as HTMLElement | null;
		const alvo = document.querySelector('.planner-flow') as HTMLElement | null;

		// Captura na fase de captura: vê o evento antes de qualquer handler do xyflow.
		const onTouchStart = (e: Event) => {
			const p = pane();
			push(
				`touchstart cap · alvo=${(e.target as HTMLElement)?.className?.toString().slice(0, 40)} · pane touch-action=${p ? getComputedStyle(p).touchAction : 'n/a'}`
			);
		};
		const onPointerDown = () => push('pointerdown');
		const onClick = (e: Event) => push(`click → ${(e.target as HTMLElement)?.tagName}`);

		alvo?.addEventListener('touchstart', onTouchStart, { capture: true });
		alvo?.addEventListener('pointerdown', onPointerDown, { capture: true });
		alvo?.addEventListener('click', onClick, { capture: true });

		return () => {
			window.removeEventListener('resize', medir);
			alvo?.removeEventListener('touchstart', onTouchStart, { capture: true });
			alvo?.removeEventListener('pointerdown', onPointerDown, { capture: true });
			alvo?.removeEventListener('click', onClick, { capture: true });
		};
	});
</script>

<div class="min-h-screen bg-background p-4 text-foreground">
	<h1 class="mb-2 text-lg font-bold">Harness — toque do planejador</h1>

	<div class="mb-3 rounded-lg border border-border bg-muted p-3 font-mono text-xs">
		<p>pointer:coarse = <strong data-testid="coarse">{coarse}</strong></p>
		<p>innerWidth = <strong data-testid="largura">{largura}</strong></p>
		<p>modoToque esperado = <strong data-testid="modo-toque">{modoToqueEsperado}</strong></p>
	</div>

	<!-- Conteúdo antes/depois para testar se a página rola com o dedo no canvas -->
	<div class="mb-3 h-40 rounded-lg bg-foreground/5 p-3 text-sm text-muted-foreground">bloco acima (rolagem)</div>

	<!-- Altura explícita: o componente usa lg:h-full, que precisa de pai com altura definida -->
	<div style="height: 600px">
		<PlannerSvelteFlow {plano} curso={null} semestreAtual={5} displayUnit="creditos" onChatAction={(m: string) => push(`chatAction: ${m}`)} />
	</div>

	<div class="mt-3 h-[60vh] rounded-lg bg-foreground/5 p-3 text-sm text-muted-foreground">bloco abaixo (rolagem)</div>

	<pre class="fixed bottom-2 left-2 right-2 z-[200] max-h-44 overflow-auto rounded-lg border border-border bg-card/95 p-2 text-[10px] leading-tight" data-testid="log">{log.join('\n')}</pre>
</div>
