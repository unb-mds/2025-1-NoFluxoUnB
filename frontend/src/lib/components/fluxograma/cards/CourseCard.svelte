<script lang="ts">
	import type { MinimalCursoModel } from '$lib/types/curso';
	import { GraduationCap, BookOpen } from 'lucide-svelte';

	interface Props {
		curso: MinimalCursoModel;
		onclick?: () => void;
	}

	let { curso, onclick }: Props = $props();

	function formatTurno(turno: string | null | undefined): string {
		if (!turno) return '';
		const t = turno.toUpperCase();
		if (t === 'NOTURNO') return 'Noturno';
		if (t === 'DIURNO') return 'Diurno';
		return turno;
	}
</script>

<button
	class="course-card group relative mx-auto w-full min-w-0 max-w-xl overflow-hidden rounded-xl border border-primary/25 bg-card p-4 text-left shadow-nofluxo backdrop-blur-md transition-all duration-300 hover:scale-[1.01] hover:border-primary/50 hover:shadow-nofluxoLg sm:rounded-2xl sm:p-5 sm:hover:scale-[1.02] dark:border-purple-500/28 dark:bg-black/40 dark:shadow-[0_0_0_1px_rgba(168,85,247,0.12),0_0_12px_rgba(168,85,247,0.14),inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-purple-400/60 dark:hover:bg-black/55 dark:hover:shadow-[0_0_0_1px_rgba(196,134,255,0.26),0_0_20px_rgba(168,85,247,0.26),0_0_34px_rgba(147,51,234,0.14),inset_0_1px_0_rgba(255,255,255,0.12)]"
	{onclick}
>
	<!-- Gradient accent top bar -->
	<div
		class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-400/90 via-fuchsia-400/70 to-transparent opacity-75 transition-opacity group-hover:opacity-90"
	></div>

	<div class="mb-3 flex items-start justify-between gap-2">
		<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-foreground/5">
			<GraduationCap class="h-5 w-5 text-primary/90" />
		</div>
		<div class="flex items-center gap-2">
			{#if curso.status}
				<span class="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider {curso.status.toLowerCase() === 'ativa' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'}">
					{curso.status}
				</span>
			{/if}
			{#if curso.creditos}
				<span class="rounded-full border border-border bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
					{curso.creditos} cr
				</span>
			{/if}
		</div>
	</div>

	<h3 class="mb-1 line-clamp-2 text-sm font-semibold leading-tight text-foreground">
		{curso.nomeCurso}
	</h3>

	<!-- Tipo do curso e turno em destaque (quando existir) -->
	{#if curso.tipoCurso || curso.turno}
		<p class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground/85">
			{#if curso.tipoCurso}
				<span class="font-medium text-foreground/80">{curso.tipoCurso}</span>
			{/if}
			{#if curso.tipoCurso && curso.turno}
				<span class="text-muted-foreground/60">·</span>
			{/if}
			{#if curso.turno}
				<span class="font-medium text-primary/90">{formatTurno(curso.turno)}</span>
			{/if}
		</p>
	{/if}

	{#if curso.matrizCurricular}
		<p class="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
			<BookOpen class="h-3 w-3 shrink-0" />
			<span class="line-clamp-1">{curso.matrizCurricular}</span>
		</p>
	{/if}
</button>
