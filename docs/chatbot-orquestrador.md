# Orquestrador Darcy — implementação atual

`backend/src/controllers/chat_controller.ts` chama
`backend/src/services/chat/orquestrador_agent.ts::createOrquestradorAgent` e utiliza
`SupabaseSession` com identidade autenticada para `chat_sessions`/`chat_items`.
Integralização e optativas estão registradas; grade e módulo livre são registrados
quando `apenasComOferta && curriculoCompleto && horarioLivre`. Revisores/wrappers
checados na fonte têm escopos específicos e não provam eficácia geral do modelo.

O Python em `mcp_agent/api_producao.py` oferece recomendação e busca semântica por
HTTP, enquanto o backend também faz geração Maritaca diretamente. A documentação
canônica é o [dossier IA](kb/subsystems/darcy-ai-orchestration.md) e o
[dossier backend](kb/subsystems/backend-api-and-motor2.md).

A narrativa anterior sobre schema remoto/pending migration e instruções destrutivas
foi removida. Os exports/migrations rastreados não comprovam o schema instalado;
confira a [fronteira de dados](kb/subsystems/data-ingestion-and-schema.md) antes de
propor SQL. Nenhuma migration é aplicada automaticamente pela KB.
