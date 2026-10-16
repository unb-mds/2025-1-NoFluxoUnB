/**
 * SupabaseSession — Fase 1 do orquestrador de chat (docs/chatbot-orquestrador.md).
 *
 * Implementa a interface `Session` do @openai/agents sobre duas tabelas do Supabase:
 *   - chat_sessions: uma linha por sessão (session_id = uuid do usuário, uma sessão
 *     contínua por aluno — ver docs/chatbot-orquestrador.md)
 *   - chat_items: log append-only dos AgentInputItem da sessão, em ordem de id (serial)
 *
 * Conversa ativa = itens com `conversa_id` nulo. "Nova conversa" (ou inatividade, ver
 * `INATIVIDADE_ARQUIVAR_MS`) ARQUIVA esses itens numa linha de `chat_conversas` — o
 * aluno reabre, retoma ou apaga depois. Fora isso, só a retenção apaga: conversa
 * parada há 12 meses e sessão inativa há 2 anos (pg_cron, migration
 * 20261016000000_chat_retencao.sql).
 *
 * Sem estado em memória entre instâncias — uma instância nova com o mesmo session_id
 * sempre reconstrói o histórico a partir do banco (é isso que faz a sessão sobreviver
 * a reinício do processo).
 */

import type { AgentInputItem } from "@openai/agents";
import type { Session } from "@openai/agents";
import { SupabaseWrapper } from "../../supabase_wrapper";
import { cifrarItem, cifrarTexto, decifrarItem, decifrarTexto } from "../../utils/cripto_chat";

/**
 * Janela do prompt, em TURNOS (uma pergunta do aluno e tudo que veio até a
 * próxima). Contar itens fazia a janela encolher justo nas conversas com tool:
 * cada turno com tool são 4+ itens, e 30 itens viravam 5 ou 6 perguntas.
 */
export const TURNOS_NA_JANELA = 12;
/** Dos turnos da janela, os mais recentes vão inteiros (com as tools); os demais, só o texto que o aluno viu. */
export const TURNOS_COMPLETOS = 3;
/**
 * Conversa que ainda não virou memória (`memoria_ate`) continua na janela além
 * dos `TURNOS_NA_JANELA`, até este teto — senão ela não estaria em lugar nenhum
 * até a próxima consolidação.
 */
export const TETO_TURNOS_PENDENTES = 24;
/** Linhas lidas do banco para montar a janela (turno com tool ocupa várias). */
const LINHAS_LIDAS = 400;

/**
 * Sem falar com a Darcy por este tempo, a próxima abertura do chat começa uma
 * conversa nova (a anterior vai para "Conversas anteriores"). Evita a conversa
 * única que crescia por semanas; o contexto atravessa pela memória.
 */
export const INATIVIDADE_ARQUIVAR_MS = 6 * 60 * 60 * 1000;
/** Tamanho do título da conversa arquivada (a primeira pergunta do aluno). */
const TETO_TITULO = 80;

export interface ConversaArquivada {
    id: string;
    titulo: string;
    mensagens: number;
    inicio: string | null;
    fim: string | null;
}

export interface MensagemVisivel {
    role: "user" | "assistant";
    content: string;
}

export function textoDoItem(item: any): string {
    const c = item?.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
        return c
            .map((p: any) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : ""))
            .join("")
            .trim();
    }
    return "";
}

export function ehMensagemDoUsuario(item: any): boolean {
    return item?.role === "user" && (item?.type === undefined || item?.type === "message");
}

function ehMensagemDaDarcy(item: any): boolean {
    return item?.role === "assistant" && (item?.type === undefined || item?.type === "message");
}

/**
 * Corta o começo da janela até a primeira mensagem do aluno. Uma janela que começa
 * no meio de um turno deixaria um resultado de tool sem a chamada que o originou,
 * e o modelo recusa histórico assim.
 */
/**
 * Decifra as linhas lidas do banco (`cripto_chat.ts`). Linha que não decifra —
 * adulterada, ou cifrada com outra chave — fica de fora: perder um item do
 * histórico é melhor que derrubar o chat ou pôr conteúdo forjado no prompt.
 */
export function decifrarLinhas<L extends { item: unknown }>(linhas: L[]): Array<L & { item: any }> {
    const out: Array<L & { item: any }> = [];
    for (const linha of linhas) {
        try {
            out.push({ ...linha, item: decifrarItem(linha.item) });
        } catch {
            console.warn("[SupabaseSession] item da conversa não pôde ser decifrado — ignorado.");
        }
    }
    return out;
}

export function aparaInicioDaJanela(itens: AgentInputItem[]): AgentInputItem[] {
    const inicio = itens.findIndex(ehMensagemDoUsuario);
    return inicio <= 0 ? (inicio === 0 ? itens : []) : itens.slice(inicio);
}

/** Resultado de tool de turnos anteriores: o que a Darcy concluiu dele já está na resposta dela. */
export const TETO_RESULTADO_ANTIGO_CARACTERES = 600;
const MARCA_TRUNCADO = "… [resultado antigo resumido]";

function truncarTexto(texto: string, teto: number): string {
    return texto.length > teto ? `${texto.slice(0, teto).trimEnd()}${MARCA_TRUNCADO}` : texto;
}

/**
 * Encurta os resultados de tool que ficaram para trás (antes da última mensagem do
 * aluno). Eles pesam muito (turmas, integralização) e a resposta final de cada turno
 * já carrega o que importava; o turno atual segue inteiro. Só mexe no texto do
 * `output` — a chamada e o resultado continuam pareados, como o modelo exige.
 */
export function compactarResultadosAntigos(
    itens: AgentInputItem[],
    teto: number = TETO_RESULTADO_ANTIGO_CARACTERES
): AgentInputItem[] {
    let ultimoDoAluno = -1;
    for (let i = itens.length - 1; i >= 0; i--) {
        if (ehMensagemDoUsuario(itens[i])) {
            ultimoDoAluno = i;
            break;
        }
    }
    return itens.map((item: any, i) => {
        if (i >= ultimoDoAluno || item?.type !== "function_call_result") return item;
        const saida = item.output;
        if (typeof saida === "string") {
            return saida.length > teto ? { ...item, output: truncarTexto(saida, teto) } : item;
        }
        if (saida?.type === "text" && typeof saida.text === "string" && saida.text.length > teto) {
            return { ...item, output: { ...saida, text: truncarTexto(saida.text, teto) } };
        }
        return item;
    });
}

/**
 * Índice onde começam os últimos `n` turnos. Com menos de `n`, o primeiro turno
 * (o que vem antes da primeira mensagem do aluno fica de fora); sem nenhum, o fim.
 */
export function inicioDosUltimosTurnos(itens: unknown[], n: number): number {
    let vistos = 0;
    for (let i = itens.length - 1; i >= 0; i--) {
        if (ehMensagemDoUsuario(itens[i]) && ++vistos === n) return i;
    }
    const primeiro = itens.findIndex(ehMensagemDoUsuario);
    return primeiro === -1 ? itens.length : primeiro;
}

/**
 * O que o modelo vê da conversa: os `completos` últimos turnos inteiros (tool de
 * turno anterior encurtada) e, antes deles, só a pergunta e a resposta final de
 * cada turno — o fio da conversa sem o peso dos resultados de tool.
 */
export function montarJanela(itens: AgentInputItem[], completos: number = TURNOS_COMPLETOS): AgentInputItem[] {
    const corte = inicioDosUltimosTurnos(itens, completos);
    const resumidos: AgentInputItem[] = [];
    let resposta: AgentInputItem | null = null;
    const fecharTurno = () => {
        if (resposta) resumidos.push(resposta);
        resposta = null;
    };
    for (const item of itens.slice(0, corte)) {
        if (ehMensagemDoUsuario(item)) {
            fecharTurno();
            resumidos.push(item);
        } else if (ehMensagemDaDarcy(item) && textoDoItem(item)) {
            resposta = item;
        }
    }
    fecharTurno();
    return [...aparaInicioDaJanela(resumidos), ...compactarResultadosAntigos(itens.slice(corte))];
}

/**
 * Só o que o aluno viu: as mensagens dele e a resposta FINAL da Darcy de cada turno
 * (sem chamadas de tool nem textos intermediários antes de uma tool).
 */
export function mensagensVisiveis(itens: AgentInputItem[]): MensagemVisivel[] {
    const out: MensagemVisivel[] = [];
    let respostaPendente: string | null = null;
    const fecharTurno = () => {
        if (respostaPendente) out.push({ role: "assistant", content: respostaPendente });
        respostaPendente = null;
    };
    for (const item of itens) {
        if (ehMensagemDoUsuario(item)) {
            fecharTurno();
            const texto = textoDoItem(item);
            if (texto) out.push({ role: "user", content: texto });
        } else if (ehMensagemDaDarcy(item)) {
            const texto = textoDoItem(item);
            if (texto) respostaPendente = texto;
        }
    }
    fecharTurno();
    return out;
}

export function tituloDaConversa(mensagens: MensagemVisivel[]): string {
    const primeira = mensagens.find((m) => m.role === "user")?.content ?? "";
    const limpa = primeira.replace(/\s+/g, " ").trim();
    if (!limpa) return "Conversa";
    return limpa.length > TETO_TITULO ? `${limpa.slice(0, TETO_TITULO - 1).trimEnd()}…` : limpa;
}

function lerTitulo(valor: unknown): string {
    if (typeof valor !== "string" || !valor) return "Conversa";
    try {
        return decifrarTexto(valor) || "Conversa";
    } catch {
        return "Conversa";
    }
}

export class SupabaseSession implements Session {
    /** Último item já resumido na memória (`chat_sessions.memoria_ate`), lido junto com a sessão. */
    private cursorMemoria = 0;

    constructor(private readonly sessionId: string) {}

    async getSessionId(): Promise<string> {
        const { data: existente, error: erroBusca } = await SupabaseWrapper.get()
            .from("chat_sessions")
            .select("session_id, memoria_ate")
            .eq("session_id", this.sessionId)
            .maybeSingle();

        if (erroBusca) {
            throw new Error(`Falha ao buscar sessão ${this.sessionId}: ${erroBusca.message}`);
        }
        if (existente?.session_id) {
            this.cursorMemoria = Number(existente.memoria_ate ?? 0) || 0;
            return existente.session_id as string;
        }

        const { error: erroCriacao } = await SupabaseWrapper.get()
            .from("chat_sessions")
            .insert({ session_id: this.sessionId, user_id: this.sessionId });

        if (erroCriacao) {
            throw new Error(`Falha ao criar sessão ${this.sessionId}: ${erroCriacao.message}`);
        }
        return this.sessionId;
    }

    /**
     * O que entra no `run`, em ordem cronológica. Sem `limit` explícito é a janela
     * (`montarJanela`): os últimos `TURNOS_NA_JANELA` turnos e, se houver, a conversa
     * mais antiga que a memória ainda não resumiu (até `TETO_TURNOS_PENDENTES`) — o
     * que o aluno disse está sempre no prompt ou na memória, nunca fora dos dois.
     */
    async getItems(limit?: number): Promise<AgentInputItem[]> {
        if (limit !== undefined) return this.carregarRecentes(limit);

        const linhas = await this.carregarLinhas(LINHAS_LIDAS);
        const itens = linhas.map((l) => l.item as AgentInputItem);
        let inicio = inicioDosUltimosTurnos(itens, TURNOS_NA_JANELA);
        const naoResumido = linhas.findIndex((l) => l.id > this.cursorMemoria);
        if (naoResumido !== -1 && naoResumido < inicio) {
            inicio = Math.max(naoResumido, inicioDosUltimosTurnos(itens, TETO_TURNOS_PENDENTES));
        }
        return montarJanela(aparaInicioDaJanela(itens.slice(inicio)));
    }

    /** Conversa visível para as telas (`GET /chat/historico`), últimas `max` mensagens. */
    async listarMensagensVisiveis(max: number = 50): Promise<MensagemVisivel[]> {
        // Cada mensagem visível pode vir acompanhada de várias de tool; lê folgado.
        const itens = aparaInicioDaJanela(await this.carregarRecentes(max * 6));
        return mensagensVisiveis(itens).slice(-max);
    }

    private async carregarRecentes(limit?: number): Promise<AgentInputItem[]> {
        return (await this.carregarLinhas(limit)).map((linha) => linha.item as AgentInputItem);
    }

    /**
     * Linhas da conversa ativa em ordem cronológica (as `limit` mais recentes).
     * Ordena por `id`, não por `created_at`: os itens de um turno são gravados num
     * só insert e saem com o mesmo `created_at` — empatados, a chamada de tool e o
     * resultado dela podiam voltar fora de ordem.
     */
    private async carregarLinhas(limit?: number): Promise<Array<{ id: number; item: any }>> {
        await this.getSessionId();

        let query = SupabaseWrapper.get()
            .from("chat_items")
            .select("id, item")
            .eq("session_id", this.sessionId)
            .is("conversa_id", null)
            .order("id", { ascending: !limit });

        if (limit) {
            query = query.limit(limit);
        }

        const { data, error } = await query;
        if (error) {
            throw new Error(`Falha ao carregar histórico da sessão ${this.sessionId}: ${error.message}`);
        }

        const linhas = decifrarLinhas((data ?? []) as Array<{ id: number; item: unknown }>);
        // Quando limitado, a ordenação acima é decrescente (pega os N mais recentes) —
        // a interface exige devolver em ordem cronológica, então reverte de volta.
        return limit ? linhas.reverse() : linhas;
    }

    async addItems(items: AgentInputItem[]): Promise<void> {
        if (items.length === 0) return;

        await this.getSessionId();

        const linhas = items.map((item) => ({ session_id: this.sessionId, item: cifrarItem(item) }));
        const { error: erroInsercao } = await SupabaseWrapper.get().from("chat_items").insert(linhas);
        if (erroInsercao) {
            throw new Error(`Falha ao salvar mensagens da sessão ${this.sessionId}: ${erroInsercao.message}`);
        }

        await SupabaseWrapper.get()
            .from("chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("session_id", this.sessionId);
    }

    async popItem(): Promise<AgentInputItem | undefined> {
        const { data, error } = await SupabaseWrapper.get()
            .from("chat_items")
            .select("id, item")
            .eq("session_id", this.sessionId)
            .is("conversa_id", null)
            .order("id", { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(`Falha ao ler último item da sessão ${this.sessionId}: ${error.message}`);
        }
        const linhas = (data ?? []) as Array<{ id: number; item: unknown }>;
        if (linhas.length === 0) return undefined;

        const [ultimo] = linhas;
        await SupabaseWrapper.get().from("chat_items").delete().eq("id", ultimo.id);
        return decifrarLinhas([ultimo])[0]?.item as AgentInputItem | undefined;
    }

    /**
     * Troca o texto da última resposta da Darcy gravada pelo SDK. O `run` grava o
     * texto do modelo; quando o controller ajusta a resposta (marcador de grade
     * canônico), é o texto final que precisa ficar na sessão — tanto para o
     * `/chat/historico` mostrar o mesmo botão quanto para as próximas runs verem o
     * que o aluno viu. Devolve `false` se não achou resposta para trocar.
     */
    async substituirUltimaResposta(texto: string): Promise<boolean> {
        const { data, error } = await SupabaseWrapper.get()
            .from("chat_items")
            .select("id, item")
            .eq("session_id", this.sessionId)
            .is("conversa_id", null)
            .order("id", { ascending: false })
            .limit(20);
        if (error) {
            throw new Error(`Falha ao ler a última resposta da sessão ${this.sessionId}: ${error.message}`);
        }
        const linhas = decifrarLinhas((data ?? []) as Array<{ id: number; item: unknown }>);
        const alvo = linhas.find((l) => ehMensagemDaDarcy(l.item));
        if (!alvo) return false;

        const item = { ...alvo.item };
        item.content = Array.isArray(item.content)
            ? [{ type: "output_text", text: texto }]
            : texto;
        const { error: erroUpdate } = await SupabaseWrapper.get()
            .from("chat_items")
            .update({ item: cifrarItem(item) })
            .eq("id", alvo.id);
        if (erroUpdate) {
            throw new Error(`Falha ao atualizar a resposta da sessão ${this.sessionId}: ${erroUpdate.message}`);
        }
        return true;
    }

    /** "Esquecer tudo": apaga a conversa ativa E as arquivadas. */
    async clearSession(): Promise<void> {
        const supabase = SupabaseWrapper.get();
        await supabase.from("chat_conversas").delete().eq("session_id", this.sessionId);
        await supabase.from("chat_items").delete().eq("session_id", this.sessionId);
    }

    // -----------------------------------------------------------------------
    // Conversas anteriores
    // -----------------------------------------------------------------------

    /**
     * Arquiva a conversa ativa em `chat_conversas` e devolve o id dela — `null` se
     * não havia o que arquivar. A tela fica limpa; a conversa continua listada.
     */
    async arquivarConversa(): Promise<string | null> {
        const supabase = SupabaseWrapper.get();
        const { data, error } = await supabase
            .from("chat_items")
            .select("item, created_at")
            .eq("session_id", this.sessionId)
            .is("conversa_id", null)
            .order("id", { ascending: true })
            .limit(2000);
        if (error) throw new Error(`Falha ao ler a conversa da sessão ${this.sessionId}: ${error.message}`);
        const linhas = decifrarLinhas((data ?? []) as Array<{ item: unknown; created_at: string }>);
        if (linhas.length === 0) return null;

        const visiveis = mensagensVisiveis(linhas.map((l) => l.item as AgentInputItem));
        const { data: conversa, error: erroConversa } = await supabase
            .from("chat_conversas")
            .insert({
                session_id: this.sessionId,
                titulo: cifrarTexto(tituloDaConversa(visiveis)),
                mensagens: visiveis.length,
                inicio: linhas[0].created_at ?? null,
                fim: linhas[linhas.length - 1].created_at ?? null,
            })
            .select("id")
            .single();
        if (erroConversa || !conversa?.id) {
            throw new Error(
                `Falha ao arquivar a conversa da sessão ${this.sessionId}: ${erroConversa?.message ?? "sem id"}`
            );
        }
        const id = conversa.id as string;

        const { error: erroMover } = await supabase
            .from("chat_items")
            .update({ conversa_id: id })
            .eq("session_id", this.sessionId)
            .is("conversa_id", null);
        if (erroMover) throw new Error(`Falha ao arquivar os itens da sessão ${this.sessionId}: ${erroMover.message}`);
        return id;
    }

    /**
     * Arquiva a conversa ativa se o aluno não fala com a Darcy há `maxMs`.
     * Devolve se arquivou. Nunca lança — no pior caso a conversa só continua.
     */
    async arquivarSeInativa(maxMs: number = INATIVIDADE_ARQUIVAR_MS): Promise<boolean> {
        try {
            const { data } = await SupabaseWrapper.get()
                .from("chat_sessions")
                .select("updated_at")
                .eq("session_id", this.sessionId)
                .maybeSingle();
            const ultima = data?.updated_at ? Date.parse(String(data.updated_at)) : NaN;
            if (!Number.isFinite(ultima) || Date.now() - ultima < maxMs) return false;
            return (await this.arquivarConversa()) !== null;
        } catch {
            return false;
        }
    }

    /** Conversas arquivadas, da mais recente para a mais antiga. */
    async listarConversas(max: number = 30): Promise<ConversaArquivada[]> {
        const { data, error } = await SupabaseWrapper.get()
            .from("chat_conversas")
            .select("id, titulo, mensagens, inicio, fim")
            .eq("session_id", this.sessionId)
            .order("fim", { ascending: false })
            .limit(max);
        if (error) throw new Error(`Falha ao listar conversas da sessão ${this.sessionId}: ${error.message}`);
        return ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
            id: String(c.id),
            titulo: lerTitulo(c.titulo),
            mensagens: Number(c.mensagens ?? 0),
            inicio: (c.inicio as string | null) ?? null,
            fim: (c.fim as string | null) ?? null,
        }));
    }

    /** A conversa é deste aluno? (o id vem do cliente — nunca confiar nele sozinho) */
    private async ehMinha(conversaId: string): Promise<boolean> {
        const { data, error } = await SupabaseWrapper.get()
            .from("chat_conversas")
            .select("id")
            .eq("id", conversaId)
            .eq("session_id", this.sessionId)
            .maybeSingle();
        return !error && !!data;
    }

    /** Mensagens visíveis de uma conversa arquivada; `null` se não é deste aluno. */
    async mensagensDaConversa(conversaId: string): Promise<MensagemVisivel[] | null> {
        if (!(await this.ehMinha(conversaId))) return null;
        const { data, error } = await SupabaseWrapper.get()
            .from("chat_items")
            .select("item, created_at")
            .eq("session_id", this.sessionId)
            .eq("conversa_id", conversaId)
            .order("id", { ascending: true })
            .limit(2000);
        if (error) throw new Error(`Falha ao ler a conversa ${conversaId}: ${error.message}`);
        const itens = decifrarLinhas((data ?? []) as Array<{ item: unknown }>).map((l) => l.item as AgentInputItem);
        return mensagensVisiveis(itens);
    }

    /**
     * Volta a conversa arquivada a ser a ativa (a ativa de agora é arquivada antes).
     * Devolve `false` se a conversa não é deste aluno.
     */
    async retomarConversa(conversaId: string): Promise<boolean> {
        if (!(await this.ehMinha(conversaId))) return false;
        await this.arquivarConversa();
        const supabase = SupabaseWrapper.get();
        // Itens primeiro: apagar a linha da conversa antes levaria os itens junto (cascade).
        const { error } = await supabase
            .from("chat_items")
            .update({ conversa_id: null })
            .eq("session_id", this.sessionId)
            .eq("conversa_id", conversaId);
        if (error) throw new Error(`Falha ao retomar a conversa ${conversaId}: ${error.message}`);
        await supabase.from("chat_conversas").delete().eq("id", conversaId).eq("session_id", this.sessionId);
        // Retomar conta como atividade — senão a inatividade arquivaria de novo na hora.
        await supabase
            .from("chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("session_id", this.sessionId);
        return true;
    }

    /** Apaga uma conversa arquivada (e os itens dela, por cascade). */
    async apagarConversa(conversaId: string): Promise<boolean> {
        if (!(await this.ehMinha(conversaId))) return false;
        const { error } = await SupabaseWrapper.get()
            .from("chat_conversas")
            .delete()
            .eq("id", conversaId)
            .eq("session_id", this.sessionId);
        if (error) throw new Error(`Falha ao apagar a conversa ${conversaId}: ${error.message}`);
        return true;
    }
}
