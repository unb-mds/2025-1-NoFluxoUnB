# Reuso de digest de imagem

`buildId` é o campo usado pelos clientes deste repositório para enviar o digest de imagem à Deploy API. Ele identifica o conteúdo da imagem; uma tag pode mudar de digest quando reconstruída. A implementação do servidor é externa, portanto tratamento de digest ausente, manifests Kubernetes e política de cache precisam de confirmação do administrador.

## Implementações disponíveis

| Cliente | Fonte | Cache padrão | Uso |
| --- | --- | --- | --- |
| Específico NoFluxo | `scripts/deploy/deploy_local.py`: `run_local_deploy`, `run_redeploy`, `BuildIdState` | `.deploy/build-id.<alvo>.json` | Alvos definidos em `scripts/deploy/deploy_config.py:APPS`. |
| Genérico | `kubernetes_docs/deploy_client/__main__.py`: `cmd_build`, `cmd_reuse_deploy`, `cmd_local_deploy` | `.deploy/build-id.json` | Flags para configuração de outro produto/ambiente. |

Caches são relativos ao diretório de execução. `--state-file` permite caminho explícito. No fluxo local, o estado é salvo depois de resolver digest e antes de comprovar deploy. Não representa necessariamente o último deploy saudável nem uma imagem aprovada para rollback.

Os clientes resolvem digest com `GET /registry/{image_name}/digest?tag=...` e enviam `POST /build` com `buildId` e `deploy=True` para reutilizá-lo. Esses são contratos esperados pelo código local; uma resposta de aceitação não prova que a nova versão foi servida.

O workflow NoFluxo executa [verificar_rollout.py](../scripts/deploy/verificar_rollout.py) depois do pedido para comparar o commit público. O deploy local e o cliente genérico não fazem essa confirmação automaticamente. Reusar uma imagem não altera seus valores incorporados no build, como `PUBLIC_*` do frontend; mudar esses valores exige rebuild.

Consulte o [cliente genérico](./deploy_client/README.md), o [fluxo específico](./local_build_and_deploy/README.md) e [Deploy e operações](../docs/kb/subsystems/deployment-ci-and-operations.md). A documentação não autoriza publicação, rollback ou acesso a credenciais.
