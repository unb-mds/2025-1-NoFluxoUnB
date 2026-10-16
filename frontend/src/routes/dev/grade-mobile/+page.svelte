<script lang="ts">
	/**
	 * Harness de layout do Montador de Grade.
	 * Monta a tela real (MontadorGradeView) com um pool falso, sem auth nem
	 * backend, para conferir o comportamento responsivo — principalmente no
	 * celular, onde a coluna única muda tudo de lugar.
	 *
	 * `?vazio=1` começa com a lista de matérias vazia, para exercitar o caminho
	 * em que "Montar grade" precisa puxar as matérias do plano sozinho.
	 */
	import MontadorGradeView from '$lib/components/planejamento/MontadorGradeView.svelte';
	import AssistenteChatFab from '$lib/components/planejamento/AssistenteChatFab.svelte';
	import PageBackground from '$lib/components/effects/PageBackground.svelte';
	import {
		gradeStore,
		slotMaskFromHorario,
		type MateriaGrade
	} from '$lib/stores/grade.store.svelte';
	import type { TurmaOferta } from '$lib/services/turmas.service';
	import type { SemeaduraResultado } from '$lib/services/grade-pool.service';
	import type { SituacaoAcademica } from '$lib/services/situacao-academica.service';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';

	const PERIODO = '2026.1';
	let idSeq = 1;

	function turma(
		idMateria: number,
		nome: string,
		horario: string,
		docente: string | null,
		vagas: number
	) {
		const t: TurmaOferta = {
			id_turmas: idSeq++,
			id_materia: idMateria,
			turma: nome,
			docente,
			horario,
			local: 'ICC Norte BT-64/8',
			ano_periodo: PERIODO,
			vagas_ofertadas: 60,
			vagas_ocupadas: 60 - vagas,
			vagas_sobrando: vagas
		};
		return { mask: slotMaskFromHorario(horario), turma: t };
	}

	function materia(
		idMateria: number,
		codigo: string,
		nomeMateria: string,
		creditos: number,
		turmas: ReturnType<typeof turma>[],
		extra: Partial<MateriaGrade> = {}
	): MateriaGrade {
		return { codigo, nome: nomeMateria, creditos, idMateria, turmas, ...extra };
	}

	const pool: MateriaGrade[] = [
		materia(1, 'CIC0004', 'Algoritmos e Programação de Computadores', 6, [
			turma(1, 'A', '24M34', 'ANDRE DRUMMOND', 12),
			turma(1, 'B', '35T23', 'MARISTELA HOLANDA', 0),
			turma(1, 'C', '6N12', 'GENAINA RODRIGUES', 4)
		]),
		materia(2, 'MAT0025', 'Cálculo 1', 6, [
			turma(2, 'A', '246M12', 'JOSE CARLOS', 8),
			turma(2, 'B', '35N34', 'ANA PAULA', 22)
		]),
		materia(
			3,
			'CIC0090',
			'Estruturas de Dados',
			4,
			[turma(3, 'A', '35M34', 'VINICIUS BORGES', 3), turma(3, 'B', '24T45', null, 0)],
			{ avisoPreRequisito: 'CIC0004' }
		),
		materia(
			4,
			'FGA0158',
			'Engenharia de Software',
			4,
			[turma(4, 'A', '35T34', 'RICARDO MATOS', 15)],
			{ natureza: 'optativa' }
		),
		materia(5, 'CIC0202', 'Sistemas Operacionais', 4, [
			turma(5, 'A', '24N12', 'ALETEIA ARAUJO', 9),
			turma(5, 'B', '6T12', 'PEDRO GARCIA', 30)
		]),
		materia(6, 'CIC0197', 'Teoria da Computação', 4, [turma(6, 'A', '35M12', 'DIBIO BORGES', 6)], {
			natureza: 'optativa',
			optatoria: true
		}),
		materia(7, 'MUS0033', 'Percepção Musical', 2, [turma(7, 'A', '2T12', 'ANA LUISA', 18)], {
			natureza: 'modulo_livre'
		})
	];

	/**
	 * Situação de exemplo: obrigatória faltando, optativa CUMPRIDA e módulo livre
	 * ainda em aberto. É o caso que exercita a tela inteira de uma vez — a barra
	 * verde de cumprida, a etiqueta de saturada e a pergunta de módulo livre.
	 * `?situacao=0` tira, para conferir o degrade sem integralização.
	 */
	const SITUACAO_EXEMPLO: SituacaoAcademica = {
		faltam: { obrigatoria: 480, optativa: 0, modulo_livre: 120 },
		exigido: { obrigatoria: 2400, optativa: 360, modulo_livre: 120 },
		realizado: { obrigatoria: 1920, optativa: 360, modulo_livre: 0 },
		exigeModuloLivre: true,
		complementarConfiavel: true
	};

	const comecarVazio = get(page).url.searchParams.has('vazio');
	const semSituacao = get(page).url.searchParams.get('situacao') === '0';
	const situacao = semSituacao ? null : SITUACAO_EXEMPLO;
	gradeStore.definirSituacao(situacao);

	let moduloLivre = $state<{ quer: boolean | null; tema?: string } | null>(null);
	let sugestoes = $state<Array<{ codigo: string; nome: string; creditos: number }>>([]);

	gradeStore.init(comecarVazio ? [] : pool, { idUser: null, periodo: PERIODO });
	if (!comecarVazio) {
		gradeStore.selecionarTurma('CIC0004', 1);
		gradeStore.selecionarTurma('MAT0025', 4);
		gradeStore.selecionarTurma('FGA0158', 8);
		gradeStore.selecionarTurma('CIC0202', 9);
		gradeStore.togglePrioridade('MAT0025');
	}

	function onAdd(codigo: string) {
		console.log('[harness] adicionar', codigo);
	}

	/**
	 * Faz o papel do plano de formatura: devolve o que falta na lista, com a mesma
	 * semântica da rota real (só entra o que ainda não está lá). O harness não tem
	 * matriz, então nunca exercita a semeadura real — para isso use a rota real.
	 */
	async function onSemear(): Promise<SemeaduraResultado> {
		const faltando = pool.filter((m) => !gradeStore.hasMateria(m.codigo));
		for (const m of faltando) gradeStore.addMateriaAoPool(m);
		return { adicionadas: faltando.map((m) => m.codigo), obrigatoriasSemOferta: [] };
	}
</script>

<PageBackground />

<MontadorGradeView
	periodo={PERIODO}
	limiteCreditos={24}
	{onAdd}
	{onSemear}
	{situacao}
	{moduloLivre}
	sugestoesModuloLivre={sugestoes}
	onResponderModuloLivre={(quer, tema) => {
		moduloLivre = { quer, tema };
		if (!quer) sugestoes = [];
	}}
	onBuscarModuloLivre={(tema) => {
		console.log('[harness] buscar módulo livre', tema);
		sugestoes = [
			{ codigo: 'MUS0033', nome: 'Percepção Musical 1', creditos: 2 },
			{ codigo: 'LIP0096', nome: 'Língua de Sinais Brasileira', creditos: 4 }
		];
	}}
/>

<!-- Presente na tela real: flutua sobre o rodapé e precisa de folga embaixo. -->
<AssistenteChatFab onAddToGrade={onAdd} onUsarTurma={() => {}} onAplicarGrade={() => {}} />
