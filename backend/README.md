# NoFluxoUNB — Backend

API Express 4 em TypeScript, com Supabase e integração HTTP com
[`mcp_agent/`](../mcp_agent/README.md). A imagem declarada em
[`k8s.backend.Dockerfile`](../k8s.backend.Dockerfile) usa Node 20.
Este README descreve o código; domínio, revisão publicada, provedores disponíveis
e migrations aplicadas exigem verificação no ambiente.

A referência canônica é o [dossier Backend e Motor 2](../docs/kb/subsystems/backend-api-and-motor2.md),
com inventário completo de rotas, contratos, fontes e limitações. Consulte também
os dossiers de [IA](../docs/kb/subsystems/darcy-ai-orchestration.md),
[segurança](../docs/kb/subsystems/auth-security-and-privacy.md) e
[dados/schema](../docs/kb/subsystems/data-ingestion-and-schema.md).
Na raiz, use `npm run kb:query -- "<pergunta>"` antes de explorar outra área.

## Desenvolvimento local

Execute os comandos nesta pasta:

```bash
npm ci
cp .env.example .env   # apenas na configuração inicial; preserve um .env existente
# Preencha a configuração local antes de iniciar.
npm run dev
```

[`src/index.ts`](src/index.ts) carrega `backend/.env` antes dos serviços.
[`SupabaseWrapper.init`](src/supabase_wrapper.ts) exige `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY`. Guarde credenciais em `.env` fora do Git.
`PORT` determina a porta Node: o exemplo usa 3325; o fallback do código é 3000.

`npm run dev:full` inicia Node e Python por [`scripts/dev-full.sh`](scripts/dev-full.sh),
compartilhando o ambiente local. O script usa `uvicorn api_producao:app` na porta
**8000**; requer dependências Python instaladas conforme o README do `mcp_agent`.
`SabiaService` usa `SABIA_API_URL`, com fallback `http://localhost:8000`.

Para compilar e executar a saída TypeScript:

```bash
npm run build
npm start
```

## Rotas e fontes

O router registra caminhos `/{controller.name}/{route_name}`, sem prefixo `/api`
no Express. Um proxy pode mudar o caminho externo.

| Área | Fonte / exemplos |
|---|---|
| Catálogo | [`cursos_controller.ts`](src/controllers/cursos_controller.ts), [`materias_controller.ts`](src/controllers/materias_controller.ts): cursos e consulta de matérias |
| Perfil | [`users_controller.ts`](src/controllers/users_controller.ts): criação ligada ao token e consulta do próprio email |
| Fluxograma | [`fluxograma_controller.ts`](src/controllers/fluxograma_controller.ts): consulta pública, casamento de JSON extraído, integralização, gravação e remoção de dados |
| Planejamento | [`PlanejamentoController.ts`](src/controllers/PlanejamentoController.ts): `gerar-plano`, `chat`, `modulo-livre-sugestoes` e três rotas `preferencias-grade-*` |
| Análise/assistente | [`assistente_controller.ts`](src/controllers/assistente_controller.ts): analyze RAGFlow, analyze Sabiá normal/SSE, chat, cota, health e consulta de turmas/pré-requisitos |
| Chat persistido | [`chat_controller.ts`](src/controllers/chat_controller.ts): `POST /chat/send` |
| Probes | `GET /health`: processo e commit; `GET /ready`: Supabase com prazo de 2s e estado de desligamento |

O fluxo frontend de histórico faz parsing local de PDF e usa a RPC Supabase
`casar_disciplinas`. Também permanece registrado `POST /fluxograma/casar_disciplinas`
no Node: recebe **JSON já extraído**, sem parsing de PDF. Upload de fluxograma
recebe JSON e faz insert em `dados_users`; delete remove a linha do aluno.

## Autorização, planejamento e IA

O cliente Supabase do backend usa service role. Rotas pessoais precisam validar
identidade no handler: [`Utils`](src/utils.ts) verifica o token e, quando exigido,
o par token/`User-ID`. As rotas de perfil derivam email/`auth_id` do token.
Não presuma autenticação em todo endpoint: catálogo e algumas consultas são públicas.
Helmet, CORS, limites de corpo e rate limits ficam em `src/config/` e no bootstrap.

`POST /planejamento/gerar-plano` monta dados persistidos (`dados_users`, matriz,
matérias, requisitos, equivalências e oferta) e chama
[`gerarPlanoCompletov2`](src/services/plano_formatura.service.ts).
O histórico efetivo vem de `fluxograma_atual`: APR/CUMP e a projeção de MATR,
com slots genéricos de CH optativa/complementar. Embora o parser de entrada aceite
`completedCodes` e `materiasFaltantes`, esses campos não substituem o lookup/histórico
no caminho v2 atual. O resultado é uma estimativa heurística; há fallbacks de
alocação, incluindo escolha solo quando o grupo de co-requisitos não cabe.
Não há garantia universal de satisfação de todos os limites/co-requisitos.

Os caminhos de IA coexistem:

- `assistente/analyze` usa RAGFlow; `analyze-sabia` e `analyze-sabia-stream` usam
  [`SabiaService`](src/services/sabia.service.ts) como ponte para o Python.
- `assistente/chat` e `planejamento/chat` usam
  [`PlanejadorAgenteService`](src/services/planejador_agente.service.ts) e Tool Registry,
  com até 5 iterações e 20 mensagens do histórico enviado pelo cliente.
- `chat/send` usa o SDK `@openai/agents`, orquestrador/atuadores e
  [`SupabaseSession`](src/services/chat/supabase_session.ts); o histórico é persistido
  em `chat_sessions`/`chat_items`, com sessão derivada do usuário do token.

Perguntas pagas dessas rotas exigem login, verificam teto de custo e reservam cota
via [`ia_acesso.ts`](src/utils/ia_acesso.ts); falha tenta estornar. `/turmas COD` nos
chats legados consulta o banco sem LLM/cota. A cota de perguntas **não cobre todo
gasto de IA**: gerar plano pode avaliar dificuldade, chamar LLM e escrever no
catálogo; `modulo-livre-sugestoes` pode gerar embeddings sem reserva diária, sem
verificação do teto global e sem o limiter adicional das rotas de pergunta.
Limites, falhas de contabilização e revisão dos atuadores estão detalhados na KB.

## Verificação local e schema

Comandos declarados em [`package.json`](package.json):

```bash
npm test                 # Jest/ts-jest: tests-ts/ e src/**/__tests__/
npm run test:coverage
npm run test:orquestrador # sessões, fase 2 e revisão fase 3
npm run type-check       # tsc --noEmit
npm run lint
```

A existência dos testes não confirma resultado atual ou comportamento publicado.
Specs em `../docs/` são referências de intenção; use a KB para a implementação.

`npm run export-schema` executa [`scripts/export_schema.ts`](scripts/export_schema.ts):
consulta o Supabase configurado e sobrescreve os snapshots em `backend/docs/`
e o baseline `supabase/migrations/latest_init_from_export.sql`.
Não roda no startup e não aplica SQL no banco. A geração do baseline atualmente
ocorre independentemente de flag. Execute apenas para uma atualização intencional
dos artefatos; export existente não comprova schema/migrations de produção.
