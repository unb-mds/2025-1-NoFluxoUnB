---
id: SUB-ai
title: Darcy AI — serviço Python, busca semântica e integração de agentes
aliases:
  - Darcy Sabiá Maritaca Gemini
  - orquestrador embeddings pgvector RAG
watches:
  - backend/src/services/chat/**
  - backend/src/services/sabia.service.ts
  - supabase/**
related:
  - SUB-backend
  - SUB-data
  - SUB-security
  - SUB-ops
owns:
  - mcp_agent/**
status: source-reviewed
last_verified: 2026-10-08
---

# Darcy AI — serviço Python, busca semântica e integração de agentes

Esta página descreve o código local de `mcp_agent/` e suas fronteiras com o backend. O nome da pasta é histórico: o serviço atual é HTTP/FastAPI, não um servidor MCP via stdin/stdout. A revisão não consultou provedores, banco remoto ou containers publicados. `source-reviewed` confirma leitura do código; a execução local das funções puras está registrada separadamente abaixo.

## Mapa de implementação

| Fonte | Símbolos / responsabilidade atual |
|---|---|
| [`mcp_agent/api_producao.py`](../../../mcp_agent/api_producao.py) | `app`, `verificar_api_key`, `Consulta`, `BuscaMaterias`; rotas HTTP, clientes globais, seleção de ferramenta, consultas Supabase e streaming SSE |
| [`mcp_agent/sabia_utils.py`](../../../mcp_agent/sabia_utils.py) | `normalizar_termos_busca`, `parse_resposta_sabia`, `codigos_validos_de`, `linha_uso_embeddings`, `maritaca_client_kwargs`; funções testáveis sem importar os clientes globais |
| [`mcp_agent/tool_call_utils.py`](../../../mcp_agent/tool_call_utils.py) | `extrair_tool_call_texto`, `termo_materia`; recuperação de chamadas que o modelo devolve como texto |
| [`mcp_agent/jobs/databaseScript_gemini.py`](../../../mcp_agent/jobs/databaseScript_gemini.py) | Job manual de reconstrução dos embeddings Gemini da tabela `materias_vetorizadas` |
| [`mcp_agent/jobs/databaseScript.py`](../../../mcp_agent/jobs/databaseScript.py) | Job legado com `SentenceTransformer("all-MiniLM-L6-v2")`; não é a busca usada pela API atual |
| [`backend/src/services/sabia.service.ts`](../../../backend/src/services/sabia.service.ts) | `SabiaService`: cliente HTTP, limites de espera, autenticação entre serviços, normalização, sanitização e tradução de falhas para o backend |
| [`k8s.mcp-agent.Dockerfile`](../../../k8s.mcp-agent.Dockerfile) | Imagem Python 3.11, dependências de produção, usuário sem privilégios, Uvicorn com dois workers e healthcheck |

## Dois caminhos de geração coexistem

O Python expõe uma recomendação completa em `/recomendar` e `/recomendar-stream`: Sabiázinho escolhe uma ferramenta, a ferramenta lê o banco e Sabiá produz a resposta. O backend chama essas rotas por `SabiaService.analyzarInteresse` e pelo método de streaming do mesmo serviço.

O backend também pode fazer a geração e a orquestração em TypeScript. Nesse caminho, `SabiaService.buscarMaterias` chama apenas `/buscar-materias`, que gera embeddings e consulta o RPC sem chamar um LLM Python. A busca é consumida pelo Darcy legado em [`services/agente/tools/materia_tools.ts`](../../../backend/src/services/agente/tools/materia_tools.ts) e pelos atuadores do orquestrador em [`services/chat/`](../../../backend/src/services/chat/). Não atribuir ao Python a persistência de conversa, as cotas do usuário ou o planejamento de formatura: essas responsabilidades estão no backend.

O caminho `POST /chat/send`, implementado por [`ChatController`](../../../backend/src/controllers/chat_controller.ts), usa `SupabaseSession` com identidade extraída do usuário autenticado e `createOrquestradorAgent`. O provider [`createMaritacaModel`](../../../backend/src/services/chat/model_provider.ts) usa `OpenAIChatCompletionsModel` do SDK `@openai/agents` e o modelo `MARITACA_MODELS.AGENTE` definido em [`config/maritaca.ts`](../../../backend/src/config/maritaca.ts). O modelo atual dessa configuração é `sabia-4`.

Em [`orquestrador_agent.ts`](../../../backend/src/services/chat/orquestrador_agent.ts), integralização e optativas são ferramentas do orquestrador. Grade/horário livre e módulo livre também existem no código, registrados somente quando há `apenasComOferta && curriculoCompleto && horarioLivre`. A integralização e a grade passam por wrappers de revisão; o orquestrador conserva a resposta final, usando agentes como ferramentas. As restrições acadêmicas e o protocolo textual `MONTAR_GRADE` estão nas instruções do modelo. Esse panorama representa implementação local, não comprovação de ativação nem de qualidade das respostas em produção.

## Contratos HTTP do serviço Python

Todas as rotas POST abaixo usam `Depends(verificar_api_key)`. O backend deve enviar `X-API-Key` igual à variável compartilhada `MCP_AGENT_API_KEY`.

| Rota | Corpo / retorno | Comportamento e limites |
|---|---|---|
| `GET /health` | `{status, service, version, commit}` | Sem autenticação. Retorna `healthy`, `Darcy AI`, versão `2.0` e `GIT_SHA`; não testa Gemini, Maritaca, Supabase ou validade da chave compartilhada |
| `POST /buscar-materias` | `BuscaMaterias`: `termos_busca: list[str]`, `user_id?`, `pergunta_id?`; retorna `{materias}` | Busca vetorial pura. Sem termo não vazio: HTTP 400. Falha engolida na ferramenta normalmente resulta em lista vazia, não em erro HTTP |
| `POST /recomendar` | `Consulta`: `interesse: str`, `matriz_curricular = ""`, `user_id?`, `pergunta_id?`; retorna `{success, disciplinas, resposta_completa, usage}` | Interesse vazio: HTTP 400. Optativas sem matriz: `success: false` e mensagem `Envie o historico academico`. Exceção no processamento: HTTP 500 com `detail=str(e)` |
| `POST /recomendar-stream` | Mesmo `Consulta`; resposta `text/event-stream` | Eventos JSON no campo `stage`; erro após início do stream é evento `error`, não necessariamente status HTTP de erro |

`verificar_api_key` usa `hmac.compare_digest`. Se a chave do servidor não estiver configurada, a dependência retorna 503; chave ausente/incorreta retorna 401. Os outros clientes são criados no import do módulo: configuração inválida do Supabase/Maritaca pode impedir a subida antes que qualquer rota responda. O fail-closed da chave não equivale a uma garantia de startup para toda combinação de variáveis ausentes.

O fluxo SSE em `recomendar_materias_stream` emite `thinking`, `searching`, `generating`, zero ou mais `disciplina`, `usage` e `done`/`error`. `disciplina.data` contém `{codigo, nome, nota, justificativa}`; `done.resultado` contém a resposta completa. `_fim` envia `usage` antes de todo término, inclusive resposta direta sem ferramenta, matriz ausente e exceção. A geração solicita `stream_options={"include_usage": True}` e trata o chunk de uso sem `choices`.

## Ferramentas e grounding

`ROUTING_PROMPT` pede exatamente uma ferramenta, mas o SDK recebe `tool_choice="auto"`; código trata resposta sem ferramenta como caminho válido. `resolver_tool_call` usa somente a primeira chamada estruturada, normaliza argumentos JSON e tenta `extrair_tool_call_texto` quando não há `tool_calls`. O fallback aceita `<tool_call>{...}</tool_call>` ou objeto JSON com `name`, inclusive `arguments` serializado como string. Ele não valida por si só uma allowlist de nomes.

| Ferramenta exposta ao roteamento | Consulta e formato da evidência |
|---|---|
| `buscar_materias_unb(termos_busca)` | `ferramenta_buscar_materias_unb`: normalização → embeddings Gemini → RPC `match_materias`; JSON de `{codigo, nome, similaridade}` |
| `buscar_optativas_curso(aviso)` | `ferramenta_buscar_optativas`: usa a `matriz_curricular` da consulta, remove sufixo de período como ` - 2025.1`, busca `matrizes.curriculo_completo` por `ilike`, toma primeiro resultado e lê `materias_por_curso` com `tipo_natureza=1`; retorna código/nome de `materias` |
| `explicar_materia(materia)` | `ferramenta_explicar_materia`: código `AAA9999` por igualdade ou nome por `ilike`, `limit(1)`; `{encontrada, nome_materia, ementa}` ou `{encontrada: false, termo}` |

Na lista de optativas, a ferramenta exclui os nomes exatos `ATIVIDADE DE EXTENSÃO` e `ATIVIDADE COMPLEMENTAR`. O prompt final pede exclusão de outras disciplinas genéricas/monitoria, ordenação por relevância, até 50 optativas ou até 15 recomendações por assunto. Esses limites/exclusões adicionais são instruções ao modelo, não filtros determinísticos implementados pelo parser.

`EXPLICACAO_PROMPT` manda usar somente nome e ementa e reconhecer ementa ausente; o modo explicação não produz cards. A geração de lista recebe os dados recuperados, mas a busca vetorial retira a ementa e o departamento do retorno do RPC antes de passar os resultados ao modelo. Assim, as justificativas de recomendação não são produzidas a partir da ementa completa nessa etapa. A busca é recuperação semântica de disciplinas, não um mecanismo geral de RAG de documentos, memória ou pesquisa web.

`parse_resposta_sabia` aceita códigos no início de linhas (incluindo marcadores e listas numeradas), deduplica por código, interpreta nota decimal com ponto/vírgula e limita a nota a 0–10; nota ausente assume 7. Nos caminhos com ferramenta de lista, `codigos_validos_de` restringe cards aos códigos do resultado recuperado. Essa defesa filtra cards, não reescreve nem valida toda a prosa de `resposta_completa`. Quando o modelo responde diretamente sem ferramenta, não há allowlist de códigos recuperados. Quando os dados da ferramenta não são uma lista JSON, `codigos_validos_de` retorna `None` e não restringe o parser. O backend ainda aplica `sanitizarDisciplinas` para código `AAA9999`, tipos de campos e escala da nota.

## Embeddings, pgvector e custos

`normalizar_termos_busca` aceita apenas lista, retira itens vazios/não strings, corta cada termo em 80 caracteres, deduplica preservando ordem e limita a quatro termos. `SabiaService.buscarMaterias` aplica o mesmo teto antes da chamada HTTP. O prompt pede quatro termos, mas a normalização pode produzir menos.

`ferramenta_buscar_materias_unb` usa `models/gemini-embedding-001`, `task_type="retrieval_query"` e `output_dimensionality=256`, com todos os termos em uma chamada. Para cada vetor, executa `match_materias` com `match_threshold=0.6` e `match_count=20`. Agrega por código normalizado, preservando a maior similaridade por código; ordena pela similaridade arredondada a duas casas e limita o retorno agregado a 25 disciplinas.

O RPC registrado em [`supabase/migrations/latest_init_from_export.sql`](../../../supabase/migrations/latest_init_from_export.sql), `public.match_materias`, consulta `materias_vetorizadas`, usa similaridade de cosseno `1 - (embedding <=> query_embedding)`, filtra estritamente `> match_threshold`, ordena por distância e limita a `match_count`. O export mostra `embedding` como `USER-DEFINED`, sem provar aqui a dimensão da coluna instalada. A dimensão compatível dos vetores, a cobertura do catálogo e a aplicação do RPC no banco remoto permanecem não verificadas.

`jobs/databaseScript_gemini.py` pagina toda a tabela `materias_vetorizadas` em blocos de 1.000, gera individualmente embeddings 256D com `retrieval_document` para `Disciplina: {nome}. Ementa: {ementa}`, acumula as linhas com embedding e faz upsert em lotes de 100. Executar esse job chama um provedor pago e grava no banco; ele não foi executado nesta revisão. Não há agendamento/autoupdate nessa pasta. O job legado gera vetores com outro modelo e deve ser tratado como histórico, não como opção intercambiável sem revalidar schema e corpus.

`_log_ai_usage_embeddings` faz insert best-effort em `ai_usage_log`. `linha_uso_embeddings` estima tokens por `ceil(len(" ".join(termos))/4)`, mínimo 1, pois o retorno de embeddings não fornece contagem de tokens nesse código. Registra modelo, endpoint, duração, sucesso, trecho dos termos de até 120 caracteres e UUIDs válidos de usuário/pergunta. IDs inválidos tornam-se `None`. Nos caminhos executados com contexto de IA, o backend manda esses IDs para agrupar busca e geração na mesma pergunta. A busca autenticada independente em `/planejamento/modulo-livre-sugestoes` não cria esse contexto nem reserva pergunta/verifica teto diário; suas embeddings podem ser registradas sem IDs. A [KB de segurança](auth-security-and-privacy.md) descreve esse limite de cobertura dos controles.

Nos caminhos `/recomendar(-stream)`, `_buscar_materias_logando` usa termos normalizados e registra o indicador de falha da ferramenta. Em `/buscar-materias`, a rota chama a ferramenta sem `estado` e grava `success=True` mesmo se ela tiver engolido uma falha; também passa os termos pré-normalização final ao logger. Uma linha de uso desse endpoint não comprova sucesso da busca nem contagem exata de embeddings. As chamadas Maritaca retornam `usage` por modelo; `total_tokens` ausente/zero é recalculado como prompt + completion. A persistência do uso Maritaca ocorre no backend consumidor, enquanto o Python registra diretamente o uso Gemini.

## Configuração, execução e observabilidade

| Variável | Leitura / finalidade |
|---|---|
| `MARITACA_API_KEY` | Cliente OpenAI compatível com `https://chat.maritaca.ai/api`; Python usa `sabiazinho-4` para roteamento e `sabia-4` para geração |
| `GOOGLE_API_KEY` | Configuração global do SDK Gemini |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Cliente de banco servidor; nunca pertencem ao frontend |
| `MCP_AGENT_API_KEY` | Chave compartilhada backend → FastAPI, carregada no startup |
| `ALLOWED_ORIGINS` | CORS, lista separada por vírgulas; padrão `http://localhost:5173,http://localhost:3000` |
| `GIT_SHA` | Commit retornado no health; presença depende da configuração de deploy |
| `SABIA_API_URL` | Variável do backend, padrão `http://localhost:8000`; não é lida pelo serviço Python |
| `SUPABASE_KEY` | Fallback apenas no job Gemini; chave usada pelo job legado |

`load_dotenv()` carrega configuração no módulo da API e no job Gemini. O startup imprime somente presença/ausência das variáveis, sem valores de chaves. Contudo, o código também imprime termos, matriz curricular, códigos/nome de disciplina e, no endpoint não streaming, texto completo da resposta. `ai_usage_log` inclui trecho da busca e identificadores; logs e telemetria não devem ser tratados como anônimos só porque as chaves não são impressas.

[`requirements.txt`](../../../mcp_agent/requirements.txt) inclui FastAPI `>=0.115.0`, Uvicorn `>=0.32.0`, Pydantic `>=2.11.7,<3`, `google-generativeai==0.8.3`, OpenAI `>=1.68.0`, Supabase `>=2.24.0,<2.25.0`, dotenv e requests. Não é um lockfile de todo o ambiente. Os jobs usam `tqdm`, e o legado usa `sentence_transformers`; essas dependências não constam no requirements de produção do serviço.

`start_api.sh` e equivalente Windows usam `../venv` e Uvicorn na porta 8000 com reload. `start_api_production.sh` usa quatro workers e `--no-access-log`. O Dockerfile usa dois workers, não quatro; copia os módulos Python do topo, sem incluir os jobs no runtime. O healthcheck do container consulta `/health`; sucesso comprova resposta HTTP da aplicação, não acesso aos provedores.

Em `sabia_utils.py`, o timeout Maritaca de conexão é 10 s, sem retries; roteamento não streaming usa 60 s, geração não streaming usa 240 s e geração streaming usa 90 s de leitura/inatividade. O limite de 240 s não governa `/recomendar-stream`. No backend, `SABIA_TIMEOUT_MS=360_000`, `SABIA_BUSCA_TIMEOUT_MS=15_000` e `SABIA_STREAM_IDLE_TIMEOUT_MS=120_000` delimitam a espera HTTP. A soma de 320 s calculada por `pior_caso_recomendar_s` cobre apenas roteamento/geração e conexões, não estabelece limite global para Gemini/RPC.

## Evidência de testes e limites da revisão

Executados localmente em 2026-10-07, sem chamar provedores nem importar `api_producao`:

```bash
cd mcp_agent
python3 test_sabia_utils.py       # 27/27 passaram
python3 test_tool_call_utils.py   # 7/7 passaram
```

Os testes cobrem parser de cards, notas, códigos permitidos, deduplicação, limites de termos, timeouts, relação com os tetos do backend, contexto do uso de embeddings e fallback de tool calls. Parte das verificações inspeciona AST do arquivo de API: confirma que o código contém chamadas/opções esperadas, sem exercitar a execução HTTP, autenticação, stream real ou resposta dos provedores. Quando `httpx` não está instalado, a suíte de funções puras usa um substituto mínimo para testar os valores de timeout.

O job Pytest de [`pipelineCI.yml`](../../../.github/workflows/pipelineCI.yml) executa em `DBA/tests`, não essas duas suítes de `mcp_agent`. Alterações Python disparam o filtro Python e Black/Flake8, mas isso não significa execução dos testes funcionais do serviço de IA. Nenhum teste HTTP completo do módulo, embedding real, compatibilidade instalada do RPC ou disponibilidade pública foi rodado nesta exploração.

## Documentação atual e limpeza concluída

A limpeza iniciada em 2026-10-07 substituiu os atalhos desatualizados e retirou
guias de execução obsoletos. O [manifesto de retirada](../_provenance/document-retirement.csv)
registra caminho, revisão Git, hash e destino dos documentos removidos, inclusive
`SABIA_INTEGRATION.md`. A [disposição dos planos](../_provenance/plan-disposition.csv)
conserva a relação entre propostas históricas e evidência da implementação.
Esses registros permitem recuperar o texto anterior pelo Git; não demonstram
execução de migrations, publicação ou aceitação das propostas.

| Documento / registro | Papel atual e condição verificada na fonte |
|---|---|
| [`mcp_agent/README.md`](../../../mcp_agent/README.md) | Entrada atual para HTTP/FastAPI, endpoints, autenticação, configuração, timeouts e testes puros. Usa 256D, threshold 0.6, top 20 por vetor e top 25 agregado; removeu afirmações de latência sem medição. Os detalhes técnicos estão nas seções acima |
| [Manifesto de retirada](../_provenance/document-retirement.csv), linha de `SABIA_INTEGRATION.md` | O guia de subprocesso/MCP/384D foi removido. Seu substituto é este dossier; a linha preserva revisão e hash do original, sem manter um link para arquivo inexistente |
| [`docs/chatbot-orquestrador.md`](../../chatbot-orquestrador.md) | Entrada concisa atual para `ChatController`, `SupabaseSession` e `createOrquestradorAgent`. Grade e módulo livre existem e são registrados quando `apenasComOferta && curriculoCompleto && horarioLivre`; essa condição de código não prova ativação em produção |
| [`docs/chat-agente-planejador-spec.md`](../../chat-agente-planejador-spec.md) | Entrada atual para os caminhos coexistentes: `/planejamento/chat` e `/assistente/chat` usam `PlanejadorAgenteService`; `/chat/send` usa o SDK de agentes e sessão persistida. A fonte atual define o contrato, não o título histórico de spec |

## Pendências e pontos de diagnóstico

- Os atalhos e o guia obsoleto acima foram corrigidos/retirados; mudanças futuras devem atualizar este dossier e o README a partir do código, sem reintroduzir arquitetura MCP por subprocesso ou medições de latência não executadas.
- Cobertura local desta revisão confirma 34 testes puros; cobertura CI do serviço FastAPI e integração HTTP/provedores permanecem lacunas.
- A presença de variáveis no `SabiaService.isAvailable()` e um ping `/health` com cache não confirmam credenciais válidas, vetor compatível ou êxito de recomendação. O predicado de disponibilidade do backend não exige `MCP_AGENT_API_KEY`, embora os POSTs Python exijam essa chave.
- Resultado vazio pode representar ausência de disciplinas ou erro upstream/banco engolido; investigar logs/duração e a forma de falha antes de interpretar zero resultados como verdade do catálogo.
- Ambiguidade de nome/matriz usa o primeiro registro encontrado; código não resolve homônimos ou múltiplas matrizes por ranking determinístico.
- Confirmar separadamente no ambiente alvo: imagem/commit, variáveis e rede entre serviços, schema/RPC/dimensão, atualização dos embeddings, custos/restrições do provedor e comportamento por uma requisição do usuário. Esses fatos operacionais estão desconhecidos nesta revisão.
