# Testes — NoFluxoUNB

Este índice reúne os guias de execução e os limites das suítes identificadas no código em 2026-10-07. Quantidade de arquivos, casos aprovados e percentuais de cobertura mudam com o checkout e com os dados disponíveis; esta página não publica uma medição de execução.

## Suítes e alcance

| Área | Ferramenta e localização | O que a execução pode demonstrar |
| --- | --- | --- |
| Backend | Jest / ts-jest; `backend/tests-ts/` e padrão `src/**/__tests__/*.test.ts` | Controllers, planejamento, chat, resiliência e SQL em PGlite conforme cada cenário |
| Frontend | Vitest; `frontend/src/**/*.{test,spec}.{js,ts}` | Regras de grade, serviços, parsers, stores e componentes selecionados |
| Navegador | Playwright; `frontend/tests-e2e/` | Asserções dos fluxos executados no navegador; algumas sessões são exploratórias e apenas registram estados |
| Dados e parser legado | Pytest; `DBA/tests/` | Parser de expressões e casos do parser Flask preservado; nem todo teste do arquivo de scraping importa o código de produção |
| Utilitários de IA | Pytest ou execução direta; `mcp_agent/test_*.py` | Parsing de tool calls, respostas e configuração de timeouts; não valida uma conversa real com provedores |

Integrações com mocks, banco local e ambiente de desenvolvimento devem ser identificadas no resultado. Um teste de sessão com Supabase simulado não certifica persistência no banco remoto; uma navegação até o botão de Google não certifica OAuth concluído.

## Guias

- [Estratégia de testes](estrategia-de-testes.md)
- [Testes do backend](testes-backend.md)
- [Testes do frontend](testes-frontend.md)
- [Testes Python](testes-python.md)
- [Pipeline de CI](pipeline-ci.md)
- [Métricas e cobertura](cobertura-metricas.md)
- [Relatórios exploratórios históricos](testes-exploratorios.md)

## Execução por área

Execute cada bloco a partir da raiz do repositório, com as dependências da área instaladas:

```bash
(cd backend && npm test)
(cd frontend && npm run test:unit)
(cd DBA/tests && python -m pytest)
(cd mcp_agent && python -m pytest test_tool_call_utils.py test_sabia_utils.py)
```

Para navegador, instale o Chromium do Playwright em `frontend/` e execute `npm run test:integration`. O arquivo `playwright.config.ts` sobe ou reutiliza o dev server na porta 5173. Confira fixtures, mocks e serviços exigidos pelo spec selecionado antes de executar a suíte completa.

O helper `run_all_tests.sh` não corresponde exatamente a todos os workflows: não executa a suíte do `mcp_agent` nem todos os E2E e adiciona `--cov=.` aos testes Python. Para reproduzir o CI e a cobertura configurada, use os comandos específicos dos guias.

## Evidência histórica e resultado atual

Os relatórios de `docs/testes/` e a página de exploratórios registram sessões anteriores. Capturas, percentuais antigos e textos PASS devem manter esse contexto. Um resultado atual deve informar revisão, comando, ambiente, testes pulados, falhas e artefatos produzidos. Aprovação local, configuração de CI, sucesso de deploy e comportamento observado em produção são evidências distintas.
