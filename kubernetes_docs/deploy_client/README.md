# Cliente genérico da Deploy API

Este pacote Python é uma ferramenta independente por flags. O workflow do NoFluxoUNB usa [scripts/deploy/deploy_local.py](../../scripts/deploy/deploy_local.py) e sua configuração `APPS`; veja [Deploy e operações](../../docs/kb/subsystems/deployment-ci-and-operations.md).

## Interface implementada

Em `__main__.py`, o parser aceita três subcomandos:

| Comando | Símbolo | Comportamento no cliente |
| --- | --- | --- |
| `build` | `cmd_build` | Envia `POST /build` com repo/ref e `deploy=False`, pode esperar o job, resolve digest e grava estado. |
| `reuse-deploy` | `cmd_reuse_deploy` | Obtém app/digest de flags ou estado e envia pedido com `buildId`, `deploy=True` e configuração. |
| `local-deploy` | `cmd_local_deploy` | Executa Docker build/push, resolve digest, grava estado e envia pedido de deploy. |

Instalação de dependências, quando necessária, usa `python -m pip install -r kubernetes_docs/deploy_client/requirements.txt`. Ela baixa pacotes e não configura o serviço remoto. Para consultar ajuda a partir da raiz, com as dependências instaladas:

```bash
PYTHONPATH=kubernetes_docs python -m deploy_client --help
PYTHONPATH=kubernetes_docs python -m deploy_client build --help
PYTHONPATH=kubernetes_docs python -m deploy_client reuse-deploy --help
PYTHONPATH=kubernetes_docs python -m deploy_client local-deploy --help
```

`config.py:load_config` lê `DEPLOY_API_URL`, `DEPLOY_API_KEY` e `DEPLOY_API_TIMEOUT` do ambiente ou flags correspondentes. Este pacote não carrega `.env` automaticamente. Segredos devem permanecer fora do Git e não ser passados em linhas de comando compartilhadas. `api.py:DeployApiClient` envia a chave no header `X-API-Key`.

`buildid_store.py:DEFAULT_PATH` é `.deploy/build-id.json` relativo ao diretório de execução; `--state-file` permite outro caminho. É cache de metadados/digest, não prova de rollout. O CLI genérico não implementa a verificação pública de commit do produto.

`local-deploy --no-push` ainda resolve digest e pede deploy. O comando `build` com `deploy=False` continua sendo build remoto e pode consumir recursos externos. Opções deste pacote não são necessariamente válidas no cliente específico do NoFluxo; consulte cada parser.

A fonte local descreve pedidos esperados, não comprova contrato vigente da API, build remoto Kaniko, rejeição de digest ausente, disponibilidade ou resultado da publicação. Execuções de build/push/deploy exigem autorização e confirmação de alvo/ambiente com o administrador. Referência conceitual: [reuso de digest](../BUILD_ID_REUSE_PYTHON.md).
