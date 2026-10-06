import { describe, it, expect } from '@jest/globals';
import { formatRanking, RankingFormatError } from '../../src/utils/ranking.formatter';
import { RagflowResponse } from '../../src/services/ragflow.types';

describe('Ranking Formatter', () => {
    
    describe('Black-box tests', () => {
        it('deve formatar uma resposta (JSON simulado) do agente RAGFlow em um Markdown completo e formatado', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{'content': {'0': 'INÍCIO DO RANKING\\n1. **Disciplina:** CÁLCULO 1; Codigo: MAT0025; Unidade responsavel: MAT; Ementa: Funções de uma variável real.\\n**Pontuação:** 95\\n**Justificativa:** Baseado nos seus interesses.\\n2. **Disciplina:** FISICA 1; Codigo: IFD0171; Unidade responsavel: IF\\n**Pontuação:** 80\\n**Justificativa:** Fundamental.'}, 'component_id': {'0': 'xyz'}}`,
                    reference: {},
                    session_id: 'mock-session-id'
                }
            };
            const result = formatRanking(mockResponse);
            expect(result).toContain('# 🏆 Ranking de Disciplinas');
            expect(result).toContain('## 🥇 **1º Lugar** - Pontuação: **95/100**');
            expect(result).toContain('### 📖 **CÁLCULO 1**');
            expect(result).toContain('`MAT0025`');
            expect(result).toContain('Funções de uma variável real');
            expect(result).toContain('## 🥈 **2º Lugar** - Pontuação: **80/100**');
            expect(result).toContain('### 📖 **FISICA 1**');
            expect(result).toContain('`IFD0171`');
            expect(result).toContain('## 📊 **Resumo da Análise**');
            expect(result).toContain('**Total de disciplinas** | 2');
        });

        it('deve processar o formato de resposta legado (múltiplas quebras de linha)', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{'content': {'0': 'INÍCIO DO RANKING\\n1. **Código:** MAT0026\\n**Disciplina:** CÁLCULO 2\\n**Unidade Responsável:** MAT\\n**Pontuação:** 90\\n**Justificativa:** Muito importante.'}}`,
                    session_id: 'mock-session-id'
                }
            };
            const result = formatRanking(mockResponse);
            
            expect(result).toContain('`MAT0026`');
            expect(result).toContain('### 📖 **CÁLCULO 2**');
            expect(result).toContain('Pontuação: **90/100**');
        });

        // Pré-mortem 27/09/2026, R53: antes devolvia a string "Erro ao processar
        // o JSON: Cannot read properties of undefined" e o controller mandava
        // isso com HTTP 200 como se fosse o ranking.
        it('deve lançar RankingFormatError quando o RAGFlow responde sem answer (Error Guessing / Valor Limite)', () => {
            expect(() => formatRanking({ code: 0, data: {} } as RagflowResponse)).toThrow(RankingFormatError);
            expect(() => formatRanking({ code: 0 } as unknown as RagflowResponse)).toThrow(RankingFormatError);
            expect(() => formatRanking({ code: 0, data: { answer: '   ' } } as unknown as RagflowResponse)).toThrow(RankingFormatError);
        });
    });

    describe('White-box tests', () => {
        it('deve acionar o fallback de Regex se o parsing nativo de JSON/literal Python falhar', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{'content': {'0': 'INÍCIO DO RANKING\\n1. **Disciplina:** ALGEBRA; Codigo: MAT0034; Unidade responsavel: MAT;\\n**Pontuação:** 75\\n**Justificativa:** Legal.\\n'}, 'component_id': 'xyz'}`,
                    session_id: 'mock-session-id'
                }
            };
            
            const result = formatRanking(mockResponse);
            expect(result).toContain('`MAT0034`');
            expect(result).toContain('Pontuação: **75/100**');
        });

        it('deve lidar graciosamente com um bloco de ranking vazio', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{'content': {'0': 'Nenhuma disciplina encontrada'}}`,
                    session_id: 'mock-session-id'
                }
            };
            const result = formatRanking(mockResponse);
            expect(result).toContain('**Total de disciplinas** | 0');
        });

        it('deve falhar de forma segura quando todos os parsings (JSON e Regex) falharem (Cobertura de Decisões)', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `Texto completamente aleatório que não é um dict e não contém blocos de ranking`,
                    session_id: 'mock-session-id'
                }
            };
            const result = formatRanking(mockResponse);
            expect(result).toContain('**Total de disciplinas** | 0');
        });

        it('deve lidar com JSON usando índice numérico e não renderizar blocos de ementa omitidos (N/A)', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{"content": { "0": "INÍCIO DO RANKING\\n1. **Disciplina:** MATEMÁTICA; Codigo: MAT001; Unidade responsavel: MAT; Ementa: N/A\\n**Pontuação:** 10\\n" }, "session_id": "test"}`,
                    session_id: 'test'
                }
            };
            const result = formatRanking(mockResponse);
            expect(result).toContain('`MAT001`');
            expect(result).not.toContain('### 📝 **Ementa**'); // Como a ementa é N/A, o bloco não deve ser gerado
        });

        it('deve formatar disciplina com segurança mesmo se todos os campos opcionais (código, ementa, justificativa, unidade) estiverem ausentes', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{"content": { "0": "1. **Disciplina:** APENAS NOME\\n**Pontuação:** 50\\n" }, "session_id": "test"}`,
                    session_id: 'test'
                }
            };
            const result = formatRanking(mockResponse);
            expect(result).toContain('### 📖 **APENAS NOME**');
            expect(result).toContain('**50/100**');
        });

        it('deve usar medalha padrão (📚) para posições >= 4 e ignorar pontuações não numéricas (NaN) (Valor Limite / MC/DC)', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{"content": {"0": "1. **Disciplina:** A; Codigo: A; Unidade responsavel: A\\n2. **Disciplina:** B; Codigo: B; Unidade responsavel: B\\n3. **Disciplina:** C; Codigo: C; Unidade responsavel: C\\n4. **Disciplina:** D; Codigo: D; Unidade responsavel: D\\n**Pontuação:** Invalida\\n"}, "session_id": "test"}`,
                    session_id: 'test'
                }
            };
            const result = formatRanking(mockResponse);
            
            expect(result).toContain('## 📚 **4º Lugar**'); // Verifica o fallback do operador ternário de medalhas
            expect(result).toContain('**0/100**'); // O parseInt("Invalida") gera NaN, fallback da pontuação para 0
        });

        it('deve lançar erro se o content for estritamente vazio após o parsing (Grafo de Fluxo de Controle)', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{"content": {"0": ""}, "session_id": "test"}`,
                    session_id: 'test'
                }
            };
            expect(() => formatRanking(mockResponse)).toThrow(RankingFormatError);
        });

        it('deve lançar erro caso o dict Python não possua o índice 0 (fallback extractContent)', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{"content": {"outra_chave": "texto"}, "session_id": "test"}`,
                    session_id: 'test'
                }
            };
            expect(() => formatRanking(mockResponse)).toThrow('Não foi possível extrair um bloco de ranking válido do JSON.');
        });

        it('deve lidar com formato de linha única faltando pontuação e justificativa explicitamente', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{"content": {"0": "INÍCIO DO RANKING\\n1. **Disciplina:** TESTE; Codigo: TST01; Unidade responsavel: FGA\\n"}, "session_id": "test"}`,
                    session_id: 'test'
                }
            };
            const result = formatRanking(mockResponse);
            expect(result).toContain('Pontuação: **0/100**');
            expect(result).toContain('### 💡 **Por que esta disciplina?**\n> N/A');
        });

        it('deve lidar com formato de múltiplas linhas legado sem match do codigo limpo', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{"content": {"0": "INÍCIO DO RANKING\\n1. **Código:** APENASCODIGO\\n**Disciplina:** D\\n**Unidade Responsável:** U\\n"}, "session_id": "test"}`,
                    session_id: 'test'
                }
            };
            const result = formatRanking(mockResponse);
            expect(result).toContain('`APENASCODIGO`'); // Testando a linha: codigoLimpoMatch ? ... : codigoBruto
        });

        it('deve tratar exceções primitivas (não-Error objects) no catch final', () => {
            const mockResponse = { get data() { throw "Exceção em String"; } } as unknown as RagflowResponse;
            expect(() => formatRanking(mockResponse)).toThrow(RankingFormatError);
            expect(() => formatRanking(mockResponse)).toThrow('Erro ao processar o JSON: Exceção em String');
        });
        it('deve preencher as ramificações faltantes: fallbacks do formato legado, ementa fantasma e limpeza de traços finais', () => {
            const mockResponse: RagflowResponse = {
                code: 0,
                data: {
                    answer: `{"content": {"0": "INÍCIO DO RANKING\\n1. **Disciplina:** D; Codigo: C; Unidade responsavel: U; Ementa: \\n \\n \\n2. Apenas um texto sem formato algum\\n3. **Código:** Codigo: MAT99\\n**Disciplina:** Nome da Disciplina; Codigo: Lixo\\n4. **Código:**  \\n**Disciplina:**  \\n**Unidade Responsável:**  \\n**Pontuação:**  \\n**Justificativa:**  \\n---"}, "session_id": "test"}`,
                    session_id: 'test'
                }
            };
            const result = formatRanking(mockResponse);
            
            // Verificação 1 (Ementa vazia não deve gerar bloco de ementa)
            expect(result).not.toContain('### 📝 **Ementa**\n> \n');
            expect(result).toContain('### 📖 **N/A**');
            expect(result).toContain('`MAT99`');
            expect(result).toContain('### 📖 **Nome da Disciplina**');
        });
    });
});