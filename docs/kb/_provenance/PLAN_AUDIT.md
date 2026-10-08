# Auditoria dos planos históricos

> Historical implementation assessment of the original 30 files. Following explicit cleanup authorization, 29 original plans were removed from the active tree; their original hashes/revisions remain in the ledger. `plans/README.md` is now an active KB router (`current-index`). Original disposition counts below describe the initial assessment, not current files on disk. See [CLEANUP_AUDIT.md](CLEANUP_AUDIT.md).

**Data de referência:** 2026-10-07 (America/Sao_Paulo).
**Checkout revisado:** `c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`.
**Estado da evidência:** revisão de fonte e histórico Git; achados da revisão independente registrados na frente de reviews da KB.

A migração e as principais funcionalidades dos planos têm correspondentes no código atual, mas a redação original “30 planos já concluídos” do `AGENTS.md`, corrigida durante esta consolidação, e a descrição histórica de `plans/README.md` não constituem aceite de todos os requisitos. Há mudanças de arquitetura, checklists desatualizados e metas de teste/paridade visual sem prova nesta auditoria. Os originais foram preservados integralmente.

O inventário reproduz `git ls-files 'plans/*'`: **30 arquivos Markdown rastreados**, incluindo o overview, o master e o README; são **27 planos de frentes específicas e 3 referências de coordenação/navegação**. A numeração tem dois `14-*`, dois `16-*` e um plano datado. Não contar arquivos locais ignorados como planos adicionais nem usar a ordem numérica como cronologia estrita.

O [ledger CSV](plan-disposition.csv) tem uma linha para cada arquivo. `source_path`, `content_sha256` e `size_bytes` identificam o conteúdo original auditado; `destination` aponta a este relatório de auditoria, que incorpora a revisão na KB; nenhum plano foi movido ou aposentado. `decision_ids` fica vazio porque esta auditoria não criou um registro DEC/INV/OPEN. `title` mantém o título do documento, `evidence` aponta para caminhos/símbolos de fonte ou commits verificados e `notes` registra divergências e limites. Alterar um plano invalida sua revisão registrada até atualizar o hash e revisar o conteúdo.

## Como interpretar as disposições

| Disposição | Arquivos | Significado |
|---|---:|---|
| `implemented-source` | 4 | O objetivo central possui implementação de fonte. Não afirma execução dos testes, aceite de cada checkbox, deployment ou comportamento do provedor. |
| `implemented-with-evolution` | 19 | O objetivo central possui implementação, mas arquitetura, caminhos, UI ou contrato evoluíram em relação ao plano. Consultar a nota da linha para a diferença. |
| `partial-source` | 2 | Parte relevante existe, mas o plano não foi adotado integralmente ou inclui metas sem implementação/prova suficiente nesta revisão. |
| `partial-validation` | 1 | Há implementação relacionada, mas a conclusão central de paridade visual exige renderização/comparação que esta revisão não fez. |
| `superseded` | 1 | A abordagem principal foi substituída; código auxiliar pode continuar ativo. |
| `historical-reference` | 3 | Overview, master e README orientam o histórico; não são um estado executável ou uma declaração atual de conclusão. |
| **Total** | **30** | Cobertura exata dos arquivos rastreados em `plans/`. |

A unidade desta classificação é a frente funcional de cada documento. **Não é uma matriz de aceite de todos os passos, exemplos opcionais e checkboxes dos planos.** Os títulos/checklists foram tratados como intenção histórica; a classificação usa a implementação atual e explicita onde a revisão não comprova o requisito.

## Mudanças que explicam o estado atual

1. **Setup, autenticação e serviços (01–08, 12, 14-RLS).** O frontend SvelteKit existe com Tailwind 4, componentes, tipos/factories/schemas e serviços diretos do Supabase. O desenho inicial com auth/guards no servidor foi substituído por `AuthService`, browser client e guard cliente. `frontend/src/hooks.server.ts` e `frontend/src/lib/server/supabase.ts` são stubs somente com comentários. A existência de SQL RLS no repositório não prova que as políticas estão instaladas ou funcionando no banco remoto.
2. **Chat (09 e plano de 2026-07-04).** Há chat UI, stores, serviço, endpoint do planejador, restrições e tools. O plano de julho tem implementação em `PlanejamentoController`, `planejador_agente.service.ts`, `plano-formatura.store.svelte.ts` e `PlannerChatPanel.svelte`, embora seus checkboxes permaneçam vazios. O chat unificado e o montador ampliam o escopo original; caminhos de compatibilidade coexistem. A resposta real de um LLM não foi consultada nesta auditoria.
3. **Upload/PDF (10, 16-client-side, 16-rewrite, 17).** O caminho atual do frontend é PDF.js no browser → extração por posição para histórico padrão → `casar_disciplinas` por RPC → persistência direta. A reescrita regex foi superada como extrator principal de disciplinas padrão, mas regex segue ativa para metadados, pendentes e formato detalhado. O fallback atual seleciona o formato detalhado; não implementa literalmente o fallback genérico “zero disciplinas por posição” descrito no plano 17. O legado Python/backend não foi removido de todas as áreas do repositório.
4. **Fluxograma (11, 14-migration, 19, 20).** Há optativas, touch/pinch, diálogo de cadeia, linhas e roteamento com gaps/lanes. As conexões evoluíram de três para quatro modos (`off`, `direct`, `chain`, `all`), com inicialização/reset em `direct` — o plano 19 previa `off`. O conjunto atual de ferramentas oferece mudança de curso em vez dos quatro cards desabilitados propostos. Isso é uma divergência documentada, não prova de defeito.
5. **Visual/export (15 e 21).** UI e export existem, mas o design evoluiu para tokens semânticos e temas claro/escuro. O export usa `html2canvas-pro`, com fallback SVG, fundo conforme tema e escala adaptativa; o plano 21 propunha `html-to-image`, fundo escuro e 3x fixo. A comparação de screenshots com Flutter e o aceite visual em matrizes grandes continuam sem prova nesta auditoria.
6. **Static/client-first (22).** `adapter-static` e fallback `index.html` estão configurados; rotas protegidas declaram `ssr=false`, OAuth troca código no cliente e matching usa RPC. Entretanto, o layout raiz declara `ssr=true` e a home é prerenderizada, portanto não houve adoção literal de SSR desabilitado globalmente. Os antigos arquivos server de callback/home/health/sitemap são somente stubs com comentários, sem handlers ativos. Metas de cache/performance e percentuais de melhoria do plano são intenção, não medições atuais.
7. **Tickets.** `ticket.service.ts`, tipos, admin UI, anexos, audit log, RPCs e chat bidirecional/realtime têm correspondentes rastreados. O documento é genérico: categorias/statuses configuráveis, push/email e triagem IA dependiam das respostas às perguntas iniciais. Ausência de uma opção condicional não é automaticamente tarefa incompleta. Storage, RLS, realtime e entrega externa não foram testados.
8. **Dashboard/custos/Tier 2.** Página, métricas de usuários/tickets, custos, demanda de turmas, scraping, SQL e instrumentação `usage` estão presentes. O contexto antigo “rascunho não commitado/nunca aplicado” não descreve o checkout atual. A implementação posterior acrescenta atribuição de usuário/pergunta, rastreabilidade, embeddings e alertas/saldo. Preços reais, saldo do provedor, instalação dos RPCs e suporte a usage em todos os streams continuam desconhecidos nesta revisão. Editor de preço era follow-up opcional da v1; o ledger não o declara obrigação entregue.

## Gaps de pesquisa e verificação

- **Estratégia de testes (13):** Vitest, Playwright, suites de lógica/acessibilidade e CI existem. `frontend/playwright.config.ts` configura apenas Chromium. A matriz multi-browser, MSW/visual regression, limiares de cobertura e metas de Lighthouse descritos no plano não são aceitos só porque há configuração ou arquivos de teste. Nenhuma suíte foi executada por esta auditoria de planos.
- **Artefatos antigos de experimentação:** planos de PDF citam `test_historicos/` e totais históricos de seis PDFs/55 assertions. Essa pasta é sobra local não rastreada conforme as instruções do repositório; seus números não foram reproduzidos nem promovidos a evidência atual. Fixtures/testes rastreados atuais têm seus próprios caminhos no CSV.
- **Dados remotos e deployment:** SQL exportado e migrations são evidência local. Aplicação manual no Supabase, políticas efetivas, preços/balance, provider setup e release em `no-fluxo.crianex.com` precisam de evidência operacional específica. Esta auditoria não fez consultas remotas nem chamadas pagas.
- **Aceite de detalhe:** responsividade completa, gates anônimos de cada componente, screenshot fit, ausência de colisões e comparação visual com Flutter não foram exercitados. As linhas do ledger preservam esses limites em vez de marcar todos os checkboxes como concluídos.

## Histórico verificado e reprodução

Os commits citados no CSV foram resolvidos no Git local e verificados como ancestrais de HEAD: `65630e5d5` (remoção da antiga camada AI agent/infra), `c7c423961` (correção de período/semestre no parser), `f81ca44c7` (saldo/alerta IA no dashboard). Esses commits contextualizam evolução de fonte; não são evidência de que o HEAD ou a configuração correspondente está em produção.

A revisão leu o inventário e as frentes dos 30 planos, confrontou componentes/services/controllers/SQL/test configuration relevantes, conferiu que os caminhos de evidência estão rastreados e que os commits citados pertencem ao histórico de HEAD. O CSV foi serializado com a biblioteca `csv` de Python para preservar vírgulas/aspas e inclui hashes SHA-256 do conteúdo original.

Para rever o inventário: execute `git ls-files 'plans/*'` e compare os caminhos com `source_path`. Recalcule SHA-256/bytes de cada original e compare com o ledger. A documentação viva descreve a implementação atual; quando um plano divergir, preserve-o como histórico e atualize o registro de disposição/evidência antes de reutilizar sua afirmação de status.
