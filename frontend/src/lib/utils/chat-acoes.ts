/**
 * O que os elementos interativos do chat FAZEM em cada tela — o catálogo está em
 * `docs/darcy-unificada.md` ("Ações no chat"). O parser (`chat-markers.ts`) diz o
 * que a resposta contém; a tela diz o que cada coisa faz ali, via prop `acoes` do
 * `ChatPanel`.
 */
import { goto } from '$app/navigation';
import { ROUTES } from '$lib/config/routes';
import { darcyStore } from '$lib/stores/darcy.store.svelte';
import type { OpcaoGradeChat } from '$lib/types/plano-formatura';

export interface AcoesChat {
	/** Item "Ver turmas" no menu do chip de matéria (envia `/turmas COD`). */
	verTurmas?: boolean;
	/** Item "+ grade" no menu do chip — só no Montador. */
	adicionarAGrade?: (codigo: string) => void;
	/** "Usar esta turma" no card `[TURMA]` que traz código e id — só no Montador. */
	usarTurma?: (codigo: string, idTurma: number) => void;
	/**
	 * Bloco `[MONTAR_GRADE]`: `aplicar` monta nesta tela; `abrir` leva a grade para o
	 * Montador, que aplica ao carregar.
	 */
	grade: {
		modo: 'aplicar' | 'abrir';
		executar: (codigos: string[], opcaoGrade?: OpcaoGradeChat) => void;
	};
}

/** Plano de Formatura e `/assistente`: "Ver turmas" no chip e "Abrir no Montador". */
export function acoesForaDoMontador(): AcoesChat {
	return {
		verTurmas: true,
		grade: {
			modo: 'abrir',
			executar: (codigos, opcaoGrade) => {
				darcyStore.definirGradePendente({ codigos, opcaoGrade });
				void goto(ROUTES.MONTADOR_GRADE);
			}
		}
	};
}
