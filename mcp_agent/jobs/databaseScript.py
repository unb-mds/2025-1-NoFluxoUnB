from sentence_transformers import SentenceTransformer
from supabase import create_client, Client
from tqdm import tqdm
import warnings
import os

warnings.filterwarnings("ignore")

# Configurações

SUPABASE_URL = os.environ.get("SUPABASE_URL")
# Só a service_role escreve em materias_vetorizadas: a tabela tem RLS desde
# supabase/migrations/20261014_rls_vetorizadas_preferencias.sql, sem policy de
# escrita. Com a anon/publishable key o upsert falharia com 42501.
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
NOME_TABELA = "materias_vetorizadas"  # Apontando para a tabela

if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit(
        "ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente. "
        "Nunca use chaves hardcoded."
    )
if SUPABASE_KEY.startswith("sb_publishable_"):
    raise SystemExit(
        "ERRO: SUPABASE_SERVICE_ROLE_KEY recebeu a chave PUBLICÁVEL "
        "(sb_publishable_…). materias_vetorizadas tem RLS e só a secret "
        "(sb_secret_…) consegue gravar."
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("Carregando o modelo de IA")
modelo = SentenceTransformer("all-MiniLM-L6-v2")

tamanho_do_lote = 500
lotes_processados = 0

print("\n Iniciando ")

while True:
    # 1. Busca 500 matérias vazias
    resposta = (
        supabase.table(NOME_TABELA)
        .select("*")
        .is_("embedding", "null")
        .limit(tamanho_do_lote)
        .execute()
    )
    materias = resposta.data

    if not materias:
        print("\n TODAS as matérias do banco estão vetorizadas")
        break

    lotes_processados += 1
    print(f"\nCalculando vetores do lote {lotes_processados}= ({len(materias)})")

    lote_para_atualizar = []

    for materia in tqdm(materias, desc="Calculando Embeddings"):
        id_mat = materia["id_materia"]
        nome = str(materia.get("nome_materia", "")).strip()
        ementa = str(materia.get("ementa", "")).strip()

        texto_busca = f"Disciplina: {nome}. Ementa: {ementa}"
        vetor = modelo.encode(texto_busca).tolist()

        # recriamos o dicionário da matéria adicionando o vetor novo
        materia_atualizada = materia.copy()
        materia_atualizada["embedding"] = vetor
        lote_para_atualizar.append(materia_atualizada)

    #
    print(" Enviando pacote ")
    supabase.table(NOME_TABELA).upsert(lote_para_atualizar).execute()
