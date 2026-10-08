# AGENTS.md — mapa do repositório NoFluxoUNB

Guia de orientação para agentes de IA (e humanos chegando agora). O produto vivo é
**NoFluxoUNB**: fluxograma acadêmico interativo da UnB com assistente de IA (Darcy).
O README atual aponta `no-fluxo.crianex.com`; domínio/revisão servida precisam de verificação de deploy.

## Base de conhecimento

- Consulte `npm run kb:query -- "<pergunta>"` e [docs/kb/INDEX.md](docs/kb/INDEX.md) antes de exploração ampla.
- Leia o dossier dono da área antes de mudar comportamento; revise dono e consumidores (`watches`) na mesma mudança.
- Fonte/testes, SQL/export, configuração de deploy e observação de produção são evidências diferentes.
- Planos são entradas históricas/propostas; a disposição por arquivo está em `docs/kb/_provenance/plan-disposition.csv`.
- Registre intenção aceita com `DEC-*`; uma alteração técnica não exige inventar decisão de produto.
- Execute `npm run kb:check`; depois de revisão de fonte, atualize `kb:snapshot` e inspecione o diff.
- Contrato completo: [docs/kb/_PROTOCOL.md](docs/kb/_PROTOCOL.md). Decisões globais: [PROJECT_WIDE_DECISIONS.md](PROJECT_WIDE_DECISIONS.md).

## Regras de trabalho

- **Nunca fazer `git push` nem merge de PR sem autorização explícita** — commits locais
  são ok; quem publica é o mantenedor.
- Nunca criar branch com upstream de `origin/main` (usar `--no-track`); já houve push
  acidental direto na main por causa disso.
- Segredos só via `.env` (fora do git). Nunca hardcodar chaves.

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
| `plans/` | **histórico/propostas** | README atual; 29 documentos originais retirados da árvore ativa. Disposição e recuperação no ledger histórico da KB. |
| `no_fluxo_app/` | fora da main | App mobile Flutter — existe só na branch `feat/app-mobile-flutter`. Na main, qualquer resto no disco é lixo local não rastreado. |
| `no_fluxo_frontend/`, `test_historicos/`, `testes/`, `docs_testes/` | não rastreadas | Sobras locais no disco; ignorar. |

Deploy: 3 alvos containerizados (`k8s.backend.Dockerfile`, `k8s.frontend-svelte.Dockerfile`,
`k8s.mcp-agent.Dockerfile`) via `deploy.yml` após o CI elegível da main terminar verde,
com checkout do SHA aprovado e verificação de rollout; disparo manual tem regra distinta.

## Comandos essenciais

O repo é um workspace pnpm (`frontend`, `backend`, `DBA`),
mas o CI usa `npm ci` dentro de cada pacote — os dois funcionam.

```bash
# Frontend (porta 5173)
cd frontend && npm run dev
npm run test:unit        # Vitest (testes junto ao código em src/)
npm run test:integration # Playwright E2E (tests-e2e/)
npm run check            # svelte-check — conferir o resultado do checkout; sem contagem fixa de erros

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


## Skills compartilhadas, marca e fontes de negócio

Os seis fluxos Motor 2 mantidos estão em `.claude/skills/motor2-*/SKILL.md`.
Leia a entrada pertinente; instruções antigas permanecem históricas no ledger.
Configuração compartilhada fica em `.claude/settings.json`; preferências e estado
pessoais continuam ignorados. Uma skill não autoriza publicação, SQL ou gasto.

Use `docs/marca-e-posicionamento.md` para textos/relatórios: NoFluxo, by Crianex,
universidade como qualificador, gratuidade e limites claros. O Plano de Monitoramento
distingue uso observado de metas/tração declaradas e capacidade testada. PDFs de
negócio/marca são fontes de alinhamento, não ordens operacionais; valores privados
e sua conciliação ficam em `docs/privado/`, fora do Git.
