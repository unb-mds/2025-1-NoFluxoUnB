# Darcy única

Status: backend implementado (`/chat/send`, `/chat/historico`, `/chat/nova-conversa`).
As rotas legadas (`/assistente/chat`, `/planejamento/chat`) continuam no ar até o
frontend migrar para a Darcy única; depois saem.

## O que é

Uma Darcy só para as três telas que têm chat — **Assistente**, **Plano de Formatura** e
**Montador de Grade** — com:

- **um agente**: o orquestrador `@openai/agents` (`backend/src/services/chat/orquestrador_agent.ts`);
- **uma conversa**: a sessão do aluno (`chat_sessions`/`chat_items`), a mesma em todas as telas;
- **o mesmo conjunto de tools** em qualquer tela; a tela só muda o protocolo de instruções
  e o ponto de partida (ex.: a grade aberta no Montador);
- **o perfil do aluno na janela de contexto** de toda mensagem, montado no servidor a
  partir do banco (`perfil_aluno.ts`).

O fluxograma não tem chat (decisão de produto).

## Mapa: o que entra no contexto, o que vira tool, o que nunca entra

Regra: **no contexto** o que é pequeno, estável na conversa e necessário para quase toda
resposta (evita a Darcy chutar ou chamar tool à toa); **tool** o que é grande, específico
de uma matéria ou caro de calcular; **nunca** o que não é do aluno ou não ajuda a decidir.

### Sempre no contexto — bloco "Perfil do aluno" (teto de ~10 mil caracteres)

| Dado | Fonte |
|---|---|
| Curso, matriz, semestre atual, período letivo ativo | `historicos_usuarios` (último), `dados_users`, RPC `periodo_letivo_atual` |
| IRA; integralização por horas e horas faltantes por natureza | `historicos_usuarios.ira`; `dados_users.carga_horaria_integralizada` × `matrizes.ch_*` |
| Matérias **em curso** com turma e professor reais | `dados_users.fluxograma_atual` (MATR do período ativo) |
| Concluídas (só códigos) | `fluxograma_atual` (APR/CUMP) |
| Obrigatórias pendentes **já liberadas** (pré-requisito fecha contando o que cursa agora) | matriz + `pre_requisitos` + equivalências |
| Resumo do plano de formatura: semestres restantes, formatura estimada, próximo semestre recomendado, críticas, não alocadas | Motor 2 (`gerarPlanoCompletov2`) |
| Preferências: limite de créditos, objetivo, trabalha; restrições (adiar/priorizar/optativas adicionadas); turnos e professores salvos | `dados_users.preferencias_plano`, `preferencias_grade` |
| **Tela atual + estado dela** | único dado vindo do cliente (`superficie` + `estado`) |

Listas longas são cortadas com "(+N)" para caber no teto.

### Via tool (sob demanda)

| Necessidade | Tool |
|---|---|
| Detalhe de integralização / histórico com menções e IRA oficial | `consultar_integralizacao`, `consultar_historico_aluno` |
| Status de uma matéria (concluída / em curso / pendente / fora do currículo) | `consultar_status_materia` |
| Turmas, horários, professores e vagas de uma matéria | `consultar_turmas_materia` |
| Ementa e informações; opiniões | `consultar_informacoes_materia`, `consultar_opinioes_disciplina` |
| Matérias por local | `buscar_materias_por_local` |
| Busca semântica de optativas e de módulo livre | `buscar_optativas`, `buscar_modulo_livre` |
| O que cabe num horário livre; montar/rearranjar a grade (solver) | `recomendar_por_horario_livre`, `montar_grade` |
| Plano completo; simular; adiar/priorizar; ajustar carga; adicionar optativa | `consultar_plano`, `simular_cenario`, `mover_materia`, `ajustar_carga`, `ajustar_carga_semestre`, `adicionar_optativa` |

`buscar_materias_unb` (busca crua do registry legado) **não** é exposta: `buscar_optativas`
e `buscar_modulo_livre` fazem a mesma busca já filtrando o que o aluno cursou e a matriz.

### Nunca

- Dados de outro aluno.
- E-mail, matrícula, nome completo — `PerfilAluno` nem carrega esses campos.
- Menções individuais no contexto fixo (só via tool, quando o aluno pergunta).
- Qualquer coisa que o cliente mande sobre o aluno além do estado da tela: currículo,
  concluídas e preferências vêm sempre do banco. `curriculoCompleto`/`planoInput` no body
  são ignorados.

## Contrato HTTP

Auth: `Authorization: Bearer <token do Supabase>`. A sessão é o uuid do token.

`POST /chat/send`

```ts
{ message: string,
  superficie: 'assistente' | 'plano' | 'montador',
  estado?:
    | { tipo: 'montador', grade: {codigo: string, idTurma: number}[], creditos: number,
        turnos: ('M'|'T'|'N')[], incluirCursando: boolean, horarioLivre: string /* bigint */ }
    | { tipo: 'plano', semestreFoco?: number }
    | { tipo: 'assistente' } }
→ { reply: string,
    opcaoGrade?: { estrategia, selecao: {codigo, idTurma}[] },  // montar_grade rodou
    plano?: PlanoFormaturav2,                                    // tool de plano alterou o plano
    restricoes?: { adiar, priorizar, adicionar, adicionarEm, limitesPersonalizados } }
```

- Transição: o body antigo do Montador (`contexto:'montador'`, `horarioLivre`,
  `codigosNaGrade`) é aceito e vira `superficie:'montador'`.
- `/turmas COD` responde sem chamar o modelo (botões "ver turmas" do plano) e a troca é
  gravada na sessão.
- Quando uma tool altera as restrições do plano, o backend já as grava em
  `dados_users.preferencias_plano.restricoes`; a tela só aplica `plano`/`restricoes`.

`GET /chat/historico` → `{ mensagens: {role:'user'|'assistant', content}[] }` — só o que o
aluno viu (mensagens dele e a resposta final de cada turno), em ordem, últimas 50.

`POST /chat/nova-conversa` → `{ ok: true }` — apaga os itens da sessão.

## Ações no chat

A resposta da Darcy é texto com marcadores que o app (`ChatPanel.svelte`) desenha como
elementos interativos. O marcador tem o **mesmo significado em toda tela**; o que muda
por tela é só a ação disponível.

| Marcador | Quem gera | Montador | Plano | `/assistente` |
|---|---|---|---|---|
| Código de matéria (`ABC1234`) | texto do modelo | chip com nome; menu: "Perguntar sobre", "+ grade" | chip com nome; menu: "Perguntar sobre", "Ver turmas" | chip com nome; menu: "Perguntar sobre", "Ver turmas" |
| `[TURMA\|turma\|docente\|horario\|local\|vagas\|periodo\|COD\|IDTURMA]` | determinístico (tool `consultar_turmas_materia` / atalho `/turmas`) | card + "Usar esta turma" | card | card |
| `[MONTAR_GRADE\|COD:ID,COD:ID]` (grade pronta) | **backend anexa** a partir de `opcaoGrade` | "Aplicar esta grade" | "Abrir no Montador" (leva e aplica) | "Abrir no Montador" |
| `[MONTAR_GRADE\|COD,COD]` (sugestão sem turma) | AtuadorGrade (`recomendar_por_horario_livre`) | "Montar grade com X, Y" | "Abrir no Montador" | "Abrir no Montador" |
| `[BOTAO\|rótulo\|mensagem]` | modelo, com regras | resposta rápida | idem | idem |

Regras:
- **Só a última resposta tem ações vivas** (`[BOTAO]`, "Usar esta turma"); nas antigas
  ficam desabilitadas. Exceção: "Aplicar/Abrir no Montador" continua ativo.
- Nenhum clique sobrescreve o que o aluno está digitando.
- "Perguntar sobre" envia uma frase completa ("Me conta sobre {nome} ({cod})"), nunca o
  código cru; "Ver turmas" envia `/turmas COD` (atalho sem LLM).
- `[MONTAR_GRADE]` tem só esses dois formatos — o antigo com turnos/professores/`0` saiu.

Como o backend garante isso:
- **Prompt** (`orquestrador_agent.ts`, bloco "Elementos interativos", vale em toda
  tela): códigos sempre `ABC1234`; `[BOTAO]` só para resposta rápida/confirmação, no
  máximo 3, rótulo ≤ 28 caracteres, mensagem = frase completa; `[TURMA]` e
  `[MONTAR_GRADE]` só vêm de tool e são repassados literalmente.
- **`[TURMA]`**: `marcadorTurma` (`services/agente/tools/materia_tools.ts`) monta os 8
  valores e troca `|`/`]` dentro de um valor por espaço. `periodo` pode vir vazio.
- **`[MONTAR_GRADE]` canônico**: quando a run produziu `opcaoGrade`, o `chat_controller`
  remove do texto qualquer `[MONTAR_GRADE|...]` escrito pelo modelo e anexa no fim o
  marcador gerado da própria `opcaoGrade` (`services/chat/marcadores.ts`). O SDK já gravou
  na sessão o texto do modelo; o controller então troca essa última resposta pelo texto
  final (`SupabaseSession.substituirUltimaResposta`), para o `/chat/historico` e as
  próximas runs verem exatamente o que o aluno viu.

## Memória e custo

- A cada `run` entram só os **últimos 30 itens** da sessão (`SupabaseSession`), aparados
  para começar numa mensagem do aluno. O perfil cobre o que é estável, então a conversa
  não precisa carregar tudo.
- O perfil é cacheado em memória por aluno (TTL 10 min). A cada mensagem o backend lê só
  os dados baratos (`dados_users`, último histórico, `preferencias_grade`) e compara a
  assinatura: mudou, recalcula. As rotas que gravam esses dados chamam
  `invalidarPerfilAluno` (`perfil_cache.ts`).
- Schema da sessão: `supabase/migrations/20261007000000_chat_sessions_darcy.sql`
  (idempotente; recria as tabelas se ainda estiverem no formato antigo da Fase 1).

## Arquivos

- `backend/src/services/chat/perfil_aluno.ts` — `montarPerfilAluno`, `renderizarPerfil`.
- `backend/src/services/chat/perfil_cache.ts` — cache e `invalidarPerfilAluno`.
- `backend/src/services/chat/superficie.ts` — tipos e `parseCorpoChat`.
- `backend/src/services/chat/orquestrador_agent.ts` — `createOrquestradorAgent`, efeitos (`obterEfeitosDoOrquestrador`).
- `backend/src/services/chat/atalhos.ts` — `/turmas`.
- `backend/src/services/chat/marcadores.ts` — `[MONTAR_GRADE]` canônico (`canonicalizarResposta`).
- `backend/src/services/chat/supabase_session.ts` — janela e histórico visível.
- `backend/src/controllers/chat_controller.ts` — rotas.
- Testes: `backend/tests-ts/darcy-unica.test.ts`, `darcy-marcadores.test.ts`, `orquestrador-fase2.test.ts`, `montador-grade-service.test.ts`.
