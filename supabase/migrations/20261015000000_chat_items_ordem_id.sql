-- Ordem dos itens da Darcy por id (backend/src/services/chat/supabase_session.ts).
--
-- Os itens de um turno (pergunta, chamadas de tool, resultados, resposta) são
-- gravados num só insert e saem com o mesmo created_at; ordenar por ele devolvia
-- empates em ordem arbitrária. O id (identity) segue a ordem de inserção, então
-- as leituras passaram a ordenar por ele — estes índices cobrem essas leituras.
--
-- Idempotente: pode rodar mais de uma vez no SQL Editor.

create index if not exists idx_chat_items_session_id on public.chat_items(session_id, id);
create index if not exists idx_chat_items_conversa_id on public.chat_items(session_id, conversa_id, id);
