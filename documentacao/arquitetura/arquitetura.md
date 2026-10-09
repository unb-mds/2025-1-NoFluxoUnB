# Arquitetura do NoFluxoUNB

Esta página descreve a organização identificada no código do repositório em 2026-10-07. A arquitetura atual reúne um frontend Svelte, uma API Express, um serviço de IA FastAPI e o Supabase. A presença de código ou configuração não confirma a revisão servida em produção.

## Componentes e comunicação

| Componente | Responsabilidade | Fonte principal |
| --- | --- | --- |
| `frontend/` | Interface SvelteKit 2 / Svelte 5, autenticação, fluxograma, upload e planejamento de grade | `frontend/package.json`, `frontend/src/routes/`, `frontend/src/lib/services/` |
| Supabase | Autenticação, catálogo acadêmico, dados do aluno, RPCs e políticas de acesso | `frontend/src/lib/supabase/`, `backend/src/supabase_wrapper.ts`, `supabase/migrations/` |
| `backend/` | API Express/TypeScript, planejamento de formatura, chat, autorização e administração | `backend/src/index.ts`, `backend/src/controllers/`, `backend/src/services/` |
| `mcp_agent/` | Serviço FastAPI de busca semântica e respostas do Darcy, com Gemini, Maritaca e Supabase | `mcp_agent/api_producao.py`, `backend/src/services/sabia.service.ts` |
| `DBA/` | Coleta do SIGAA, transformação e ingestão de dados acadêmicos | `DBA/scraping/`, `DBA/database/` |

O acesso a dados é híbrido: o navegador usa Supabase diretamente para parte dos fluxos e chama a API Express para outros. A API Express também usa Supabase e chama o FastAPI por HTTP. Não é correto descrever todo acesso ao banco como intermediado pelo Express.

O histórico PDF é processado no navegador por `pdfjs-dist`, em `frontend/src/lib/services/pdf/`. O casamento das disciplinas usa a RPC `casar_disciplinas` do Supabase. O parser Flask preservado em `DBA/parse_pdf/` atende a testes legados; ele não é o serviço de upload do produto atual.

O planejamento acadêmico e o chat têm caminhos distintos no backend: Motor 2, agente planejador e orquestração em `services/chat/`. Há código RAGFlow preservado, mas sua existência não o torna o caminho principal do Darcy atual. A documentação interna registra a divisão por fluxo e seus consumidores.

## Hospedagem e publicação

O frontend usa `@sveltejs/adapter-static`, com fallback `index.html`, e é servido pela imagem `k8s.frontend-svelte.Dockerfile`. A flag do layout e a renderização durante o build devem ser avaliadas separadamente da hospedagem estática; adapter-static não implica automaticamente `ssr = false`.

As três imagens de aplicação são definidas nos Dockerfiles `k8s.backend.Dockerfile`, `k8s.frontend-svelte.Dockerfile` e `k8s.mcp-agent.Dockerfile`. O workflow `deploy.yml` aguarda um CI elegível e aprovado na main, publica o SHA desse run e verifica o rollout. O disparo manual possui uma condição distinta. Essas configurações não substituem a observação da revisão efetivamente servida.

O site acadêmico é outra publicação: `mkdocs.yml` lê `documentacao/`, e `ci.yml` publica o site em gh-pages após push na main. A base interna de engenharia em `docs/kb/` não integra esse diretório público.

## Limites desta descrição

Exports em `backend/docs/` e SQLs em `supabase/migrations/` descrevem fontes e snapshots. Não demonstram quais migrações estão aplicadas no banco vivo. Planos e estudos antigos preservam decisões e propostas da época; sua implementação deve ser confirmada por arquivo e por fluxo.

Fontes: [entrada da API](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/backend/src/index.ts), [configuração Svelte](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/frontend/svelte.config.js), [serviço FastAPI](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/mcp_agent/api_producao.py), [deploy](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/.github/workflows/deploy.yml), [índice interno da KB](https://github.com/unb-mds/2025-1-NoFluxoUNB/blob/main/docs/kb/INDEX.md).
