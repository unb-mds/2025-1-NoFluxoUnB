-- Estado do Montador de Grade por aluno + período: cenários (as abas), pool,
-- prioridades, turnos. Antes ficava só no localStorage do navegador.
-- Uma linha por (aluno, período); `estado` é validado e limitado no backend
-- (<= 6 cenários, <= 8 KB). `versao` dá concorrência otimista (409 no conflito).
-- Rodar uma vez no SQL Editor do Supabase. Sem FK pra "users" (mesmo padrão de
-- preferencias_grade); RLS ligada SEM policy: só a service role do backend acessa.
--
-- REVERSÃO:  drop table if exists public.grade_montador;

begin;

create table if not exists public.grade_montador (
  id_user bigint not null,
  ano_periodo text not null,
  estado jsonb not null,
  versao integer not null default 1,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id_user, ano_periodo),
  constraint grade_montador_estado_objeto check (jsonb_typeof(estado) = 'object'),
  constraint grade_montador_estado_tamanho check (pg_column_size(estado) <= 16384)
);

alter table public.grade_montador enable row level security;

commit;
