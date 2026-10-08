/**
 * Testes para o Agente Planejador — Tools e loop de conversa.
 *
 * Cobre:
 *   - Executores das 4 tools (consultar, simular, ajustar, mover)
 *   - Loop de tool calling com guardrails
 *   - Truncagem de histórico
 *   - Integração com LLM mockado
 */

import {
    executarTool,
    PlanejadorAgenteService,
    type AgenteContexto,
    type LlmMessage,
    type MensagemChat,
} from "../src/services/planejador_agente.service";
import type { MateriaInput } from "../src/types/planejamento";

// ========== Fixtures ==========

function mat(codigo: string, nivel: number): MateriaInput {
    return {
        codigo,
        nome: codigo,
        creditos: 4,
        carga_horaria: 60,
        nivel,
        obrigatoria: true,
        tipo_natureza: 0,
        preRequisitos: null,
        coRequisitos: null,
    };
}

function ctxBase(): AgenteContexto {
    return {
        materias: [
            mat("AAA0001", 1),
            mat("BBB0002", 1),
            mat("CCC0003", 2),
        ],
        cargaHorariaIntegralizada: { total: 600, obrigatoria: 600, optativa: 0, complementar: 0 },
        exigidaMatriz: { total: 2400, obrigatoria: 1620, optativa: 600, complementar: 210 },
        fluxogramaAtual: null,
        idUser: "user123",
        idCurso: "8117",
        numeroPeriodo: 3,
        preferencias: {
            limiteCreditos: 24,
            objetivo: "equilibrado",
            trabalha: false,
        },
        restricoes: { adiar: [], priorizar: [], limitesPersonalizados: {}, adicionar: [], adicionarEm: {} },
        codigosComOferta: new Set(["AAA0001", "BBB0002", "CCC0003"]),
    };
}

function respostaFinal(texto: string): LlmMessage {
    return { role: "assistant", content: texto };
}

function respostaComTool(
    nome: string,
    args: Record<string, any>,
    id = "call_1"
): LlmMessage {
    return {
        role: "assistant",
        content: null,
        tool_calls: [
            {
                id,
                function: { name: nome, arguments: JSON.stringify(args) },
            },
        ],
    };
}

// ========== Testes dos Executores (Task 3) ==========

describe("planejador_agente — Executores de Tools", () => {
    test("executarTool desconhecida retorna erro", async () => {
        const ctx = ctxBase();
        const r = await executarTool("ferramenta_inexistente", {}, ctx);
        const parsed = JSON.parse(r.resultado);
        expect(parsed.erro).toContain("desconhecida");
    });

    test("consultar_plano sem código retorna resumo", async () => {
        const ctx = ctxBase();
        const r = await executarTool("consultar_plano", {}, ctx);
        const parsed = JSON.parse(r.resultado);
        expect(parsed.semestresRestantes).toBeGreaterThan(0);
        expect(parsed.materiasNaoAlocadas).toBeDefined();
    });

    test("consultar_plano expõe creditosRestantesTotais autoritativo", async () => {
        const ctx = ctxBase();
        const r = await executarTool("consultar_plano", {}, ctx);
        const parsed = JSON.parse(r.resultado);
        // Degree audit: (exigidaMatriz.total 2400 - integralizada.total 600) / 15 = 120
        expect(parsed.creditosRestantesTotais).toBe(120);
        expect(parsed.chRestanteTotalHoras).toBe(1800);
    });

    test("consultar_plano com código inválido retorna erro", async () => {
        const ctx = ctxBase();
        const r = await executarTool("consultar_plano", { codigo: "ZZZZZ000" }, ctx);
        const parsed = JSON.parse(r.resultado);
        expect(parsed.erro).toContain("não encontrada");
    });

    test("simular_cenario com mudança de carga retorna antes e depois", async () => {
        const ctx = ctxBase();
        const r = await executarTool(
            "simular_cenario",
            { limiteCreditos: 16 },
            ctx
        );
        const parsed = JSON.parse(r.resultado);
        expect(parsed.antes).toBeDefined();
        expect(parsed.depois).toBeDefined();
        expect(parsed.deltaSemestres).toBeDefined();
        // Semestre posterior não foi afetado — contexto é cópia
        expect(ctx.preferencias.limiteCreditos).toBe(24);
    });

    test("ajustar_carga rejeita limite inválido", async () => {
        const ctx = ctxBase();
        const r = await executarTool(
            "ajustar_carga",
            { limiteCreditos: 5 },
            ctx
        );
        const parsed = JSON.parse(r.resultado);
        expect(parsed.erro).toContain("8 e 32");
    });

    test("ajustar_carga com limite válido retorna plano e atualiza contexto", async () => {
        const ctx = ctxBase();
        const r = await executarTool(
            "ajustar_carga",
            { limiteCreditos: 16, objetivo: "velocidade" },
            ctx
        );
        expect(r.planoAtualizado).toBeDefined();
        expect(ctx.preferencias.limiteCreditos).toBe(16);
        expect(ctx.preferencias.objetivo).toBe("velocidade");
    });

    test("mover_materia com acao inválida retorna erro", async () => {
        const ctx = ctxBase();
        const r = await executarTool(
            "mover_materia",
            { codigo: "AAA0001", acao: "ignorar" },
            ctx
        );
        const parsed = JSON.parse(r.resultado);
        expect(parsed.erro).toContain("acao");
    });

    test("mover_materia adiar funciona e atualiza contexto", async () => {
        const ctx = ctxBase();
        const r = await executarTool(
            "mover_materia",
            { codigo: "aaa0001", acao: "adiar" },
            ctx
        );
        expect(r.planoAtualizado).toBeDefined();
        expect(ctx.restricoes.adiar).toContain("AAA0001");
        expect(ctx.restricoes.priorizar).not.toContain("AAA0001");
    });

    test("mover_materia priorizar funciona", async () => {
        const ctx = ctxBase();
        await executarTool("mover_materia", { codigo: "AAA0001", acao: "adiar" }, ctx);
        expect(ctx.restricoes.adiar).toContain("AAA0001");
        // Remover restrição
        await executarTool(
            "mover_materia",
            { codigo: "AAA0001", acao: "remover_restricao" },
            ctx
        );
        expect(ctx.restricoes.adiar).not.toContain("AAA0001");
        expect(ctx.restricoes.priorizar).not.toContain("AAA0001");
    });

    test("mover_materia com código inexistente retorna erro", async () => {
        const ctx = ctxBase();
        const r = await executarTool(
            "mover_materia",
            { codigo: "ZZZ9999", acao: "adiar" },
            ctx
        );
        const parsed = JSON.parse(r.resultado);
        expect(parsed.erro).toContain("não está entre");
    });
});

// ========== Testes do Loop (Task 4) ==========

describe("planejador_agente — Loop de Conversa", () => {
    test("resposta direta sem tool call", async () => {
        const svc = new PlanejadorAgenteService(
            async () => respostaFinal("Olá! Posso ajudar.")
        );
        const r = await svc.conversar(
            [{ role: "user", content: "oi" }],
            ctxBase()
        );
        expect(r.reply).toBe("Olá! Posso ajudar.");
        expect(r.plano).toBeUndefined();
    });

    test("tool de leitura não devolve plano; tool de escrita devolve", async () => {
        const respostas: LlmMessage[] = [
            respostaComTool("consultar_plano", {}),
            respostaFinal("Seu plano resumido."),
        ];
        let i = 0;
        const svc = new PlanejadorAgenteService(
            async () => respostas[i++]
        );
        const r = await svc.conversar(
            [{ role: "user", content: "resume meu plano" }],
            ctxBase()
        );
        expect(r.reply).toBe("Seu plano resumido.");
        expect(r.plano).toBeUndefined(); // Consultar não muda plano
    });

    test("tool de escrita (ajustar_carga) devolve plano atualizado", async () => {
        const respostas: LlmMessage[] = [
            respostaComTool("ajustar_carga", { limiteCreditos: 16 }),
            respostaFinal("Ajustei sua carga."),
        ];
        let i = 0;
        const svc = new PlanejadorAgenteService(async () => respostas[i++]);
        const r = await svc.conversar(
            [{ role: "user", content: "reduz pra 16 creditos" }],
            ctxBase()
        );
        expect(r.reply).toBe("Ajustei sua carga.");
        expect(r.plano).toBeDefined();
    });

    test("mensagem tool com resultado é enviada de volta ao LLM", async () => {
        const capturadas: any[][] = [];
        const respostas: LlmMessage[] = [
            respostaComTool("consultar_plano", {}),
            respostaFinal("Seu plano tem X semestres."),
        ];
        let i = 0;
        const svc = new PlanejadorAgenteService(async (messages) => {
            capturadas.push([...messages]);
            return respostas[i++];
        });
        await svc.conversar(
            [{ role: "user", content: "resume meu plano" }],
            ctxBase()
        );
        const ultimaChamada = capturadas[1];
        const toolMsg = ultimaChamada.find((m) => m.role === "tool");
        expect(toolMsg).toBeDefined();
        const toolContent = JSON.parse(toolMsg.content);
        expect(toolContent.semestresRestantes).toBeGreaterThan(0);
    });

    test("guard-rail: para após 5 iterações de tool calls", async () => {
        let chamadas = 0;
        const svc = new PlanejadorAgenteService(async () => {
            chamadas++;
            return respostaComTool("consultar_plano", {}, `call_${chamadas}`);
        });
        const r = await svc.conversar(
            [{ role: "user", content: "loop infinito" }],
            ctxBase()
        );
        expect(chamadas).toBe(5); // Máx 5 iterações
        expect(r.reply).toContain("5 tentativas");
    });

    test("histórico é truncado nas últimas 20 mensagens", async () => {
        let recebidas: any[] = [];
        const svc = new PlanejadorAgenteService(async (messages) => {
            recebidas = messages;
            return respostaFinal("ok");
        });
        const historico: MensagemChat[] = Array.from({ length: 30 }, (_, i) => ({
            role: (i % 2 === 0 ? "user" : "assistant") as
                | "user"
                | "assistant",
            content: `msg ${i}`,
        }));
        await svc.conversar(historico, ctxBase());
        // 1 system + 20 do histórico
        const naoSystem = recebidas.filter((m) => m.role !== "system");
        expect(naoSystem).toHaveLength(20);
    });

    test("isAvailable retorna false sem MARITACA_API_KEY", () => {
        const oldKey = process.env.MARITACA_API_KEY;
        delete process.env.MARITACA_API_KEY;
        const svc = new PlanejadorAgenteService();
        expect(svc.isAvailable()).toBe(false);
        if (oldKey) process.env.MARITACA_API_KEY = oldKey;
    });

    test("múltiplas tool calls em sequência", async () => {
        const respostas: LlmMessage[] = [
            respostaComTool("consultar_plano", {}),
            respostaComTool("ajustar_carga", { limiteCreditos: 20 }),
            respostaFinal("Pronto!"),
        ];
        let i = 0;
        const svc = new PlanejadorAgenteService(async () => respostas[i++]);
        const ctx = ctxBase();
        const r = await svc.conversar(
            [{ role: "user", content: "primeiro consulta depois ajusta" }],
            ctx
        );
        expect(r.reply).toBe("Pronto!");
        expect(r.plano).toBeDefined();
        expect(ctx.preferencias.limiteCreditos).toBe(20);
    });
});

describe("planejador_agente — uso parcial quando a conversa falha", () => {
    const fetchOriginal = global.fetch;
    const keyOriginal = process.env.MARITACA_API_KEY;
    afterEach(() => {
        global.fetch = fetchOriginal;
        process.env.MARITACA_API_KEY = keyOriginal;
    });

    test("erro na 3ª chamada à Maritaca leva junto o usage das duas já pagas", async () => {
        const { usageParcialDoErro } = await import("../src/utils/ai_usage_logger");
        process.env.MARITACA_API_KEY = "test-key";
        const ok = (message: LlmMessage, usage: Record<string, number>) =>
            new globalThis.Response(JSON.stringify({ choices: [{ message }], usage }), { status: 200 });
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce(ok(respostaComTool("consultar_plano", {}, "c1"), { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 }))
            .mockResolvedValueOnce(ok(respostaComTool("consultar_plano", {}, "c2"), { prompt_tokens: 1200, completion_tokens: 30 }))
            .mockResolvedValueOnce(new globalThis.Response("upstream error", { status: 500 })) as any;

        const svc = new PlanejadorAgenteService();
        const erro = await svc
            .conversar([{ role: "user", content: "como está meu plano?" }], ctxBase())
            .then(() => null, (e: unknown) => e);

        expect(erro).toBeInstanceOf(Error);
        expect((erro as Error).message).toMatch(/Maritaca API error: 500/);
        expect(usageParcialDoErro(erro)).toEqual([
            { model: "sabia-4", prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
            { model: "sabia-4", prompt_tokens: 1200, completion_tokens: 30, total_tokens: 1230 },
        ]);
    });

    test("uma conversa nova não herda o parcial da anterior", async () => {
        const { usageParcialDoErro } = await import("../src/utils/ai_usage_logger");
        process.env.MARITACA_API_KEY = "test-key";
        global.fetch = jest.fn().mockResolvedValue(new globalThis.Response("x", { status: 500 })) as any;
        const svc = new PlanejadorAgenteService();
        const e1 = await svc.conversar([{ role: "user", content: "a" }], ctxBase()).catch((e) => e);
        const e2 = await svc.conversar([{ role: "user", content: "b" }], ctxBase()).catch((e) => e);
        expect(usageParcialDoErro(e1)).toEqual([]);
        expect(usageParcialDoErro(e2)).toEqual([]);
    });
});
