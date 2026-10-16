<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { planoFormaturaStore } from '$lib/stores/plano-formatura.store.svelte';
	import { darcyStore } from '$lib/stores/darcy.store.svelte';
	import PlanoFormaturaView from '$lib/components/plano-formatura/PlanoFormaturaView.svelte';
	import OnboardingModal from '$lib/components/plano-formatura/OnboardingModal.svelte';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import { ROUTES } from '$lib/config/routes';
	import type { PreferenciasPlano } from '$lib/types/plano-formatura';

	// Enquanto esta tela está aberta, as mensagens da Darcy saem como superfície
	// "plano" e o que ela recalcular (plano, restrições) é aplicado aqui.
	$effect(() =>
		darcyStore.registrarSuperficie({
			superficie: 'plano',
			estado: () => ({ tipo: 'plano' }),
			onPlano: (plano) => planoFormaturaStore.aplicarPlanoDoChat(plano),
			onRestricoes: (restricoes) => planoFormaturaStore.aplicarRestricoesDoChat(restricoes)
		})
	);

	onMount(async () => {
		// Garante que dados do curso estão carregados (necessário para o Motor 2)
		if (!fluxogramaStore.state.courseData) {
			const curriculoCompleto = authStore.getUser()?.dadosFluxograma?.matrizCurricular ?? null;
			if (curriculoCompleto) {
				await fluxogramaStore.loadCourseDataByCurriculoCompleto(curriculoCompleto);
			} else {
				// Sem dados de curso: redireciona para upload
				goto(ROUTES.UPLOAD_HISTORICO);
				return;
			}
		}

		// Carrega preferências e decide se mostra onboarding ou gera direto
		await planoFormaturaStore.loadPreferencias();

		if (!planoFormaturaStore.needsOnboarding) {
			await planoFormaturaStore.gerar();
		}
	});

	async function handleOnboardingConfirm(prefs: PreferenciasPlano, interesses?: string) {
		await planoFormaturaStore.savePreferencias(prefs);

		// Interesses informados no onboarding viram a primeira conversa com o Darcy AI:
		// ele sugere optativas da UnB alinhadas, sem o aluno precisar descobrir o chat.
		if (interesses && planoFormaturaStore.status === 'success') {
			planoFormaturaStore.enviarMensagem(
				`Tenho interesse em: ${interesses}. Quais matérias optativas da UnB combinam com esses interesses? Me diga também quais delas têm oferta neste semestre.`
			);
		}
	}

	function handleOnboardingClose() {
		planoFormaturaStore.closeOnboarding();
		// Se nunca gerou um plano e o usuário fecha sem confirmar, tenta gerar com defaults
		if (planoFormaturaStore.status === 'idle') {
			planoFormaturaStore.gerar();
		}
	}
</script>

<PageMeta
	title="Plano de Formatura | NoFluxo UNB"
	description="Planejamento personalizado de matérias para sua formatura na UnB."
/>

<!-- Onboarding modal (first visit or ajustar preferências) -->
<OnboardingModal
	open={planoFormaturaStore.showOnboarding}
	onConfirm={handleOnboardingConfirm}
	onClose={handleOnboardingClose}
/>

<!-- Main view: ocupa a tela inteira disponível -->
<div class="flex h-full min-h-screen flex-col">
	<PlanoFormaturaView />
</div>
