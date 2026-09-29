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
	import { Check, Circle, CircleDashed, Clock, Lock, X } from 'lucide-svelte';
	import {
		PREREQ_BADGE,
		STATUS_CARD_BG,
		TAG_BADGE,
		statusTextAlpha,
		subjectCardAriaLabel
	} from './subject-card-colors';

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
	 * Status não pode depender só da cor (aprovado vs. disponível dá 1.18:1 de
	 * luminância): ícone ao lado do código + status no nome acessível.
	 */
	const statusIcon: Record<SubjectStatusValue, typeof Check> = {
		[SubjectStatusEnum.COMPLETED]: Check,
		[SubjectStatusEnum.IN_PROGRESS]: Clock,
		[SubjectStatusEnum.AVAILABLE]: Circle,
		[SubjectStatusEnum.FAILED]: X,
		[SubjectStatusEnum.LOCKED]: Lock,
		[SubjectStatusEnum.NOT_STARTED]: CircleDashed
	};
	let StatusIcon = $derived(statusIcon[status]);

	let showPrereqBadge = $derived(!store.state.isAnonymous && (hasPrereqs || dependentCount > 0));

	let ariaLabel = $derived.by(() => {
		const etiquetas: string[] = [];
		if (naturezaBadge === 'modulo_livre') etiquetas.push('módulo livre');
		else if (naturezaBadge === 'optatoria') etiquetas.push('optatória');
		else if (naturezaBadge === 'optativa') etiquetas.push('optativa');
		if (concluidaPorEquivalencia) etiquetas.push('concluída por equivalência');
		else if (concluidaPorAproveitamento) etiquetas.push('aproveitamento de estudos');
		return subjectCardAriaLabel({
			codigo: materia.codigoMateria,
			nome: materia.nomeMateria,
			creditos: materia.creditos,
			status,
			prereqsCompleted: showPrereqBadge && hasPrereqs ? prereqsCompleted : undefined,
			etiquetas
		});
	});

	let cardClasses = $derived.by(() => {
		const gradient = STATUS_CARD_BG[status].className;
		const base = `subject-card relative flex w-full max-w-[220px] min-w-0 flex-col text-left cursor-pointer rounded-xl border p-2.5 transition-[opacity,box-shadow,border-color] duration-300 sm:max-w-[240px]`;
		if (isSelected) {
			return `${base} ${gradient} border-white/60 ring-2 ring-white/30 opacity-100`;
		}
		let borderExtras = 'border-white/10';
		if (destaqueReprovacao) {
			borderExtras = 'border-red-300/85 ring-2 ring-red-400/45 shadow-md shadow-red-700/20';
		}
		const role = highlightRole;
		// Cores alinhadas a CHAIN_VISUAL (tailwind precisa do literal no fonte)
		if (role === 'focus') {
			borderExtras = 'border-[#7f9cf5]/80 ring-2 ring-[#7f9cf5]/35 shadow-md';
		} else if (role === 'precursor') {
			borderExtras = 'border-[#4fd1c5]/80 ring-2 ring-[#4fd1c5]/35 shadow-md';
		} else if (role === 'descendant') {
			borderExtras = 'border-[#f6ad55]/80 ring-2 ring-[#f6ad55]/35 shadow-md';
		} else if (role === 'corequisite') {
			borderExtras = 'border-[#7f9cf5]/80 ring-2 ring-[#7f9cf5]/32 shadow-md';
		}
		const dimmed =
			chainHighlightActive && role === null
				? 'opacity-[0.14] saturate-[0.35]'
				: 'opacity-100';
		return `${base} ${gradient} ${borderExtras} ${dimmed}`;
	});

	let textColor = $derived(statusTextAlpha(status) < 1 ? 'text-white/80' : 'text-white');

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
	aria-label={ariaLabel}
>
	<div class="mb-1 flex shrink-0 items-center justify-between gap-1">
		<span class="flex min-w-0 items-center gap-1 text-[length:clamp(11px,5.8cqw,13.5px)] font-semibold uppercase tracking-wider {textColor} opacity-100">
			<StatusIcon class="h-3 w-3 shrink-0" strokeWidth={2.75} aria-hidden="true" />
			{materia.codigoMateria}
		</span>
		<div class="flex items-center gap-1">
			<span class="rounded-md bg-black/25 px-1.5 py-0.5 text-[length:clamp(10px,5.2cqw,12px)] font-bold {textColor} opacity-90">
				{materia.creditos}cr
			</span>
		</div>
	</div>
	<!-- Bloco do nome com altura fixa: não estica o card; nome completo no tooltip -->
	<div class="h-[2.5rem] shrink-0 overflow-hidden">
		<p
			class="line-clamp-2 break-words text-[length:clamp(11px,6.2cqw,14px)] font-semibold leading-[1.25] {textColor}"
			title={materia.nomeMateria}
		>
			{materia.nomeMateria}
		</p>
	</div>

	{#if highlightRole === 'focus' && chainHighlightActive && directDependents}
		<p class="mt-1 text-[length:clamp(9px,4.8cqw,11px)] font-medium leading-snug text-white/75" aria-live="polite">
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
					class="rounded {TAG_BADGE.equivalencia.className} px-1.5 py-0.5 text-[length:clamp(9px,5cqw,11px)] font-medium"
					title="Concluída por equivalência"
				>equiv.</span>
			{:else if concluidaPorAproveitamento}
				<!-- Branco com texto escuro: o verde-esmeralda sumia sobre o card verde de Aprovado. -->
				<span
					class="rounded bg-zinc-50/95 px-1.5 py-0.5 text-[length:clamp(9px,5cqw,11px)] font-semibold text-emerald-900"
					title="Aproveitamento de estudos: componente ganho por disciplina de outra instituição/curso"
				>aprov.</span>
			{/if}
		</div>
	{/if}

	<!-- Prerequisite indicator badge -->
	{#if showPrereqBadge}
		<div class="absolute left-0 -bottom-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[length:clamp(9px,5cqw,11px)] font-bold text-white {prereqsCompleted ? PREREQ_BADGE.ok.className : PREREQ_BADGE.pending.className}">
			{#if hasPrereqs}
				<span>{prereqsCompleted ? '✓' : '!'}</span>
			{/if}
			{#if dependentCount > 0}
				<span class="border-l border-white/30 pl-0.5">{dependentCount}</span>
			{/if}
		</div>
	{/if}

</button>

<style>
	:global(.subject-card) {
		/* Card é container de tamanho: os textos internos escalam em cqw junto com a largura */
		container-type: inline-size;
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
