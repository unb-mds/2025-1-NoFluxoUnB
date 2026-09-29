/**
 * public.casar_disciplinas (RPC do upload de histórico) rodando em PGlite com o
 * schema de produção: baseline exportado + migration do pré-mortem de 27/09/2026.
 *
 * Cada cenário insere o catálogo mínimo numa transação, chama a função e desfaz.
 * Os cenários espelham os que o pré-mortem usou para reproduzir os bugs, agora
 * esperando o resultado certo.
 */

import { Job, rodarCenarios, rodarNoBanco } from "./pglite_supabase";

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

/** ENGSOFT 6360/2 com MAT0025 (obrigatória) e OPT0001 (optativa) + o SQL extra. */
function engsoft(extra = ""): string {
    return `
      INSERT INTO cursos (id_curso, nome_curso, tipo_curso, turno) VALUES
        (6360, 'ENGENHARIA DE SOFTWARE', 'Bacharelado', 'DIURNO'), (1000, 'FISICA', 'Licenciatura', 'NOTURNO');
      INSERT INTO matrizes (id_matriz, id_curso, versao, ano_vigor, curriculo_completo) VALUES
        (2, 6360, '2', '2024.1', '6360/2 - 2024.1');
      INSERT INTO materias (id_materia, nome_materia, codigo_materia, carga_horaria) VALUES
        (20, 'CALCULO 1', 'MAT0025', 60), (21, 'OPTATIVA', 'OPT0001', 60),
        (30, 'A', 'AAA0001', 60), (31, 'B', 'BBB0001', 60), (32, 'FISICA', 'FIS9999', 60);
      INSERT INTO materias_por_curso (id_materia, nivel, id_matriz, tipo_natureza) VALUES
        (20, 1, 2, 0), (21, 0, 2, 1);
      ${extra}
    `;
}

function engsoftAluno(extra: string, historico: Json[]): Job {
    return casar(engsoft(extra), {
        curso_extraido: "ENGENHARIA DE SOFTWARE",
        matriz_curricular: "6360/2 - 2024.1",
        extracted_data: historico,
    });
}

function avalia(logica: unknown, texto: string | null, cursadas: string[]): Job {
    return {
        query: "SELECT public.avalia_equivalencia($1::jsonb, $2, $3::text[]) AS r",
        params: [JSON.stringify(logica), texto, cursadas],
    };
}

/** ENGSOFT 6360/1 (antiga) e 6360/2 (atual), cada uma com uma obrigatória e uma optativa
 *  próprias, e as equivalências antiga → atual das duas. */
const ENGSOFT_DUAS_MATRIZES = `
  INSERT INTO cursos (id_curso, nome_curso, tipo_curso, turno) VALUES (6360, 'ENGENHARIA DE SOFTWARE', 'Bacharelado', 'DIURNO');
  INSERT INTO matrizes (id_matriz, id_curso, versao, ano_vigor, curriculo_completo) VALUES
    (1, 6360, '1', '2017.1', '6360/1 - 2017.1'), (2, 6360, '2', '2024.1', '6360/2 - 2024.1');
  INSERT INTO materias (id_materia, nome_materia, codigo_materia, carga_horaria) VALUES
    (10, 'OBRIGATORIA ANTIGA', 'OLD0001', 60), (11, 'OPTATIVA ANTIGA', 'OPT0001', 60),
    (20, 'OBRIGATORIA NOVA', 'NEW0001', 60), (21, 'OPTATIVA NOVA', 'OPT0002', 60);
  INSERT INTO materias_por_curso (id_materia, nivel, id_matriz, tipo_natureza) VALUES
    (10, 1, 1, 0), (11, 0, 1, 1), (20, 1, 2, 0), (21, 0, 2, 1);
  INSERT INTO equivalencias (id_materia, expressao_original) VALUES (20, '(OLD0001)'), (21, '(OPT0001)');
`;

const EQ_A_E_B_TEXTO = `INSERT INTO equivalencias (id_materia, expressao_original) VALUES (20, '(AAA0001 E BBB0001)');`;

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

    // R6 — equivalência "A E B"
    r6_texto_so_a: engsoftAluno(EQ_A_E_B_TEXTO, [disc("AAA0001", "A")]),
    r6_texto_a_e_b: engsoftAluno(EQ_A_E_B_TEXTO, [disc("AAA0001", "A"), disc("BBB0001", "B")]),
    r6_logica_so_a: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, expressao_original, expressao_logica) VALUES
           (20, '(AAA0001 E BBB0001)', '{"operador":"E","condicoes":["AAA0001","BBB0001"]}');`,
        [disc("AAA0001", "A")]
    ),
    r6_ou_um_basta: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, expressao_original, expressao_logica) VALUES
           (20, '(AAA0001 OU BBB0001)', '{"operador":"OU","condicoes":["AAA0001","BBB0001"]}');`,
        [disc("BBB0001", "B")]
    ),
    r6_optativa_parte_de_e: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, expressao_original) VALUES (20, '(OPT0001 E AAA0001)');`,
        [disc("OPT0001", "OPTATIVA")]
    ),
    r6_optativa_integraliza: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, expressao_original) VALUES (20, '(OPT0001)');`,
        [disc("OPT0001", "OPTATIVA")]
    ),

    // R7 — equivalências de outro curso / fora de vigência
    r7_outro_curso: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, id_curso, curriculo, data_vigencia, expressao_original)
           VALUES (20, 1000, '1000/1', '2010-01-01', '(FIS9999)');`,
        [disc("FIS9999", "FISICA")]
    ),
    r7_mesmo_curso: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, id_curso, expressao_original) VALUES (20, 6360, '(FIS9999)');`,
        [disc("FIS9999", "FISICA")]
    ),
    r7_mesmo_curriculo: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, id_curso, curriculo, expressao_original)
           VALUES (20, 6360, '6360/2 - 2024.1', '(FIS9999)');`,
        [disc("FIS9999", "FISICA")]
    ),
    r7_especifica_sombreia_global: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, id_curso, curriculo, expressao_original) VALUES
           (20, NULL, NULL, '(AAA0001)'), (20, 6360, '6360/2 - 2024.1', '(BBB0001)');`,
        [disc("AAA0001", "A")]
    ),
    r7_vigencia_futura: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, data_vigencia, expressao_original)
           VALUES (20, current_date + 30, '(FIS9999)');`,
        [disc("FIS9999", "FISICA")]
    ),
    r7_vigencia_passada: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, data_vigencia, expressao_original)
           VALUES (20, current_date - 30, '(FIS9999)');`,
        [disc("FIS9999", "FISICA")]
    ),

    // R15 — currículo novo x antigo do mesmo curso
    r15_outra_matriz: casar(
        `
      INSERT INTO cursos (id_curso, nome_curso, tipo_curso, turno) VALUES (6360, 'ENGENHARIA DE SOFTWARE', 'Bacharelado', 'DIURNO');
      INSERT INTO matrizes (id_matriz, id_curso, versao, ano_vigor, curriculo_completo) VALUES
        (1, 6360, '1', '2017.1', '6360/1 - 2017.1'), (2, 6360, '2', '2024.1', '6360/2 - 2024.1');
      INSERT INTO materias (id_materia, nome_materia, codigo_materia, carga_horaria) VALUES
        (10, 'DISCIPLINA SO DO CURRICULO ANTIGO', 'OLD0001', 60),
        (20, 'DISCIPLINA NOVA A', 'NEW0001', 60), (21, 'DISCIPLINA NOVA B', 'NEW0002', 60);
      INSERT INTO materias_por_curso (id_materia, nivel, id_matriz, tipo_natureza) VALUES
        (10, 1, 1, 0), (20, 1, 2, 0), (21, 2, 2, 0);
    `,
        {
            curso_extraido: "ENGENHARIA DE SOFTWARE",
            matriz_curricular: "6360/2 - 2024.1",
            extracted_data: [disc("OLD0001", "DISCIPLINA SO DO CURRICULO ANTIGO"), disc("NEW0002", "DISCIPLINA NOVA B")],
        }
    ),

    r15_optativa_antiga_equivalente: casar(ENGSOFT_DUAS_MATRIZES, {
        curso_extraido: "ENGENHARIA DE SOFTWARE",
        matriz_curricular: "6360/2 - 2024.1",
        extracted_data: [disc("OPT0001", "OPTATIVA ANTIGA")],
    }),
    r15_obrigatoria_antiga_equivalente: casar(ENGSOFT_DUAS_MATRIZES, {
        curso_extraido: "ENGENHARIA DE SOFTWARE",
        matriz_curricular: "6360/2 - 2024.1",
        extracted_data: [disc("OLD0001", "OBRIGATORIA ANTIGA")],
    }),

    // R17 — obrigatória reprovada/em curso + equivalente aprovada
    r17_rep_optativa_equivalente: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, expressao_original) VALUES (20, '(OPT0001)');`,
        [disc("MAT0025", "CALCULO 1", "REP"), disc("OPT0001", "OPTATIVA")]
    ),
    r17_matr_equivalente_fora_da_matriz: engsoftAluno(
        `INSERT INTO equivalencias (id_materia, expressao_original) VALUES (20, '(FIS9999)');`,
        [disc("MAT0025", "CALCULO 1", "MATR"), disc("FIS9999", "FISICA")]
    ),
    r17_rep_sem_equivalencia: engsoftAluno("", [disc("MAT0025", "CALCULO 1", "REP")]),
    r17_rep_equivalencia_incompleta: engsoftAluno(EQ_A_E_B_TEXTO, [
        disc("MAT0025", "CALCULO 1", "REP"),
        disc("AAA0001", "A"),
    ]),

    // R6 — paridade de avalia_equivalencia com frontend/src/lib/utils/expressao-logica.ts
    av_codigo_unico: avalia("CIC0004", null, ["CIC0004"]),
    av_e_parcial: avalia({ operador: "E", condicoes: ["FGA0001", "FGA0002"] }, null, ["FGA0001"]),
    av_e_completo: avalia({ operador: "E", condicoes: ["FGA0001", "FGA0002"] }, null, ["FGA0001", "FGA0002"]),
    av_aninhado: avalia(
        { operador: "OU", condicoes: [{ operador: "E", condicoes: ["AAA0001", "BBB0002"] }, "CCC0003"] },
        null,
        ["CCC0003"]
    ),
    av_legado_e: avalia({ materias: ["MAT0001", "MAT0002"], operador: "E" }, null, ["MAT0001"]),
    av_legado_ou: avalia({ materias: ["MAT0001", "MAT0002"], operador: "OU" }, null, ["MAT0002"]),
    av_vazio_cai_no_texto: avalia({}, "( ( MAT0001 E MAT0002 ) OU MAT0003 )", ["MAT0003"]),
    av_texto_precedencia: avalia({}, "MAT0001 OU MAT0002 E MAT0003", ["MAT0002"]),
    av_texto_malformado: avalia({}, "( MAT0001 E", ["MAT0001"]),
    av_nada: avalia({}, null, ["MAT0001"]),
};

let resultado: ReturnType<typeof rodarCenarios<keyof typeof CENARIOS>>;

beforeAll(() => {
    resultado = rodarCenarios(MIGRATIONS, CENARIOS);
}, 180_000);

const codigos = (arr: Json[]) => arr.map((m) => m.codigo).sort();

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

describe("R6 — equivalência avaliada inteira", () => {
    it("'(A E B)' com só A NÃO integraliza a obrigatória", () => {
        const out = r("r6_texto_so_a");
        expect(codigos(out.materias_concluidas)).toEqual([]);
        expect(codigos(out.materias_pendentes)).toEqual(["MAT0025"]);
        expect(out.resumo.percentual_conclusao_obrigatorias).toBe(0);
    });

    it("'(A E B)' com A e B integraliza como concluida_equivalencia", () => {
        const out = r("r6_texto_a_e_b");
        expect(out.materias_concluidas).toHaveLength(1);
        expect(out.materias_concluidas[0]).toMatchObject({
            codigo: "MAT0025",
            status_fluxograma: "concluida_equivalencia",
        });
        expect(["AAA0001", "BBB0001"]).toContain(out.materias_concluidas[0].codigo_equivalente);
        expect(out.materias_pendentes).toEqual([]);
    });

    it("expressao_logica recursiva com E também exige todas as condições", () => {
        const out = r("r6_logica_so_a");
        expect(out.materias_concluidas).toEqual([]);
        expect(codigos(out.materias_pendentes)).toEqual(["MAT0025"]);
    });

    it("regressão: com OU, uma das disciplinas basta", () => {
        const out = r("r6_ou_um_basta");
        expect(out.materias_concluidas).toHaveLength(1);
        expect(out.materias_concluidas[0]).toMatchObject({
            codigo: "MAT0025",
            status_fluxograma: "concluida_equivalencia",
            codigo_equivalente: "BBB0001",
        });
    });

    it("optativa que é só parte de um 'E' continua optativa e não integraliza nada", () => {
        const out = r("r6_optativa_parte_de_e");
        expect(out.materias_concluidas).toEqual([]);
        expect(codigos(out.materias_optativas)).toEqual(["OPT0001"]);
    });

    it("optativa que integraliza a obrigatória sozinha sai de materias_optativas (não conta duas vezes)", () => {
        const out = r("r6_optativa_integraliza");
        expect(out.materias_concluidas).toHaveLength(1);
        expect(out.materias_concluidas[0]).toMatchObject({ codigo: "MAT0025", codigo_equivalente: "OPT0001" });
        expect(out.materias_optativas).toEqual([]);
        expect(out.resumo.total_optativas).toBe(0);
    });

    it.each([
        ["av_codigo_unico", true],
        ["av_e_parcial", false],
        ["av_e_completo", true],
        ["av_aninhado", true],
        ["av_legado_e", false],
        ["av_legado_ou", true],
        ["av_vazio_cai_no_texto", true],
        ["av_texto_precedencia", false],
        ["av_texto_malformado", false],
        ["av_nada", false],
    ] as const)("avalia_equivalencia: %s → %s", (nome, esperado) => {
        expect(r(nome)).toBe(esperado);
    });
});

describe("R7 — equivalências do curso/currículo do aluno", () => {
    it("equivalência específica de OUTRO curso não integraliza a obrigatória", () => {
        const out = r("r7_outro_curso");
        expect(out.materias_concluidas).toEqual([]);
        expect(codigos(out.materias_pendentes)).toEqual(["MAT0025"]);
        expect(out.resumo.percentual_conclusao_obrigatorias).toBe(0);
    });

    it.each(["r7_mesmo_curso", "r7_mesmo_curriculo", "r7_vigencia_passada"] as const)(
        "%s: integraliza por equivalência",
        (nome) => {
            const out = r(nome);
            expect(out.materias_concluidas).toHaveLength(1);
            expect(out.materias_concluidas[0]).toMatchObject({
                codigo: "MAT0025",
                status_fluxograma: "concluida_equivalencia",
                codigo_equivalente: "FIS9999",
            });
        }
    );

    it("linha do curso+currículo tem precedência sobre a global (igual ao front)", () => {
        expect(r("r7_especifica_sombreia_global").materias_concluidas).toEqual([]);
    });

    it("equivalência com data_vigencia futura ainda não vale", () => {
        const out = r("r7_vigencia_futura");
        expect(out.materias_concluidas).toEqual([]);
        expect(codigos(out.materias_pendentes)).toEqual(["MAT0025"]);
    });
});

describe("R15 — disciplina de outra matriz do curso", () => {
    it("não conta como obrigatória da matriz do aluno nem infla o total", () => {
        const out = r("r15_outra_matriz");
        expect(out.matriz_curricular).toBe("6360/2 - 2024.1");
        expect(codigos(out.materias_concluidas)).toEqual(["NEW0002"]);
        expect(codigos(out.materias_pendentes)).toEqual(["NEW0001"]);
        expect(out.resumo.total_obrigatorias).toBe(2);
        expect(out.resumo.percentual_conclusao_obrigatorias).toBe(50);
        const old = out.disciplinas_casadas.find((d: Json) => d.codigo === "OLD0001");
        expect(old).toMatchObject({ tipo: "outra_matriz", encontrada_no_banco: true });
        // nem vira optativa (inflaria a CH optativa)
        expect(out.materias_optativas).toEqual([]);
    });
});

describe("R15 — disciplina de outra matriz com equivalência na matriz atual", () => {
    it("optativa da matriz antiga equivalente a optativa da atual continua contando como optativa", () => {
        const out = r("r15_optativa_antiga_equivalente");
        expect(out.resumo.total_optativas).toBe(1);
        expect(codigos(out.materias_optativas)).toEqual(["OPT0002"]);
        expect(out.materias_optativas[0].status_fluxograma).toBe("concluida");
        const casada = out.disciplinas_casadas.find((d: Json) => d.codigo_historico === "OPT0001");
        expect(casada).toMatchObject({ tipo: "optativa", codigo_materia: "OPT0002" });
        // e não vira obrigatória
        expect(out.materias_concluidas).toEqual([]);
        expect(out.resumo.total_obrigatorias).toBe(1);
    });

    it("regressão: obrigatória antiga equivalente integraliza a atual uma vez só", () => {
        const out = r("r15_obrigatoria_antiga_equivalente");
        expect(out.materias_concluidas).toHaveLength(1);
        expect(out.materias_concluidas[0]).toMatchObject({
            codigo: "NEW0001",
            status_fluxograma: "concluida_equivalencia",
            codigo_equivalente: "OLD0001",
        });
        expect(out.materias_pendentes).toEqual([]);
        expect(out.materias_optativas).toEqual([]);
        expect(out.resumo).toMatchObject({ total_obrigatorias: 1, percentual_conclusao_obrigatorias: 100 });
    });
});

describe("R17 — obrigatória reprovada + equivalente aprovada", () => {
    it("REP da obrigatória + optativa equivalente APR: integraliza por equivalência, sem duplicar", () => {
        const out = r("r17_rep_optativa_equivalente");
        expect(out.materias_concluidas).toHaveLength(1);
        expect(out.materias_concluidas[0]).toMatchObject({
            codigo: "MAT0025",
            status_fluxograma: "concluida_equivalencia",
            codigo_equivalente: "OPT0001",
        });
        expect(out.materias_pendentes).toEqual([]);
        expect(out.materias_optativas).toEqual([]);
        expect(out.resumo).toMatchObject({
            total_obrigatorias: 1,
            total_obrigatorias_concluidas: 1,
            total_obrigatorias_pendentes: 0,
            percentual_conclusao_obrigatorias: 100,
        });
    });

    it("MATR da obrigatória + equivalente APR fora da matriz: integraliza", () => {
        const out = r("r17_matr_equivalente_fora_da_matriz");
        expect(codigos(out.materias_concluidas)).toEqual(["MAT0025"]);
        expect(out.materias_concluidas[0].codigo_equivalente).toBe("FIS9999");
        expect(out.materias_pendentes).toEqual([]);
        expect(out.resumo.total_obrigatorias).toBe(1);
    });

    it("regressão: REP sem equivalência continua pendente, uma vez só", () => {
        const out = r("r17_rep_sem_equivalencia");
        expect(out.materias_pendentes).toHaveLength(1);
        expect(out.materias_pendentes[0]).toMatchObject({ codigo: "MAT0025", status_fluxograma: "pendente" });
        expect(out.resumo.total_obrigatorias).toBe(1);
    });

    it("REP + equivalência 'A E B' incompleta continua pendente, uma vez só", () => {
        const out = r("r17_rep_equivalencia_incompleta");
        expect(out.materias_concluidas).toEqual([]);
        expect(out.materias_pendentes).toHaveLength(1);
        expect(out.resumo.total_obrigatorias).toBe(1);
    });
});

describe("R5 — retry do COURSE_SELECTION (uploadStore.retryWithSelectedCourse)", () => {
    // O que o extrator devolve quando o PDF não traz o ano da matriz.
    const extraido = {
        curso_extraido: "PEDAGOGIA",
        matriz_curricular: "8117/-2",
        extracted_data: [disc("PED0001", "X")],
    };

    /** Payload que o store monta depois do clique no modal (mesmos campos, mesma origem). */
    function retry(escolhida: Json, comMatriz = true): Json {
        return {
            ...extraido,
            curso_extraido: escolhida.nome_curso,
            curso_selecionado: escolhida.nome_curso,
            id_curso_selecionado: escolhida.id_curso,
            ...(comMatriz && { matriz_selecionada: escolhida.matriz_curricular }),
        };
    }

    const chamar = (payload: Json) => rodarNoBanco(MIGRATIONS, [casar(PEDAGOGIA_DOIS_ANOS_MESMA_VERSAO, payload)])[0];
    const saida = (res: ReturnType<typeof chamar>): Json => {
        if (res.rows === undefined) throw new Error(res.error);
        return res.rows[0].r;
    };

    let opcoes: Json[];

    beforeAll(() => {
        const primeira = saida(chamar(extraido));
        expect(primeira.type).toBe("COURSE_SELECTION");
        opcoes = primeira.cursos_disponiveis;
        expect(opcoes.map((c) => c.matriz_curricular)).toEqual(["8117/-2 - 2018.2", "8117/-2 - 2020.1"]);
    }, 180_000);

    it.each([0, 1])("2ª chamada com a matriz escolhida (opção %i) devolve o resultado daquela matriz", (i) => {
        const out = saida(chamar(retry(opcoes[i])));
        expect(out.type).toBeUndefined();
        expect(out.error).toBeUndefined();
        expect(out.matriz_curricular).toBe(opcoes[i].matriz_curricular);
        expect(codigos(out.materias_concluidas)).toEqual(["PED0001"]);
    }, 180_000);

    it("bundle antigo (só id_curso_selecionado, sem matriz_selecionada) não fica em loop: resolve a matriz mais recente", () => {
        const out = saida(chamar(retry(opcoes[0], false)));
        expect(out.type).toBeUndefined();
        expect(out.matriz_curricular).toBe("8117/-2 - 2020.1");
    }, 180_000);
});
