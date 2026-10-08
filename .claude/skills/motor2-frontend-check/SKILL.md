---
name: motor2-frontend-check
description: Confira tipos, lint, testes locais e build Svelte do Motor 2 após mudanças nos serviços, store, plano ou montador. Use para verificação de frontend; não prova funcionamento visual ou produção.
---

# Verificação local do frontend Motor 2

Consulte `npm run kb:query -- "frontend plano formatura montador testes"` e
`docs/kb/subsystems/frontend-and-academic-planning.md`. Confirme scripts e
dependências em `frontend/package.json`.

Execute as verificações pertinentes à mudança:

- `npm --prefix frontend run check` — Svelte/TypeScript; reporte os diagnósticos reais.
- `npm --prefix frontend run lint` — use o script presente, sem inventar flags de outro ESLint.
- `npm --prefix frontend run test:unit -- src/lib/stores/plano-formatura.limiteCreditos.test.ts`.
- Para pool/equivalências, selecione os testes existentes de `grade-pool` e
  `supabase-data` relacionados; não execute testes de “dados reais” sem ler seu setup.
- `npm --prefix frontend run build` quando a mudança puder afetar rotas ou bundle.

Capture o código de saída original e a saída integral. Não use `| head`/`| tail`
para decidir aprovação. Dependência ausente ou erro anterior precisa de evidência
comparativa antes de ser chamado de regressão ou baseline.

Confira `/plano-formatura` e `/planejamento/grade` na árvore de rotas Svelte. O
mapa `routes.ts` pode manter referências antigas; uma busca com “3 matches” não
prova navegação. Verifique os consumidores efetivos e, quando houver alteração
visual, use navegador conforme a autorização da tarefa. Build não prova UX.

Confira estados de erro/carregamento, textos acessíveis e feedback sem julgamento,
conforme `docs/design-system.md` e `docs/marca-e-posicionamento.md`. Registre
comandos, resultados, limitações e dossiers afetados; não declare execução de
Playwright, API ou produção quando só houve verificação local.
