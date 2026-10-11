/**
 * Mock de src/utils/ia_acesso para testes de rota que não são sobre login/cota:
 * todo mundo está logado e tem pergunta sobrando. Uso:
 *
 *   jest.mock("../src/utils/ia_acesso", () =>
 *       require("./utils/ia_acesso_liberado").iaAcessoLiberado());
 *
 * Os testes de login/cota ficam em darcy-login-cota.test.ts.
 */

export const USUARIO_TESTE = { id: "00000000-0000-0000-0000-0000000000aa", email: "aluno@unb.br" };
export const COTA_TESTE = { usadas: 1, limite: 30, restantes: 29, renova_em: "2026-09-30T03:00:00.000Z" };

export function iaAcessoLiberado() {
    const actual = jest.requireActual("../../src/utils/ia_acesso");
    const pergunta = () => ({
        usuario: USUARIO_TESTE,
        perguntaId: "pergunta-teste",
        cota: COTA_TESTE,
        estornar: jest.fn(async () => {}),
        clienteSaiu: () => false,
    });
    return {
        ...actual,
        autenticarUsuarioIA: jest.fn(async () => USUARIO_TESTE),
        exigirLoginIA: jest.fn(async () => USUARIO_TESTE),
        reservarPerguntaIA: jest.fn(async () => pergunta()),
        abrirPerguntaIA: jest.fn(async () => pergunta()),
    };
}
