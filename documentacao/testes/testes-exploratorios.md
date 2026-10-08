# Testes Exploratórios Estruturados

Além das baterias automatizadas em Jest, Vitest e Pytest, o projeto **NoFluxoUNB** conduziu sessões formais de **Testes Exploratórios Baseados em Sessão (SBET - Session-Based Exploratory Testing)** no âmbito do Módulo 4 da disciplina FGA0314.

---

## 👥 Divisão de Responsabilidades e Escopos

Cada integrante da equipe conduziu uma sessão estruturada focada em uma funcionalidade crítica do sistema, aplicando técnicas sistemáticas de teste funcional (Particionamento de Equivalência, Análise de Valor Limite, Tabela de Decisão, Transição de Estados e Error Guessing):

| Integrante | Funcionalidade Explorada | Técnicas Chave Aplicadas | Documento de Evidência |
|---|---|---|---|
| **Vitor** | **Upload de Histórico $\rightarrow$ Geração do Fluxograma** | Transição de Estados, BVA, Error Guessing | [`docs/testes/teste-exploratorio-upload-historico.md`](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/docs/testes/teste-exploratorio-upload-historico.md) |
| **Enzo** | **Assistente IA (Chatbot e Recomendações)** | Error Guessing (prompts adversariais), Tabela de Decisão | [`docs/testes/teste-exploratorio-enzo.md`](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/docs/testes/teste-exploratorio-enzo.md) |
| **André** | **Busca e Filtros de Disciplinas no Fluxograma** | Análise de Valor Limite, Tabela de Decisão, Normalização | [`docs/testes/teste-exploratorio-andre.md`](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/docs/testes/teste-exploratorio-andre.md) |
| **Vini** | **Autenticação, Sessão e Recuperação de Conta** | Transição de Estados, Aspectos Transversais de Segurança | [`docs/testes/teste-exploratorio-vini.md`](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/docs/testes/teste-exploratorio-vini.md) |
| **Kauan** | **Engine de Extração e Parsing de PDF (Python)** | Particionamento de Formatos SIGAA, BVA (arquivos limítrofes) | [`docs/testes/teste-exploratorio-kauan.md`](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/docs/testes/teste-exploratorio-kauan.md) |

---

## 🧭 Metodologia das Sessões

Cada sessão exploratória foi executada seguindo as 5 etapas estruturais:

1. **Definição da Carta da Sessão (Charter):** Objetivo, personas envolvidas, suposições de entrada e limites de tempo (timebox de 45 a 90 minutos).
2. **Mapeamento de Caminhos de Descoberta:**
   - *Fluxos Funcionais:* Caminho feliz e caminhos alternativos de navegação.
   - *Tratamento de Falhas:* Comportamento sob dados truncados, caracteres maliciosos ou conexões lentas.
   - *Experiência de Usuário (UI/UX):* Responsividade mobile, contraste e clareza de mensagens de erro.
   - *Aspectos Transversais:* Segurança, concorrência e persistência de dados no Supabase.
3. **Aplicação Sistemática de Técnicas:** Registro dos inputs de teste formulados via BVA, tabelas-verdade ou particionamento.
4. **Coleta de Evidências:** Screenshots, logs de console, payloads HTTP interceptados e gravações de reprodução (arquivados em `docs/testes/evidencias/`).
5. **Classificação de Defeitos e Criação de Issues:** Registro de severidade (Blocker, Major, Minor, Cosmetic) com passos reprodutíveis.

---

## Relação com a verificação atual

As evidências acima são registros históricos das sessões, não uma declaração de
correção completa no checkout atual. Testes como `sigaa.test.ts`, `SubjectSearch.test.ts`,
`repro-limpar-grade-mobile.spec.ts` e `session-persistence.test.ts` exercitam escopos
diferentes. Persistência SDK com banco mockado, por exemplo, não comprova refresh de
todos os clientes de chat nem comportamento do serviço publicado.

O inventário e comandos atuais estão nas páginas de [backend](testes-backend.md),
[frontend](testes-frontend.md) e [Python](testes-python.md). Resultados devem identificar
revisão, comando, ambiente, execução real e limite de cobertura. As antigas afirmações
universais de “corrigido” foram retiradas deste guia atual.
