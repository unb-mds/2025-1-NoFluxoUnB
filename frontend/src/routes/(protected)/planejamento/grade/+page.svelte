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
	import { gradeStore, lerPoolSalvo, lerRemovidasSalvo } from '$lib/stores/grade.store.svelte';
	import {
		construirMateriasGrade,
		montarPoolRecomendado,
		motivoParaNaoAdicionar,
		pendenciasPreRequisito,
		invalidarContextoGrade,
		candidatosModuloLivre,
		type SemeaduraResultado,
		type PendenciaPreRequisito
	} from '$lib/services/grade-pool.service';
	import {
		carregarSituacao,
		type SituacaoAcademica
	} from '$lib/services/situacao-academica.service';
	import PreRequisitoConfirmDialog from '$lib/components/planejamento/PreRequisitoConfirmDialog.svelte';
	import { vagaAssinaturasStore } from '$lib/stores/vaga-assinaturas.store.svelte';
	import { getPeriodoAtivo } from '$lib/services/turmas.service';
	import { preferenciasGradeService } from '$lib/services/preferencias-grade.service';
	import { filtrarNaoCursados } from '$lib/utils/subject-codes';
	import { turmasReaisDoHistorico, encontrarTurmaReal } from '$lib/utils/turmas-reais';
	import { ROUTES } from '$lib/config/routes';
	import type { SemestrePlano, ItemSemestre, MateriaPlano } from '$lib/types/plano-formatura';
	import { CalendarDays, Loader2 } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let erro = $state<string | null>(null);
	let periodo = $state<string | null>(null);
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
		const reais = turmasReaisDoHistorico(authStore.getUser()?.dadosFluxograma, periodo);
		if (reais.size === 0) return;
		for (const m of gradeStore.pool) {
			if (!gradeStore.isCursandoAtual(m.codigo) || gradeStore.turmaSelecionada(m.codigo)) continue;
			const idTurma = encontrarTurmaReal(m, reais);
			if (idTurma != null) gradeStore.selecionarTurma(m.codigo, idTurma);
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
	 * Roda a cada montagem e é idempotente: só entra o que falta na lista, o que o
	 * aluno tirou na lixeira não volta, e matéria já cursada nunca entra.
	 */
	async function semear(): Promise<SemeaduraResultado> {
		if (!periodo) return { adicionadas: [], obrigatoriasSemOferta: [] };

		const { materias, obrigatoriasSemOferta, naturezasSaturadas, pendentesSemOferta } =
			await montarPoolRecomendado(periodo, {
			limiteCreditos,
			ordemDoPlano: codigosRecomendados(),
			// A lixeira não vale para matrícula em curso: quem quer a MATR fora da grade
			// usa o botão "matérias em curso", que a esconde sem perder a informação.
			excluir: semExcluirCursando([
				...gradeStore.removidas,
				...gradeStore.pool.map((m) => m.codigo)
			]),
			// Complementa a lista que já existe em vez de ignorá-la: o que o aluno já
			// selecionou ocupa horário e crédito antes de recomendarmos o resto.
			base: {
				mask: gradeStore.combinedMask,
				creditos: gradeStore.creditosSelecionados,
				turnos: gradeStore.turnosPermitidos
			},
			situacao: situacao ?? undefined,
			// Com as em curso fora da montagem elas não ocupam vaga, então também não
			// podem consumir o orçamento — senão quem já cursa perto do teto desliga
			// o modo para ver o que mais pegar e não recebe sugestão nenhuma.
			cursandoOcupaOrcamento: gradeStore.incluirCursando
		});

		for (const m of materias) gradeStore.addMateriaAoPool(m);
		semOferta = obrigatoriasSemOferta;

		return {
			adicionadas: materias.map((m) => m.codigo),
			obrigatoriasSemOferta,
			naturezasSaturadas,
			pendentesSemOferta
		};
	}

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

			const idUser = authStore.getUser()?.idUser ?? null;
			periodo = await getPeriodoAtivo();
			const salvos = lerPoolSalvo(idUser, periodo);
			const removidas = new Set(lerRemovidasSalvo(idUser, periodo));

			// O que o aluno já tinha na lista da visita anterior. O filtro de já-cursadas
			// vale também aqui: matéria concluída depois de ter entrado no pool some
			// sozinha no próximo carregamento, sem ele ter que remover na mão.
			const salvosVivos = filtrarNaoCursados(
				salvos.filter((c) => !removidas.has(c)),
				fluxogramaStore.completedCodes,
				fluxogramaStore.currentCodes ?? new Set<string>()
			);
			const doStorage = await construirMateriasGrade(salvosVivos, periodo);

			// Matérias em curso NÃO são filtradas por `removidas`: matrícula é fato
			// consumado. Antes elas eram, e um "Limpar tudo" fazia o aluno recarregar a
			// página sem as matérias em que ele está de fato matriculado.
			const cursandoCodigos = [...(fluxogramaStore.currentCodes ?? new Set<string>())];

			const { materias: recomendadas, obrigatoriasSemOferta } = await montarPoolRecomendado(
				periodo,
				{
					limiteCreditos,
					ordemDoPlano: codigosRecomendados(),
					excluir: semExcluirCursando([...removidas, ...salvosVivos]),
					situacao: situacao ?? undefined
				}
			);
			semOferta = obrigatoriasSemOferta;

			const vistos = new Set<string>();
			const pool = [...doStorage, ...recomendadas].filter((m) =>
				vistos.has(m.codigo) ? false : (vistos.add(m.codigo), true)
			);
			gradeStore.init(pool, { idUser, periodo });
			gradeStore.definirCursandoAtual(cursandoCodigos);
			preencherTurmasReais();
			invalidarContextoGrade();
			status = 'ready';
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
	type OpcaoGradeDoChat = { estrategia: string; selecao: Array<{ codigo: string; idTurma: number }> };

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

	/** Prioriza o que o chat pediu e monta — já com o lote garantido no pool. */
	async function aplicarMontagemDoChat(
		todosCodigos: string[],
		docentes?: Record<string, string>,
		opcaoGrade?: OpcaoGradeDoChat
	): Promise<void> {
		for (const raw of todosCodigos) {
			const c = raw.trim().toUpperCase();
			if (!c) continue;
			if (gradeStore.hasMateria(c) && !gradeStore.isPrioritaria(c)) {
				gradeStore.togglePrioridade(c);
			}
		}

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
	<div class="relative z-10 flex items-center justify-center gap-2 py-20 text-white/60">
		<Loader2 class="h-5 w-5 animate-spin" /> Carregando matérias e turmas...
	</div>
{:else if status === 'error'}
	<div class="relative z-10 mx-auto w-full max-w-2xl px-4 py-20">
		<div
			class="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-6 text-center text-sm text-red-200"
		>
			{erro}
		</div>
	</div>
{:else}
	<MontadorGradeView
		{periodo}
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
	<AssistenteChatFab onAddToGrade={adicionarComAviso} onMontarGrade={montarGradeComPrioridade} />

	<PreRequisitoConfirmDialog
		{pendencias}
		onConfirmar={resolverPendencias}
		onCancelar={descartarPendencias}
	/>
{/if}
