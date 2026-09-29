from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import hmac
import os
import json
import re
import time
from pydantic import BaseModel
from openai import OpenAI
import google.generativeai as genai
from supabase import create_client
from dotenv import load_dotenv
from tool_call_utils import extrair_tool_call_texto, termo_materia
from sabia_utils import (
    MAX_TERMOS_BUSCA,
    codigos_validos_de,
    linha_uso_embeddings,
    maritaca_client_kwargs,
    maritaca_opcoes_geracao_sem_stream,
    maritaca_opcoes_roteamento,
    normalizar_termos_busca,
    parse_resposta_sabia,
)


# 1. INICIALIZAÇÃO GLOBAL (Roda apenas quando o servidor liga)
load_dotenv()

# Checagem de env vars no startup (NUNCA imprimir valores/prefixos de segredos)
print("\n--- MCP Agent env vars at startup ---")
for key in (
    "GOOGLE_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MARITACA_API_KEY",
    "ALLOWED_ORIGINS",
    "MCP_AGENT_API_KEY",
):
    print(f"  {key} = {'SET' if os.environ.get(key) else 'NOT SET'}")
print("---\n")

# Autenticação por API key compartilhada (header X-API-Key).
# Fail-closed: sem MCP_AGENT_API_KEY definida, TODA requisição protegida é recusada.
MCP_AGENT_API_KEY = os.environ.get("MCP_AGENT_API_KEY")
if not MCP_AGENT_API_KEY:
    print(
        "[ERROR] MCP_AGENT_API_KEY não está definida no ambiente. "
        "Todas as requisições aos endpoints protegidos serão recusadas (fail-closed). "
        "Defina MCP_AGENT_API_KEY no .env para habilitar a API."
    )


async def verificar_api_key(x_api_key: str = Header(default="", alias="X-API-Key")):
    if not MCP_AGENT_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="API indisponível: autenticação não configurada no servidor.",
        )
    if not x_api_key or not hmac.compare_digest(
        x_api_key.encode("utf-8"), MCP_AGENT_API_KEY.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="API key inválida ou ausente.")


# Clientes globais mantêm conexões persistentes
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
supabase = create_client(
    os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)
# Timeout e retries limitados (ver sabia_utils): o padrão do SDK (600s x 3
# tentativas) deixava a request presa com a Maritaca pendurada. O padrão do
# cliente vale para o stream; as chamadas sem stream usam with_options com o
# teto próprio (sem stream, o read timeout limita a geração inteira).
client_maritaca = OpenAI(**maritaca_client_kwargs(os.environ.get("MARITACA_API_KEY")))

# Configuração do FastAPI
app = FastAPI(title="Darcy AI - API da UnB", version="1.0")

# CORS - Configurar origens permitidas em produção
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # Em produção, substituir por domínios reais
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# Modelo de entrada de dados esperado do frontend/usuário
# Modelo de entrada de dados esperado do frontend/usuário
class Consulta(BaseModel):
    interesse: str
    matriz_curricular: str = ""
    # Quem perguntou e qual pergunta (o backend manda do contexto da pergunta
    # do Darcy): as embeddings Gemini da busca feita dentro do /recomendar e do
    # /recomendar-stream vão para o ai_usage_log na mesma pergunta.
    user_id: str | None = None
    pergunta_id: str | None = None


# Prompt de ROTEAMENTO — usado na 1ª chamada, apenas para o modelo escolher a ferramenta.
ROUTING_PROMPT = (
    "Você é o Darcy, assistente acadêmico da UnB. Escolha a ferramenta conforme a intenção do usuário:\n"
    "- Se ele quer DESCOBRIR/RECOMENDAR disciplinas sobre um assunto ou interesse, use 'buscar_materias_unb'.\n"
    "- Se ele pede as OPTATIVAS do curso dele, use 'buscar_optativas_curso'.\n"
    "- Se ele quer ENTENDER O CONTEÚDO de UMA disciplina específica (ex: 'explique o conteúdo de X', "
    "'sobre o que é Y', 'do que se trata Z'), use 'explicar_materia'.\n"
    "SEMPRE chame exatamente uma ferramenta."
)

# Prompt do Sistema — usado na geração final da LISTA de disciplinas (recomendação).
SYSTEM_PROMPT = (
    "Você é o Darcy, assistente da UnB. Sua tarefa é listar as disciplinas encontradas no banco de dados.\n\n"
    "REGRAS CRÍTICAS:\n"
    "1. SE BUSCAR OPTATIVAS ('buscar_optativas_curso'):\n"
    "   - Liste no MÁXIMO 50 disciplinas.\n"
    "   - Use o formato: **CÓDIGO - NOME DA DISCIPLINA\n"
    "2. SE BUSCAR ASSUNTO ('buscar_materias_unb'):\n"
    "   - Liste no MÁXIMO 15 disciplinas.\n"
    "   - Use o formato detalhado: **CÓDIGO - NOME DA DISCIPLINA | Nota: X/10 | Motivo:** justificativa curta sobre o assunto.\n"
    "3. NÃO adicione introduções de respostas ou conclusões. Apenas a lista completa.\n"
    "4. EXCEÇÕES: ignore disciplinas genéricas como 'Práticas de Extensão', 'Projeto Integrador', 'Formação em...', ou que contenham 'MONITORIA' ou 'MONITORIA EM' no nome.\n"
    "5. Ordene por relevância (nota) decrescente."
)

# Prompt usado na geração final da EXPLICAÇÃO de conteúdo de uma disciplina.
EXPLICACAO_PROMPT = (
    "Você é o Darcy, assistente da UnB. Explique de forma clara e didática o conteúdo da disciplina, "
    "usando SOMENTE o nome da disciplina e a ementa fornecidos nos dados do banco. "
    "NÃO invente informação que não esteja na ementa.\n"
    "Estruture a resposta assim: comece com uma visão geral em 1-2 frases e, em seguida, liste os principais "
    "tópicos abordados em bullets. Use linguagem acessível a um estudante.\n"
    "Se a disciplina não for encontrada ('encontrada': false) ou a ementa estiver vazia, responda que não há "
    "ementa cadastrada para essa disciplina e peça para o usuário conferir o nome ou o código."
)

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "buscar_materias_unb",
            "description": "Busca matérias na base de dados da UnB expandindo o termo de pesquisa.",
            "parameters": {
                "type": "object",
                "properties": {
                    "termos_busca": {
                        "type": "array",
                        "items": {"type": "string"},
                        "maxItems": MAX_TERMOS_BUSCA,
                        "description": "Lista com EXATAMENTE 4 strings obrigatórias: [termo_principal, sinônimo1, sinônimo2, termo_relacionado]. SEMPRE preencha os 4 campos, mesmo que repita termos similares.",
                    }
                },
                "required": ["termos_busca"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "buscar_optativas_curso",
            "description": "Busca as disciplinas OPTATIVAS específicas da matriz curricular do usuário logado.",
            "parameters": {
                "type": "object",
                "properties": {
                    "aviso": {
                        "type": "string",
                        "description": "Apenas envie 'ok' para prosseguir.",
                    }
                },
                "required": ["aviso"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "explicar_materia",
            "description": "Explica o conteúdo/ementa de UMA disciplina específica quando o usuário quer entender do que ela trata (ex: 'explique o conteúdo de Fundamentos de Redes', 'sobre o que é Cálculo 1').",
            "parameters": {
                "type": "object",
                "properties": {
                    "materia": {
                        "type": "string",
                        "description": "Nome ou código da disciplina que o usuário quer entender.",
                    }
                },
                "required": ["materia"],
            },
        },
    },
]


# --- NOVA FUNÇÃO: O FLUXO DIRETO PELA MATRIZ (COM LIMPEZA REGEX) ---
def ferramenta_buscar_optativas(matriz_curricular: str) -> str:
    # (REGEX):
    # " - XXXX.X" (ex: " - 2025.1") no final da string e remove
    # Se receber "8117/-3 - 2025.1", transforma em "8117/-3"
    # Se receber "1856/3 - 2024.2", transforma em "1856/3"
    # Se já vier "8117/-3" sem o ano não altera nada.
    matriz_limpa = re.sub(r"\s*-\s*\d{4}\.\d+$", "", matriz_curricular).strip()

    print(
        f"\n[DEBUG] 🎓 Frontend enviou: '{matriz_curricular}' | Buscando no BD por: '{matriz_limpa}'"
    )

    if not matriz_limpa:
        return json.dumps(
            [
                {
                    "codigo": "ERRO",
                    "nome": "Matriz curricular não informada. Peça ao aluno para enviar o currículo ou fazer upload do histórico.",
                }
            ]
        )

    try:
        # pegar ID da matriz no banco
        mat_id_res = (
            supabase.table("matrizes")
            .select("id_matriz")
            .ilike("curriculo_completo", f"%{matriz_limpa}%")
            .execute()
        )

        if not mat_id_res.data:
            return json.dumps(
                [
                    {
                        "codigo": "ERRO",
                        "nome": f"A matriz '{matriz_limpa}' não foi encontrada na base de dados.",
                    }
                ]
            )

        id_matriz = mat_id_res.data[0]["id_matriz"]
        print(f"[DEBUG] ID da Matriz encontrada: {id_matriz}")

        # pegar matérias por curso onde tipo_natureza == 1 (Optativas)
        materias_res = (
            supabase.table("materias_por_curso")
            .select("id_materia")
            .eq("id_matriz", id_matriz)
            .eq("tipo_natureza", 1)
            .execute()
        )

        if not materias_res.data:
            print("[DEBUG] Nenhuma optativa encontrada para esta matriz.")
            return json.dumps([])

        ids_optativas = [item["id_materia"] for item in materias_res.data]

        detalhes_res = (
            supabase.table("materias")
            .select("codigo_materia, nome_materia")
            .in_("id_materia", ids_optativas)
            .execute()
        )

        # print(f"[DEBUG] ✅ Encontradas {len(materias_res.data)} optativas na matriz.")

        """
        for i in range(3):
            print(f"[DEBUG] ✅ Optativa {i+1}: {materias_res.data[i]}\n")
            materiaEncontrada= supabase.table("materias").select("nome_materia","codigo_materia").eq("id_materia", materias_res.data[i]["id_materia"])
            materiaEncontrada = materiaEncontrada.data
            time.sleep(2)
            print(f"disciplina: {materiaEncontrada}\n")
        """
        # x = json.dumps(detalhes_res.data,ensure_ascii=False)

        print(f"[DEBUG] ✅ Encontradas {len(detalhes_res.data)} optativas na matriz.")

        nomes_ignorados = ["ATIVIDADE DE EXTENSÃO", "ATIVIDADE COMPLEMENTAR"]
        detalhes_res.data = [
            m for m in detalhes_res.data if m.get("nome_materia") not in nomes_ignorados
        ]
        # print(f"[DEBUG] ✅ Optativa {i+1}: {detalhes_res.data[i]}\n")

        return json.dumps(detalhes_res.data, ensure_ascii=False)

    except Exception as e:
        print(f"❌ Erro no fluxo de optativas: {e}")
        return json.dumps([])


def ferramenta_buscar_materias_unb(
    termos_busca: list, estado: dict | None = None
) -> str:
    """Busca semântica. `estado`, se passado, recebe "ok": False quando a busca
    falha (a função engole o erro e devolve "[]" para o modelo seguir)."""
    print(f"\n[DEBUG] 🧠 Termos recebidos da Maritaca: {termos_busca}")
    try:
        # Filtrar termos vazios/duplicados e limitar a MAX_TERMOS_BUSCA antes de
        # enviar para o Gemini: cada termo custa 1 embedding + 1 RPC no Supabase.
        termos_validos = normalizar_termos_busca(termos_busca)

        if not termos_validos:
            print("⚠️ Nenhum termo válido para busca.")
            return "Nenhum termo de busca válido foi fornecido."

        print(f"[DEBUG] ✅ Termos válidos após filtro: {termos_validos}")

        # 1. GERAÇÃO EM LOTE (BATCH EMBEDDING): 1 única chamada para a API do Gemini
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=termos_validos,
            task_type="retrieval_query",
            output_dimensionality=256,
        )

        vetores = result.get("embeddings") or result.get("embedding")
        resultados_finais = {}

        # 2. BUSCA NO BANCO: 1 por 1 para cada palavra-chave gerada pela Maritaca
        for i, vetor in enumerate(vetores):
            termo_atual = termos_validos[i]
            print(f"[DEBUG] 🔍 Consultando Supabase para: '{termo_atual}'...")

            res = supabase.rpc(
                "match_materias",
                {
                    "query_embedding": vetor,
                    "match_threshold": 0.6,
                    "match_count": 20,  # Puxa as 5 melhores de cada termo
                },
            ).execute()

            print(
                f"[DEBUG] Resultados para '{termo_atual}': {len(res.data or [])} encontrados."
            )

            for item in res.data or []:
                # Pega o código, remove espaços em branco nas pontas e força MAIÚSCULA
                codigo_bruto = item.get("codigo_materia") or ""
                cod = str(codigo_bruto).strip().upper()
                sim = item.get("similaridade", 0)

                # Só adiciona se o código for válido (não vazio)
                if cod:
                    if (
                        cod not in resultados_finais
                        or sim > resultados_finais[cod]["similaridade"]
                    ):
                        resultados_finais[cod] = item

        # Formatação final
        lista_retorno = [
            {
                "codigo": item.get("codigo_materia"),
                "nome": item.get("nome_materia"),
                "similaridade": round(item.get("similaridade", 0), 2),
            }
            for item in resultados_finais.values()
        ]

        # Ordena e limita a 25 para economizar tokens na resposta da Maritaca
        lista_retorno = sorted(
            lista_retorno, key=lambda x: x["similaridade"], reverse=True
        )[:25]

        print(f"[DEBUG] ✅ Total de matérias únicas retornadas: {len(lista_retorno)}")

        return json.dumps(lista_retorno, ensure_ascii=False)

    except Exception as e:
        print(f"❌ Erro na ferramenta de busca, tente novamente mais tarde: {e}")
        if estado is not None:
            estado["ok"] = False
        return json.dumps([])


def _buscar_materias_logando(
    endpoint: str,
    termos_busca: list,
    user_id: str | None = None,
    pergunta_id: str | None = None,
) -> str:
    """Busca semântica feita dentro do /recomendar(-stream), com as embeddings
    Gemini registradas no ai_usage_log (antes só o /buscar-materias logava).

    Sem termo válido não há chamada ao Gemini e nada é logado.
    """
    termos_validos = normalizar_termos_busca(termos_busca)
    estado = {"ok": True}
    inicio = time.time()
    resultado = ferramenta_buscar_materias_unb(termos_busca, estado)
    if termos_validos:
        _log_ai_usage_embeddings(
            endpoint,
            termos_validos,
            int((time.time() - inicio) * 1000),
            estado["ok"],
            user_id,
            pergunta_id,
        )
    return resultado


def ferramenta_explicar_materia(termo: str) -> dict:
    """Busca UMA disciplina na tabela `materias` e devolve apenas nome + ementa.

    Casa por código (padrão AAA9999) ou por nome (ilike). O modelo deve explicar
    o conteúdo usando SOMENTE estes dois campos.
    """
    termo = (termo or "").strip()
    if not termo:
        return {"encontrada": False, "termo": termo}

    try:
        termo_upper = termo.upper()
        query = supabase.table("materias").select(
            "codigo_materia, nome_materia, ementa"
        )

        if re.match(r"^[A-Z]{3}\d{4}$", termo_upper):
            res = query.eq("codigo_materia", termo_upper).limit(1).execute()
        else:
            res = query.ilike("nome_materia", f"%{termo}%").limit(1).execute()

        if not res.data:
            print(f"[DEBUG] 📖 Ementa não encontrada para: '{termo}'")
            return {"encontrada": False, "termo": termo}

        materia = res.data[0]
        print(f"[DEBUG] 📖 Ementa encontrada para: {materia.get('nome_materia')}")
        return {
            "encontrada": True,
            "nome_materia": materia.get("nome_materia"),
            "ementa": materia.get("ementa") or "",
        }

    except Exception as e:
        print(f"❌ Erro ao buscar ementa: {e}")
        return {"encontrada": False, "termo": termo}


def resolver_tool_call(msg_ia):
    """Resolve (nome_ferramenta, args) da tool call escolhida pelo modelo.

    Tenta primeiro o campo estruturado `tool_calls`; se estiver vazio, cai no
    fallback que parseia uma tool call emitida como TEXTO no conteúdo (evita que
    a tag "<tool_call>..." vaze crua para o usuário). Retorna (None, None) quando
    o modelo respondeu direto, sem ferramenta.
    """
    if getattr(msg_ia, "tool_calls", None):
        tool_call = msg_ia.tool_calls[0]  # Usa apenas a primeira para economia extrema
        try:
            args = json.loads(tool_call.function.arguments)
        except (ValueError, TypeError):
            args = {}
        if not isinstance(args, dict):
            args = {}
        return tool_call.function.name, args

    fallback = extrair_tool_call_texto(getattr(msg_ia, "content", None))
    if fallback:
        print(f"[DEBUG] Tool call recuperada do texto (fallback): {fallback[0]}")
        return fallback

    return None, None


# 3. ENDPOINT DE HEALTH CHECK (para monitoramento)
@app.get("/health")
async def health_check():
    """Endpoint para verificar se a API está funcionando"""
    return {"status": "healthy", "service": "Darcy AI", "version": "2.0"}


# Busca semântica PURA (embeddings), sem LLM. Exposta como TOOL para o agente
# TypeScript (planejador_agente). Evita a 2ª chamada de modelo do /recomendar.
class BuscaMaterias(BaseModel):
    termos_busca: list[str] = []
    # Quem perguntou e qual pergunta (o backend manda quando a busca é uma
    # ferramenta do Darcy). Vão para o ai_usage_log junto das embeddings.
    user_id: str | None = None
    pergunta_id: str | None = None


def _log_ai_usage_embeddings(
    endpoint: str,
    termos: list[str],
    duration_ms: int,
    success: bool,
    user_id: str | None = None,
    pergunta_id: str | None = None,
) -> None:
    """Loga uso de embeddings Gemini em `ai_usage_log` (tracking de custo no
    dashboard admin). Best-effort: nunca lança. Ver linha_uso_embeddings.
    """
    try:
        supabase.table("ai_usage_log").insert(
            linha_uso_embeddings(
                endpoint, termos, duration_ms, success, user_id, pergunta_id
            )
        ).execute()
    except Exception as e:
        print(f"[WARN] Falha ao logar uso de embeddings ({endpoint}): {e}")


@app.post("/buscar-materias", dependencies=[Depends(verificar_api_key)])
async def buscar_materias(busca: BuscaMaterias):
    termos = [t for t in (busca.termos_busca or []) if t and t.strip()]
    if not termos:
        raise HTTPException(
            status_code=400, detail="Informe ao menos um termo em 'termos_busca'."
        )
    inicio = time.time()
    resultado_json = ferramenta_buscar_materias_unb(termos)
    duration_ms = int((time.time() - inicio) * 1000)
    _log_ai_usage_embeddings(
        "buscar-materias",
        termos,
        duration_ms,
        True,
        busca.user_id,
        busca.pergunta_id,
    )
    try:
        materias = json.loads(resultado_json)
    except Exception:
        materias = []
    return {"materias": materias}


# 4. O ENDPOINT PRINCIPAL DA API
@app.post("/recomendar", dependencies=[Depends(verificar_api_key)])
async def recomendar_materias(consulta: Consulta):
    if not consulta.interesse.strip():
        raise HTTPException(
            status_code=400, detail="O campo 'interesse' não pode estar vazio."
        )

    # Acumula uso de tokens por modelo para tracking de custo no dashboard admin.
    usage_calls = []

    def _coletar_usage(resp, modelo: str):
        u = getattr(resp, "usage", None)
        if u is None:
            return
        prompt_tokens = getattr(u, "prompt_tokens", 0) or 0
        completion_tokens = getattr(u, "completion_tokens", 0) or 0
        # A Maritaca nem sempre preenche `total_tokens` no objeto de usage
        # (fica None), então cai no fallback `or 0` e zera mesmo com
        # prompt/completion > 0. Recalcula a partir da soma quando ausente.
        total_tokens = getattr(u, "total_tokens", 0) or (
            prompt_tokens + completion_tokens
        )
        usage_calls.append(
            {
                "model": modelo,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
            }
        )

    try:
        # 1ª chamada: só para o modelo ESCOLHER a ferramenta (roteamento).
        response = client_maritaca.with_options(
            **maritaca_opcoes_roteamento()
        ).chat.completions.create(
            model="sabiazinho-4",
            messages=[
                {"role": "system", "content": ROUTING_PROMPT},
                {"role": "user", "content": consulta.interesse},
            ],
            tools=TOOLS,
            tool_choice="auto",
        )
        _coletar_usage(response, "sabiazinho-4")

        msg_ia = response.choices[0].message
        nome_ferramenta, args = resolver_tool_call(msg_ia)

        # Modelo respondeu direto, sem ferramenta.
        if not nome_ferramenta:
            resposta_texto = msg_ia.content or ""
            return {
                "success": True,
                "disciplinas": parse_resposta_sabia(resposta_texto),
                "resposta_completa": resposta_texto,
                "usage": usage_calls,
            }

        # --- ROTEAMENTO / EXECUÇÃO DA FERRAMENTA ---
        if nome_ferramenta == "buscar_optativas_curso":
            print("\n[DEBUG] 🎓 IA escolheu buscar optativas do curso.")
            if not consulta.matriz_curricular.strip():
                return {
                    "success": False,
                    "error": "Envie o historico academico",
                    "disciplinas": [],
                    "resposta_completa": "Envie o historico academico",
                    "usage": usage_calls,
                }
            dados_banco = ferramenta_buscar_optativas(consulta.matriz_curricular)
            modo = "lista"
        elif nome_ferramenta == "explicar_materia":
            termo = termo_materia(args)
            print(f"\n[DEBUG] 📖 IA escolheu explicar a matéria: '{termo}'")
            dados_banco = json.dumps(
                ferramenta_explicar_materia(termo), ensure_ascii=False
            )
            modo = "explicacao"
        elif nome_ferramenta == "buscar_materias_unb":
            termos = args.get("termos_busca", [])
            print(f"\n[DEBUG] Termos enviados para o banco: {termos}\n")
            dados_banco = _buscar_materias_logando(
                "recomendar", termos, consulta.user_id, consulta.pergunta_id
            )
            modo = "lista"
        else:
            dados_banco = "[]"
            modo = "lista"

        # 2ª chamada: geração final com o prompt certo para cada modo.
        final_prompt = EXPLICACAO_PROMPT if modo == "explicacao" else SYSTEM_PROMPT
        final_response = client_maritaca.with_options(
            **maritaca_opcoes_geracao_sem_stream()
        ).chat.completions.create(
            model="sabia-4",
            messages=[
                {"role": "system", "content": final_prompt},
                {"role": "user", "content": consulta.interesse},
                {
                    "role": "system",
                    "content": f"DADOS DO BANCO (baseie-se SOMENTE nestes dados):\n{dados_banco}",
                },
            ],
            max_tokens=5000,  # Aumentado para comportar mais disciplinas
        )
        _coletar_usage(final_response, "sabia-4")
        resposta_texto = final_response.choices[0].message.content or ""
        print(f"\n[DEBUG] Texto bruto da IA:\n{resposta_texto}\n")

        # Modo explicação é prosa: não extrai lista de disciplinas. No modo lista,
        # só vira card o código que veio da ferramenta (não o inventado pelo modelo).
        disciplinas = (
            []
            if modo == "explicacao"
            else parse_resposta_sabia(resposta_texto, codigos_validos_de(dados_banco))
        )
        return {
            "success": True,
            "disciplinas": disciplinas,
            "resposta_completa": resposta_texto,
            "usage": usage_calls,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 5. ENDPOINT DE STREAMING (SSE)
def _sse_event(stage: str, **kwargs) -> str:
    """Format a Server-Sent Event."""
    data = {"stage": stage, **kwargs}
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/recomendar-stream", dependencies=[Depends(verificar_api_key)])
async def recomendar_materias_stream(consulta: Consulta):
    if not consulta.interesse.strip():
        raise HTTPException(
            status_code=400, detail="O campo 'interesse' não pode estar vazio."
        )

    def generate():
        usage_calls = []

        def _coletar_usage(resp, modelo: str):
            u = getattr(resp, "usage", None)
            if u is None:
                return
            prompt_tokens = getattr(u, "prompt_tokens", 0) or 0
            completion_tokens = getattr(u, "completion_tokens", 0) or 0
            # Mesma ressalva do endpoint não-stream: `total_tokens` pode vir
            # None da Maritaca, então recalcula a partir da soma quando ausente.
            total_tokens = getattr(u, "total_tokens", 0) or (
                prompt_tokens + completion_tokens
            )
            usage_calls.append(
                {
                    "model": modelo,
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                }
            )

        def _fim(stage: str, **kwargs) -> str:
            # Todo fim de stream (done ou error) leva antes o evento `usage`:
            # sem ele o backend logava a pergunta com 0 tokens (768 linhas de
            # analyze-sabia-stream entre maio e julho de 2026).
            return _sse_event("usage", calls=usage_calls) + _sse_event(stage, **kwargs)

        try:
            # Stage 1: Thinking
            yield _sse_event("thinking", message="Analisando seu interesse...")

            # 1ª chamada: só para o modelo ESCOLHER a ferramenta (roteamento).
            response = client_maritaca.with_options(
                **maritaca_opcoes_roteamento()
            ).chat.completions.create(
                model="sabiazinho-4",
                messages=[
                    {"role": "system", "content": ROUTING_PROMPT},
                    {"role": "user", "content": consulta.interesse},
                ],
                tools=TOOLS,
                tool_choice="auto",
            )
            _coletar_usage(response, "sabiazinho-4")

            msg_ia = response.choices[0].message
            nome_ferramenta, args = resolver_tool_call(msg_ia)

            # Modelo respondeu direto, sem ferramenta.
            if not nome_ferramenta:
                yield _fim("done", resultado=msg_ia.content or "")
                return

            # Stage 2: Searching & Roteamento
            if nome_ferramenta == "buscar_optativas_curso":
                if not consulta.matriz_curricular.strip():
                    yield _fim("error", message="Envie o historico academico")
                    return
                yield _sse_event(
                    "searching", message="Consultando sua matriz curricular..."
                )
                dados_banco = ferramenta_buscar_optativas(consulta.matriz_curricular)
                modo = "lista"
            elif nome_ferramenta == "explicar_materia":
                termo = termo_materia(args)
                yield _sse_event(
                    "searching", message="Buscando a ementa da disciplina..."
                )
                dados_banco = json.dumps(
                    ferramenta_explicar_materia(termo), ensure_ascii=False
                )
                modo = "explicacao"
            else:  # buscar_materias_unb (ou desconhecida)
                termos = args.get("termos_busca", [])
                yield _sse_event(
                    "searching", message="Buscando disciplinas no banco de dados..."
                )
                dados_banco = _buscar_materias_logando(
                    "recomendar-stream", termos, consulta.user_id, consulta.pergunta_id
                )
                modo = "lista"

            # Stage 3: Generating (with streaming)
            if modo == "explicacao":
                yield _sse_event(
                    "generating", message="Explicando o conteúdo da matéria..."
                )
                final_prompt = EXPLICACAO_PROMPT
            else:
                yield _sse_event("generating", message="Gerando recomendações...")
                final_prompt = SYSTEM_PROMPT

            stream = client_maritaca.chat.completions.create(
                model="sabia-4",
                messages=[
                    {"role": "system", "content": final_prompt},
                    {"role": "user", "content": consulta.interesse},
                    {
                        "role": "system",
                        "content": f"DADOS DO BANCO (baseie-se SOMENTE nestes dados):\n{dados_banco}",
                    },
                ],
                max_tokens=5000,
                stream=True,
                # Sem isto a Maritaca não manda o chunk final com `usage` e os
                # tokens da geração (a parte cara) nunca chegavam ao log.
                stream_options={"include_usage": True},
            )

            resposta_texto = ""
            codigos_emitidos = set()
            # Só emite card de código que veio da ferramenta (ver /recomendar).
            codigos_validos = codigos_validos_de(dados_banco)

            for chunk in stream:
                # Chunk final de usage (include_usage) vem sem choices.
                if getattr(chunk, "usage", None) is not None:
                    _coletar_usage(chunk, "sabia-4")
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta.content:
                    resposta_texto += delta.content

                    # No modo explicação a resposta é prosa: não emite cards de disciplina.
                    if modo != "lista":
                        continue

                    # Only parse complete lines to avoid emitting partial names
                    last_newline = resposta_texto.rfind("\n")
                    if last_newline == -1:
                        continue
                    complete_text = resposta_texto[:last_newline]

                    disciplinas = parse_resposta_sabia(complete_text, codigos_validos)
                    for disc in disciplinas:
                        if disc["codigo"] not in codigos_emitidos:
                            codigos_emitidos.add(disc["codigo"])
                            yield _sse_event("disciplina", data=disc)

            # Parse any remaining text after stream ends (apenas no modo lista)
            if modo == "lista":
                disciplinas = parse_resposta_sabia(resposta_texto, codigos_validos)
                for disc in disciplinas:
                    if disc["codigo"] not in codigos_emitidos:
                        codigos_emitidos.add(disc["codigo"])
                        yield _sse_event("disciplina", data=disc)

            # Stage 4: Done (precedido do evento de uso de tokens)
            yield _fim("done", resultado=resposta_texto)

        except Exception as e:
            yield _fim("error", message=str(e))

    return StreamingResponse(generate(), media_type="text/event-stream")
