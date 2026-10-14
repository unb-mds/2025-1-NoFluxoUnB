/**
 * Desfazer da grade, reativo: o botão "Desfazer" da barra, o toast e a Darcy usam
 * este mesmo caminho. A pilha em si mora em `utils/grade-desfazer.ts` (navegador).
 *
 * Pontos são criados ANTES de mudanças grandes (montar grade, limpar, qualquer
 * coisa que a Darcy aplique). Edições pequenas — escolher uma turma, estrelar —
 * não geram ponto: o botão desfaz "a última mudança grande", e o rótulo diz qual.
 */
import { toast } from 'svelte-sonner';
import { gradeStore } from './grade.store.svelte';
import {
	consumirPonto,
	listarPontos,
	registrarPonto,
	type PontoDesfazer
} from '$lib/utils/grade-desfazer';

/**
 * O botão só mostra o que foi feito NESTA visita à tela. Os pontos de visitas
 * anteriores continuam guardados (a Darcy ainda pode desfazê-los a pedido), mas um
 * botão "Desfazer" aparecendo sozinho ao abrir a grade confundia: o aluno não tinha
 * mudado nada.
 */
const INICIO_DA_SESSAO = Date.now();

/** Rótulo do ponto criado ao desfazer — é o que o botão usa para virar "Refazer". */
const PREFIXO_REFAZER = 'Refazer';

function createDesfazerStore() {
	let pontos = $state<PontoDesfazer[]>([]);
	let ocupado = $state(false);
	/** Quem sabe trazer uma matéria de volta à lista (tem de carregar as turmas). */
	let adicionarAoPool: ((codigo: string) => Promise<void>) | null = null;

	function atualizar(): void {
		pontos = listarPontos(gradeStore.idUser, gradeStore.periodo);
	}

	/** Os pontos que o botão pode usar: criados depois que a tela abriu. */
	function daSessao(): PontoDesfazer[] {
		return pontos.filter((p) => Date.parse(p.quando) >= INICIO_DA_SESSAO);
	}

	function registrar(rotulo: string): string | null {
		const p = registrarPonto(
			gradeStore.idUser,
			gradeStore.periodo,
			rotulo,
			gradeStore.snapshotCompleto()
		);
		atualizar();
		return p?.id ?? null;
	}

	/**
	 * Restaura um ponto (e descarta os mais novos). Devolve o id do ponto "refazer"
	 * (o estado de antes de restaurar), `''` se não deu para criá-lo, ou `null` se o
	 * ponto já não existe.
	 */
	async function restaurar(id: string, avisar = true): Promise<string | null> {
		const ponto = consumirPonto(gradeStore.idUser, gradeStore.periodo, id);
		if (!ponto) {
			atualizar();
			return null;
		}
		const refazerId = registrar(`${PREFIXO_REFAZER} "${ponto.rotulo}"`);
		for (const c of gradeStore.faltantesNoPool(ponto.snapshot)) await adicionarAoPool?.(c);
		const { descartadas } = gradeStore.restaurarCompleto(ponto.snapshot);
		atualizar();
		if (avisar) {
			toast.success(`Voltei para antes de "${ponto.rotulo}".`);
			if (descartadas.length > 0) {
				toast.info(
					`Não consegui recolocar ${descartadas.join(', ')}: a turma saiu da oferta ou passou a conflitar.`
				);
			}
		}
		return refazerId ?? '';
	}

	return {
		get pontos() {
			return pontos;
		},
		/** O que o botão desfaz agora (o mais recente). */
		get ultimo(): PontoDesfazer | null {
			return daSessao()[0] ?? null;
		},
		/** O mais recente é um "refazer" — o botão troca o texto. */
		get ehRefazer(): boolean {
			return daSessao()[0]?.rotulo.startsWith(PREFIXO_REFAZER) ?? false;
		},
		get ocupado() {
			return ocupado;
		},

		/** A página registra como recolocar uma matéria na lista (precisa carregar turmas). */
		configurar(opts: { adicionarAoPool: (codigo: string) => Promise<void> }): void {
			adicionarAoPool = opts.adicionarAoPool;
		},
		/** Relê a pilha do navegador — depois de `gradeStore.init` (usuário/semestre mudaram). */
		sincronizar: atualizar,
		registrar,
		restaurar,

		/**
		 * Se a mudança que o ponto protegia não mudou nada (montou e deu a mesma grade,
		 * limpou o que já estava vazio), o ponto é jogado fora — o botão só aparece
		 * quando há algo de verdade a desfazer.
		 */
		descartarSeNadaMudou(id: string | null): void {
			if (!id) return;
			const ponto = pontos.find((p) => p.id === id);
			if (!ponto) return;
			const agora = JSON.stringify(gradeStore.snapshotCompleto());
			if (JSON.stringify(ponto.snapshot) === agora) {
				consumirPonto(gradeStore.idUser, gradeStore.periodo, id);
				atualizar();
			}
		},

		/** Botão "Desfazer"/"Refazer" da barra. */
		async desfazerUltimo(): Promise<void> {
			const p = daSessao()[0];
			if (!p || ocupado) return;
			ocupado = true;
			try {
				await restaurar(p.id);
			} finally {
				ocupado = false;
			}
		}
	};
}

export const desfazerStore = createDesfazerStore();
