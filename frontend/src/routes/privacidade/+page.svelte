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
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">3. Assistente Darcy: conversas e memória</h2>
				<p class="text-foreground/80 leading-relaxed">
					As conversas com a Darcy ficam salvas na sua conta, para continuarem em qualquer tela. As
					mensagens são processadas pela Maritaca AI, que gera as respostas. Para a tela abrir mais
					rápido, as últimas mensagens também ficam guardadas no seu navegador, e são apagadas quando
					você sai da conta.
				</p>
				<p class="text-foreground/80 leading-relaxed mt-4">
					Para não esquecer você entre conversas, a Darcy mantém um <strong>resumo curto</strong> do que
					importa para o seu planejamento: objetivos, preferências de horário, carga e professores,
					restrições como trabalho ou estágio e decisões já combinadas. Esse resumo não guarda nome,
					e-mail, matrícula, telefone ou documentos, nem dados sensíveis (saúde, religião, orientação
					sexual, opinião política ou origem étnica). Seus dados acadêmicos continuam vindo direto do
					histórico que você enviou.
				</p>
				<p class="text-foreground/80 leading-relaxed mt-4">
					Em <strong>“Nova conversa”</strong>, a conversa atual é arquivada: você pode reabri-la,
					retomá-la ou apagá-la depois. Em <strong>“Esquecer tudo”</strong>, todas as conversas e o
					resumo são apagados.
				</p>
				<p class="text-foreground/80 leading-relaxed mt-4">
					<strong>Prazo de guarda:</strong> mesmo que você não apague nada, conversas sem atividade há
					<strong>12 meses</strong> são apagadas automaticamente. Se a sua conta ficar <strong>2 anos</strong>
					sem usar a Darcy, as conversas e o resumo também são apagados.
				</p>
			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">4. Direitos do Usuário (LGPD)</h2>
				<p class="text-foreground/80 leading-relaxed">
                Em conformidade com a Lei Geral de Proteção de Dados (LGPD), você tem o direito de acessar, corrigir ou 
                solicitar a exclusão de seus dados. Como o projeto é Open Source, nosso código-fonte está disponível 
                publicamente para auditoria, garantindo que o tratamento de dados seja transparente e auditável pela 
                comunidade da UnB.
				</p>
			</section>

			<section class="mb-8">
				<h2 class="text-2xl font-semibold text-foreground mt-6 mb-4">5. Cookies e Publicidade</h2>
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
