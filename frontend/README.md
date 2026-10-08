# NoFluxo — Frontend (SvelteKit)

Frontend web do NoFluxoUNB, com **SvelteKit 2, Svelte 5 (runes), TypeScript e
Tailwind CSS 4**. O dossier canônico de arquitetura, fluxos, contratos e limites é
[Frontend e planejamento acadêmico](../docs/kb/subsystems/frontend-and-academic-planning.md).
Para mudanças, consulte também o [índice KB](../docs/kb/INDEX.md) e os dossiers de
[backend](../docs/kb/subsystems/backend-api-and-motor2.md),
[dados](../docs/kb/subsystems/data-ingestion-and-schema.md) e
[segurança](../docs/kb/subsystems/auth-security-and-privacy.md).

## Ambiente local

Na pasta `frontend/`, instale as dependências. Se ainda não existe `.env`, crie-o
a partir de [.env.example](./.env.example) e preencha os valores do ambiente:

```bash
npm ci
cp .env.example .env
npm run dev
```

O servidor de desenvolvimento usa porta 5173; se estiver ocupada, Vite pode
selecionar outra. O script `postinstall` copia o worker PDF.js para
`static/pdf.worker.min.mjs`.

As variáveis lidas pelo cliente são `PUBLIC_SUPABASE_URL`,
`PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_API_URL`, `PUBLIC_REDIRECT_URL` e
`PUBLIC_ENVIRONMENT`. Defina `PUBLIC_API_URL` com a URL real do backend local:
`apiRequest` concatena essa variável diretamente com o endpoint. Alterações em
`$env/static/public` exigem novo build para o artefato publicado. A chave pública
anônima do Supabase deve operar com RLS/RPCs autorizados; não coloque chaves
privadas ou `service_role` em variáveis públicas nem em arquivos rastreados.

## Build estático

```bash
npm run build     # saída em build/
npm run preview   # preview local, porta 4173
```

[svelte.config.js](./svelte.config.js) usa `adapter-static`, fallback `index.html`
e pré-compressão. O layout raiz habilita SSR para geração de páginas públicas;
`/` e `/conheca` são pré-renderizadas. O grupo `(protected)` desabilita SSR e
pré-renderização e navega no cliente. O artefato estático não executa handlers
SvelteKit por requisição. A configuração PWA em [vite.config.ts](./vite.config.ts)
usa atualização automática de service worker; consultas Supabase e IA continuam
dependendo de rede.

O alvo containerizado é
[k8s.frontend-svelte.Dockerfile](../k8s.frontend-svelte.Dockerfile). O mecanismo de
publicação e suas verificações estão em
[Deploy, CI e operações](../docs/kb/subsystems/deployment-ci-and-operations.md).

## Rotas, autenticação e dados

As regras efetivas estão em
[authGuard.ts](./src/lib/guards/authGuard.ts) e no layout `(protected)`:

- Catálogo `/disciplinas`, `/fluxogramas` e fluxograma de curso
  `/meu-fluxograma/[courseName]` são públicos. `/meu-fluxograma` espera o perfil e
  encaminha para upload quando não há histórico salvo.
- `/upload-historico`, `/planejamento/grade`, `/planejamento/turmas` e
  `/assistente` aceitam conta ou modo anônimo no guard. Chamadas Darcy exigem
  conta real; a Assistente abre modal de login no modo anônimo.
- `/plano-formatura` e `/suporte` exigem conta real. As rotas `/admin/*` exigem
  conta e escopos correspondentes, com tratamento próprio para superadmin.
- Login com conta, signup, recovery e callback usam Supabase Auth;
  o callback OAuth troca o código no cliente. `/login-anonimo` ativa o modo
  visitante local, sem criar conta Supabase. `/dev/impersonar` está limitado
  pelo `load` a desenvolvimento e ambiente não-prod.

[auth.service.ts](./src/lib/services/auth.service.ts) resolve perfil por `auth_id`
e papel administrativo por RPC. O cliente Supabase é compartilhado no browser;
perfil local e guard de tela não substituem autorização de backend/RLS. Catálogo,
fluxograma, preferências, suporte e métricas usam consultas/RPCs Supabase;
planejamento e chat também usam a API Express.

## Fluxos e organização

- **Fluxograma:** componentes DOM de semestres/cards e conexões SVG próprias em
  `src/lib/components/fluxograma/layout/`, coordenados por
  `fluxograma.store.svelte.ts`. Inclui status acadêmico, pré-requisitos,
  equivalências, zoom e exportação PNG com `html2canvas-pro`.
- **Histórico:** PDF.js extrai texto e posições no browser em
  `src/lib/services/pdf/`. `upload.service.ts` envia dados extraídos ao RPC
  `casar_disciplinas`; a gravação usa `supabase-data.service.ts`. O fluxo mantém
  a matriz curricular do histórico, inclusive inativa, e oferece seleção/manual
  quando necessário.
- **Planejamento:** `plano-formatura.service.ts` chama Motor 2 em
  `/planejamento/gerar-plano`. `grade-pool.service.ts` e `grade.store.svelte.ts`
  montam grade com oferta real, conflitos de horário, teto de créditos,
  prioridades e matrícula atual. Cenários da grade são locais por usuário/período.
- **Módulo livre:** o painel Situação busca sugestões por tema em
  `/planejamento/modulo-livre-sugestoes`, filtra matrícula/histórico/oferta e permite
  incluir disciplinas no pool. Essa busca semântica pode gastar embeddings fora
  da reserva diária de perguntas Darcy; veja os limites nos dossiers de backend
  e segurança. Escolha/tema são preferências persistidas em best effort.
- **Darcy:** Assistente usa `/assistente/chat`, FAB do montador usa `/chat/send`
  e chat de formatura usa `/planejamento/chat`. Clientes e estados são distintos.
- **UI:** primitives em `src/lib/components/ui/`, tokens em `src/app.css`,
  utilitários em `src/lib/styles/nofluxo-ds.css`, tema/acessibilidade nos stores
  `theme.ts` e `a11y.ts`. O [design system](../docs/design-system.md) detalha tokens.

Aliases de código: `$components`, `$lib`, `$stores`, `$types`, `$services` e
`$utils`, definidos em `svelte.config.js`.

## Verificação local

```bash
npm run test:unit         # Vitest: lógica e projeto a11y/jsdom em src/
npm run test:integration  # Playwright Chromium em tests-e2e/
npm run test:coverage     # Vitest com cobertura
npm run test:a11y         # store e componentes de acessibilidade
npm run test:e2e:a11y     # spec Playwright de acessibilidade
npm run check            # sync + svelte-check
npm run lint
npm run format:check
```

Playwright espera `localhost:5173`, inicia `npm run dev` ou reutiliza servidor
existente; alguns specs exploratórios dependem de configuração e dados de teste.
O job frontend de [pipelineCI.yml](../.github/workflows/pipelineCI.yml) instala
com `npm ci` e executa `npx vitest run --passWithNoTests`. Playwright,
svelte-check, lint e formatação não são etapas desse job.
