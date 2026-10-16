<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Archive, Download, Trash2 } from 'lucide-svelte';
	import type { PeriodoSalvo } from '$lib/services/grade-estado.service';

	/**
	 * Troca de semestre: o banco guarda só um pedaço pequeno por aluno, então o aluno
	 * decide o que fazer com as grades dos semestres anteriores — baixar, apagar ou
	 * manter por enquanto. Nada é apagado sem clique.
	 */
	let {
		periodos,
		ocupado = null,
		onBaixar,
		onApagar,
		onManter
	}: {
		/** Semestres anteriores com grades salvas; vazio mantém o diálogo fechado. */
		periodos: PeriodoSalvo[];
		/** Período com ação em andamento (desabilita os botões dele). */
		ocupado?: string | null;
		onBaixar: (periodo: string) => void;
		onApagar: (periodo: string) => void;
		onManter: () => void;
	} = $props();

	const aberto = $derived(periodos.length > 0);
	const plural = (n: number) => (n === 1 ? '1 grade' : `${n} grades`);
</script>

<Dialog.Root
	open={aberto}
	onOpenChange={(v) => {
		if (!v) onManter();
	}}
>
	<Dialog.Content
		class="border-border bg-popover text-foreground sm:max-w-md dark:bg-background"
		showCloseButton={false}
	>
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-base text-foreground">
				<Archive class="h-5 w-5 shrink-0 text-muted-foreground" />
				<span>Grades de semestres anteriores</span>
			</Dialog.Title>
			<Dialog.Description class="text-sm text-muted-foreground">
				Seu semestre mudou. Suas grades antigas ficam salvas na sua conta e ocupam espaço do servidor.
				Baixe uma cópia se quiser guardar, e apague o que não precisa mais.
			</Dialog.Description>
		</Dialog.Header>

		<ul class="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
			{#each periodos as p (p.periodo)}
				<li
					class="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-[13px]"
				>
					<div class="min-w-0">
						<p class="font-semibold text-foreground">{p.periodo}</p>
						<p class="text-muted-foreground">
							{plural(p.cenarios)}{p.vencido ? ' · já passou do prazo de guarda' : ''}
						</p>
					</div>
					<div class="flex shrink-0 gap-2">
						<button
							type="button"
							disabled={ocupado === p.periodo}
							onclick={() => onBaixar(p.periodo)}
							class="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
						>
							<Download class="h-3.5 w-3.5" />
							Baixar
						</button>
						<button
							type="button"
							disabled={ocupado === p.periodo}
							onclick={() => onApagar(p.periodo)}
							class="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
						>
							<Trash2 class="h-3.5 w-3.5" />
							Apagar
						</button>
					</div>
				</li>
			{/each}
		</ul>

		<Dialog.Footer>
			<button
				type="button"
				onclick={onManter}
				class="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground/70 transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				Manter por enquanto
			</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
