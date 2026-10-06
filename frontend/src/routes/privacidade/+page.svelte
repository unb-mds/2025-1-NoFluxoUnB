<script lang="ts">
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
</script>

<PageMeta
	title="Política de privacidade"
	description="Entenda como o NoFluxo UNB coleta, usa e protege seus dados."
/>

<main class="min-h-screen bg-background pb-12">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="prose prose-sm sm:prose lg:prose-lg max-w-none">
			<h1 class="text-3xl font-bold text-foreground mb-8">Política de Privacidade</h1>

			<p class="text-foreground/80 leading-relaxed mb-8 text-lg">
				A sua privacidade é importante para nós. É política do NoFluxo UNB respeitar a sua privacidade em
				relação a qualquer informação sua que possamos coletar no site NoFluxo UNB e outros sites que
				possuímos e operamos.
			</p>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">1. Coleta de Informações</h2>
				<p class="text-foreground/80 leading-relaxed">
                Solicitamos informações pessoais e acadêmicas (como o histórico escolar via PDF) apenas quando 
                necessário para fornecer o serviço de recomendação de disciplinas. O processamento desses dados
                ocorre localmente ou via APIs de inteligência artificial de forma segura, com o seu conhecimento 
                e consentimento.
				</p>
			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">2. Uso e Retenção</h2>
				<p class="text-foreground/80 leading-relaxed">
                Os dados coletados são retidos apenas pelo tempo necessário para a execução do serviço. Informações
                sensíveis extraídas de documentos acadêmicos são utilizadas exclusivamente para a análise do fluxo e
                não são compartilhadas com terceiros para fins comerciais. Empregamos medidas de segurança comercialmente
                aceitáveis para evitar perdas, roubos ou acessos não autorizados.
				</p>
			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">3. Direitos do Usuário (LGPD)</h2>
				<p class="text-foreground/80 leading-relaxed">
                Em conformidade com a Lei Geral de Proteção de Dados (LGPD), você tem o direito de acessar, corrigir ou 
                solicitar a exclusão de seus dados. Como o projeto é Open Source, nosso código-fonte está disponível 
                publicamente para auditoria, garantindo que o tratamento de dados seja transparente e auditável pela 
                comunidade da UnB.
				</p>
			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">4. Cookies e Publicidade</h2>
				<p class="text-foreground/80 leading-relaxed">
					O serviço Google AdSense usa um cookie DoubleClick para veicular anúncios mais relevantes e limitar
					a frequência de exibição.
				</p>
				<p class="text-foreground/80 leading-relaxed mt-4">
					Utilizamos anúncios para compensar os custos de infraestrutura e desenvolvimento do projeto.
				</p>
				<p class="text-foreground/80 leading-relaxed mt-4">
					Você é livre para recusar a nossa solicitação de informações ou cookies, entendendo que talvez não
					possamos fornecer alguns dos serviços desejados.
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
