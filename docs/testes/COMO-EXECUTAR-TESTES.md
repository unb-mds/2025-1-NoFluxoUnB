# Como executar testes locais

Os comandos abaixo correspondem aos scripts/configuração rastreados. Instale as
dependências de cada pacote; não use credenciais de produção para verificação local.
Não há declaração de resultado atual só por listar uma suíte.

## Backend

```bash
cd backend
npm ci
npm test
npm run test:coverage
npm run type-check
```

Jest usa `tests-ts/`; confirme mocks e carregamento de ambiente antes de ampliar a execução.
[Contrato backend](../kb/subsystems/backend-api-and-motor2.md).

## Frontend

```bash
cd frontend
npm ci
npm run test:unit
npm run test:integration
npm run check
```

Playwright depende dos browsers e serviços/configuração descritos no
[README frontend](../../frontend/README.md). A execução do check não tem contagem
fixa de erros conhecida por este guia.

## Python

```bash
cd DBA/tests
python -m pytest
```

`pytest.ini` configura cobertura de `expressao_parser` e
`DBA.parse_pdf.pdf_parser_final`, relatórios e piso 45%; não usar `--cov=.` para medir
os próprios testes. [Guia DBA](../../DBA/README.md).

## KB e verificador de rollout

Na raiz:

```bash
npm run kb:check
python3 -m unittest discover -s scripts/deploy -p test_verificar_rollout.py
```

O verificador unitário usa mocks; não confirma que um deploy real está no ar.
Veja o [dossier de operações](../kb/subsystems/deployment-ci-and-operations.md) e
os resultados efetivamente executados no [relatório final](../kb/_provenance/reviews/FINAL_REVIEW.md).
