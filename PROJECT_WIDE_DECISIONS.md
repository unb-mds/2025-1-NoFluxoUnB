# Decisões transversais do NoFluxoUNB

Snapshot documental de 2026-10-07 no checkout `feat/new-docs`, fonte inicial
`c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`. Aceitação abaixo refere-se às instruções
do usuário nesta sessão e ao contrato do repositório; não atribui aprovação retrospectiva
a escolhas apenas encontradas no código.

### DEC-GLOBAL-001 — Publicação depende de autorização explícita

Decision status: effective
Implementation status: implemented-unverified
Evidence class: owner-confirmed
Accepted by: instruções do usuário e AGENTS.md
Accepted at: 2026-10-07 (reafirmado nesta sessão)
Supersedes: none

Não fazer `git push` nem merge de PR sem autorização explícita. Branch nova não deve
ter upstream de `origin/main`; usar `--no-track`. Commits locais são permitidos.

Implementation evidence:
- `AGENTS.md` — Regras de trabalho.
- Procedimento humano; não há alegação de bloqueio técnico de push nem verificação de todos os upstreams.

### DEC-GLOBAL-002 — Segredos fora do Git

Decision status: effective
Implementation status: partial
Evidence class: owner-confirmed
Accepted by: instruções do usuário e AGENTS.md
Accepted at: 2026-10-07 (reafirmado nesta sessão)
Supersedes: none

Segredos só via `.env` fora do Git; não hardcodar chaves. Não inferir conformidade
global a partir de uma regra escrita ou da presença de scanners.

Implementation evidence:
- `.gitignore`, `.gitleaks.toml`, `.github/workflows/security_scan.yml` — controles declarados.
- `docs/kb/subsystems/auth-security-and-privacy.md` — limites observados na fonte.
- Nenhum segredo foi lido para esta consolidação; histórico completo não foi reauditado.

### DEC-GLOBAL-003 — KB canônica com revisão independente

Decision status: superseded
Implementation status: verified-local
Evidence class: owner-confirmed
Accepted by: pedido explícito do usuário nesta sessão
Accepted at: 2026-10-07
Supersedes: none

Aplicar o método KB do Job Scribe Connect ao NoFluxoUNB, explorar código/docs/planos
com subagentes e executar revisão independente. Dossiers contêm implementação
observada; inventários preservam proveniência; planos originais continuam disponíveis.

Implementation evidence:
- `docs/kb/INDEX.md`, `docs/kb/_PROTOCOL.md`, `scripts/docs-kb/`.
- `docs/kb/_provenance/` — inventários, auditorias e resultados da revisão.
- Revisões independentes e testes locais da KB registrados em `docs/kb/_provenance/reviews/FINAL_REVIEW.md`; publicação é uma etapa separada.

### DEC-GLOBAL-004 — KB atual e retirada de orientação obsoleta

Decision status: effective
Implementation status: verified-local
Evidence class: owner-confirmed
Accepted by: solicitação explícita do usuário nesta conversa para segunda revisão e remoção de documentação divergente
Accepted at: 2026-10-07 (limpeza e rechecagem concluídas em 2026-10-08)
Supersedes: DEC-GLOBAL-003

Continuar a KB com dossiers, evidência e revisão independente; substituir o compromisso
anterior de manter todos os planos na árvore ativa. Remover guias/planos obsoletos,
corrigir guias válidos e manter atas/estudos/evidência datada como história.
Retiradas exigem revisão Git imutável, hash, motivo, autorização e destino canônico;
o tooling verifica esses registros sem executar exclusão ou publicação.

Implementation evidence:
- `docs/kb/_provenance/document-retirement.csv`, `CLEANUP_AUDIT.md` e `reviews/SECOND_REVIEW.md`.
- `scripts/docs-kb/kb.mjs` — tombstones validados contra objetos Git locais.
- Fonte/testes, schema, configuração e produção continuam sendo estados distintos.

### INV-GLOBAL-001 — Evidência não atravessa camadas automaticamente

Status: effective
Verification status: source-reviewed
Evidence class: curated

Fonte revisada, teste existente, teste executado, migration/export, configuração de
deploy e observação em produção são estados distintos. Nenhum dossier desta rodada
declara aceitação de produção. `docs/kb/_PROTOCOL.md` define as classes e limites.


### DEC-CAP-001 — Documentar alternativa de Realtime e Edge no backend

Decision status: proposed
Implementation status: not-implemented
Evidence class: owner-confirmed
Accepted by: pedido do mantenedor para incluir a alternativa no relatório de capacidade
Accepted at: 2026-10-08
Supersedes: none

Documentar a opção de clientes WebSocket no backend com conexão do servidor ao
Supabase Realtime e a opção de portar Edge Functions ao backend. A aceitação é da
inclusão da alternativa no estudo; a migração técnica permanece proposta.

Implementation evidence:
- `docs/capacity/relatorio-capacidade-nofluxo-2026-10-07.tex` — proposta e condições.
- Não há migração, implantação ou capacidade do desenho novo validada.

### DEC-CAP-002 — Planejar medição persistente de demanda e capacidade

Decision status: effective
Implementation status: not-implemented
Evidence class: owner-confirmed
Accepted by: pedido do mantenedor nesta conversa para plano aprofundado e revisado com custo de armazenamento
Accepted at: 2026-10-08
Supersedes: none

Planejar a medição de quantos usuários são atendidos, qualidade das jornadas,
recursos/cotas e capacidade validada, preservando histórico e estimando seu custo.
As escolhas técnicas são propostas do plano; não se atribui a essa intenção uma
aprovação de deploy, contratação, tratamento de dados ou carga em produção.

Implementation evidence:
- `docs/capacity/plano-monitoramento-capacidade-2026-10-08.md` — plano e critérios de execução.
- `docs/capacity/monitoring-plan-review-2026-10-08.json` — revisão de desenho e exemplos locais, sem runtime futuro implementado.
