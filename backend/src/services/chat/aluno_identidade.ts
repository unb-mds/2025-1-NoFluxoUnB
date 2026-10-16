/**
 * Identidade do aluno no pipeline da Darcy.
 *
 * O token do Supabase Auth traz o e-mail; as tabelas acadêmicas usam o `id_user`
 * legado (bigint de `users`). Esta resolução estava copiada em três atuadores —
 * mora aqui agora, num lugar só.
 */

import { SupabaseWrapper } from "../../supabase_wrapper";

/** `users.id_user` do e-mail informado, ou `null` se não houver cadastro. */
export async function resolveIdUserPorEmail(email: string): Promise<string | null> {
    if (!email) return null;
    const { data, error } = await SupabaseWrapper.get()
        .from("users")
        .select("id_user")
        .eq("email", email)
        .maybeSingle();
    if (error || !data?.id_user) return null;
    return String(data.id_user);
}
