---
name: motor2-backend-test
description: Execute testes locais do backend do Motor 2 após mudanças em planejamento, restrições, equivalências ou distribuição de semestres. Não substitui integração HTTP, E2E ou prova de deploy.
---

# Testes locais do backend Motor 2

Consulte `npm run kb:query -- "Motor 2 planejamento testes"` e
`docs/kb/subsystems/backend-api-and-motor2.md`. Leia o diff e os testes da área
antes de escolher o conjunto. O backend atual usa Express/TypeScript e Jest.

## Execução

- Confirme os scripts em `backend/package.json` e a disponibilidade das dependências.
- Execute `npm --prefix backend run type-check` e o conjunto relevante com
  `npm --prefix backend test -- --runInBand --runTestsByPath tests-ts/planejamento.test.ts`.
- Amplie conforme o contrato: `planejamento-corequisitos.test.ts`,
  `planejamento-restricoes.test.ts`, `distribuir-slots-fix.test.ts` e
  `planejador-agente.test.ts`. Use caminhos que existam no checkout.
- Capture saída completa e código de saída; ao resumir, não substitua o retorno do
  teste pelo retorno de `head`, `tail` ou de um filtro.

Não inicie backend, Supabase remoto ou IA paga para chamar isso de teste unitário.
Leia mocks e setup antes de executar uma suíte que possa chamar serviços. Ausência
de dependências ou fixture é limitação a relatar, não teste aprovado. SQL no
repositório não prova migration aplicada; não execute `supabase db push`.

## Leitura do resultado

Confira pré-requisitos, co-requisitos, limites de carga, oferta, equivalências e
matérias não alocadas no cenário afetado. O greedy possui fallbacks que podem
alocar sem co-requisito; teste uma correção contra a especificação aceita, sem
transformar a heurística existente em garantia acadêmica.

Relate revisão, comandos, resultados e limitações. Mantenha teste local,
integração, schema e produção como evidências separadas. Reveja dossier e
consumidores, rode `kb:check` e renove snapshot somente após revisão de fonte.
