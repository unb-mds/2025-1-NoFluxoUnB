<script lang="ts">
	import { CheckCircle, RotateCcw, ArrowRight } from 'lucide-svelte';
	import ProcessingResults from './ProcessingResults.svelte';
	import type { CasarDisciplinasResponse, UploadPdfResponse } from '$lib/services/upload.service';

	interface Props {
		data: CasarDisciplinasResponse;
		extractedData?: UploadPdfResponse | null;
		onsave: () => void;
		onreset: () => void;
	}

	let { data, extractedData = null, onsave, onreset }: Props = $props();
</script>

<div class="success-wrap">
	<div class="success-icon">
		<CheckCircle class="size-10 text-emerald-700 sm:size-12 dark:text-emerald-400" stroke-width="2" />
	</div>

	<div class="success-text">
		<h3 class="success-title">Processamento concluído</h3>
		<p class="success-sub">Seu histórico foi processado. Revise os dados abaixo antes de abrir o fluxograma.</p>
	</div>

	<div class="results w-full min-w-0">
		<ProcessingResults {data} {extractedData} />
	</div>

	<div class="actions">
		<button type="button" class="btn-primary nf-cta-glow" onclick={onsave}>
			<ArrowRight class="size-4" />
			Visualizar fluxograma
		</button>
		<button type="button" class="btn-secondary" onclick={onreset}>
			<RotateCcw class="size-4" />
			Enviar outro PDF
		</button>
	</div>
</div>

<style>
	.success-wrap {
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		.success-wrap {
			gap: 1.35rem;
		}
	}

	.success-icon {
		display: flex;
		height: 4rem;
		width: 4rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: hsl(152 65% 40% / 0.12);
		border: 1px solid hsl(152 65% 45% / 0.25);
		animation: pop 0.38s ease-out;
	}

	@media (min-width: 640px) {
		.success-icon {
			height: 5rem;
			width: 5rem;
		}
	}

	.success-text {
		text-align: center;
	}

	.success-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
	}

	@media (min-width: 640px) {
		.success-title {
			font-size: 1.25rem;
		}
	}

	.success-sub {
		margin: 0.35rem 0 0;
		font-size: 0.8125rem;
		line-height: 1.45;
		color: hsl(var(--muted-foreground));
		max-width: 26rem;
	}

	.actions {
		display: flex;
		width: 100%;
		min-width: 0;
		flex-direction: column;
		gap: 0.5rem;
	}

	@media (min-width: 640px) {
		.actions {
			flex-direction: row;
			justify-content: center;
			gap: 0.65rem;
		}
	}

	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		width: 100%;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		padding: 0.65rem 1.25rem;
		border-radius: 12px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: filter 0.15s ease;
	}

	@media (min-width: 640px) {
		.btn-primary,
		.btn-secondary {
			width: auto;
			padding: 0.7rem 1.35rem;
		}
	}

	.btn-primary {
		border: none;
		color: hsl(var(--primary-foreground));
		background: hsl(var(--primary));
	}

	.btn-primary:hover {
		filter: brightness(1.06);
	}

	.btn-secondary {
		border: 1px solid hsl(var(--border-strong) / 0.7);
		background: hsl(var(--secondary) / 0.45);
		color: hsl(var(--foreground));
	}

	.btn-secondary:hover {
		background: hsl(var(--secondary) / 0.75);
		border-color: hsl(var(--border-strong));
	}

	:global(.dark) .btn-secondary {
		border-color: hsl(0 0% 100% / 0.12);
	}

	:global(.dark) .btn-secondary:hover {
		border-color: hsl(0 0% 100% / 0.18);
	}

	@keyframes pop {
		0% {
			transform: scale(0.88);
			opacity: 0;
		}
		70% {
			transform: scale(1.04);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>
