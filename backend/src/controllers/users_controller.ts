import { EndpointController, RequestType } from "../interfaces";
import { Pair, Utils } from "../utils";
import { Request, Response } from "express";
import { SupabaseWrapper } from "../supabase_wrapper";
import { createControllerLogger } from '../utils/controller_logger';

// O backend opera com a service_role key (bypassa RLS), então TODA rota aqui
// precisa amarrar a operação ao usuário autenticado do token — nunca a
// email/ids vindos de body/query, que o cliente controla livremente.

async function criarUsuario(routeName: string, req: Request, res: Response) {
    const logger = createControllerLogger("UsersController", routeName);

    const authUser = await Utils.getAuthenticatedUser(req);
    if (!authUser || !authUser.email) {
        logger.error("Token de autenticação ausente ou inválido");
        return res.status(401).json({ error: "Não autorizado" });
    }

    const { nome_completo } = req.body;
    if (!nome_completo) {
        logger.error("Nome completo é obrigatório");
        return res.status(400).json({ error: "Nome completo é obrigatório" });
    }

    // Email vem SEMPRE do token autenticado, nunca do body.
    const email = authUser.email;
    logger.info(`Registrando usuário autenticado: ${email}`);

    // A linha nasce amarrada ao auth_id do token: é por ele que o frontend busca
    // o perfil, e é ele que tem UNIQUE no banco (users_auth_id_key). Sem auth_id
    // o UNIQUE não barrava nada (NULLs são distintos) e duas requisições
    // concorrentes criavam duas linhas (pré-mortem 27/09/2026, R22).
    let { data: userExistsResult, error: userExistsError } = await SupabaseWrapper.get().from("users").select("id_user").eq("auth_id", authUser.id);

    if (!userExistsError && (!userExistsResult || userExistsResult.length === 0)) {
        // Linhas antigas foram criadas sem auth_id: o email ainda identifica
        // o cadastro legado e evita uma segunda linha para a mesma pessoa.
        ({ data: userExistsResult, error: userExistsError } = await SupabaseWrapper.get().from("users").select("id_user").eq("email", email));
    }

    if (userExistsError) {
        logger.error(`Erro ao buscar usuário: ${JSON.stringify(userExistsError)}`);
        return res.status(500).json({ error: "Erro ao buscar usuário" });
    }

    if (userExistsResult && userExistsResult.length > 0) {
        logger.error("Usuário já cadastrado");
        return res.status(409).json({ error: "Usuário já cadastrado" });
    }

    const { data: userCreatedResult, error: userCreatedError } = await SupabaseWrapper.get().from("users").insert({
        auth_id: authUser.id,
        email,
        nome_completo
    }).select("*").single();

    // Corrida entre o SELECT e o INSERT: o UNIQUE de auth_id barra a segunda.
    if (userCreatedError?.code === "23505") {
        logger.error("Usuário já cadastrado (violação de UNIQUE no insert)");
        return res.status(409).json({ error: "Usuário já cadastrado" });
    }

    if (userCreatedError) {
        logger.error(`Erro ao criar usuário: ${JSON.stringify(userCreatedError)}`);
        return res.status(500).json({ error: "Erro ao criar usuário" });
    }

    logger.info(`Usuário criado com sucesso: ${email}`);
    return res.status(200).json(userCreatedResult);
}

export const UsersController: EndpointController = {
    name: "users",
    routes: {
        "register-user-with-google": new Pair(RequestType.POST, async (req: Request, res: Response) => {
            return criarUsuario("register-user-with-google", req, res);
        }),

        "get-user-by-email": new Pair(RequestType.GET, async (req: Request, res: Response) => {
            const logger = createControllerLogger("UsersController", "get-user-by-email");

            const authUser = await Utils.getAuthenticatedUser(req);
            if (!authUser || !authUser.email) {
                logger.error("Token de autenticação ausente ou inválido");
                return res.status(401).json({ error: "Não autorizado" });
            }

            const { email } = req.query;
            if (!email) {
                logger.error("Email é obrigatório");
                return res.status(400).json({ error: "Email é obrigatório" });
            }

            // Só permite consultar o próprio perfil (anti-IDOR).
            if (email !== authUser.email) {
                logger.error(`Usuário ${authUser.email} tentou acessar perfil de outro email`);
                return res.status(403).json({ error: "Acesso negado" });
            }

            const { data: userResult, error: userError } = await SupabaseWrapper.get().from("users").select("*,dados_users(*)").eq("email", email);

            if (userError) {
                logger.error(`Erro ao buscar usuário: ${JSON.stringify(userError)}`);
                return res.status(500).json({ error: "Erro ao buscar usuário" });
            }

            if (userResult && userResult.length > 0) {
                return res.status(200).json(userResult[0]);
            }

            return res.status(404).json({ error: "Usuário não encontrado" });
        }),
        "registrar-user-with-email": new Pair(RequestType.POST, async (req: Request, res: Response) => {
            return criarUsuario("registrar-user-with-email", req, res);
        })
    }
}
