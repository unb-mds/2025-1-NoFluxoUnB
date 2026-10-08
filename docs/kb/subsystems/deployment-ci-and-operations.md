---
id: SUB-ops
aliases:
  - deploy rollout CI Docker K3s Kubernetes testes
watches:
  - .claude/settings.json
  - .claude/skills/motor2-git-workflow/**
  - frontend/package.json
  - backend/package.json
  - mcp_agent/requirements.txt
  - package.json
  - CONTRIBUTING.md
  - DOCKER_README.md
  - docs/capacity/**
related:
  - SUB-backend
  - SUB-frontend
  - SUB-ai
  - SUB-data
  - SUB-security
title: Deploy, CI e operações
owns:
  - .github/**
  - scripts/deploy/**
  - kubernetes_docs/**
  - k8s.*.Dockerfile
status: source-reviewed
last_verified: 2026-10-08
---

# Deploy, CI e operações

Esta página descreve configuração e código revisados no checkout. Não houve
consulta ao cluster, GitHub Actions, registry, banco ou endpoints públicos, nem
execução de deploy. As URLs, réplicas e infraestrutura abaixo são os alvos
configurados; não constituem comprovação do estado em produção. `AGENTS.md`
proíbe `git push` e merge sem autorização explícita do mantenedor.

## Caminho de publicação atual

O workflow [Deploy](../../../.github/workflows/deploy.yml), job `deploy`, espera
`workflow_run` concluído do workflow chamado `CI` na branch `main`. Além do
nome, sua condição exige o arquivo `.github/workflows/pipelineCI.yml`, conclusão
`success`, evento de origem `push` e `head_repository.full_name` igual ao
repositório. Isso evita publicar pelo fim do workflow de documentação ou por
um PR de fork. O checkout usa `workflow_run.head_sha`, preservando o commit que
passou no CI mesmo se o HEAD de `main` avançar. `workflow_dispatch` permite
publicação manual dos alvos `all`, `backend`, `frontend` e `mcp-agent` e **não
exige o gate anterior de CI**. A configuração utiliza `environment: production`;
as regras de proteção desse ambiente não são verificáveis pelos arquivos locais.

O job instala Python 3.11, `requests` e `python-dotenv`, configura Buildx/QEMU,
autentica no registry privado com até cinco tentativas de login e executa
`scripts/deploy/deploy_local.py` com `--platform linux/amd64 --wait --stream-logs`.
O SHA publicado segue como `GIT_SHA`. Não há filtro de caminhos no workflow de
deploy: uma publicação automática usa `all` após o CI bem-sucedido de `main`,
inclusive para mudanças só de documentação. O gate depende exclusivamente do
workflow `CI`; não espera a conclusão de `Security and Code Quality`,
`Security Scan` ou `Acessibilidade (axe)`.

Depois do deploy, `verificar_rollout.py` consulta o endpoint público de versão
por até 600 segundos. Sucesso da Deploy API é aceitação do pedido; a segunda
etapa exige que cada alvo responda com o commit esperado. Isso verifica versão
publicada, não cobre autenticação, banco, respostas de IA ou fluxos do usuário.

O workflow [Deploy Auto-retry](../../../.github/workflows/deploy-auto-retry.yml)
executa `gh run rerun --failed` quando um run de `Deploy` falha e
`run_attempt < 4`. Sua condição abrange **qualquer falha**, não apenas login no
registry; portanto uma falha de rollout também pode provocar nova publicação
do job em outro runner. O comentário atribui a motivação a falhas de rede por IP
do runner; isso é histórico registrado, não diagnóstico realizado nesta revisão.

## Unidades publicáveis e configuração

A fonte específica do NoFluxo é [deploy_config.py](../../../scripts/deploy/deploy_config.py),
símbolos `AppConfig`, `APPS` e `get_app_config`. Todos os alvos declaram namespace
`non-business-apps`, classe `non-business`, uma réplica e build context na raiz.
O payload produzido por `_deploy_payload` ativa TLS, porta, health path,
domínio, classe e variáveis de runtime; não especifica requests/limits, estratégia
de atualização, métricas ou detalhes das probes do cluster. Esses detalhes
dependem da Deploy API externa, cujo servidor não está neste checkout.

| Alvo | Deployment / imagem | Porta do contêiner | Domínio configurado | Health e versão |
| --- | --- | --- | --- | --- |
| `backend` | `nofluxo-backend` | 3325 | `api-nofluxo.crianex.com` | `/health` |
| `frontend` | `nofluxo-frontend` | 3000 | `no-fluxo.crianex.com` | `/health.json` |
| `mcp-agent` | `nofluxo-mcp-agent` | 8000 | `darcy-nofluxo.crianex.com` | `/health` |

- Backend exige `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_ANON_KEY` e `MCP_AGENT_API_KEY`. Variáveis opcionais incluem RAGFlow,
  Maritaca, Google e `GIT_SHA`. Valores estáticos são `NODE_ENV=production`,
  `PORT=3325` e `SABIA_API_URL=http://nofluxo-mcp-agent`. A URL sem porta é
  configuração para o Service interno; o mapeamento de porta desse Service não
  está comprovado pelo código local.
- Frontend exige `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY` no build.
  `PUBLIC_API_URL`, `PUBLIC_REDIRECT_URL` e `PUBLIC_ENVIRONMENT` têm valores
  estáticos de produção; `GIT_SHA` é build arg opcional. Não injeta variáveis de
  runtime no nginx: mudar configuração pública exige reconstruir o bundle.
- MCP agent exige `MARITACA_API_KEY`, `GOOGLE_API_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` e `MCP_AGENT_API_KEY`; `GIT_SHA` é opcional.
  `ALLOWED_ORIGINS` declara as origens do frontend e backend de produção.

Os valores secretos não pertencem à KB. O workflow referencia GitHub Secrets;
o deploy local carrega `.env.local`, `.env` do alvo e `--env-file` pelo símbolo
`load_env_files`. `.env.local` só preenche variáveis ausentes; `.env` do alvo e
arquivo explícito usam `override=True`. Backend/MCP usam `.env` da raiz por
`build_context`; frontend usa `frontend/.env` por `env_folder`. Credenciais da
Deploy API são resolvidas em `main` antes do carregamento por alvo.

## Imagens efetivamente construídas

| Dockerfile | Build | Runtime e limitações do artefato |
| --- | --- | --- |
| [k8s.backend.Dockerfile](../../../k8s.backend.Dockerfile) | Node 20 Alpine, `npm ci --ignore-scripts` com fallback para `npm install --ignore-scripts`, `npx tsc` | Node `dist/index.js`, usuário 1001, `/health` na porta 3325. Copia `node_modules` completo do builder, inclusive dependências de desenvolvimento; não embute parser Python/OCR. |
| [k8s.frontend-svelte.Dockerfile](../../../k8s.frontend-svelte.Dockerfile) | Node 20 Bullseye, pnpm 10.12.1, `pnpm install --frozen-lockfile`, `pnpm build` | nginx 1.27 Alpine, SPA fallback para `index.html`, arquivos `/_app/` com cache de um ano e `gzip_static`; `/health.json` com `Cache-Control: no-store`. Gera JSON contendo `GIT_SHA` e remove sidecars `health.json.gz`/`.br` gerados antes da sobrescrita, para `gzip_static` não servir o SHA antigo. |
| [k8s.mcp-agent.Dockerfile](../../../k8s.mcp-agent.Dockerfile) | Python 3.11 slim, dependências de `mcp_agent/requirements.txt` instaladas em `/install` | Copia os módulos `*.py` da raiz de `mcp_agent`; Uvicorn `api_producao:app`, porta 8000, dois workers, usuário 1001. Não copia diretórios auxiliares na imagem final. |

Os healthchecks de Docker e os `healthPath` enviados à Deploy API são camadas
diferentes: o primeiro consta da imagem, enquanto o segundo depende de como a
API gera manifests. O backend fornece `commit: process.env.GIT_SHA || null` em
`backend/src/index.ts`, rota `/health`; o agent fornece `os.getenv("GIT_SHA")` em
`mcp_agent/api_producao.py`, função `health_check`.

O [.dockerignore](../../../.dockerignore) exclui `.env.local`, `.env*` das três
pastas de aplicação, caches, documentos, DBA, Supabase e sobras Flutter. Não tem
regra geral para `.env` da raiz. Os Dockerfiles atuais copiam arquivos específicos
e não copiam esse `.env` para a imagem, mas sua exclusão do build context não
está garantida pela regra atual. Isso é uma limitação de configuração observada;
não houve leitura de arquivos secretos nem investigação de exposição.

## CLI local, digest e confirmação de rollout

[deploy_local.py](../../../scripts/deploy/deploy_local.py) implementa o cliente
específico do produto; os scripts de `kubernetes_docs/` são helpers/templates
separados. Símbolos principais:

- `run_local_deploy`: coleta build args/runtime env, constrói e publica imagem,
  resolve digest em `GET /registry/{image_name}/digest?tag=...`, salva
  `BuildIdState` e envia `POST /build` com `buildId` e `deploy=True`. Pode aguardar
  status e logs com `DeployApiClient` ou `stream_logs_until_done`.
- `BuildIdState`, `save_state`, `load_state`, `_default_state_path`: estado por
  alvo em `.deploy/build-id.<alvo>.json` relativo ao diretório de execução,
  contendo digest e metadados de imagem. `run_local_deploy` chama `save_state`
  depois da resolução do digest e **antes** de `client.start_build` e da
  confirmação de publicação. O cache não é recibo de deploy bem-sucedido.
  Rodar da raiz e de `scripts/deploy/` usa caches diferentes.
  `--redeploy` usa esse digest; não significa rollback para
  uma versão anteriormente comprovada como saudável.
- `build_parser`: plataforma padrão `linux/amd64,linux/arm64`; `native` desativa
  plataforma explícita. Buildx publica durante o build quando aplicável.
  `--no-push` só suprime o push: o fluxo ainda resolve digest e solicita deploy,
  portanto não é modo de build local isolado. `--no-cache` não existe no parser.
- `run_local_deploy --dry-run` não executa build/push/requisições, mas exige env
  obrigatório e credenciais e oculta os valores no preview. Já
  `run_redeploy --dry-run` imprime o payload completo com valores de runtime:
  sua saída pode conter segredos. Não usar esse preview em logs compartilhados.

[verificar_rollout.py](../../../scripts/deploy/verificar_rollout.py) implementa
`apps_do_alvo`, `commit_no_ar`, `mesmo_commit` e `esperar`. Consultas incluem
cache buster e `Cache-Control: no-cache`; erro de rede/JSON retorna `None`.
Compara SHA completo ou abreviado por prefixo, com mínimo de sete caracteres,
usa prazo monotônico e intervalo padrão de 15 segundos. Localmente o comando
de deploy não chama esse verificador: é preciso executar a confirmação
separadamente quando uma publicação tiver autorização.

## CI, qualidade, testes e publicações auxiliares

[pipelineCI.yml](../../../.github/workflows/pipelineCI.yml) usa permissão
`contents: read`, concorrência por ref e cancelamento de runs anteriores. PRs
executam jobs por filtros de caminhos; pushes em `main` **e `dev`** executam todos.
Uma mudança no próprio workflow ativa todas as áreas. Alterações de
`deploy.yml` ou `security-and-quality.yml` também ativam o job de backend para
as guardas estáticas de workflows.

| Job / workflow | Comando e escopo | O que a configuração permite concluir |
| --- | --- | --- |
| `qualidade-python` | Python 3.11; Black 25.11.0 e Flake8 7.3.0; `black --check .`, `flake8 .` | Formatação/lint da raiz, com ignores/excludes de `setup.cfg`; não é teste funcional. |
| `testes-python` | Instala Tesseract, idioma português, Poppler e requirements; `python -m pytest` em `DBA/tests` | `DBA/tests/pytest.ini` mede `expressao_parser` e `DBA.parse_pdf.pdf_parser_final`, com fail-under 45. Não executa automaticamente unittest de rollout ou toda a suíte do MCP agent. |
| `testes-backend` | Node 20, `npm ci`, `npm run lint` (ESLint; só erros reprovam, avisos ficam no log) e `npm test` em `backend` | Lint com `.eslintrc.js` + `tsconfig.eslint.json` cobrindo `src/` e `tests-ts/` (#248). Jest/ts-jest encontra `tests-ts/**/*.test.ts` e `src/**/__tests__/**/*.test.ts` conforme `backend/package.json`. |
| `testes-frontend` | Node 20, `npm ci`, `npx vitest run --passWithNoTests` em `frontend` | Injeta `PUBLIC_*` sintéticos para importação do client Supabase; não executa build, `svelte-check` ou suíte Playwright geral. |
| `Security and Code Quality` | Backend `npm audit --audit-level=moderate --omit=dev` e `tsc` com opções estritas | Runs em PR/push de `main`/`dev`; frontend audit high tem `continue-on-error: true` com TODO(R56). Não faz parte do gate de Deploy. |
| Relatórios semanais do mesmo workflow | Safety, Bandit, ESLint, Flake8, Black, isort, mypy e dependências desatualizadas | Muitos comandos têm `|| true`; são informativos. Bandit e lint Python desses relatórios miram `DBA/tests/`. Cron `0 2 * * 0` é UTC. |
| [a11y.yml](../../../.github/workflows/a11y.yml) | `npm run test:a11y`, Chromium, `npm run test:e2e:a11y` | Job `continue-on-error: true`, acionado por frontend em PR/main; relatório Playwright retido sete dias. Não é suíte E2E geral bloqueante. |
| [ci.yml](../../../.github/workflows/ci.yml) / `Docs (mkdocs)` | Instala MkDocs Material; `mkdocs gh-deploy --force` em push de main | Publica o site definido em `mkdocs.yml` na raiz e `documentacao/`; não publica automaticamente a KB interna de `docs/`. |
| [security_scan.yml](../../../.github/workflows/security_scan.yml) | Gitleaks 8.30.1, histórico completo, `.gitleaks.toml`, baseline | Push de main, diário `0 6 * * *` UTC ou manual; achados novos reprovam. Registra resumo/fingerprints no Supabase `security_scans`, sem valores de segredos no payload. É workflow com escrita externa. |

Os comentários da baseline dizem que achados históricos pertencem ao incidente
de 2026-09-04 e tiveram chaves rotacionadas. A revisão confirmou a referência e
o mecanismo, não a rotação efetiva de credenciais. Branch protection e resultados
recentes de CI também permanecem não verificados.

Comandos locais definidos nas fontes: `npm run test:unit`/`test:coverage` para
Vitest, `npm run test:integration` para Playwright e `npm run check` para
`svelte-check` no frontend; `npm test`, `npm run type-check`, `npm run build`
no backend; `python -m pytest` em `DBA/tests`; Black/Flake8 na raiz.
`frontend/playwright.config.ts` usa Chromium, um worker, sem retries,
`http://localhost:5173` e web server `npm run dev`, reutilizando server existente.
Isto não é configuração de teste E2E contra produção.

`backend/tests-ts/ci-workflows.test.ts` verifica condições do gate, SHA de
checkout, ausência de nome concorrente com `CI` e audit do frontend/backend.
`scripts/deploy/test_verificar_rollout.py` tem sete testes com `commit_no_ar`
substituído; passou nesta revisão com
`python3 -m unittest discover -s scripts/deploy -p test_verificar_rollout.py`.
Essa evidência é local, sem rede, e não comprova publicação real. Não foram
executadas as demais suítes nem builds de imagem nesta revisão documental.

## Atualização agendada de dados acadêmicos

Os workflows abaixo escrevem dados no Supabase e podem também commitar dados
coletados; são automações existentes, não comandos executados nesta revisão.
Usam Python 3.9 e `DBA/scraping/requirements.txt`:

| Workflow | Gatilho | Cadeia implementada |
| --- | --- | --- |
| [scrape_calendario.yml](../../../.github/workflows/scrape_calendario.yml) | Manual ou segunda `0 2 * * 1` UTC | `scraping_calendario_academico.py` → `05_insert_calendario_academico.py`; sem commit de JSON; concorrência serializada. |
| [scrape_ementa.yml](../../../.github/workflows/scrape_ementa.yml) | Manual ou dia 1 do mês, `0 0 1 * *` UTC | `scraping_ementa.py` → `01_insert_cursos_matrizes_materias.py` → tentativa de auto-commit de `DBA/dados/estruturas-curriculares/**/*.json`. |
| [scrape_equivalencias.yml](../../../.github/workflows/scrape_equivalencias.yml) | Manual ou conclusão bem-sucedida de `Scrape Ementa` | `scraping_equivalencias.py` → `02_insert_pre_requisitos_equivalencias.py` → tentativa de auto-commit de `DBA/dados/materias/**/*.json`. |
| [scrape_turmas_lite.yml](../../../.github/workflows/scrape_turmas_lite.yml) / `Fast Sync Turmas` | Manual, conclusão de `Scrape Equivalencias` ou cron `*/30 * * * *` UTC | `jobDecisao` consulta RPC `scraping_turmas_decisao`; se habilitado, scrape → `03_insert_turmas.py` → `04_reconciliar_turmas.py --ano-periodo`. |

Para turmas, disparo manual ignora cadência; encadeamento mensal exige conclusão
`success` e ignora cadência, inclusive modo off. Cron `rapida` passa sempre;
`diaria` passa quando a hora UTC é `03`, permitindo nominalmente as rodadas de
03:00 **e 03:30**, não uma única execução diária. Outras cadências não passam.
Falha da RPC cai para cadência diária e período estimado por mês, com warning.
`run_started_at` precede a coleta e é transmitido à reconciliação. Concorrência
`cancel-in-progress: false` impede simultaneidade deste workflow. A existência
de regras seguras no reconciliador deve ser consultada na documentação de dados;
a tabela aqui descreve apenas a orquestração. Logs de banco que usam service role
são excluídos dos artifacts; só os logs de scraping são publicados.

[dependabot.yml](../../../.github/dependabot.yml) configura npm de backend
semanalmente e GitHub Actions mensalmente, com grupos de segurança/produção/dev.
Frontend está excluído por usar npm lockfile no CI e pnpm lockfile no build da
imagem. `@openai/agents` fica fora do grupo `producao-minor-patch` (SDK 0.x quebra
API em "minor"; #251) e vem em PR próprio. Os dois devem permanecer coerentes; a configuração não comprova que
isso ocorre hoje ou que alertas atuais foram resolvidos.

## Bootstrap e limites dos runbooks

`scripts/setup_env.py` é o bootstrap chamado pelo `package.json` da raiz:
`setup`, `setup:python` e `setup:node`. `get_venv_dir` prefere `venv` existente,
depois `.venv`, ou cria `venv`. `ensure_virtualenv` atualiza pip; `main` instala
requirements consolidados por padrão ou os alvos `--dba`, `--scraping`,
`--agent`. `--node` instala backend e frontend, preferindo pnpm se disponível.
Não cria segredos nem comprova serviços locais prontos. O workspace
`pnpm-workspace.yaml` lista frontend, backend e DBA; CI usa npm separadamente.

Os guias de entrada [CONTRIBUTING.md](../../../CONTRIBUTING.md) e
[DOCKER_README.md](../../../DOCKER_README.md) descrevem agora setup local
rastreado, os três artefatos de produção e a ausência de Compose de
desenvolvimento rastreado. São superfícies acompanhadas por este dossier e
possuídas por `SUB-project`.

`kubernetes_docs/` conserva o helper genérico `deploy_client`, templates de
Docker/workflow/dashboards e guias de digest, registry e observabilidade.
Os READMEs separam esses exemplos do cliente específico em `scripts/deploy/`;
o cliente genérico não carrega `.env` automaticamente nem verifica o commit
público depois do pedido. A configuração do servidor da Deploy API é externa.
Não há
manifests atuais de cluster suficientes para certificar topologia, retenção,
serviços, réplicas reais, endpoints de métricas ou dashboard sincronizado do
NoFluxo. `_deploy_payload` do produto não envia bloco `metrics`.

## Consolidação documental e limites conhecidos

- `AGENTS.md` e os guias de entrada agora descrevem CI elegível, SHA aprovado,
  Buildx/digest e confirmação de versão pública. Referências a caminhos
  ausentes de setup/API e garantias de instalação/retenção/DNS/dashboard foram
  removidas dos guias de infraestrutura.
- Os dois antigos guias em `kubernetes_docs/migration_docs/` foram retirados
  por orientar alvos e fluxo já substituídos. Sua revisão de origem, hash,
  justificativa e destino estão no
  [manifesto de retirada](../_provenance/document-retirement.csv). Esse registro
  preserva rastreabilidade sem promover seus checklists a comprovação de
  migração ou decommissionamento realizado.
- Guias de tooling agora usam `PYTHONPATH=kubernetes_docs`, distinguem os
  parsers genérico/específico e explicam que cache de digest precede confirmação
  de deploy. Os JSONs de dashboard continuam sendo artefatos versionados;
  não há afirmação de importação ou coleta atual.
- Ementa/equivalências mantêm passos de auto-commit de JSON, mas `.gitignore`
  ignora `DBA/dados/**`, exceto `cursos-de-graduacao.json`. O workflow configura
  a tentativa; não prova que arquivos novos desses padrões sejam adicionados.
- `documentacao/testes/pipeline-ci.md` foi alinhado aos filtros de PR e aos
  comandos reais. Configuração local de workflow não comprova resultado de um run
  recente. Branch protection da `main` (configurada no GitHub em 08/10/2026, #163;
  lida pela API, não pelos arquivos do repo): exige Jest, Vitest, Pytest,
  Black + Flake8, Security Scan e Code Quality; sem `enforce_admins` e sem `strict`;
  force-push e exclusão bloqueados.
- `GIT_SHA` é opcional no CLI/config e obrigatório por convenção do workflow.
  Um deploy manual local pode gerar versão sem commit e falhar na confirmação.
- Configuração de audit frontend e a11y continua informativa; o gate automático
  não aguarda os workflows adicionais de segurança. Nenhuma conclusão sobre
  vulnerabilidades atuais foi inferida de comentários antigos.

Atualizações de operação devem começar pelas fontes específicas do produto
(`APPS`, CLI, Dockerfiles e workflows) e registrar separadamente testes locais,
execução de publicação, confirmação de versão pública e aceitação funcional.


## Auditoria operacional e planejamento posterior

As leituras externas de 07–08/10 são registradas separadamente em
[auditoria de capacidade](../../capacity/nofluxo-capacity-2026-10-07.md) e
[inventário de monitoramento](../../capacity/monitoring-plan-evidence-2026-10-08.json).
Não alteram o status de revisão de fonte das seções acima. O
[plano de monitoramento](../../capacity/plano-monitoramento-capacidade-2026-10-08.md)
propõe reutilizar a stack observada, acrescentar métricas/atividade e persistir
histórico isolado. DEC-CAP-001 e DEC-CAP-002 têm implementação `not-implemented`;
SQLite/PVC, R2, dashboards, alertas e testes de carga são contratos propostos,
com gates de identidade, privacidade, infraestrutura e recuperação. Nenhum deploy,
SQL, alteração de cluster ou carga de produção foi realizado para esse plano.


## Monitoramento v1.1 e custos de expansão — 08/10/2026

[Alinhamento operacional](../../capacity/alinhamento-marca-operacao-2026-10-08.md)
incorpora os PDFs de agosto/setembro como fontes datadas. Picos de matrícula 5×/10×,
fila, autoscaling, novas IES e SLA cloud são perfis/propostas, não recursos observados.
Vercel/RAGFlow na planilha não substituem o inventário K3s da auditoria.

A hipótese de armazenamento agora inclui 40 sinais/dia, estado de ator de 320 bytes
e coortes de 35 dias (192 bytes por novo cadastro). Teto de séries é global. 10 mil
DAU excedem os 16 GiB úteis da provisão inicial de 20 GiB e pedem novo orçamento;
custo R2 isolado não é custo do monitoramento completo. Nenhum PVC/tier foi mudado.
