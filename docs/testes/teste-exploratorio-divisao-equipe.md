# Exercício — Sessão de Teste Exploratório Estruturado (Módulo 4)

**Disciplina:** FGA0314 — Testes de Software
**Aula:** Módulo 4 — Testes Funcionais, de Sistema e de Aceitação + Full Stack Testing
**Projeto:** NoFluxoUNB (open source)
**Entrega da equipe PTOSS-2:** 2026-06-08

## Como o exercício é dividido

O slide do exercício pede que **cada equipe** explore uma funcionalidade. Como o
projeto é grande e cada integrante já tem domínio de uma camada diferente do código
(registro interno da equipe à época),
combinamos **1 funcionalidade por integrante** — cada um faz uma sessão exploratória
independente, com seu próprio relatório, e no final juntamos tudo em um anexo do
relatório PTOSS-2.

A escolha foi feita aproveitando o que cada um já testou em caixa-branca: você
explora melhor o que conhece (ver slide *"Antes de Explorar, Entenda a Aplicação"*).

| Integrante | Funcionalidade | Por que combina |
|------------|---------------|-----------------|
| **Vitor** | **Upload do histórico escolar → geração do fluxograma** | Já fez caixa-branca do `fluxograma_controller`. Conhece a lógica de casamento, equivalências e obrigatoriedade. É o fluxo end-to-end principal — toca PDF.js, validação, RPC Supabase, render do fluxograma. Cobre os 4 caminhos de descoberta com folga. |
| **Enzo** | **Assistente IA (chatbot sobre o fluxograma)** | Já fez caixa-branca do `assistente_controller`. Conhece prompts, integrações com Sabiá/RagFlow, tratamento de respostas. Excelente para Error Guessing (prompts adversariais), Tabela de Decisão (regras de quando responder) e Transição de Estados (sessão de conversa). |
| **André** | **Busca / filtro de disciplinas no fluxograma** | Já testou `text.utils`, `ranking.formatter`, `expressao_logica`. Estes utilitários alimentam a busca. Encaixe perfeito para **Boundary Value Analysis** (tamanho da query, acentuação, caracteres especiais) e **Tabela de Decisão** (filtros combinados: status × natureza × período). |
| **Vini** | **Login / Autenticação (Google OAuth + sessão Supabase)** | Como a parte dele (ragflow/sabia services) ainda não subiu, login é um escopo **independente** que ele consegue explorar sem depender da própria branch. É o exemplo clássico do slide (login/cadastro) e tem ótima cobertura de **Transição de Estados** (Not logged in → Error → Logged in → Account locked) e **Aspectos transversais** (segurança, MFA, expiração de sessão). |
| **Kauan** | **Parsing / extração do PDF do histórico SIGAA (PDF → dados estruturados)** | É dono da camada Python de parsing (`parse-pdf/pdf_parser_final.py`, scraping, `tests-python/`) — até criou o `blank.pdf` de teste. Fica **a montante** do fluxo do Vitor: enquanto o Vitor explora o casamento/render end-to-end, o Kauan explora a **qualidade da extração**. Encaixe perfeito para **Boundary Value Analysis** (PDF vazio, 1 disciplina, histórico gigante), **Particionamento** (formatos de SIGAA, com/sem optativas, currículos antigos × novos) e **Error Guessing** (PDF escaneado/imagem, corrompido, protegido por senha, encoding de acentos). |

**Funcionalidades alternativas**, caso alguém prefira trocar:

- Dashboard de Custos de IA (recém-mergeado em `feature/dashboard-custos-ia`)
- Visualização e navegação no fluxograma já renderizado (UI-pesado)
- Comparação entre matrizes curriculares / mudança de curso
- Seleção ambígua de curso após upload (`CourseSelectionError`)

## Estrutura que cada integrante deve entregar

Cada um cria um arquivo em `docs/testes/` com o nome
`teste-exploratorio-<seu-nome>.md` seguindo as **5 partes do exercício**:

1. **Funcionalidade escolhida** — qual é, por que escolheu (5 min de leitura).
2. **Compreensão** (Personas, Domínio, Fluxo principal, Arquitetura).
3. **Planejamento** — tabela dos 4 caminhos de descoberta (Fluxos funcionais,
   Falhas e erros, UI/UX, Aspectos transversais) preenchida para a sua
   funcionalidade.
4. **Execução** — usar **pelo menos 3 técnicas** das 8 estudadas (Particionamento,
   BVA, Transição de Estados, Tabela de Decisão, Causa-Efeito, Pairwise,
   Amostragem, Error Guessing). Cada técnica → cenários testados com resultado
   observado.
5. **Relatório** — defeitos encontrados (com **severidade** e **evidência**), novos
   cenários descobertos durante a exploração, e **melhorias sugeridas** que viram
   issues no GitHub.

O relatório do Vitor (`teste-exploratorio-upload-historico.md`) serve de modelo —
está completo e pode ser usado como referência de profundidade e formato.

## Encaixe no projeto da disciplina

A sessão exploratória **complementa** a parte de caixa-branca que cada um já fez
no PTOSS-2:

- Caixa-branca cobriu **o que o código faz** (cobertura de linhas/ramos).
- A exploração descobre **o que falta no código** (validação ausente, fluxo não
  pensado, mensagem de erro confusa, regra de negócio incompleta).

Defeitos encontrados aqui viram **issues no GitHub** e potencialmente alimentam:

- a Fase 2 do plano de testes (cobertura) — novos testes unitários nascem dos
  defeitos confirmados;
- a Fase 3 (E2E/Playwright) — os fluxos funcionais explorados viram cenários
  de teste de aceitação automatizados.
