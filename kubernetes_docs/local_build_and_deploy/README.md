# Build local e solicitação de deploy

Esta pasta conserva templates genéricos de cliente/configuração. O cliente em uso pelo NoFluxoUNB é [scripts/deploy/deploy_local.py](../../scripts/deploy/deploy_local.py), com [APPS](../../scripts/deploy/deploy_config.py). Não copie a configuração de exemplo desta pasta sobre os alvos do produto.

A referência completa é [Deploy e operações](../../docs/kb/subsystems/deployment-ci-and-operations.md). O fluxo é build Docker → push de imagem → resolução do digest → solicitação à Deploy API. O workflow de produção usa esse mesmo cliente em GitHub Actions, com Buildx `linux/amd64`; não usa o exemplo de build Kaniko desta pasta.

## Inspeção local

A partir da raiz, estes comandos mostram ajuda sem construir, publicar ou consultar a API (o segundo requer as dependências Python do cliente já instaladas):

```bash
python scripts/deploy/deploy_local.py --help
python scripts/deploy/verificar_rollout.py --help
```

Dependências declaradas: [scripts/deploy/requirements.txt](../../scripts/deploy/requirements.txt). A instalação exige download de pacotes; não configura autenticação no registry nem credenciais da Deploy API.

## Comportamentos que precisam ser considerados antes de publicar

- Alvos aceitos: `backend`, `frontend`, `mcp-agent`, `all`.
- Plataforma padrão do CLI: `linux/amd64,linux/arm64`; `--platform native` usa build nativo. O workflow usa explicitamente `linux/amd64`.
- `--redeploy` reutiliza digest do cache `.deploy/build-id.<alvo>.json`, relativo ao diretório de execução. O cache é salvo depois de resolver digest, antes de confirmar deploy: não é recibo de rollout bem-sucedido nem rollback garantido.
- `--no-push` suprime publicação de imagem, mas ainda tenta resolver digest e solicitar deploy. Não é modo de build local isolado.
- `--dry-run` de build normal oculta valores no preview, mas exige variáveis e credenciais. `--redeploy --dry-run` imprime payload com variáveis de runtime: a saída pode conter segredos.
- `--no-cache` não é opção do CLI específico `scripts/deploy/deploy_local.py`.
- `load_env_files` carrega `.env.local` sem sobrescrever variáveis existentes, depois `.env` do alvo e `--env-file` com override. Backend/MCP usam `.env` da raiz; frontend usa `frontend/.env`. Isso difere dos arquivos de ambiente usados para iniciar serviços de desenvolvimento.
- O CLI pode concluir quando a API aceita a solicitação; só o verificador separado compara o commit público. Essa comparação ainda não demonstra funcionamento de autenticação, banco ou IA.

Deploy modifica recursos externos e exige autorização. Guarde segredos fora do Git, não compartilhe previews com valores e confira alvo, commit e ambiente antes da publicação. Para configuração de desenvolvimento sem publicação, veja [CONTRIBUTING.md](../../CONTRIBUTING.md).
