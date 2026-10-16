/**
 * Correquisito na montagem automática: as matérias do par entram JUNTAS na grade,
 * ou nenhuma entra. O SIGAA recusa a matrícula em só uma delas.
 *
 * O solver (`horario-slots`) escolhe cada matéria de forma independente e não
 * conhece essa regra. Em vez de ensiná-la a ele, o par vira UMA matéria composta
 * antes do solve — as turmas dela são as combinações sem conflito das turmas das
 * duas — e é separado de volta depois. Créditos e pesos somam, então o orçamento e
 * a escada de prioridade continuam valendo para o conjunto.
 */
import {
	hasConflict,
	type AutoMontarResult,
	type MateriaTurmas,
	type OpcaoGrade,
	type TurmaCandidata
} from '$lib/utils/horario-slots';
import { normalizarCodigo as norm } from '$lib/utils/subject-codes';

/** Onde a turma composta guarda a turma de cada membro (sobrevive a `{ ...t }`). */
const MEMBROS = Symbol('membros-correquisito');

type TurmaComposta<T> = TurmaCandidata<T> & {
	[MEMBROS]?: Array<[string, TurmaCandidata<T>]>;
};

/** Teto de combinações de turmas por grupo — par com 15×15 turmas ainda cabe. */
const MAX_COMBINACOES = 400;

export interface CorrequisitosFundidos<T> {
	/** Entrada do solver com os grupos fundidos e as órfãs fora. */
	materias: Array<MateriaTurmas<T>>;
	/**
	 * Matérias tiradas da montagem porque o correquisito não está disponível (fora
	 * da lista, sem turma no turno, ou o par não tem combinação sem conflito).
	 */
	semCorrequisito: Map<string, string[]>;
	/** Devolve o resultado do solver em termos das matérias originais. */
	separar(r: AutoMontarResult<T>): AutoMontarResult<T>;
	separarOpcao(o: OpcaoGrade<T>): OpcaoGrade<T>;
}

/**
 * @param coRequisitos correquisitos AINDA pendentes por chave (sem os já cursados
 *   ou em curso — o `MateriaGrade.coRequisitos` já vem assim).
 * @param jaNaGrade chaves que já ocupam a grade fora do solver (travadas): o
 *   correquisito delas está atendido.
 * @param isentas chaves que não passam pela regra — matrícula que já aconteceu.
 */
export function fundirCorrequisitos<T>(
	materias: Array<MateriaTurmas<T>>,
	coRequisitos: Map<string, string[]>,
	jaNaGrade: Set<string> = new Set(),
	isentas: Set<string> = new Set()
): CorrequisitosFundidos<T> {
	const porChave = new Map(materias.map((m) => [norm(m.chave), m]));
	const naGrade = new Set([...jaNaGrade].map(norm));
	const semCorrequisito = new Map<string, string[]>();

	// 1. Tira quem tem correquisito indisponível — em cascata: tirar uma pode deixar
	//    o par dela sem correquisito também.
	const presentes = new Set(porChave.keys());
	const pendentesDe = (chave: string) =>
		isentas.has(chave)
			? []
			: (coRequisitos.get(chave) ?? []).map(norm).filter((c) => !naGrade.has(c));
	let mudou = true;
	while (mudou) {
		mudou = false;
		for (const chave of presentes) {
			const faltam = pendentesDe(chave).filter((c) => !presentes.has(c));
			if (faltam.length > 0) {
				presentes.delete(chave);
				semCorrequisito.set(chave, faltam);
				mudou = true;
			}
		}
	}

	// 2. Agrupa os pares (componentes conexos — correquisito costuma ser par, mas
	//    nada impede trio).
	const pai = new Map([...presentes].map((c) => [c, c]));
	const raiz = (c: string): string => {
		while (pai.get(c) !== c) c = pai.get(c)!;
		return c;
	};
	for (const chave of presentes) {
		for (const c of pendentesDe(chave)) pai.set(raiz(chave), raiz(c));
	}
	const grupos = new Map<string, string[]>();
	for (const chave of presentes) {
		const r = raiz(chave);
		grupos.set(r, [...(grupos.get(r) ?? []), chave]);
	}

	// 3. Funde cada grupo numa matéria composta.
	const saida: Array<MateriaTurmas<T>> = [];
	const compostas = new Map<string, string[]>();
	for (const membros of grupos.values()) {
		if (membros.length === 1) {
			saida.push(porChave.get(membros[0])!);
			continue;
		}
		membros.sort();
		const ms = membros.map((c) => porChave.get(c)!);

		let combinacoes: Array<{ mask: bigint; bonus: number; itens: Array<[string, TurmaCandidata<T>]> }> = [
			{ mask: 0n, bonus: 0, itens: [] }
		];
		for (const m of ms) {
			const proximas: typeof combinacoes = [];
			for (const parcial of combinacoes) {
				for (const t of m.turmas) {
					if (hasConflict(parcial.mask, t.mask)) continue;
					proximas.push({
						mask: parcial.mask | t.mask,
						bonus: parcial.bonus + (t.bonus ?? 0),
						itens: [...parcial.itens, [m.chave, t]]
					});
					if (proximas.length >= MAX_COMBINACOES) break;
				}
				if (proximas.length >= MAX_COMBINACOES) break;
			}
			combinacoes = proximas;
		}

		if (combinacoes.length === 0) {
			// Nenhuma combinação sem conflito: o grupo inteiro fica de fora.
			for (const c of membros) semCorrequisito.set(c, membros.filter((o) => o !== c));
			continue;
		}

		const chave = membros.join('+');
		compostas.set(chave, ms.map((m) => m.chave));
		saida.push({
			chave,
			turmas: combinacoes.map((c): TurmaComposta<T> => ({
				mask: c.mask,
				// O solver só olha `mask`/`bonus`; a turma "de fachada" é a do 1º membro.
				turma: c.itens[0][1].turma,
				bonus: c.bonus,
				[MEMBROS]: c.itens
			})),
			peso: ms.reduce((s, m) => s + (m.peso ?? 1), 0),
			pesoDegrau: ms.reduce((s, m) => s + (m.pesoDegrau ?? m.peso ?? 1), 0),
			creditos: ms.reduce((s, m) => s + (m.creditos ?? 0), 0),
			obrigatoria: ms.some((m) => m.obrigatoria),
			essencial: ms.some((m) => m.essencial)
		});
	}

	// Órfãs nunca entram; para quem chama, elas "não couberam".
	const orfas = materias.filter((m) => !presentes.has(norm(m.chave)) || semCorrequisito.has(norm(m.chave)));

	const expandirChaves = (chaves: string[]) =>
		chaves.flatMap((c) => compostas.get(c) ?? [c]);

	function separar(r: AutoMontarResult<T>): AutoMontarResult<T> {
		const selecao = new Map<string, TurmaCandidata<T>>();
		for (const [chave, t] of r.selecao) {
			const itens = (t as TurmaComposta<T>)[MEMBROS];
			if (compostas.has(chave) && itens) for (const [c, ti] of itens) selecao.set(c, ti);
			else selecao.set(chave, t);
		}
		return {
			...r,
			selecao,
			naoAlocadas: [...expandirChaves(r.naoAlocadas), ...orfas.map((m) => m.chave)],
			preferenciasNaoAtendidas: expandirChaves(r.preferenciasNaoAtendidas)
		};
	}

	return {
		materias: saida,
		semCorrequisito,
		separar,
		separarOpcao: (o) => ({ ...o, resultado: separar(o.resultado) })
	};
}
