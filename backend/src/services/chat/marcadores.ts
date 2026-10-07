/**
 * Marcadores interativos que o chat do app desenha (contrato em
 * `docs/darcy-unificada.md`, seção "Ações no chat").
 *
 * O botão de grade não pode depender do modelo repassar o marcador certo: quando a
 * run calculou uma `opcaoGrade`, o marcador que vai ao aluno é gerado AQUI a partir
 * dela, e qualquer `[MONTAR_GRADE|...]` escrito pelo modelo sai do texto.
 */

import type { OpcaoGradeResumo } from "./actuators/grade_actuator";

const RE_MONTAR_GRADE = /\[MONTAR_GRADE\|[^\]]*\]/g;

/** `[MONTAR_GRADE|COD:ID,COD:ID]` — grade pronta, uma turma por matéria. */
export function marcadorGradePronta(opcao: OpcaoGradeResumo): string {
    const pares = opcao.selecao
        .filter((s) => s.codigo && Number.isInteger(s.idTurma) && s.idTurma > 0)
        .map((s) => `${s.codigo.trim().toUpperCase()}:${s.idTurma}`);
    return pares.length > 0 ? `[MONTAR_GRADE|${pares.join(",")}]` : "";
}

/**
 * Texto final da resposta: sem `opcaoGrade`, devolve o texto do modelo como está;
 * com ela, remove os `[MONTAR_GRADE|...]` do modelo e anexa o canônico no fim.
 */
export function canonicalizarResposta(reply: string, opcao: OpcaoGradeResumo | null | undefined): string {
    if (!opcao) return reply;
    const marcador = marcadorGradePronta(opcao);
    if (!marcador) return reply;
    const semMarcador = reply
        .replace(RE_MONTAR_GRADE, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return semMarcador ? `${semMarcador}\n\n${marcador}` : marcador;
}
