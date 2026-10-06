/**
 * Comando direto `/turmas COD` responde do banco, sem LLM.
 *
 * Dado de produção (29/09/2026): 204 linhas de planejamento-chat em setembro
 * com model='desconhecido', 0 tokens e ~960ms — eram cliques em "Ver turmas de"
 * (starter do Plano de Formatura) que passavam pelo atalho sem LLM e mesmo
 * assim viravam "uso de IA". Agora o resultado vem marcado com `semLlm` e os
 * controllers não logam nem gastam cota (ver darcy-login-cota.test.ts).
 */

var mockConsultarTurmas = jest.fn();
jest.mock("../src/services/agente/tools/materia_tools", () => ({
    ...jest.requireActual("../src/services/agente/tools/materia_tools"),
    consultarTurmasMateria: (...a: unknown[]) => mockConsultarTurmas(...a),
}));

import {
    ehComandoDireto,
    PlanejadorAgenteService,
    type AgenteContexto,
} from "../src/services/planejador_agente.service";

const ctx = { restricoes: { adiar: [] } } as unknown as AgenteContexto;

describe("ehComandoDireto", () => {
    it.each([
        ["/turmas MAT0025", true],
        ["  /TURMAS mat0025", true],
        ["quais as turmas de MAT0025?", false],
        ["/turmas", false],
    ])("%s → %s", (texto, esperado) => {
        expect(ehComandoDireto([{ role: "user", content: texto }])).toBe(esperado);
    });

    it("olha só a última mensagem do aluno", () => {
        expect(
            ehComandoDireto([
                { role: "user", content: "/turmas MAT0025" },
                { role: "assistant", content: "..." },
                { role: "user", content: "e as optativas?" },
            ])
        ).toBe(false);
    });
});

describe("PlanejadorAgenteService.conversar com /turmas", () => {
    it("responde sem chamar o LLM e marca semLlm", async () => {
        mockConsultarTurmas.mockResolvedValue(
            JSON.stringify({ codigo: "MAT0025", nome_materia: "CALCULO 1", turmas_recentes: ["[TURMA|01|...]"] })
        );
        const llm = jest.fn();
        const r = await new PlanejadorAgenteService(llm).conversar([{ role: "user", content: "/turmas MAT0025" }], ctx);

        expect(llm).not.toHaveBeenCalled();
        expect(r.semLlm).toBe(true);
        expect(r.usage).toEqual([]);
    });

    it("pergunta normal chama o LLM e não é semLlm", async () => {
        const llm = jest.fn().mockResolvedValue({ role: "assistant", content: "oi" });
        const r = await new PlanejadorAgenteService(llm).conversar([{ role: "user", content: "oi" }], ctx);
        expect(llm).toHaveBeenCalledTimes(1);
        expect(r.semLlm).toBeFalsy();
    });
});

describe("resposta da Maritaca sem `usage`", () => {
    const fetchOriginal = global.fetch;
    afterEach(() => {
        global.fetch = fetchOriginal;
        delete process.env.MARITACA_API_KEY;
    });

    it("registra a chamada com o modelo certo em vez de sumir", async () => {
        process.env.MARITACA_API_KEY = "fake";
        global.fetch = jest.fn().mockResolvedValue(
            new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "oi" } }] }), { status: 200 })
        ) as unknown as typeof fetch;

        const r = await new PlanejadorAgenteService().conversar([{ role: "user", content: "oi" }], ctx);
        expect(r.usage).toEqual([{ model: "sabia-4", prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }]);
    });
});
