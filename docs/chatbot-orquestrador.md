# Orquestração do Chatbot Darcy AI

> **Evolução:** este orquestrador virou a **Darcy única** — um agente, uma conversa e o
> perfil do aluno no contexto para as telas Assistente, Plano e Montador. Contrato atual,
> mapa do que entra no contexto/tool/nunca e a migration nova da sessão
> (`20261007000000_chat_sessions_darcy.sql`, idempotente): **[darcy-unificada.md](darcy-unificada.md)**.
> O resto deste documento é o histórico das fases 1–4.

Status: Fases 1–4 implementadas em código e testadas (mocks). Schema do Supabase
**pendente de reaplicação** — mudou de formato na Fase 1 revisada, ver seção Schema.

## Contexto

O Darcy AI (chat da aba Assistente / Planejamento) era um agente único (Node/Express +
Maritaca), sem persistência de histórico entre turnos — causa do bug do relatório de
qualidade (o assistente pedia pro aluno reenviar dados já informados). Este documento
cobre o plano incremental de 4 fases que resolve isso e reestrutura o agente em
camadas: orquestrador → atuadores → revisor → revisor do revisor (condicional).

**Stack:** SDK `@openai/agents` (openai-agents-js), model provider Maritaca via
`OpenAIChatCompletionsModel` (a API da Maritaca já fala o protocolo Chat Completions da
OpenAI nativamente — sem LiteLLM/adapter), persistência própria em Supabase Postgres
(`SupabaseSession`, implementa a interface `Session` do SDK).

Isolado do Darcy legado: `PlanejadorAgenteService`, `/assistente/chat`,
`/planejamento/chat` e a pasta `services/agente/tools/` não foram modificados. O que
existe aqui é aditivo, sob `src/services/chat/` e `src/controllers/chat_controller.ts`
(`POST /chat/send`).

---

## Fase 1 — Sessão persistida

**Schema** (`supabase/migrations/20260722010000_chat_sessions_openai_agents_schema.sql`
— substitui a primeira versão da Fase 1, `20260722000000_...sql`, que tinha um formato
diferente e **já foi descartada**; desde a fase 3 da reorganização a pasta
`supabase/migrations/` é versionada no git, mas os SQLs continuam sendo aplicados
manualmente no SQL Editor):

```sql
create table chat_sessions (
  session_id text primary key,          -- = uuid do usuário (auth.users.id) em texto
  user_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table chat_items (
  id bigint generated always as identity primary key,
  session_id text references chat_sessions(session_id) on delete cascade,
  item jsonb not null,                  -- AgentInputItem inteiro (não só role/content)
  created_at timestamptz default now()
);

create index idx_chat_items_session on chat_items(session_id, created_at);
```

**⚠️ Ação pendente:** o schema *live* no Supabase ainda está no formato antigo
(`id_session`/`id_user` bigint/`role`+`content`). Rodar a migração
`20260722010000_chat_sessions_openai_agents_schema.sql` (faz `DROP TABLE` das duas e
recria no formato novo) antes de usar `/chat/send` em produção.

**Componentes:**
- `src/services/chat/supabase_session.ts` — `SupabaseSession implements Session`
  (`getSessionId`, `getItems`, `addItems`, `popItem`, `clearSession`). Sem estado em
  memória — nova instância com o mesmo `session_id` sempre lê do banco.
- `src/services/chat/model_provider.ts` — `createMaritacaModel()`.
- `src/services/chat/darcy_agent.ts` — agente único sem tools (mantido só como
  referência/rollback; não é mais o entry point de produção desde a Fase 2).

**Testes:** `npm run test:session-persistence` (`tests-ts/session-persistence.test.ts`)
— sobrevive a reinício, sem vazamento entre usuários, e a reprodução do cenário do
relatório de qualidade (pergunta de acompanhamento não pede reenvio) rodando o SDK
real (`run()`/`Agent`/`OpenAIChatCompletionsModel`), só mockando o client `openai`.

---

## Fase 2 — Orquestrador + Atuadores

`src/services/chat/orquestrador_agent.ts` — `createOrquestradorAgent(email, apenasComOferta?)`
é o entry point de produção do `/chat/send`. Classifica a intenção e delega via
`agent.asTool()` (padrão agents-as-tools — o orquestrador sempre controla a resposta
final, sem handoffs).

**Atuadores implementados** (dos 4 candidatos do plano original, os dois priorizados):
- `src/services/chat/actuators/integralizacao_actuator.ts` — `consultar_integralizacao`,
  lê `historicos_usuarios` (mesma tabela que a tool `consultar_historico_aluno` do
  Darcy legado usa) resolvendo o `id_user` bigint a partir do e-mail autenticado.
- `src/services/chat/actuators/optativas_actuator.ts` — `buscar_optativas`, reusa
  `SabiaService.buscarMaterias` (busca semântica) + filtro por oferta ativa
  (`filtrarPorOfertaAtiva`, reimplementado aqui — não reexportado do Darcy legado —
  isolando de propósito o caminho que o relatório de qualidade apontou como bugado).

Não implementados (não priorizados pelo plano original): atuador de grade/matérias
desbloqueadas, atuador de perguntas gerais/navegação (o orquestrador responde essas
direto, sem atuador dedicado).

**Testes:** `npm run test:orquestrador-fase2` — cada atuador testado isolado (critério
de aceite da Fase 2) + teste de delegação do orquestrador ponta a ponta.

---

## Fase 3 — Revisor numérico

Guardrail (`outputGuardrails` no `AtuadorIntegralizacao`) que compara os números
citados na resposta final com os dados brutos da última chamada à tool — qualquer
número >1 na resposta que não aparece nos dados é tratado como possível alucinação e
dispara `OutputGuardrailTripwireTriggered`.

`runIntegralizacaoComRevisao(agent, input)` — roda o atuador; se o revisor reprovar,
reexecuta UMA vez com o motivo da reprovação injetado no prompt.

Só implementado no atuador de Integralização (o de risco numérico citado no plano) —
Optativas não tem esse guardrail.

**Testes:** `npm run test:revisor-fase3`.

---

## Fase 4 — Revisor do revisor (condicional)

Implementada como extensão de `runIntegralizacaoComRevisao`, não como camada à parte —
por isso não roda em toda mensagem, só no caminho raro em que a 1ª tentativa já falhou
a revisão (sem custo/latência extra no caso comum).

Os dois gatilhos do plano colapsam em um só aqui: integralização É a categoria de alto
risco citada no plano ("é matemática, não deveria ter margem de erro"), então o
gatilho "categoria de alto risco" já vale sempre para este atuador — falta só medir
"reprovou duas vezes seguidas", que é mecânico (reexecução da Fase 3 também reprovada).

Quando isso acontece: escalona pra `RESPOSTA_ESCALONAMENTO_FASE4` ("Não tenho certeza
dos números... confira na tela de Fluxograma") em vez de devolver um número não
verificado ou estourar erro pro usuário.

**Nota do plano original:** "medir taxa de reprovação da Fase 3 em produção por 1-2
semanas antes de decidir sobre a Fase 4" — essa medição não foi feita (não há tráfego
de produção nesta sessão). O código foi implementado por pedido explícito do usuário
("implemente todas as 4 fases"), mas a decisão de ativar/manter ativo em produção sem
esse dado é do time, não uma validação que este trabalho conclui.

**Testes:** cobertos em `tests-ts/revisor-fase3.test.ts` (mesma suíte da Fase 3).

---

## Rodando tudo

```
npm run test:orquestrador   # session-persistence + fase2 + fase3/4, 15 testes
npm run build && npm run type-check
```
