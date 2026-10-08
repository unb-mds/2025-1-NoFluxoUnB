# Autenticação no registry

O registry configurado pelo NoFluxo é `registry.kubernetes.crianex.com`; veja [scripts/deploy/deploy_local.py](../scripts/deploy/deploy_local.py) e [workflow Deploy](../.github/workflows/deploy.yml). O domínio configurado não comprova disponibilidade atual nem a configuração de autenticação do servidor.

O workflow usa `REGISTRY_USERNAME` e `REGISTRY_PASSWORD` dos GitHub Secrets para `docker login` com `--password-stdin`. O cliente local pressupõe que o Docker já esteja autenticado antes de publicar. Credenciais devem ser obtidas pelo canal privado aprovado pelo administrador; não ficam nesta documentação ou no Git.

Não há manifests de registry ou configuração de autenticação de servidor suficientes neste repositório para indicar qual Secret deve ser alterado, quais contas existem ou como aplicar rotação. Gestão de usuários, hashes de senha, rede e restart pertencem ao runbook atual da infraestrutura. Antes de qualquer alteração, o administrador precisa confirmar configuração real, consumidores e procedimento de rotação/recuperação.

Para operadores autorizados: use credenciais próprias para o ambiente, mantenha senha fora de argumentos/saída compartilhada e confirme o registry exato antes de autenticar/publicar. Não extraia Secrets do cluster para relatórios nem substitua contas existentes com exemplos de configuração. Acesso às credenciais não autoriza deploy ou administração do registry.

[Deploy e operações](../docs/kb/subsystems/deployment-ci-and-operations.md) documenta os clientes e limites de evidência. [AGENTS.md](../AGENTS.md) exige autorização explícita para push/merge e proíbe segredos hardcoded.
