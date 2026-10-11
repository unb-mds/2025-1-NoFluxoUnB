import { SupabaseWrapper } from "../supabase_wrapper";
import { createControllerLogger } from "../utils/controller_logger";
import { logAiUsage, type LlmUsage } from "../utils/ai_usage_logger";
import { MARITACA_URL, MARITACA_MODELS } from "../config/maritaca";
import { isMaritacaSemCreditos } from "../config/maritaca_errors";
import type { MateriaInput } from "../types/planejamento";

const logger = createControllerLogger("DificuldadeAgenteService", "avaliar");

/**
 * Serviço responsável por chamar a LLM para preencher a dificuldade estimada
 * de disciplinas que ainda não possuem esse dado no banco (Lazy Loading).
 */
export class DificuldadeAgenteService {
    /**
     * Avalia a dificuldade de uma lista de matérias via LLM e salva no Supabase.
     * Atualiza o array original de matérias em memória com os resultados.
     */
    static async avaliarESalvarDificuldades(materiasFaltantes: MateriaInput[]): Promise<void> {
        if (!materiasFaltantes || materiasFaltantes.length === 0) return;

        const apiKey = process.env.MARITACA_API_KEY;
        if (!apiKey) {
            logger.warn("MARITACA_API_KEY não configurada. Pulando avaliação de dificuldade.");
            return;
        }

        // Tracking de custo (dashboard admin): só loga se de fato chamou a LLM —
        // as matérias resolvidas só com dado real (avaliações/histórico) não geram
        // requisição nenhuma.
        const inicio = Date.now();
        let chamouLlm = false;
        let houveErro = false;
        // 403 de saldo: nenhuma chamada foi paga, mas o evento vai ao log (é o
        // que acende o alerta "Créditos acabaram" no dashboard).
        let erroSemCreditos: unknown;
        let promptTokensAcc = 0;
        let completionTokensAcc = 0;
        let totalTokensAcc = 0;

        // Separar matérias que valem a pena avaliar (tem nome) das que não têm (nome == codigo)
        const materiasComNome = materiasFaltantes.filter(m => m.nome && m.nome !== m.codigo);
        const materiasParaIgnorar = materiasFaltantes.filter(m => !m.nome || m.nome === m.codigo);

        const supabase = SupabaseWrapper.get();
        const updatePromises: any[] = [];

        // Já resolvemos as ignoradas com valor padrão para não gastar tokens em requisições futuras
        for (const materia of materiasParaIgnorar) {
            materia.dificuldadeEstimada = 4;
            materia.motivoDificuldade = "Nome e ementa indisponíveis no banco de dados. Avaliação automática ignorada.";

            updatePromises.push(
                supabase
                    .from("materias")
                    .update({
                        dificuldade_estimada: 4,
                        motivo_dificuldade: materia.motivoDificuldade,
                        dificuldade_calculada_em: new Date().toISOString(),
                        dificuldade_fonte: "default",
                    })
                    .eq("codigo_materia", materia.codigo)
            );
        }

        if (materiasComNome.length === 0) {
            logger.info("Nenhuma matéria válida para avaliar com a LLM. Todas foram ignoradas por falta de nome.");
            await Promise.all(updatePromises);
            return;
        }

        // Dois sinais reais, independentes, cada um com peso crescente conforme sua
        // própria amostra cresce (shrinkage n/(n+K), não corte binário):
        //  (1) avaliações de alunos (subjetivo, "quão difícil pareceu") — poucas
        //      centenas de respostas de formulário no máximo.
        //  (2) histórico acadêmico real (objetivo, "quantos de fato reprovaram") —
        //      milhares de tentativas reais, cobertura maior que o formulário.
        // Correlação entre os dois medida empiricamente (n=75 disciplinas com sinal
        // dos dois lados): r≈0.39 — relacionados, mas não a mesma coisa (uma
        // disciplina pode ser cansativa de estudar sem ter reprovação alta, ou
        // vice-versa), por isso os dois são combinados, não um substitui o outro.
        const K_SHRINKAGE = 3;
        // Confiança combinada mínima pra pular a LLM inteiramente — combinação
        // "probabilidade de pelo menos uma fonte ser confiável" (ver pesoTotal).
        const LIMIAR_PULAR_LLM = 0.85;
        // Desvio padrão (escala 1-6) acima do qual a opinião dos alunos é
        // considerada "dividida" e vale avisar (limiar arbitrário, mesma natureza
        // não-calibrada dos outros parâmetros acima).
        const LIMIAR_DESVIO_ALTO = 1.3;
        // Teto de taxa_reprovacao pra normalizar em nota 1-10: calibrado a partir da
        // distribuição real observada (p99≈0.25, máximo≈0.43 entre disciplinas com
        // volume) — não 1.0, porque 100% de reprovação praticamente não ocorre e usar
        // 1.0 como teto comprimiria quase tudo perto da nota mínima.
        const TETO_TAXA_REPROVACAO = 0.4;

        const peso = (n: number) => n / (n + K_SHRINKAGE);

        type StatsAvaliacoes = {
            n_avaliacoes: number;
            dificuldade_media: number | null;
            pct_recomendaria: number | null;
            dificuldade_desvio_padrao: number | null;
        };
        type StatsHistorico = {
            n_tentativas: number;
            taxa_reprovacao: number | null;
        };

        // Nota 1-10 a partir só da avaliação subjetiva (sem clamping de
        // arredondamento ainda — isso só acontece depois de combinar as fontes).
        const notaSubjetiva = (stats: StatsAvaliacoes): number => {
            // dificuldade_media vem na escala 1-6 do formulário (ver canonDificuldade em
            // scripts/import_avaliacoes_disciplinas.ts); a nota final é 1-10.
            const escala1a10 = 1 + ((stats.dificuldade_media ?? 3.5) - 1) * (9 / 5);
            // Sinal secundário: taxa de NÃO recomendação também empurra a nota pra cima.
            const bruta =
                stats.pct_recomendaria == null
                    ? escala1a10
                    : escala1a10 * 0.7 + (1 - stats.pct_recomendaria) * 10 * 0.3;
            return Math.max(1, Math.min(10, bruta));
        };

        // Nota 1-10 a partir só da taxa de reprovação real (histórico acadêmico).
        const notaObjetiva = (stats: StatsHistorico): number => {
            const taxa = Math.min(stats.taxa_reprovacao ?? 0, TETO_TAXA_REPROVACAO);
            return 1 + (taxa / TETO_TAXA_REPROVACAO) * 9;
        };

        const avisoDispersao = (stats: StatsAvaliacoes): string =>
            stats.dificuldade_desvio_padrao != null && stats.dificuldade_desvio_padrao > LIMIAR_DESVIO_ALTO
                ? ` Opiniões dos alunos bem divididas (desvio padrão ${stats.dificuldade_desvio_padrao} numa escala de 1-6) — pode variar bastante conforme a turma/professor.`
                : "";

        const codigosComNome = materiasComNome.map((m) => m.codigo);
        const [{ data: statsAvaliacoesRows }, { data: statsHistoricoRows }] = await Promise.all([
            supabase
                .from("materias_estatisticas_avaliacoes")
                .select("codigo_materia, n_avaliacoes, dificuldade_media, pct_recomendaria, dificuldade_desvio_padrao")
                .in("codigo_materia", codigosComNome),
            supabase
                .from("materias_estatisticas_historico")
                .select("codigo_materia, n_tentativas, taxa_reprovacao")
                .in("codigo_materia", codigosComNome),
        ]);

        const statsAvaliacoesPorCodigo = new Map<string, StatsAvaliacoes>(
            (statsAvaliacoesRows ?? []).map((s: any) => [s.codigo_materia, s])
        );
        const statsHistoricoPorCodigo = new Map<string, StatsHistorico>(
            (statsHistoricoRows ?? []).map((s: any) => [s.codigo_materia, s])
        );

        // Combina as duas fontes (quando existirem) numa única nota + peso de
        // confiança total. wA/wR em [0,1); se só uma fonte existir, a combinação
        // reduz exatamente a essa fonte sozinha (sem "diluir" com uma fonte ausente).
        type Combinado = { nota: number; pesoTotal: number; wA: number; wR: number; statsA?: StatsAvaliacoes; statsR?: StatsHistorico };
        const combinar = (codigo: string): Combinado | null => {
            const statsA = statsAvaliacoesPorCodigo.get(codigo);
            const statsR = statsHistoricoPorCodigo.get(codigo);
            const wA = statsA?.n_avaliacoes ? peso(statsA.n_avaliacoes) : 0;
            const wR = statsR?.n_tentativas ? peso(statsR.n_tentativas) : 0;
            if (wA === 0 && wR === 0) return null;

            const nA = wA > 0 ? notaSubjetiva(statsA!) : 0;
            const nR = wR > 0 ? notaObjetiva(statsR!) : 0;
            const nota = Math.max(1, Math.min(10, (wA * nA + wR * nR) / (wA + wR)));
            const pesoTotal = 1 - (1 - wA) * (1 - wR);
            return { nota, pesoTotal, wA, wR, statsA, statsR };
        };

        const combinadoPorCodigo = new Map<string, Combinado>();
        for (const m of materiasComNome) {
            const c = combinar(m.codigo);
            if (c) combinadoPorCodigo.set(m.codigo, c);
        }

        const motivoCombinado = (c: Combinado): string => {
            const partes: string[] = [];
            if (c.statsA?.n_avaliacoes) partes.push(`${c.statsA.n_avaliacoes} avaliação(ões) de alunos`);
            if (c.statsR?.n_tentativas) partes.push(`${c.statsR.n_tentativas} matrícula(s) reais no histórico (${Math.round((c.statsR.taxa_reprovacao ?? 0) * 100)}% reprovação)`);
            const base = `Baseado em ${partes.join(" e ")}.`;
            return c.statsA ? base + avisoDispersao(c.statsA) : base;
        };

        const materiasComDadoReal = materiasComNome.filter((m) => (combinadoPorCodigo.get(m.codigo)?.pesoTotal ?? 0) >= LIMIAR_PULAR_LLM);
        const materiasHibrido = materiasComNome.filter((m) => {
            const p = combinadoPorCodigo.get(m.codigo)?.pesoTotal ?? 0;
            return p > 0 && p < LIMIAR_PULAR_LLM;
        });
        const materiasParaAvaliar = materiasComNome.filter((m) => !combinadoPorCodigo.has(m.codigo));
        const codigosHibrido = new Set(materiasHibrido.map((m) => m.codigo));

        for (const materia of materiasComDadoReal) {
            const c = combinadoPorCodigo.get(materia.codigo)!;
            const notaSegura = Math.max(1, Math.min(10, Math.round(c.nota)));
            const motivo = motivoCombinado(c);

            materia.dificuldadeEstimada = notaSegura;
            materia.motivoDificuldade = motivo;

            updatePromises.push(
                supabase
                    .from("materias")
                    .update({
                        dificuldade_estimada: notaSegura,
                        motivo_dificuldade: motivo,
                        dificuldade_calculada_em: new Date().toISOString(),
                        dificuldade_fonte: "real",
                    })
                    .eq("codigo_materia", materia.codigo)
            );
        }

        const materiasViaLlm = [...materiasHibrido, ...materiasParaAvaliar];

        if (materiasViaLlm.length === 0) {
            logger.info(`Todas as ${materiasComDadoReal.length} matérias restantes tinham dado real suficiente; nenhuma chamada à LLM foi necessária.`);
            await Promise.all(updatePromises);
            return;
        }

        logger.info(`Iniciando avaliação de dificuldade via LLM para ${materiasViaLlm.length} matérias (${materiasHibrido.length} híbridas com dado real fino, ${materiasParaAvaliar.length} sem dado real; ${materiasComDadoReal.length} resolvidas só com dado real; ${materiasParaIgnorar.length} ignoradas por falta de nome)...`);

        // Ementa (quando disponível) ajuda a LLM sem custo adicional de busca —
        // já é uma coluna existente em materias, só não era usada neste prompt.
        const { data: ementasRows } = await supabase
            .from("materias")
            .select("codigo_materia, ementa")
            .in("codigo_materia", materiasViaLlm.map((m) => m.codigo));
        const ementaPorCodigo = new Map<string, string>(
            (ementasRows ?? [])
                .filter((r: any) => r.ementa)
                .map((r: any) => [r.codigo_materia, String(r.ementa).slice(0, 300)])
        );

        // Processar em chunks menores para evitar erros de formatação JSON e limite de tokens
        const CHUNK_SIZE = 15;
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

        for (let i = 0; i < materiasViaLlm.length; i += CHUNK_SIZE) {
            if (i > 0) {
                logger.info("Aguardando 3s para respeitar o Rate Limit da API...");
                await delay(3000);
            }

            const chunk = materiasViaLlm.slice(i, i + CHUNK_SIZE);

            logger.info(`Avaliant chunk ${Math.floor(i / CHUNK_SIZE) + 1} de ${Math.ceil(materiasViaLlm.length / CHUNK_SIZE)}...`);

            const listaMaterias = chunk
                .map((m) => {
                    const ementa = ementaPorCodigo.get(m.codigo);
                    const combinado = codigosHibrido.has(m.codigo) ? combinadoPorCodigo.get(m.codigo) : undefined;
                    const partesContexto: string[] = [];
                    if (combinado?.statsA?.n_avaliacoes) {
                        partesContexto.push(
                            `${combinado.statsA.n_avaliacoes} aluno(s) avaliaram esta disciplina, dificuldade média ${combinado.statsA.dificuldade_media ?? "?"}/6${combinado.statsA.pct_recomendaria != null ? `, ${Math.round(combinado.statsA.pct_recomendaria * 100)}% recomendaria` : ""}`
                        );
                    }
                    if (combinado?.statsR?.n_tentativas) {
                        partesContexto.push(
                            `${combinado.statsR.n_tentativas} matrícula(s) reais no histórico, ${Math.round((combinado.statsR.taxa_reprovacao ?? 0) * 100)}% de reprovação`
                        );
                    }
                    const contextoReal = partesContexto.length > 0
                        ? ` | Dado real: ${partesContexto.join("; ")} (amostra ainda pequena pra confiar 100%, use como indício)`
                        : "";
                    return `- Código: ${m.codigo} | Nome: ${m.nome} ${m.departamento ? `| Departamento: ${m.departamento}` : ""}${ementa ? ` | Ementa: ${ementa}` : ""}${contextoReal}`;
                })
                .join("\n");

            const prompt = `Você é um conselheiro acadêmico especialista nos currículos e matérias da Universidade de Brasília (UnB).
Sua tarefa é estimar a Dificuldade e Carga de Trabalho das matérias abaixo, atribuindo uma nota de 1 a 10 para cada uma.
- Nota 1-3: Matérias muito fáceis, geralmente introdutórias ou teóricas leves.
- Nota 4-6: Matérias de dificuldade média (ex: optativas comuns, introdução a programação).
- Nota 7-8: Matérias difíceis que reprovam consideravelmente e exigem muito estudo (ex: Física 1, Estrutura de Dados, Anatomia).
- Nota 9-10: Matérias notórias pelo alto índice de reprovação e carga pesada (ex: Cálculo 2, Cálculo 3, Mecânica dos Fluidos, Sinais e Sistemas).

Você deve basear sua avaliação no nome da disciplina, departamento, ementa (quando disponível) e no conhecimento público do histórico dessas matérias na UnB. Quando a matéria tiver "Dado real" listado, priorize esse sinal (é avaliação de aluno de verdade, mesmo que a amostra seja pequena) em vez de só chutar pelo nome.

REGRAS OBRIGATÓRIAS DE FORMATAÇÃO:
1. Você NÃO PODE usar o formato JSON. Retorne EXCLUSIVAMENTE texto puro.
2. Você DEVE usar o formato de uma linha por matéria, separados por barra vertical (pipe) "|".
3. Formato exato: CODIGO|NOTA|MOTIVO
4. Não use nenhum cabeçalho, introdução, conclusão, aspas ou blocos de código markdown.
5. O texto do MOTIVO deve ser EXTREMAMENTE CURTO. Use no máximo 10 palavras por matéria. Seja super direto.

Exemplo de saída esperada:
MAT0026|9|Reprova muito devido a alta abstracao matematica.
CIC0004|5|Materia introdutoria basica de programacao.

Avalie as seguintes matérias:
${listaMaterias}`;

            let maxRetries = 2;
            let success = false;

            while (maxRetries >= 0 && !success) {
                try {
                    const response = await fetch(MARITACA_URL, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Key ${apiKey}`,
                        },
                        body: JSON.stringify({
                            model: MARITACA_MODELS.CLASSIFICACAO,
                            messages: [{ role: "user", content: prompt }],
                            temperature: 0.2,
                            max_tokens: 450
                        }),
                    });

                    if (!response.ok) {
                        const err = await response.text();
                        if (response.status === 429 && maxRetries > 0) {
                            logger.warn(`Rate limit (429) atingido. Aguardando 40s antes de tentar novamente... Detalhes: ${err}`);
                            await delay(40000);
                            maxRetries--;
                            continue;
                        }
                        throw new Error(`Maritaca API error: ${response.status} ${err}`);
                    }

                    const data = (await response.json()) as any;
                    chamouLlm = true;
                    const u = data.usage;
                    if (u) {
                        promptTokensAcc += u.prompt_tokens ?? 0;
                        completionTokensAcc += u.completion_tokens ?? 0;
                        totalTokensAcc += u.total_tokens ?? ((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0));
                    }
                    let content = data.choices?.[0]?.message?.content || "";

                    // Limpeza e Parse do formato CODIGO|NOTA|MOTIVO
                    content = content.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "").trim();
                    const linhas = content.split("\n");
                    const resultados: Record<string, {nota: number, motivo: string}> = {};

                    for (const linha of linhas) {
                        const partes = linha.split("|");
                        if (partes.length >= 3) {
                            const codigo = partes[0].trim();
                            const notaNum = parseInt(partes[1].trim(), 10);
                            const motivoText = partes.slice(2).join("|").trim();
                            
                            if (!isNaN(notaNum)) {
                                resultados[codigo] = { nota: notaNum, motivo: motivoText };
                            }
                        }
                    }

                    // Processar resultados para o chunk atual
                    for (const materia of chunk) {
                        const avaliacao = resultados[materia.codigo];
                        if (avaliacao && typeof avaliacao.nota === "number") {
                            const ehHibrido = codigosHibrido.has(materia.codigo);
                            let notaSegura: number;
                            let motivoStr: string;

                            if (ehHibrido) {
                                // Mistura numérica explícita (shrinkage), não só "contexto de texto
                                // no prompt e torcer pra LLM ponderar direito sozinha": a nota final
                                // é uma combinação matemática do dado real (já combinando avaliações
                                // subjetivas + reprovação real, se ambas existirem) com o palpite da LLM.
                                const c = combinadoPorCodigo.get(materia.codigo)!;
                                const notaLlmBruta = Math.max(1, Math.min(10, avaliacao.nota));
                                notaSegura = Math.max(1, Math.min(10, Math.round(c.pesoTotal * c.nota + (1 - c.pesoTotal) * notaLlmBruta)));
                                motivoStr =
                                    `${motivoCombinado(c)} Combinado com estimativa de IA (peso do dado real: ${Math.round(c.pesoTotal * 100)}%). ${String(avaliacao.motivo || "").trim()}`.trim();
                            } else {
                                notaSegura = Math.max(1, Math.min(10, Math.floor(avaliacao.nota)));
                                motivoStr = String(avaliacao.motivo || "").trim();
                            }

                            materia.dificuldadeEstimada = notaSegura;
                            materia.motivoDificuldade = motivoStr;

                            updatePromises.push(
                                supabase
                                    .from("materias")
                                    .update({
                                        dificuldade_estimada: notaSegura,
                                        motivo_dificuldade: motivoStr,
                                        dificuldade_calculada_em: new Date().toISOString(),
                                        dificuldade_fonte: ehHibrido ? "hibrido" : "llm",
                                    })
                                    .eq("codigo_materia", materia.codigo)
                            );
                        } else {
                            materia.dificuldadeEstimada = 4;
                            materia.motivoDificuldade = "Dificuldade padrão assumida";
                        }
                    }
                    success = true;
                } catch (error: any) {
                    if (error.message.includes("429") && maxRetries > 0) {
                        logger.warn(`Rate limit capturado no catch. Aguardando 40s...`);
                        await delay(40000);
                        maxRetries--;
                        continue;
                    }
                    logger.error(`Erro ao avaliar chunk da LLM: ${error.message}`);
                    houveErro = true;
                    if (isMaritacaSemCreditos(error)) erroSemCreditos = error;
                    for (const m of chunk) {
                        m.dificuldadeEstimada = 4;
                        m.motivoDificuldade = "Erro na IA";
                    }
                    break;
                }
            }
        }
        
        if (chamouLlm || erroSemCreditos !== undefined) {
            const usage: LlmUsage[] = [{
                model: MARITACA_MODELS.CLASSIFICACAO,
                prompt_tokens: promptTokensAcc,
                completion_tokens: completionTokensAcc,
                total_tokens: totalTokensAcc || (promptTokensAcc + completionTokensAcc),
            }];
            logAiUsage({
                endpoint: "planejamento-gerar-plano-dificuldade",
                durationMs: Date.now() - inicio,
                success: !houveErro,
                requestExcerpt: `${materiasComNome.length} materias`,
                usage,
                erro: erroSemCreditos,
            });
        }

        await Promise.all(updatePromises);
        logger.info("Avaliação de dificuldade concluída e salva no banco.");
    }
}
