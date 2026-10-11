/**
 * Criptografia das conversas da Darcy (`utils/cripto_chat.ts`): o banco guarda
 * só texto opaco, adulteração é detectada, e linhas antigas em claro continuam
 * legíveis depois de ligar a chave.
 */

import { randomBytes } from "crypto";
import {
    cifrarItem,
    cifrarTexto,
    decifrarItem,
    decifrarTexto,
    estaCifrado,
} from "../src/utils/cripto_chat";
import { decifrarLinhas } from "../src/services/chat/supabase_session";

const CHAVE = randomBytes(32).toString("base64");
const original = process.env.CHAT_ENCRYPTION_KEY;

beforeEach(() => {
    process.env.CHAT_ENCRYPTION_KEY = CHAVE;
});
afterAll(() => {
    if (original === undefined) delete process.env.CHAT_ENCRYPTION_KEY;
    else process.env.CHAT_ENCRYPTION_KEY = original;
});

describe("cripto_chat", () => {
    it("cifra e decifra; o texto cifrado não contém o original e muda a cada vez (IV aleatório)", () => {
        const a = cifrarTexto("trabalho à tarde no estágio");
        const b = cifrarTexto("trabalho à tarde no estágio");

        expect(estaCifrado(a)).toBe(true);
        expect(a).not.toContain("estágio");
        expect(a).not.toBe(b);
        expect(decifrarTexto(a)).toBe("trabalho à tarde no estágio");
    });

    it("item da sessão vira { enc } opaco e volta igual", () => {
        const item = { role: "user", content: "quero me formar em 2027" };

        const salvo = cifrarItem(item) as { enc: string };

        expect(Object.keys(salvo)).toEqual(["enc"]);
        expect(JSON.stringify(salvo)).not.toContain("2027");
        expect(decifrarItem(salvo)).toEqual(item);
    });

    it("conteúdo adulterado no banco falha ao decifrar (GCM autentica)", () => {
        const c = cifrarTexto("- prefere manhã");
        const bytes = Buffer.from(c.slice("enc:v1:".length), "base64");
        bytes[bytes.length - 1] ^= 0xff;
        const adulterado = "enc:v1:" + bytes.toString("base64");

        expect(() => decifrarTexto(adulterado)).toThrow();
    });

    it("chave errada não decifra", () => {
        const c = cifrarTexto("segredo");
        process.env.CHAT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
        expect(() => decifrarTexto(c)).toThrow();
    });

    it("linha antiga em claro continua legível depois de ligar a chave", () => {
        const antigo = { role: "assistant", content: "resposta de antes da chave" };
        expect(decifrarItem(antigo)).toEqual(antigo);
        expect(decifrarTexto("- memória antiga")).toBe("- memória antiga");
    });

    it("sem chave grava em claro (dev/testes) em vez de quebrar o chat", () => {
        delete process.env.CHAT_ENCRYPTION_KEY;
        expect(cifrarTexto("oi")).toBe("oi");
        expect(cifrarItem({ a: 1 })).toEqual({ a: 1 });
    });

    it("chave de tamanho errado é recusada", () => {
        process.env.CHAT_ENCRYPTION_KEY = Buffer.from("curta").toString("base64");
        expect(() => cifrarTexto("x")).toThrow(/32 bytes/);
    });

    it("ao ler a sessão, a linha adulterada é descartada e as outras seguem", () => {
        const boa = { id: 1, item: cifrarItem({ role: "user", content: "ok" }) };
        const ruim = { id: 2, item: { enc: "enc:v1:" + randomBytes(40).toString("base64") } };

        const lidas = decifrarLinhas([boa, ruim]);

        expect(lidas.map((l) => l.id)).toEqual([1]);
        expect(lidas[0].item).toEqual({ role: "user", content: "ok" });
    });
});
