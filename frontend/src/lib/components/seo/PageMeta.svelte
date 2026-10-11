<script lang="ts">
	import { page } from '$app/stores';

	interface Props {
		title: string;
		description?: string;
		image?: string;
		noIndex?: boolean;
		type?: 'website' | 'article';
	}

	let {
		title,
		description = '',
		image = '/og-image.png',
		noIndex = false,
		type = 'website'
	}: Props = $props();

	const siteName = 'NoFluxo UNB (No Fluxo UNB)';
	const siteUrl = 'https://no-fluxo.crianex.com';

	let fullTitle = $derived(title ? `${title} | ${siteName}` : siteName);
	let canonicalUrl = $derived(`${siteUrl}${$page.url.pathname}`);
	let imageUrl = $derived(image.startsWith('http') ? image : `${siteUrl}${image}`);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonicalUrl} />

	{#if noIndex}
		<meta name="robots" content="noindex, nofollow" />
	{/if}

	<!-- Open Graph -->
	<meta property="og:site_name" content={siteName} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:type" content={type} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content={imageUrl} />
	<meta property="og:locale" content="pt_BR" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={imageUrl} />

	<!-- theme-color por tema vive no app.html (light #faf9fe / dark #09090b) -->
	<meta name="application-name" content={siteName} />
</svelte:head>
