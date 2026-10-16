/**
 * Busca e resolução de matérias para o Montador de Grade.
 * `searchMaterias` extrai a consulta global já usada em `routes/disciplinas/+page.svelte`.
 * `getMateriasByCodigos` resolve códigos arbitrários (inclusive fora da matriz do aluno,
 * p/ optativas recomendadas pelo Darcy) → id_materia + créditos, p/ buscar turmas depois.
 */
import { createSupabaseBrowserClient } from '$lib/supabase/client';

export interface MateriaBusca {
	idMateria: number;
	codigo: string;
	nome: string;
	creditos: number;
}

const supabase = createSupabaseBrowserClient();

/** Créditos ≈ carga_horaria / 15 (padrão UnB). */
function creditosDeCarga(carga: number | null | undefined): number {
	const h = Number(carga ?? 0);
	return h > 0 ? Math.round(h / 15) : 0;
}

function mapRow(m: {
	id_materia: number | string;
	codigo_materia: string;
	nome_materia: string;
	carga_horaria?: number | null;
}): MateriaBusca {
	return {
		idMateria: Number(m.id_materia),
		codigo: String(m.codigo_materia),
		nome: String(m.nome_materia),
		creditos: creditosDeCarga(m.carga_horaria)
	};
}

/** Busca global de matérias por código ou nome (mín. 2 caracteres). */
export async function searchMaterias(query: string): Promise<MateriaBusca[]> {
	// Vírgula e parênteses delimitam filtros no PostgREST; % é curinga (como em searchTurmas).
	const safe = query.replace(/[%,()]/g, ' ').trim();
	if (safe.length < 2) return [];
	const up = safe.toUpperCase();
	const { data, error } = await supabase
		.from('materias')
		.select('id_materia, codigo_materia, nome_materia, carga_horaria')
		.or(`codigo_materia.ilike.%${up}%,nome_materia.ilike.%${safe}%`)
		.order('codigo_materia')
		.limit(60);
	if (error) throw new Error(error.message);
	return ((data as Parameters<typeof mapRow>[0][] | null) ?? []).map(mapRow);
}

/** Resolve um conjunto de códigos (qualquer departamento) → dados da matéria. */
export async function getMateriasByCodigos(codigos: string[]): Promise<MateriaBusca[]> {
	const norm = [...new Set(codigos.map((c) => c.trim().toUpperCase()).filter(Boolean))];
	if (norm.length === 0) return [];
	const { data, error } = await supabase
		.from('materias')
		.select('id_materia, codigo_materia, nome_materia, carga_horaria')
		.in('codigo_materia', norm);
	if (error) throw new Error(error.message);
	return ((data as Parameters<typeof mapRow>[0][] | null) ?? []).map(mapRow);
}
