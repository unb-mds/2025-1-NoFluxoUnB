# Métricas e cobertura de código

Cobertura indica quais partes do código foram exercitadas pelos testes executados. Ela depende dos alvos configurados, dos dados disponíveis e dos testes pulados. Esta página descreve a configuração revisada em 2026-10-07; não estabelece o percentual atual do projeto.

## Política e enforcement

| Configuração | Valor declarado | O que não se pode inferir |
| --- | --- | --- |
| [`codecov.yml`](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/codecov.yml) | Target 80% e threshold 5% para status de projeto/patch; regras de exclusão para testes/setup | Que houve upload recente de cobertura, check recebido ou proteção de branch exigindo esse status |
| `DBA/tests/pytest.ini` | `--cov-fail-under=45` para os módulos configurados | Que a cobertura atual é 45% ou que todas as rotas do parser foram testadas |
| `backend/package.json` / Jest | Coleta de `src/**/*.ts`, excluindo `.d.ts`; sem `coverageThreshold` declarado | Que Jest impõe piso de 80% |
| `frontend/vite.config.ts` | Dois projetos Vitest; sem thresholds explícitos de cobertura | Que o Vitest impõe um piso ou que uma execução de cobertura foi aprovada |

O workflow principal roda `npm test` no backend e Vitest sem flag de cobertura no frontend. Não há upload Codecov nesse workflow. O piso Python é aplicado porque está no `pytest.ini`, lido pelo comando padrão Pytest. Proteções da branch são configuração externa, não demonstrada pelo arquivo Codecov.

## Backend

Em `backend/`:

```bash
npm run test:coverage
```

O Jest gera texto no terminal, `backend/coverage/lcov.info` e HTML em `backend/coverage/index.html`, de acordo com `coverageReporters: ["text", "lcov", "html"]`. Preserve a revisão e o comando junto do relatório. Os testes PGlite exercitam SQL local, mas isso não significa que a instrumentação TypeScript meça cobertura interna das funções SQL.

## Frontend

Em `frontend/`:

```bash
npm run test:coverage
```

O script chama `vitest run --coverage`, e o manifesto declara `@vitest/coverage-v8` como dependência de desenvolvimento. A configuração Vite não define thresholds nem opções próprias de relatórios; confira os arquivos efetivamente gerados e a saída da execução. A existência do script e da dependência não é uma medição de cobertura nem demonstra que a suíte passou.

## Python

A partir da raiz:

```bash
(cd DBA/tests && python -m pytest)
```

O comando usa os alvos `expressao_parser` e `DBA.parse_pdf.pdf_parser_final` do `pytest.ini`. Os relatórios configurados ficam em `DBA/tests/htmlcov/`, `DBA/tests/coverage.xml` e no terminal. Não use `--cov=.` dentro de `DBA/tests/`, pois isso adiciona os testes à medição.

Há um caso de upload bem-sucedido pulado em `test_upload_pdf.py`, e os testes do arquivo de scraping definem seus próprios helpers. Esses limites devem acompanhar qualquer conclusão sobre cobertura da implementação Python.

## Como interpretar

Linhas, instruções, funções e branches são métricas diferentes. Uma alta taxa de linhas não garante decisões bem testadas, comportamento no navegador, autenticação real ou conformidade com regras acadêmicas. Um alvo de política não é um resultado medido.

Ao divulgar uma métrica, registre:

1. Revisão, comando e configuração utilizados.
2. Alvos incluídos e exclusões.
3. Casos aprovados, falhos e pulados, com motivo dos skips relevantes.
4. Dependências/fixtures disponíveis e tipo de integração (mock, banco local ou serviço remoto).
5. Caminho do relatório gerado e limites da conclusão.

Os relatórios acadêmicos e screenshots anteriores continuam evidência histórica. Para decidir sobre uma mudança atual, gere a medição no checkout correspondente.
