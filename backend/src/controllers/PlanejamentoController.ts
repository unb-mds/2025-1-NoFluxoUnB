/**
 * Controller do Motor 2 — Cadeia de formatura personalizada.
 *
 * Endpoint: POST /planejamento/gerar-plano
 *
 * Entrada (PlanoInput):
 *   {
 *     curriculoCompleto: "8117/-2 - 2018.2",
 *     completedCodes: ["MAT0026", ...],
 *     numeroPeriodo: 3,
 *     preferencias: { limiteCreditos: 24, objetivo: "equilibrado", trabalha: false },
 *     materiasFaltantes?: MateriaInput[]   // opcional — se informado, pula o DB lookup
 *   }
 *
 * Saida (PlanoFormatura):
 *   { semestresRestantes, plano: SemestrePlano[], materiasNaoAlocadas: string[] }
 *
 * Spec: docs/motor2.md
 */

import { EndpointController, RequestType } from "../interfaces";
import { Pair, Utils } from "../utils";
import { Request, Response } from "express";
import { SupabaseWrapper } from "../supabase_wrapper";
import { createControllerLogger } from "../utils/controller_logger";
import { MARITACA_MODELS } from "../config/maritaca";
import { executarComContextoIA, logAiUsage, usageParcialDoErro, type ContextoIA, type LlmUsage } from "../utils/ai_usage_logger";
import { autenticarUsuarioIA, exigirLoginIA, reservarPerguntaIA } from "../utils/ia_acesso";
import { estadoCota } from "../services/darcy_cota.service";
import {
    gerarPlanoCompletov2,
    construirSubstitutosPorCodigo,
    expandirOfertaComEquivalencias,
    calcularSemestreAtualStr,
} from "../services/plano_formatura.service";
import { PlanejadorAgenteService, ehComandoDireto, type MensagemChat, type AgenteContexto } from "../services/planejador_agente.service";
import { AI_SEM_CREDITOS_BODY, isMaritacaSemCreditos } from "../config/maritaca_errors";
import { sugerirModuloLivre } from "../services/chat/actuators/modulo_livre_actuator";
import { DificuldadeAgenteService } from "../services/dificuldade_agente.service";
import type {
    MateriaInput,
    PlanoInput,
    PreferenciasPlano,
    PlanoFormaturav2,
    CargaIntegralizada,
    RestricoesPlano
} from "../types/planejamento";

// =============================================================
// Helpers
// =============================================================

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Normaliza o mapa codigo -> indice de semestre das optativas adicionadas. */
function normMapaSemestres(raw: unknown): Record<string, number> {
    const out: Record<string, number> = {};
    if (!isObject(raw)) return out;
    for (const [cod, val] of Object.entries(raw)) {
        const codigo = cod.trim().toUpperCase();
        const idx = Number(val);
        if (codigo && Number.isFinite(idx) && idx >= 0) out[codigo] = Math.floor(idx);
    }
    return out;
}

function validatePreferencias(raw: unknown): PreferenciasPlano | null {
    if (!isObject(raw)) return null;
    const limite = Number(raw.limiteCreditos);
    if (!Number.isFinite(limite) || limite <= 0) return null;
    const objetivo = raw.objetivo;
    if (objetivo !== "velocidade" && objetivo !== "equilibrado") return null;
    if (typeof raw.trabalha !== "boolean") return null;
    return {
        limiteCreditos: Math.floor(limite),
        objetivo,
        trabalha: raw.trabalha,
    };
}

/**
 * Valida e normaliza o body do endpoint.
 * Aceita camelCase ou snake_case e converte para camelCase.
 * Retorna `{ input }` ou `{ error }` (com 400-friendly message).
 */
function parseBody(body: unknown): { input?: PlanoInput; error?: string } {
    if (!isObject(body)) return { error: "Body inválido" };

    // Aceita camelCase ou snake_case
    const curriculoCompleto = body.curriculoCompleto || body.curriculo_completo;
    if (typeof curriculoCompleto !== "string" || !curriculoCompleto.trim()) {
        return { error: "curriculoCompleto é obrigatório" };
    }

    const completedCodes = body.completedCodes || body.codigos_concluidos;
    if (!Array.isArray(completedCodes) || !completedCodes.every((c) => typeof c === "string")) {
        return { error: "completedCodes deve ser array de strings" };
    }

    const numeroPeriodo = Number(body.numeroPeriodo || body.semestre_atual);
    if (!Number.isFinite(numeroPeriodo) || numeroPeriodo < 1) {
        return { error: "numeroPeriodo deve ser inteiro >= 1" };
    }

    // Busca preferencias em camelCase ou constrói a partir de campos snake_case
    let preferencias = body.preferencias ? validatePreferencias(body.preferencias) : null;
    if (!preferencias && body.limite_creditos) {
        // Constrói preferencias a partir dos campos snake_case
        preferencias = validatePreferencias({
            limiteCreditos: body.limite_creditos,
            objetivo: body.objetivo || "equilibrado",
            trabalha: body.trabalha !== undefined ? body.trabalha : false,
        });
    }
    if (!preferencias) {
        return {
            error:
                "preferencias inválidas (formato: { limiteCreditos: number, objetivo: 'velocidade'|'equilibrado', trabalha: boolean })",
        };
    }

    // Restrições opcionais (adiar/priorizar) — normaliza códigos.
    const rawRestricoes = body.restricoes;
    if (isObject(rawRestricoes)) {
        const normList = (v: unknown): string[] =>
            Array.isArray(v) ? v.filter((c): c is string => typeof c === "string").map((c) => c.trim().toUpperCase()) : [];
        const restricoes: RestricoesPlano = {
            adiar: normList(rawRestricoes.adiar),
            priorizar: normList(rawRestricoes.priorizar),
            adicionar: normList(rawRestricoes.adicionar),
            adicionarEm: normMapaSemestres(rawRestricoes.adicionarEm),
        };
        if (
            restricoes.adiar.length > 0 ||
            restricoes.priorizar.length > 0 ||
            (restricoes.adicionar?.length ?? 0) > 0
        ) {
            if (preferencias) preferencias.restricoes = restricoes;
        }
    }

    let materiasFaltantes: MateriaInput[] | undefined;
    if (body.materiasFaltantes !== undefined) {
        if (!Array.isArray(body.materiasFaltantes)) {
            return { error: "materiasFaltantes deve ser array" };
        }
        materiasFaltantes = body.materiasFaltantes as MateriaInput[];
    }

    return {
        input: {
            curriculoCompleto: curriculoCompleto.trim(),
            completedCodes,
            numeroPeriodo: Math.floor(numeroPeriodo),
            preferencias,
            materiasFaltantes,
        },
    };
}

// =============================================================
// Interface para dados montados
// =============================================================

interface DadosPlano {
    idUser: string;
    idCurso: string;
    numeroPeriodo: number;
    preferencias: PreferenciasPlano;
    cargaHorariaIntegralizada: CargaIntegralizada;
    exigidaMatriz: CargaIntegralizada;
    fluxogramaAtual: string | null | undefined;
    materiasMapeadas: MateriaInput[];
    codigosComOferta: Set<string>;
}

/**
 * Período letivo CORRENTE, para que a oferta considerada venha sempre de um único
 * período — o de agora. Nada aqui é fixo: a RPC `periodo_letivo_atual` é calculada
 * por data (jan–jun = .1, jul–dez = .2), então a virada de semestre é automática.
 *
 * Isso importa porque o banco carrega o próximo período enquanto o atual ainda roda
 * (2026.1 e 2026.2 coexistem hoje, ~6.4k turmas cada). Contar os dois faz matéria que
 * não é mais ofertada contar como ofertada; usar o MAIOR faria o sistema pular pro
 * semestre seguinte antes da hora. Por isso o fallback quando a RPC não responde é a
 * mesma fórmula de data em TS (calcularSemestreAtualStr), nunca um palpite tirado dos
 * dados. Sempre devolve um período.
 *
 * Recebe o client por parâmetro para ser testável sem mock do módulo inteiro.
 * Spec: docs/superpowers/specs/2026-08-03-equivalencias-oferta-turmas-design.md (D5)
 */
export async function resolverPeriodoAtivo(supabase: any): Promise<string> {
    try {
        const { data } = await supabase.rpc("periodo_letivo_atual");
        if (data) return String(data);
    } catch {
        // Cai no fallback abaixo.
    }
    return calcularSemestreAtualStr();
}

/**
 * Injeta no pool do alocador as optativas que o aluno adicionou via chat e que
 * não estão na matriz do curso: busca nome/carga/pré-requisitos na tabela
 * global de matérias e as inclui como optativa (nivel 0). Degrada em silêncio —
 * sem os dados, a optativa apenas não entra no plano.
 */
export async function injetarOptativasAdicionadas(
    pool: MateriaInput[],
    codigosRaw: string[] | undefined
): Promise<void> {
    const codigos = [...new Set((codigosRaw ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean))];
    const faltando = codigos.filter(
        (c) => !pool.some((m) => m.codigo.trim().toUpperCase() === c)
    );
    if (faltando.length === 0) return;

    const { data, error } = await SupabaseWrapper.get()
        .from("materias")
        .select("id_materia, codigo_materia, nome_materia, carga_horaria")
        .in("codigo_materia", faltando);
    if (error || !data) return;

    const ids = (data as any[])
        .map((r) => r.id_materia)
        .filter((id): id is number => typeof id === "number");
    const preByMateria = new Map<number, unknown>();
    if (ids.length > 0) {
        const { data: preRows } = await SupabaseWrapper.get()
            .from("pre_requisitos")
            .select("id_materia, expressao_logica")
            .in("id_materia", ids);
        (preRows ?? []).forEach((r: any) => preByMateria.set(r.id_materia, r.expressao_logica));
    }

    for (const r of data as any[]) {
        const codigo = (r.codigo_materia || "").trim().toUpperCase();
        if (!codigo || pool.some((m) => m.codigo.trim().toUpperCase() === codigo)) continue;
        const carga = r.carga_horaria ?? 60;
        pool.push({
            codigo,
            nome: r.nome_materia ?? codigo,
            creditos: Math.round(carga / 15),
            nivel: 0,
            obrigatoria: false,
            tipo_natureza: 1,
            carga_horaria: carga,
            preRequisitos: preByMateria.get(r.id_materia) ?? null,
            coRequisitos: null,
        });
    }
}

/**
 * Monta todos os dados necessários para gerar o plano (busca em banco + processamento).
 * Retorna { dados } se sucesso ou { status, error } se erro.
 */
export async function montarDadosPlano(
    idUser: string,
    input: PlanoInput
): Promise<{ dados?: DadosPlano; status?: number; error?: string }> {
    try {
        // 1. Busca dados do usuário e preferências no dados_users.
        const { data: usuarioData, error: erroUsuario } = await SupabaseWrapper.get()
            .from("dados_users")
            .select("id_user, semestre_atual, carga_horaria_integralizada, fluxograma_atual, preferencias_plano")
            .eq("id_user", idUser)
            .maybeSingle();

        if (erroUsuario) {
            return { status: 500, error: `Erro ao buscar dados_users: ${erroUsuario.message}` };
        }

        if (!usuarioData) {
            return { status: 404, error: "Dados do usuário não encontrados" };
        }

        const { curriculoCompleto, numeroPeriodo, preferencias: bodyPreferencias } = input;
        const matriz = await resolveMatriz(curriculoCompleto);
        if (!matriz) {
            return { status: 404, error: "Matriz curricular não encontrada" };
        }

        // Monta CargaIntegralizada Exigida
        const exigidaMatriz: CargaIntegralizada = {
            total: matriz.ch_total_exigida || 0,
            obrigatoria: matriz.ch_obrigatoria_exigida || 0,
            optativa: matriz.ch_optativa_exigida || 0,
            complementar: matriz.ch_complementar_exigida || 0
        };

        // Monta CargaIntegralizada Feita pelo Aluno
        const chFeita = usuarioData.carga_horaria_integralizada as Record<string, any> || {};
        const cargaHorariaIntegralizada: CargaIntegralizada = {
            total: Number(chFeita.total) || 0,
            obrigatoria: Number(chFeita.obrigatoria) || 0,
            optativa: Number(chFeita.optativa) || 0,
            complementar: Number(chFeita.complementar) || 0
        };

        // Monta Preferências usando body ou preferências salvas do usuário.
        const prefs = usuarioData.preferencias_plano as Record<string, any> || {};
        const preferencias: PreferenciasPlano = bodyPreferencias ?? {
            limiteCreditos: Number(prefs.limiteCreditos) || 24,
            objetivo: prefs.objetivo === "velocidade" ? "velocidade" : "equilibrado",
            trabalha: Boolean(prefs.trabalha)
        };
        // Restrições persistidas (adiar/priorizar/adicionar): o body ganha; sem
        // restrições no body, as salvas continuam valendo — senão as optativas
        // adicionadas via chat sumiriam do plano no reload da página.
        if (!preferencias.restricoes && prefs.restricoes && typeof prefs.restricoes === "object") {
            preferencias.restricoes = prefs.restricoes as RestricoesPlano;
        }

        // 2. Busca materias_por_curso
        const { data: materiasPorCurso, error: erroMPC } = await SupabaseWrapper.get()
            .from("materias_por_curso")
            .select("id_materia, nivel, tipo_natureza, materias(id_materia, codigo_materia, nome_materia, carga_horaria, departamento, dificuldade_estimada, motivo_dificuldade)")
            .eq("id_matriz", matriz.id_matriz);

        if (erroMPC) {
            return { status: 500, error: `Erro ao buscar materias_por_curso: ${erroMPC.message}` };
        }

        if (!materiasPorCurso || materiasPorCurso.length === 0) {
            return { status: 404, error: "Nenhuma matéria encontrada para a matriz curricular" };
        }

        // 3. Busca pre_requisitos e co_requisitos para as materias da matriz
        const idsMaterias = (materiasPorCurso as any[])
            .map((r: any) => r.materias?.id_materia)
            .filter((id): id is number => typeof id === "number");

        const preByMateria = new Map<number, unknown>();
        const coByMateria = new Map<number, unknown>();
        // Equivalencia é 1:N (uma matéria pode ter várias linhas, de currículos/vigências
        // diferentes) — diferente de pré/co-requisito, que são 1:1 aqui.
        const equivByMateria = new Map<number, unknown[]>();

        if (idsMaterias.length > 0) {
            const [
                { data: preRows, error: erroPreReq },
                { data: coRows, error: erroCoReq },
                { data: equivRows, error: erroEquiv },
            ] = await Promise.all([
                SupabaseWrapper.get()
                    .from("pre_requisitos")
                    .select("id_materia, expressao_logica")
                    .in("id_materia", idsMaterias),
                SupabaseWrapper.get()
                    .from("co_requisitos")
                    .select("id_materia, expressao_logica")
                    .in("id_materia", idsMaterias),
                // Escopo de curso igual ao de fluxograma_controller.ts: equivalencia
                // registrada para OUTRO curso nao vale aqui. id_curso nulo = geral.
                SupabaseWrapper.get()
                    .from("equivalencias")
                    .select("id_materia, expressao_logica")
                    .in("id_materia", idsMaterias)
                    .or(`id_curso.is.null,id_curso.eq.${matriz.id_curso}`),
            ]);

            if (erroPreReq) return { status: 500, error: `Erro ao buscar pré-requisitos: ${erroPreReq.message}` };
            if (erroCoReq) return { status: 500, error: `Erro ao buscar co-requisitos: ${erroCoReq.message}` };
            if (erroEquiv) return { status: 500, error: `Erro ao buscar equivalências: ${erroEquiv.message}` };

            if (preRows) preRows.forEach((r: any) => preByMateria.set(r.id_materia, r.expressao_logica));
            if (coRows) coRows.forEach((r: any) => coByMateria.set(r.id_materia, r.expressao_logica));
            if (equivRows) {
                equivRows.forEach((r: any) => {
                    if (r.expressao_logica == null) return;
                    const atuais = equivByMateria.get(r.id_materia) ?? [];
                    atuais.push(r.expressao_logica);
                    equivByMateria.set(r.id_materia, atuais);
                });
            }
        }

        // 4. MAP MATERIAS PARA O FORMATO DO MOTOR 2
        const materiasMapeadas: MateriaInput[] = (materiasPorCurso as any[]).map(row => {
            const mat = row.materias;
            const cargaHr = mat.carga_horaria || 60; 
            return {
                codigo: mat.codigo_materia.trim().toUpperCase(),
                nome: mat.nome_materia || mat.codigo_materia,
                creditos: Math.ceil(cargaHr / 15),
                nivel: row.nivel || 0,
                obrigatoria: row.tipo_natureza === 0,
                tipo_natureza: row.tipo_natureza,
                carga_horaria: cargaHr,
                departamento: mat.departamento || undefined,
                dificuldadeEstimada: mat.dificuldade_estimada || undefined,
                motivoDificuldade: mat.motivo_dificuldade || undefined,
                preRequisitos: preByMateria.get(mat.id_materia) || null,
                coRequisitos: coByMateria.get(mat.id_materia) || null,
                equivalencias: equivByMateria.get(mat.id_materia) ?? [],
            };
        });

        // 5. Busca materias com oferta real em turmas (para evitar "optativas fantasmas").
        //
        // Considera EQUIVALENCIA: quando a materia muda de codigo, a matriz continua com o
        // antigo mas a turma e publicada sob o novo (ex. CIC0151 -> CIC0197/FGA0158). Sem
        // isso a materia parece "sem oferta" e leva -10 de score em calcularScore, alem de
        // ser descartada no filtro de elegiveis do AtuadorGrade.
        // Spec: docs/superpowers/specs/2026-08-03-equivalencias-oferta-turmas-design.md
        const substitutosPorCodigo = construirSubstitutosPorCodigo(materiasMapeadas);

        const idPorCodigo = new Map<string, number>();
        for (const mpc of materiasPorCurso as any[]) {
            const id = mpc.materias?.id_materia;
            const cod = (mpc.materias?.codigo_materia || "").trim().toUpperCase();
            if (id && cod) idPorCodigo.set(cod, id);
        }

        // Os substitutos estao FORA da matriz, entao nao caem no mapa acima — precisam de
        // uma resolucao codigo -> id_materia propria.
        const codigosSubstitutos = [
            ...new Set(
                [...substitutosPorCodigo.values()].flat().filter((c) => !idPorCodigo.has(c))
            ),
        ];
        if (codigosSubstitutos.length > 0) {
            const { data: substitutosRows, error: erroSubstitutos } = await SupabaseWrapper.get()
                .from("materias")
                .select("id_materia, codigo_materia")
                .in("codigo_materia", codigosSubstitutos);
            // Degrada: sem os ids dos substitutos, a oferta cai no comportamento antigo
            // (so o codigo proprio) em vez de derrubar a requisicao inteira.
            if (!erroSubstitutos && substitutosRows) {
                for (const r of substitutosRows as any[]) {
                    const cod = (r.codigo_materia || "").trim().toUpperCase();
                    if (cod && r.id_materia) idPorCodigo.set(cod, r.id_materia);
                }
            }
        }

        // Periodo ativo: a oferta considerada e SEMPRE a do periodo CORRENTE, resolvido
        // por data (ver resolverPeriodoAtivo) — vira sozinho a cada semestre. O banco tem
        // 2026.1 e 2026.2 ao mesmo tempo, entao sem esse filtro uma materia que nao e
        // mais ofertada continuaria contando como ofertada.
        const periodoAtivo = await resolverPeriodoAtivo(SupabaseWrapper.get());

        const { data: turmasData, error: erroTurmas } = await SupabaseWrapper.get()
            .from("turmas")
            .select("id_materia")
            .eq("ano_periodo", periodoAtivo)
            .in("id_materia", [...idPorCodigo.values()]);

        const materiasComOferta = new Set<number>();
        if (!erroTurmas && turmasData && Array.isArray(turmasData)) {
            for (const turma of turmasData) {
                if (turma.id_materia) materiasComOferta.add(turma.id_materia);
            }
        }

        const codigosComOfertaPropria = new Set<string>();
        for (const [cod, id] of idPorCodigo) {
            if (materiasComOferta.has(id)) codigosComOfertaPropria.add(cod);
        }

        const codigosComOferta = expandirOfertaComEquivalencias(
            substitutosPorCodigo,
            codigosComOfertaPropria
        );

        // Optativas adicionadas via chat podem estar FORA da matriz — sem linha em
        // materias_por_curso não existe MateriaInput para o alocador considerar.
        await injetarOptativasAdicionadas(materiasMapeadas, preferencias.restricoes?.adicionar);

        // 6. LAZY LOADING DA DIFICULDADE
        const materiasSemDificuldade = materiasMapeadas.filter(m => m.dificuldadeEstimada == null);
        if (materiasSemDificuldade.length > 0) {
            try {
                await DificuldadeAgenteService.avaliarESalvarDificuldades(materiasSemDificuldade);
            } catch (err) {
                console.error(`Erro ao tentar fazer lazy load da dificuldade: ${err}`);
            }
        }


        return {
            dados: {
                idUser,
                idCurso: String(matriz.id_curso),
                numeroPeriodo,
                preferencias,
                cargaHorariaIntegralizada,
                exigidaMatriz,
                fluxogramaAtual: usuarioData.fluxograma_atual as string | null | undefined,
                materiasMapeadas,
                codigosComOferta,
            }
        };
    } catch (err: any) {
        return { status: 500, error: err?.message || "Erro ao montar dados do plano" };
    }
}

/**
 * Monta o AgenteContexto completo (com plano) a partir do usuário + planoInput.
 * Fonte única usada pelo chat do Planejamento e pelo chat da Assistente (logado).
 */
export async function montarContextoAgente(
    idUser: string,
    planoInputRaw: unknown,
    restricoesRaw: unknown
): Promise<{ ctx?: AgenteContexto; status?: number; error?: string }> {
    const { input, error: inputError } = parseBody(planoInputRaw);
    if (inputError) return { status: 400, error: inputError };

    const normCodes = (v: unknown): string[] =>
        Array.isArray(v)
            ? v.filter((c): c is string => typeof c === "string").map((c) => c.trim().toUpperCase())
            : [];
    const restricoes: RestricoesPlano = {
        adiar: normCodes((restricoesRaw as any)?.adiar),
        priorizar: normCodes((restricoesRaw as any)?.priorizar),
        adicionar: normCodes((restricoesRaw as any)?.adicionar),
        adicionarEm: normMapaSemestres((restricoesRaw as any)?.adicionarEm),
        limitesPersonalizados:
            typeof (restricoesRaw as any)?.limitesPersonalizados === "object" && (restricoesRaw as any).limitesPersonalizados !== null
                ? (restricoesRaw as any).limitesPersonalizados
                : undefined,
    };

    const { dados, status, error } = await montarDadosPlano(idUser, input!);
    if (error) return { status: status || 500, error };
    if (!dados) return { status: 500, error: "Erro interno ao montar dados do plano" };

    // Optativas já adicionadas em conversas anteriores precisam existir no pool
    // para o alocador (as persistidas via preferências já foram injetadas).
    await injetarOptativasAdicionadas(dados.materiasMapeadas, restricoes.adicionar);

    const ctx: AgenteContexto = {
        materias: dados.materiasMapeadas,
        cargaHorariaIntegralizada: dados.cargaHorariaIntegralizada,
        exigidaMatriz: dados.exigidaMatriz,
        fluxogramaAtual: dados.fluxogramaAtual,
        idUser: dados.idUser,
        idCurso: dados.idCurso,
        numeroPeriodo: dados.numeroPeriodo,
        preferencias: dados.preferencias,
        restricoes: {
            adiar: restricoes.adiar,
            priorizar: restricoes.priorizar,
            limitesPersonalizados: restricoes.limitesPersonalizados || {},
            adicionar: restricoes.adicionar ?? [],
            adicionarEm: restricoes.adicionarEm ?? {},
        },
        codigosComOferta: dados.codigosComOferta,
    };
    return { ctx };
}

/**
 * Quem é o aluno, para a busca de módulo livre: e-mail (usado para excluir o que
 * ele já cursou) e a matriz dele (usada para excluir o que já é do curso).
 *
 * Resolvido no servidor a partir do `id_user` autenticado, e não aceito do
 * corpo da requisição de propósito: a matriz é justamente o que define o que
 * NÃO é módulo livre, então deixar o cliente escolhê-la seria deixá-lo receber
 * como "de fora do curso" as próprias obrigatórias de outro currículo.
 *
 * A matriz vem de `historicos_usuarios` (a entrada mais recente) porque é lá que
 * o upload do histórico a grava — `dados_users` não tem essa coluna.
 */
async function identificarAluno(
    idUser: string
): Promise<{ email: string | undefined; curriculoCompleto: string } | null> {
    const supabase = SupabaseWrapper.get();

    const [{ data: user }, { data: historico }] = await Promise.all([
        supabase.from("users").select("email").eq("id_user", idUser).maybeSingle(),
        supabase
            .from("historicos_usuarios")
            .select("matriz_curricular")
            .eq("id_user", idUser)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    const curriculoCompleto = (historico?.matriz_curricular ?? "").trim();
    if (!curriculoCompleto) return null;

    // E-mail é opcional: sem ele a busca só deixa de filtrar o que o aluno já
    // cursou, o que é bem melhor do que não responder.
    return { email: user?.email ?? undefined, curriculoCompleto };
}

interface MatrizRow {
    id_matriz: number;
    id_curso: number;
    curriculo_completo: string;
    ch_total_exigida?: number | null;
    ch_obrigatoria_exigida?: number | null;
    ch_optativa_exigida?: number | null;
    ch_complementar_exigida?: number | null;
}

async function resolveMatriz(
    curriculoCompleto: string
): Promise<MatrizRow | null> {
    const cc = curriculoCompleto.trim();

    // Tenta match exato primeiro.
    try {
        console.log(`[resolveMatriz] Querying matrizes for: "${cc}"`);
        console.log(`[resolveMatriz] Supabase URL: ${process.env.SUPABASE_URL}`);
        console.log(`[resolveMatriz] Has service role key: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`);

        const { data: exato, error } = await SupabaseWrapper.get()
            .from("matrizes")
            .select(
                "id_matriz, id_curso, curriculo_completo, ch_total_exigida, ch_obrigatoria_exigida, ch_optativa_exigida, ch_complementar_exigida"
            )
            .eq("curriculo_completo", cc)
            .maybeSingle();

        if (error) {
            console.error(`[resolveMatriz] Query error: ${error.message} | Code: ${error.code}`);
        }
        console.log(`[resolveMatriz] Query result:`, exato);

        if (exato) return exato as MatrizRow;
    } catch (err) {
        console.error(`[resolveMatriz] Exception on exact match:`, err);
    }

    // Fallback: prefixo (ex: "8117/-2" -> "8117/-2 - 2018.2").
    if (cc.includes("/")) {
        const prefix = cc.split(" - ")[0]?.trim() ?? cc;
        const { data: rows } = await SupabaseWrapper.get()
            .from("matrizes")
            .select(
                "id_matriz, id_curso, curriculo_completo, ch_total_exigida, ch_obrigatoria_exigida, ch_optativa_exigida, ch_complementar_exigida"
            )
            .like("curriculo_completo", prefix + "%")
            .order("curriculo_completo")
            .limit(1);
        if (rows && rows.length > 0) return rows[0] as MatrizRow;
    }

    return null;
}


/**
 * Matérias MATR fora da matriz do curso (ex.: cursando a equivalente nova —
 * FGA0146 no lugar da FGA0147 da matriz) não aparecem na lista de matérias do
 * plano, e o fluxograma_atual do aluno não guarda nome; sem este lookup o card
 * do semestre em curso mostraria o próprio código no lugar do nome.
 */
async function resolverNomesSemestreAtual(plano: PlanoFormaturav2 | undefined): Promise<void> {
    const pendentes = (plano?.semestreAtual?.materias ?? []).filter(
        (m) => !m.nome || m.nome.trim().toUpperCase() === m.codigo.trim().toUpperCase()
    );
    if (pendentes.length === 0) return;

    const { data, error } = await SupabaseWrapper.get()
        .from("materias")
        .select("codigo_materia, nome_materia, carga_horaria")
        .in("codigo_materia", pendentes.map((m) => m.codigo));
    // Degrada: sem o lookup, o card segue mostrando o código.
    if (error || !data) return;

    const porCodigo = new Map<string, { nome_materia: string | null; carga_horaria: number | null }>();
    for (const r of data as any[]) {
        const cod = (r.codigo_materia || "").trim().toUpperCase();
        if (cod) porCodigo.set(cod, r);
    }
    for (const m of pendentes) {
        const row = porCodigo.get(m.codigo.trim().toUpperCase());
        if (row?.nome_materia) m.nome = row.nome_materia;
        if (row?.carga_horaria != null) m.creditos = Math.round(row.carga_horaria / 15);
    }
}

/** Uma preferência de turno/professor por matéria (tabela `preferencias_grade`). */
interface PreferenciaGradeRow {
    codigo_materia: string;
    turnos: string[];
    docente: string | null;
}

const TURNOS_VALIDOS = new Set(["M", "T", "N"]);

/** Normaliza os turnos vindos do body: só M/T/N, maiúsculo, sem duplicata. */
function normalizarTurnos(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((t) => String(t).trim().toUpperCase()).filter((t) => TURNOS_VALIDOS.has(t)))];
}

// =============================================================
// Endpoint
// =============================================================

export const PlanejamentoController: EndpointController = {
    name: "planejamento",
    routes: {
        "gerar-plano": new Pair(
            RequestType.POST,
            async (req: Request, res: Response) => {
                const logger = createControllerLogger("PlanejamentoController", "gerar-plano");

                try {
                    // ========== JWT AUTHENTICATION ==========
                    if (!await Utils.checkAuthorization(req as Request)) {
                        logger.warn("Autorização falhou");
                        return res.status(401).json({ error: "Usuário não autorizado" });
                    }

                    const id_user = req.headers["user-id"] || req.headers["User-ID"];
                    if (!id_user) {
                        logger.warn("User-ID header não encontrado");
                        return res.status(401).json({ error: "User-ID não informado" });
                    }

                    logger.info(`Gerando plano para usuário: ${id_user}`);

                    // ========== PARSE BODY ==========
                    const { input, error: bodyError } = parseBody(req.body);
                    if (bodyError) {
                        logger.warn(`Body inválido: ${bodyError}`);
                        return res.status(400).json({ error: bodyError });
                    }

                    // ========== MONTAR DADOS DO PLANO ==========
                    // A avaliação de dificuldade (lazy load) pode chamar o LLM: o
                    // contexto leva o user_id até o ai_usage_log. Não gasta cota
                    // (não é pergunta do aluno ao Darcy).
                    const usuarioIA = await autenticarUsuarioIA(req as Request);
                    const { dados, status, error } = await executarComContextoIA(
                        { userId: usuarioIA?.id },
                        () => montarDadosPlano(id_user as string, input!)
                    );
                    if (error) {
                        logger.warn(`Erro ao montar dados: ${error}`);
                        return res.status(status || 500).json({ error });
                    }
                    if (!dados) {
                        logger.error("Dados do plano não retornados");
                        return res.status(500).json({ error: "Erro interno ao montar dados" });
                    }

                    logger.info(`Dados do plano montados: ${dados.idCurso}, semestre ${dados.numeroPeriodo}, ${dados.materiasMapeadas.length} matérias`);

                    // ========== CALL V2 ALGORITHM ==========
                    const plano: PlanoFormaturav2 = gerarPlanoCompletov2(
                        dados.idUser,
                        dados.idCurso,
                        dados.numeroPeriodo,
                        dados.cargaHorariaIntegralizada,
                        dados.exigidaMatriz,
                        dados.fluxogramaAtual,
                        dados.materiasMapeadas,
                        dados.preferencias,
                        dados.codigosComOferta
                    );

                    await resolverNomesSemestreAtual(plano);

                    logger.info(`Plano gerado: ${plano.semestresRestantes} semestres, ${plano.materiasNaoAlocadas.length} não-alocadas`);

                    return res.status(200).json(plano);
                } catch (err: any) {
                    logger.error(`Erro ao gerar plano: ${err?.message || String(err)}`);
                    return res.status(500).json({ error: err?.message || "Erro ao gerar plano" });
                }
            }
        ),
        "chat": new Pair(
            RequestType.POST,
            async (req: Request, res: Response) => {
                const logger = createControllerLogger("PlanejamentoController", "chat");
                const startTime = Date.now();

                // Login obrigatório na IA: 401 LOGIN_NECESSARIO antes de tudo.
                const usuario = await exigirLoginIA(req as Request, res);
                if (!usuario) return;

                let pergunta: Awaited<ReturnType<typeof reservarPerguntaIA>> = null;
                let ctxIA: ContextoIA = {};
                let excerpt = "";
                // Pergunta reservada que falhou: entra no log como falha, com o
                // que o modelo já tiver cobrado (0 tokens se nem chegou a ele).
                const logarFalha = (usage: LlmUsage[], erro?: unknown) =>
                    logAiUsage({
                        endpoint: "planejamento-chat",
                        durationMs: Date.now() - startTime,
                        success: false,
                        requestExcerpt: excerpt,
                        usage,
                        modeloPadrao: MARITACA_MODELS.AGENTE,
                        erro,
                        ...ctxIA,
                    });
                try {
                    // ========== JWT AUTHENTICATION ==========
                    if (!await Utils.checkAuthorization(req as Request)) {
                        logger.warn("Autorização falhou");
                        return res.status(401).json({ error: "Usuário não autorizado" });
                    }

                    const id_user = req.headers["user-id"] || req.headers["User-ID"];
                    if (!id_user) {
                        logger.warn("User-ID header não encontrado");
                        return res.status(401).json({ error: "User-ID não informado" });
                    }

                    logger.info(`Chat agente planejador para usuário: ${id_user}`);

                    // ========== VERIFICAR DISPONIBILIDADE DO MARITACA ==========
                    const svc = new PlanejadorAgenteService();
                    if (!svc.isAvailable()) {
                        logger.warn("Maritaca API não disponível");
                        return res.status(503).json({
                            error: "Serviço de agente temporariamente indisponível",
                        });
                    }

                    // ========== PARSE BODY ==========
                    const body = req.body;
                    if (!isObject(body)) {
                        return res.status(400).json({ error: "Body inválido" });
                    }

                    // Mensagens do chat
                    const messages = Array.isArray(body.messages) ? body.messages : [];
                    if (
                        !messages.every(
                            (m) =>
                                isObject(m) &&
                                (m.role === "user" || m.role === "assistant") &&
                                typeof m.content === "string"
                        )
                    ) {
                        return res.status(400).json({
                            error: "messages deve ser array de { role, content }",
                        });
                    }

                    const historico: MensagemChat[] = messages.map(
                        (m: any) => ({ role: m.role, content: m.content })
                    );

                    // ========== COTA DIÁRIA ==========
                    // Comando direto (/turmas COD) responde do banco, sem LLM: não
                    // gasta cota nem entra no ai_usage_log (antes gravava
                    // model='desconhecido' com 0 tokens).
                    const semLlm = ehComandoDireto(historico);
                    if (!semLlm) {
                        pergunta = await reservarPerguntaIA(res, usuario);
                        if (!pergunta) return;
                    }
                    ctxIA = { userId: usuario.id, perguntaId: pergunta?.perguntaId };
                    excerpt = historico.slice().reverse().find((m) => m.role === "user")?.content ?? "";

                    // ========== MONTAR CONTEXTO DO AGENTE (com plano) ==========
                    const { ctx, status: statusErr, error: erroMontagem } = await executarComContextoIA(ctxIA, () =>
                        montarContextoAgente(id_user as string, body.planoInput, body.restricoes)
                    );
                    if (erroMontagem || !ctx) {
                        await pergunta?.estornar();
                        if (pergunta) logarFalha([]);
                        logger.warn(`Erro ao montar contexto: ${erroMontagem}`);
                        return res.status(statusErr || 500).json({ error: erroMontagem || "Erro interno ao montar contexto" });
                    }

                    // ========== CONVERSAR COM AGENTE ==========
                    logger.info(`Iniciando conversa com agente. Histórico: ${historico.length} mensagens`);
                    const resultado = await executarComContextoIA(ctxIA, () => svc.conversar(historico, ctx));

                    logger.info(`Conversa concluída. Resposta: ${resultado.reply.slice(0, 50)}...`);

                    if (!resultado.semLlm) {
                        logAiUsage({
                            endpoint: "planejamento-chat",
                            durationMs: Date.now() - startTime,
                            success: true,
                            requestExcerpt: excerpt,
                            usage: resultado.usage,
                            ...ctxIA,
                        });
                    }

                    await resolverNomesSemestreAtual(resultado.plano);

                    // O modelo já respondeu (e cobrou): quem saiu gasta a pergunta, só não recebe a resposta.
                    if (pergunta?.clienteSaiu()) return;

                    const cota = pergunta ? pergunta.cota : await estadoCota(usuario.id).catch(() => undefined);
                    return res.status(200).json({
                        reply: resultado.reply,
                        plano: resultado.plano ?? undefined,
                        restricoes: resultado.restricoes,
                        cota,
                    });
                } catch (err: any) {
                    await pergunta?.estornar();
                    // Custo do que o modelo já respondeu antes da falha (a
                    // pergunta continua estornada). Comando direto não tem pergunta.
                    if (pergunta) logarFalha(usageParcialDoErro(err), err);
                    if (isMaritacaSemCreditos(err)) {
                        logger.error("Chat do planejador: Maritaca sem créditos ativos");
                        return res.status(503).json(AI_SEM_CREDITOS_BODY);
                    }
                    logger.error(
                        `Erro ao processar chat: ${err?.message || String(err)}`
                    );
                    return res.status(500).json({
                        error: err?.message || "Erro ao processar mensagem do chat",
                    });
                }
            }
        ),
        // ==========================================================
        // Preferências de turno/professor por matéria — tabela dedicada
        // `preferencias_grade` (docs/superpowers/specs — Montador de Grade).
        // Confirmadas pelo aluno no chat da Darcy ("Aceitar" no banner de
        // rearranjo) e reaplicadas automaticamente nas próximas montagens.
        // ==========================================================
        // ==========================================================
        // Sugestões de módulo livre por tema, para o painel "Situação" do
        // Montador de Grade. Usa a MESMA busca semântica do chat da Darcy
        // (`sugerirModuloLivre`) — o Montador precisa da lista estruturada para
        // montar botões "Incluir", e não do texto que o agente devolveria.
        // ==========================================================
        "modulo-livre-sugestoes": new Pair(
            RequestType.POST,
            async (req: Request, res: Response) => {
                const logger = createControllerLogger("PlanejamentoController", "modulo-livre-sugestoes");
                try {
                    if (!await Utils.checkAuthorization(req as Request)) {
                        return res.status(401).json({ error: "Usuário não autorizado" });
                    }
                    const id_user = req.headers["user-id"] || req.headers["User-ID"];
                    if (!id_user) return res.status(401).json({ error: "User-ID não informado" });

                    const body = req.body;
                    const tema = isObject(body) && typeof body.tema === "string" ? body.tema.trim() : "";
                    // Sem tema não há o que procurar: módulo livre é o catálogo
                    // inteiro da UnB, e "liste tudo" devolveria milhares de linhas
                    // em ordem de código fingindo ser recomendação.
                    if (tema.length < 2) {
                        return res.status(400).json({ error: "Informe um tema com ao menos 2 caracteres" });
                    }

                    const aluno = await identificarAluno(String(id_user));
                    if (!aluno) {
                        return res.status(404).json({
                            error: "Não encontrei sua matriz curricular. Envie seu histórico para usar o módulo livre.",
                        });
                    }

                    // A busca semântica aceita sinônimos para ampliar o recall; o
                    // Montador manda um tema só, então o termo vai sozinho.
                    const r = await sugerirModuloLivre([tema], true, aluno.email, aluno.curriculoCompleto);
                    if (r.erro) {
                        logger.warn(`Busca de módulo livre falhou: ${r.erro}`);
                        return res.status(200).json({ materias: [], aviso: r.erro });
                    }
                    return res.status(200).json({ materias: r.materias, aviso: r.aviso ?? null });
                } catch (err: any) {
                    logger.error(`Erro ao buscar módulo livre: ${err?.message || String(err)}`);
                    return res.status(500).json({ error: err?.message || "Erro ao buscar módulo livre" });
                }
            }
        ),
        "preferencias-grade-listar": new Pair(
            RequestType.GET,
            async (req: Request, res: Response) => {
                const logger = createControllerLogger("PlanejamentoController", "preferencias-grade-listar");
                try {
                    if (!await Utils.checkAuthorization(req as Request)) {
                        return res.status(401).json({ error: "Usuário não autorizado" });
                    }
                    const id_user = req.headers["user-id"] || req.headers["User-ID"];
                    if (!id_user) return res.status(401).json({ error: "User-ID não informado" });

                    const { data, error } = await SupabaseWrapper.get()
                        .from("preferencias_grade")
                        .select("codigo_materia, turnos, docente")
                        .eq("id_user", id_user);
                    if (error) {
                        logger.error(`Erro ao listar preferências: ${error.message}`);
                        return res.status(500).json({ error: error.message });
                    }
                    return res.status(200).json({ preferencias: (data ?? []) as PreferenciaGradeRow[] });
                } catch (err: any) {
                    logger.error(`Erro ao listar preferências: ${err?.message || String(err)}`);
                    return res.status(500).json({ error: err?.message || "Erro ao listar preferências" });
                }
            }
        ),
        "preferencias-grade-salvar": new Pair(
            RequestType.POST,
            async (req: Request, res: Response) => {
                const logger = createControllerLogger("PlanejamentoController", "preferencias-grade-salvar");
                try {
                    if (!await Utils.checkAuthorization(req as Request)) {
                        return res.status(401).json({ error: "Usuário não autorizado" });
                    }
                    const id_user = req.headers["user-id"] || req.headers["User-ID"];
                    if (!id_user) return res.status(401).json({ error: "User-ID não informado" });

                    const body = req.body;
                    if (!isObject(body) || typeof body.codigo !== "string" || !body.codigo.trim()) {
                        return res.status(400).json({ error: "codigo é obrigatório" });
                    }
                    const codigo_materia = body.codigo.trim().toUpperCase();
                    const turnos = normalizarTurnos(body.turnos);
                    const docente =
                        typeof body.docente === "string" && body.docente.trim() ? body.docente.trim() : null;

                    const { error } = await SupabaseWrapper.get()
                        .from("preferencias_grade")
                        .upsert(
                            {
                                id_user,
                                codigo_materia,
                                turnos,
                                docente,
                                updated_at: new Date().toISOString(),
                            },
                            { onConflict: "id_user,codigo_materia" }
                        );
                    if (error) {
                        logger.error(`Erro ao salvar preferência: ${error.message}`);
                        return res.status(500).json({ error: error.message });
                    }
                    return res.status(200).json({ ok: true });
                } catch (err: any) {
                    logger.error(`Erro ao salvar preferência: ${err?.message || String(err)}`);
                    return res.status(500).json({ error: err?.message || "Erro ao salvar preferência" });
                }
            }
        ),
        "preferencias-grade-remover": new Pair(
            RequestType.POST,
            async (req: Request, res: Response) => {
                const logger = createControllerLogger("PlanejamentoController", "preferencias-grade-remover");
                try {
                    if (!await Utils.checkAuthorization(req as Request)) {
                        return res.status(401).json({ error: "Usuário não autorizado" });
                    }
                    const id_user = req.headers["user-id"] || req.headers["User-ID"];
                    if (!id_user) return res.status(401).json({ error: "User-ID não informado" });

                    const body = req.body;
                    if (!isObject(body) || typeof body.codigo !== "string" || !body.codigo.trim()) {
                        return res.status(400).json({ error: "codigo é obrigatório" });
                    }
                    const codigo_materia = body.codigo.trim().toUpperCase();

                    const { error } = await SupabaseWrapper.get()
                        .from("preferencias_grade")
                        .delete()
                        .eq("id_user", id_user)
                        .eq("codigo_materia", codigo_materia);
                    if (error) {
                        logger.error(`Erro ao remover preferência: ${error.message}`);
                        return res.status(500).json({ error: error.message });
                    }
                    return res.status(200).json({ ok: true });
                } catch (err: any) {
                    logger.error(`Erro ao remover preferência: ${err?.message || String(err)}`);
                    return res.status(500).json({ error: err?.message || "Erro ao remover preferência" });
                }
            }
        ),
    },
};