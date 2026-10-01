<script lang="ts">
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import Navbar from '$lib/components/layout/Navbar.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import JsonLd from '$lib/components/seo/JsonLd.svelte';
	import HeroSection from '$lib/components/home/HeroSection.svelte';
	import ComoFuncionaSection from '$lib/components/home/ComoFuncionaSection.svelte';
	import ProntoParaOrganizarSection from '$lib/components/home/ProntoParaOrganizarSection.svelte';
	import SobreNosSection from '$lib/components/home/SobreNosSection.svelte';
	import CrianexSection from '$lib/components/home/CrianexSection.svelte';
	import HomeFooter from '$lib/components/home/HomeFooter.svelte';
	import { currentUser, isAuthenticated } from '$lib/stores/auth';

	const websiteJsonLd = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'NoFluxo UNB',
		alternateName: ['No Fluxo UNB', 'NoFluxoUnB'],
		url: 'https://no-fluxo.crianex.com'
	};

	const organizationJsonLd = {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: 'NoFluxo UNB',
		alternateName: ['No Fluxo UNB', 'NoFluxoUnB'],
		url: 'https://no-fluxo.crianex.com',
		logo: 'https://no-fluxo.crianex.com/og-image.png',
		parentOrganization: {
			'@type': 'Organization',
			name: 'Crianex',
			url: 'https://crianex.com'
		}
	};
</script>

<PageMeta
	title="No Fluxo UNB: fluxograma acadêmico inteligente"
	description="No Fluxo UNB (NoFluxo) te ajuda a visualizar fluxogramas, planejar disciplinas e acompanhar seu progresso acadêmico na UnB."
/>
<JsonLd data={websiteJsonLd} />
<JsonLd data={organizationJsonLd} />

<PageBackground />

<!-- Navbar em pílula alinhada ao hero (referência visual) -->
<div class="navbar-glass sticky top-0 z-50 px-4 pt-3 md:px-6 md:pt-4">
	<div class="mx-auto w-full">
		<Navbar user={$currentUser} isAuthenticated={$isAuthenticated} variant="floating" />
	</div>
</div>

<main class="relative min-h-screen">
	<HeroSection />
	<ComoFuncionaSection />
	<ProntoParaOrganizarSection />
	<SobreNosSection />
	<CrianexSection />
	<HomeFooter />
</main>
