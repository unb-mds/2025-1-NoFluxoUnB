<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
</script>

<PageMeta
	title="Termos de serviço"
	description="Conheça os termos de serviço e uso do NoFluxo UNB."
/>

<main class="min-h-screen bg-background pb-12">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="prose prose-sm sm:prose lg:prose-lg max-w-none">
			<h1 class="text-3xl font-bold text-foreground mb-8">Termos de Uso</h1>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">1. Aceitação dos Termos</h2>
				<p class="text-foreground/80 leading-relaxed">
					Ao acessar ao site NoFluxo UNB, você concorda em cumprir estes termos de serviço, todas as leis
					e regulamentos aplicáveis e concorda que é responsável pelo cumprimento de todas as leis locais
					aplicáveis.
				</p>
			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">2. Licença de Software (Copyleft - GNU GPLv3)</h2>
				<p class="text-foreground/80 leading-relaxed">
					O NoFluxo UNB é software livre, distribuído sob a licença GNU GPLv3.
				</p>
                <p class="text-foreground/80 leading-relaxed mt-4">
                    <strong>Liberdade:</strong> Você pode usar, estudar, compartilhar e modificar o software.
                </p>
                <p class="text-foreground/80 leading-relaxed mt-4">
                    <strong>Reciprocidade:</strong> Qualquer trabalho derivado ou cópia deste código deve, obrigatoriamente, ser mantido como software livre sob a mesma licença GPLv3.
                </p>
                <p class="text-foreground/80 leading-relaxed mt-4">
                    <strong>Proibição de Fechamento:</strong> É estritamente proibido transformar este código em um produto proprietário/fechado ou comercializá-lo sem fornecer o código-fonte correspondente.
                </p>

			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">3. Isenção de Responsabilidade</h2>
				<p class="text-foreground/80 leading-relaxed">
					Os materiais no site da NoFluxo UNB são fornecidos "como estão". O NoFluxo UNB não oferece
					garantias, expressas ou implícitas.
				</p>
				<p class="text-foreground/80 leading-relaxed mt-4">
					<strong>Atenção Acadêmica:</strong> As recomendações geradas por nossa IA são
					meramente informativas. O NoFluxo UNB não garante a precisão absoluta dos dados e não substitui o
					aconselhamento oficial da coordenação do curso ou as regras do SIGAA/Matrícula Web da UnB. O uso
					das informações para fins de matrícula é de inteira responsabilidade do usuário.
				</p>
			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">4. Limitações</h2>
				<p class="text-foreground/80 leading-relaxed">
					Em nenhum caso o NoFluxo UNB ou seus desenvolvedores serão responsáveis por quaisquer danos
					(incluindo, sem limitação, danos por perda de dados, lucros ou interrupção de atividades
					acadêmicas) decorrentes do uso ou da incapacidade de usar os materiais no site.
				</p>
			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">5. Precisão dos Materiais</h2>
				<p class="text-foreground/80 leading-relaxed">
					Os materiais exibidos no site podem incluir erros técnicos, tipográficos ou de processamento de
					IA. O NoFluxo UNB não garante que qualquer material seja preciso, completo ou atual, embora
					busquemos a melhoria contínua através da comunidade.
				</p>
			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">6. Lei Aplicável</h2>
				<p class="text-foreground/80 leading-relaxed">
					Estes termos e condições são regidos e interpretados de acordo com as leis da República Federativa
					do Brasil e você se submete irrevogavelmente à jurisdição exclusiva dos tribunais em Brasília, DF.
				</p>
				<p class="text-muted-foreground text-sm mt-4">
					<em>Esta política é efetiva a partir de 17 de Março de 2026.</em>
				</p>
			</section>
		</div>
	</div>
</main>

<style global>
	.prose {
		color: hsl(var(--foreground) / 0.8);
	}

	.prose h2 {
		color: hsl(var(--foreground));
	}

	.prose p {
		margin-bottom: 1rem;
		line-height: 1.6;
	}

	.prose strong {
		font-weight: 600;
		color: hsl(var(--foreground));
	}
</style>
