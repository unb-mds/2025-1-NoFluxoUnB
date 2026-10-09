# Métricas de aplicação: limites e integração

Esta é uma referência de engenharia para uma futura integração autorizada. A existência deste arquivo e dos dashboards não demonstra coleta de métricas em produção.

## Situação descrita pela fonte

O payload específico do NoFluxo em `scripts/deploy/deploy_local.py:_deploy_payload` não inclui bloco `metrics` ou configuração de ServiceMonitor. `scripts/deploy/deploy_config.py:AppConfig` declara porta/health/domínio/réplicas e env, não uma porta dedicada de métricas. O cliente de deploy e os health endpoints não são comprovação de instrumentação Prometheus.

O [workflow genérico de exemplo](../templates/github-workflow.yml) conserva opções para métricas. Esse exemplo não é usado pelo workflow do produto e sua compatibilidade com a Deploy API externa precisa de confirmação. Não há código do servidor da Deploy API neste checkout para garantir criação automática de annotations, ServiceMonitor ou sincronização de dashboard.

## Trabalho necessário para uma integração

1. Definir as perguntas operacionais e as métricas necessárias, como volume de requisições, duração e falhas por rota/status.
2. Revisar instrumentação existente e bibliotecas/dependências no serviço alvo, com testes apropriados e política de dados.
3. Definir porta e acesso: publicar métricas na mesma porta/domínio pode expor essa rota. Uma porta separada só fica privada quando Service, ingress e políticas de rede forem verificados.
4. Confirmar com o administrador o contrato de descoberta/coleta, labels, autenticação e retenção; registrar configuração específica sem copiar segredos.
5. Verificar coleta por um Prometheus autorizado, séries e queries, dashboard importado e comportamento de alertas. Fonte ou JSON válido não substitui essa observação.

Evite labels com IDs de alunos, tokens, prompts, payloads ou URLs sem normalização. Use labels de cardinalidade limitada e rotas normalizadas. Logs e métricas são superfícies diferentes: um dashboard de Loki não prova presença de séries Prometheus.

Arquivos disponíveis e limites de infraestrutura: [monitoring/README.md](./README.md). Configuração do produto: [Deploy e operações](../../docs/kb/subsystems/deployment-ci-and-operations.md). Privacidade e credenciais: [Autenticação e segurança](../../docs/kb/subsystems/auth-security-and-privacy.md). Alterações de instrumentação e configuração de coleta requerem revisão específica; este guia não executa ou autoriza operações externas.
