/**
 * "O aluno já tem isso?" — filtro compartilhado pelos atuadores que recomendam
 * matéria a partir de uma busca no catálogo inteiro (optativas e módulo livre).
 *
 * Antes cada atuador tinha uma cópia destas funções. Regras (as mesmas do
 * Montador, docs/montador-de-grade.md):
 *   1. cursada ou em curso (MATR) → já tem;
 *   2. a equivalência do candidato é satisfeita pelo que ele cursou → já tem
 *      ("cursou C e Y ≡ C");
 *   3. o candidato substitui sozinho uma matéria que ele já cumpriu → cursar não
 *      contaria de novo ("X cumprida e R ≡ X").
 */

import type { MateriaInput } from "../../../types/planejamento";
import { SupabaseWrapper } from "../../../supabase_wrapper";
import {
    construirSubstitutosPorCodigo,
    parseFluxograma,
    substitutosDeCumpridas,
} from "../../plano_formatura.service";
import { parseExpressaoLogicaFromDb, satisfazExpressaoLogica } from "../../../utils/expressao_logica";

type ComCodigo = { codigo: string };

function norm(codigo: string): string {
    return (codigo || "").trim().toUpperCase();
}

/** Tira da lista as matérias que o aluno já cumpriu. Função pura. */
export function filtrarJaCursadas<T extends ComCodigo>(materias: T[], jaCumpridas: Set<string>): T[] {
    if (jaCumpridas.size === 0) return materias;
    const cumpridas = new Set([...jaCumpridas].map((c) => norm(c)));
    return materias.filter((m) => !cumpridas.has(norm(m.codigo)));
}

/**
 * O que o aluno já cursou: aprovadas/dispensadas ∪ em curso (MATR).
 *
 * MATR entra porque estará concluída antes do semestre que ele vai cursar — mesma
 * regra do AtuadorGrade e do Motor 2. Degrada pra conjunto vazio (nenhum filtro) se
 * o aluno não tiver cadastro ou fluxograma: a busca continua funcionando.
 */
export async function cumpridasDoAluno(email: string): Promise<Set<string>> {
    const vazio = new Set<string>();
    try {
        const supabase = SupabaseWrapper.get();
        const { data: user } = await supabase
            .from("users")
            .select("id_user")
            .eq("email", email)
            .maybeSingle();
        if (!user?.id_user) return vazio;

        const { data: dados } = await supabase
            .from("dados_users")
            .select("fluxograma_atual")
            .eq("id_user", user.id_user)
            .maybeSingle();
        if (!dados?.fluxograma_atual) return vazio;

        const { completed, currentSemester } = parseFluxograma(dados.fluxograma_atual);
        const out = new Set<string>(completed);
        for (const m of currentSemester) out.add(norm(m.codigo));
        return out;
    } catch {
        return vazio;
    }
}

/**
 * Entre os candidatos da busca, quais o aluno já tem (regras 1–3 do topo).
 *
 * Passe único, igual a expandirCumpridasComEquivalencias (commit 7e7075f4): compara
 * sempre contra o que foi cursado de verdade. A busca varre o catálogo inteiro da
 * UnB, não só a matriz, então a equivalência é resolvida aqui direto na tabela —
 * inclusive para matéria cursada fora da matriz do aluno.
 */
export async function candidatosJaCumpridos(
    codigosCandidatos: string[],
    cumpridas: Set<string>
): Promise<Set<string>> {
    const jaCumpridos = new Set<string>();
    if (cumpridas.size === 0) return jaCumpridos;

    const codigos = codigosCandidatos.map((c) => norm(c)).filter(Boolean);
    for (const c of codigos) if (cumpridas.has(c)) jaCumpridos.add(c);

    try {
        const supabase = SupabaseWrapper.get();
        const { data: mats } = await supabase
            .from("materias")
            .select("id_materia, codigo_materia")
            .in("codigo_materia", [...new Set([...codigos, ...cumpridas])]);
        const codigoPorId = new Map<number, string>(
            (mats ?? []).map((m: any) => [Number(m.id_materia), norm(m.codigo_materia)])
        );
        if (codigoPorId.size === 0) return jaCumpridos;

        const { data: equivs } = await supabase
            .from("equivalencias")
            .select("id_materia, expressao_logica")
            .in("id_materia", [...codigoPorId.keys()]);

        const candidatos = new Set(codigos);
        const linhasDasCumpridas = new Map<string, unknown[]>();
        for (const row of (equivs ?? []) as any[]) {
            const cod = codigoPorId.get(Number(row.id_materia));
            if (!cod) continue;
            // Regra 2: a equivalência do candidato fecha com o que ele cursou.
            if (candidatos.has(cod) && !jaCumpridos.has(cod)) {
                const expr = parseExpressaoLogicaFromDb(row.expressao_logica) ?? row.expressao_logica;
                if (expr && satisfazExpressaoLogica(expr, cumpridas)) jaCumpridos.add(cod);
            }
            if (cumpridas.has(cod)) {
                linhasDasCumpridas.set(cod, [...(linhasDasCumpridas.get(cod) ?? []), row.expressao_logica]);
            }
        }

        // Regra 3: substitutos das cumpridas — mesmas funções do AtuadorGrade.
        const comoMaterias = [...linhasDasCumpridas].map(
            ([codigo, equivalencias]) => ({ codigo, equivalencias }) as unknown as MateriaInput
        );
        const repetiriam = substitutosDeCumpridas(construirSubstitutosPorCodigo(comoMaterias), cumpridas);
        for (const c of codigos) if (repetiriam.has(c)) jaCumpridos.add(c);
    } catch {
        // Degrada: mantém só o filtro direto, sem a parte de equivalência.
    }

    return jaCumpridos;
}
