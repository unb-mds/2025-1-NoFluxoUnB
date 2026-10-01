<script lang="ts">
	import { X } from 'lucide-svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	const steps = [
		{
			number: 1,
			title: 'Acesse o SIGAA',
			image: '/help/tela_de_cadastro.png',
			alt: 'Tela de login do SIGAA'
		},
		{
			number: 2,
			title: 'Selecione "Emitir Histórico"',
			description: 'No menu lateral, clique em Ensino e depois em Emitir Histórico.',
			image: '/help/emitir_historico.png',
			alt: 'Menu Emitir Histórico no SIGAA'
		},
		{
			number: 3,
			title: 'Faça o upload do PDF para o NoFluxoUNB',
			description:
				'Salve o arquivo PDF gerado em seu computador e faça o upload nesta página.',
			image: '/help/historico_baixado.png',
			alt: 'Exemplo de histórico acadêmico gerado'
		}
	];

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	// Bloquear scroll do body quando o modal está aberto
	$effect(() => {
		if (open) {
			const prev = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = prev;
			};
		}
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="overlay"
		role="dialog"
		aria-modal="true"
		aria-label="Como obter seu histórico acadêmico"
		tabindex="0"
		transition:fade={{ duration: 200 }}
		onkeydown={handleKeydown}
	>
	<div
		class="modal"
		use:clickOutside={{ onClickOutside: onclose }}
		transition:fly={{ y: 30, duration: 250 }}
	>
			<!-- Header -->
			<div class="modal-header">
				<h2 class="text-lg font-bold text-foreground md:text-xl">
					Como obter seu histórico acadêmico
				</h2>
				<button
					type="button"
					class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
					onclick={onclose}
					aria-label="Fechar"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Steps -->
			<div class="modal-scroll-area space-y-6">
				{#each steps as step}
					<div class="step-block">
						<div class="flex items-start gap-3">
							<div class="step-number">
								{step.number}
							</div>
							<div>
								<h3 class="text-sm font-semibold text-foreground md:text-base">
									{step.title}
								</h3>
								{#if step.number === 1}
									<p class="mt-0.5 text-sm text-muted-foreground">
										Entre no
										<a
											href="https://sig.unb.br/sigaa/"
											target="_blank"
											rel="noopener noreferrer"
											class="font-medium text-primary underline hover:text-accent-foreground dark:text-blue-400 dark:hover:text-blue-300"
										>
											SIGAA
										</a>
										com seu login e senha institucional.
									</p>
								{:else if step.description}
									<p class="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
								{/if}
							</div>
						</div>
						{#if step.image}
							<div class="mt-3 flex justify-center">
								<img
									src={step.image}
									alt={step.alt}
									class="step-image"
									loading="lazy"
								/>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Footer -->
			<div class="modal-footer">
				<button
					type="button"
					class="entendi-btn"
					onclick={onclose}
				>
					Entendi
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		overflow: hidden;
		background: hsl(0 0% 0% / 0.72);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	.modal {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 36rem;
		max-height: 90vh;
		overflow: hidden;
		border-radius: 1.125rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		box-shadow: var(--nf-shadow-card-lg);
	}

	/* Dark: valores históricos (borda/inset branco translúcido + sombra profunda) */
	:global(.dark) .modal {
		background: hsl(var(--card) / 0.97);
		border-color: hsl(0 0% 100% / 0.058);
		box-shadow:
			inset 0 1px 0 hsl(0 0% 100% / 0.052),
			0 0 0 1px hsl(var(--primary) / 0.06),
			0 28px 64px hsl(0 0% 0% / 0.5);
	}

	@media (min-width: 768px) {
		.modal {
			max-width: 42rem;
		}
	}

	.modal-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border));
		padding: 1rem 1.5rem;
	}

	:global(.dark) .modal-header {
		border-bottom-color: hsl(0 0% 100% / 0.08);
	}

	.modal-scroll-area {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		padding: 1.25rem 1.5rem;
	}

	.modal-footer {
		flex-shrink: 0;
		border-top: 1px solid hsl(var(--border));
		padding: 1rem 1.5rem;
	}

	:global(.dark) .modal-footer {
		border-top-color: hsl(0 0% 100% / 0.08);
	}

	.step-number {
		display: flex;
		height: 2rem;
		width: 2rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		font-size: 0.8125rem;
		font-weight: 700;
		color: hsl(var(--primary-foreground));
		background: hsl(var(--primary));
		box-shadow: 0 4px 16px hsl(var(--primary) / 0.25);
	}

	.step-block {
		border-radius: var(--radius-lg, 14px);
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
		padding: 1rem;
	}

	:global(.dark) .step-block {
		border-color: hsl(0 0% 100% / 0.06);
		background: hsl(0 0% 100% / 0.03);
		box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.045);
	}

	.step-image {
		max-width: 17rem;
		border-radius: 0.625rem;
		border: 1px solid hsl(var(--border));
		box-shadow: var(--nf-shadow-card);
	}

	:global(.dark) .step-image {
		border-color: hsl(0 0% 100% / 0.1);
		box-shadow: 0 14px 32px hsl(0 0% 0% / 0.35);
	}

	@media (min-width: 768px) {
		.step-image {
			max-width: 26rem;
		}
	}

	.entendi-btn {
		width: 100%;
		cursor: pointer;
		border-radius: var(--radius, 10px);
		border: none;
		padding: 0.625rem 1rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--primary-foreground));
		background: hsl(var(--primary));
		box-shadow:
			0 1px 0 hsl(0 0% 100% / 0.1) inset,
			0 10px 32px hsl(var(--primary) / 0.2);
		transition: filter 0.18s ease;
	}

	.entendi-btn:hover {
		filter: brightness(1.05);
	}
</style>
