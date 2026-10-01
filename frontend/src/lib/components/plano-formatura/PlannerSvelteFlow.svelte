<script lang="ts">
	import { SvelteFlow, Background, Controls, type Node, type Edge, Position, MarkerType } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { browser } from '$app/environment';
	import { resolvedTheme } from '$lib/stores/theme';
	import type { PlanoFormatura } from '$lib/types/plano-formatura';
	import type { CursoModel } from '$lib/types/curso';
	import { getCodigosFromExpressaoLogica } from '$lib/utils/expressao-logica';
	import SvelteFlowMateriaNode from './SvelteFlowMateriaNode.svelte';
	import SvelteFlowHeaderNode from './SvelteFlowHeaderNode.svelte';
	import type { MateriaPlano } from '$lib/types/plano-formatura';

	interface Props {
		plano: PlanoFormatura;
		curso: CursoModel | null;
		materiasMATR?: MateriaPlano[];
		semestreAtual?: number;
		onChatAction?: (msg: string) => void;
		displayUnit?: 'creditos' | 'horas';
	}

	let { plano, curso, materiasMATR = [], semestreAtual = 1, onChatAction, displayUnit = 'creditos' }: Props = $props();

	// Registra o custom node
	const nodeTypes = {
		materia: SvelteFlowMateriaNode,
		header: SvelteFlowHeaderNode
	};

	/**
	 * Modo toque (celular/tablet).
	 *
	 * O filtro do d3-zoom que o xyflow instala descarta `touchstart` quando
	 * `panOnDrag` é falso (@xyflow/system, createFilter) — por isso `panOnDrag`
	 * fica ligado nos dois modos:
	 *   - no toque, é ele que libera o arraste com um dedo e a pinça;
	 *   - no desktop, é ele que faz arrastar o fundo mover o canvas. Antes estava
	 *     falso e o mouse não movia nada: a roda era a única navegação.
	 * Complementos do modo toque:
	 *   - `nodesDraggable=false` faz o arraste sobre um card pan o canvas em vez
	 *     de sair arrastando a matéria — no dedo não dá pra mirar o vão entre cards.
	 * A rolagem vertical da página é devolvida ao navegador pelo `touch-action:
	 * pan-y` no pane (ver a folha de estilo no fim do arquivo); `preventScrolling`
	 * só alcança a roda, que aqui já nem é capturada.
	 */
	function detectaToque(): boolean {
		if (!browser) return false;
		return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 1024;
	}

	let modoToque = $state(detectaToque());

	// Tema efetivo: `colorMode` do xyflow e o fundo do <Background> são props, não
	// CSS, então precisam do tema resolvido. Cores de aresta/seta e as variáveis
	// --xy-* ficam no bloco de estilo do componente: trocam pelo cascade quando .dark muda no
	// <html>, sem reconstruir o grafo.
	const isDark = $derived($resolvedTheme === 'dark');

	$effect(() => {
		if (!browser) return;
		const onResize = () => (modoToque = detectaToque());
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	let nodes = $state<Node[]>([]);
	let edges = $state<Edge[]>([]);

	// Configuração do layout
	const COLUMN_WIDTH = 400; // Aumentado para dar mais respiro horizontal
	const ROW_HEIGHT = 160;   // Aumentado para dar respiro vertical entre os cards
	const START_X = 50;
	const START_Y = 120;

	$effect(() => {
		if (!plano || !plano.plano) return;
		
		const newNodes: Node[] = [];
		const newEdges: Edge[] = [];
		const codeToNodeId = new Map<string, string>();

		let currentColumnIndex = 0;

		/*
		 * Sem matrícula (MATR) no semestre corrente, o semestre corrente ainda está
		 * livre e é ele que o plano preenche — ex.: início de período, matrículas
		 * ainda não publicadas. Espelha `offsetSemestre` em
		 * backend/src/services/plano_formatura.service.ts (~L1086), que já
		 * gera os rótulos de período assim; só a numeração ordinal aqui somava 1
		 * incondicionalmente e "queimava" um semestre que nem começou.
		 */
		const temMATR = Boolean(materiasMATR && materiasMATR.length > 0);
		const offsetSemestre = temMATR ? 1 : 0;

		// Projeção de integralização: acumula as horas da matriz já vencidas e as de
		// cada coluna, mostrando no cabeçalho quantos % o aluno terá integralizado ao
		// fim daquele semestre. Slots genéricos (optativa/complementar) contam pelo ch.
		const integ = 'integralizacao' in plano ? plano.integralizacao : undefined;
		const horasDoSemestre = (s: (typeof plano.plano)[number]): number =>
			s._horasInternas ??
			s.materias.reduce(
				(acc, m) => acc + ('codigo' in m ? (m.creditos ?? 4) * 15 : m.ch),
				0
			);
		const pctIntegralizado = (horas: number): string | undefined =>
			integ && integ.horasExigidasTotal > 0
				? `~${Math.min(100, Math.round((horas / integ.horasExigidasTotal) * 100))}% integralizado`
				: undefined;
		let horasAcumuladas = integ?.horasIntegralizadas ?? 0;

		// 1. Renderiza a coluna do semestre ATUAL (materias matriculadas) se houver
		if (temMATR) {
			const xPos = START_X + (currentColumnIndex * COLUMN_WIDTH);

			horasAcumuladas += integ?.horasEmCurso ?? 0;
			newNodes.push({
				id: 'header-matr',
				type: 'header',
				position: { x: xPos, y: START_Y - 100 },
				data: {
					label: `Semestre ${semestreAtual} (Em Curso)`,
					sublabel: pctIntegralizado(horasAcumuladas)
				},
				draggable: false,
				selectable: false
			});

			materiasMATR.forEach((item, rowIndex) => {
				if ('codigo' in item) {
					const yPos = START_Y + (rowIndex * ROW_HEIGHT);
					const nodeId = `node-${item.codigo}`;
					codeToNodeId.set(item.codigo, nodeId);
					
					newNodes.push({
						id: nodeId,
						type: 'materia',
						position: { x: xPos, y: yPos },
						data: { materia: item, tipoSemestre: 'estimado', onChatAction, displayUnit }
					});
				}
			});
			currentColumnIndex++;
		}

		// 2. Criar Nodes para os semestres futuros do plano
		plano.plano.forEach((semestre, index) => {
			const xPos = START_X + (currentColumnIndex * COLUMN_WIDTH);
			
			const numeroSemestre = semestreAtual + index + offsetSemestre;

			// Sem MATR, a primeira coluna é o próprio semestre corrente — deixa explícito
			// em vez de anunciá-la como um semestre futuro "recomendado".
			const rotuloTipo =
				!temMATR && index === 0
					? 'Semestre atual'
					: semestre.tipo === 'recomendado'
						? 'Recomendado'
						: 'Estimado';

			// Renderiza um cabeçalho pro semestre
			const semestreStr = semestre.semestre ? ` (${semestre.semestre})` : '';
			horasAcumuladas += horasDoSemestre(semestre);
			newNodes.push({
				id: `header-${semestre.indice}`,
				type: 'header',
				position: { x: xPos, y: START_Y - 100 },
				data: {
					label: `Semestre ${numeroSemestre}${semestreStr} — ${rotuloTipo}`,
					sublabel: pctIntegralizado(horasAcumuladas)
				},
				draggable: false,
				selectable: false
			});

			semestre.materias.forEach((item, rowIndex) => {
				if ('codigo' in item) {
					const yPos = START_Y + (rowIndex * ROW_HEIGHT);
					const nodeId = `node-${item.codigo}`;
					codeToNodeId.set(item.codigo, nodeId);
					
					newNodes.push({
						id: nodeId,
						type: 'materia',
						position: { x: xPos, y: yPos },
						data: { materia: item, tipoSemestre: semestre.tipo, onChatAction, displayUnit }
					});
				}
			});
			currentColumnIndex++;
		});

		// 2. Arestas: cada matéria conecta a TODOS os pré/co-requisitos presentes no
		// diagrama. A expressão pode ser composta — ((A E B) OU C) — então os códigos
		// vêm da expressão inteira, não de um único campo: reduzir ao primeiro código
		// perdia setas (FGA0244 exige FGA0211 E FGA0030; só FGA0211 aparecia) e errava
		// quando a primeira alternativa nem estava no plano (FGA0147 vs FGA0146 nova).
		if (curso) {
			const normCod = (c: string) => c.trim().toUpperCase();
			// codeToNodeId usa códigos normalizados do backend; espelha para o lookup.
			const nodePorCodigo = new Map(
				[...codeToNodeId].map(([cod, id]) => [normCod(cod), id])
			);
			const materiaPorCodigo = new Map(
				curso.materias.map((m) => [normCod(m.codigoMateria), m])
			);
			const edgeIds = new Set<string>();

			const pushEdge = (sourceNodeId: string, targetNodeId: string, coreq: boolean) => {
				const id = `edge-${coreq ? 'co-' : ''}${sourceNodeId}-${targetNodeId}`;
				if (edgeIds.has(id) || sourceNodeId === targetNodeId) return;
				edgeIds.add(id);
				// Custom properties por tema definidas no bloco de estilo (--planner-edge*): o
				// id do marker embute a string, e `var()` é aceito tanto no `style` da
				// aresta quanto no style:stroke/fill do <marker>.
				const cor = coreq ? 'var(--planner-edge-coreq)' : 'var(--planner-edge)';
				newEdges.push({
					id,
					source: sourceNodeId,
					target: targetNodeId,
					type: 'smoothstep',
					animated: !coreq,
					label: coreq ? 'co-req' : undefined,
					style: `stroke: ${cor}; stroke-width: 2;${coreq ? ' stroke-dasharray: 6 4;' : ''}`,
					markerEnd: { type: MarkerType.ArrowClosed, color: cor }
				});
			};

			// Códigos exigidos por uma linha de requisito: expressão completa quando
			// existir, senão o código simples resolvido pelo factory.
			const codigosDaLinha = (
				expressao: Parameters<typeof getCodigosFromExpressaoLogica>[0],
				codigoSimples: string | undefined
			): string[] => {
				const daExpressao = getCodigosFromExpressaoLogica(expressao);
				const base = daExpressao.length > 0 ? daExpressao : codigoSimples ? [codigoSimples] : [];
				return base.map(normCod);
			};

			for (const [codigo, targetNodeId] of codeToNodeId) {
				const materia = materiaPorCodigo.get(normCod(codigo));
				if (!materia) continue; // fora da matriz (módulo livre/equivalente): sem linhas próprias

				for (const pr of curso.preRequisitos) {
					if (pr.idMateria !== materia.idMateria) continue;
					for (const cod of codigosDaLinha(pr.expressaoLogica, pr.codigoMateriaRequisito)) {
						const sourceNodeId = nodePorCodigo.get(cod);
						if (sourceNodeId) pushEdge(sourceNodeId, targetNodeId, false);
					}
				}

				for (const co of curso.coRequisitos ?? []) {
					if (co.idMateria !== materia.idMateria) continue;
					for (const cod of codigosDaLinha(co.expressaoLogica, co.codigoMateriaCoRequisito)) {
						const sourceNodeId = nodePorCodigo.get(cod);
						if (sourceNodeId) pushEdge(sourceNodeId, targetNodeId, true);
					}
				}
			}
		}

		nodes = newNodes;
		edges = newEdges;
	});
</script>

<div
	class="planner-flow relative h-[68dvh] min-h-[360px] w-full overflow-hidden rounded-xl border border-border bg-background lg:h-full lg:min-h-[600px] dark:bg-[#090c12]"
	class:modo-toque={modoToque}
>
	<!--
		Sem `fitView`: encaixar o plano inteiro na largura do celular levava a escala
		a ~0.32 num plano de 3 semestres (e ao piso de 0.15 num plano real de 6+),
		deixando o card com 83x51px e os botões de ação com 25x9px — alvo de toque
		impossível de acertar, e o dedo acabava no pane, que só panorâmica. Começar
		em zoom 1 mantém o card no tamanho de leitura (uma coluna por vez, que é o
		padrão certo no celular); a visão geral continua a um pinça ou no botão de
		fit dos Controls. `minZoom` sobe de 0.15 para 0.25 para a pinça não colapsar
		tudo em confete ilegível.
		A roda do mouse não é capturada (`panOnScroll`/`zoomOnScroll` falsos, sem
		`preventScrolling` no desktop): ela rola a página, como o resto do site.
		Zoom no desktop fica nos Controls e no ctrl+roda / pinça do trackpad.
	-->
	<SvelteFlow
		{nodes}
		{edges}
		{nodeTypes}
		minZoom={modoToque ? 0.25 : 0.3}
		maxZoom={2}
		fitView={false}
		initialViewport={modoToque ? { x: 16, y: 16, zoom: 1 } : { x: 20, y: 20, zoom: 0.8 }}
		panOnScroll={false}
		zoomOnScroll={false}
		preventScrolling={modoToque}
		panOnDrag={true}
		nodesDraggable={!modoToque}
		zoomOnPinch={true}
		selectionOnDrag={false}
		zoomOnDoubleClick={false}
		defaultEdgeOptions={{ type: 'smoothstep' }}
		colorMode={isDark ? 'dark' : 'light'}
	>
		<Background
			bgColor={isDark ? '#090c12' : 'hsl(var(--background))'}
			patternColor={isDark ? undefined : 'hsl(var(--border-strong) / 0.6)'}
		/>
		<Controls showLock={false} />
	</SvelteFlow>

	{#if modoToque}
		<p
			class="pointer-events-none absolute right-2 top-2 z-10 rounded-full border border-border bg-background/80 dark:bg-black/60 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur-sm"
		>
			Arraste na horizontal · pinça para zoom
		</p>
	{/if}
</div>

<style>
	/*
	 * Tema do canvas xyflow. `colorMode` só troca os *-default do @xyflow/svelte;
	 * aqui as variáveis --xy-* (fundo, nó, aresta, rótulo, minimap) são amarradas
	 * aos tokens no light. Cores das arestas/setas (--planner-edge*): foreground a
	 * 50% (≈3,4:1) e roxo IA a 70% (≈3,8:1) sobre o fundo claro — ≥ 3:1 (não-texto).
	 */
	.planner-flow :global(.svelte-flow) {
		--xy-background-color: hsl(var(--background));
		--xy-background-pattern-dots-color: hsl(var(--border-strong) / 0.6);
		--xy-edge-stroke: hsl(var(--foreground) / 0.5);
		--xy-edge-stroke-selected: hsl(var(--foreground) / 0.8);
		--xy-edge-label-background-color: hsl(var(--card));
		--xy-edge-label-color: hsl(var(--foreground));
		--xy-node-color: hsl(var(--card-foreground));
		--xy-node-border: 1px solid hsl(var(--border));
		--xy-node-background-color: hsl(var(--card));
		--xy-minimap-background-color: hsl(var(--card));
		--xy-minimap-mask-background-color: hsl(var(--background) / 0.7);
		--xy-minimap-node-background-color: hsl(var(--primary) / 0.35);
		--planner-edge: hsl(var(--foreground) / 0.5);
		--planner-edge-coreq: hsl(var(--ai) / 0.7);
	}
	/* Dark: valores históricos — defaults de `.svelte-flow.dark` (@xyflow/svelte 1.6),
	   fundo #090c12 e as cores de aresta que estavam fixas no código. */
	:global(.dark) .planner-flow :global(.svelte-flow) {
		--xy-background-color: #090c12;
		--xy-background-pattern-dots-color: #777;
		--xy-edge-stroke: #3e3e3e;
		--xy-edge-stroke-selected: #727272;
		--xy-edge-label-background-color: #141414;
		--xy-edge-label-color: #f8f8f8;
		--xy-node-color: #f8f8f8;
		--xy-node-border: 1px solid #3c3c3c;
		--xy-node-background-color: #1e1e1e;
		--xy-minimap-background-color: #141414;
		--xy-minimap-mask-background-color: rgba(60, 60, 60, 0.6);
		--xy-minimap-node-background-color: #2b2b2b;
		--planner-edge: rgba(255, 255, 255, 0.2);
		--planner-edge-coreq: rgba(168, 85, 247, 0.45);
	}

	/* Botões dos Controls no tamanho mínimo de alvo de toque. */
	.modo-toque :global(.svelte-flow__controls-button) {
		width: 36px;
		height: 36px;
	}

	/*
	 * O xyflow marca o pane com `touch-action: none`, o que prendia o dedo: dentro
	 * do canvas nenhum arraste rolava a página, só panorâmica. Como o plano se
	 * estende em COLUNAS por semestre, o eixo que o canvas precisa é o horizontal
	 * — devolver o vertical ao navegador solta a página sem custo de navegação.
	 * A pinça continua com o canvas: `pan-y` não cede gestos de dois dedos.
	 * Para percorrer uma coluna alta, o aluno reduz o zoom (pinça ou Controls).
	 */
	.modo-toque :global(.svelte-flow__pane) {
		touch-action: pan-y;
	}

	/* Controls do xyflow com o acabamento do resto da UI em vez do painel padrão.
	   Light: card + borda 1px + sombra discreta (tokens). Dark: vidro escuro com
	   os valores históricos, mantidos via :global(.dark). */
	.planner-flow :global(.svelte-flow__controls) {
		overflow: hidden;
		border-radius: 12px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card) / 0.92);
		backdrop-filter: blur(12px);
		box-shadow: var(--nf-shadow-card-lg);
	}
	:global(.dark) .planner-flow :global(.svelte-flow__controls) {
		border-color: hsl(0 0% 100% / 0.1);
		background: hsl(222 30% 7% / 0.85);
		box-shadow:
			0 8px 30px hsl(0 0% 0% / 0.45),
			inset 0 1px 0 hsl(0 0% 100% / 0.06);
	}
	.planner-flow :global(.svelte-flow__controls-button) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		background: transparent;
		transition: background-color 0.15s ease;
	}
	:global(.dark) .planner-flow :global(.svelte-flow__controls-button) {
		border-bottom-color: hsl(0 0% 100% / 0.07);
	}
	.planner-flow :global(.svelte-flow__controls-button:last-child) {
		border-bottom: none;
	}
	.planner-flow :global(.svelte-flow__controls-button:hover) {
		background: hsl(var(--foreground) / 0.06);
	}
	.planner-flow :global(.svelte-flow__controls-button:active) {
		background: hsl(var(--foreground) / 0.1);
	}
	:global(.dark) .planner-flow :global(.svelte-flow__controls-button:hover) {
		background: hsl(0 0% 100% / 0.09);
	}
	:global(.dark) .planner-flow :global(.svelte-flow__controls-button:active) {
		background: hsl(0 0% 100% / 0.14);
	}
	.planner-flow :global(.svelte-flow__controls-button svg) {
		max-width: 12px;
		max-height: 12px;
		fill: hsl(var(--muted-foreground));
		transition: fill 0.15s ease;
	}
	.planner-flow :global(.svelte-flow__controls-button:hover svg) {
		fill: hsl(var(--foreground));
	}
	:global(.dark) .planner-flow :global(.svelte-flow__controls-button svg) {
		fill: hsl(0 0% 100% / 0.6);
	}
	:global(.dark) .planner-flow :global(.svelte-flow__controls-button:hover svg) {
		fill: hsl(0 0% 100% / 0.95);
	}
</style>
