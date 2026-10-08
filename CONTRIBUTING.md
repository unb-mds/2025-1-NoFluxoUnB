# Contribuir e configurar o ambiente local

Antes de explorar uma área, consulte `npm run kb:query -- "<pergunta>"` e o [índice da KB](./docs/kb/INDEX.md). Leia o dossier dono e os contratos acompanhados antes de alterar comportamento. O [protocolo](./docs/kb/_PROTOCOL.md) explica a manutenção da documentação e a distinção entre fonte, testes, SQL, deploy e produção.

## Componentes e requisitos

| Componente | Tecnologia | Entrada local |
| --- | --- | --- |
| [Frontend](./frontend/README.md) | SvelteKit 2, Svelte 5, Tailwind 4 | Vite em 5173. |
| [Backend](./backend/README.md) | Express, TypeScript, Supabase | Porta por `PORT`; default 3000, exemplo 3325. |
| [MCP agent](./mcp_agent/README.md) | FastAPI, Gemini embeddings, Maritaca | Uvicorn `api_producao:app` em 8000. |
| [DBA](./DBA/README.md) | Python, scraping/ingestão e parser | Scripts específicos; não é servidor da aplicação. |

Use Node 20.19 ou superior dentro da linha 20, compatível com os requisitos do toolchain frontend; o CI configura Node `20.x`. A versão do package manager declarada é pnpm 10.12.1. O workspace lista frontend, backend e DBA; `npm ci` por pacote reproduz a instalação usada no CI. O build da imagem frontend usa seu lockfile pnpm. Mantenha os lockfiles npm/pnpm coerentes ao alterar dependências.

Python 3.11 é a versão utilizada pelo CI de testes e pela imagem do MCP agent. Instale Tesseract com idioma português e Poppler para os testes que exercitam OCR/PDF; o CI instala esses binários separadamente. Docker é necessário para builds containerizados, não para o setup local abaixo.

## Instalação

Na raiz do checkout, o bootstrap rastreado cria/reutiliza um venv, atualiza pip e baixa dependências Python/Node:

```bash
python scripts/setup_env.py --node
```

`scripts/setup_env.py` prefere `venv` já existente, depois `.venv`, ou cria `venv`. Ative o diretório escolhido: `source venv/bin/activate` em macOS/Linux; `venv\Scripts\Activate.ps1` no PowerShell. O script imprime a instrução correspondente. Para instalar apenas um grupo Python, use `--dba`, `--scraping` ou `--agent`; `--node` adiciona backend/frontend usando pnpm se disponível ou npm.

Alternativa por pacote para Node, seguindo CI:

```bash
cd backend
npm ci
cd ../frontend
npm ci
```

## Configuração privada

Copie `backend/.env.example` para `backend/.env` e `frontend/.env.example` para `frontend/.env`, preenchendo somente valores autorizados para o ambiente de desenvolvimento. Segredos não podem entrar no Git, frontend `PUBLIC_*`, screenshots ou logs. A service role é credencial de servidor; o frontend usa anon key e sessão do usuário.

Backend usa `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SABIA_API_URL` e a chave compartilhada `MCP_AGENT_API_KEY`. Para desenvolvimento, configure `NODE_ENV=development`, `ALLOW_DEV_IMPERSONATE=false` e a porta desejada. Com `PORT=3325`, ajuste `PUBLIC_API_URL` e `PRIVATE_API_URL` do frontend para `http://localhost:3325`. `PUBLIC_REDIRECT_URL` aponta ao frontend em `http://localhost:5173`. O nome de configuração usado pelo frontend é `PUBLIC_API_URL`.

No agent, `api_producao.py` carrega dotenv e usa `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `MARITACA_API_KEY` e `MCP_AGENT_API_KEY`; a chave compartilhada deve coincidir com a do backend. Configure essas variáveis em `mcp_agent/.env` para execução separada ou no ambiente privado do processo. `ALLOWED_ORIGINS` controla as origens do serviço. Clientes de provedores são inicializados no import; credenciais ausentes podem impedir startup ou recusar endpoints protegidos.

Banco remoto, chamadas de IA, scraping e scripts de ingestão acessam serviços externos. Iniciar processos locais não autoriza gastar créditos, escrever em produção, aplicar SQL ou acessar dados pessoais. Use ambientes e dados de teste autorizados.

## Executar os serviços

Em terminais separados, com o venv ativo quando necessário:

```bash
# Na pasta backend
npm run dev

# Na pasta frontend
npm run dev

# Na pasta mcp_agent, usando o Python do venv
python -m uvicorn api_producao:app --host 127.0.0.1 --port 8000 --reload
```

Em macOS/Linux com Bash, `npm run dev:full` na pasta backend inicia backend e agent juntos. O script `backend/scripts/dev-full.sh` carrega `backend/.env` via `source`, exporta seus valores aos dois processos, usa Uvicorn disponível no PATH e porta 8000, e força `NODE_ENV=development` no backend. Ative antes o venv com dependências do agent; mantenha `.env` compatível com sintaxe shell. O frontend continua sendo iniciado separadamente.

## Verificar a alteração

| Área | Comandos na pasta indicada |
| --- | --- |
| Frontend | `npm run test:unit`, `npm run check`, `npm run build`; Playwright geral: `npm run test:integration`. |
| Backend | `npm test`, `npm run type-check`, `npm run build`. |
| Python | `python -m pytest` em `DBA/tests`; `black --check .` e `flake8 .` na raiz, com Black 25.11.0/Flake8 7.3.0. |
| Deploy helper | `python -m unittest discover -s scripts/deploy -p test_verificar_rollout.py` na raiz, sem rede. |
| Documentação | `npm run kb:check`; depois da revisão de fonte, `npm run kb:snapshot` e inspeção do diff. |

Playwright requer Chromium instalado e usa servidor local Vite conforme `frontend/playwright.config.ts`. O CI principal roda Pytest, Jest e Vitest por filtros de área nos PRs; pushes em main/dev executam todos os seus jobs. Não executa automaticamente o E2E geral, build frontend ou `svelte-check`. Registre falhas e limitações reais da sua execução; quantidade histórica de erros não demonstra o estado do checkout atual.

## Documentação de engenharia

O mapa atual de implementação, contratos, testes disponíveis e limites conhecidos
está na [base de conhecimento](./docs/kb/INDEX.md).

```bash
npm run kb:query -- "<pergunta>"
npm run kb:check
npm run kb:drift
```

O site acadêmico continua em `documentacao/`. Planos e guias obsoletos retirados
são recuperáveis pelo [ledger de proveniência](./docs/kb/_provenance/document-retirement.csv).
Fonte revisada, testes locais, schema exportado e estado servido são evidências distintas.

## Branch, commits e publicação

Preserve mudanças existentes no checkout. Crie branch sem upstream de `origin/main`; por exemplo, a partir do ref pretendido e já disponível:

```bash
git switch --no-track -c codex/minha-tarefa origin/main
```

Siga [COMMIT_GUIDELINES.md](./COMMIT_GUIDELINES.md), escreva descrição concreta e registre verificações executadas. Revise dossiers donos e consumidores (`watches`) na mesma mudança; registre intenção aceita com `DEC-*` apenas quando houver uma decisão de produto. Commits locais são permitidos. **Push e merge de PR exigem autorização explícita do mantenedor.**

Publicação usa os três Dockerfiles rastreados e o workflow descrito em [Docker](./DOCKER_README.md) e [Deploy e operações](./docs/kb/subsystems/deployment-ci-and-operations.md). Não há Compose de desenvolvimento rastreado nem auto-update Git dentro das imagens atuais. A aplicação pública e o commit servido exigem verificação separada; sucesso local ou de CI não é prova de produção.
