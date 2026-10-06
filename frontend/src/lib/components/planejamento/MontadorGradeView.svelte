<script lang="ts">
	import { browser } from '$app/environment';
	import ScheduleGrid from './ScheduleGrid.svelte';
	import SubjectTurmaSelector from './SubjectTurmaSelector.svelte';
	import MateriaSearchAdd from './MateriaSearchAdd.svelte';
	import GradeResumo from './GradeResumo.svelte';
	import SituacaoPanel from './SituacaoPanel.svelte';
	import CenarioSwitcher from './CenarioSwitcher.svelte';
	import TrocarTurmaDialog from './TrocarTurmaDialog.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { unidadeCargaStore } from '$lib/stores/unidade-carga.store.svelte';
	import type { SemeaduraResultado } from '$lib/services/grade-pool.service';
	import type { SituacaoAcademica } from '$lib/services/situacao-academica.service';
	import type { Turno } from '$lib/utils/horario-slots';
	import { ROUTES } from '$lib/config/routes';
	import { LIMITE_CREDITOS_MAX, LIMITE_CREDITOS_MIN } from '$lib/types/plano-formatura';
	import {
		CalendarDays,
		Wand2,
		Trash2,
		Loader2,
		Info,
		Download,
		Star,
		Search,
		Compass,
		Maximize2,
		Minimize2,
		MoreHorizontal,
		ListChecks,
		BookMarked,
		Check,
		Undo2,
		GraduationCap
	} from 'lucide-svelte';
	import OnboardingTour from '$lib/components/onboarding/OnboardingTour.svelte';
	import HelpTip from '$lib/components/onboarding/HelpTip.svelte';
	import { tourStore, type TourStep } from '$lib/components/onboarding/tour.store.svelte';
	import { toast } from 'svelte-sonner';

	/**
	 * Corpo do Montador de Grade — tudo que aparece depois que o pool carregou.
	 * Fica separado da rota para (a) a página cuidar só de auth/carregamento e
	 * (b) o harness de dev (`/dev/grade-mobile`) montar a mesma tela com dados
	 * falsos, sem backend, para conferir o layout no celular.
	 */
	let {
		periodo,
		limiteCreditos,
		onAdd,
		onSemear,
		onVoltarInicio,
		aviso = $bindable(null),
		obrigatoriasSemOferta = [],
		confirmacaoProfessor = null,
		onAceitarConfirmacaoProfessor,
		onRecusarConfirmacaoProfessor,
		situacao = null,
		situacaoCarregando = false,
		moduloLivre = null,
		sugestoesModuloLivre = [],
		buscandoModuloLivre = false,
		onResponderModuloLivre,
		onBuscarModuloLivre,
		onLimiteCreditos
	}: {
		periodo: string | null;
		limiteCreditos: number;
		onAdd: (codigo: string) => void;
		/**
		 * Enche a lista com o que dá para montar — recomendadas do plano e, se o plano
		 * não render nada, matérias da matriz — e devolve o que entrou, por procedência.
		 * Quem sabe do plano e da matriz é a rota, não a view.
		 */
		onSemear?: () => Promise<SemeaduraResultado>;
		/**
		 * Refaz o preenchimento automático da primeira visita (recomendadas do plano
		 * + matrículas reais do histórico), descartando edições. Quem sabe do
		 * histórico e do plano é a rota; o harness de dev não passa e o botão some.
		 */
		onVoltarInicio?: () => void | Promise<void>;
		aviso?: string | null;
		/** Obrigatórias que faltam ao aluno e não têm turma neste período. */
		obrigatoriasSemOferta?: string[];
		/** Prévia pendente de rearranjo por professor (pedido via chat) — ver a rota. */
		confirmacaoProfessor?: { resumo: string } | null;
		onAceitarConfirmacaoProfessor?: () => void;
		onRecusarConfirmacaoProfessor?: () => void;
		/** O que ainda falta ao aluno. `null` = não carregou (a tela segue funcionando). */
		situacao?: SituacaoAcademica | null;
		situacaoCarregando?: boolean;
		/** Resposta do aluno sobre módulo livre; `null` = ainda não perguntamos. */
		moduloLivre?: { quer: boolean | null; tema?: string } | null;
		sugestoesModuloLivre?: Array<{ codigo: string; nome: string; creditos: number }>;
		buscandoModuloLivre?: boolean;
		onResponderModuloLivre?: (quer: boolean, tema?: string) => void;
		onBuscarModuloLivre?: (tema: string) => void;
		/**
		 * O aluno mudou o limite de carga. Quem persiste é a rota — o harness de dev
		 * não passa nada e o slider segue valendo só para a sessão.
		 */
		onLimiteCreditos?: (creditos: number) => void;
	} = $props();

	let materiaDialog = $state<string | null>(null);

	/**
	 * Limite de créditos em uso na tela. Começa no do plano e é o que a montagem
	 * obedece; mexer no slider salva a escolha (`onLimiteCreditos`), porque limite
	 * de carga por semestre é uma preferência do aluno, não um estado de sessão —
	 * voltar ao padrão a cada recarga desfazia a escolha dele em silêncio.
	 */
	let limiteSessao = $state(limiteCreditos);
	$effect(() => {
		limiteSessao = limiteCreditos;
	});

	// A régua vai do piso ao teto do sistema — os mesmos que o Motor 2 aplica —, e
	// é fixa: derivá-la do valor atual, agora que ele persiste, faria a barra
	// crescer enquanto o aluno arrasta, mudando o fim da escala no meio do gesto.

	const creditosPct = $derived(
		limiteSessao > 0 ? Math.min(100, (gradeStore.creditosSelecionados / limiteSessao) * 100) : 0
	);
	const creditosAcima = $derived(gradeStore.creditosSelecionados > limiteSessao);

	// Contadores e slider exibem na unidade que o aluno escolheu (horas por padrão,
	// créditos se preferir) — o estado interno segue sempre em créditos.
	const unidadeOposta = $derived(unidadeCargaStore.unidade === 'horas' ? 'créditos' : 'horas');
	const contadorTexto = $derived(
		`${unidadeCargaStore.emUnidade(gradeStore.creditosSelecionados)}/${unidadeCargaStore.emUnidade(limiteSessao)}`
	);

	// Arrastar o slider reajusta a grade ao vivo, mas só depois de soltar um pouco —
	// chamar ajustarParaLimite a cada pixel arrastado tiraria matéria demais de uma
	// vez só, sem o aluno conseguir ver o que está acontecendo.
	let debounceLimite: ReturnType<typeof setTimeout> | undefined;
	function moverSliderCreditos(valor: number): void {
		limiteSessao = valor;
		clearTimeout(debounceLimite);
		debounceLimite = setTimeout(() => {
			gradeStore.ajustarParaLimite(valor);
			// Persiste junto com o reajuste, e no mesmo debounce: sem isso o valor
			// vivia só nesta sessão e voltava ao padrão na recarga seguinte.
			onLimiteCreditos?.(valor);
		}, 250);
	}

	// "Voltar ao início" refaz a semeadura na rede — trava o botão enquanto roda.
	let voltando = $state(false);
	async function voltarAoInicio(): Promise<void> {
		if (!onVoltarInicio || voltando) return;
		voltando = true;
		try {
			await onVoltarInicio();
		} finally {
			voltando = false;
		}
	}

	/** Esvazia lista e grade; o toast aponta o caminho de volta. */
	function limparTudo(): void {
		gradeStore.limparTudo();
		toast.info('Tudo limpo. "Voltar ao início" refaz o preenchimento automático.');
	}

	// Calendário em tela cheia (só faz diferença no desktop; no compacto já é 1 coluna).
	let calendarioExpandido = $state(false);

	/**
	 * Abaixo de `lg` não existem três colunas: tudo empilha. Empilhado, a página
	 * passava de 3.500px — o resumo ficava a quatro telas de rolagem e a barra de
	 * ações comia três fileiras antes do calendário. No compacto o cabeçalho vira
	 * uma linha, as ações secundárias vão para um menu, o que importa (créditos,
	 * turnos, montar) fica numa barra fixa, e matérias/resumo viram abas.
	 * É decisão de layout, não de estilo, então precisa de JS: renderizar os dois
	 * e esconder um por CSS duplicaria os alvos `data-tour` e o `#grade-export`.
	 */
	let compacto = $state(false);
	$effect(() => {
		if (!browser) return;
		const mq = window.matchMedia('(max-width: 1023px)');
		const aplicar = () => (compacto = mq.matches);
		aplicar();
		mq.addEventListener('change', aplicar);
		return () => mq.removeEventListener('change', aplicar);
	});

	let painel = $state<'materias' | 'resumo' | 'situacao'>('materias');

	/**
	 * O snippet do painel de situação, para o compacto (aba) e o desktop (coluna)
	 * renderizarem exatamente a mesma coisa sem duplicar a lista de props.
	 */
	const naGrade = $derived(new Set(gradeStore.pool.map((m) => m.codigo)));

	/**
	 * Há pergunta de módulo livre esperando resposta? Só então a aba ganha o ponto
	 * de aviso — badge permanente vira ruído e o aluno para de enxergar.
	 */
	const temPerguntaModuloLivre = $derived(
		!!situacao &&
			situacao.exigeModuloLivre &&
			situacao.faltam.modulo_livre !== null &&
			situacao.faltam.modulo_livre > 0 &&
			(moduloLivre?.quer ?? null) === null
	);

	/** Assinatura da seleção atual — para saber se a montagem mudou alguma coisa. */
	function assinaturaSelecao(): string {
		return [...gradeStore.selecao]
			.map(([codigo, tg]) => `${codigo}:${tg.turma.id_turmas}`)
			.sort()
			.join('|');
	}

	let montando = $state(false);

	/**
	 * Ação principal da tela: monta a grade do zero. Primeiro enche a lista com o que
	 * falta na matriz do aluno — em curso, obrigatórias e, com o que sobrar,
	 * optativas (por isso é async) —, depois encaixa tudo sem conflito de horário.
	 *
	 * Termina sempre num toast. O motor costuma acertar de primeira, e a partir daí
	 * o clique não muda um pixel — sem uma resposta explícita isso é
	 * indistinguível de um botão morto.
	 */
	async function montarGrade(): Promise<void> {
		if (montando) return;
		montando = true;
		try {
			const semeadas = (await onSemear?.()) ?? {
				adicionadas: [],
				obrigatoriasSemOferta: [],
				pendentesSemOferta: 0
			};
			const puxadas = semeadas.adicionadas.length;
			/**
			 * Por que a lista não trouxe optativa (ou módulo livre): a carga já está
			 * cumprida. Sem dizer isso, a ausência parece bug — e o aluno que quiser uma
			 * assim mesmo não descobre que pode buscá-la na mão.
			 */
			const saturadas = semeadas.naturezasSaturadas ?? [];

			// Só sobra avisar quando não existe oferta nenhuma para o aluno neste
			// período — a semeadura já tentou o plano e a matriz antes de chegar aqui.
			if (!gradeStore.pool.some((m) => m.turmas.length > 0)) {
				toast.warning(
					gradeStore.pool.length > 0
						? `Nenhuma matéria da sua lista tem turma em ${periodo ?? 'neste semestre'}. Busque outra ou veja a oferta completa.`
						: 'Não achei matérias com turma neste semestre para montar. Adicione uma na busca.'
				);
				return;
			}

			const antes = assinaturaSelecao();
			// `limiteSessao` (o slider), não o limite do plano: o aluno pode estar
			// testando "e se eu quisesse menos" e a montagem tem que obedecer isso.
			const resultado = gradeStore.montarAutomatico({ limiteCreditos: limiteSessao });
			const mudou = assinaturaSelecao() !== antes;

			const materias = gradeStore.selecao.size;
			const creditos = gradeStore.creditosSelecionados;
			const naoCoube = resultado.naoAlocadas.length;

			if (materias === 0) {
				// Quatro causas distintas terminam aqui. Chamar todas de "não há turma"
				// mandava o aluno procurar defeito na oferta quando o problema era
				// outro — e uma versão anterior chegou a mandá-lo apertar um botão que
				// não mudaria nada. A ordem abaixo vai da causa mais forte para a mais
				// fraca; `candidatas` separa "ninguém concorreu" de "ninguém coube".
				const semOferta = semeadas.pendentesSemOferta ?? 0;
				toast.warning(
					resultado.candidatas === 0
						? semOferta > 0
							? // Fim de curso: a matriz ainda tem pendências, mas nenhuma é
								// ofertada agora. Religar as em curso não muda isso, e este é o
								// número que de fato altera o planejamento do aluno.
								`Nenhuma das suas ${semOferta} matérias pendentes tem turma em ${periodo ?? 'neste período'}. Só o que você já cursa está ofertado — use “Buscar turmas” para procurar fora da matriz.`
							: gradeStore.temCursando && !gradeStore.incluirCursando
								? 'Sua lista só tem matérias que você já cursa, e elas estão fora da montagem. Ligue de volta o botão das matérias em curso para vê-las na grade.'
								: 'Não sobrou nenhuma matéria para montar. Busque uma acima ou use “Voltar ao início”.'
						: naoCoube > 0
							? `Nenhuma matéria coube em ${limiteSessao} créditos e nos turnos escolhidos (${resultado.naoAlocadas.join(', ')}).`
							: 'Nenhuma turma disponível para as matérias da lista.'
				);
				return;
			}

			const plural = (n: number) => (n === 1 ? 'matéria' : 'matérias');
			// A procedência importa: puxar da matriz é um palpite nosso, não o plano de
			// formatura do aluno — ele precisa saber para conferir antes da matrícula.
			const prefixo =
				puxadas > 0 ? `Puxei ${puxadas} ${plural(puxadas)} da sua matriz. ` : '';
			const resumo = `${materias} ${plural(materias)} · ${unidadeCargaStore.formatar(creditos)}`;
			const NOME_NATUREZA: Record<string, string> = {
				optativa: 'optativa',
				modulo_livre: 'de módulo livre'
			};
			const porque =
				saturadas.length > 0
					? ` Priorizei o que ainda te falta — sua carga ${saturadas
							.map((n) => NOME_NATUREZA[n] ?? n)
							.join(' e ')} já está cumprida.`
					: '';
			// Depois que a montagem passou a respeitar o teto, estourar só sobra quando
			// são matérias que o aluno JÁ cursa (MATR): elas entram por obrigação e não
			// podem ser cortadas. Dizer "passa do seu limite" seco soaria como erro do
			// app, quando na verdade é a matrícula real dele.
			const excedeu =
				creditos > limiteSessao
					? ` São ${unidadeCargaStore.formatar(creditos)} porque as matérias que você já cursa não podem sair da grade.`
					: '';
			// `naoAlocadas` tem duas causas agora — conflito de horário/turno e teto de
			// créditos —, e o motor não distingue. Não afirme a causa.
			const faltou = naoCoube > 0 ? ` Não coube: ${resultado.naoAlocadas.join(', ')}.` : '';

			if (mudou || puxadas > 0) {
				toast.success(`${prefixo}Grade montada: ${resumo}.${porque}${excedeu}${faltou}`);
			} else {
				toast.info(
					`Nada mudou: sua grade já é o melhor encaixe possível (${resumo}).${excedeu}${faltou}`
				);
			}
		} catch {
			toast.error('Não consegui montar a grade agora. Tente de novo.');
		} finally {
			montando = false;
		}
	}

	let exportando = $state(false);
	async function exportarGrade(): Promise<void> {
		if (exportando) return;
		const el = document.getElementById('grade-export');
		if (!el) return;
		exportando = true;
		try {
			const html2canvas = (await import('html2canvas-pro')).default;
			const canvas = await html2canvas(el, {
				// Exporta no tema em uso: o PNG tem fundo opaco, e um fundo preto embaixo
				// de texto escuro (light) saía ilegível.
				backgroundColor: document.documentElement.classList.contains('dark') ? '#0a0a0a' : '#ffffff',
				scale: 2,
				logging: false
			});
			const link = document.createElement('a');
			link.download = `grade-${(periodo ?? '').replace('.', '-')}.png`;
			link.href = canvas.toDataURL('image/png');
			link.click();
		} catch {
			aviso = 'Não foi possível exportar a imagem.';
		} finally {
			exportando = false;
		}
	}

	// ---------------------------------------------------------------------------
	// Onboarding guiado
	// ---------------------------------------------------------------------------
	const TOUR_ID = 'montador-grade-v1';

	// 7 passos: só o caminho crítico (achar → turma → calendário → montar →
	// exportar → IA). Turnos, créditos e modos de visualização são secundários e
	// já têm HelpTip permanente ao lado do próprio controle.
	const TOUR_STEPS: TourStep[] = [
		{
			title: 'Bem-vindo ao Montador de Grade 👋',
			description:
				'Em 1 minuto você monta uma grade sem conflito de horário, com as turmas realmente ofertadas. Já deixamos as matérias recomendadas pelo seu plano na lista — é só escolher as turmas.',
			hint: 'Dá pra navegar com as setas ← → do teclado e sair com Esc.'
		},
		{
			target: 'buscar-materia',
			side: 'right',
			title: '1. Ache a matéria',
			description:
				'Digite o código (ex.: CIC0004) ou parte do nome e clique no resultado para jogar a matéria na sua lista. Só aparecem matérias da sua matriz que você ainda não cursou.',
			hint: 'Quer algo fora da matriz? Use “Buscar turmas”, no menu do topo.'
		},
		{
			target: 'escolher-turma',
			side: 'right',
			title: '2. Escolha a turma',
			description:
				'Cada matéria mostra as turmas ofertadas com professor, horário e vagas. Clique numa turma para colocá-la na grade — clicar de novo tira. A estrela marca a matéria como prioritária.',
			hint: 'Turma lotada? Dá pra seguir a turma e ser avisado quando abrir vaga.'
		},
		{
			target: 'calendario',
			side: 'left',
			title: '3. Veja sua semana',
			description:
				'As turmas escolhidas viram blocos coloridos aqui. Conflito de horário aparece destacado na hora, então não tem como se matricular em duas aulas no mesmo slot sem perceber.',
			hint: 'Clique num bloco para trocar a turma; os controles abaixo do calendário mudam a visualização.'
		},
		{
			target: 'montar',
			side: 'bottom',
			title: 'Ou deixe a gente montar',
			description:
				'“Montar grade” puxa do seu plano de formatura as matérias que faltam na lista e testa as combinações até encaixar o máximo delas sem conflito, respeitando os turnos ligados ali ao lado e começando pelas marcadas com estrela. Se algo não couber, a gente avisa.'
		},
		{
			target: 'resumo',
			side: 'left',
			title: '4. Confira e exporte',
			description:
				'O resumo lista tudo que está na grade com turma e horário. Quando estiver do jeito que você quer, use “Exportar imagem” para baixar a grade e levar pro dia da matrícula.',
			hint: 'O contador de carga na barra de cima compara sua seleção com o limite do seu plano — em horas ou créditos, você escolhe.'
		},
		{
			target: 'assistente-ia',
			side: 'left',
			padding: 12,
			title: '✨ E tem a Darcy, nossa IA',
			description:
				'Peça em português: “optativas de redes à tarde com turma aberta” ou “monta minha grade sem aula de manhã”. Ela sugere só matérias com turma neste semestre e joga direto na sua grade.',
			hint: 'Reveja este passo a passo em “Como funciona” — e os “?” explicam cada controle.'
		}
	];

	export function abrirTour(): void {
		tourStore.start(TOUR_ID, TOUR_STEPS);
	}

	// Primeira visita: abre sozinho assim que a tela existe (o componente só monta
	// depois do pool carregado, então os alvos do spotlight já estão no DOM).
	$effect(() => {
		const t = setTimeout(() => tourStore.startSeNovo(TOUR_ID, TOUR_STEPS), 500);
		return () => clearTimeout(t);
	});

	// No compacto o alvo do passo pode estar na aba escondida — o spotlight cairia
	// num elemento inexistente e o card viraria um aviso solto no meio da tela.
	$effect(() => {
		const alvo = tourStore.aberto ? tourStore.stepAtual?.target : null;
		if (!compacto || !alvo) return;
		if (alvo === 'buscar-materia' || alvo === 'escolher-turma') painel = 'materias';
		else if (alvo === 'resumo') painel = 'resumo';
	});

	const TURNO_OPCOES: ReadonlyArray<[Turno, string]> = [
		['M', 'Manhã'],
		['T', 'Tarde'],
		['N', 'Noite']
	];

	const semTurmaEscolhida = $derived(gradeStore.selecao.size === 0);

	const rotuloCursando = $derived(
		gradeStore.incluirCursando
			? 'As matérias que você já cursa estão na grade — clique para montar sem elas'
			: 'Montando sem as matérias que você já cursa — clique para trazê-las de volta'
	);

	/**
	 * Alterna e já remonta: sem remontar, o botão muda de cor e a grade continua a
	 * mesma, o que faz o controle parecer quebrado. Remontar é o que o aluno quer
	 * dizer ao clicar.
	 */
	function alternarCursando(): void {
		gradeStore.setIncluirCursando(!gradeStore.incluirCursando);
		void montarGrade();
	}

	/** Subtítulo do cabeçalho compacto: só a oferta que está sendo usada. */
	const subtitulo = $derived(periodo ? `Turmas de ${periodo}` : 'Oferta atual');
</script>

<!--
	`pb` grande no compacto: o botão da Darcy e a pílula de suporte flutuam sobre
	o rodapé da página, e sem essa folga eles cobriam o último card da lista.
-->
<div
	class="relative z-10 mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 lg:pb-6"
	style="padding-bottom: {compacto ? 'calc(6.5rem + env(safe-area-inset-bottom, 0px))' : ''}"
>
	{#if compacto}
		<!-- Cabeçalho de uma linha: título + menu com as ações secundárias -->
		<header class="mb-2 flex items-center gap-2.5">
			<CalendarDays class="h-5 w-5 shrink-0 text-ai" />
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-base leading-tight font-bold text-foreground">Montador de Grade</h1>
				<p class="truncate text-[11px] text-muted-foreground">{subtitulo}</p>
			</div>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border bg-foreground/5 text-foreground/70 transition-colors hover:bg-foreground/10"
					aria-label="Mais ações da grade"
				>
					<MoreHorizontal class="h-4 w-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="w-60" align="end">
					<DropdownMenu.Item onclick={exportarGrade} disabled={exportando || semTurmaEscolhida}>
						{#if exportando}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
						{:else}
							<Download class="mr-2 h-4 w-4" />
						{/if}
						Exportar imagem
					</DropdownMenu.Item>
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={ROUTES.BUSCAR_TURMAS}>
								<Search class="mr-2 h-4 w-4" />
								Buscar turmas na oferta
							</a>
						{/snippet}
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={abrirTour}>
						<Compass class="mr-2 h-4 w-4" />
						Como funciona
					</DropdownMenu.Item>
					{#if onVoltarInicio}
						<DropdownMenu.Item onclick={voltarAoInicio} disabled={voltando}>
							{#if voltando}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							{:else}
								<Undo2 class="mr-2 h-4 w-4" />
							{/if}
							Voltar ao início
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Item onclick={() => gradeStore.limpar()}>
						<Trash2 class="mr-2 h-4 w-4" />
						Limpar a grade
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={limparTudo}>
						<Trash2 class="mr-2 h-4 w-4 text-destructive dark:text-red-300" />
						Limpar tudo
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</header>

		<!--
			Faixa de comando: o que se usa o tempo todo (créditos, turnos, montar)
			numa linha só, no lugar das três fileiras de pílulas de antes.
			NÃO é sticky de propósito: `overflow-x: hidden` no body e no wrapper do
			layout promove `overflow-y` para `auto` e mata `position: sticky` na
			página inteira (é o mesmo motivo de a navbar `sticky top-0` nunca grudar).
		-->
		<div
			class="-mx-3 mb-3 flex items-center gap-2 border-y border-border bg-foreground/[0.03] px-3 py-2 sm:-mx-5 sm:px-5"
		>
			<button
				type="button"
				onclick={() => unidadeCargaStore.alternar()}
				class="flex shrink-0 touch-manipulation items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-2.5 py-1 transition-colors hover:bg-foreground/10"
				data-tour="creditos"
				title="Carga escolhida contra o limite do seu plano — toque para ver em {unidadeOposta}"
			>
				<span
					class="text-[11px] tabular-nums {creditosAcima
						? 'font-semibold text-red-700 dark:text-red-300'
						: 'text-foreground/70'}"
				>
					{contadorTexto}{unidadeCargaStore.sufixo}
				</span>
				<!-- Abaixo de 380px a barrinha some para o rótulo do botão principal
				     caber inteiro; o próprio número já fica vermelho ao estourar. -->
				<span
					class="hidden h-1.5 w-9 overflow-hidden rounded-full bg-foreground/10 min-[380px]:inline-block"
				>
					<span
						class="block h-full rounded-full transition-all {creditosAcima
							? 'bg-red-600 dark:bg-red-400'
							: creditosPct > 85
								? 'bg-amber-700 dark:bg-amber-400'
								: 'bg-emerald-700 dark:bg-emerald-400'}"
						style="width: {creditosPct}%"
					></span>
				</span>
			</button>

			<div
				class="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-foreground/5 p-0.5"
				data-tour="turnos"
			>
				{#each TURNO_OPCOES as [t, label] (t)}
					{@const ativo = gradeStore.turnosPermitidos.has(t)}
					<button
						type="button"
						onclick={() => gradeStore.toggleTurno(t)}
						aria-pressed={ativo}
						aria-label="{label} — permitir ao montar a grade"
						title="{label} — permitir ao montar a grade"
						class="h-7 w-7 touch-manipulation rounded-full text-[11px] font-semibold transition-colors {ativo
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground'}"
					>
						{t}
					</button>
				{/each}
			</div>

			{#if gradeStore.temCursando}
				<button
					type="button"
					onclick={alternarCursando}
					aria-pressed={gradeStore.incluirCursando}
					aria-label={rotuloCursando}
					title={rotuloCursando}
					class="flex h-7 shrink-0 touch-manipulation items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors {gradeStore.incluirCursando
						? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100'
						: 'border-border bg-foreground/5 text-muted-foreground'}"
				>
					<GraduationCap class="h-3 w-3" />
					<span>Cursando</span>
				</button>
			{/if}
			<!-- Único botão preenchido da tela: é a ação principal, não mais uma pílula. -->
			<button
				type="button"
				onclick={montarGrade}
				disabled={montando}
				data-tour="montar"
				class="ml-auto inline-flex shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors active:bg-primary/85 dark:shadow-[0_2px_14px_rgba(168,85,247,0.4)] disabled:opacity-60"
			>
				{#if montando}
					<Loader2 class="h-3.5 w-3.5 shrink-0 animate-spin" />
					<span>Montando…</span>
				{:else}
					<Wand2 class="h-3.5 w-3.5 shrink-0" />
					<span>Montar grade</span>
					{#if gradeStore.temPrioritarias}<Star
							class="h-3 w-3 shrink-0 fill-current text-amber-200"
						/>{/if}
				{/if}
			</button>
		</div>
	{:else}
		<!-- Cabeçalho -->
		<header
			class="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
		>
			<div class="flex items-center gap-2.5">
				<CalendarDays class="h-6 w-6 shrink-0 text-ai" />
				<div>
					<h1 class="text-lg font-bold text-foreground sm:text-xl">Montador de Grade</h1>
					<!-- `&nbsp;` porque o Svelte come o espaço no começo do bloco `{#if}` e
					     o texto saía grudado ("semestre· 2026.1"). -->
					<!-- O Montador não diz mais qual semestre monta. Ele monta uma grade com a
					     oferta real publicada; quem estima o que pegar em cada semestre até
					     formar é o Plano de Formatura. Prometer "próximo semestre" aqui era o
					     que fazia a grade brigar com as matérias já matriculadas. -->
					<p class="text-xs text-muted-foreground">
						{#if periodo}Turmas de <span class="font-mono">{periodo}</span>{:else}Oferta atual{/if}
					</p>
				</div>
			</div>

			<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto">
				<HelpTip
					side="bottom"
					title="Carga do semestre"
					text="Soma da carga das turmas já escolhidas contra o limite do seu plano. A barra fica amarela perto do limite e vermelha se passar. Clique no contador para alternar entre horas e créditos."
				>
					<button
						type="button"
						onclick={() => unidadeCargaStore.alternar()}
						class="flex touch-manipulation items-center gap-2 rounded-full border border-border bg-foreground/5 px-3 py-1 transition-colors hover:bg-foreground/10"
						data-tour="creditos"
						title="Mostrar em {unidadeOposta}"
					>
						<span class="text-xs {creditosAcima ? 'font-semibold text-red-700 dark:text-red-300' : 'text-foreground/70'}">
							{contadorTexto}
							{unidadeCargaStore.sufixo}
						</span>
						<span class="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/10">
							<span
								class="block h-full rounded-full transition-all {creditosAcima
									? 'bg-red-600 dark:bg-red-400'
									: creditosPct > 85
										? 'bg-amber-700 dark:bg-amber-400'
										: 'bg-emerald-700 dark:bg-emerald-400'}"
								style="width: {creditosPct}%"
							></span>
						</span>
					</button>
				</HelpTip>
				<div
					class="flex items-center gap-0.5 rounded-full border border-border bg-foreground/5 p-0.5"
					data-tour="turnos"
					title="Turnos permitidos ao montar a grade"
				>
					{#each TURNO_OPCOES as [t, label] (t)}
						{@const ativo = gradeStore.turnosPermitidos.has(t)}
						<button
							type="button"
							onclick={() => gradeStore.toggleTurno(t)}
							aria-pressed={ativo}
							class="touch-manipulation rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors {ativo
								? 'bg-accent text-accent-foreground'
								: 'text-muted-foreground hover:text-foreground/70'}"
						>
							{label}
						</button>
					{/each}
				</div>

				{#if gradeStore.temCursando}
					<HelpTip
						side="bottom"
						title="Matérias que você já cursa"
						text="Ligado, elas ocupam a grade e não podem ser cortadas — é a sua semana de verdade. Desligado, a grade é montada como se elas não existissem, liberando horário e créditos para o que você ainda vai pegar. Nos dois casos elas seguem valendo como pré-requisito cumprido."
					>
						<button
							type="button"
							onclick={alternarCursando}
							aria-pressed={gradeStore.incluirCursando}
							class="flex touch-manipulation items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors {gradeStore.incluirCursando
								? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100'
								: 'border-border bg-foreground/5 text-muted-foreground hover:text-foreground/70'}"
						>
							<GraduationCap class="h-3.5 w-3.5" />
							<span>{gradeStore.incluirCursando ? 'Incluindo cursando' : 'Sem as cursando'}</span>
						</button>
					</HelpTip>
				{/if}
				<HelpTip
					side="bottom"
					title="Montar grade"
					text={gradeStore.temPrioritarias
						? 'Traz as matérias que faltam na lista (do seu plano ou, na falta dele, da sua matriz) e encaixa tudo sem conflito de horário, começando pelas marcadas com estrela.'
						: 'Traz as matérias que faltam na lista (do seu plano ou, na falta dele, da sua matriz) e encaixa tudo sem conflito de horário, respeitando os turnos escolhidos. Marque estrela numa matéria para ela entrar primeiro.'}
				>
					<!-- Único botão preenchido da barra: é a ação principal da tela. -->
					<button
						type="button"
						onclick={montarGrade}
						disabled={montando}
						data-tour="montar"
						class="inline-flex touch-manipulation items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 dark:shadow-[0_2px_14px_rgba(168,85,247,0.4)] disabled:opacity-60"
					>
						{#if montando}
							<Loader2 class="h-3.5 w-3.5 animate-spin" /> Montando…
						{:else}
							<Wand2 class="h-3.5 w-3.5" /> Montar grade
							{#if gradeStore.temPrioritarias}<Star
									class="h-3 w-3 fill-current text-amber-200"
								/>{/if}
						{/if}
					</button>
				</HelpTip>
				<HelpTip
					side="bottom"
					title="Exportar"
					text="Baixa a grade como imagem PNG — boa pra mandar no grupo do curso ou conferir na hora da matrícula."
				>
					<button
						type="button"
						onclick={exportarGrade}
						disabled={exportando || semTurmaEscolhida}
						data-tour="exportar"
						class="inline-flex touch-manipulation items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/10 disabled:opacity-40"
					>
						{#if exportando}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Download
								class="h-3.5 w-3.5"
							/>{/if} Exportar
					</button>
				</HelpTip>
				<HelpTip
					side="bottom"
					title="Buscar turmas"
					text="Procura na oferta inteira do semestre por professor, horário ou sala — inclusive matérias que não estão na sua matriz."
				>
					<a
						href={ROUTES.BUSCAR_TURMAS}
						class="inline-flex touch-manipulation items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/10"
					>
						<Search class="h-3.5 w-3.5" /> Buscar turmas
					</a>
				</HelpTip>
				{#if onVoltarInicio}
					<HelpTip
						side="bottom"
						title="Voltar ao início"
						text="Refaz o preenchimento automático da primeira visita: as matérias em que você já está matriculado (com a turma real do SIGAA) e as recomendadas do seu plano. Descarta as edições feitas aqui."
					>
						<button
							type="button"
							onclick={voltarAoInicio}
							disabled={voltando}
							class="inline-flex touch-manipulation items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/10 disabled:opacity-60"
						>
							{#if voltando}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Undo2
									class="h-3.5 w-3.5"
								/>{/if} Voltar ao início
						</button>
					</HelpTip>
				{/if}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="inline-flex touch-manipulation items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/10"
					>
						<Trash2 class="h-3.5 w-3.5" /> Limpar
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="w-64" align="end">
						<DropdownMenu.Item onclick={() => gradeStore.limpar()}>
							<Trash2 class="mr-2 h-4 w-4" />
							<div class="flex flex-col">
								<span>Limpar a grade</span>
								<span class="text-[11px] text-muted-foreground">Tira só as turmas escolhidas</span>
							</div>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={limparTudo}>
							<Trash2 class="mr-2 h-4 w-4 text-destructive dark:text-red-300" />
							<div class="flex flex-col">
								<span>Limpar tudo</span>
								<span class="text-[11px] text-muted-foreground">Esvazia a lista de matérias e a grade</span>
							</div>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
				<HelpTip
					side="bottom"
					title="Tour guiado"
					text="Refaz o passo a passo do montador quando quiser."
				>
					<button
						type="button"
						onclick={abrirTour}
						class="inline-flex touch-manipulation items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-primary/20"
					>
						<Compass class="h-3.5 w-3.5" /> Como funciona
					</button>
				</HelpTip>
			</div>
		</header>
	{/if}

	<!--
		Slider dedicado numa linha própria: a barra de comando do compacto já vive no
		limite da largura (a barrinha decorativa da pílula some abaixo de 380px), sem
		espaço sobrando pra um alvo de arrastar. Aqui, largura cheia, cabe em qualquer
		tela — e vale só nesta sessão, não mexe no limite salvo no plano.
	-->
	<div
		class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-border bg-card dark:bg-background/80 px-3 py-2.5"
	>
		<HelpTip
			side="bottom"
			title="Limite de carga desta montagem"
			text="Arraste pra ver o que cabe com menos carga — a grade se ajusta na hora, tirando primeiro as matérias sem estrela (a de maior carga primeiro). Vale só nesta tela; não muda o limite do seu plano de formatura. Clique na unidade ao lado pra alternar entre horas e créditos."
		>
			<span class="shrink-0 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
				>Limite</span
			>
		</HelpTip>
		<input
			type="range"
			min={LIMITE_CREDITOS_MIN}
			max={LIMITE_CREDITOS_MAX}
			step="1"
			value={limiteSessao}
			oninput={(e) => moverSliderCreditos(Number((e.currentTarget as HTMLInputElement).value))}
			class="h-1.5 min-w-[8rem] flex-1 touch-manipulation accent-primary"
			aria-label="Limite de carga desta montagem"
		/>
		<span
			class="shrink-0 text-xs tabular-nums {creditosAcima
				? 'font-semibold text-red-700 dark:text-red-300'
				: 'text-foreground/70'}"
		>
			{contadorTexto}
		</span>
		<button
			type="button"
			onclick={() => unidadeCargaStore.alternar()}
			class="shrink-0 touch-manipulation rounded text-xs text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground/80"
			title="Mostrar em {unidadeOposta}"
		>
			{unidadeCargaStore.unidade}
		</button>
	</div>

	<div class="mb-3">
		<CenarioSwitcher />
	</div>

	{#if confirmacaoProfessor}
		<div
			class="mb-3 flex flex-col gap-2 rounded-xl border border-ai/30 bg-ai-soft px-3 py-2.5 text-xs text-ai dark:border-pink-300/35 dark:bg-pink-500/10 dark:text-pink-100 sm:flex-row sm:items-center sm:justify-between"
		>
			<span class="flex items-start gap-2">
				<Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
				Rearranjei a grade pra tentar encaixar <strong>{confirmacaoProfessor.resumo}</strong> — confere
				se ficou bom.
			</span>
			<div class="flex shrink-0 items-center gap-2 self-end sm:self-auto">
				<button
					type="button"
					onclick={onRecusarConfirmacaoProfessor}
					class="inline-flex touch-manipulation items-center gap-1 rounded-full border border-border bg-foreground/5 px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:bg-foreground/10"
				>
					<Undo2 class="h-3 w-3" /> Manter grade anterior
				</button>
				<button
					type="button"
					onclick={onAceitarConfirmacaoProfessor}
					class="inline-flex touch-manipulation items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-300/40 dark:bg-emerald-500/20 dark:text-emerald-100 dark:hover:bg-emerald-500/30"
				>
					<Check class="h-3 w-3" /> Aceitar
				</button>
			</div>
		</div>
	{/if}

	{#if gradeStore.ultimaMontagem && gradeStore.ultimaMontagem.naoAlocadas.length > 0}
		<div
			class="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-300/30 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
		>
			<Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
			<span
				>Não coube sem conflito: <strong>{gradeStore.ultimaMontagem.naoAlocadas.join(', ')}</strong
				>. Ajuste manualmente.</span
			>
		</div>
	{/if}

	{#if gradeStore.ultimaMontagem?.truncado}
		<div
			class="mb-3 flex items-start gap-2 rounded-xl border border-border bg-foreground/5 px-3 py-2 text-xs text-foreground/70"
		>
			<Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
			<span>
				São muitas combinações possíveis — paramos numa grade boa, sem conflito, mas talvez não a
				melhor. Marque estrela nas matérias essenciais e monte de novo.
			</span>
		</div>
	{/if}

	<!--
		As três áreas viram snippets para poderem ser rearranjadas sem duplicação:
		no desktop o calendário fica ao centro com matérias à esquerda e resumo à
		direita (ordem 1→2→3→4 do tour); ampliado ele ocupa a largura toda; no
		compacto ele abre a tela e matérias/resumo viram abas logo abaixo.
	-->
	{#snippet painelSituacao(ehCompacto: boolean)}
		<SituacaoPanel
			{situacao}
			carregando={situacaoCarregando}
			compacto={ehCompacto}
			{obrigatoriasSemOferta}
			{periodo}
			{moduloLivre}
			{buscandoModuloLivre}
			sugestoes={sugestoesModuloLivre}
			{naGrade}
			{onResponderModuloLivre}
			{onBuscarModuloLivre}
			onIncluir={onAdd}
		/>
	{/snippet}

	{#snippet colunaMaterias()}
		<MateriaSearchAdd {onAdd} {compacto} />
		{#if aviso}
			<p
				class="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-300/30 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100"
			>
				{aviso}
			</p>
		{/if}

		<!--
			O aviso de obrigatória sem oferta vive no painel de Situação: é informação
			sobre a formatura do aluno, não sobre a lista de turmas, e repeti-la nos
			dois lugares só faria o mesmo texto competir consigo mesmo.
		-->
		{#if gradeStore.pool.length === 0}
			<div class="rounded-2xl border border-border bg-card dark:bg-background/80 px-3 py-6 text-center">
				<p class="text-xs text-muted-foreground">
					Use “Montar grade” para trazer as matérias do seu plano, busque uma acima ou peça
					recomendações ao assistente (botão flutuante).
				</p>
				<button
					type="button"
					onclick={abrirTour}
					class="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-accent-foreground transition-colors hover:bg-primary/20"
				>
					<Compass class="h-3.5 w-3.5" /> Ver o passo a passo
				</button>
			</div>
		{:else}
			<div class="flex items-center justify-between gap-2 px-1 pt-1">
				<p class="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
					{compacto ? 'Turmas' : '2 · Turmas'}
				</p>
				<HelpTip
					title="Escolha uma turma por matéria"
					text="Clique numa turma para colocá-la na grade; clicar de novo tira. A estrela marca a matéria como prioritária ao montar."
				/>
			</div>
			<SubjectTurmaSelector />
		{/if}
	{/snippet}

	{#snippet calendario()}
		<div class="mb-1.5 flex items-center justify-between px-1">
			<p class="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
				{compacto ? 'Sua semana' : '3 · Sua semana'}
			</p>
			<HelpTip
				side="left"
				title={calendarioExpandido ? 'Voltar ao layout compacto' : 'Ampliar o calendário'}
				text={calendarioExpandido
					? 'Traz matérias e resumo de volta para o lado do calendário.'
					: 'O calendário ocupa a tela inteira e os painéis descem — melhor pra enxergar a semana toda.'}
			>
				<button
					type="button"
					onclick={() => (calendarioExpandido = !calendarioExpandido)}
					data-tour="ampliar"
					class="hidden touch-manipulation items-center gap-1 rounded-full border border-border bg-foreground/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-foreground/10 lg:inline-flex"
				>
					{#if calendarioExpandido}
						<Minimize2 class="h-3 w-3" /> Reduzir
					{:else}
						<Maximize2 class="h-3 w-3" /> Ampliar
					{/if}
				</button>
			</HelpTip>
		</div>
		<ScheduleGrid onBlocoClick={(codigo) => (materiaDialog = codigo)} />
	{/snippet}

	{#if compacto}
		{@render calendario()}

		<!--
			Abas em vez de empilhar: o resumo ficava depois de toda a lista de turmas,
			a mais de três telas de rolagem de onde ele é útil.
		-->
		<div class="mt-4">
			<div
				class="mb-3 flex gap-1 rounded-full border border-border bg-foreground/5 p-1"
				role="tablist"
				aria-label="Painéis do montador"
			>
				<button
					type="button"
					role="tab"
					aria-selected={painel === 'materias'}
					onclick={() => (painel = 'materias')}
					class="flex flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors {painel ===
					'materias'
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground'}"
				>
					<BookMarked class="h-3.5 w-3.5" />
					Matérias
					<span class="rounded-full bg-foreground/10 px-1.5 text-[10px] text-muted-foreground tabular-nums">
						{gradeStore.pool.length}
					</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={painel === 'resumo'}
					onclick={() => (painel = 'resumo')}
					class="flex flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors {painel ===
					'resumo'
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground'}"
				>
					<ListChecks class="h-3.5 w-3.5" />
					Na grade
					<span class="rounded-full bg-foreground/10 px-1.5 text-[10px] text-muted-foreground tabular-nums">
						{gradeStore.selecao.size}
					</span>
				</button>
				<!--
					Só ícone: com três abas em `flex-1`, "Situação" por extenso não cabe
					abaixo de 380px sem espremer os outros dois rótulos.
				-->
				<button
					type="button"
					role="tab"
					aria-selected={painel === 'situacao'}
					onclick={() => (painel = 'situacao')}
					aria-label="Situação — o que falta para você se formar"
					title="Situação — o que falta para você se formar"
					class="flex touch-manipulation items-center justify-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors {painel ===
					'situacao'
						? 'bg-accent text-accent-foreground'
						: 'text-muted-foreground'}"
				>
					<GraduationCap class="h-3.5 w-3.5" />
					{#if temPerguntaModuloLivre}
						<!-- Um ponto, não um "1": não é contagem, é "tem coisa aqui pra você". -->
						<span class="h-1.5 w-1.5 rounded-full bg-amber-700 dark:bg-amber-400"></span>
					{/if}
				</button>
			</div>

			{#if painel === 'materias'}
				<div class="space-y-3">{@render colunaMaterias()}</div>
			{:else if painel === 'situacao'}
				{@render painelSituacao(true)}
			{:else}
				<GradeResumo compacto />
			{/if}
		</div>
	{:else if calendarioExpandido}
		<div class="space-y-4">
			<div>{@render calendario()}</div>
			<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<div class="space-y-3">{@render colunaMaterias()}</div>
				<div class="space-y-3">
					{@render painelSituacao(false)}
					<GradeResumo />
				</div>
			</div>
		</div>
	{:else}
		<div class="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)_18rem]">
			<!-- Coluna esquerda: matérias + busca -->
			<div
				class="order-2 space-y-3 lg:sticky lg:top-24 lg:order-1 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:pr-0.5"
			>
				{@render colunaMaterias()}
			</div>

			<!-- Centro: calendário -->
			<div class="order-1 lg:order-2">{@render calendario()}</div>

			<!--
				Direita: situação e resumo. A situação vem primeiro porque é contexto —
				o que falta para se formar se lê antes do que a grade ficou. No desktop
				não há abas: as duas ficam visíveis ao mesmo tempo.
			-->
			<div class="order-3 space-y-3">
				{@render painelSituacao(false)}
				<GradeResumo />
			</div>
		</div>
	{/if}
</div>

<TrocarTurmaDialog codigo={materiaDialog} onClose={() => (materiaDialog = null)} />

<!-- Onboarding guiado (spotlight + coach marks) -->
<OnboardingTour />
