# Base de conhecimento do NoFluxoUNB

Mapa canônico interno do checkout. Comece pela pergunta, abra o dossier e confira
os símbolos citados. Revisão inicial em **2026-10-07**, branch `feat/new-docs`,
HEAD `c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`, com limpeza/revisão adicional em
**2026-10-08**. Fonte revisada não comprova
deploy, disponibilidade de provedores, migrations aplicadas ou aceitação do produto.

| Pergunta ou mudança | Dossier principal | Contratos relacionados |
|---|---|---|
| Visão geral, camadas, navegação da documentação, manutenção KB | [Projeto e documentação](./subsystems/project-and-documentation.md) | Todos |
| Telas Svelte, sessão, fluxograma, conexões, PDF, exportação, PWA | [Frontend e planejamento acadêmico](./subsystems/frontend-and-academic-planning.md) | API, dados, segurança |
| Endpoints Express, Motor 2, geração de plano, matching, proxy de chat | [Backend e Motor 2](./subsystems/backend-api-and-motor2.md) | Frontend, IA, dados, segurança |
| Darcy, FastAPI, orquestrador, embeddings, Maritaca, grade e RAG | [Orquestração de IA](./subsystems/darcy-ai-orchestration.md) | API, dados |
| SIGAA, currículos, scraping, expressões, parser Python, migrations/schema | [Dados e schema](./subsystems/data-ingestion-and-schema.md) | API, frontend, IA |
| CI, testes, Docker, K3s, bootstrap, probes, verificação de rollout | [Deploy e operações](./subsystems/deployment-ci-and-operations.md) | Segurança, todas as camadas |
| JWT, anonimato, administração, RLS, service role, uploads, privacidade | [Autenticação e segurança](./subsystems/auth-security-and-privacy.md) | Todos |

## Marca, skills e monitoramento

- [Marca e posicionamento](../marca-e-posicionamento.md): NoFluxo/by Crianex, apoio ao estudante, evidência e linguagem.
- Conciliação com os três PDFs (documento local, fora do Git): premissas comerciais versus fonte/observação; anexo financeiro local.
- Skills Motor 2 compartilhadas: `.claude/skills/motor2-*/SKILL.md`; catálogo e política em `CONTRIBUTING.md`.

## Auditoria e plano de capacidade

- Auditoria de recursos de 07/10 (documento local, fora do Git): fotografia de produção e estimativas condicionais, sem ensaio de capacidade.
- Plano de monitoramento de 08/10 (documento local, fora do Git): demanda, histórico, custo e critérios de implementação; propostas ainda não implementadas.

## Consulta e manutenção

```bash
npm run kb:query -- "como o Darcy gera uma grade?"
npm run kb:query -- "upload PDF equivalências"
npm run kb:check
npm run kb:graph
npm run kb:drift
```

[Protocolo](./_PROTOCOL.md), [template](./_TEMPLATE.md),
[schema](./_GRAPH_SCHEMA.json), [relações](./_RELATIONSHIPS.md) e
[tooling](../../scripts/docs-kb/README.md) explicam autoria e validação.
[Decisões transversais](../../PROJECT_WIDE_DECISIONS.md) registram a autoridade
humana; [escolhas em aberto](./OPEN_DECISIONS.md) contêm propostas sem aceitação.

## História, documentação existente e revisão

- [Inventário de documentos](./_provenance/document-inventory.csv) e [auditoria](./_provenance/DOCUMENTATION_AUDIT.md).
- [Ledger de planos: 29 retirados e README atual](./_provenance/plan-disposition.csv) e [auditoria histórica](./_provenance/PLAN_AUDIT.md).
- [Limpeza autorizada](./_provenance/CLEANUP_AUDIT.md), [manifesto de retirada](./_provenance/document-retirement.csv) e [segunda revisão independente](./_provenance/reviews/SECOND_REVIEW.md).
- [Proveniência e limites](./_provenance/README.md).
- [Revisão independente e verificações finais](./_provenance/reviews/FINAL_REVIEW.md).

`documentacao/` continua sendo o site acadêmico MkDocs. Guias atuais e entradas técnicas
foram alinhados ao código. Planos e guias obsoletos foram retirados da árvore ativa com
proveniência Git; atas, estudos e evidências datadas são identificados como história.
