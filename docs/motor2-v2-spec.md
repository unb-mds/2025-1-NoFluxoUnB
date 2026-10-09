# Motor 2 v2 — referência da implementação

Use o [contrato atual do Motor 2](motor2.md) e o
[dossier backend](kb/subsystems/backend-api-and-motor2.md).

A especificação anterior foi substituída: seu endpoint `gerar-plano-completo`, payload
isolado de `id_user` e garantias de algoritmo não correspondiam ao handler registrado.
A fonte atual é `PlanejamentoController.routes['gerar-plano']`, `montarDadosPlano` e
`gerarPlanoCompletov2`; o contrato de tipos está em `backend/src/types/planejamento.ts`.
Cenários futuros devem ser propostas explícitas, sem apresentá-los como comportamento entregue.
