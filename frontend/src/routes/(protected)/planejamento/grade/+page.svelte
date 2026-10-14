<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import PageMeta from '$lib/components/seo/PageMeta.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import MontadorGradeView from '$lib/components/planejamento/MontadorGradeView.svelte';
	import AssistenteChatFab from '$lib/components/planejamento/AssistenteChatFab.svelte';
	import { authStore } from '$lib/stores/auth';
	import { fluxogramaStore } from '$lib/stores/fluxograma.store.svelte';
	import { planoFormaturaStore } from '$lib/stores/plano-formatura.store.svelte';
	import {
		gradeStore,
		lerPoolSalvo,
		lerRemovidasSalvo,
		type MateriaGrade
	} from '$lib/stores/grade.store.svelte';
	import {
		construirMateriasGrade,
		montarPoolRecomendado,
		motivoParaNaoAdicionar,
		pendenciasPreRequisito,
		invalidarContextoGrade,
		candidatosModuloLivre,
		type SemeaduraResultado,
		type OpcoesSemeadura,
		type PendenciaPreRequisito
	} from '$lib/services/grade-pool.service';
	import {
		carregarSituacao,
		type SituacaoAcademica
	} from '$lib/services/situacao-academica.service';
	import PreRequisitoConfirmDialog from '$lib/components/planejamento/PreRequisitoConfirmDialog.svelte';
	import { vagaAssinaturasStore } from '$lib/stores/vaga-assinaturas.store.svelte';
	import { darcyStore } from '$lib/stores/darcy.store.svelte';
	import {
		getPeriodoAtivo,
		proximoPeriodo,
		temOfertaNoPeriodo
	} from '$lib/services/turmas.service';
	import { preferenciasGradeService } from '$lib/services/preferencias-grade.service';
	import { filtrarNaoCursados } from '$lib/utils/subject-codes';
	import {
		turmasReaisDoHistorico,
		professoresReaisDoHistorico,
		encontrarTurmaReal
	} from '$lib/utils/turmas-reais';
	import { ROUTES } from '$lib/config/routes';
	import type {
		AcaoGradeChat,
		SemestrePlano,
		ItemSemestre,
		MateriaPlano
	} from '$lib/types/plano-formatura';
	import type { ResultadoAcoesChat } from '$lib/utils/chat-acoes';
	import { CalendarDays, Loader2 } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let erro = $state<string | null>(null);
	/** Período cuja oferta está carregada na lista (o vigente ou o próximo). */
	let periodo = $state<string | null>(null);
	/** Período letivo vigente (RPC `periodo_letivo_atual`). */
	let periodoAtual = $state<string | null>(null);
	/**
	 * O semestre seguinte e se a oferta dele já foi coletada. "Próximo semestre"
	 * usa essa oferta quando ela existe; antes disso, a do vigente como estimativa.
	 */
	let proximo = $state<{ periodo: string; temOferta: boolean } | null>(null);
	/** Recarga de período em andamento — a semeadura espera por ela. */
	let trocandoPeriodo: Promise<void> | null = null;
	let avisoAdd = $state<string | null>(null);
	/** Obrigatórias que faltam ao aluno e não são ofertadas neste período. */
	let semOferta = $state<string[]>([]);
	/**
	 * O que ainda falta ao aluno, por natureza. Carregado em segundo plano: a
	 * montagem funciona sem isto, só menos informada, então uma falha aqui não pode
	 * atrasar nem derrubar a tela.
	 */
	let situacao = $state<SituacaoAcademica | null>(null);
	let situacaoCarregando = $state(true);
	/** Sugestões de módulo livre para o tema que o aluno pediu. */
	let sugestoesModuloLivre = $state<Array<{ codigo: string; nome: string; creditos: number }>>([]);
	let buscandoModuloLivre = $state(false);

	/**
	 * Prévia pendente de um rearranjo pedido por professor via chat: já aplicada no
	 * `gradeStore` (pra o aluno ver o resultado), mas só persiste no banco e vira
	 * definitiva se ele "Aceitar" — "Manter grade anterior" volta pro snapshot.
	 */
	let confirmacaoProfessor = $state<{
		resumo: string;
		snapshot: Record<string, number>;
		docentes: Record<string, string>;
	} | null>(null);

	/**
	 * Tira da lista de exclusão o que o aluno está cursando agora. Matrícula é fato
	 * consumado: nem a lixeira nem "Limpar tudo" podem apagá-la da lista — era assim
	 * que as MATR sumiam de vez do montador depois de um clique em "Limpar tudo".
	 */
	function semExcluirCursando(codigos: string[]): string[] {
		const cursando = fluxogramaStore.currentCodes ?? new Set<string>();
		return codigos.filter((c) => !cursando.has(c.trim().toUpperCase()));
	}

	function isMateriaPlano(item: ItemSemestre): item is MateriaPlano {
		return 'codigo' in item;
	}

	function extrairRecomendado(): SemestrePlano | null {
		const p = planoFormaturaStore.plano as { plano?: SemestrePlano[] } | null;
		const semestres = p?.plano ?? [];
		return (
			semestres.find((s) => s.tipo === 'recomendado') ??
			semestres.find((s) => s.tipo !== 'em_curso') ??
			semestres[0] ??
			null
		);
	}

	/** Códigos do semestre recomendado pelo plano de formatura. */
	function codigosRecomendados(): string[] {
		const recomendado = extrairRecomendado();
		return recomendado ? recomendado.materias.filter(isMateriaPlano).map((m) => m.codigo) : [];
	}

	/**
	 * Pré-seleciona a turma em que o aluno já está matriculado (histórico SIGAA)
	 * para cada matéria em curso que ainda está sem turma na grade ativa — o
	 * calendário abre já espelhando a matrícula real, e `selecionarTurma` trava a
	 * matéria para "Montar grade" não trocar uma matrícula que já aconteceu.
	 * Matéria que já tem turma escolhida (salva ou manual) fica como está.
	 */
	function preencherTurmasReais(): void {
		if (!periodo) return;
		const dados = authStore.getUser()?.dadosFluxograma;
		const reais = turmasReaisDoHistorico(dados, periodo);
		const professores = professoresReaisDoHistorico(dados, periodo);
		if (reais.size === 0 && professores.size === 0) return;
		const ids: Record<string, number> = {};
		for (const m of gradeStore.pool) {
			if (!gradeStore.isCursandoAtual(m.codigo)) continue;
			const idTurma = encontrarTurmaReal(m, reais, professores);
			if (idTurma != null) ids[m.codigo] = idTurma;
		}
		// Registra no store (fonte de verdade para a montagem) e corrige seleção
		// restaurada que apontava outra turma; quem está sem turma ganha a real.
		gradeStore.definirTurmasReais(ids);
		for (const [codigo, idTurma] of Object.entries(ids)) {
			if (!gradeStore.turmaSelecionada(codigo)) gradeStore.selecionarTurma(codigo, idTurma);
		}
	}

	/**
	 * Volta o montador ao estado de início: só o semestre recomendado do plano +
	 * as matérias em que o aluno já está matriculado (com a turma real do SIGAA),
	 * como na primeira visita — o que foi removido na lixeira também volta.
	 */
	async function voltarAoInicio(): Promise<void> {
		if (!periodo) return;
		avisoAdd = null;
		const cursandoCodigos = [...(fluxogramaStore.currentCodes ?? new Set<string>())];
		const { materias, obrigatoriasSemOferta } = await montarPoolRecomendado(periodo, {
			limiteCreditos,
			ordemDoPlano: codigosRecomendados(),
			situacao: situacao ?? undefined
		});
		semOferta = obrigatoriasSemOferta;
		gradeStore.resetarParaInicio(materias);
		gradeStore.definirCursandoAtual(cursandoCodigos);
		preencherTurmasReais();
		toast.success('Grade de volta ao estado inicial.');
	}

	/**
	 * Traz para a lista o que "Montar grade" precisa montar.
	 *
	 * A fonte é a **matriz do aluno**: matérias em curso primeiro, depois as
	 * obrigatórias pendentes com turma no período e, com o crédito que sobrar,
	 * optativas. O semestre recomendado do plano de formatura entra só como ordem
	 * de preferência — antes ele ERA a fonte, e era por ali que entrava matéria que
	 * não pertence à matriz do aluno.
	 *
	 * Roda a cada montagem e é idempotente: só entra o que falta na lista e
	 * matéria já cursada nunca entra. A lixeira é respeitada enquanto houver outra
	 * coisa a trazer; quando ela é tudo o que sobrou, vale o pedido explícito.
	 */
	async function semear(opcoes?: OpcoesSemeadura): Promise<SemeaduraResultado> {
		// Trocou "Para qual semestre?" e já mandou gerar: semeia na lista nova.
		if (trocandoPeriodo) await trocandoPeriodo;
		if (!periodo) return { adicionadas: [], obrigatoriasSemOferta: [] };

		const naLista = gradeStore.pool.map((m) => m.codigo);
		const recomendar = (respeitarLixeira: boolean) =>
			montarPoolRecomendado(periodo!, {
				// O limite que o aluno escolheu no Passo 1 vale mais que o do plano:
				// semear 24 créditos para quem pediu 30 deixa o solver sem o que encaixar.
				limiteCreditos: opcoes?.limiteCreditos ?? limiteCreditos,
				escopo: opcoes?.escopo,
				apenasObrigatorias: opcoes?.apenasObrigatorias,
				ordemDoPlano: codigosRecomendados(),
				// A lixeira não vale para matrícula em curso: quem quer a MATR fora da grade
				// usa o botão "matérias em curso", que a esconde sem perder a informação.
				excluir: semExcluirCursando(
					respeitarLixeira ? [...gradeStore.removidas, ...naLista] : naLista
				),
				// Complementa a lista que já existe em vez de ignorá-la: o que o aluno já
				// selecionou ocupa horário e crédito antes de recomendarmos o resto.
				base: {
					...gradeStore.orcamentoParaSemear(opcoes?.essencial),
					turnos: gradeStore.turnosPermitidos
				},
				situacao: situacao ?? undefined,
				// Com as em curso fora da montagem elas não ocupam vaga, então também não
				// podem consumir o orçamento — senão quem já cursa perto do teto desliga
				// o modo para ver o que mais pegar e não recebe sugestão nenhuma.
				cursandoOcupaOrcamento: gradeStore.incluirCursando
			});

		const emCurso = fluxogramaStore.currentCodes ?? new Set<string>();
		const trazNovidade = (r: { materias: MateriaGrade[] }) =>
			r.materias.some((m) => !emCurso.has(m.codigo));

		let r = await recomendar(true);
		// "Limpar tudo" joga a lista inteira na lixeira — para o recarregar da página
		// não trazê-la de volta sozinho. Mas aqui o aluno PEDIU uma grade: se fora da
		// lixeira não há nada a trazer, ela vale menos que o pedido. Sem isto, depois
		// de um "Limpar tudo" a montagem só via as em curso e saía vazia para sempre.
		if (!trazNovidade(r) && gradeStore.removidas.size > 0) {
			const semLixeira = await recomendar(false);
			if (trazNovidade(semLixeira)) r = semLixeira;
		}
		const { materias, obrigatoriasSemOferta, naturezasSaturadas, pendentesSemOferta } = r;

		for (const m of materias) gradeStore.addMateriaAoPool(m);
		semOferta = obrigatoriasSemOferta;

		return {
			adicionadas: materias.map((m) => m.codigo),
			obrigatoriasSemOferta,
			naturezasSaturadas,
			pendentesSemOferta
		};
	}

	/** Qual oferta a lista deve usar, dado o modo "Para qual semestre?". */
	function periodoAlvo(): string {
		const usarProximo = !gradeStore.incluirCursando && proximo?.temOferta;
		return usarProximo ? proximo!.periodo : periodoAtual!;
	}

	/**
	 * (Re)monta a lista com a oferta de `alvo`. Cada período tem a própria lista e
	 * os próprios cenários salvos, então ir e voltar entre "Este semestre" e
	 * "Próximo semestre" não apaga a grade do outro.
	 */
	async function carregarLista(alvo: string): Promise<void> {
		// O modo vem de quem chamou, não do storage do período novo (o `init` o
		// restauraria de lá, e trocar de semestre desfaria a escolha do aluno).
		const incluirCursando = periodo === null ? null : gradeStore.incluirCursando;
		const idUser = authStore.getUser()?.idUser ?? null;
		const salvos = lerPoolSalvo(idUser, alvo);
		const removidas = new Set(lerRemovidasSalvo(idUser, alvo));

		// O que o aluno já tinha na lista da visita anterior. O filtro de já-cursadas
		// vale também aqui: matéria concluída depois de ter entrado no pool some
		// sozinha no próximo carregamento, sem ele ter que remover na mão.
		const salvosVivos = filtrarNaoCursados(
			salvos.filter((c) => !removidas.has(c)),
			fluxogramaStore.completedCodes,
			fluxogramaStore.currentCodes ?? new Set<string>()
		);
		const doStorage = await construirMateriasGrade(salvosVivos, alvo);

		// Matérias em curso NÃO são filtradas por `removidas`: matrícula é fato
		// consumado. Antes elas eram, e um "Limpar tudo" fazia o aluno recarregar a
		// página sem as matérias em que ele está de fato matriculado.
		const cursandoCodigos = [...(fluxogramaStore.currentCodes ?? new Set<string>())];

		const { materias: recomendadas, obrigatoriasSemOferta } = await montarPoolRecomendado(alvo, {
			limiteCreditos,
			ordemDoPlano: codigosRecomendados(),
			excluir: semExcluirCursando([...removidas, ...salvosVivos]),
			situacao: situacao ?? undefined,
			cursandoOcupaOrcamento: incluirCursando ?? undefined
		});
		semOferta = obrigatoriasSemOferta;

		const vistos = new Set<string>();
		const pool = [...doStorage, ...recomendadas].filter((m) =>
			vistos.has(m.codigo) ? false : (vistos.add(m.codigo), true)
		);
		periodo = alvo;
		gradeStore.init(pool, { idUser, periodo: alvo });
		if (incluirCursando !== null) gradeStore.setIncluirCursando(incluirCursando);
		gradeStore.definirCursandoAtual(cursandoCodigos);
		// A turma real da matrícula só existe na oferta do semestre vigente.
		if (alvo === periodoAtual) preencherTurmasReais();
	}

	// Trocar "Para qual semestre?" troca a oferta da lista, quando a do próximo
	// semestre já foi coletada. Sem ela, nada a recarregar: a lista segue com a do
	// vigente e a tela avisa que é estimativa.
	$effect(() => {
		void gradeStore.incluirCursando;
		if (status !== 'ready' || !periodoAtual || trocandoPeriodo) return;
		const alvo = periodoAlvo();
		if (alvo === periodo) return;
		trocandoPeriodo = carregarLista(alvo)
			.then(() => {
				invalidarContextoGrade();
				toast.info(
					alvo === periodoAtual
						? `Voltando para a oferta de ${alvo}.`
						: `Usando a oferta de ${alvo}, o próximo semestre.`
				);
			})
			.catch(() => {
				toast.error('Não consegui carregar a oferta desse semestre. Tente de novo.');
			})
			.finally(() => {
				trocandoPeriodo = null;
			});
	});

	async function montar(): Promise<void> {
		status = 'loading';
		erro = null;
		try {
			if (!fluxogramaStore.state.courseData) {
				const matriz = authStore.getUser()?.dadosFluxograma?.matrizCurricular ?? null;
				if (!matriz) {
					goto(ROUTES.UPLOAD_HISTORICO);
					return;
				}
				await fluxogramaStore.loadCourseDataByCurriculoCompleto(matriz);
			}

			await planoFormaturaStore.loadPreferencias();
			if (!planoFormaturaStore.plano) await planoFormaturaStore.gerar();
			// `gerar()` engole a falha: deixa `plano` nulo e devolve normalmente. Sem
			// dizer nada aqui, a lista aparecia vazia sem explicação e a culpa sobrava
			// para o montador.
			if (!planoFormaturaStore.plano) {
				avisoAdd = planoFormaturaStore.error
					? `Não consegui carregar seu plano de formatura (${planoFormaturaStore.error}). "Montar grade" vai puxar da sua matriz.`
					: 'Seu plano de formatura não indicou matérias para montar. "Montar grade" vai puxar da sua matriz.';
			}

			periodoAtual = await getPeriodoAtivo();
			const seguinte = proximoPeriodo(periodoAtual);
			// Sem saber se há oferta, o modo "Próximo semestre" só usa a estimativa.
			const temOferta = await temOfertaNoPeriodo(seguinte).catch(() => false);
			proximo = { periodo: seguinte, temOferta };

			await carregarLista(periodoAtual);
			// O aluno estava planejando o próximo semestre na última visita (o modo fica
			// salvo com os cenários): abre direto na oferta dele.
			const alvo = periodoAlvo();
			if (alvo !== periodo) await carregarLista(alvo);
			invalidarContextoGrade();
			status = 'ready';
			// Grade que a Darcy montou em outra tela ("Abrir no Montador"): aplica agora
			// que o pool e as turmas reais estão prontos.
			const pendente = darcyStore.consumirGradePendente();
			if (pendente) aplicarGradeDoChat(pendente.codigos, pendente.opcaoGrade);
			// Situação do aluno em background: a grade já está montável sem ela, e
			// nenhuma falha desta camada pode segurar a tela. Quando chega, o store
			// passa a pesar as matérias pelo que de fato falta.
			void carregarSituacao()
				.then((s) => {
					situacao = s;
					gradeStore.definirSituacao(s);
				})
				.finally(() => {
					situacaoCarregando = false;
				});

			// Carrega assinaturas de vaga em background (habilita "seguir turma lotada").
			void vagaAssinaturasStore.load();
			// Preferência de professor confirmada numa sessão anterior — carrega em
			// background pra não travar a tela; se falhar, o montador segue sem ela.
			void preferenciasGradeService.listar().then((prefs) => {
				const mapa: Record<string, string> = {};
				for (const p of prefs) if (p.docente) mapa[p.codigo_materia] = p.docente;
				gradeStore.definirDocentesPersistidos(mapa);
			});
		} catch (e) {
			erro = e instanceof Error ? e.message : 'Erro ao montar a grade.';
			status = 'error';
		}
	}

	onMount(() => {
		void montar();
	});

	const limiteCreditos = $derived(planoFormaturaStore.preferencias?.limiteCreditos ?? 24);

	async function adicionarAoPool(codigo: string): Promise<void> {
		avisoAdd = null;
		const c = codigo.trim().toUpperCase();
		if (!periodo) return;
		if (gradeStore.hasMateria(c)) return;
		const impedimento = motivoParaNaoAdicionar(c);
		if (impedimento) {
			avisoAdd = impedimento;
			return;
		}
		try {
			const [m] = await construirMateriasGrade([c], periodo);
			if (m) {
				gradeStore.addMateriaAoPool(m);
			} else {
				avisoAdd = `Não encontrei a matéria ${c}.`;
			}
		} catch {
			avisoAdd = `Erro ao adicionar ${c}.`;
		}
	}

	/**
	 * Pré-requisito pendente vira confirmação explícita antes de entrar no pool.
	 *
	 * A busca (`MateriaSearchAdd`) já faz esse guard sozinha; aqui cobrimos os
	 * caminhos que passam pela rota — a Darcy sugerindo uma matéria e a ação
	 * [MONTAR_GRADE|...], que chega com vários códigos de uma vez. O aviso não
	 * bloqueia: o aluno pode estar cursando o pré-requisito agora (MATR) e ter
	 * motivo legítimo para se inscrever mesmo assim.
	 */
	let pendencias = $state<PendenciaPreRequisito[]>([]);
	/** Códigos represados esperando o "Adicionar mesmo assim". */
	let aguardando = $state<string[]>([]);
	/** O que rodar depois de o lote entrar no pool (montagem do chat). */
	let aposConfirmar = $state<(() => Promise<void>) | null>(null);

	async function adicionarCodigos(codigos: string[]): Promise<void> {
		for (const raw of codigos) {
			const c = raw.trim().toUpperCase();
			if (!c) continue;
			await adicionarAoPool(c);
		}
	}

	async function resolverPendencias(): Promise<void> {
		const codigos = aguardando;
		const depois = aposConfirmar;
		pendencias = [];
		aguardando = [];
		aposConfirmar = null;
		if (codigos.length > 0) await adicionarCodigos(codigos);
		if (depois) await depois();
	}

	function descartarPendencias(): void {
		pendencias = [];
		aguardando = [];
		aposConfirmar = null;
	}

	/** Caminho de uma matéria só — a Darcy sugerindo no chat. */
	async function adicionarComAviso(codigo: string): Promise<void> {
		const p = pendenciasPreRequisito([codigo]);
		if (p.length > 0) {
			pendencias = p;
			aguardando = [codigo];
			aposConfirmar = null;
			return;
		}
		await adicionarAoPool(codigo);
	}

	/**
	 * Seleção exata que o backend já resolveu no orquestrador (`opcaoGrade` da
	 * resposta de `/chat/send`) — quando vem, o frontend só aplica via
	 * `gradeStore.aplicarSelecao`, sem rodar `montarAutomatico` de novo. `undefined`
	 * quando o backend não resolveu (resposta comum, ou ainda só a tag de texto
	 * `[MONTAR_GRADE|...]`, que continua sendo o fallback).
	 * Espelha `ChatService.OrquestradorChatResponse['opcaoGrade']`.
	 */
	type OpcaoGradeDoChat = {
		estrategia: string;
		selecao: Array<{ codigo: string; idTurma: number }>;
	};

	/**
	 * Ação vinda do chat ([MONTAR_GRADE|...]): garante as matérias no pool, marca-as
	 * como prioritárias e monta — mantendo as demais que couberem sem conflito.
	 *
	 * Quando vem professor (`docentes`), a preferência agora é bônus (não filtro
	 * rígido) e pode rearranjar o resto da grade pra abrir espaço — por isso vira
	 * uma prévia com "Aceitar"/"Manter grade anterior" em vez de aplicar direto: o
	 * aluno confere antes de confirmar.
	 */
	async function montarGradeComPrioridade(
		codigos: string[],
		turnos?: string[],
		docentes?: Record<string, string>,
		incluirCursando?: boolean,
		opcaoGrade?: OpcaoGradeDoChat
	): Promise<void> {
		if (turnos && turnos.length > 0) gradeStore.setTurnos(turnos);
		// A Darcy pode pedir a grade sem as matérias em curso — mesmo efeito do botão
		// na barra, e o estado fica visível lá depois.
		if (typeof incluirCursando === 'boolean') gradeStore.setIncluirCursando(incluirCursando);
		const todosCodigos = [...new Set([...codigos, ...Object.keys(docentes ?? {})])];

		// Um diálogo agregado para o lote inteiro — uma fila de pop-ups, um por
		// matéria, seria insuportável quando a Darcy sugere meia grade.
		const p = pendenciasPreRequisito(todosCodigos);
		if (p.length > 0) {
			pendencias = p;
			aguardando = todosCodigos;
			aposConfirmar = () => aplicarMontagemDoChat(todosCodigos, docentes, opcaoGrade);
			return;
		}

		await adicionarCodigos(todosCodigos);
		await aplicarMontagemDoChat(todosCodigos, docentes, opcaoGrade);
	}

	/**
	 * Monta o que o chat pediu — já com o lote garantido no pool.
	 *
	 * As matérias do chat são priorizadas SÓ durante esta montagem. Antes a estrela
	 * ficava: cada grade da Darcy deixava suas optativas estreladas para sempre, e
	 * como a estrela pesa mais que obrigatória, toda montagem seguinte punha essas
	 * optativas no lugar das obrigatórias (chamado: FGA0211 fora com o horário livre).
	 */
	async function aplicarMontagemDoChat(
		todosCodigos: string[],
		docentes?: Record<string, string>,
		opcaoGrade?: OpcaoGradeDoChat
	): Promise<void> {
		// O backend já pode ter resolvido a montagem no orquestrador — nesse caso o
		// frontend só aplica a seleção exata (caminho único de `aplicarSelecao`),
		// sem re-resolver com o solver local. A tag de texto [MONTAR_GRADE|...] (que
		// chegou como `codigos`/`docentes`) é o fallback só para quando `opcaoGrade`
		// vem `undefined`.
		if (opcaoGrade) {
			const snapshot = gradeStore.snapshotSelecao();
			const selecao: Record<string, number> = {};
			for (const { codigo, idTurma } of opcaoGrade.selecao) {
				selecao[codigo.trim().toUpperCase()] = idTurma;
			}
			gradeStore.aplicarSelecao(selecao);
			if (docentes && Object.keys(docentes).length > 0) {
				const resumo = Object.entries(docentes)
					.map(([c, nome]) => `${c} com ${nome}`)
					.join(', ');
				confirmacaoProfessor = { resumo, snapshot, docentes };
			}
			return;
		}

		const promovidas: string[] = [];
		for (const raw of todosCodigos) {
			const c = raw.trim().toUpperCase();
			if (c && gradeStore.hasMateria(c) && !gradeStore.isPrioritaria(c)) {
				gradeStore.togglePrioridade(c);
				promovidas.push(c);
			}
		}
		try {
			if (docentes && Object.keys(docentes).length > 0) {
				const snapshot = gradeStore.snapshotSelecao();
				gradeStore.montarAutomatico({ docentesObrigatorios: docentes, limiteCreditos });
				const resumo = Object.entries(docentes)
					.map(([c, nome]) => `${c} com ${nome}`)
					.join(', ');
				confirmacaoProfessor = { resumo, snapshot, docentes };
			} else {
				gradeStore.montarAutomatico({ limiteCreditos });
			}
		} finally {
			// Devolve as estrelas ao que o aluno tinha marcado.
			for (const c of promovidas) if (gradeStore.isPrioritaria(c)) gradeStore.togglePrioridade(c);
		}
	}

	/**
	 * Bloco de grade do chat ("Aplicar esta grade" / "Montar grade com X, Y"), ou a
	 * grade que veio de outra tela por "Abrir no Montador". `opcaoGrade` = seleção
	 * pronta; sem ela, os códigos são a sugestão a montar.
	 */
	function aplicarGradeDoChat(codigos: string[], opcaoGrade?: OpcaoGradeDoChat): void {
		void montarGradeComPrioridade(codigos, undefined, undefined, undefined, opcaoGrade);
	}

	/** "Usar esta turma" num card de turma do chat. */
	async function usarTurmaDoChat(codigo: string, idTurma: number): Promise<void> {
		const c = codigo.trim().toUpperCase();
		if (!gradeStore.hasMateria(c)) await adicionarAoPool(c);
		if (!gradeStore.hasMateria(c)) {
			toast.error(avisoAdd ?? `Não consegui adicionar ${c} à lista.`);
			return;
		}
		const r = gradeStore.selecionarTurma(c, idTurma);
		if (r.ok) {
			toast.success(`Turma de ${c} adicionada à grade.`);
		} else if (r.conflitaCom) {
			toast.error(`Essa turma de ${c} bate horário com ${r.conflitaCom}.`);
		} else {
			toast.error(`Essa turma de ${c} não está na oferta deste período.`);
		}
	}

	/**
	 * Card de mudanças pontuais da Darcy (`acoesGrade`, já validadas no backend).
	 * Aplica na ordem e devolve o "Desfazer": volta seleção, turnos, estrelas,
	 * matérias tiradas da lista e o cenário que estava aberto. O que falhar (a
	 * grade mudou desde a proposta) vira aviso, sem derrubar o resto.
	 */
	async function aplicarAcoesDoChat(acoes: AcaoGradeChat[]): Promise<ResultadoAcoesChat> {
		const antes = {
			selecao: gradeStore.snapshotSelecao(),
			turnos: [...gradeStore.turnosPermitidos],
			cenario: gradeStore.activeId
		};
		const tiradas: string[] = [];
		const estreladas: string[] = [];
		const falhas: string[] = [];

		for (const a of acoes) {
			if (a.tipo === 'adicionar' || a.tipo === 'trocarTurma') {
				const c = a.codigo;
				if (!gradeStore.hasMateria(c)) await adicionarAoPool(c);
				if (!gradeStore.hasMateria(c)) {
					falhas.push(avisoAdd ?? `${c} não entrou na lista`);
					continue;
				}
				if (a.idTurma) {
					const r = gradeStore.selecionarTurma(c, a.idTurma);
					if (!r.ok) {
						falhas.push(
							r.conflitaCom
								? `${c} bate horário com ${r.conflitaCom}`
								: `turma de ${c} saiu da oferta`
						);
					}
				}
			} else if (a.tipo === 'remover') {
				if (gradeStore.hasMateria(a.codigo)) {
					gradeStore.removerMateriaDoPool(a.codigo);
					tiradas.push(a.codigo);
				}
			} else if (a.tipo === 'priorizar') {
				if (!gradeStore.isPrioritaria(a.codigo)) {
					gradeStore.togglePrioridade(a.codigo);
					estreladas.push(a.codigo);
				}
			} else if (a.tipo === 'turnos') {
				gradeStore.setTurnos(a.turnos);
			} else if (a.tipo === 'criarCenario') {
				// "Salvar como cenário": o novo nasce com a grade de agora.
				const atual = gradeStore.snapshotSelecao();
				gradeStore.criarCenario(a.nome);
				gradeStore.aplicarSelecao(atual);
			} else if (a.tipo === 'limpar') {
				gradeStore.limpar();
			}
		}

		const aplicadas = acoes.length - falhas.length;
		if (aplicadas > 0) {
			toast.success(
				aplicadas === 1 ? 'Mudança aplicada na grade.' : `${aplicadas} mudanças aplicadas.`,
				{
					action: { label: 'Desfazer', onClick: () => void desfazer() }
				}
			);
		}

		let desfeito = false;
		async function desfazer() {
			if (desfeito) return;
			desfeito = true;
			if (gradeStore.activeId !== antes.cenario && antes.cenario) {
				gradeStore.selecionarCenario(antes.cenario);
			}
			for (const c of tiradas) await adicionarAoPool(c);
			for (const c of estreladas) if (gradeStore.isPrioritaria(c)) gradeStore.togglePrioridade(c);
			gradeStore.setTurnos(antes.turnos);
			gradeStore.restaurarSelecao(antes.selecao);
		}

		return { falhas, desfazer };
	}

	/**
	 * Resposta do aluno sobre módulo livre.
	 *
	 * Persiste porque a pergunta não deve voltar a cada visita — nem para quem
	 * disse sim, nem para quem disse não. Falha de gravação não bloqueia nada: a
	 * escolha vale nesta sessão de qualquer jeito.
	 */
	async function responderModuloLivre(quer: boolean, tema?: string): Promise<void> {
		const anterior = planoFormaturaStore.preferencias?.moduloLivre;
		await planoFormaturaStore.setPreferenciaModuloLivre({
			quer,
			tema: tema ?? anterior?.tema,
			curriculoCompleto: authStore.getUser()?.dadosFluxograma?.matrizCurricular ?? undefined
		});
		// Dispensar limpa as sugestões da tela; o saldo continua aparecendo, porque
		// recusar a sugestão não faz as horas deixarem de faltar.
		if (!quer) sugestoesModuloLivre = [];
	}

	/**
	 * Procura módulo livre sobre o tema que o aluno deu.
	 *
	 * Guarda o tema junto: da próxima visita ele reencontra a busca de onde parou,
	 * em vez de ter de lembrar o que tinha digitado.
	 */
	async function buscarModuloLivre(tema: string): Promise<void> {
		if (!periodo) return;
		buscandoModuloLivre = true;
		try {
			const achados = await candidatosModuloLivre(
				tema,
				periodo,
				gradeStore.pool.map((m) => m.codigo)
			);
			sugestoesModuloLivre = achados.map((m) => ({
				codigo: m.codigo,
				nome: m.nome,
				creditos: m.creditos
			}));
			await planoFormaturaStore.setPreferenciaModuloLivre({
				quer: true,
				tema,
				curriculoCompleto: authStore.getUser()?.dadosFluxograma?.matrizCurricular ?? undefined
			});
		} catch {
			sugestoesModuloLivre = [];
		} finally {
			buscandoModuloLivre = false;
		}
	}

	/** Confirma o rearranjo pedido por professor: persiste no banco pra próxima vez. */
	async function aceitarConfirmacaoProfessor(): Promise<void> {
		if (!confirmacaoProfessor) return;
		const { docentes } = confirmacaoProfessor;
		confirmacaoProfessor = null;
		gradeStore.definirDocentesPersistidos({ ...gradeStore.docentesPersistidos, ...docentes });
		try {
			for (const [codigo, docente] of Object.entries(docentes)) {
				await preferenciasGradeService.salvar(codigo, { docente });
			}
			toast.success('Combinado — vou lembrar dessa preferência da próxima vez.');
		} catch {
			// Best-effort: a preferência já vale nesta sessão mesmo se o banco falhar,
			// só não sobrevive a um reload.
			toast.info('Apliquei na grade, mas não consegui salvar pra lembrar depois.');
		}
	}

	/** Recusa o rearranjo: volta pra grade de antes do pedido de professor. */
	function recusarConfirmacaoProfessor(): void {
		if (!confirmacaoProfessor) return;
		gradeStore.restaurarSelecao(confirmacaoProfessor.snapshot);
		confirmacaoProfessor = null;
	}
</script>

<PageMeta
	title="Montador de Grade | NoFluxo UNB"
	description="Monte e simule sua grade horária sem conflito de horário, com as turmas realmente ofertadas."
	noIndex={true}
/>

<PageBackground />

{#if status === 'loading'}
	<div class="text-muted-foreground relative z-10 flex items-center justify-center gap-2 py-20">
		<Loader2 class="h-5 w-5 animate-spin" /> Carregando matérias e turmas...
	</div>
{:else if status === 'error'}
	<div class="relative z-10 mx-auto w-full max-w-2xl px-4 py-20">
		<div
			class="rounded-2xl border border-red-300 bg-red-50 px-4 py-6 text-center text-sm text-red-800 dark:border-red-300/30 dark:bg-red-500/10 dark:text-red-200"
		>
			{erro}
		</div>
	</div>
{:else}
	<MontadorGradeView
		{periodo}
		{periodoAtual}
		ofertaProximo={proximo}
		{limiteCreditos}
		onAdd={adicionarAoPool}
		onSemear={semear}
		onVoltarInicio={voltarAoInicio}
		bind:aviso={avisoAdd}
		obrigatoriasSemOferta={semOferta}
		{confirmacaoProfessor}
		onAceitarConfirmacaoProfessor={aceitarConfirmacaoProfessor}
		onRecusarConfirmacaoProfessor={recusarConfirmacaoProfessor}
		{situacao}
		{situacaoCarregando}
		moduloLivre={planoFormaturaStore.preferencias?.moduloLivre ?? null}
		{sugestoesModuloLivre}
		{buscandoModuloLivre}
		onResponderModuloLivre={responderModuloLivre}
		onBuscarModuloLivre={buscarModuloLivre}
		onLimiteCreditos={(creditos) => void planoFormaturaStore.salvarLimiteCreditos(creditos)}
	/>

	<!-- Chatbot flutuante (Darcy) — recomenda optativas com turma e insere na grade -->
	<AssistenteChatFab
		onAddToGrade={adicionarComAviso}
		onUsarTurma={usarTurmaDoChat}
		onAplicarGrade={aplicarGradeDoChat}
		onAplicarAcoes={aplicarAcoesDoChat}
	/>

	<PreRequisitoConfirmDialog
		{pendencias}
		onConfirmar={resolverPendencias}
		onCancelar={descartarPendencias}
	/>
{/if}
