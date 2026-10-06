# CLAUDE.md — mapa do repositório NoFluxoUNB

Guia de orientação para agentes de IA (e humanos chegando agora). O produto vivo é
**no-fluxo.com**: fluxograma acadêmico interativo da UnB com assistente de IA (Darcy).

## Regras de trabalho

- **Nunca fazer `git push` nem merge de PR sem autorização explícita** — commits locais
  são ok; quem publica é o mantenedor.
- Nunca criar branch com upstream de `origin/main` (usar `--no-track`); já houve push
  acidental direto na main por causa disso.
- Segredos só via `.env` (fora do git). Nunca hardcodar chaves — houve incidente de
  segurança com service_role vazada (ver `documentacao/incidente_seguranca_2026-09-04.md`).

## Mapa das áreas (o que é vivo e o que é morto)

| Pasta | Estado | O que é |
|---|---|---|
| `frontend/` | **vivo** | Frontend atual: SvelteKit 2 + Svelte 5 (runes) + Tailwind 4, SPA estática (adapter-static). Ver README da pasta. |
| `backend/` | **vivo** | API Node/TypeScript + Express. Ver README da pasta. |
| `mcp_agent/` | **vivo** | Serviço de IA (Darcy/Sabiá): FastAPI + Gemini embeddings + Maritaca + pgvector. Ver README da pasta. |
| `DBA/` | **vivo** | Camada de dados Python: scraping do SIGAA, ingestão no Supabase, parser de PDF. Ver README da pasta. |
| `DBA/tests/` | **vivo** | Suíte Pytest dos módulos Python (importa de `DBA/`). |
| `supabase/` | vivo | `migrations/` com os SQLs do banco (aplicados manualmente no SQL Editor; o baseline `latest_init_from_export.sql` é gerado pelo `npm run export-schema`). |
| `docs/` | **vivo** | Specs técnicas de engenharia (Motor 2, chatbot/orquestrador, domínio UnB, investigações). Conteúdo interno, não publicado. |
| `documentacao/` | **vivo** | Site público MkDocs (Material) — docs acadêmicas da disciplina: atas, requisitos, testes. `mkdocs.yml` fica na **raiz**; deploy automático no push da main (`ci.yml` → gh-pages). |
| `kubernetes_docs/` | vivo | Docs de infra: cluster K3s, registry privado, deploy, monitoring. |
| `scripts/` | vivo | `setup_env.py` (bootstrap) e `scripts/deploy/deploy_local.py` (usado pelo workflow de deploy). |
| `plans/` | **histórico** | 30 planos de implementação já concluídos (migração Flutter→Svelte etc.). Consultar como contexto; não é doc viva. |
| `no_fluxo_app/` | fora da main | App mobile Flutter — existe só na branch `feat/app-mobile-flutter`. Na main, qualquer resto no disco é lixo local não rastreado. |
| `no_fluxo_frontend/`, `test_historicos/`, `testes/`, `docs_testes/` | não rastreadas | Sobras locais no disco; ignorar. |

Deploy: 3 alvos containerizados (`k8s.backend.Dockerfile`, `k8s.frontend-svelte.Dockerfile`,
`k8s.mcp-agent.Dockerfile`) via `deploy.yml`, que roda quando o CI (`pipelineCI.yml`)
termina **verde** na main (`workflow_run`); `workflow_dispatch` manual continua sem gate.

## Comandos essenciais

O repo é um workspace pnpm (`frontend`, `backend`, `DBA`),
mas o CI usa `npm ci` dentro de cada pacote — os dois funcionam.

```bash
# Frontend (porta 5173)
cd frontend && npm run dev
npm run test:unit        # Vitest (testes junto ao código em src/)
npm run test:integration # Playwright E2E (tests-e2e/)
npm run check            # svelte-check — tem 4 erros pré-existentes conhecidos, não é gate

# Backend (porta 3325 com .env.example; default 3000 sem .env)
cd backend && npm run dev
npm test                 # Jest (tests-ts/)
npm run dev:full         # sobe backend + mcp_agent juntos

# Python
cd DBA/tests && python -m pytest   # cobre DBA/ (expressao_parser, parse_pdf)
black --check . && flake8 .           # na raiz; CI fixa black==25.11.0 flake8==7.3.0
```

## CI (`.github/workflows/pipelineCI.yml`)

Path-filtered (`dorny/paths-filter`): PR que só toca frontend não roda jobs de
backend/python; **push na main roda tudo**. Jobs: qualidade-python (Black/Flake8),
testes-python (Pytest), testes-backend (Jest), testes-frontend (Vitest).
Detalhes: `documentacao/testes/pipeline-ci.md`.

## Convenções

- Commits seguem `COMMIT_GUIDELINES.md`; setup completo de ambiente em `CONTRIBUTING.md`.
- Regras de negócio do banco (formato de `curriculo_completo`, `tipo_natureza`,
  política de insert/update) em `DBA/database/README.md`.
- Schema do banco exportado em `backend/docs/` (`npm run export-schema`);
  o baseline de migration gerado vai para `supabase/migrations/`.
