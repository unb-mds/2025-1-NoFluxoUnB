# Docker e publicação

Os artefatos containerizados rastreados do NoFluxoUNB são três imagens de produção independentes. A configuração é [APPS](./scripts/deploy/deploy_config.py); a explicação canônica está em [Deploy e operações](./docs/kb/subsystems/deployment-ci-and-operations.md).

| Dockerfile | Build | Runtime |
| --- | --- | --- |
| [k8s.backend.Dockerfile](./k8s.backend.Dockerfile) | Node 20 Alpine, npm e TypeScript | Express `dist/index.js`, porta 3325, usuário 1001, health `/health`. |
| [k8s.frontend-svelte.Dockerfile](./k8s.frontend-svelte.Dockerfile) | pnpm 10.12.1, SvelteKit adapter-static | nginx, porta 3000, SPA fallback e health `/health.json`. |
| [k8s.mcp-agent.Dockerfile](./k8s.mcp-agent.Dockerfile) | Python 3.11, requirements do agent | FastAPI `api_producao:app`, Uvicorn em 8000 com dois workers, usuário 1001. |

O frontend incorpora `PUBLIC_*` no build; mudanças nesses valores precisam de rebuild. Backend e agent recebem variáveis de runtime. O SHA segue em `GIT_SHA` para a verificação de versão; `/health.json` do frontend é gerado no build. Health de processo e versão não comprovam que banco, autenticação ou respostas de IA estejam funcionais.

O [workflow de deploy](./.github/workflows/deploy.yml) constrói com Buildx no runner, publica no registry, resolve digest e solicita deploy à API. Ele espera o CI elegível da main e depois consulta a revisão pública. Disparo manual possui regra distinta. Não há auto-update por Git dentro dessas imagens, parser Python/OCR embutido no backend ou container de banco declarado por esses Dockerfiles.

## Desenvolvimento local

Não há Compose ou Dockerfiles de desenvolvimento rastreados que permitam reproduzir uma stack local com um único comando. Arquivos ignorados de conveniência individual não são contrato do repositório. Use o setup rastreado de [CONTRIBUTING.md](./CONTRIBUTING.md) para frontend, backend e MCP agent.

Para entender o cliente específico, veja [build local e deploy](./kubernetes_docs/local_build_and_deploy/README.md). `--no-push` ainda pode solicitar deploy; `--redeploy --dry-run` pode imprimir runtime env. Não usar essas flags como garantia de isolamento ou de redação de segredos.

Segredos ficam em `.env` fora do Git. Revise o [.dockerignore](./.dockerignore) e os `COPY` dos Dockerfiles ao alterar contexto; não envie arquivos de credenciais à imagem ou logs. Build, publicação de imagem e alteração de recursos externos são operações distintas. Este guia não autoriza push, merge, deploy ou mudanças no cluster.
