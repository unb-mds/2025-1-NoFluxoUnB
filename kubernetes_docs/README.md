# Infraestrutura e deploy do NoFluxoUNB

O fluxo específico deste produto está em [Deploy e operações](../docs/kb/subsystems/deployment-ci-and-operations.md), [Docker](../DOCKER_README.md) e [scripts/deploy/deploy_config.py](../scripts/deploy/deploy_config.py), símbolo `APPS`. Consulte essas fontes antes de alterar publicação ou variáveis de ambiente.

## Fluxo atual

O [workflow Deploy](../.github/workflows/deploy.yml) espera a conclusão bem-sucedida do workflow CI elegível da `main`, faz checkout do SHA aprovado e executa o cliente [deploy_local.py](../scripts/deploy/deploy_local.py). Docker Buildx constrói e publica as imagens no registry; o cliente resolve o digest e solicita deploy via API. Depois, [verificar_rollout.py](../scripts/deploy/verificar_rollout.py) compara o commit servido nos endpoints públicos. Disparo manual tem regra distinta e não depende do gate anterior de CI.

| Alvo | Imagem/deployment | Porta do contêiner | Health |
| --- | --- | --- | --- |
| `backend` | `nofluxo-backend` | 3325 | `/health` |
| `frontend` | `nofluxo-frontend` | 3000 | `/health.json` |
| `mcp-agent` | `nofluxo-mcp-agent` | 8000 | `/health` |

Namespace, domínios, uma réplica por alvo e classe de aplicação estão configurados em `APPS`. A configuração não comprova a revisão atualmente servida, o Service gerado ou o estado do cluster. A API de deploy e os manifests gerados por ela não estão neste repositório.

## Papel desta pasta

| Entrada | Uso |
| --- | --- |
| [local_build_and_deploy](./local_build_and_deploy/README.md) | Templates genéricos; para NoFluxo, use `scripts/deploy/`. |
| [deploy_client](./deploy_client/README.md) | Cliente genérico por flags, independente do fluxo específico do produto. |
| [templates](./templates/README.md) | Exemplos de Dockerfile/workflow/dashboard para adaptação em outros projetos. |
| [monitoring](./monitoring/README.md) | Referências de observabilidade e dashboards versionados; não são manifests instaláveis do cluster. |

A documentação canônica distingue configuração, testes locais, publicação e observação de produção. Não há evidência local suficiente para afirmar topologia K3s/Tailscale, retenção de dados, TLS/DNS atual ou disponibilidade de Grafana/Prometheus/Loki.

Push, merge, deploy, mudança de DNS, registry ou cluster precisam da autorização aplicável. Segredos ficam em `.env` fora do Git. Acesso a credenciais não autoriza publicar nem alterar infraestrutura. Veja [AGENTS.md](../AGENTS.md) e o [protocolo KB](../docs/kb/_PROTOCOL.md).
