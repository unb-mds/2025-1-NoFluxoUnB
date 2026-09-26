<script lang="ts">
	import type { MateriaModel } from '$lib/types/materia';
	import {
		SubjectStatusEnum,
		canBeTaken,
		hasPrerequisites,
		isOptativa,
		type SubjectStatusValue
	} from '$lib/types/materia';
	import { satisfazPreRequisitos } from '$lib/types/curso';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import {
		getDirectDependentCodes,
		getDirectPrerequisiteAndCoreqCodes,
		getSubjectChain
	} from '$lib/utils/curriculum-graph';
	import MateriaNaturezaBadge from '$lib/components/materia/MateriaNaturezaBadge.svelte';

	interface Props {
		materia: MateriaModel;
		/** Optativa colocada manualmente no fluxograma (badge). */
		showOptBadge?: boolean;
		/** Abrir modal de detalhes (nome evita conflito com `onclick` do Svelte no `<button>`) */
		onOpenDetails?: () => void;
		/** Abre o diálogo de cadeia topológica da matéria. */
		onOpenChain?: () => void;
		onlongpress?: () => void;
	}

	let { materia, showOptBadge = false, onOpenDetails, onOpenChain, onlongpress }: Props = $props();

	const store = fluxogramaStore;
	/** Garante re-render ao mudar histórico / optativas (store em .svelte.ts). */
	let status = $derived.by(() => {
		void store.diagramLayoutRevision;
		void store.userFluxograma;
		return store.getSubjectStatus(materia);
	});
	let userData = $derived.by(() => {
		void store.diagramLayoutRevision;
		void store.userFluxograma;
		return store.getSubjectUserData(materia.codigoMateria);
	});
	let concluidaPorEquivalencia = $derived(
		status === SubjectStatusEnum.COMPLETED && userData?.tipoDado === 'equivalencia'
	);
	/**
	 * Etiqueta de optativa: vale para qualquer optativa (tipo_natureza=1 no
	 * SIGAA), inclusive as que têm nível na matriz (ex.: Qualidade de Software 2
	 * no 7º nível) — antes só planejadas/extras ganhavam a tag.
	 */
	/**
	 * Módulo livre: componente cursado FORA da matriz do curso (monitoria,
	 * eletiva de outro curso — os itens "#" do SIGAA). Esses cards são
	 * sintetizados pelo store com idMateria negativo; classificá-los como
	 * optativa estava errado.
	 */
	let ehModuloLivre = $derived(materia.idMateria < 0);
	let ehOptativa = $derived(!ehModuloLivre && (showOptBadge || isOptativa(materia)));
	/** "Optatória": optativa exigida como pré-requisito de obrigatória. */
	let obrigatoriasQueExigem = $derived(
		store.optatorias.get(materia.codigoMateria.trim().toUpperCase()) ?? []
	);
	let ehOptatoria = $derived(ehOptativa && obrigatoriasQueExigem.length > 0);
	/** Etiqueta de natureza a renderizar; 'obrigatoria' não rende nada. */
	let naturezaBadge: 'obrigatoria' | 'optativa' | 'modulo_livre' | 'optatoria' = $derived(
		ehModuloLivre ? 'modulo_livre' : ehOptatoria ? 'optatoria' : ehOptativa ? 'optativa' : 'obrigatoria'
	);
	/** Nomes das obrigatórias que exigem esta optatória (tooltip legível). */
	let nomesQueExigem = $derived(
		obrigatoriasQueExigem.map(
			(cod) =>
				store.state.courseData?.materias.find(
					(m) => m.codigoMateria.trim().toUpperCase() === cod.trim().toUpperCase()
				)?.nomeMateria ?? cod
		)
	);

	/** Aproveitamento de estudos (CUMP no SIGAA): disciplina ganha sem cursar aqui. */
	let concluidaPorAproveitamento = $derived(
		status === SubjectStatusEnum.COMPLETED &&
			userData?.tipoDado !== 'equivalencia' &&
			String(userData?.status ?? '').toUpperCase() === 'CUMP'
	);
	let destaqueReprovacao = $derived.by(() => {
		const st = String(userData?.status ?? '').toUpperCase();
		return st === 'REP' || st === 'REPF' || st === 'REPMF';
	});

	let isSelected = $derived(store.state.selectedSubjectCode === materia.codigoMateria);
	let connectionsEnabled = $derived(store.state.connectionMode !== 'off');
	/** No modo "Todas", desktop usa clique para fixar foco (como 1º toque no mobile); hover usa só pré-visualização */
	let isAllConnectionsMode = $derived(store.state.connectionMode === 'all');
	let isDirectConnectionsMode = $derived(store.state.connectionMode === 'direct');
	/** Cadeia: pré-requisitos e desbloqueios transitivos (a matéria toda até o foco). */
	let isChainConnectionsMode = $derived(store.state.connectionMode === 'chain');

	/** Matéria sob a qual calculamos as liberadas diretas (1 nível no grafo da grade). */
	let focusSubjectCode = $derived.by(() => {
		void store.state.hoverPreviewSubjectCode;
		void store.state.hoveredSubjectCode;
		const p = store.state.hoverPreviewSubjectCode?.trim();
		const h = store.state.hoveredSubjectCode?.trim();
		return p || h || null;
	});

	/** Isolamento visual da cadeia só quando conexões estão visíveis. */
	let chainHighlightActive = $derived(connectionsEnabled && focusSubjectCode !== null);

	/** Só as liberadas DIRETAS (1 nível) — cadeia transitiva fica no roadmap/ficha. */
	let directDependents = $derived.by(() => {
		void store.state.hoverPreviewSubjectCode;
		void store.state.hoveredSubjectCode;
		const curso = store.state.courseData;
		const focus = focusSubjectCode;
		if (!curso || !focus) return null;
		return getDirectDependentCodes(curso, focus);
	});

	/**
	 * No modo "Todas", o hover realça também as setas que ENTRAM no foco
	 * (pré-requisitos) e as de co-requisito (isLineRelatedToHovered em
	 * PrerequisiteConnections); os cards nessas pontas não podem esmaecer.
	 */
	let allModeInboundNeighbors = $derived.by(() => {
		void store.state.hoverPreviewSubjectCode;
		void store.state.hoveredSubjectCode;
		const curso = store.state.courseData;
		const focus = focusSubjectCode;
		if (!isAllConnectionsMode || !curso || !focus) return null;
		return getDirectPrerequisiteAndCoreqCodes(curso, focus);
	});

	/** Cadeia: pré-requisitos + desbloqueios + co-requisitos transitivos (mesma fonte das setas). */
	let subjectChain = $derived.by(() => {
		void store.state.hoverPreviewSubjectCode;
		void store.state.hoveredSubjectCode;
		const curso = store.state.courseData;
		const focus = focusSubjectCode;
		if (!isChainConnectionsMode || !curso || !focus) return null;
		return getSubjectChain(curso, focus);
	});

	let highlightRole = $derived.by(() => {
		const focus = focusSubjectCode;
		if (!focus) return null;
		const self = materia.codigoMateria.trim().toUpperCase();

		if (isChainConnectionsMode) {
			const chain = subjectChain;
			if (!chain) return null;
			if (self === chain.focusCode) return 'focus' as const;
			if (chain.descendants.has(self)) return 'descendant' as const;
			if (chain.precursors.has(self)) return 'precursor' as const;
			if (chain.corequisites.has(self)) return 'corequisite' as const;
			return null;
		}

		const deps = directDependents;
		if (!deps) return null;
		if (self === focus.trim().toUpperCase()) return 'focus' as const;
		if (deps.has(self)) return 'descendant' as const;
		const inbound = allModeInboundNeighbors;
		if (inbound?.precursors.has(self)) return 'precursor' as const;
		if (inbound?.corequisites.has(self)) return 'corequisite' as const;
		return null;
	});

	// Prerequisite indicator: count dependents
	let dependentCount = $derived.by(() => {
		if (!store.state.courseData) return 0;
		return getDirectDependentCodes(store.state.courseData, materia.codigoMateria).size;
	});

	let hasPrereqs = $derived(hasPrerequisites(materia));
	/** Igual a determineSubjectStatus: prioriza pre_requisitos do curso (incl. requisito fora da grade + equivalência). */
	let prereqsCompleted = $derived.by(() => {
		const curso = store.state.courseData;
		const rows = curso?.preRequisitos?.filter((pr) => pr.idMateria === materia.idMateria) ?? [];
		if (rows.length > 0) {
			return satisfazPreRequisitos(rows, store.completedCodes);
		}
		if (!hasPrerequisites(materia)) return true;
		return canBeTaken(materia, store.completedCodes);
	});

	/**
	 * Superfície por status. Light (padrão): fundo pastel + faixa esquerda de 4px
	 * + texto escuro na cor do status (≥ 4,5:1). Dark: os preenchimentos sólidos
	 * históricos, sem faixa (border-l volta a 1px e herda a cor da borda).
	 */
	const surfaceMap: Record<SubjectStatusValue, string> = {
		[SubjectStatusEnum.COMPLETED]:
			'bg-emerald-50 text-emerald-800 border-l-emerald-600 dark:bg-[#1f7a43] dark:text-foreground',
		[SubjectStatusEnum.IN_PROGRESS]:
			'bg-violet-50 text-violet-800 border-l-violet-600 dark:bg-[#6b2fcf] dark:text-foreground',
		[SubjectStatusEnum.AVAILABLE]:
			'bg-amber-50 text-amber-800 border-l-amber-600 dark:bg-[#a8671a] dark:text-foreground',
		[SubjectStatusEnum.FAILED]:
			'bg-red-50 text-red-800 border-l-red-600 dark:bg-[#991b1b] dark:text-foreground',
		[SubjectStatusEnum.LOCKED]:
			'bg-muted text-muted-foreground border-l-border-strong dark:bg-[#161625] dark:text-foreground/80',
		[SubjectStatusEnum.NOT_STARTED]:
			'bg-muted text-muted-foreground border-l-border-strong dark:bg-[#161625] dark:text-foreground/80'
	};

	let cardClasses = $derived.by(() => {
		const surface = surfaceMap[status];
		// border-l-4 só no light; no dark o `dark:border-l` devolve 1px e a cor da faixa
		// é sobrescrita pelo shorthand/longhand de borda de cada estado abaixo.
		const base = `subject-card relative flex w-full max-w-[220px] min-w-0 flex-col text-left cursor-pointer rounded-xl border border-l-4 p-2.5 transition-[opacity,box-shadow,border-color] duration-300 sm:max-w-[240px] dark:border-l`;
		if (isSelected) {
			return `${base} ${surface} border-primary/60 ring-2 ring-primary/30 opacity-100 dark:border-foreground/60 dark:ring-foreground/30`;
		}
		let borderExtras = 'border-border dark:border-foreground/10';
		if (destaqueReprovacao) {
			borderExtras =
				'border-red-500/70 ring-2 ring-red-500/35 shadow-md shadow-red-700/20 dark:border-red-300/85 dark:ring-red-400/45';
		}
		const role = highlightRole;
		// Cores alinhadas a CHAIN_VISUAL via tokens --chain-* (app.css); light usa tons 600.
		if (role === 'focus') {
			borderExtras = 'border-chain-core/80 ring-2 ring-chain-core/35 shadow-md dark:border-l-chain-core/80';
		} else if (role === 'precursor') {
			borderExtras = 'border-chain-pre/80 ring-2 ring-chain-pre/35 shadow-md dark:border-l-chain-pre/80';
		} else if (role === 'descendant') {
			borderExtras = 'border-chain-desc/80 ring-2 ring-chain-desc/35 shadow-md dark:border-l-chain-desc/80';
		} else if (role === 'corequisite') {
			borderExtras = 'border-chain-core/80 ring-2 ring-chain-core/[0.32] shadow-md dark:border-l-chain-core/80';
		}
		const dimmed =
			chainHighlightActive && role === null
				? 'opacity-[0.14] saturate-[0.35]'
				: 'opacity-100';
		return `${base} ${surface} ${borderExtras} ${dimmed}`;
	});

	// Track if this is a touch device interaction
	let isTouchInteraction = $state(false);

	function handleMouseEnter() {
		if (isTouchInteraction) return;
		if (isAllConnectionsMode) {
			store.setHoverPreviewSubject(materia.codigoMateria);
		} else {
			store.setHoveredSubject(materia.codigoMateria);
		}
	}

	function handleMouseLeave() {
		if (isTouchInteraction) return;
		if (isAllConnectionsMode) {
			store.setHoverPreviewSubject(null);
		} else {
			store.setHoveredSubject(null);
		}
	}

	// Long-press and drag detection for mobile
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let didLongPress = false;
	let startX = 0;
	let startY = 0;
	let didDrag = false;
	const DRAG_THRESHOLD = 10; // pixels
	const LONG_PRESS_MS = 400; // reduzido para mobile

	function handleTouchStart(e: TouchEvent) {
		isTouchInteraction = true;
		didLongPress = false;
		didDrag = false;

		const touch = e.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;

		longPressTimer = setTimeout(() => {
			didLongPress = true;
			store.setHoveredSubject(materia.codigoMateria);
			// Mobile: toque longo abre o roadmap/cadeia topológica da disciplina.
			onOpenChain?.();
		}, LONG_PRESS_MS);
	}

	function handleTouchMove(e: TouchEvent) {
		if (longPressTimer) {
			const touch = e.touches[0];
			const deltaX = Math.abs(touch.clientX - startX);
			const deltaY = Math.abs(touch.clientY - startY);

			if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
				didDrag = true;
			}
		}
	}

	function handleTouchEnd() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}

		if (!didDrag && !didLongPress) {
			// Tap rápido (mobile):
			// 1º toque seleciona/destaca as liberadas diretas; 2º toque na mesma matéria abre detalhes.
			if (connectionsEnabled) {
				const current = (store.state.hoveredSubjectCode ?? '').trim().toUpperCase();
				const mine = materia.codigoMateria.trim().toUpperCase();
				if (current === mine) {
					onOpenDetails?.();
				} else {
					store.setHoveredSubject(materia.codigoMateria);
				}
			} else {
				store.setHoveredSubject(null);
				onOpenDetails?.();
			}
		}

		didLongPress = false;
		didDrag = false;

		setTimeout(() => {
			isTouchInteraction = false;
		}, 300);
	}

	function handleTouchCancel() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		didLongPress = false;
		didDrag = false;
		setTimeout(() => {
			isTouchInteraction = false;
		}, 300);
	}

	// Desktop pointer events (for right-click context menu and normal click)
	function handleClick(e: MouseEvent) {
		if (isTouchInteraction) return;
		void e;
		// Desktop: clique esquerdo abre a ficha da matéria.
		onOpenDetails?.();
	}

	function handleDoubleClick() {
		if (isTouchInteraction) return;
		if (!connectionsEnabled) return;
		onOpenDetails?.();
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		if (onOpenChain) {
			onOpenChain();
			return;
		}
		onlongpress?.();
	}
</script>

<button
	class={cardClasses}
	data-subject-code={materia.codigoMateria}
	style="touch-action: manipulation;"
	onclick={handleClick}
	ondblclick={handleDoubleClick}
	oncontextmenu={handleContextMenu}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	ontouchcancel={handleTouchCancel}
	tabindex="0"
>
	<div class="mb-1 flex shrink-0 items-center justify-between gap-1">
		<span class="text-[length:clamp(11px,5.8cqw,13.5px)] font-semibold uppercase tracking-wider opacity-100">
			{materia.codigoMateria}
		</span>
		<div class="flex items-center gap-1">
			<span class="rounded-md bg-foreground/[0.08] px-1.5 py-0.5 text-[length:clamp(10px,5.2cqw,12px)] font-bold opacity-90 dark:bg-background/25">
				{materia.creditos}cr
			</span>
		</div>
	</div>
	<!-- Bloco do nome com altura fixa: não estica o card; nome completo no tooltip -->
	<div class="h-[2.5rem] shrink-0 overflow-hidden">
		<p
			class="line-clamp-2 break-words text-[length:clamp(11px,6.2cqw,14px)] font-semibold leading-[1.25]"
			title={materia.nomeMateria}
		>
			{materia.nomeMateria}
		</p>
	</div>

	{#if highlightRole === 'focus' && chainHighlightActive && directDependents}
		<p class="mt-1 text-[length:clamp(9px,4.8cqw,11px)] font-medium leading-snug dark:opacity-75" aria-live="polite">
			libera {directDependents.size}
		</p>
	{/if}

	<!-- Etiquetas no canto inferior direito: natureza (opt./optatória) empilha
	     com a de conquista (equiv./aprov.) quando o card tem as duas. -->
	{#if ehModuloLivre || ehOptatoria || ehOptativa || concluidaPorEquivalencia || concluidaPorAproveitamento}
		<div class="absolute right-0 -bottom-1.5 flex items-center gap-0.5" style="--materia-badge-fs: clamp(9px, 5cqw, 11px)">
			<MateriaNaturezaBadge natureza={naturezaBadge} {nomesQueExigem} />
			{#if concluidaPorEquivalencia}
				<span
					class="rounded bg-primary px-1.5 py-0.5 text-[length:clamp(9px,5cqw,11px)] font-medium text-primary-foreground dark:bg-purple-500/90"
					title="Concluída por equivalência"
				>equiv.</span>
			{:else if concluidaPorAproveitamento}
				<!-- Dark: branco com texto escuro (o esmeralda sumia sobre o card verde de Aprovado).
				     Light: invertido — verde escuro sólido sobre o card pastel. -->
				<span
					class="rounded bg-emerald-800 px-1.5 py-0.5 text-[length:clamp(9px,5cqw,11px)] font-semibold text-emerald-50 dark:bg-foreground/95 dark:text-emerald-900"
					title="Aproveitamento de estudos: componente ganho por disciplina de outra instituição/curso"
				>aprov.</span>
			{/if}
		</div>
	{/if}

	<!-- Prerequisite indicator badge -->
	{#if !store.state.isAnonymous && (hasPrereqs || dependentCount > 0)}
		<div class="absolute left-0 -bottom-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[length:clamp(9px,5cqw,11px)] font-bold {prereqsCompleted ? 'bg-emerald-700 text-emerald-50 dark:bg-green-500/72 dark:text-foreground/95' : 'bg-amber-700 text-amber-50 dark:bg-amber-500/72 dark:text-foreground/95'}">
			{#if hasPrereqs}
				<span>{prereqsCompleted ? '✓' : '!'}</span>
			{/if}
			{#if dependentCount > 0}
				<span class="border-l border-current/30 pl-0.5">{dependentCount}</span>
			{/if}
		</div>
	{/if}

</button>

<style>
	:global(.subject-card) {
		/* Card é container de tamanho: os textos internos escalam em cqw junto com a largura */
		container-type: inline-size;
		/* Light: sombra discreta (≤ 0,06), sem filetes internos */
		box-shadow:
			0 1px 2px hsl(var(--foreground) / 0.04),
			0 2px 8px hsl(var(--foreground) / 0.06);
	}

	/* Dark: receita histórica, verbatim */
	:global(.dark .subject-card) {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.14),
			inset 1px 0 0 rgba(255, 255, 255, 0.06),
			inset 0 -1px 0 rgba(0, 0, 0, 0.28),
			0 3px 10px rgba(0, 0, 0, 0.36);
	}

	:global(.subject-card:hover) {
		filter: brightness(1.035) saturate(1.03);
	}
</style>
