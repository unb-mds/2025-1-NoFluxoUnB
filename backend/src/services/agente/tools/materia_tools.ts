/**
 * Tools genéricas (requiresPlano: false) — só consultam o banco por código de
 * matéria, sem depender de um plano de formatura. Disponíveis em qualquer chat,
 * inclusive na aba Assistente sem login.
 */

import { SupabaseWrapper } from "../../../supabase_wrapper";
import { SabiaService } from "../../sabia.service";
import { parseFluxograma } from "../../plano_formatura.service";
import { norm, type AgenteContexto } from "../context";
import { removeAccents } from "../../../utils/text.utils";
import type { AgentTool } from "../tool_registry";

// Instância única do proxy para o agente Python (busca semântica por embeddings).
const sabia = new SabiaService();

/**
 * Marcador `[TURMA|turma|docente|horario|local|vagas|periodo|COD|IDTURMA]` que o
 * chat desenha como card (contrato em `docs/darcy-unificada.md`, "Ações no chat").
 * `|` e `]` dentro de um campo quebrariam o parser do app, então viram espaço.
 */
export function marcadorTurma(t: {
    turma: string;
    docente: string;
    horario: string;
    local: string;
    vagas: string;
    periodo: string;
    codigo: string;
    idTurma: number | string | null | undefined;
}): string {
    const campo = (v: unknown) => String(v ?? "").replace(/[|\]\[\n\r]/g, " ").trim();
    return `[TURMA|${[
        t.turma,
        t.docente,
        t.horario,
        t.local,
        t.vagas,
        t.periodo,
        t.codigo,
        t.idTurma ?? "",
    ]
        .map(campo)
        .join("|")}]`;
}

/** Executor cru — também usado pelo atalho `/turmas CODIGO` (bypass do LLM). */
export async function consultarTurmasMateria(args: Record<string, unknown>): Promise<string> {
    const codigo = typeof args.codigo === "string" ? norm(args.codigo) : "";
    if (!codigo) return JSON.stringify({ erro: "Código da matéria não fornecido." });

    try {
        const supabase = SupabaseWrapper.get();
        const { data: materiaData, error: materiaError } = await supabase
            .from("materias")
            .select("id_materia, nome_materia")
            .eq("codigo_materia", codigo)
            .single();

        if (materiaError || !materiaData) {
            return JSON.stringify({ erro: `Matéria ${codigo} não encontrada.` });
        }

        // Tentar obter o período letivo atual via RPC do Supabase
        const { data: periodoAtual } = await supabase.rpc("periodo_letivo_atual");

        let turmasQuery = supabase
            .from("turmas")
            .select("id_turmas, turma, docente, horario, local, vagas_ofertadas, vagas_ocupadas, ano_periodo")
            .eq("id_materia", materiaData.id_materia);

        if (periodoAtual) {
            turmasQuery = turmasQuery.eq("ano_periodo", periodoAtual);
        }

        let { data: turmasRows, error: turmasError } = await turmasQuery
            .order("ano_periodo", { ascending: false })
            .limit(10);

        // Fallback: se não houver ofertas no período letivo atual, buscar as mais recentes registradas
        if (!turmasRows || turmasRows.length === 0) {
            const { data: fallbackRows } = await supabase
                .from("turmas")
                .select("id_turmas, turma, docente, horario, local, vagas_ofertadas, vagas_ocupadas, ano_periodo")
                .eq("id_materia", materiaData.id_materia)
                .order("ano_periodo", { ascending: false })
                .limit(10);
            turmasRows = fallbackRows;
        }

        if (turmasError || !turmasRows || turmasRows.length === 0) {
            return JSON.stringify({ erro: `Nenhuma turma encontrada para ${codigo} - ${materiaData.nome_materia}.` });
        }

        const turmasFormatadas = turmasRows.map((t) =>
            marcadorTurma({
                turma: t.turma || "?",
                docente: t.docente || "A definir",
                horario: t.horario || "?",
                local: t.local || "?",
                vagas: `${t.vagas_ocupadas ?? "?"}/${t.vagas_ofertadas ?? "?"}`,
                periodo: t.ano_periodo || "",
                codigo,
                idTurma: t.id_turmas,
            })
        );

        return JSON.stringify({
            codigo,
            nome_materia: materiaData.nome_materia,
            periodo: periodoAtual || (turmasRows[0]?.ano_periodo ?? null),
            instrucao_llm:
                "Para exibir as turmas, COPIE E COLE EXATAMENTE as linhas [TURMA|...] abaixo, uma por linha, sem alterar nada dentro dos colchetes (o app desenha o card e usa o código e o id da turma para a ação \"Usar esta turma\"). Nunca escreva um [TURMA|...] que não veio desta tool.",
            turmas_recentes: turmasFormatadas,
        });
    } catch (e) {
        return JSON.stringify({ erro: `Falha ao consultar turmas da matéria ${codigo}.` });
    }
}

async function consultarInformacoesMateria(args: Record<string, unknown>): Promise<string> {
    const codigo = typeof args.codigo === "string" ? norm(args.codigo) : "";
    if (!codigo) return JSON.stringify({ erro: "Código da matéria não fornecido." });

    try {
        const supabase = SupabaseWrapper.get();
        const { data, error } = await supabase
            .from("materias")
            .select("nome_materia, ementa, departamento, carga_horaria")
            .eq("codigo_materia", codigo)
            .single();

        if (error || !data) {
            return JSON.stringify({ erro: `Matéria ${codigo} não encontrada no banco de dados oficial.` });
        }

        return JSON.stringify({
            codigo,
            nome_materia: data.nome_materia,
            departamento: data.departamento,
            carga_horaria: data.carga_horaria,
            ementa: data.ementa || "Não cadastrada.",
            aviso: "Para dificuldade percebida ou recomendação de outros alunos, use a tool consultar_opinioes_disciplina.",
        });
    } catch (e) {
        return JSON.stringify({ erro: `Falha ao consultar informações da matéria ${codigo}.` });
    }
}

export const consultarInformacoesMateriaTool: AgentTool = {
    name: "consultar_informacoes_materia",
    requiresPlano: false,
    schema: {
        type: "function",
        function: {
            name: "consultar_informacoes_materia",
            description:
                "Busca a ementa oficial da matéria no banco de dados. (Para nível de dificuldade percebida ou recomendação de outros alunos, use a tool consultar_opinioes_disciplina).",
            parameters: {
                type: "object",
                properties: {
                    codigo: {
                        type: "string",
                        description: "Código da matéria (ex: FGA0211). Obrigatório.",
                    },
                },
                required: ["codigo"],
            },
        },
    },
    execute: async (args) => ({ resultado: await consultarInformacoesMateria(args) }),
};

/**
 * Agregados reais de avaliações de alunos por disciplina — nunca por professor.
 * Lê só a view pública `materias_estatisticas_avaliacoes` (sem texto livre, sem
 * professor); não consulta a tabela crua `avaliacoes_disciplinas` em hipótese
 * alguma, para não expor feedback verbatim nem dado ligado a professor.
 */
async function consultarOpinioesDisciplina(args: Record<string, unknown>): Promise<string> {
    const codigo = typeof args.codigo === "string" ? norm(args.codigo) : "";
    if (!codigo) return JSON.stringify({ erro: "Código da matéria não fornecido." });

    try {
        const supabase = SupabaseWrapper.get();
        const { data: materiaData, error: materiaError } = await supabase
            .from("materias")
            .select("nome_materia")
            .eq("codigo_materia", codigo)
            .single();

        if (materiaError || !materiaData) {
            return JSON.stringify({ erro: `Matéria ${codigo} não encontrada.` });
        }

        const { data, error } = await supabase
            .from("materias_estatisticas_avaliacoes")
            .select("n_avaliacoes, dificuldade_media, dificuldade_desvio_padrao, pct_recomendaria, carga_atividades_media, distribuicao_material")
            .eq("codigo_materia", codigo)
            .maybeSingle();

        if (error) {
            return JSON.stringify({ erro: `Falha ao consultar opiniões da matéria ${codigo}.` });
        }

        if (!data || !data.n_avaliacoes) {
            return JSON.stringify({
                codigo,
                nome_materia: materiaData.nome_materia,
                n_avaliacoes: 0,
                aviso: "Nenhuma avaliação de aluno registrada para esta disciplina ainda.",
            });
        }

        // Desvio padrão alto (escala 1-6) sinaliza opinião dividida — a média
        // sozinha esconderia isso, e com este recurso não há como distinguir se a
        // divisão vem de professor/turma (fora de escopo aqui) ou de outro fator.
        const LIMIAR_DESVIO_ALTO = 1.3;
        const opiniaoDividida = data.dificuldade_desvio_padrao != null && data.dificuldade_desvio_padrao > LIMIAR_DESVIO_ALTO;

        return JSON.stringify({
            codigo,
            nome_materia: materiaData.nome_materia,
            n_avaliacoes: data.n_avaliacoes,
            dificuldade_media: data.dificuldade_media,
            dificuldade_desvio_padrao: data.dificuldade_desvio_padrao,
            dificuldade_escala: "1 (muito fácil) a 6 (nível god)",
            opiniao_dividida: opiniaoDividida,
            pct_recomendaria: data.pct_recomendaria,
            carga_atividades_media: data.carga_atividades_media,
            carga_atividades_escala: "1 (muito leve) a 5 (exagerada)",
            distribuicao_material: data.distribuicao_material,
            instrucao_llm:
                `Estes são agregados estatísticos de avaliações reais de alunos sobre a DISCIPLINA (nunca sobre professor específico). Sempre mencione o tamanho da amostra (n_avaliacoes) na resposta. Se n_avaliacoes for menor que 5, deixe claro que a amostra é pequena e pode não ser representativa. Não invente opiniões além destes números, e não fale de professores individuais mesmo que o aluno pergunte por nome.${opiniaoDividida ? " opiniao_dividida=true: avise explicitamente que as opiniões dos alunos variam bastante nessa disciplina (desvio padrão alto), então a média pode não representar bem a experiência de um aluno específico." : ""} Responda em texto corrido (sem lista com hífen/bullet), como nas outras respostas do chat.`,
        });
    } catch (e) {
        return JSON.stringify({ erro: `Falha ao consultar opiniões da matéria ${codigo}.` });
    }
}

export const consultarOpinioesDisciplinaTool: AgentTool = {
    name: "consultar_opinioes_disciplina",
    requiresPlano: false,
    schema: {
        type: "function",
        function: {
            name: "consultar_opinioes_disciplina",
            description:
                "Busca agregados estatísticos de avaliações reais de alunos sobre uma disciplina: dificuldade percebida, % que recomendaria, carga de atividades e qualidade do material. Use quando o aluno perguntar 'o que acham de X', dificuldade, se vale a pena cursar, etc. Nunca traz dado por professor.",
            parameters: {
                type: "object",
                properties: {
                    codigo: {
                        type: "string",
                        description: "Código da matéria (ex: MAT0025). Obrigatório.",
                    },
                },
                required: ["codigo"],
            },
        },
    },
    execute: async (args) => ({ resultado: await consultarOpinioesDisciplina(args) }),
};

type MateriaBusca = { codigo: string; nome: string; similaridade: number };

/**
 * Mantém só as matérias com turma ofertada no período letivo ativo.
 * Usado quando o chat está embutido no Montador de Grade (ctx.apenasComOferta):
 * não faz sentido recomendar optativa que o aluno não consegue matricular agora.
 */
async function filtrarPorOfertaAtiva(materias: MateriaBusca[]): Promise<MateriaBusca[]> {
    const codigos = materias.map((m) => norm(m.codigo)).filter(Boolean);
    if (codigos.length === 0) return [];

    const supabase = SupabaseWrapper.get();
    const { data: periodo } = await supabase.rpc("periodo_letivo_atual");
    if (!periodo) return materias; // sem período conhecido → não filtra

    const { data: mats } = await supabase
        .from("materias")
        .select("id_materia, codigo_materia")
        .in("codigo_materia", codigos);
    const idPorCodigo = new Map<string, number>(
        (mats ?? []).map((m: any) => [norm(m.codigo_materia), Number(m.id_materia)])
    );
    const ids = [...idPorCodigo.values()];
    if (ids.length === 0) return [];

    const { data: turmas } = await supabase
        .from("turmas")
        .select("id_materia")
        .eq("ano_periodo", periodo)
        .in("id_materia", ids);
    const idsComOferta = new Set<number>((turmas ?? []).map((t: any) => Number(t.id_materia)));

    return materias.filter((m) => {
        const id = idPorCodigo.get(norm(m.codigo));
        return id != null && idsComOferta.has(id);
    });
}

async function buscarMateriasUnb(args: Record<string, unknown>, ctx: AgenteContexto): Promise<string> {
    const raw = Array.isArray(args.termos_busca) ? args.termos_busca : [];
    const termos = raw
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map(t => removeAccents(t.trim()).toUpperCase());

    if (termos.length === 0) {
        return JSON.stringify({ erro: "Informe ao menos um termo de busca em 'termos_busca'." });
    }
    let materias = await sabia.buscarMaterias(termos);

    if (ctx.apenasComOferta && materias.length > 0) {
        materias = await filtrarPorOfertaAtiva(materias);
        if (materias.length === 0) {
            return JSON.stringify({
                aviso: "Nenhuma disciplina sobre esse tema tem turma ofertada no período atual.",
                materias: [],
            });
        }
    }

    if (materias.length === 0) {
        return JSON.stringify({
            aviso: "Nenhuma disciplina encontrada (ou o serviço de busca semântica está indisponível).",
            materias: [],
        });
    }

    // Situação do aluno em cada resultado: já concluída, em curso ou obrigatória
    // do curso não devem ser recomendadas como optativas — separá-las aqui evita
    // que o modelo sugira matéria que o aluno já venceu (ex.: APC no 9º semestre).
    const { completed, currentSemester } = parseFluxograma(ctx.fluxogramaAtual);
    const emCurso = new Set(currentSemester.map((m) => norm(m.codigo)));
    const pendentePorCodigo = new Map(ctx.materias.map((m) => [norm(m.codigo), m]));
    const situacaoDe = (codigo: string): string => {
        const cod = norm(codigo);
        if (completed.has(cod)) return "ja_concluida";
        if (emCurso.has(cod)) return "em_curso";
        if (pendentePorCodigo.get(cod)?.obrigatoria) return "obrigatoria_do_curso";
        return "disponivel";
    };
    const recomendaveis: (MateriaBusca & { situacao_aluno: string })[] = [];
    const naoRecomendaveis: { codigo: string; nome: string; motivo: string }[] = [];
    for (const m of materias) {
        const situacao = situacaoDe(m.codigo);
        if (situacao === "disponivel") recomendaveis.push({ ...m, situacao_aluno: situacao });
        else naoRecomendaveis.push({ codigo: m.codigo, nome: m.nome, motivo: situacao });
    }

    return JSON.stringify({
        materias: recomendaveis,
        nao_recomendaveis: naoRecomendaveis.length > 0 ? naoRecomendaveis : undefined,
        aviso:
            recomendaveis.length === 0
                ? "Todas as disciplinas encontradas já foram concluídas, estão em curso ou são obrigatórias do curso — tente outros termos."
                : undefined,
    });
}

export const buscarMateriasUnbTool: AgentTool = {
    name: "buscar_materias_unb",
    requiresPlano: false,
    schema: {
        type: "function",
        function: {
            name: "buscar_materias_unb",
            description:
                "Descobre/recomenda disciplinas da UnB sobre um assunto ou interesse usando busca semântica (embeddings). Use quando o aluno quiser explorar matérias por tema (ex: 'quero aprender sobre redes').",
            parameters: {
                type: "object",
                properties: {
                    termos_busca: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "1 a 4 termos de busca sobre o assunto (o termo principal + sinônimos/termos relacionados melhoram a recall). Ex: ['redes de computadores', 'protocolos', 'internet'].",
                    },
                },
                required: ["termos_busca"],
            },
        },
    },
    execute: async (args, ctx) => ({ resultado: await buscarMateriasUnb(args, ctx) }),
};

/**
 * Busca matérias pelo LOCAL/campus das turmas ofertadas (ex.: "FGA", "FCTE",
 * "FCE", "FUP", "UAC", "UED", "BSA", "ICC"). O campo turmas.local é texto livre
 * com o prédio/campus; um ILIKE por termo já pega as ofertas certas.
 */
async function buscarMateriasPorLocal(args: Record<string, unknown>): Promise<string> {
    const raw = Array.isArray(args.locais) ? args.locais : [];
    const termos = raw
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        // Só alfanumérico/espaço/hífen: evita quebrar/injetar no filtro .or() do PostgREST.
        .map((t) => t.replace(/[^A-Za-z0-9 -]/g, " ").trim())
        .filter(Boolean);

    if (termos.length === 0) {
        return JSON.stringify({ erro: "Informe ao menos um local/campus em 'locais' (ex: ['FGA','FCTE'])." });
    }

    try {
        const supabase = SupabaseWrapper.get();
        const { data: periodo } = await supabase.rpc("periodo_letivo_atual");

        const orFilter = termos.map((t) => `local.ilike.%${t}%`).join(",");
        let query = supabase
            .from("turmas")
            .select("id_materia, turma, local, ano_periodo")
            .or(orFilter)
            .limit(400);
        if (periodo) query = query.eq("ano_periodo", periodo);

        const { data: turmas, error } = await query;
        if (error) {
            return JSON.stringify({ erro: "Falha ao buscar turmas por local." });
        }
        if (!turmas || turmas.length === 0) {
            return JSON.stringify({
                aviso: `Nenhuma turma encontrada nos locais: ${termos.join(", ")} (período ${periodo ?? "atual"}).`,
                materias: [],
            });
        }

        const ids = [...new Set(turmas.map((t) => t.id_materia))];
        const { data: mats } = await supabase
            .from("materias")
            .select("id_materia, codigo_materia, nome_materia")
            .in("id_materia", ids);
        const infoById = new Map<number, { codigo: string; nome: string }>(
            (mats ?? []).map((m: any) => [Number(m.id_materia), { codigo: m.codigo_materia, nome: m.nome_materia }])
        );

        const porMateria = new Map<string, { codigo: string; nome: string; qtd_turmas: number }>();
        for (const t of turmas) {
            const info = infoById.get(Number(t.id_materia));
            if (!info) continue;
            const atual = porMateria.get(info.codigo) ?? { codigo: info.codigo, nome: info.nome, qtd_turmas: 0 };
            atual.qtd_turmas += 1;
            porMateria.set(info.codigo, atual);
        }

        const materias = [...porMateria.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)).slice(0, 40);
        return JSON.stringify({
            periodo: periodo ?? null,
            locais_buscados: termos,
            total_materias: materias.length,
            materias,
            instrucao_llm: "Liste os códigos das matérias (o app os transforma em botões clicáveis). Se houver muitas, resuma e cite as principais.",
        });
    } catch {
        return JSON.stringify({ erro: "Falha ao buscar matérias por local." });
    }
}

export const buscarMateriasPorLocalTool: AgentTool = {
    name: "buscar_materias_por_local",
    requiresPlano: false,
    schema: {
        type: "function",
        function: {
            name: "buscar_materias_por_local",
            description:
                "Lista matérias ofertadas em um CAMPUS/LOCAL específico, buscando no campo 'local' das turmas do período atual. Use quando o aluno perguntar por matérias de um campus/prédio (ex: 'matérias da FGA', 'e da FCTE?', 'o que tem no BSA', 'disciplinas na FCE/FUP/UAC/UED/ICC').",
            parameters: {
                type: "object",
                properties: {
                    locais: {
                        type: "array",
                        items: { type: "string" },
                        description:
                            "1 a 4 termos de local/campus a casar no campo local da turma (ex: ['FGA','FCTE'] para o campus Gama, ['BSA'] para salas do Darcy, ['FCE'] Ceilândia, ['FUP'] Planaltina).",
                    },
                },
                required: ["locais"],
            },
        },
    },
    execute: async (args) => ({ resultado: await buscarMateriasPorLocal(args) }),
};

export const consultarTurmasMateriaTool: AgentTool = {
    name: "consultar_turmas_materia",
    requiresPlano: false,
    schema: {
        type: "function",
        function: {
            name: "consultar_turmas_materia",
            description: "Busca as turmas ofertadas de uma matéria: Professores, horários, locais e vagas.",
            parameters: {
                type: "object",
                properties: {
                    codigo: {
                        type: "string",
                        description: "Código da matéria (ex: MAT0026). Obrigatório.",
                    },
                },
                required: ["codigo"],
            },
        },
    },
    execute: async (args) => ({ resultado: await consultarTurmasMateria(args) }),
};
