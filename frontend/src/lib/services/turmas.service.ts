/**
 * Acesso às ofertas de turmas (tabela `turmas`) para o Montador de Grade.
 * Extrai o padrão de consulta já usado em `TurmasVagasPanel.svelte` para um
 * serviço reusável, sempre filtrando pelo período letivo ativo (RPC
 * `periodo_letivo_atual`).
 */
import { createSupabaseBrowserClient } from '$lib/supabase/client';
import { searchMaterias } from './materias.service';

export interface TurmaOferta {
	id_turmas: number;
	id_materia: number;
	turma: string;
	docente: string | null;
	horario: string | null;
	local: string | null;
	ano_periodo: string;
	vagas_ofertadas: number | null;
	vagas_ocupadas: number | null;
	vagas_sobrando: number | null;
}

const supabase = createSupabaseBrowserClient();

const TURMA_COLUNAS =
	'id_turmas, id_materia, turma, docente, horario, local, ano_periodo, vagas_ofertadas, vagas_ocupadas, vagas_sobrando';

/** Período letivo ativo no banco (ex.: "2026.1"). */
export async function getPeriodoAtivo(): Promise<string> {
	const { data, error } = await supabase.rpc('periodo_letivo_atual');
	if (error) throw new Error(error.message);
	return data as string;
}

/**
 * Busca as turmas ofertadas para um conjunto de matérias no período informado
 * (ou no período ativo, se omitido). Retorna lista achatada — o agrupamento por
 * matéria fica a cargo do chamador (via `id_materia`).
 */
export async function getTurmasPorMaterias(
	idMaterias: number[],
	periodo?: string
): Promise<TurmaOferta[]> {
	if (idMaterias.length === 0) return [];

	const periodoAtivo = periodo ?? (await getPeriodoAtivo());

	const { data, error } = await supabase
		.from('turmas')
		.select(TURMA_COLUNAS)
		.in('id_materia', idMaterias)
		.eq('ano_periodo', periodoAtivo)
		.order('turma');

	if (error) throw new Error(error.message);
	return (data as TurmaOferta[] | null) ?? [];
}

/**
 * Período letivo seguinte ao informado: AAAA.1 → AAAA.2 → (AAAA+1).1. Mesma regra
 * de reserva do `scrape_turmas_lite.yml`, que coleta esse período uma vez por mês.
 */
export function proximoPeriodo(periodo: string): string {
	const [ano, sem] = periodo.split('.');
	return sem === '1' ? `${ano}.2` : `${Number(ano) + 1}.1`;
}

/**
 * Já existe alguma turma coletada para o período? A oferta do próximo semestre só
 * aparece quando o SIGAA a publica (e a coleta mensal a traz) — antes disso o
 * Montador planeja com a oferta do semestre atual, como estimativa.
 */
export async function temOfertaNoPeriodo(periodo: string): Promise<boolean> {
	const { count, error } = await supabase
		.from('turmas')
		.select('id_turmas', { count: 'exact', head: true })
		.eq('ano_periodo', periodo);
	if (error) throw new Error(error.message);
	return (count ?? 0) > 0;
}

/** Turma da busca global, já com a matéria a que pertence. */
export interface TurmaComMateria extends TurmaOferta {
	codigoMateria: string;
	nomeMateria: string;
}

/**
 * Busca na oferta inteira do período: casa o termo contra **docente, horário e sala**
 * da turma e também contra **código e nome da matéria**. Serve para perguntas que a
 * busca por matéria não responde — "que matérias o professor X dá?", "o que tem em
 * 2M34?".
 *
 * São duas consultas unidas em vez de um join: PostgREST não expressa "casa na turma
 * OU na matéria embutida" numa query só, e assim a busca não depende do nome da
 * relação FK entre `turmas` e `materias`.
 */
export async function searchTurmas(
	query: string,
	periodo?: string,
	limite = 80
): Promise<TurmaComMateria[]> {
	// Vírgula e parênteses delimitam filtros no PostgREST; % é curinga.
	const termo = query.replace(/[%,()]/g, ' ').trim();
	if (termo.length < 2) return [];

	const periodoAtivo = periodo ?? (await getPeriodoAtivo());
	const like = `%${termo}%`;

	const [porAtributo, materias] = await Promise.all([
		supabase
			.from('turmas')
			.select(TURMA_COLUNAS)
			.eq('ano_periodo', periodoAtivo)
			.or(`docente.ilike.${like},horario.ilike.${like},local.ilike.${like}`)
			.limit(limite),
		searchMaterias(termo)
	]);

	if (porAtributo.error) throw new Error(porAtributo.error.message);

	const encontradas = new Map<number, TurmaOferta>();
	for (const t of (porAtributo.data as TurmaOferta[] | null) ?? []) {
		encontradas.set(t.id_turmas, t);
	}

	if (materias.length > 0) {
		for (const t of await getTurmasPorMaterias(
			materias.map((m) => m.idMateria),
			periodoAtivo
		)) {
			encontradas.set(t.id_turmas, t);
		}
	}
	if (encontradas.size === 0) return [];

	// Nomes das matérias de tudo que sobrou — inclusive das turmas achadas por docente,
	// cuja matéria pode não ter casado com o termo.
	const idsSemNome = [...new Set([...encontradas.values()].map((t) => t.id_materia))];
	const nomePorId = new Map(materias.map((m) => [m.idMateria, m]));
	const faltantes = idsSemNome.filter((id) => !nomePorId.has(id));
	if (faltantes.length > 0) {
		const { data, error } = await supabase
			.from('materias')
			.select('id_materia, codigo_materia, nome_materia')
			.in('id_materia', faltantes);
		if (error) throw new Error(error.message);
		for (const m of (data as Array<{
			id_materia: number | string;
			codigo_materia: string;
			nome_materia: string;
		}> | null) ?? []) {
			const id = Number(m.id_materia);
			nomePorId.set(id, {
				idMateria: id,
				codigo: String(m.codigo_materia),
				nome: String(m.nome_materia),
				creditos: 0
			});
		}
	}

	return [...encontradas.values()]
		.map((t) => ({
			...t,
			codigoMateria: nomePorId.get(t.id_materia)?.codigo ?? '—',
			nomeMateria: nomePorId.get(t.id_materia)?.nome ?? 'Matéria desconhecida'
		}))
		.sort(
			(a, b) =>
				a.codigoMateria.localeCompare(b.codigoMateria) || a.turma.localeCompare(b.turma)
		)
		.slice(0, limite);
}
