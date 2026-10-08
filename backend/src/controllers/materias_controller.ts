import { EndpointController, RequestType } from "../interfaces";
import { Pair } from "../utils";
import { Request, Response } from "express";
import { SupabaseWrapper } from "../supabase_wrapper";
import { createControllerLogger } from '../utils/controller_logger';


export const MateriasController: EndpointController = {
    name: "materias",
    routes: {
        "materias-name-by-code": new Pair(RequestType.GET, async (req: Request, res: Response) => {
            const logger = createControllerLogger("MateriasController", "materias-name-by-code");
            logger.info(`Buscando nome das matérias por código`);

            // get all materias names for the codes
            const { codes } = req.body;

            if (!codes) {
                logger.error("Códigos não informados");
                return res.status(400).json({ error: "Códigos não informados" });
            }

            const materias = await SupabaseWrapper.get().from("materias").select("*").in("codigo_materia", codes);

            if (materias.error) {
                logger.error(`Erro ao buscar matérias: ${materias.error.message}`);
                return res.status(500).json({ error: materias.error.message });
            }

            return res.status(200).json(materias.data);
        }),
        "materias-from-codigos": new Pair(RequestType.POST, async (req: Request, res: Response) => {
            const logger = createControllerLogger("FluxogramaController", "materias-from-codigos");
            logger.info("Buscando matérias por códigos");

            let { codigos, id_curso } = req.body;

            if (!codigos) {
                logger.error("Códigos de matérias não informados");
                return res.status(400).json({ error: "Códigos de matérias não informados" });
            }

            if (!id_curso) {
                logger.error("ID do curso não informado");
                return res.status(400).json({ error: "ID do curso não informado" });
            }

            if (!Array.isArray(codigos)) {

                if (typeof codigos === 'string') {
                    // convert from json string to array
                    codigos = JSON.parse(codigos);
                } else {
                    logger.error("Códigos de matérias não são um array");
                    return res.status(400).json({ error: "Códigos de matérias não são um array" });
                }
            }

            if (typeof id_curso !== 'string') {
                const numberAsId = parseInt(id_curso);

                if (isNaN(numberAsId)) {
                    logger.error("ID do curso não é um número");
                    return res.status(400).json({ error: "ID do curso não é um número" });
                }

                id_curso = numberAsId;
            }

            let { data: materias, error: errorMaterias } = await SupabaseWrapper.get()
                .from("materias")
                .select("*,materias_por_curso(id_curso,nivel)")
                .in("codigo_materia", codigos);

            if (errorMaterias) {
                logger.error(`Erro ao buscar matérias: ${errorMaterias.message}`);
                return res.status(500).json({ error: errorMaterias.message });
            }

            logger.info(`Materias encontradas: ${materias?.length}`);

            logger.info(`ID do curso: ${id_curso}`);


            // save the nivel of the materia in relation to the curso
            materias = materias?.map((materia: any) => {
                materia.nivel = materia.materias_por_curso.find((curso: any) => curso.id_curso == id_curso)?.nivel;
                delete materia.materias_por_curso;
                return materia;
            }) ?? [];

            logger.info("Primeira materia: " + JSON.stringify(materias?.[0]));


            return res.status(200).json(materias);
        }),

    }
}