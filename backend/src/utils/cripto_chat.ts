/**
 * Criptografia de aplicação das conversas da Darcy (`chat_items.item` e
 * `chat_sessions.memoria`) — AES-256-GCM com chave só no `.env` do backend.
 *
 * O disco do Supabase já é criptografado, mas isso não protege de quem tem
 * acesso ao BANCO: um dump, ou a service_role vazada (ver
 * documentacao/incidente_seguranca_2026-09-04.md), lê tudo em claro. Cifrando
 * aqui, o banco guarda só texto opaco: ler a conversa exige também a chave do
 * backend. GCM autentica — conteúdo adulterado no banco falha ao decifrar em vez
 * de virar texto plantado no prompt.
 *
 * Formato: `enc:v1:<base64(iv[12] | tag[16] | cifrado)>`. A versão permite
 * trocar de chave depois. Sem `CHAT_ENCRYPTION_KEY` (dev local, testes), grava
 * em claro e avisa; a leitura aceita os dois formatos, então linhas antigas em
 * claro continuam legíveis depois de ligar a chave.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIXO = "enc:v1:";
const ALGORITMO = "aes-256-gcm";

let avisouSemChave = false;

/** Chave de 32 bytes do `.env` (base64 ou hex), ou `null` se não configurada. */
function chave(): Buffer | null {
    const bruta = process.env.CHAT_ENCRYPTION_KEY?.trim();
    if (!bruta) {
        if (!avisouSemChave) {
            avisouSemChave = true;
            const nivel = process.env.NODE_ENV === "production" ? "error" : "warn";
            console[nivel]("[cripto_chat] CHAT_ENCRYPTION_KEY ausente — conversas da Darcy gravadas em claro.");
        }
        return null;
    }
    const buf = /^[0-9a-f]{64}$/i.test(bruta) ? Buffer.from(bruta, "hex") : Buffer.from(bruta, "base64");
    if (buf.length !== 32) {
        throw new Error("CHAT_ENCRYPTION_KEY precisa ter 32 bytes (base64 ou 64 caracteres hex).");
    }
    return buf;
}

export function estaCifrado(valor: unknown): valor is string {
    return typeof valor === "string" && valor.startsWith(PREFIXO);
}

/** Cifra um texto. Sem chave configurada, devolve o próprio texto. */
export function cifrarTexto(texto: string): string {
    const k = chave();
    if (!k) return texto;
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITMO, k, iv);
    const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
    return PREFIXO + Buffer.concat([iv, cipher.getAuthTag(), cifrado]).toString("base64");
}

/**
 * Decifra um texto do formato `enc:v1:`; texto em claro (linha antiga) passa
 * direto. Lança se o conteúdo foi adulterado ou se a chave não é a que cifrou.
 */
export function decifrarTexto(valor: string): string {
    if (!estaCifrado(valor)) return valor;
    const k = chave();
    if (!k) throw new Error("Conteúdo cifrado, mas CHAT_ENCRYPTION_KEY não está configurada.");
    const bruto = Buffer.from(valor.slice(PREFIXO.length), "base64");
    const decipher = createDecipheriv(ALGORITMO, k, bruto.subarray(0, 12));
    decipher.setAuthTag(bruto.subarray(12, 28));
    return Buffer.concat([decipher.update(bruto.subarray(28)), decipher.final()]).toString("utf8");
}

/** Item da sessão (`AgentInputItem`) → o que vai para a coluna jsonb. */
export function cifrarItem<T>(item: T): T | { enc: string } {
    const texto = cifrarTexto(JSON.stringify(item));
    return estaCifrado(texto) ? { enc: texto } : item;
}

/** Inverso de `cifrarItem`; item em claro (linha antiga) passa direto. */
export function decifrarItem<T = any>(salvo: unknown): T {
    const enc = (salvo as { enc?: unknown } | null)?.enc;
    if (estaCifrado(enc)) return JSON.parse(decifrarTexto(enc)) as T;
    return salvo as T;
}
