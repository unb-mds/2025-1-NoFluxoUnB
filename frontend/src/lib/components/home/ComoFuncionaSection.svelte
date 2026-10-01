<script lang="ts">
	import FeatureCard from './FeatureCard.svelte';
	import {
		ClipboardList,
		PlusCircle,
		CheckCircle,
		Bot,
		ArrowRightLeft,
		GitCompare
	} from 'lucide-svelte';

	const features = [
		{
			icon: ClipboardList,
			title: 'Visualize sua grade',
			description:
				'Veja todas as disciplinas do seu curso organizadas por semestre, com os pré-requisitos visíveis num só lugar.'
		},
		{
			icon: PlusCircle,
			title: 'Planeje optativas',
			description:
				'Inclua optativas no seu fluxograma e visualize como elas se encaixam no seu percurso. Bom pra quem já sabe no que quer se aprofundar e pra quem ainda tá descobrindo.'
		},
		{
			icon: ArrowRightLeft,
			title: 'Simule mudança de curso',
			description:
				'Curioso pra saber como ficaria seu histórico em outro curso? Simule a integralização e veja o que aproveita.'
		},
		{
			icon: Bot,
			title: 'Assistente de IA',
			description:
				'Converse com a IA pra descobrir optativas alinhadas ao que te interessa e tirar dúvidas sobre matérias do seu curso.'
		},
		{
			icon: CheckCircle,
			title: 'Acompanhe o progresso',
			description:
				'Veja exatamente quanto falta pra formar, quais matérias você já cumpriu e quais ainda precisam entrar no seu plano.'
		},
		{
			icon: GitCompare,
			title: 'Encontre equivalências',
			description:
				'Descubra matérias equivalentes em outras matrizes e campi da UnB sem precisar caçar no SIGAA.'
		}
	];
</script>

<section class="como-section">
	<h2 class="section-heading">Como funciona</h2>
	<div class="feature-cards">
		{#each features as feature}
			<FeatureCard icon={feature.icon} title={feature.title} description={feature.description} />
		{/each}
	</div>
</section>

<style>
	.como-section {
		padding: clamp(3.5rem, 8vw, 4.5rem) 1.5rem;
		background: hsl(var(--background) / 0.85);
		/* divisória: foreground ≈ branco no dark → mesmo valor visual de antes */
		border-top: 1px solid hsl(var(--foreground) / 0.06);
	}

	.section-heading {
		font-size: clamp(1.375rem, 3vw, 1.75rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		text-align: center;
		color: hsl(var(--foreground));
		margin: 0 0 2.75rem;
	}

	.feature-cards {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
		max-width: 1120px;
		margin: 0 auto;
	}

	@media (min-width: 768px) {
		.feature-cards {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 1.1rem;
		}
	}
</style>
