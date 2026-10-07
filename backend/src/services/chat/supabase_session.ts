/**
 * SupabaseSession — Fase 1 do orquestrador de chat (docs/chatbot-orquestrador.md).
 *
 * Implementa a interface `Session` do @openai/agents sobre duas tabelas do Supabase:
 *   - chat_sessions: uma linha por sessão (session_id = uuid do usuário, uma sessão
 *     contínua por aluno — ver docs/chatbot-orquestrador.md)
 *   - chat_items: log append-only dos AgentInputItem da sessão, em ordem de created_at
 *
 * Sem estado em memória entre instâncias — uma instância nova com o mesmo session_id
 * sempre reconstrói o histórico a partir do banco (é isso que faz a sessão sobreviver
 * a reinício do processo).
 */

import type { AgentInputItem } from "@openai/agents";
import type { Session } from "@openai/agents";
import { SupabaseWrapper } from "../../supabase_wrapper";

/** Quantos itens da sessão entram em cada `run` (o perfil do aluno já cobre o que é estável). */
export const JANELA_PADRAO_ITENS = 30;

export interface MensagemVisivel {
    role: "user" | "assistant";
    content: string;
}

function textoDoItem(item: any): string {
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

function ehMensagemDoUsuario(item: any): boolean {
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
export function aparaInicioDaJanela(itens: AgentInputItem[]): AgentInputItem[] {
    const inicio = itens.findIndex(ehMensagemDoUsuario);
    return inicio <= 0 ? (inicio === 0 ? itens : []) : itens.slice(inicio);
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

export class SupabaseSession implements Session {
    constructor(
        private readonly sessionId: string,
        private readonly janela: number = JANELA_PADRAO_ITENS
    ) {}

    async getSessionId(): Promise<string> {
        const { data: existente, error: erroBusca } = await SupabaseWrapper.get()
            .from("chat_sessions")
            .select("session_id")
            .eq("session_id", this.sessionId)
            .maybeSingle();

        if (erroBusca) {
            throw new Error(`Falha ao buscar sessão ${this.sessionId}: ${erroBusca.message}`);
        }
        if (existente?.session_id) {
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
     * Últimos itens da sessão, em ordem cronológica. Sem `limit` explícito vale a
     * janela da instância — antes carregava a sessão inteira e o prompt crescia sem
     * limite. A janela é aparada para começar numa mensagem do aluno.
     */
    async getItems(limit?: number): Promise<AgentInputItem[]> {
        if (limit === undefined) {
            return aparaInicioDaJanela(await this.carregarRecentes(this.janela));
        }
        return this.carregarRecentes(limit);
    }

    /** Conversa visível para as telas (`GET /chat/historico`), últimas `max` mensagens. */
    async listarMensagensVisiveis(max: number = 50): Promise<MensagemVisivel[]> {
        // Cada mensagem visível pode vir acompanhada de várias de tool; lê folgado.
        const itens = aparaInicioDaJanela(await this.carregarRecentes(max * 6));
        return mensagensVisiveis(itens).slice(-max);
    }

    private async carregarRecentes(limit?: number): Promise<AgentInputItem[]> {
        await this.getSessionId();

        let query = SupabaseWrapper.get()
            .from("chat_items")
            .select("item, created_at")
            .eq("session_id", this.sessionId)
            .order("created_at", { ascending: !limit });

        if (limit) {
            query = query.limit(limit);
        }

        const { data, error } = await query;
        if (error) {
            throw new Error(`Falha ao carregar histórico da sessão ${this.sessionId}: ${error.message}`);
        }

        const linhas = (data ?? []) as Array<{ item: AgentInputItem }>;
        const itens = linhas.map((linha) => linha.item);
        // Quando limitado, a ordenação acima é decrescente (pega os N mais recentes) —
        // a interface exige devolver em ordem cronológica, então reverte de volta.
        return limit ? itens.reverse() : itens;
    }

    async addItems(items: AgentInputItem[]): Promise<void> {
        if (items.length === 0) return;

        await this.getSessionId();

        const linhas = items.map((item) => ({ session_id: this.sessionId, item }));
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
            .order("created_at", { ascending: false })
            .limit(1);

        if (error) {
            throw new Error(`Falha ao ler último item da sessão ${this.sessionId}: ${error.message}`);
        }
        const linhas = (data ?? []) as Array<{ id: number; item: AgentInputItem }>;
        if (linhas.length === 0) return undefined;

        const [ultimo] = linhas;
        await SupabaseWrapper.get().from("chat_items").delete().eq("id", ultimo.id);
        return ultimo.item;
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
            .order("created_at", { ascending: false })
            .limit(20);
        if (error) {
            throw new Error(`Falha ao ler a última resposta da sessão ${this.sessionId}: ${error.message}`);
        }
        const linhas = (data ?? []) as Array<{ id: number; item: any }>;
        const alvo = linhas.find((l) => ehMensagemDaDarcy(l.item));
        if (!alvo) return false;

        const item = { ...alvo.item };
        item.content = Array.isArray(item.content)
            ? [{ type: "output_text", text: texto }]
            : texto;
        const { error: erroUpdate } = await SupabaseWrapper.get()
            .from("chat_items")
            .update({ item })
            .eq("id", alvo.id);
        if (erroUpdate) {
            throw new Error(`Falha ao atualizar a resposta da sessão ${this.sessionId}: ${erroUpdate.message}`);
        }
        return true;
    }

    async clearSession(): Promise<void> {
        await SupabaseWrapper.get().from("chat_items").delete().eq("session_id", this.sessionId);
    }
}
