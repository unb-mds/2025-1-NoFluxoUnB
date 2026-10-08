# Escolhas em aberto

Não há novas escolhas de produto aprovadas por esta auditoria. Divergências verificáveis
ficam nos dossiers e auditorias; não exigem que o mantenedor decida qual fato é verdadeiro.

### OPEN-KB-001 — Tornar manutenção da KB obrigatória no CI

Status: open
Evidence class: inferred

Esta rodada instala consulta, grafo, inventários e checagem local. Tornar `kb:check`
um job obrigatório, definir política de drift bloqueante e atribuir responsáveis de
manutenção ainda são propostas. Ver `docs/kb/_PROTOCOL.md` e
`docs/kb/subsystems/deployment-ci-and-operations.md`; nenhum workflow foi alterado.
