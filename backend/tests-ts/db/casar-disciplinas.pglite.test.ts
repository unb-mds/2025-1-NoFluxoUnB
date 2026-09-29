/**
 * public.casar_disciplinas (RPC do upload de histórico) rodando em PGlite com o
 * schema de produção: baseline exportado + migration do pré-mortem de 27/09/2026.
 *
 * Cada cenário insere o catálogo mínimo numa transação, chama a função e desfaz.
 * Os cenários espelham os que o pré-mortem usou para reproduzir os bugs, agora
 * esperando o resultado certo.
 */

import { Job, rodarCenarios } from "./pglite_supabase";

const MIGRATIONS = ["20260928_casar_disciplinas_premortem.sql"];

type Json = Record<string, any>;

function disc(codigo: string, nome: string, status = "APR", ch = 60, prefixo = ""): Json {
    return {
        tipo_dado: "Disciplina Regular",
        codigo,
        nome,
        status,
        mencao: status === "APR" ? "MS" : "II",
        creditos: ch / 15,
        carga_horaria: ch,
        ano_periodo: "2024.1",
        prefixo,
        professor: "",
    };
}

function casar(catalogo: string, payload: Json): Job {
    return {
        setup: catalogo,
        query: "SELECT public.casar_disciplinas($1::jsonb) AS r",
        params: [JSON.stringify(payload)],
    };
}

// ── Catálogos ──────────────────────────────────────────────────────────────

const PEDAGOGIA = `
  INSERT INTO cursos (id_curso, nome_curso, tipo_curso, turno) VALUES
    (8150, 'PEDAGOGIA', 'Licenciatura', 'NOTURNO'), (8117, 'PEDAGOGIA', 'Licenciatura', 'DIURNO');
  INSERT INTO matrizes (id_matriz, id_curso, versao, ano_vigor, curriculo_completo) VALUES
    (1, 8150, '-2', '2018.2', '8150/-2 - 2018.2'),
    (2, 8117, '-2', '2018.2', '8117/-2 - 2018.2');
  INSERT INTO materias (id_materia, nome_materia, codigo_materia, carga_horaria) VALUES (20, 'X', 'PED0001', 60);
  INSERT INTO materias_por_curso (id_materia, nivel, id_matriz, tipo_natureza) VALUES (20, 1, 1, 0), (20, 1, 2, 0);
`;

const ENGENHARIA_E_ENGSOFT = `
  INSERT INTO cursos (id_curso, nome_curso, tipo_curso, turno) VALUES
    (100, 'ENGENHARIA', 'Bacharelado', 'DIURNO'), (6360, 'ENGENHARIA DE SOFTWARE', 'Bacharelado', 'DIURNO');
  INSERT INTO matrizes (id_matriz, id_curso, versao, ano_vigor, curriculo_completo) VALUES
    (1, 100, '1', '2020.1', '100/1 - 2020.1'), (2, 6360, '1', '2017.1', '6360/1 - 2017.1');
  INSERT INTO materias (id_materia, nome_materia, codigo_materia, carga_horaria) VALUES (20, 'X', 'FGA0001', 60);
  INSERT INTO materias_por_curso (id_materia, nivel, id_matriz, tipo_natureza) VALUES (20, 1, 1, 0), (20, 1, 2, 0);
`;

const PEDAGOGIA_DOIS_ANOS_MESMA_VERSAO = `
  INSERT INTO cursos (id_curso, nome_curso, tipo_curso, turno) VALUES (8117, 'PEDAGOGIA', 'Licenciatura', 'DIURNO');
  INSERT INTO matrizes (id_matriz, id_curso, versao, ano_vigor, curriculo_completo) VALUES
    (1, 8117, '-2', '2018.2', '8117/-2 - 2018.2'), (2, 8117, '-2', '2020.1', '8117/-2 - 2020.1');
  INSERT INTO materias (id_materia, nome_materia, codigo_materia, carga_horaria) VALUES (20, 'X', 'PED0001', 60);
  INSERT INTO materias_por_curso (id_materia, nivel, id_matriz, tipo_natureza) VALUES (20, 1, 1, 0), (20, 1, 2, 0);
`;

const CENARIOS = {
    r5_sem_ano: casar(PEDAGOGIA, {
        curso_extraido: "PEDAGOGIA",
        matriz_curricular: "8117/-2",
        extracted_data: [disc("PED0001", "X")],
    }),
    r5_like_nome: casar(ENGENHARIA_E_ENGSOFT, {
        curso_extraido: "ENGENHARIA",
        matriz_curricular: "6360/1",
        extracted_data: [disc("FGA0001", "X")],
    }),
    r5_empate_codigo_desconhecido: casar(PEDAGOGIA, {
        curso_extraido: "PEDAGOGIA",
        matriz_curricular: "9999/-2",
        extracted_data: [disc("PED0001", "X")],
    }),
    r5_empate_mesmo_curso: casar(PEDAGOGIA_DOIS_ANOS_MESMA_VERSAO, {
        curso_extraido: "PEDAGOGIA",
        matriz_curricular: "8117/-2",
        extracted_data: [disc("PED0001", "X")],
    }),
    r5_com_ano: casar(PEDAGOGIA, {
        curso_extraido: "PEDAGOGIA",
        matriz_curricular: "8150/-2 - 2018.2",
        extracted_data: [disc("PED0001", "X")],
    }),
};

let resultado: ReturnType<typeof rodarCenarios<keyof typeof CENARIOS>>;

beforeAll(() => {
    resultado = rodarCenarios(MIGRATIONS, CENARIOS);
}, 180_000);

function r(nome: keyof typeof CENARIOS): Json {
    const res = resultado(nome);
    if (res.rows === undefined) throw new Error(`${nome}: ${res.error}`);
    return res.rows[0].r;
}

describe("R5 — resolução de curso/matriz", () => {
    it("matriz sem ano ('8117/-2') resolve pelo código do currículo, não pela 1ª linha com a mesma versão", () => {
        const out = r("r5_sem_ano");
        expect(out.error).toBeUndefined();
        expect(out.matriz_curricular).toBe("8117/-2 - 2018.2");
    });

    it("nome de curso contido em outro (LIKE) não ganha do código do currículo", () => {
        const out = r("r5_like_nome");
        expect(out.error).toBeUndefined();
        expect(out.matriz_curricular).toBe("6360/1 - 2017.1");
    });

    it("empate de versão sem código que desempate devolve COURSE_SELECTION em vez de escolher uma", () => {
        const out = r("r5_empate_codigo_desconhecido");
        expect(out.type).toBe("COURSE_SELECTION");
        expect(out.cursos_disponiveis.map((c: Json) => c.matriz_curricular)).toEqual([
            "8117/-2 - 2018.2",
            "8150/-2 - 2018.2",
        ]);
    });

    it("mesma versão em dois anos do mesmo curso, PDF sem ano: COURSE_SELECTION", () => {
        expect(r("r5_empate_mesmo_curso").type).toBe("COURSE_SELECTION");
    });

    it("regressão: PDF com ano continua resolvendo pelo curriculo_completo exato", () => {
        expect(r("r5_com_ano").matriz_curricular).toBe("8150/-2 - 2018.2");
    });
});
