# Pipeline de integração contínua

A configuração de referência é [`.github/workflows/pipelineCI.yml`](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/.github/workflows/pipelineCI.yml), workflow chamado `CI`. Esta página descreve a configuração revisada em 2026-10-07, sem afirmar que um run específico está aprovado.

## Disparos e seleção de áreas

O workflow roda em pull requests e em pushes para `main` e `dev`. `concurrency` agrupa por referência e cancela runs anteriores quando uma execução nova os substitui.

Nos PRs, `dorny/paths-filter` seleciona os jobs afetados. Mudanças no workflow principal afetam todas as áreas. Python considera arquivos `.py`, `DBA/tests/`, requirements e `setup.cfg`; backend considera `backend/` e workflows usados pelos testes de CI; frontend considera `frontend/`. Em pushes às branches configuradas, os quatro jobs de área rodam independentemente desses filtros.

Um PR só de documentação pode deixar jobs de área pulados. Portanto, o workflow não executa todas as suítes em todo PR.

## Jobs do workflow principal

| Job | Execução configurada | Ambiente |
| --- | --- | --- |
| `changes` | Classificação dos caminhos alterados | `dorny/paths-filter@v3` |
| `qualidade-python` | `black --check .` e `flake8 .` | Python 3.11; Black 25.11.0 e Flake8 7.3.0 |
| `testes-python` | `python -m pytest`, em `DBA/tests/` | Dependências de `DBA/tests/requirements.txt`, pytest/cov/mock, Tesseract e Poppler |
| `testes-backend` | `npm ci` e `npm test`, em `backend/` | Node 20 |
| `testes-frontend` | `npm ci` e `npx vitest run --passWithNoTests`, em `frontend/` | Node 20; variáveis públicas sintéticas para os clientes importados |

O job Python usa a cobertura e o piso definidos em `DBA/tests/pytest.ini`. O principal job frontend não executa toda a suíte Playwright, `svelte-check`, lint ou build. O job backend executa Jest, não todos os checks de qualidade presentes em scripts npm.

## Outros workflows

- `a11y.yml`: executa os scripts de acessibilidade Vitest e Playwright. O job tem `continue-on-error: true`; é uma verificação informativa na configuração atual.
- `security-and-quality.yml`: faz audit de dependências de produção do backend e um check TypeScript estrito. O audit frontend possui `continue-on-error: true`. Relatórios Python/ESLint/dependências adicionais são agendados e vários comandos informativos toleram falha.
- `ci.yml`: publica o site MkDocs após push na main. Seu nome é `Docs (mkdocs)`, separado do workflow de testes.
- `deploy.yml`: no caminho automático, espera o `CI` elegível e aprovado na main, confere o arquivo do workflow/evento/repositório e faz checkout do SHA aprovado. Há também `workflow_dispatch` com condição distinta. A verificação de rollout consulta a revisão das aplicações publicadas.

As proteções da branch e quais checks são obrigatórios dependem de configuração do GitHub não consultada nesta revisão. O YAML não autoriza merge ou push por um agente; as regras do repositório exigem autorização explícita do mantenedor.

## Reprodução local

Execute os comandos de cada área a partir da raiz, após instalar suas dependências:

```bash
python -m pip install black==25.11.0 flake8==7.3.0
black --check .
flake8 .
(cd DBA/tests && python -m pytest)
(cd backend && npm test)
(cd frontend && npx vitest run --passWithNoTests)
```

Para uma reprodução próxima ao runner, use as versões de Python/Node e `npm ci` previstas no YAML, além das dependências OCR/PDF. Uma execução local aprovada não demonstra que o run remoto passou ou que uma revisão foi publicada.
