-- Conversas anteriores da Darcy (backend/src/services/chat/supabase_session.ts).
--
-- Antes "Nova conversa" APAGAVA os chat_items do aluno e a conversa ativa crescia
-- sem fim. Agora a conversa ativa são os itens com conversa_id nulo; "Nova
-- conversa" (ou ficar horas sem falar com a Darcy) ARQUIVA esses itens numa linha
-- de chat_conversas, que o aluno pode reabrir, retomar ou apagar. A memória
-- (`chat_sessions.memoria`) continua levando o contexto de uma conversa para outra.
--
-- Idempotente: pode rodar mais de uma vez no SQL Editor.

create table if not exists public.chat_conversas (
    id uuid primary key default gen_random_uuid(),
    session_id text not null references public.chat_sessions(session_id) on delete cascade,
    titulo text,                              -- primeira pergunta do aluno, cifrada (cripto_chat)
    mensagens integer not null default 0,     -- mensagens visíveis (aluno + respostas finais)
    inicio timestamptz,
    fim timestamptz,
    created_at timestamptz default now()
);

create index if not exists idx_chat_conversas_session on public.chat_conversas(session_id, fim desc);

-- null = conversa ativa; apagar a conversa arquivada apaga os itens dela.
alter table public.chat_items
    add column if not exists conversa_id uuid references public.chat_conversas(id) on delete cascade;

create index if not exists idx_chat_items_conversa on public.chat_items(session_id, conversa_id, created_at);

-- Mesmo modelo das outras tabelas do chat: só a service role do backend acessa.
alter table public.chat_conversas enable row level security;
