# Templates genéricos de infraestrutura

Esta pasta contém exemplos para adaptação em outros projetos. Eles não são a configuração de deploy do NoFluxoUNB e não devem substituir seu workflow ou Dockerfiles.

| Arquivo | Papel |
| --- | --- |
| [github-workflow.yml](./github-workflow.yml) | Exemplo genérico de chamada à Deploy API com build remoto. |
| [Dockerfile.node](./Dockerfile.node) | Exemplo de imagem Node.js. |
| [Dockerfile.python](./Dockerfile.python) | Exemplo de imagem Python. |
| [Dockerfile.go](./Dockerfile.go) | Exemplo de imagem Go. |
| [.dockerignore](./.dockerignore) | Padrões genéricos de exclusão de contexto. |
| [grafana-dashboard.template.json](./grafana-dashboard.template.json) | JSON de dashboard com placeholders. |

O workflow genérico pode enviar opções de métricas e dashboard. Isso não comprova que a API externa aceite essas opções hoje, que configure DNS/TLS automaticamente ou que importe dashboards. Seu contrato deve ser confirmado com o administrador antes de uso. Não há garantia de tempo de build nem de disponibilidade inferida desses exemplos.

## Configuração do produto

Para NoFluxo, revise [workflow Deploy](../../.github/workflows/deploy.yml), [APPS](../../scripts/deploy/deploy_config.py) e os [Dockerfiles atuais](../../DOCKER_README.md). O workflow espera o CI elegível, faz checkout do SHA aprovado e usa Docker Buildx/digest; em seguida confirma o commit público. Copiar o template sobre ele removeria esses controles.

Novos alvos precisam de configuração própria, env fora do Git, revisão de exclusões do build context e confirmação dos contratos de publicação. Push, merge e operações externas exigem autorização. Consulte [Deploy e operações](../../docs/kb/subsystems/deployment-ci-and-operations.md) para os limites de evidência e o [protocolo KB](../../docs/kb/_PROTOCOL.md) para manutenção documental.
