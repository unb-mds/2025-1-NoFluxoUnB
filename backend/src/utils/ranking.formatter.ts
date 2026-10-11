/**
 * Ranking formatter — converts RAGFlow agent response into Markdown.
 * Direct TypeScript port of visualizaJsonMateriasAssociadas.py → gerar_texto_ranking()
 */

import { RagflowResponse, RankingItem } from '../services/ragflow.types';
import { unescapeHtml } from './text.utils';
import logger from '../logger';

/**
 * Resposta do RAGFlow que não dá para transformar em ranking.
 *
 * Antes formatRanking devolvia a STRING "Erro ao processar o JSON: ..." e o
 * controller respondia 200 com ela como resultado — o usuário via
 * "Cannot read properties of undefined (reading 'match')" como se fosse a
 * resposta da IA (pré-mortem 27/09/2026, R53). Agora lança e o controller
 * responde 502.
 */
export class RankingFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RankingFormatError';
    }
}

/**
 * Parse a Python dict literal string into its content value.
 * The RAGFlow answer field looks like: "{'content': {'0': '...'}, 'component_id': {'0': '...'}}"
 */
function extractContent(answer: string): string {
    try {
        // Convert Python dict literal to JSON-compatible string
        const jsonCompatible = answer
            .replace(/'/g, '"')
            .replace(/\bNone\b/g, 'null')
            .replace(/\bTrue\b/g, 'true')
            .replace(/\bFalse\b/g, 'false');

        const parsed = JSON.parse(jsonCompatible);
        return parsed.content['0'] || '';
    } catch {
        // Fallback: try regex extraction
        const match = answer.match(/'0':\s*'([\s\S]*?)'\s*\}\s*,\s*'component_id'/);
        if (match) {
            return match[1].replace(/\\n/g, '\n').replace(/\\'/g, "'");
        }
        logger.warn('[RankingFormatter] Could not parse RAGFlow answer — returning raw content');
        return answer;
    }
}

/**
 * Parse a single ranking item from the regex-captured text.
 */
function parseItem(itemStr: string): RankingItem {
    let disciplina = 'N/A';
    let codigo = 'N/A';
    let unidade = 'N/A';
    let pontuacao = '0';
    let justificativa = 'N/A';
    let ementa = 'N/A';

    // Format 1: single-line format
    const mainLineMatch = itemStr.match(
        /\*\*Disciplina:\*\*\s*(.*?);\s*Codigo:\s*(\S+);\s*Unidade\s+responsavel:\s*(.*?)(?:;\s*Ementa:\s*([\s\S]*?))?\s*$/m
    );

    if (mainLineMatch) {
        disciplina = mainLineMatch[1].trim();
        codigo = mainLineMatch[2].trim();
        unidade = mainLineMatch[3].trim();
        ementa = mainLineMatch[4]?.trim() || 'N/A';

        const pontuacaoMatch = itemStr.match(/\*\*Pontuação:\*\*\s*(\d+)/);
        const justificativaMatch = itemStr.match(/\*\*Justificativa:\*\*\s*([\s\S]*)/);

        if (pontuacaoMatch) pontuacao = pontuacaoMatch[1].trim();
        if (justificativaMatch) justificativa = justificativaMatch[1].trim();
    } else {
        // Format 2: multi-line format (legacy)
        const codigoMatch = itemStr.match(/\*\*Código:\*\*\s*(.*?)\s*$/m);
        const disciplinaMatch = itemStr.match(/\*\*Disciplina:\*\*\s*(.*?)\s*$/m);
        const unidadeMatch = itemStr.match(/\*\*Unidade Responsável:\*\*\s*(.*?)\s*$/m);
        const pontuacaoMatch = itemStr.match(/\*\*Pontuação:\*\*\s*(.*?)\s*$/m);
        const justificativaMatch = itemStr.match(/\*\*Justificativa:\*\*\s*([\s\S]*?)(?=\s*-\s*\*\*Pontuação:\*\*|\s*$)/);

        const codigoBruto = codigoMatch?.[1]?.trim() || 'N/A';
        const disciplinaBruta = disciplinaMatch?.[1]?.trim() || 'N/A';

        const codigoLimpoMatch = codigoBruto.match(/Codigo:\s*(\S+)/);
        codigo = codigoLimpoMatch ? codigoLimpoMatch[1] : codigoBruto;
        disciplina = disciplinaBruta.replace(/;\s*Codigo:.*/, '').trim();
        unidade = unidadeMatch?.[1]?.trim() || 'N/A';
        justificativa = justificativaMatch?.[1]?.trim() || 'N/A';
        pontuacao = pontuacaoMatch?.[1]?.trim() || '0';
    }

    // Clean up
    justificativa = unescapeHtml(justificativa.replace(/\\n/g, ' ')).trim();
    ementa = unescapeHtml(ementa.replace(/\\n/g, ' ')).trim();

    return { disciplina, codigo, unidade, pontuacao, justificativa, ementa };
}

/**
 * Format a RAGFlow response into a Markdown ranking string.
 * Direct port of Python gerar_texto_ranking().
 */
export function formatRanking(response: RagflowResponse): string {
    try {
        const answerStr = response?.data?.answer;
        if (typeof answerStr !== 'string' || !answerStr.trim()) {
            throw new RankingFormatError('RAGFlow respondeu sem answer');
        }
        const contentStr = extractContent(answerStr);

        // Split on "INÍCIO DO RANKING"
        const parts = contentStr.split(/INÍCIO DO RANKING/);
        let rankingBlock = parts.length > 1 ? parts[1] : contentStr;
        rankingBlock = rankingBlock.replace(/---\s*$/, '').trim();

        if (!rankingBlock) {
            throw new RankingFormatError('Não foi possível extrair um bloco de ranking válido do JSON.');
        }

        // Extract numbered items — match "1. ... " up to next "2. ..." or end
        const items: string[] = [];
        const itemRegex = /\d+\.\s*([\s\S]*?)(?=\n\s*\d+\.\s*|$)/g;
        let match: RegExpExecArray | null;
        while ((match = itemRegex.exec(rankingBlock)) !== null) {
            items.push(match[1]);
        }

        const header = [
            '# 🏆 Ranking de Disciplinas',
            '',
            '## 🎯 **Análise Personalizada**',
            '',
            '> Baseado nos seus interesses e perfil acadêmico, analisamos centenas de disciplinas da UnB para encontrar as que melhor se alinham com seus objetivos.',
            '',
            '### 📋 **Como funciona a pontuação:**',
            '- **100 pontos:** Perfeita alinhamento com seus interesses',
            '- **80-99 pontos:** Excelente relevância',
            '- **60-79 pontos:** Boa relevância',
            '- **40-59 pontos:** Relevância moderada',
            '- **20-39 pontos:** Baixa relevância',
            '',
            '---',
            '',
        ];

        const bodyParts: string[] = [];
        const pontuacoes: number[] = [];

        items.forEach((itemStr, index) => {
            const pos = index + 1;
            const item = parseItem(itemStr);

            const score = parseInt(item.pontuacao, 10);
            if (!isNaN(score)) pontuacoes.push(score);

            const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '📚';

            let block = [
                '',
                '---',
                '',
                `## ${medal} **${pos}º Lugar** - Pontuação: **${item.pontuacao}/100**`,
                '',
                `### 📖 **${item.disciplina}**`,
                '| Campo | Valor |',
                '|-------|-------|',
                `| **Código** | \`${item.codigo}\` |`,
                `| **Unidade** | ${item.unidade} |`,
                '',
            ].join('\n');

            if (item.ementa && item.ementa !== 'N/A') {
                block += `### 📝 **Ementa**\n> ${item.ementa}\n\n`;
            }

            block += `### 💡 **Por que esta disciplina?**\n> ${item.justificativa}\n`;

            bodyParts.push(block);
        });

        const maxPontuacao = pontuacoes.length > 0 ? Math.max(...pontuacoes) : 0;
        const minPontuacao = pontuacoes.length > 0 ? Math.min(...pontuacoes) : 0;
        const totalDisciplinas = items.length;

        const footer = [
            '',
            '---',
            '',
            '## 📊 **Resumo da Análise**',
            '',
            '| Métrica | Valor |',
            '|---------|-------|',
            `| **Total de disciplinas** | ${totalDisciplinas} |`,
            `| **Melhor pontuação** | ${maxPontuacao}/100 |`,
            `| **Faixa de pontuação** | ${minPontuacao}-${maxPontuacao} |`,
            '',
            '### 🎯 **Recomendações**',
            '',
            '> 🥇 **Disciplinas com pontuação 80-100:** Altamente recomendadas para seus interesses',
            '> 🥈 **Disciplinas com pontuação 60-79:** Boas opções para complementar sua formação',
            '> 🥉 **Disciplinas com pontuação 40-59:** Considerar se houver interesse específico',
            '',
            '---',
        ];

        return [...header, ...bodyParts, ...footer].join('\n');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[RankingFormatter] Error formatting ranking: ${msg}`);
        throw error instanceof RankingFormatError ? error : new RankingFormatError(`Erro ao processar o JSON: ${msg}`);
    }
}
