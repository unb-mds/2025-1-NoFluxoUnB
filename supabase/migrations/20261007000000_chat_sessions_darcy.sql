-- Sessão da Darcy única (/chat/send) — memória persistida do @openai/agents.
-- Schema: docs/chatbot-orquestrador.md (seção "Fase 1 — Sessão persistida").
-- Contrato e mapa de contexto: docs/darcy-unificada.md.
--
-- Idempotente: pode rodar mais de uma vez no SQL Editor.
--
-- Se o banco ainda estiver no formato ANTIGO da Fase 1 (id_session / id_user bigint /
-- role + content), as duas tabelas são recriadas: o formato antigo não guarda o
-- AgentInputItem e o SDK não consegue reconstruir o histórico a partir dele.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'chat_sessions' and column_name = 'id_session'
    ) then
        drop table if exists public.chat_items;
        drop table if exists public.chat_sessions;
    end if;
end $$;

create table if not exists public.chat_sessions (
    session_id text primary key,              -- = uuid do usuário (auth.users.id) em texto
    user_id uuid references auth.users(id),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists public.chat_items (
    id bigint generated always as identity primary key,
    session_id text references public.chat_sessions(session_id) on delete cascade,
    item jsonb not null,                      -- AgentInputItem inteiro (não só role/content)
    created_at timestamptz default now()
);

create index if not exists idx_chat_items_session on public.chat_items(session_id, created_at);

-- O backend acessa com a service role (que ignora RLS). Sem policy pública: nenhum
-- cliente lê a conversa de outro aluno direto pelo Supabase.
alter table public.chat_sessions enable row level security;
alter table public.chat_items enable row level security;
