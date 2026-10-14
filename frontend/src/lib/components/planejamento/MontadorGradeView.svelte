<script lang="ts">
	import { browser } from '$app/environment';
	import ScheduleGrid from './ScheduleGrid.svelte';
	import MateriasPanel from './MateriasPanel.svelte';
	import AnaliseGradePanel from './AnaliseGradePanel.svelte';
	import MateriaSearchAdd from './MateriaSearchAdd.svelte';
	import SituacaoPanel from './SituacaoPanel.svelte';
	import TrocarTurmaDialog from './TrocarTurmaDialog.svelte';
	import MontadorParametros, { type ParametrosMontagem } from './MontadorParametros.svelte';
	import ResponsiveSheet from '$lib/components/ui/ResponsiveSheet.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { gradeStore } from '$lib/stores/grade.store.svelte';
	import { unidadeCargaStore, HORAS_POR_CREDITO } from '$lib/stores/unidade-carga.store.svelte';
	import { preferenciasGradeService } from '$lib/services/preferencias-grade.service';
	import type { OpcoesSemeadura, SemeaduraResultado } from '$lib/services/grade-pool.service';
	import type { SituacaoAcademica } from '$lib/services/situacao-academica.service';
	import type { Turno, ErroMontagem } from '$lib/utils/horario-slots';
	import { ROUTES } from '$lib/config/routes';
	import { LIMITE_CREDITOS_MAX, LIMITE_CREDITOS_MIN } from '$lib/types/plano-formatura';
	import {
		Sparkles,
		Plus,
		SlidersHorizontal,
		Download,
		Share2,
		Eye,
		FileText,
		MoreHorizontal,
		Loader2,
		Search,
		Compass,
		Undo2,
		Trash2,
		Info,
		Check,
		X,
		CalendarDays,
		BookMarked,
		ChartColumn
	} from 'lucide-svelte';
	import OnboardingTour from '$lib/components/onboarding/OnboardingTour.svelte';
	import { tourStore, type TourStep } from '$lib/components/onboarding/tour.store.svelte';
	import { toast } from 'svelte-sonner';
	import {
		abrirArquivo,
		baixarArquivo,
		compartilharArquivo,
		gerarGradePdf,
		montarModeloGradePdf,
		podeCompartilharArquivo,
		type MateriaPdf
	} from '$lib/utils/grade-pdf';

	/**
	 * Corpo do Montador de Grade — tudo que aparece depois que o pool carregou.
	 * Fica separado da rota para (a) a página cuidar só de auth/carregamento e
	 * (b) o harness de dev (`/dev/grade-mobile`) montar a mesma tela com dados
	 * falsos, sem backend, para conferir o layout no celular.
	 *
	 * Layout da repaginação (protótipo Figma "High Fidelity UI Design"): barra de
	 * ações (montar / manual / carga / preferências / exportar), e embaixo três
	 * colunas — suas matérias, a semana, a análise. No celular a semana vira lista
	 * por dia e as colunas laterais saem para a navegação inferior.
	 */
	let {
		periodo,
		periodoAtual = null,
		ofertaProximo = null,
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
		/** Período vigente; `periodo` pode ser o próximo, em "Próximo semestre". */
		periodoAtual?: string | null;
		/** O semestre seguinte e se a oferta dele já foi coletada. */
		ofertaProximo?: { periodo: string; temOferta: boolean } | null;
		limiteCreditos: number;
		onAdd: (codigo: string) => void;
		/**
		 * Enche a lista com o que dá para montar — recomendadas do plano e, se o plano
		 * não render nada, matérias da matriz — e devolve o que entrou, por procedência.
		 * Quem sabe do plano e da matriz é a rota, não a view.
		 */
		onSemear?: (opcoes?: OpcoesSemeadura) => Promise<SemeaduraResultado>;
		/**
		 * Refaz o preenchimento automático da primeira visita (recomendadas do plano
		 * + matrículas reais do histórico), descartando edições. O harness de dev não
		 * passa e a ação some do menu.
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
		/** O aluno mudou o limite de carga. Quem persiste é a rota. */
		onLimiteCreditos?: (creditos: number) => void;
	} = $props();

	/**
	 * Layout de celular abaixo de `md`: lista por dia + navegação inferior. É
	 * decisão de estrutura, não de estilo — renderizar os dois e esconder um por
	 * CSS duplicaria os alvos `data-tour` e o `#grade-export`.
	 */
	let compacto = $state(false);
	$effect(() => {
		if (!browser) return;
		const mq = window.matchMedia('(max-width: 767px)');
		const aplicar = () => (compacto = mq.matches);
		aplicar();
		mq.addEventListener('change', aplicar);
		return () => mq.removeEventListener('change', aplicar);
	});

	type Painel = 'gerar' | 'manual' | 'preferencias' | 'materias' | 'progresso' | 'pdf' | null;
	let painel = $state<Painel>(null);
	let materiaDialog = $state<string | null>(null);

	// ---------------------------------------------------------------------------
	// Carga do semestre
	// ---------------------------------------------------------------------------
	/**
	 * Limite de créditos em uso na tela. Começa no do plano e é o que a montagem
	 * obedece; mexer no slider salva a escolha (`onLimiteCreditos`), porque limite
	 * de carga é preferência do aluno, não estado de sessão.
	 */
	let limiteSessao = $state(limiteCreditos);
	$effect(() => {
		limiteSessao = limiteCreditos;
	});

	const creditosPct = $derived(
		limiteSessao > 0 ? Math.min(100, (gradeStore.creditosSelecionados / limiteSessao) * 100) : 0
	);
	const creditosAcima = $derived(gradeStore.creditosSelecionados > limiteSessao);
	const cargaTexto = $derived(
		`${gradeStore.creditosSelecionados * HORAS_POR_CREDITO}/${limiteSessao * HORAS_POR_CREDITO} h · ${gradeStore.creditosSelecionados}/${limiteSessao} créditos`
	);
	let cargaPopover = $state(false);

	// Arrastar reajusta a grade ao vivo, mas só depois de soltar um pouco — a cada
	// pixel tiraria matéria demais de uma vez, sem o aluno ver o que aconteceu.
	let debounceLimite: ReturnType<typeof setTimeout> | undefined;
	function moverSliderCreditos(valor: number): void {
		limiteSessao = valor;
		clearTimeout(debounceLimite);
		debounceLimite = setTimeout(() => {
			gradeStore.ajustarParaLimite(valor);
			onLimiteCreditos?.(valor);
		}, 250);
	}

	// ---------------------------------------------------------------------------
	// Opções (cenários)
	// ---------------------------------------------------------------------------
	const tituloSemana = $derived(gradeStore.cenarioAtivo?.nome ?? 'Sua grade');
	const naoCouberam = $derived(gradeStore.ultimaMontagem?.naoAlocadas.length ?? 0);

	// ---------------------------------------------------------------------------
	// Gerar grade (painel "Montar grade")
	// ---------------------------------------------------------------------------
	let parametrosAtuais = $state<ParametrosMontagem | null>(null);
	let gerandoOpcoes = $state(false);
	let avisoEssencial = $state<string | null>(null);

	/**
	 * Semeia o que falta na lista, guarda a preferência de professor da essencial e
	 * gera as três opções — que viram as abas "Opção 1/2/3" no lugar das geradas
	 * antes (senão cada clique empilhava mais três abas). A estratégia preferida
	 * entra aplicada; as outras ficam a um clique.
	 */
	async function handleGerarOpcoes(params: ParametrosMontagem): Promise<void> {
		if (gerandoOpcoes) return;
		gerandoOpcoes = true;
		parametrosAtuais = params;
		try {
			await onSemear?.({
				limiteCreditos: params.limiteCreditos,
				escopo: params.escopo,
				essencial: params.essencial,
				apenasObrigatorias: params.apenasObrigatorias
			});

			if (params.essencial && params.professorPreferidoEssencial) {
				void preferenciasGradeService.salvar(params.essencial, {
					turnos: params.turnosEssencial,
					docente: params.professorPreferidoEssencial
				});
			}

			const opts = {
				limiteCreditos: params.limiteCreditos,
				essencial: params.essencial ?? undefined,
				professorPreferidoEssencial: params.professorPreferidoEssencial ?? undefined,
				turnosEssencial: params.turnosEssencial,
				apenasObrigatorias: params.apenasObrigatorias
			};
			gradeStore.setMontagemSoObrigatorias(params.apenasObrigatorias);
			const opcoes = gradeStore.montarOpcoes({ ...opts, estrategias: params.estrategias });

			// Travada com turma (a matrícula real) não passa pelo solver — vira horário
			// já ocupado e entra em todas as opções por `popularOpcoes`. Já está na grade.
			const essencial = params.essencial;
			const essencialCoube =
				!essencial ||
				(gradeStore.isTravada(essencial) && !!gradeStore.turmaSelecionada(essencial)) ||
				opcoes.some((o) => o.resultado.selecao.has(essencial));
			avisoEssencial = essencialCoube ? null : motivoEssencial(essencial!, opts, opcoes);

			if (opcoes.length === 0) {
				toast.warning(avisoEssencial ?? 'Não consegui montar nenhuma opção com esses parâmetros.');
				return;
			}

			for (const g of [...gradeStore.grades]) {
				if (g.origem === 'opcao-solver' && gradeStore.grades.length > 1) gradeStore.removerCenario(g.id);
			}
			gradeStore.popularOpcoes(opcoes);
			const preferida =
				gradeStore.grades.find(
					(g) => g.origem === 'opcao-solver' && g.nome === params.estrategiaPreferida
				) ?? gradeStore.grades.find((g) => g.origem === 'opcao-solver');
			if (preferida) gradeStore.selecionarCenario(preferida.id);

			limiteSessao = params.limiteCreditos;
			onLimiteCreditos?.(params.limiteCreditos);
			painel = null;
			const n = gradeStore.selecao.size;
			if (n === 0) {
				toast.warning(
					gradeStore.temCursando && !gradeStore.incluirCursando
						? 'A grade saiu vazia: sua lista só tem matérias que você já cursa, e elas estão fora da montagem. Escolha “Este semestre” em “Para qual semestre?” ou adicione outras matérias.'
						: 'A grade saiu vazia: nenhuma matéria da lista tem turma que caiba na carga e nos turnos escolhidos.'
				);
				return;
			}
			toast.success(
				`${opcoes.length} ${opcoes.length === 1 ? 'opção gerada' : 'opções geradas'} — aplicada: ${preferida?.nome ?? opcoes[0].estrategia} (${n} ${n === 1 ? 'matéria' : 'matérias'}).`
			);
			if (avisoEssencial) toast.warning(avisoEssencial);
		} catch {
			toast.error('Não consegui gerar as opções agora. Tente de novo.');
		} finally {
			gerandoOpcoes = false;
		}
	}

	/**
	 * Tira uma opção gerada das abas. Só aparece com duas ou mais (o seletor some
	 * com uma), então nunca apaga a última grade. Matéria da lista não é afetada:
	 * só sai aquela combinação de turmas.
	 */
	function excluirOpcao(id: string, indice: number): void {
		const nome = gradeStore.grades.find((g) => g.id === id)?.nome ?? `Grade ${indice + 1}`;
		gradeStore.removerCenario(id);
		toast.info(`"${nome}" excluída.`);
	}

	/** Assinatura da seleção atual — para saber se a montagem mudou alguma coisa. */
	function assinaturaSelecao(): string {
		return [...gradeStore.selecao]
			.map(([codigo, tg]) => `${codigo}:${tg.turma.id_turmas}`)
			.sort()
			.join('|');
	}

	let remontando = $state(false);

	/**
	 * Remonta a grade ativa depois de mudar preferências (turnos, matérias em curso).
	 * Termina sempre num toast: o motor costuma acertar de primeira, e sem uma
	 * resposta explícita "nada mudou" é indistinguível de um botão morto.
	 */
	async function remontar(): Promise<void> {
		if (remontando) return;
		remontando = true;
		try {
			const semeadas = (await onSemear?.({ limiteCreditos: limiteSessao })) ?? {
				adicionadas: [],
				obrigatoriasSemOferta: [],
				pendentesSemOferta: 0
			};
			if (!gradeStore.pool.some((m) => m.turmas.length > 0)) {
				toast.warning(
					gradeStore.pool.length > 0
						? `Nenhuma matéria da sua lista tem turma em ${periodo ?? 'neste semestre'}.`
						: 'Não achei matérias com turma neste semestre. Adicione uma manualmente.'
				);
				return;
			}
			const antes = assinaturaSelecao();
			const resultado = gradeStore.montarAutomatico({ limiteCreditos: limiteSessao });
			const materias = gradeStore.selecao.size;
			if (materias === 0) {
				toast.warning(
					resultado.candidatas === 0
						? (semeadas.pendentesSemOferta ?? 0) > 0
							? `Nenhuma das suas matérias pendentes tem turma em ${periodo ?? 'neste período'}.`
							: gradeStore.temCursando && !gradeStore.incluirCursando
								? 'Sua lista só tem matérias que você já cursa, e elas estão fora da montagem.'
								: 'Não sobrou nenhuma matéria para montar. Adicione uma manualmente.'
						: `Nenhuma matéria coube em ${limiteSessao} créditos e nos turnos escolhidos.`
				);
				return;
			}
			const resumo = `${materias} ${materias === 1 ? 'matéria' : 'matérias'} · ${unidadeCargaStore.formatar(gradeStore.creditosSelecionados)}`;
			if (assinaturaSelecao() !== antes || semeadas.adicionadas.length > 0) {
				toast.success(`Grade remontada: ${resumo}.`);
			} else {
				toast.info(`Nada mudou: a grade já é o melhor encaixe (${resumo}).`);
			}
		} catch {
			toast.error('Não consegui montar a grade agora. Tente de novo.');
		} finally {
			remontando = false;
		}
	}

	// ---------------------------------------------------------------------------
	// Preferências (gaveta)
	// ---------------------------------------------------------------------------
	const UNIDADES = [
		['horas', 'Horas'],
		['creditos', 'Créditos']
	] as const;

	const TURNO_OPCOES: ReadonlyArray<[Turno, string]> = [
		['M', 'Aulas de manhã'],
		['T', 'Aulas à tarde'],
		['N', 'Aulas à noite']
	];

	/** Turnos/em-curso ao abrir a gaveta — só remonta se algo disso mudou. */
	let preferenciasAoAbrir = '';
	function assinaturaPreferencias(): string {
		return `${[...gradeStore.turnosPermitidos].sort().join('')}|${gradeStore.incluirCursando}`;
	}
	function abrirPreferencias(): void {
		preferenciasAoAbrir = assinaturaPreferencias();
		painel = 'preferencias';
	}
	function aplicarPreferencias(): void {
		painel = null;
		if (assinaturaPreferencias() !== preferenciasAoAbrir && gradeStore.pool.length > 0) void remontar();
	}

	// ---------------------------------------------------------------------------
	// Montagem manual
	// ---------------------------------------------------------------------------
	let poolAoAbrirManual = 0;
	function abrirManual(): void {
		poolAoAbrirManual = gradeStore.pool.length;
		painel = 'manual';
	}
	const adicionadasNoManual = $derived(
		painel === 'manual' ? Math.max(0, gradeStore.pool.length - poolAoAbrirManual) : 0
	);

	// ---------------------------------------------------------------------------
	// Ações secundárias
	// ---------------------------------------------------------------------------
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

	function limparTudo(): void {
		gradeStore.limparTudo();
		toast.info('Tudo limpo. "Voltar ao início" refaz o preenchimento automático.');
	}

	let exportando = $state(false);

	function modeloPdfAtual() {
		const materias: MateriaPdf[] = [];
		for (const [codigo, t] of gradeStore.selecao) {
			const m = gradeStore.pool.find((p) => p.codigo === codigo);
			const ofertada = m?.turmas.find((x) => x.turma.id_turmas === t.turma.id_turmas);
			materias.push({
				codigo,
				nome: m?.nome ?? codigo,
				creditos: m?.creditos ?? 0,
				turma: t.turma,
				mask: t.mask,
				codigoOfertado: ofertada?.codigoOfertado,
				cor: Math.max(0, gradeStore.pool.findIndex((p) => p.codigo === codigo))
			});
		}
		return montarModeloGradePdf({ titulo: tituloSemana, periodo: periodo ?? null, materias });
	}

	/** Desktop: PDF da grade (`$lib/utils/grade-pdf`) direto para download. */
	async function exportarGrade(): Promise<void> {
		if (exportando || semTurmaEscolhida) return;
		exportando = true;
		try {
			baixarArquivo(await gerarGradePdf(modeloPdfAtual()));
		} catch {
			toast.error('Não consegui gerar o PDF. Tente de novo.');
		} finally {
			exportando = false;
		}
	}

	/**
	 * Celular: abre a folha "PDF da grade" e já gera o arquivo, para o aluno escolher
	 * como receber. Gerar ANTES da escolha é o que faz o compartilhamento funcionar no
	 * Safari, que só abre a folha do sistema logo após um toque.
	 */
	let pdfPronto = $state<File | null>(null);
	let pdfFalhou = $state(false);
	async function abrirOpcoesPdf(): Promise<void> {
		if (semTurmaEscolhida) return;
		painel = 'pdf';
		pdfPronto = null;
		pdfFalhou = false;
		exportando = true;
		try {
			pdfPronto = await gerarGradePdf(modeloPdfAtual());
		} catch {
			pdfFalhou = true;
		} finally {
			exportando = false;
		}
	}
	const podeCompartilharPdf = $derived(pdfPronto !== null && podeCompartilharArquivo(pdfPronto));

	async function compartilharPdf(): Promise<void> {
		if (!pdfPronto) return;
		const r = await compartilharArquivo(pdfPronto, tituloSemana);
		if (r === 'ok') painel = null;
		else if (r !== 'cancelado') toast.error('Não consegui abrir o compartilhamento. Use "Baixar PDF".');
	}
	function baixarPdf(): void {
		if (!pdfPronto) return;
		baixarArquivo(pdfPronto);
		painel = null;
	}
	function visualizarPdf(): void {
		if (!pdfPronto) return;
		if (!abrirArquivo(pdfPronto)) baixarArquivo(pdfPronto);
		painel = null;
	}

	const semTurmaEscolhida = $derived(gradeStore.selecao.size === 0);

	function nomeMateria(codigo: string): string {
		return gradeStore.pool.find((m) => m.codigo === codigo)?.nome ?? codigo;
	}

	const TURNO_LABEL: Record<Turno, string> = { M: 'manhã', T: 'tarde', N: 'noite' };

	/** Traduz cada `ErroMontagem` pra uma frase em português — nunca mostrar o `tipo` cru. */
	function mensagemErro(erro: ErroMontagem): string {
		const nome = nomeMateria(erro.chave);
		switch (erro.tipo) {
			// Vaga não filtra mais a montagem: "sem vaga" aqui é "sem turma nenhuma".
			case 'ESSENCIAL_SEM_VAGA':
				return `${nome} não tem turma neste período.`;
			case 'ESSENCIAL_FORA_DO_TURNO': {
				const turnos = erro.turnosComOferta.map((t) => TURNO_LABEL[t]).join(' ou ');
				return turnos
					? `${nome} só tem turma de ${turnos} — fora dos turnos escolhidos.`
					: `${nome} não tem turma nos turnos escolhidos.`;
			}
			case 'ESSENCIAL_PRE_REQUISITO':
				return `${nome} tem pré-requisito pendente: ${erro.pendencias.join(', ')}.`;
			case 'ESSENCIAL_CONFLITO':
				return erro.colideCom.length > 0
					? `${nome} colide de horário com ${erro.colideCom.map(nomeMateria).join(', ')}.`
					: `${nome} não coube por conflito de horário.`;
			default:
				return `Não consegui encaixar ${nome}.`;
		}
	}

	/**
	 * Por que a essencial ficou de fora de todas as opções, com a causa medida
	 * (turno, pré-requisito, conflito, sem turma) — não um "pode ser X, Y ou Z".
	 */
	function motivoEssencial(
		codigo: string,
		opts: Parameters<typeof gradeStore.diagnosticarEssencialDasOpcoes>[0],
		opcoes: Array<{ resultado: { naoAlocadas: string[] } }>
	): string {
		const naoAlocadas = opcoes[0]?.resultado.naoAlocadas ?? [codigo];
		const erros = gradeStore.diagnosticarEssencialDasOpcoes(opts, naoAlocadas);
		if (erros.length > 0) return erros.map(mensagemErro).join(' ');
		return `${nomeMateria(codigo)} não coube em nenhuma opção. Confira as turmas dela nos detalhes da matéria.`;
	}

	/** Avisos da última montagem para o painel de análise. */
	const avisosAnalise = $derived.by(() => {
		const lista: string[] = (gradeStore.ultimaMontagem?.erros ?? []).map(mensagemErro);
		if (gradeStore.ultimaMontagem?.truncado) {
			lista.push(
				'São muitas combinações — paramos numa grade boa, sem conflito, mas talvez não a melhor. Marque estrela nas essenciais e monte de novo.'
			);
		}
		if (avisoEssencial) lista.push(avisoEssencial);
		return lista;
	});

	const naGrade = $derived(new Set(gradeStore.pool.map((m) => m.codigo)));

	// ---------------------------------------------------------------------------
	// Onboarding guiado
	// ---------------------------------------------------------------------------
	const TOUR_ID = 'montador-grade-v2';

	const TOUR_STEPS: TourStep[] = [
		{
			title: 'Bem-vindo ao Montador de Grade 👋',
			description:
				'Em 1 minuto você monta uma grade sem conflito de horário, com as turmas realmente ofertadas. Já deixamos na lista as matérias recomendadas pelo seu plano.',
			hint: 'Dá pra navegar com as setas ← → do teclado e sair com Esc.'
		},
		{
			target: 'montar',
			side: 'bottom',
			title: '1. Deixe a gente montar',
			description:
				'Escolha como prefere a semana, a carga e os turnos: geramos três opções sem conflito e aplicamos a que você preferir. As matérias com estrela entram primeiro.'
		},
		{
			target: 'manual',
			side: 'bottom',
			title: '2. Ou monte manualmente',
			description:
				'Busque pelo código (ex.: CIC0004) ou pelo nome. Só aparecem matérias da sua matriz que você ainda não cursou.'
		},
		{
			target: 'materias',
			side: 'right',
			title: '3. Suas matérias',
			description:
				'Toque numa matéria para escolher ou trocar a turma — com professor, horário e vagas. A estrela prioriza; o X tira da lista.'
		},
		{
			target: 'calendario',
			side: 'left',
			title: '4. Sua semana',
			description:
				'As turmas escolhidas viram blocos aqui. Clique num bloco para ver os detalhes ou trocar de turma. Embaixo, alterne entre as opções geradas.'
		},
		{
			target: 'analise',
			side: 'left',
			title: '5. Confira a análise',
			description:
				'O que ainda falta para você se formar, janelas entre aulas, dias com aula e o que não coube. Quando estiver bom, exporte a grade como imagem.'
		},
		{
			target: 'assistente-ia',
			side: 'left',
			padding: 12,
			title: '✨ E tem a Darcy, nossa IA',
			description:
				'Peça em português: “optativas de redes à tarde com turma aberta” ou “monta minha grade sem aula de manhã”. Ela sugere só matérias com turma neste semestre e joga direto na sua grade.',
			hint: 'Reveja este passo a passo em “Como funciona”, no menu ⋯ do topo.'
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
</script>

{#snippet painelSituacao()}
	<SituacaoPanel
		{situacao}
		carregando={situacaoCarregando}
		embutido
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

{#snippet seletorOpcoes()}
	{#if gradeStore.grades.length > 1}
		<div
			class="mg-sunken flex gap-1.5 overflow-x-auto rounded-[11px] p-1 [scrollbar-width:none]"
			role="tablist"
			aria-label="Opções de grade"
			data-tour="opcoes"
		>
			{#each gradeStore.grades as g, i (g.id)}
				{@const ativo = g.id === gradeStore.activeId}
				<!-- O "×" fica ao lado da aba, não dentro: botão dentro de botão é HTML inválido. -->
				<div class="flex min-w-28 flex-1 items-center">
					<button
						type="button"
						role="tab"
						aria-selected={ativo}
						onclick={() => gradeStore.selecionarCenario(g.id)}
						class="mg-choice flex min-w-0 flex-1 items-center justify-center gap-1 border-transparent bg-transparent px-2.5 py-2 text-[11px] whitespace-nowrap"
					>
						<span class="truncate font-medium">{g.nome}</span>
					</button>
					<button
						type="button"
						onclick={() => excluirOpcao(g.id, i)}
						class="shrink-0 touch-manipulation rounded-md p-1.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
						aria-label="Excluir {g.nome}"
						title="Excluir esta opção"
					>
						<X class="h-3 w-3" />
					</button>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet semana()}
	<section
		id="grade-export"
		data-tour="calendario"
		class="{compacto ? '' : 'mg-panel rounded-[18px] p-4 lg:p-5'} min-w-0 transition-opacity {gerandoOpcoes ||
		remontando
			? 'opacity-60'
			: ''}"
		aria-label="Sua semana"
	>
		<div class="mb-4 flex items-end justify-between gap-3">
			<div class="min-w-0">
				<span class="mg-eyebrow">{compacto ? 'Sua semana' : 'Sua semana ideal'}</span>
				<h2 class="truncate text-lg font-semibold text-foreground md:text-xl">{tituloSemana}</h2>
			</div>
			{#if !semTurmaEscolhida}
				<div class="flex shrink-0 items-center gap-2">
					{#if naoCouberam > 0}
						<span class="mg-pill mg-pill-warn">{naoCouberam} não {naoCouberam === 1 ? 'coube' : 'couberam'}</span>
					{:else}
						<span class="mg-pill mg-pill-ok">Sem conflitos</span>
					{/if}
					{#if compacto}
						<!-- No celular a barra de ações não comporta mais um botão com texto. -->
						<button
							type="button"
							onclick={abrirOpcoesPdf}
							class="mg-btn mg-btn-secondary min-h-8 px-2.5 text-xs"
							aria-label="PDF da grade: compartilhar, baixar ou visualizar"
						>
							<FileText class="h-3.5 w-3.5" />
							PDF
						</button>
					{/if}
				</div>
			{/if}
		</div>
		<ScheduleGrid modo={compacto ? 'agenda' : 'grade'} onBlocoClick={(c) => (materiaDialog = c)} />
		{#if !compacto}
			<div class="mt-4">{@render seletorOpcoes()}</div>
		{/if}
	</section>
{/snippet}

<div
	class="relative z-10 mx-auto w-full max-w-[86rem] px-4 pt-4 md:px-6 md:pb-10"
	style="padding-bottom: {compacto ? 'calc(7rem + env(safe-area-inset-bottom, 0px))' : ''}"
>
	<!-- Cabeçalho -->
	<header class="flex items-center gap-3 border-b border-border pb-3">
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-lg leading-tight font-semibold text-foreground md:text-xl">
				Montador de Grade
			</h1>
			<p class="truncate text-xs text-muted-foreground">
				{#if periodo}Turmas de <span class="font-mono">{periodo}</span>{:else}Oferta atual{/if}
			</p>
		</div>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger class="mg-icon-btn" aria-label="Mais ações da grade">
				<MoreHorizontal class="h-4 w-4" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-60" align="end">
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href={ROUTES.BUSCAR_TURMAS}>
							<Search class="mr-2 h-4 w-4" />
							Buscar turmas na oferta
						</a>
					{/snippet}
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={abrirTour}>
					<Compass class="mr-2 h-4 w-4" />
					Como funciona
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				{#if onVoltarInicio}
					<DropdownMenu.Item onclick={voltarAoInicio} disabled={voltando}>
						<Undo2 class="mr-2 h-4 w-4" />
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

	<!-- Barra de ações -->
	<section
		class="mg-panel relative z-20 mt-4 mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl p-2.5 md:grid-cols-[auto_minmax(14rem,1fr)_auto] md:gap-6 md:p-3"
		aria-label="Ações da grade"
	>
		<div class="flex min-w-0 gap-2">
			<button
				type="button"
				onclick={() => (painel = 'gerar')}
				data-tour="montar"
				class="mg-btn mg-btn-primary flex-1 md:flex-none"
			>
				<Sparkles class="h-4 w-4" /> Montar grade
			</button>
			<button
				type="button"
				onclick={abrirManual}
				data-tour="manual"
				class="mg-btn mg-btn-secondary flex-1 md:flex-none"
			>
				<Plus class="h-4 w-4" /><span class="md:hidden">Manual</span><span class="hidden md:inline"
					>Montar manualmente</span
				>
			</button>
		</div>

		<div
			class="relative col-span-2 row-start-2 w-full md:col-span-1 md:col-start-2 md:row-start-1 md:max-w-md md:justify-self-center"
			role="presentation"
			onmouseenter={() => (cargaPopover = true)}
			onmouseleave={() => (cargaPopover = false)}
		>
			<button
				type="button"
				onclick={abrirPreferencias}
				onfocus={() => (cargaPopover = true)}
				onblur={() => (cargaPopover = false)}
				data-tour="creditos"
				class="block w-full touch-manipulation rounded-lg px-0.5 py-1 text-left"
				aria-label="Carga do semestre: {cargaTexto}. Abrir preferências para mudar o limite."
			>
				<span class="mb-2 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
					<span>Carga do semestre</span>
					<strong
						class="text-xs font-semibold tabular-nums {creditosAcima
							? 'text-red-700 dark:text-red-300'
							: 'text-foreground/85'}">{cargaTexto}</strong
					>
				</span>
				<span class="mg-track">
					<span class={creditosAcima ? 'mg-track-alerta' : ''} style="width: {creditosPct}%"></span>
				</span>
			</button>
			{#if cargaPopover && !compacto}
				<div
					class="mg-overlay absolute top-full left-1/2 z-30 mt-2 grid w-64 -translate-x-1/2 gap-2 rounded-xl p-4 text-xs"
					role="tooltip"
				>
					<span class="mg-eyebrow mb-0">Limite desejado</span>
					<p class="flex justify-between font-semibold text-foreground">
						Selecionado
						<span class="text-primary dark:text-purple-300">
							{gradeStore.creditosSelecionados * HORAS_POR_CREDITO}h · {gradeStore.creditosSelecionados} créditos
						</span>
					</p>
					<p class="flex justify-between font-semibold text-foreground">
						Máximo
						<span class="text-primary dark:text-purple-300">
							{limiteSessao * HORAS_POR_CREDITO}h · {limiteSessao} créditos
						</span>
					</p>
					<p class="border-t border-border pt-2 text-[11px] text-muted-foreground">
						15 horas equivalem a 1 crédito. Clique para mudar o limite.
					</p>
				</div>
			{/if}
		</div>

		<div class="flex gap-2">
			<button
				type="button"
				onclick={abrirPreferencias}
				class="mg-btn mg-btn-secondary w-10 px-0 lg:w-auto lg:px-3.5"
				aria-label="Filtros e preferências"
			>
				<SlidersHorizontal class="h-4 w-4" /><span class="hidden lg:inline">Filtros e preferências</span>
			</button>
			{#if !compacto}
				<button
					type="button"
					onclick={exportarGrade}
					disabled={exportando || semTurmaEscolhida}
					data-tour="exportar"
					class="mg-btn mg-btn-secondary"
				>
					{#if exportando}<Loader2 class="h-4 w-4 animate-spin" />{:else}<Download class="h-4 w-4" />{/if}
					Exportar PDF
				</button>
			{/if}
		</div>
	</section>

	{#if confirmacaoProfessor}
		<div
			class="mb-4 flex flex-col gap-2 rounded-xl border border-ai/30 bg-ai-soft px-3 py-2.5 text-xs text-ai sm:flex-row sm:items-center sm:justify-between"
		>
			<span class="flex items-start gap-2">
				<Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
				<span>
					Rearranjei a grade pra tentar encaixar <strong>{confirmacaoProfessor.resumo}</strong> — confere
					se ficou bom.
				</span>
			</span>
			<div class="flex shrink-0 items-center gap-2 self-end sm:self-auto">
				<button type="button" onclick={onRecusarConfirmacaoProfessor} class="mg-btn mg-btn-secondary min-h-8 text-[11px]">
					<Undo2 class="h-3 w-3" /> Manter grade anterior
				</button>
				<button type="button" onclick={onAceitarConfirmacaoProfessor} class="mg-btn mg-btn-primary min-h-8 text-[11px]">
					<Check class="h-3 w-3" /> Aceitar
				</button>
			</div>
		</div>
	{/if}

	{#if aviso && painel !== 'manual'}
		<p
			class="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-300/30 dark:bg-amber-500/10 dark:text-amber-100"
		>
			<Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
			<span class="flex-1">{aviso}</span>
			<button type="button" onclick={() => (aviso = null)} class="shrink-0 rounded p-0.5 hover:bg-amber-500/15" aria-label="Fechar aviso">
				<X class="h-3.5 w-3.5" />
			</button>
		</p>
	{/if}

	{#if compacto}
		<div class="mb-5">{@render seletorOpcoes()}</div>
		{@render semana()}
	{:else}
		<div
			class="grid items-start gap-4 md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_17rem]"
		>
			<div class="md:col-start-1 md:row-start-1">
				<MateriasPanel onAbrir={(c) => (materiaDialog = c)} onAdicionar={abrirManual} />
			</div>
			<div class="md:col-start-2 md:row-start-1">
				{@render semana()}
			</div>
			<div class="md:col-span-2 md:col-start-1 md:row-start-2 xl:col-span-1 xl:col-start-3 xl:row-start-1">
				<AnaliseGradePanel limiteCreditos={limiteSessao} avisos={avisosAnalise} situacao={painelSituacao} />
			</div>
		</div>
	{/if}
</div>

{#if compacto}
	<!--
		Navegação inferior do celular. O espaço à direita é do botão da Darcy
		(`AssistenteChatFab`, fixo em right-4/bottom-4), que fica encaixado na barra.
	-->
	<nav
		class="mg-overlay fixed inset-x-3 z-40 grid h-[68px] grid-cols-3 rounded-[17px] py-1.5 pr-[74px] pl-2"
		style="bottom: calc(12px + env(safe-area-inset-bottom, 0px));"
		aria-label="Navegação do montador"
	>
		<button
			type="button"
			onclick={() => {
				painel = null;
				window.scrollTo({ top: 0, behavior: 'smooth' });
			}}
			aria-current={painel === null ? 'page' : undefined}
			class="flex touch-manipulation flex-col items-center justify-center gap-1 rounded-[10px] text-[10px] {painel === null
				? 'bg-primary/10 text-primary dark:bg-purple-500/10 dark:text-purple-300'
				: 'text-muted-foreground'}"
		>
			<CalendarDays class="h-[18px] w-[18px]" /> Grade
		</button>
		<button
			type="button"
			onclick={() => (painel = 'materias')}
			data-tour="materias"
			class="relative flex touch-manipulation flex-col items-center justify-center gap-1 rounded-[10px] text-[10px] {painel ===
			'materias'
				? 'bg-primary/10 text-primary dark:bg-purple-500/10 dark:text-purple-300'
				: 'text-muted-foreground'}"
		>
			<BookMarked class="h-[18px] w-[18px]" /> Matérias
			<span class="sr-only">({gradeStore.pool.length})</span>
		</button>
		<button
			type="button"
			onclick={() => (painel = 'progresso')}
			data-tour="analise"
			class="flex touch-manipulation flex-col items-center justify-center gap-1 rounded-[10px] text-[10px] {painel ===
			'progresso'
				? 'bg-primary/10 text-primary dark:bg-purple-500/10 dark:text-purple-300'
				: 'text-muted-foreground'}"
		>
			<ChartColumn class="h-[18px] w-[18px]" /> Progresso
		</button>
	</nav>

	<ResponsiveSheet
		aberto={painel === 'materias'}
		onClose={() => (painel = null)}
		eyebrow="Sua lista"
		titulo="Suas matérias"
		subtitulo="{gradeStore.selecao.size} na grade · {gradeStore.pool.length - gradeStore.selecao.size} fora"
	>
		<div class="px-5 pb-5">
			<MateriasPanel
				embutido
				onAbrir={(c) => (materiaDialog = c)}
				onAdicionar={() => {
					painel = null;
					abrirManual();
				}}
			/>
		</div>
	</ResponsiveSheet>

	<ResponsiveSheet
		aberto={painel === 'progresso'}
		onClose={() => (painel = null)}
		eyebrow="Visão rápida"
		titulo="Análise da grade"
	>
		<div class="px-5 pb-5">
			<AnaliseGradePanel
				embutido
				limiteCreditos={limiteSessao}
				avisos={avisosAnalise}
				situacao={painelSituacao}
			/>
		</div>
	</ResponsiveSheet>
{/if}

<ResponsiveSheet
	aberto={painel === 'pdf'}
	onClose={() => (painel = null)}
	eyebrow="Exportar"
	titulo="PDF da grade"
	subtitulo={pdfPronto?.name ?? (pdfFalhou ? 'Não foi possível gerar' : 'Gerando PDF…')}
>
	<div class="space-y-2 px-5 pb-5">
		{#if pdfFalhou}
			<p class="text-sm text-muted-foreground">Não consegui gerar o PDF desta grade.</p>
			<button type="button" onclick={abrirOpcoesPdf} class="mg-btn mg-btn-primary w-full">
				Tentar de novo
			</button>
		{:else}
			{#snippet opcaoPdf(
				Icone: typeof Share2,
				rotulo: string,
				detalhe: string,
				onclick: () => void,
				principal = false
			)}
				<button
					type="button"
					{onclick}
					disabled={!pdfPronto}
					class="flex w-full touch-manipulation items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 {principal
						? 'border-primary/30 bg-primary/5 hover:bg-primary/10 dark:border-purple-400/30 dark:bg-purple-500/10'
						: 'border-border hover:bg-foreground/5'}"
				>
					{#if pdfPronto}
						<Icone class="h-5 w-5 shrink-0 {principal ? 'text-primary dark:text-purple-300' : 'text-muted-foreground'}" />
					{:else}
						<Loader2 class="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
					{/if}
					<span class="min-w-0">
						<span class="block text-sm font-semibold text-foreground">{rotulo}</span>
						<span class="block text-xs text-muted-foreground">{detalhe}</span>
					</span>
				</button>
			{/snippet}
			{#if podeCompartilharPdf || !pdfPronto}
				{@render opcaoPdf(Share2, 'Compartilhar', 'WhatsApp, salvar em Arquivos, imprimir…', compartilharPdf, true)}
			{/if}
			{@render opcaoPdf(Download, 'Baixar PDF', 'Salva o arquivo no aparelho', baixarPdf, !podeCompartilharPdf && !!pdfPronto)}
			{@render opcaoPdf(Eye, 'Visualizar', 'Abre o PDF no navegador', visualizarPdf)}
		{/if}
	</div>
</ResponsiveSheet>

<ResponsiveSheet
	aberto={painel === 'gerar'}
	onClose={() => (painel = null)}
	eyebrow="Configuração rápida"
	titulo="Gerar grade"
	maxWidthClass="sm:max-w-[500px]"
>
	<MontadorParametros
		limiteCreditosInicial={limiteSessao}
		gerando={gerandoOpcoes}
		valorInicial={parametrosAtuais}
		{periodoAtual}
		{ofertaProximo}
		onGerar={handleGerarOpcoes}
		onIncluir={onAdd}
	/>
</ResponsiveSheet>

<ResponsiveSheet
	aberto={painel === 'manual'}
	onClose={() => (painel = null)}
	eyebrow="Montagem manual"
	titulo="Adicionar matéria"
	maxWidthClass="sm:max-w-[470px]"
>
	<div class="space-y-3 px-5 pb-5">
		<MateriaSearchAdd {onAdd} compacto />
		{#if aviso}
			<p
				class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-300/30 dark:bg-amber-500/10 dark:text-amber-100"
			>
				{aviso}
			</p>
		{/if}
		<p class="text-[11px] text-muted-foreground">
			Matérias da sua matriz que você ainda não cursou. Depois de adicionar, escolha a turma em
			“Suas matérias”. Procurando algo de fora?
			<a href={ROUTES.BUSCAR_TURMAS} class="font-medium text-primary underline-offset-2 hover:underline dark:text-purple-300"
				>Busque na oferta inteira</a
			>.
		</p>
	</div>
	{#snippet footer()}
		{#if adicionadasNoManual > 0}
			<footer class="border-t border-border px-5 py-3">
				<button type="button" onclick={() => (painel = null)} class="mg-btn mg-btn-primary w-full">
					<Check class="h-4 w-4" /> Concluir · {adicionadasNoManual}
					{adicionadasNoManual === 1 ? 'matéria' : 'matérias'}
				</button>
			</footer>
		{/if}
	{/snippet}
</ResponsiveSheet>

<ResponsiveSheet
	aberto={painel === 'preferencias'}
	onClose={aplicarPreferencias}
	lado="direita"
	eyebrow="Personalização"
	titulo="Filtros e preferências"
	maxWidthClass="sm:max-w-[390px]"
>
	<div class="px-5 pb-5">
		<p class="mg-eyebrow mt-1 mb-1">Turnos permitidos</p>
		{#each TURNO_OPCOES as [t, label] (t)}
			{@const ativo = gradeStore.turnosPermitidos.has(t)}
			<button
				type="button"
				role="switch"
				aria-checked={ativo}
				onclick={() => gradeStore.toggleTurno(t)}
				class="flex min-h-[52px] w-full touch-manipulation items-center justify-between border-b border-border text-left text-sm text-foreground/90"
			>
				{label}
				<span class="mg-switch" aria-checked={ativo}></span>
			</button>
		{/each}

		{#if gradeStore.temCursando}
			<button
				type="button"
				role="switch"
				aria-checked={gradeStore.incluirCursando}
				onclick={() => gradeStore.setIncluirCursando(!gradeStore.incluirCursando)}
				class="flex min-h-[52px] w-full touch-manipulation items-center justify-between gap-3 border-b border-border text-left text-sm text-foreground/90"
			>
				<span>
					Incluir matérias que já curso
					<small class="block text-[11px] text-muted-foreground">
						Desligue para planejar o próximo semestre: elas contam como feitas e liberam horário e carga.
					</small>
				</span>
				<span class="mg-switch" aria-checked={gradeStore.incluirCursando}></span>
			</button>
		{/if}

		<div class="mt-6">
			<div class="flex items-center justify-between">
				<label for="mg-limite" class="mg-eyebrow mb-0">Limite de carga</label>
				<span class="text-xs font-semibold text-foreground tabular-nums">
					{limiteSessao} créditos
					<span class="font-normal text-muted-foreground">· {limiteSessao * HORAS_POR_CREDITO}h</span>
				</span>
			</div>
			<input
				id="mg-limite"
				type="range"
				min={LIMITE_CREDITOS_MIN}
				max={LIMITE_CREDITOS_MAX}
				step="1"
				value={limiteSessao}
				oninput={(e) => moverSliderCreditos(Number((e.currentTarget as HTMLInputElement).value))}
				class="mt-3 h-1 w-full cursor-pointer touch-manipulation accent-primary"
			/>
			<p class="mt-1.5 text-[11px] text-muted-foreground">
				A grade se ajusta na hora, tirando primeiro as matérias sem estrela.
			</p>
		</div>

		<fieldset class="mt-6">
			<legend class="mg-eyebrow mb-2">Mostrar carga em</legend>
			<div class="mg-sunken grid grid-cols-2 gap-1 rounded-[10px] p-1">
				{#each UNIDADES as [valor, rotulo] (valor)}
					<button
						type="button"
						aria-pressed={unidadeCargaStore.unidade === valor}
						onclick={() => unidadeCargaStore.set(valor)}
						class="min-h-9 touch-manipulation rounded-lg text-xs font-medium transition-colors {unidadeCargaStore.unidade ===
						valor
							? 'bg-primary text-primary-foreground dark:bg-[#3a225b] dark:text-[#f1eaff]'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						{rotulo}
					</button>
				{/each}
			</div>
		</fieldset>
	</div>
	{#snippet footer()}
		<footer class="border-t border-border px-5 py-3">
			<button type="button" onclick={aplicarPreferencias} class="mg-btn mg-btn-primary w-full">
				Aplicar preferências
			</button>
		</footer>
	{/snippet}
</ResponsiveSheet>

<TrocarTurmaDialog codigo={materiaDialog} onClose={() => (materiaDialog = null)} />

<!-- Onboarding guiado (spotlight + coach marks) -->
<OnboardingTour />
