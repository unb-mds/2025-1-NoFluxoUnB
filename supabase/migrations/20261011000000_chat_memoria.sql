-- Memória da Darcy entre conversas (backend/src/services/chat/memoria_aluno.ts).
--
-- A sessão manda ao modelo só os últimos itens (JANELA_PADRAO_ITENS). O que sai
-- dessa janela — e a conversa inteira, no "Nova conversa" — é consolidado num
-- resumo curto que volta para o prompt de toda mensagem. Assim a Darcy lembra de
-- objetivos, preferências e decisões do aluno sem reenviar o histórico todo.
--
-- Idempotente: pode rodar mais de uma vez no SQL Editor.

alter table public.chat_sessions
    add column if not exists memoria text,
    -- Último chat_items.id já consolidado na memória (cursor; null = nada ainda).
    add column if not exists memoria_ate bigint,
    add column if not exists memoria_atualizada_em timestamptz;
