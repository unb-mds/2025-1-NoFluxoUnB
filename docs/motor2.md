# Motor 2 — contrato atual

O endpoint registrado é `POST /planejamento/gerar-plano`, em
`backend/src/controllers/PlanejamentoController.ts`. O handler autentica token e
`User-ID`, valida a entrada e monta dados do histórico persistido e catálogo;
`materiasFaltantes` não substitui a consulta no caminho v2 atual.

O algoritmo está em `backend/src/services/plano_formatura.service.ts::gerarPlanoCompletov2`.
Projeta MATR como aprovação esperada para semestres futuros, expande equivalências
em passe único e distribui obrigatórias/slots com heurísticas. Fallbacks, inclusive
alocação SOLO de candidata quando seu grupo de co-requisitos não cabe, impedem uma
promessa de satisfação universal de todas as restrições. `materiasNaoAlocadas` vazio
não comprova cobertura integral do pool regular.

O contrato detalhado, efeitos lazy de dificuldade/IA, limites e testes disponíveis
estão no [dossier backend](kb/subsystems/backend-api-and-motor2.md).
A experiência cliente está no [dossier frontend](kb/subsystems/frontend-and-academic-planning.md).
Essa documentação substitui a especificação antiga; não afirma aceite acadêmico ou deploy.
