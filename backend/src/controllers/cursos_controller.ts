import { EndpointController, RequestType } from "../interfaces";
import { Pair } from "../utils";
import { Request, Response } from "express";
import { SupabaseWrapper } from "../supabase_wrapper";
import { createControllerLogger } from '../utils/controller_logger';


export const CursosController: EndpointController = {
    name: "cursos",
    routes: {
        "all-cursos": new Pair(RequestType.GET, async (_req: Request, res: Response) => {
            const logger = createControllerLogger("CursosController", "all-cursos");
            logger.info(`Buscando todos os cursos`);

            const cursos = await SupabaseWrapper.get().from("cursos").select("*");

            if (cursos.error) {
                logger.error(`Erro ao buscar cursos: ${cursos.error.message}`);
                return res.status(500).json({ error: cursos.error.message });
            }

            // get creditos por curso
            const creditosPorCurso = await SupabaseWrapper.get().from("creditos_por_curso").select("*");

            if (creditosPorCurso.error) {
                logger.error(`Erro ao buscar creditos por curso: ${creditosPorCurso.error.message}`);
                return res.status(500).json({ error: creditosPorCurso.error.message });
            }

            const creditosPorIdCurso: { [key: number]: number } = {};

            logger.info(`Creditos por curso: ${JSON.stringify(creditosPorCurso.data).substring(0, 300)}`);

            for (const credito of creditosPorCurso.data) {
                creditosPorIdCurso[credito.id_curso] = credito.creditos_obrigatorios;
            }

            logger.info(`Creditos por id curso: ${JSON.stringify(creditosPorIdCurso).substring(0, 300)}`);

            for (const curso of cursos.data) {
                curso.creditos = creditosPorIdCurso[curso.id_curso];
            }

            logger.info(`Cursos com creditos: ${JSON.stringify(cursos.data).substring(0, 300)}`);

            return res.status(200).json(cursos.data);
        }),

    }
}