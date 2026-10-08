---
id: SUB-backend
title: Backend API, Motor 2 e portas de entrada do Darcy
aliases:
  - motor2
  - API endpoints
  - formatura
  - modulo livre
watches:
  - docs/marca-e-posicionamento.md
  - docs/capacity/alinhamento-marca-operacao-2026-10-08.md
  - .claude/skills/motor2-backend-test/**
  - .claude/skills/motor2-integration-test/**
  - .claude/skills/motor2-code-review/**
  - mcp_agent/**
  - supabase/**
related:
  - SUB-frontend
  - SUB-ai
  - SUB-data
  - SUB-security
  - SUB-ops
owns:
  - backend/**
status: source-reviewed
last_verified: 2026-10-08
---

# Backend API, Motor 2 e portas de entrada do Darcy

Esta página descreve o código do checkout revisado em 07/10/2026. `source-reviewed` significa leitura de implementação e inventário dos testes; não significa execução dos testes, confirmação das migrations no banco, observação do serviço publicado ou aceitação do comportamento da IA. Nenhum endpoint externo, banco de produção ou provedor pago foi chamado nesta revisão. O estado de deployment e a configuração efetiva de ambiente são **UNKNOWN**.

## Papel e inicialização

O backend vivo é `backend/`, uma API Express 4 em TypeScript. [package.json](../../../backend/package.json) declara build com `tsc`, execução de `dist/index.js`, desenvolvimento com Nodemon, Jest/ts-jest e exportação de schema com `tsx`. O [README](../../../backend/README.md) orienta Node 20; a declaração de uma dependência ou script não comprova a versão/runtime do serviço publicado.

[src/index.ts](../../../backend/src/index.ts) carrega `backend/.env` antes dos serviços, inicializa `SupabaseWrapper`, cria sete controllers e registra seus `Pair<RequestType, callback>` como `/{controller.name}/{route_name}`. Não há prefixo `/api` nesse router. Proxy/Ingress pode aplicar outro caminho externamente. A porta vem de `PORT`, com fallback `3000`.

[SupabaseWrapper.init](../../../backend/src/supabase_wrapper.ts) exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Esse cliente privilegiado pode contornar RLS: a autorização explícita no handler é parte essencial da proteção das operações pessoais. O código não usa `SUPABASE_KEY` para inicializar o cliente, embora o bootstrap ainda registre a presença desse nome antigo.

## Inventário de rotas registradas

Todos os caminhos abaixo são locais ao Express. A coluna de acesso descreve verificações existentes no handler, além dos limitadores globais; não constitui prova da política de Ingress ou RLS aplicada no ambiente.

| Método e caminho | Comportamento atual | Acesso no handler / fonte |
|---|---|---|
| `GET /` | Status, timestamp e versão literal `1.0.0` | Público; `src/index.ts` |
| `GET /health` | Liveness e `GIT_SHA` ou `null` | Público; não consulta o banco |
| `GET /ready` | Readiness com consulta curta ao Supabase | Público; `createReadyHandler` |
| `GET /cursos/all-cursos` | Catálogo de cursos enriquecido com créditos obrigatórios de `creditos_por_curso` | Público; [CursosController](../../../backend/src/controllers/cursos_controller.ts) |
| `GET /materias/materias-name-by-code` | Consulta matérias por `codes` do **body**, mesmo sendo GET | Público; [MateriasController](../../../backend/src/controllers/materias_controller.ts) |
| `POST /materias/materias-from-codigos` | Consulta por códigos e projeta `nivel` relativo a `id_curso` | Público; `MateriasController` |
| `POST /users/register-user-with-google` | Cria perfil ligado ao token | Supabase Auth; [criarUsuario](../../../backend/src/controllers/users_controller.ts) |
| `POST /users/registrar-user-with-email` | Mesmo fluxo de criação; conserva o nome `registrar` | Supabase Auth; `criarUsuario` |
| `GET /users/get-user-by-email` | Retorna perfil com `dados_users`, apenas para email igual ao token | Supabase Auth + comparação de email |
| `GET /fluxograma/fluxograma` | Busca pública de curso por nome e monta currículo, pré-requisitos e equivalências | Público; [FluxogramaController](../../../backend/src/controllers/fluxograma_controller.ts) |
| `POST /fluxograma/casar_disciplinas` | Recebe JSON já extraído, casa disciplinas/histórico e equivalências | Sem login no handler; `FluxogramaController` |
| `POST /fluxograma/integralizacao` | Compara CH fornecida com exigências da matriz | Público; `calcularIntegralizacao` |
| `POST /fluxograma/upload-dados-fluxograma` | Insere `fluxograma_atual`, `id_user` e `semestre_atual` em `dados_users` | Token + `User-ID`; `Utils.checkAuthorization` |
| `DELETE /fluxograma/delete-fluxograma` | Remove a linha de `dados_users` do aluno | Token + `User-ID`; não apenas o campo de fluxograma |
| `POST /planejamento/gerar-plano` | Monta dados, executa Motor 2 v2 e resolve nomes de MATR | Token + `User-ID`; [PlanejamentoController](../../../backend/src/controllers/PlanejamentoController.ts) |
| `POST /planejamento/chat` | Chat com tools e contexto de plano | Login IA + token/`User-ID`; cota exceto comando direto |
| `POST /planejamento/modulo-livre-sugestoes` | Lista estruturada por tema, fora da matriz, com oferta ativa e filtragem de histórico | Token + `User-ID`; sem reserva de cota IA |
| `GET /planejamento/preferencias-grade-listar` | Lista código, turnos e docente em `preferencias_grade` para o aluno | Token + `User-ID`; sem IA |
| `POST /planejamento/preferencias-grade-salvar` | Upsert de preferência por aluno/código | Token + `User-ID`; sem IA |
| `POST /planejamento/preferencias-grade-remover` | Remove preferência pelo aluno/código | Token + `User-ID`; sem IA |
| `POST /assistente/analyze` | Ranking via RAGFlow | Login IA + reserva de cota; [AssistenteController](../../../backend/src/controllers/assistente_controller.ts) |
| `POST /assistente/chat` | Chat com Tool Registry compartilhado e contexto sob demanda | Login IA + cota exceto comando direto |
| `GET /assistente/cota` | Estado da cota sem consumir pergunta | Login IA |
| `GET /assistente/health` | `healthy`, `degraded` ou `down`, com ping real do Sabiá | Público; não expõe quais provedores estão configurados |
| `POST /assistente/analyze-sabia` | Ranking/disciplinas via serviço Python | Login IA + reserva de cota |
| `POST /assistente/analyze-sabia-stream` | Mesmo domínio por SSE | Login IA + cota antes de enviar headers SSE |
| `GET /assistente/turmas-by-codigo` | Até 50 turmas do código, ordenadas por período decrescente; sem filtro por período ativo | Público; `AssistenteController` |
| `GET /assistente/prerequisitos-by-codigo` | Pré-requisitos da matéria | Público; `AssistenteController` |
| `POST /chat/send` | Orquestrador SDK com histórico persistido no Supabase | Login IA + cota; [ChatController](../../../backend/src/controllers/chat_controller.ts) |

Não há controller registrado para tickets, exportação de schema via HTTP, upload multipart de PDF ou dashboard administrativo. A exportação de schema é um script. O upload de fluxograma recebe JSON e faz `insert`, não parseia PDF nem faz `upsert`. Tickets/recursos de admin que usem Supabase diretamente devem ser documentados nas áreas que os implementam.

## Autorização e limites

[Utils.getAuthenticatedUser](../../../backend/src/utils.ts) valida o token com `supabase.auth.getUser`. `Utils.checkAuthorization` adicionalmente exige `User-ID`, busca `users.id_user` e compara o email do perfil com o do token. O bypass `X-Dev-Impersonate` depende de `NODE_ENV !== production` **e** `ALLOW_DEV_IMPERSONATE=true`, e valida o par email/ID. Não é habilitado apenas pela ausência de `NODE_ENV`.

`criarUsuario` deriva email e `auth_id` do token; procura por `auth_id` e, para legado, email, devolvendo conflito para duplicata e SQLSTATE `23505`. `get-user-by-email` recusa email diferente com 403. As rotas de IA usam [exigirLoginIA](../../../backend/src/utils/ia_acesso.ts), cuja falha é 401 `LOGIN_NECESSARIO`.

O bootstrap aplica Helmet, [buildCorsOptions](../../../backend/src/config/cors.ts), [applyRateLimits](../../../backend/src/config/rate_limit.ts) e [applyBodyParsers](../../../backend/src/config/body_limit.ts) antes das rotas. CORS inclui o domínio do app `https://no-fluxo.crianex.com`, domínios de vitrine/legado, localhost/127.0.0.1 e acréscimos de `ALLOWED_ORIGINS`; a variável acrescenta origens. Requests sem `Origin` são permitidos, e CORS não substitui autorização.

`TRUST_PROXY` resolve para um número de proxies, padrão 1. O limite global padrão é 120 requisições por IP/minuto; `/` e `/health` são as únicas exceções, portanto `/ready` também passa pelo limiter global. Seis rotas pagas de pergunta têm limite adicional padrão 20/IP/minuto: os três analyze, os dois chats legados e `/chat/send`. Ambos os limites são configuráveis por env.

O corpo global aceita até 1 MB. Overrides: 5 MB para casar disciplinas e upload de fluxograma; 2 MB para gerar plano e chat do planejamento. Corpo grande devolve 413; JSON inválido, 400. Os analyze limitam `materia` a 300 caracteres (`MAX_MATERIA_CHARS`).

## Sugestões de módulo livre e preferências de grade

As quatro rotas adicionais de `PlanejamentoController` usam `Utils.checkAuthorization` e exigem `User-ID`, vinculando operações ao aluno autenticado. `modulo-livre-sugestoes` exige `tema` string com pelo menos dois caracteres após trim; não tem teto específico de tamanho além do body parser global. `identificarAluno` resolve email de `users` e matriz curricular da entrada mais recente em `historicos_usuarios`, sem aceitar essa matriz do body. Sem matriz, responde 404.

O handler chama `sugerirModuloLivre([tema], true, email, curriculoCompleto)` em [modulo_livre_actuator.ts](../../../backend/src/services/chat/actuators/modulo_livre_actuator.ts). O atuador busca semanticamente, exclui códigos da matriz (obrigatórios e optativos), filtra oferta ativa e histórico quando há email, e devolve matérias/aviso. Falha sinalizada por `r.erro` vira HTTP 200 com lista vazia e `aviso`; exceção vira 500. `SabiaService.buscarMaterias` chama `/buscar-materias` no Python, podendo produzir embeddings Gemini: deduplica termos, trunca cada termo a 80 caracteres, limita o conjunto a quatro e aplica timeout de 15s. Aqui o controller envia apenas um termo, portanto há no máximo um termo semanticamente pesquisado por chamada. Limites de termo/timeout não eliminam gasto com embeddings.

`modulo-livre-sugestoes` não chama `reservarPerguntaIA`, não verifica `tetoGlobalAtingido` e não está em `ROTAS_IA_PAGA`; passa pelo limiter global por IP, sem o limiter adicional de perguntas pagas. Também não abre `executarComContextoIA` no handler, portanto a busca direta não propaga explicitamente `user_id`/`pergunta_id` como os chats fazem. Não presumir cota diária, teto global nem rastreabilidade por aluno para essa chamada de embeddings.

`preferencias-grade-listar` consulta `preferencias_grade` com `id_user`. Salvar exige `codigo` string não vazio, normaliza-o para uppercase, normaliza turnos apenas M/T/N sem duplicatas (`normalizarTurnos`), trata docente vazio como `null` e faz upsert com conflito `id_user,codigo_materia` e `updated_at`. Remover exige o mesmo código e faz delete pelos dois campos. Salvar/remover devolvem `{ ok: true }`; nenhum desses três handlers chama IA ou consome cota. A preferência salva é dado de entrada para consumidores da grade, não comprovação de que o motor conseguiu satisfazê-la.

## Motor 2: montagem, algoritmo e resultado

O endpoint `gerar-plano` chama `parseBody`, `montarDadosPlano`, [gerarPlanoCompletov2](../../../backend/src/services/plano_formatura.service.ts) e `resolverNomesSemestreAtual`. O contrato tipado fica em [types/planejamento.ts](../../../backend/src/types/planejamento.ts), incluindo preferências, restrições, CH por natureza, disciplinas concretas e slots genéricos.

`parseBody` aceita algumas aliases snake_case para currículo, códigos concluídos, período e preferências. Valida currículo, array de strings, período >= 1 e preferências com `limiteCreditos`, `objetivo` (`velocidade`/`equilibrado`) e `trabalha`. Códigos de restrições são normalizados. **No caminho v2 atual**, a função exige `completedCodes` e aceita `materiasFaltantes`, mas `montarDadosPlano` não usa esses campos para substituir o banco/histórico. O comentário de entrada que anuncia pular o lookup com `materiasFaltantes` descreve um contrato antigo, não o endpoint atual.

`montarDadosPlano` lê `dados_users` por ID autenticado, resolve `matrizes` por `curriculo_completo` exato ou primeiro resultado ordenado por prefixo, lê matérias da matriz, pré-requisitos, co-requisitos e equivalências. Equivalências são filtradas por curso (geral ou mesmo curso), sem seleção de currículo/vigência nessa consulta. Preferências/restrições salvas complementam o body. A obrigatoriedade nesse mapeamento vem de `tipo_natureza === 0`; CH ausente usa 60h.

Oferta é consultada em `turmas` para um único período. `resolverPeriodoAtivo` chama a RPC `periodo_letivo_atual` e usa `calcularSemestreAtualStr` como fallback, pela fórmula janeiro–junho `.1`, julho–dezembro `.2`. É uma aproximação por data do sistema, não prova de calendário acadêmico oficial. `construirSubstitutosPorCodigo` e `expandirOfertaComEquivalencias` consideram oferta de códigos substitutos. Optativas pedidas via chat que estejam fora da matriz são injetadas com `injetarOptativasAdicionadas`.

Matérias sem dificuldade passam por [DificuldadeAgenteService.avaliarESalvarDificuldades](../../../backend/src/services/dificuldade_agente.service.ts): o serviço combina avaliações/histórico, pode consultar LLM e grava estimativa, motivo, data e fonte em `materias`. Sem chave Maritaca, pula a avaliação. Erro nessa etapa é capturado e o plano continua. Assim, **gerar plano pode provocar gasto de IA e escrita em catálogo**, além das leituras. Essa classificação não consome pergunta diária e a rota não está em `ROTAS_IA_PAGA`; não há chamada a `reservarPerguntaIA` no handler `gerar-plano`.

O serviço do Motor 2 calcula o plano sem IO de rede/banco, embora escreva diagnósticos no console e use a data do sistema. `parseFluxograma` interpreta `dados_fluxograma`: APR/CUMP contam como concluídas e MATR compõe o semestre em curso. V2 trata MATR como cumprimento esperado para planejar semestres futuros e abate sua CH obrigatória/optativa. Isso é projeção de aprovação, não confirmação de integralização futura.

`expandirCumpridasComEquivalencias` faz uma expansão de passe único: código cumprido por equivalência não realimenta outra equivalência. As expressões E/OU são tratadas por [utils/expressao_logica.ts](../../../backend/src/utils/expressao_logica.ts). `buildReverseDependencyGraph`, `computeTransitiveDependents` e `calcularScore` calculam dependências e prioridade: +3 obrigatória, +2 por dependente direto, +1 transitivo, +2 atrasada; optativas podem ganhar +5 com oferta ou perder até 10 sem oferta. Esse score é heurística, não garantia de oferta/finalização.

`distribuirPorSemestres` aloca por prioridade, dependências, horas, dificuldade e restrições; tenta agrupar co-requisitos presentes no pool. Quando o grupo não cabe, o fallback explícito `SOLO` pode alocar a candidata sozinha: não há garantia universal de co-requisitos satisfeitos em toda saída. O greedy limita a 40 iterações; usa até 480h por semestre e orçamento heurístico de dificuldade 35, que priorização/primeira escolha podem ultrapassar. Há fallback para escolher a menor candidata mesmo quando nenhuma coube. `objetivo` e `trabalha` constam do contrato, mas não participam da seleção no caminho v2 revisado. `distribuirObrigatorias` separa estágio/TCC por nome e aplica posicionamento próprio. `distribuirSlots` reserva CH optativa/complementar sem inventar disciplinas concretas; a CH real é preservada em `_horasInternas` para evitar arredondamento horas→créditos→horas.

O plano começa no próximo semestre se houver MATR; sem MATR começa no semestre calculado atual. `adicionarEm` move optativa adicionada apenas para índice posterior ao escolhido inicialmente. Esse pós-processamento não reexecuta a validação de capacidade no destino: não documentar uma garantia universal de respeito a todos os limites/pré-requisitos após toda alteração.

`PlanoFormaturav2` retorna semestre em curso opcional, semestres futuros, `formaturaEstimada`, disciplinas/slots, CH restante após alocação e fotografia da integralização. Atenção: `distribuirObrigatorias` constrói `naoAlocadas` a partir do conjunto de estágio/TCC; não compara todo o pool regular contra a saída do greedy. Portanto `materiasNaoAlocadas` vazio, isoladamente, não comprova que todas as obrigatórias foram alocadas. Estas limitações são observações de código a reproduzir em testes, não bugs corrigidos por esta documentação.

## Três caminhos de chat/IA coexistem

1. `assistente/analyze` usa [RagflowService](../../../backend/src/services/ragflow.service.ts), cria sessão, pede análise e formata ranking. `assistente/analyze-sabia`/stream usam [SabiaService](../../../backend/src/services/sabia.service.ts) como ponte HTTP ao Python, por `SABIA_API_URL` (fallback localhost:8000). Configuração local, `isAvailable`, não prova saúde do upstream; o ping tem prazo de 2s e cache 30s. A ponte define timeout normal 360s, busca 15s e ociosidade de stream 120s. O SSE aborta upstream ao desconectar, e o tratamento de cota distingue saída antes/depois do primeiro evento.
2. `assistente/chat` e `planejamento/chat` usam [PlanejadorAgenteService](../../../backend/src/services/planejador_agente.service.ts), com até 5 iterações de tool calling e 20 mensagens de histórico enviadas pelo cliente. [createDefaultRegistry](../../../backend/src/services/agente/tools/index.ts) registra atualmente 13 tools de informações/turmas/busca/local/opiniões, histórico/status, consulta/simulação/ajuste de carga/movimentação e adição de optativa. `ToolRegistry.toolsFor` e `execute` restringem tools dependentes de plano pelo contexto. `/turmas COD` consulta o banco sem LLM e sem consumo de cota/log IA, embora o handler confira disponibilidade do serviço antes de executar.
3. `chat/send` usa `@openai/agents`, [createOrquestradorAgent](../../../backend/src/services/chat/orquestrador_agent.ts) e [SupabaseSession](../../../backend/src/services/chat/supabase_session.ts). O ID da sessão vem de `auth.users.id`, nunca do body. Uma sessão contínua por aluno persiste em `chat_sessions`/`chat_items`; o cliente manda só a nova mensagem. `getItems` sem limite lê todo o histórico; não presumir a janela de 20 mensagens do outro serviço aqui. `createDarcyAgent` permanece como referência da fase 1 e não é a entrada de `chat/send`.

O orquestrador usa agentes como tools: integralização e optativas sempre; grade por horário livre e módulo livre apenas quando contexto montador + currículo + máscara/período estão disponíveis. [integralizacao_actuator](../../../backend/src/services/chat/actuators/integralizacao_actuator.ts) tem revisor numérico; [grade_actuator](../../../backend/src/services/chat/actuators/grade_actuator.ts) verifica códigos da tag contra candidatos filtrados. Os wrappers reexecutam uma vez em caso de reprovação e depois devolvem resposta de escalonamento. [runSubAgente](../../../backend/src/services/chat/sub_run.ts) soma uso dos sub-runs ao pai mesmo quando o guardrail lança. O revisor da grade atua na saída daquele atuador; o orquestrador não possui esse mesmo outputGuardrail global. As instruções de escopo e revisão não provam eficácia do modelo em todas as perguntas.

Modelos Node ficam em [config/maritaca.ts](../../../backend/src/config/maritaca.ts): `sabia-4` para agente e `sabiazinho-4` para classificação. A KB registra os valores do código, não verifica o catálogo atual do provedor.

## Cota, custo, erros e logs

[reservarPerguntaIA](../../../backend/src/utils/ia_acesso.ts) consulta teto global, reserva cota via RPC e acompanha desconexão. [darcy_cota.service.ts](../../../backend/src/services/darcy_cota.service.ts) usa `darcy_reservar_pergunta`, `darcy_estornar_pergunta`, `darcy_estado_cota` e `darcy_custo_ia_hoje`; defaults locais: 30 perguntas/dia e R$15/dia, configuráveis. Dia/renovação vêm das RPCs e seguem o contrato de Brasília descrito no serviço. Custo tem cache de 60s. Falha ao ler custo não bloqueia; falha ao reservar cota bloqueia com 503 `COTA_INDISPONIVEL`. Logo o teto de custo não é um bloqueio atômico garantido para toda chamada paga.

Reservas negadas devolvem 429 `COTA_DIARIA`; teto atingido, 503 `TETO_GLOBAL`. Falhas de IA tentam estornar a pergunta; sucesso após saída do cliente continua consumindo. O estorno no banco é best effort e não lança; o estado de cota devolvido pode ter sido ajustado em memória mesmo se a RPC de estorno falhar. [maritaca_errors.ts](../../../backend/src/config/maritaca_errors.ts) reconhece falta de saldo e padroniza resposta/evento.

[logAiUsage](../../../backend/src/utils/ai_usage_logger.ts) grava uma linha por chamada/modelo em `ai_usage_log`, com tokens, endpoint, duração, sucesso, user/pergunta e trecho da solicitação limitado a 120 caracteres. `AsyncLocalStorage` propaga identidade e pergunta. A escrita é assíncrona, best effort, com fallback sem `erro_codigo` para schema antigo; não é prova independente de cobrança. RAGFlow usa modelo `ragflow` quando não informa modelo e pode informar zero tokens. Custo monetário depende dos dados/preços no banco, não de tarifa hardcoded nesse logger.

[logger.ts](../../../backend/src/logger.ts) usa JSON/stdout e nível warn fora de development; arquivos locais rotacionados e nível debug em development. Há também `console.log` direto no Motor 2/controller, fora desse filtro. Alguns controllers devolvem mensagens do erro do banco; o módulo [erro_publico.ts](../../../backend/src/utils/erro_publico.ts) e request IDs são usados nas falhas do assistente. Não generalizar sua sanitização para toda a API.

## Saúde, scripts e evidência de testes

[checkReadiness/supabaseProbe](../../../backend/src/utils/readiness.ts) consulta HEAD em `cursos`, com prazo 2s e abort. [createShutdown](../../../backend/src/utils/shutdown.ts) marca readiness como desligando, para de aceitar conexões, fecha keep-alive ocioso e aguarda até 25s antes de saída forçada. Isso é implementação local; exige configuração de probe/tempo de terminação do cluster para servir como contrato operacional.

[scripts/dev-full.sh](../../../backend/scripts/dev-full.sh) inicia backend + `uvicorn api_producao:app` na porta Python literal 8000 e compartilha env de `backend/.env`. O texto de log da porta Node é 3325, mas quem determina a porta é `PORT`. O antigo `AI_AGENT_PORT` foi removido do template e da orientação atual; esse script fixa a porta Python 8000.

[scripts/export_schema.ts](../../../backend/scripts/export_schema.ts) tenta RPC `export_schema`, cai para descoberta/consultas diretas e grava os dumps em `backend/docs/`. A geração de `supabase/migrations/latest_init_from_export.sql` está atualmente sob `if (true)`, portanto é feita mesmo sem `--write-supabase-migration`. O comentário que anuncia export no startup está desatualizado: não há chamada/import do exportador no `src/index.ts` revisado. Dumps são snapshots; não confirmam que o banco de produção coincide com eles. Scripts de importar avaliações/resetar dificuldade podem escrever no banco e não foram executados.

Os testes presentes em [tests-ts/](../../../backend/tests-ts/) cobrem controllers, expressões, slots/horários, Motor 2/restrições/co-requisitos/equivalências/oferta, cota, erros de saldo, custos, CORS/body/rate limits, readiness/shutdown/loggers e as fases 1–3 do orquestrador. Exemplos para investigação: `motor2-v2.test.ts`, `planejamento-corequisitos.test.ts`, `planejamento-restricoes.test.ts`, `equivalencias-cumpridas.test.ts`, `oferta-por-equivalencia.test.ts`, `double-rounding-fix.test.ts`, `distribuir-slots-fix.test.ts`, `session-persistence.test.ts`, `orquestrador-fase2.test.ts`, `revisor-fase3.test.ts`, `grade-actuator.test.ts`, `darcy-login-cota.test.ts` e `ai-sem-creditos-evento.test.ts`. A pasta `tests-ts/db/` contém testes PGlite de catálogo, RPC casar disciplinas, rastreabilidade, saldo e cota.

Comandos definidos: `npm test`, `npm run test:coverage`, `npm run type-check`, `npm run lint`, e scripts focados de orquestrador. **Não rerodados nesta revisão.** Testes existentes e relatórios de escopo ao lado do agente são evidência de intenção/cobertura disponível, não resultados atuais nem aceitação do serviço publicado.

## Specs e divergências documentais

[docs/motor2.md](../../motor2.md), [docs/chat-agente-planejador-spec.md](../../chat-agente-planejador-spec.md), [docs/chatbot-orquestrador.md](../../chatbot-orquestrador.md) e [docs/unb-domain.md](../../unb-domain.md) agora roteiam contratos atuais e descrevem limites do modelo de domínio. A API atual deve ser conferida nos controllers e serviços acima. Pontos que exigem conservar essa distinção:

- O fluxo frontend de PDF/RPC descrito no README não removeu o endpoint Node `casar_disciplinas`: ele continua registrado e recebe JSON extraído, sem parse de PDF.
- O service referencia `docs/chat-agente-planejador-design.md`, mas esse arquivo não existe no checkout revisado. Comentários antigos anunciam `materiasFaltantes` como bypass e quatro/sete tools; o caminho v2 usa dados persistidos e o registry atual registra 13 tools.
- Existem dois protocolos de histórico: mensagens do cliente truncadas pelo serviço legado e sessão persistida inteira no SDK. Não tratá-los como uma única implementação já migrada.
- Cota de pergunta e limiter de rotas pagas não abrangem a classificação lazy de dificuldade em gerar plano; auditoria de gasto precisa incluir esse serviço.
- A busca direta `modulo-livre-sugestoes` também pode gastar embeddings fora da reserva de pergunta, teto global e limiter adicional IA; as preferências de grade têm três rotas próprias de persistência sem IA.
- Exportador não roda no startup e baseline não é opcional no código atual, apesar dos comentários.
- Ausência de `materiasNaoAlocadas` não é prova completa de cobertura do pool regular; mudanças de semestre no pós-processamento e posicionamento TCC exigem validação própria.

Essas divergências foram documentadas, não corrigidas no runtime. Qualquer conclusão de implantação, volume real, custo efetivo, qualidade de resposta ou cobertura integral de planejamento permanece dependente de verificação adicional.


## Fluxos restaurados e contratos de observação — 08/10/2026

Skills de teste/revisão do Motor 2 usam o handler autenticado `gerar-plano` e o
consumidor Svelte, incluindo payload snake_case e `User-ID`. Comentários do
controller e guias históricos não substituem `parseBody`/implementação. Tipos,
Jest e integração HTTP são provas diferentes; não foram executados pela restauração.

No monitoramento proposto, cadastro/coorte/ativação e instituição vêm de fonte
validada; telemetry de cliente não prova persistência ou vínculo. Receita/cobrança
por uso exige contrato/ledger próprio. Nada disso muda o handler, cotas ou banco
atual. [Conciliação operacional](../../capacity/alinhamento-marca-operacao-2026-10-08.md).
