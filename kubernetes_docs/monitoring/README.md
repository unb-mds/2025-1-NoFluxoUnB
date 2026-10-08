# Observabilidade: referências disponíveis

Esta pasta contém referências de observabilidade e três dashboards JSON:

| Arquivo | Escopo pretendido |
| --- | --- |
| [apps-logs-dashboard.json](./dashboards/apps-logs-dashboard.json) | Logs de aplicações. |
| [builds-dashboard.json](./dashboards/builds-dashboard.json) | Builds e workloads. |
| [node-connectivity-dashboard.json](./dashboards/node-connectivity-dashboard.json) | Conectividade de nós. |

São artefatos para revisão/adaptação. Sua presença no Git não comprova importação no Grafana, datasources configurados, métricas chegando ou alertas funcionando.

Não há nesta pasta manifests de instalação nem valores Helm atuais para certificar a topologia ou retenção de Prometheus/Grafana/Loki. Consulte a configuração e os runbooks mantidos pelo administrador da infraestrutura antes de executar instalação, upgrade, restart ou mudança de armazenamento.

## Evidência específica do NoFluxo

O cliente de publicação [scripts/deploy/deploy_local.py](../../scripts/deploy/deploy_local.py), símbolo `_deploy_payload`, envia porta, réplicas, domínio/TLS, health path, classe e runtime env. Ele não envia configuração de métricas ou de sincronização de dashboards. A existência desses recursos no cluster depende de verificação externa autorizada.

O [verificador de rollout](../../scripts/deploy/verificar_rollout.py) consulta `/health` do backend/MCP e `/health.json` do frontend, usando os domínios configurados em `APPS`. Ele compara o SHA público e não valida dependências, SLA, latência ou comportamento dos usuários.

Quando houver autorização para investigar um incidente, correlacione commit esperado, target/configuração publicada, eventos/logs do workload e observação funcional. Evite copiar tokens, dados pessoais ou payloads integrais de estudantes para documentação ou dashboards. Métricas devem usar labels com cardinalidade limitada; não registrar IDs de alunos em labels.

Detalhes e limites atuais: [Deploy e operações](../../docs/kb/subsystems/deployment-ci-and-operations.md) e [Autenticação e segurança](../../docs/kb/subsystems/auth-security-and-privacy.md). A documentação desta pasta não concede acesso ao cluster nem autoriza operações.
