# Revisão final da KB e limpeza documental

**Referência final: 2026-10-08**, America/Sao_Paulo. Branch `feat/new-docs`, HEAD de
origem `c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`, com mudanças locais desta tarefa.
**Resultado: PASS para documentação revisada na fonte e tooling local.**

## Resultado atual

A primeira consolidação foi revisada em 2026-10-07. Depois, o usuário pediu uma nova
revisão com subagente e a remoção da documentação divergente. A revisão independente
[fresh_cleanup_review](SECOND_REVIEW.md) confrontou os guias corrigidos com a fonte,
verificou as 42 retiradas em objetos Git e reexecutou os checks locais. O procedimento
atual substitui o compromisso inicial de preservar todos os planos na árvore ativa;
`DEC-GLOBAL-004` registra a autorização e sucede `DEC-GLOBAL-003`.

| Entrega | Estado |
|---|---|
| Dossiers canônicos | 7, com fonte/contratos/limites e revisão final 2026-10-08 |
| Catálogo | 271 linhas: 229 atuais e 42 tombstones, incluindo 4 templates de ambiente |
| Planos | 29 originais retirados e 1 README atual; implementação histórica preservada no ledger |
| Documentos removidos | 42, todos com original Git/hash/tamanho/motivo/autorização/destino |
| Guias mantidos | READMEs, setup, Docker/infra, arquitetura/testes públicos, domínio/Motor 2/chat/design e impersonação corrigidos |
| História preservada | Atas, estudos/backlog explicitamente históricos e evidência de sessões, sem alegação de comportamento entregue |

A [auditoria de limpeza](../CLEANUP_AUDIT.md) e o
[manifesto de retirada](../document-retirement.csv) listam o resultado atual.
[DOCUMENTATION_AUDIT.md](../DOCUMENTATION_AUDIT.md) e [PLAN_AUDIT.md](../PLAN_AUDIT.md)
identificam a avaliação inicial como histórica; seus números antigos não são o estado
atual da árvore. Históricos não são instruções de execução do produto.

## Revisão independente

- [Aplicação inicial](APPLICATION_REVIEW.md): APP-01 a APP-06 corrigidos/rechecados; caminhos, rotas, acesso anônimo, módulo livre e fallback de co-requisitos.
- [Dados/operações/segurança inicial](DATA_OPERATIONS_SECURITY_REVIEW.md): correções de ingestão, custo cacheado/fail-open, ticket e condições operacionais rechecadas.
- [História/tooling inicial](HISTORY_COVERAGE_REVIEW.md): cobertura, aceitação, referências, symlinks, current-only e status schema corrigidos.
- [Segunda revisão independente](SECOND_REVIEW.md): guias e dossiers finais, domínio/design, retirada de orientação superada, autoridade e 26 testes atuais do tooling. Os 42 originais foram verificados separadamente contra Git.

Não há achado documental aberto entre os identificados por essas revisões. Isso é
aprovação no escopo descrito; não certifica todas as afirmações antigas de registros
históricos, regras oficiais UnB, serviços externos, schema remoto ou experiência em produção.

## Verificação final executada

| Verificação | Resultado |
|---|---|
| `npm run kb:check` | PASS; 7 dossiers, 1.033 nodes e 2.526 edges; cobertura/hashes/retiradas/links/metadata/refs/ownership/snapshot válidos |
| Testes KB | 26 passaram; incluem Git temporário, retirada antes/depois de staging, fonte restaurada, hashes errados, aprovação vazia, data impossível, symlinks/segredos, seletores de templates e queries |
| `npm run kb:drift` | Sem drift contra o snapshot explicitamente renovado após revisão |
| Links locais dos documentos Markdown ativos + KB/tooling | Alvos de arquivo resolvem; URLs externas e âncoras não são certificados |
| Graph/query | Grafo determinístico nos testes; consultas atuais retornam dossiers e histórico retirado tem rótulo/revisão de recuperação |
| Utilitários Python IA | Revisor executou novamente 27 + 7 testes puros, sem importar API configurada nem chamar provedores |
| Verificador de rollout | Revisor executou novamente 7 testes offline mockados; não é observação de rollout real |
| Whitespace | `git diff --check` e checagem dos arquivos novos passaram |

O checker não apaga arquivos nem atualiza o snapshot automaticamente. O snapshot foi
renovado conscientemente depois da leitura/revisão. Templates env rastreados entram
no catálogo, mas não no hashing de fonte; credenciais reais/symlinks continuam excluídos.
Exclusão sem manifesto/proveniência correspondente, divergência de bytes históricos
ou reaparecimento silencioso de um original falha no checker.

## Limites e estado Git

Jest/Vitest/build/browser, suíte DBA completa, HTTP real, embeddings/provedores, DB/RLS
remotos e aceitação visual não foram executados para esta limpeza. MkDocs não está
instalado no Python de sistema nem no `.venv`; build/render do site público não foi
feito. Navegação e links locais foram checados estaticamente. Scans/artefatos antigos
não viram aceitação de produção pela presença no catálogo.

Mudanças abrangem documentação, templates de setup e tooling da KB; código de runtime,
workflows, dados e SQL foram preservados. Trabalho concorrente em `docs/capacity/` e
`output/` ficou fora da limpeza. Não houve commit, push, merge, deploy, migration,
scraping nem chamada paga. A proposta de enforcement da KB no CI segue `OPEN-KB-001`.
