# Chat do planejador — implementação atual

O caminho legado `POST /planejamento/chat` usa `PlanejadorAgenteService` e
`createDefaultRegistry`; `/assistente/chat` reutiliza esse serviço. O caminho
`POST /chat/send` usa o SDK de agentes, `createOrquestradorAgent` e `SupabaseSession`.
São protocolos coexistentes: histórico enviado pelo cliente versus sessão persistida
com identidade derivada da autenticação. Não descrever todos como uma única migração concluída.

A configuração Node de modelo está em `backend/src/config/maritaca.ts`; não repetir
nomes antigos nem inferir disponibilidade no provedor. Comandos diretos, ferramentas,
cotas, timeout e limites de contexto estão no
[dossier backend](kb/subsystems/backend-api-and-motor2.md).
A UI está no [dossier frontend](kb/subsystems/frontend-and-academic-planning.md).
