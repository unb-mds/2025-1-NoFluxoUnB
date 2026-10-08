# Darcy — API FastAPI de busca e recomendação

O serviço atual roda em `api_producao.py`, com Gemini para embeddings,
Supabase/pgvector para catálogo e Maritaca para roteamento e geração. O backend
TypeScript chama esta API; o orquestrador de chat também existe no backend. O nome
da pasta não indica um servidor MCP por stdin/stdout no caminho atual.

O contrato completo, seus limites e a separação entre código, testes e produção
estão na [KB de Darcy](../docs/kb/subsystems/darcy-ai-orchestration.md), na
[KB de segurança](../docs/kb/subsystems/auth-security-and-privacy.md) e na
[KB de operações](../docs/kb/subsystems/deployment-ci-and-operations.md).

## Endpoints

| Endpoint | Entrada e resposta |
| --- | --- |
| `GET /health` | Público; retorna estado do processo, versão e commit. Não testa os provedores nem a integridade do banco. |
| `POST /buscar-materias` | `termos_busca`, com `user_id`/`pergunta_id` opcionais; busca semântica sem LLM, retorna `{materias: [{codigo, nome, similaridade}]}`. |
| `POST /recomendar` | `interesse`, `matriz_curricular` opcional e IDs opcionais; retorna `success`, `disciplinas`, `resposta_completa` e `usage`. Explicações retornam prosa e lista de disciplinas vazia. |
| `POST /recomendar-stream` | Mesma entrada de recomendação; SSE com `stage` nos eventos `thinking`, `searching`, `generating`, `disciplina`, `usage`, `done` ou `error`, conforme o caminho escolhido. |

Os três POSTs exigem `X-API-Key` igual a `MCP_AGENT_API_KEY`. Sem chave
configurada no servidor, a dependência de autenticação retorna 503; chave ausente
ou diferente na requisição retorna 401. Outros erros de configuração podem
impedir a inicialização dos clientes globais antes de qualquer endpoint responder.
A chave compartilhada autentica o serviço chamador. Login e cota por aluno são
controles do backend, descritos na KB; não são validados como sessão Supabase
nesses POSTs Python.

## Busca e ferramentas

- A busca normaliza e deduplica até quatro termos, com até 80 caracteres cada.
  Gera embeddings em lote com `models/gemini-embedding-001`,
  `retrieval_query` e 256 dimensões.
- Cada vetor chama `match_materias` com threshold **0.6** e `match_count=20`.
  A busca deduplica por código, mantém a maior similaridade, ordena e limita o
  resultado combinado a **25** disciplinas. Isso depende de catálogo vetorizado
  compatível no banco; este README não confirma sua atualização em produção.
- Os endpoints de recomendação usam `sabiazinho-4` com `tool_choice="auto"`
  para escolher `buscar_materias_unb`, `buscar_optativas_curso` ou
  `explicar_materia`. Apesar do prompt pedir uma ferramenta, o código trata
  resposta direta sem tool call. Tool calls textuais também têm recuperação em
  `tool_call_utils.py`.
- Após uma ferramenta, `sabia-4` gera lista ou explicação, com `max_tokens=5000`.
  Optativas exigem `matriz_curricular`; explicações usam a ementa recuperada.
  O parser de listas deduplica e restringe cards aos códigos da ferramenta
  quando ela retorna uma lista JSON válida. Esse filtro não é uma garantia sobre
  toda prosa gerada nem sobre o caminho de resposta direta.

## Configuração e execução local

Use Python 3.11, versão da imagem de produção. `load_dotenv()` carrega configuração
local, e os clientes são criados no import de `api_producao.py`. Configure segredos
no ambiente ou `.env` fora do Git:

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Acesso privilegiado ao catálogo e gravação de uso de IA. |
| `GOOGLE_API_KEY` | Embeddings Gemini. |
| `MARITACA_API_KEY` | Cliente OpenAI-compatible em `https://chat.maritaca.ai/api`. |
| `MCP_AGENT_API_KEY` | Chave compartilhada para os POSTs; deve coincidir com a configuração do backend. |
| `ALLOWED_ORIGINS` | Lista separada por vírgulas; defaults locais são `http://localhost:5173,http://localhost:3000`. |
| `GIT_SHA` | Identificação opcional de commit em `/health`. |

```bash
cd mcp_agent
python -m pip install -r requirements.txt
python -m uvicorn api_producao:app --host 127.0.0.1 --port 8000 --reload
```

No backend, `SABIA_API_URL=http://localhost:8000` e `MCP_AGENT_API_KEY` configuram
a conexão com esta API. `npm run dev:full` no backend oferece a subida conjunta.
`start_api.sh` pressupõe `../venv` e usa `0.0.0.0` com reload;
`start_api_production.sh` usa quatro workers. A imagem
[`k8s.mcp-agent.Dockerfile`](../k8s.mcp-agent.Dockerfile) é um alvo separado:
Uvicorn na porta 8000, dois workers e cópia dos módulos Python da raiz da pasta.

`sabia_utils.py` configura Maritaca sem retries: conexão de 10 segundos,
roteamento sem stream com read timeout de 60 segundos, geração final sem stream
com 240 segundos e stream com 90 segundos de inatividade de leitura. São limites
de cliente, não medições de latência nem um prazo total de busca+geração; chamadas
Gemini/Supabase e limites adicionais do backend são camadas distintas.

## Testes locais

Os testes de helpers não importam a API nem precisam de credenciais:

```bash
cd mcp_agent
python test_tool_call_utils.py
python test_sabia_utils.py
# Alternativa com pytest já instalado:
python -m pytest test_tool_call_utils.py test_sabia_utils.py
```

Cobrem parsing de tool calls, listas, normalização de termos, estimativa/log de
embeddings e configuração de timeouts. Não comprovam rejeição HTTP da API key,
respostas dos provedores, catálogo atual ou desempenho em produção. Scripts em
`jobs/` são cargas de dados separadas do servidor; consulte a
[KB de dados](../docs/kb/subsystems/data-ingestion-and-schema.md) antes de operar
ingestão. O CI principal não executa automaticamente esta suíte de helpers.
