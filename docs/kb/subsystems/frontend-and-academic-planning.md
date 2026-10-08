---
id: SUB-frontend
aliases:
  - frontend Svelte fluxograma conexões
  - PDF histórico upload exportação
  - grade planejamento módulo livre
watches:
  - backend/src/controllers/**
  - backend/src/types/planejamento.ts
  - supabase/**
related:
  - SUB-backend
  - SUB-ai
  - SUB-data
  - SUB-security
  - SUB-ops
title: Frontend e planejamento acadêmico
owns:
  - frontend/**
status: source-reviewed
last_verified: 2026-10-08
---

# Frontend e planejamento acadêmico

## Purpose

O frontend atual em `frontend/` implementa o produto web NoFluxo: catálogo de
cursos e disciplinas, fluxograma por matriz, importação de histórico SIGAA,
integralização, planejamento até a formatura, montagem de grade com oferta real,
Darcy, suporte e administração. O mobile Flutter histórico não é a fonte desta
página.

Esta página foi conferida contra o código do checkout em 2026-10-08. O estado
`source-reviewed` significa revisão de implementação e configuração; não confirma
build, testes executados, migrations aplicadas, políticas RLS existentes no banco,
qualidade visual atual ou o domínio/revisão servida em produção.

## Current behavior

### Empacotamento e limites de execução

- `frontend/package.json` declara SvelteKit 2, Svelte 5, TypeScript, Tailwind 4,
  Supabase, Bits UI, PDF.js, `html2canvas-pro` e `@xyflow/svelte`. A presença da
  dependência XYFlow não identifica o renderizador atual do fluxograma.
- `svelte.config.js` usa `adapter-static`, arquivos em `build/`, fallback
  `index.html` e pré-compressão. A aplicação servida por esse build estático não
  tem servidor SvelteKit persistente para executar handlers por requisição.
- O layout raiz define `ssr = true`; o grupo `(protected)` define `ssr = false` e
  `prerender = false`. Landing `/` e `/conheca` definem `prerender = true`.
  O código combina pré-renderização de páginas públicas e navegação cliente.
- `vite.config.ts` configura PWA com `registerType: autoUpdate`, manifest e
  Workbox. Isso é configuração de build, não evidência de instalação ou operação
  offline de consultas Supabase/IA.
- `src/lib/config.ts` recebe `PUBLIC_API_URL`, `PUBLIC_REDIRECT_URL` e
  `PUBLIC_ENVIRONMENT`. `src/lib/supabase/client.ts` recebe URL e chave pública
  anônima do Supabase. Segredos privados não devem entrar no bundle.
- `utils/api.ts::apiRequest` prefixa endpoints com `PUBLIC_API_URL` e inclui
  cabeçalhos de autenticação por padrão. Muitas consultas e gravações do produto
  usam diretamente Supabase em vez da API Express.

### Rotas e autenticação

| Área | Rotas / entrada atual | Regra observada no código |
| --- | --- | --- |
| Apresentação e políticas | `/`, `/home`, `/conheca`, `/termos`, `/privacidade`, `/acessibilidade` | Públicas no guard; `/home` faz navegação cliente. |
| Conta | `/login`, `/signup`, `/login-anonimo`, `/password-recovery`, `/auth/callback`, `/auth/reset-password` | Supabase Auth; callback OAuth troca o código no cliente. |
| Consulta acadêmica | `/fluxogramas`, `/disciplinas`, `/meu-fluxograma/[courseName]` | Prefixos públicos em `authGuard.ts`; permitem explorar cursos. |
| Fluxograma pessoal | `/meu-fluxograma` | O `load` espera bootstrap e redireciona a `/upload-historico` quando não há `user.dadosFluxograma`. |
| Histórico e planejamento | `/upload-historico`, `/planejamento/grade`, `/planejamento/turmas`, `/assistente` | Grupo `(protected)` admite conta ou modo anônimo; serviços e páginas podem exigir conta para ações específicas. |
| Formatura e suporte | `/plano-formatura`, `/suporte` | Grupo protegido exige conta real, não apenas modo anônimo. |
| Administração | `/admin/dashboard`, `/admin/tickets`, `/admin/configuracoes` | Conta real e escopo `dashboard`, `tickets` ou `settings`; superadmin passa via `hasAdminScope`. |
| Desenvolvimento | `/dev/impersonar`, `/dev/planner-toque`, `/dev/grade-mobile` | Auxiliares de desenvolvimento; o `load` de impersonação exige `import.meta.env.DEV` e ambiente não-prod. Não tratar como capacidades de produção. |

O guard efetivo é `src/lib/guards/authGuard.ts`. O layout protegido chama
`guardProtectedRoute` antes de montar a página, espera
`authService.ensureSessionBootstrapped`, verifica sessão e aplica
`decideProtectedRouteAccess`. O layout raiz também chama `checkAuth` durante a
navegação. As regras desses dois caminhos não são idênticas: `checkAuth` aceita
modo anônimo cedo; o guard do grupo exige conta real nos prefixos acima.

`authService.databaseSearchUser` resolve a identidade Supabase e consulta `users`
pelo `auth_id`, com `dados_users`. O papel e escopos vêm do RPC `get_my_admin`;
falha dessa consulta degrada para não-admin. O store mantém `nofluxo_user` e
`nofluxo_anonimo` no localStorage e normaliza dados legados snake_case/camelCase.
Ele exige `idUser` numérico positivo e email para hidratar o perfil, mas um perfil
local não é prova de autorização de API ou banco. Essa autorização depende da
sessão e das verificações de backend/RLS/RPC.

O cliente Supabase é memoizado no browser para compartilhar um único cliente
Auth e evitar disputa de locks de renovação. A implementação não memoiza no
contexto sem `window`. Tokens e PKCE usam o armazenamento de cookies configurado
pelo cliente. A página raiz encaminha códigos OAuth e links de recovery para as
rotas próprias quando chegam em `/`.

### Importação do histórico e persistência

1. `uploadStore.uploadFile` chama `uploadService.parsePdfLocally`, executando
   PDF.js no browser. `pdfParser.ts::parsePdf` coordena extração por posições de
   disciplinas e regex para curso, matrícula, matriz, IRA, carga horária,
   suspensões, períodos, pendências e equivalências.
2. O parser consolida tentativas por disciplina: mantém aprovações
   APR/CUMP/DISP por período, preserva matrícula recente e trata repetíveis. O
   parser usa texto/posições; não há OCR neste fluxo revisado.
3. `uploadService.casarDisciplinas` remove `full_text` do payload e chama RPC
   `casar_disciplinas`, com tentativa de cancelamento após 30 segundos. O PDF
   bruto não é enviado por esse caminho; dados acadêmicos extraídos são enviados.
4. Resposta ambígua pode abrir seleção de curso/matriz. O store oferece
   `retryWithSelectedCourse`, reabertura/cancelamento da seleção e modo manual
   `startManualMode`.
5. `saveAndNavigate` normaliza dados, injeta equivalências do PDF, persiste para
   conta real, atualiza o perfil local e navega ao fluxograma. O estado de upload
   expõe fases e simulação de progresso; esses percentuais não são progresso
   medido do parser ou da consulta SQL.

`supabaseDataService.saveFluxogramaData` faz upsert de `dados_users` por `id_user`,
preservando a linha atual e armazenando `fluxograma_atual` como JSON serializado.
Quando há metadados de envio, tenta inserir um registro em `historicos_usuarios`.
Falha desse segundo insert gera aviso no console; a gravação do estado atual pode
ter sucesso mesmo sem nova linha de histórico. As duas operações não formam uma
transação atômica no frontend.

### Fluxograma, matrizes e integralização

O renderizador atual é `FluxogramContainer.svelte`, com colunas de semestre
`SemesterColumn.svelte`, cards DOM e conexões em
`PrerequisiteConnections.svelte`. Há pan de desktop, scroll nativo em telas de
toque compactas, pinch/zoom, modo foco, navegação por semestre, seleção de
matéria e dialog de cadeia de pré-requisitos. Não foram encontrados imports de
`@xyflow/svelte` nos componentes de fluxograma revisados.

`fluxogramaStore` centraliza curso/matriz, disciplinas por semestre, conjuntos
concluídas/cursando/reprovadas, optativas planejadas e concluídas manualmente,
unidade de carga, zoom e conexões `off/direct/chain/all`. Carregamentos de curso
usam sequência de invalidação para evitar respostas antigas repopularem o store
após troca ou reset; o utilitário `iniciarCarregamento` também cancela efeitos
obsoletos de integralização.

`/meu-fluxograma` prioriza a matriz curricular salva no histórico, inclusive
quando está inativa no SIGAA, em vez de substituí-la automaticamente pela matriz
ativa mais nova. `fluxogramaService` delega as consultas a
`supabaseDataService`, que monta curso, `materias_por_curso`, pré/co-requisitos,
equivalências e requisitos de matriz. A página permite visualizar outra matriz.

`integralizacao.service.ts::getIntegralizacao` compara exigências da matriz e
realizado do aluno. Prefere cargas integralizadas do PDF quando aplicáveis; no
recálculo por disciplinas usa grade, histórico e equivalências. Deduplica grade
por código e natureza conservadora. `pct` só retorna 100 quando a exigência está
cumprida; abaixo dela limita a 99. O serviço
`mudanca-curso-requisitos.service.ts` suporta comparação/simulação de outro curso.

Alterações de optativas e disciplinas manuais podem ficar locais no app:
`historicoManualPendenteSalvar` sinaliza a necessidade de “Salvar no perfil”.
`saveOptativasPlanejadas` efetiva a persistência para conta com fluxograma;
a função de compatibilidade `removeOptativaPlanejadaESalvar` apenas chama a
remoção local atual. Nomes históricos de métodos não garantem gravação imediata.

`saveScreenshot` captura o DOM em PNG via `utils/screenshot.ts`, escolhe captura
sem linhas ou com todas as conexões, aguarda atualização de layout e restaura
modo/hover em `finally`. Isso é exportação de imagem do fluxograma, não exportação
do histórico acadêmico em PDF.

### Plano de formatura e montador de grade

`planoFormaturaStore` mantém plano Motor 2, preferências, onboarding, limite de
créditos, restrições e chat. `planoFormaturaService.gerarPlano` chama
`POST /planejamento/gerar-plano` com currículo, códigos concluídos, semestre atual
e limite de créditos. Preferências são lidas/gravadas em `dados_users` via
Supabase. O chat do plano chama `POST /planejamento/chat`, enviando histórico,
`planoInput` e restrições. A falha de geração lança erro; não confirma viabilidade
acadêmica real quando a API responde.

O montador em `/planejamento/grade`:

- Busca período por RPC `periodo_letivo_atual` e turmas de oferta real em `turmas`.
  `grade-pool.service.ts` forma candidatas da matriz do aluno; o semestre do plano
  serve como ordem de preferência, não como fonte exclusiva das disciplinas.
- Inclui matrícula atual e, quando o histórico permite, pré-seleciona a turma
  real. `gradeStore` trava essa seleção para não trocar a matrícula no solver.
  O aluno pode desligar `incluirCursando`, liberando horário e crédito dessas
  disciplinas para a montagem, sem apagar o conjunto factual de cursando.
- Mantém pool, seleções, cenários, prioridades, filtros de turno e removidas.
  Persistência local é por usuário e período (`nofluxo:grade:...`); isso não
  significa sincronização de todos os cenários entre dispositivos.
- Usa máscaras `bigint` de horários SIGAA para conflitos. `autoMontarGrade` em
  `horario-slots.ts` usa busca limitada a 200.000 nós e pode devolver `truncado`;
  não prometer ótimo global em toda montagem.
- Respeita horários ocupados, professor confirmado, turnos e orçamento de
  créditos. O peso distingue prioridades explícitas, obrigatórias, naturezas
  ainda necessárias e naturezas saturadas. Matrículas reais preservadas podem
  consumir mais que o teto escolhido; o algoritmo não as apaga para cumprir teto.
- Carrega `situacao-academica.service.ts` a partir do mesmo cálculo de
  integralização do fluxograma. Falha vira `null`, e carga complementar sem fonte
  confiável permanece desconhecida em vez de ser tratada como zero pendente.
- O chat pode produzir prévia de rearranjo por professor. A página guarda snapshot
  e oferece aceitar ou manter grade anterior; preferências confirmadas de
  professor/turno são persistidas pela API `preferencias-grade-*`.

O painel Situação também oferece sugestões de módulo livre por tema. O caminho
é `grade/+page.svelte::buscarModuloLivre` →
`grade-pool.service.ts::candidatosModuloLivre` →
`modulo-livre.service.ts::buscarSugestoesModuloLivre` →
`POST /planejamento/modulo-livre-sugestoes`. A busca semântica vem primeiro;
consulta literal ao catálogo é fallback quando o cliente recebe falha, não quando
a resposta semântica válida está vazia. O pool filtra disciplinas da matriz,
concluídas, cursando e já incluídas, e exige turmas no período consultado.

`responderModuloLivre` e `buscarModuloLivre` guardam escolha, tema e currículo
por `planoFormaturaStore.setPreferenciaModuloLivre`; a persistência das
preferências no Supabase é best effort e não regenera o plano. Recusar limpa
sugestões sem apagar a carga ainda pendente. `SituacaoPanel` apresenta sugestões
e liga `onIncluir` ao `onAdd` do montador, que chama
`grade/+page.svelte::adicionarAoPool`. Isso adiciona a disciplina ao pool para
seleção/montagem; não equivale a matrícula SIGAA nem a turma automaticamente
selecionada.

A busca direta pode produzir embeddings Gemini pagos mesmo fora do chat. Conforme
a revisão de [backend](./backend-api-and-motor2.md#sugestões-de-módulo-livre-e-preferências-de-grade)
e [segurança](./auth-security-and-privacy.md), esse endpoint autenticado não faz
reserva da cota diária, checagem do teto de custo global nem recebe o limiter
adicional de rotas IA pagas. O limite de perguntas mostrado no Darcy não deve ser
interpretado como cobertura deste fluxo. É um limite observado na fonte; gasto
e configuração servida não foram verificados.

`/planejamento/turmas` oferece pesquisa de turmas por disciplina, docente, horário
ou local. `vagaAssinaturasStore` e `vagaNotificacaoService` integram seguir matéria
ou turma, notificações e leitura de avisos. O botão de seguir exige assinaturas
carregadas e turma com vagas conhecidas esgotadas. A chegada de aviso depende do
pipeline de dados/servidor; o frontend não prova que o scraper ou notificações
operaram em produção.

### Darcy, suporte e administração

Há três clientes de chat distintos em uso no código:

| Contexto | Cliente / endpoint | Estado |
| --- | --- | --- |
| Página `/assistente` | `assistenteChatStore` → `AssistenteService.chatAgente` → `/assistente/chat` | Histórico completo enviado pelo cliente e contexto de plano opcional. |
| FAB do montador | `montadorChatStore` → `ChatService.enviarMensagem` → `/chat/send` | Pipeline orquestrador/atuadores; envia mensagem e contexto de oferta/grade. |
| Plano de formatura | `planoFormaturaStore` → `planoFormaturaService.chat` → `/planejamento/chat` | Histórico, plano e restrições enviados pelo cliente. |

Os stores da Assistente e do Montador têm instâncias separadas. O contexto de
plano é construído com currículo, concluídas, semestre e preferências salvas. A
Assistente também conserva métodos de análise Sabiá/RAGFlow e SSE no serviço;
a existência desses métodos não significa que a página de chat atual use SSE.

`darcyCotaStore` trata login obrigatório (401), cota individual (429), teto global
(503) e pedido de mais perguntas. A Assistente admite abertura em modo anônimo no
guard, mas abre modal de login sem conta. Visitante sem sessão nem modo anônimo
é redirecionado para login antes de montar a página pelo guard protegido.
Erros de cota/login retiram a pergunta
do histórico para permitir reenvio; outros erros produzem resposta amigável.

`ticketService` usa Supabase, RPCs e Storage para criação, listagem, mensagens,
anexos assinados, mudança de status, leitura de tickets e aprovação/recusa de
pedidos Darcy. `dashboardService` consulta métricas administrativas de usuários,
cursos, tickets, IA/cota/saldo, demanda, scraping e segurança. `systemSettingsService`
consulta/grava configuração e modo de scraping via RPCs. Autoridade real dessas
ações depende dos RPCs e políticas no banco, além do bloqueio de tela.

### Tema, acessibilidade e navegação

Tokens ficam em `src/app.css`, utilitários em `lib/styles/nofluxo-ds.css`,
primitivas em `components/ui`. `theme.ts` suporta claro/escuro/sistema, com escuro
padrão e persistência local. `app.html` antecipa tema/acessibilidade antes do paint.
`a11y.ts` mantém alto contraste, texto grande, Lexend, movimento reduzido e foco
mais forte. O layout possui skip link e foco no conteúdo após navegação SPA.
Isso documenta a implementação; conformidade WCAG integral requer auditoria.

## Source evidence

Os principais pontos para reconferir esta página são:

| Afirmação | Fonte / símbolo |
| --- | --- |
| Build estático, rotas pré-renderizadas e SSR por grupo | `frontend/svelte.config.js`; `src/routes/+layout.ts`; `src/routes/(protected)/+layout.ts`; `src/routes/+page.ts` |
| Rotas e autenticação efetivas | `src/lib/guards/authGuard.ts::{isPublicRoute,guardProtectedRoute,decideProtectedRouteAccess}`; `services/auth.service.ts::{databaseSearchUser,ensureSessionBootstrapped}` |
| Perfil, cliente Supabase e consultas diretas | `stores/auth.ts`; `supabase/client.ts::createSupabaseBrowserClient`; `services/supabase-data.service.ts` |
| Parse/casamento/gravação | `services/pdf/pdfParser.ts::parsePdf`; `services/upload.service.ts::{parsePdfLocally,casarDisciplinas}`; `stores/uploadStore.ts::saveAndNavigate`; `supabase-data.service.ts::saveFluxogramaData` |
| Renderizador e status acadêmico | `components/fluxograma/layout/{FluxogramContainer,SemesterColumn,PrerequisiteConnections}.svelte`; `stores/fluxograma.store.svelte.ts`; `types/{materia,user,equivalencia}.ts` |
| Integralização e simulação | `services/integralizacao.service.ts::{getIntegralizacao,pct}`; `services/mudanca-curso-requisitos.service.ts`; `utils/expressao-logica.ts` |
| Plano Motor 2 e montador | `services/plano-formatura.service.ts`; `stores/plano-formatura.store.svelte.ts`; `services/grade-pool.service.ts`; `stores/grade.store.svelte.ts::montarAutomatico`; `utils/horario-slots.ts::autoMontarGrade` |
| Oferta, preferências e notificações | `services/{turmas,oferta-turmas,preferencias-grade,vaga-notificacao}.service.ts`; `routes/(protected)/planejamento/grade/+page.svelte` |
| Clientes Darcy e cota | `stores/assistente-chat.store.svelte.ts`; `services/{assistente,chat}.service.ts`; `stores/darcy-cota.store.svelte.ts`; `utils/darcy-cota.ts` |
| Admin/suporte e design | `services/{ticket,dashboard,system-settings}.service.ts`; `stores/{theme,a11y}.ts`; `src/app.css`; `src/app.html` |

Todos os caminhos `src/...` acima são relativos a `frontend/`.

## Tests (not rerun)

Foram inspecionados configuração e arquivos de testes, sem executar a suíte
nesta exploração documental. A existência de testes não representa resultado de
execução ou cobertura completa.

- `npm run test:unit` usa Vitest. `vite.config.ts` separa projeto lógico `unit`
  (Node) e `a11y` (jsdom, resolução browser, arquivos `*.a11y.test.ts`). Os specs
  Playwright de `tests-e2e/` são excluídos da coleta unitária por `include`.
- Existem testes de `authGuard`, AuthService, autenticação das chamadas IA,
  contratos do novo chat, erros/cota e isolamento de contexto do montador.
- PDF: `pdfDataExtractor.test.ts`, `pdfPositionExtractor.test.ts`, harness e
  suites `__tests__/edge_cases.test.ts` / `all_pdfs.test.ts`. Fixtures acadêmicas
  são materiais de teste; não reproduzir dados pessoais nos documentos KB.
- Fluxograma: corrida de carregamento, lógica de expressões/pré-requisitos,
  equivalências, integralização, viewport e códigos de disciplinas.
- Grade: limites de crédito, máscaras livres, travas, limpar/reiniciar,
  prioridade/natureza, matrícula atual, pool da matriz, oferta, saldo e módulo
  livre. `horario-slots.orcamento.test.ts` cobre orçamento do solver.
- `npm run test:integration` usa Playwright Chromium, um worker, sem retries,
  `localhost:5173` e servidor `npm run dev`. Há specs de a11y, impersonação,
  setas, montagem manual, regressão mobile e exploração de login/upload/IA.
  Specs exploratórios podem depender de ambiente/dados; revisar seus fixtures
  antes de interpretar um resultado como integração isolada.
- `npm run check`, lint, format e cobertura são scripts disponíveis. Não há
  contagem de erros de svelte-check verificada nesta revisão de fonte.

## Implementation boundaries and open questions

O [README frontend](../../../frontend/README.md) foi reconciliado com a fonte:
build estático com pré-renderização pública, fluxograma DOM/SVG, PDF no browser,
RPCs Supabase e clientes distintos de planejamento/chat. A documentação retirada
tem disposição e hashes no
[registro de retirada](../_provenance/document-retirement.csv); não deve ser usada
como guia atual de implementação.

1. `src/lib/config/routes.ts` lista catálogo/fluxogramas como protegidos e seu
   `PUBLIC_ROUTES` omite termos/privacidade. O guard efetivo tem lista diferente.
   Consumidores futuros do helper `requiresAuth` precisam conferir essa divergência.
2. Não há pasta `routes/api/` no frontend atual. Os arquivos `+page.server.ts`
   de callback/home e `health/+server.ts` conservam apenas comentários de remoção;
   o deployment estático não fornece uma API SvelteKit por requisição.
3. `plano-formatura.service.ts` comenta retorno `null` quando backend indisponível,
   mas a implementação lança erro. Documentar erro é consistente com o corpo atual.
4. O comentário de `grade-pool.service.ts::candidatosModuloLivre` ainda descreve
   busca literal no catálogo; o corpo executa busca semântica primeiro e usa
   catálogo literal apenas no fallback de falha. O fluxo documentado acima segue
   a implementação, não esse comentário.
5. O caminho cliente usa `PUBLIC_API_URL`. `config.apiUrl` tem fallback local,
   enquanto `apiRequest`
   concatena diretamente a variável pública. Confirmar env de build antes de
   diagnóstico de endpoint.
6. Novo e legado Darcy coexistem nas rotas acima. Export PNG não é export de PDF;
   gravação do estado atual e insert de histórico não são transação atômica;
   alteração manual local exige salvar no perfil para persistência remota.
7. Não foi conferida operação pública, banco aplicado, disponibilidade de RPCs,
   bucket de anexos, dados recentes de turmas, custo/cota real da IA ou sincronismo
   de preferência entre dispositivos. Esses itens permanecem verificação runtime.

## Rechecagem da base da PR

A correção upstream do link GitHub de Vinícius em `SobreNosSection.svelte` foi
incorporada da main; o diff contra main não introduz alteração de runtime nesse componente.
O README/GIF da main foi preservado, com o router de engenharia KB acrescentado.
