"""
Funções puras (sem rede, sem Supabase/Gemini/Maritaca) usadas pelo api_producao.

Ficam fora do api_producao.py porque importar aquele módulo já configura os
clientes globais (Supabase, Gemini, Maritaca); aqui dá para testar o parse da
resposta do Sabiá e a normalização dos termos de busca isoladamente.
"""

import json
import re

# Cliente da Maritaca (SDK OpenAI). O padrão do SDK é 600s de timeout e 2
# retries: com o provedor pendurado, uma única request do aluno ficava presa por
# até ~30 min segurando worker do uvicorn. O timeout do httpx vale por operação
# (conectar / esperar o próximo byte), não para a resposta inteira, então 90s
# ainda comporta a geração longa do sabia-4 (max_tokens=5000) sem stream.
MARITACA_TIMEOUT_S = 90.0
MARITACA_MAX_RETRIES = 1

# Teto de termos expandidos por busca semântica: cada termo vira 1 embedding
# Gemini + 1 RPC match_materias no Supabase. O prompt pede "EXATAMENTE 4".
MAX_TERMOS_BUSCA = 4
MAX_CHARS_TERMO = 80

# Prefixos de item de lista que o modelo usa antes do código: "1. ", "2) ",
# "- ", "* ", "• ", "**" (negrito), inclusive combinados ("1. **CIC0004").
_PREFIXO_LISTA = re.compile(r"^\s*(?:\d+[.)]\s*|[*\-•]\s*)+")
_CODIGO = re.compile(r"([A-Z]{3}\d{4})")
_NOTA = re.compile(r"Nota:\s*\**\s*(\d+(?:[.,]\d+)?)")


def maritaca_client_kwargs(api_key):
    """Argumentos do `OpenAI(...)` da Maritaca, com timeout e retries limitados."""
    return {
        "api_key": api_key,
        "base_url": "https://chat.maritaca.ai/api",
        "timeout": MARITACA_TIMEOUT_S,
        "max_retries": MARITACA_MAX_RETRIES,
    }


def normalizar_termos_busca(termos_busca) -> list:
    """Limpa os termos vindos do LLM: descarta vazios/não-string, corta cada um
    em MAX_CHARS_TERMO, remove duplicados (mantendo a ordem) e fica com no
    máximo MAX_TERMOS_BUSCA. Sem o teto, o modelo podia mandar 200 termos e
    gerar 200 embeddings + 200 RPCs numa só request."""
    if not isinstance(termos_busca, list):
        return []
    termos = (
        t.strip()[:MAX_CHARS_TERMO].strip()
        for t in termos_busca
        if isinstance(t, str) and t.strip()
    )
    return list(dict.fromkeys(termos))[:MAX_TERMOS_BUSCA]


def codigos_validos_de(dados_banco):
    """Conjunto de códigos presentes no JSON devolvido pela ferramenta
    (buscar_materias_unb usa `codigo`, buscar_optativas usa `codigo_materia`).

    Retorna None quando os dados não são uma lista JSON (ex.: mensagem de erro
    em texto) — nesse caso o parse não filtra nada, como antes.
    """
    try:
        dados = json.loads(dados_banco)
    except (ValueError, TypeError):
        return None
    if not isinstance(dados, list):
        return None
    codigos = set()
    for item in dados:
        if not isinstance(item, dict):
            continue
        cod = item.get("codigo") or item.get("codigo_materia") or ""
        cod = str(cod).strip().upper()
        if cod:
            codigos.add(cod)
    return codigos


def _parse_nota(linha: str):
    """Nota da linha, aceitando decimal com ponto ou vírgula, limitada a 0-10.
    Antes os não-dígitos eram removidos e "8.5/10" virava 85."""
    m = _NOTA.search(linha)
    if not m:
        return 7
    nota = max(0.0, min(10.0, float(m.group(1).replace(",", "."))))
    return int(nota) if nota.is_integer() else nota


def parse_resposta_sabia(texto: str, codigos_validos=None) -> list:
    """Extrai as disciplinas do texto da IA bloqueando qualquer duplicação.

    `codigos_validos`, quando informado, restringe o resultado aos códigos que
    vieram da ferramenta (evita card de disciplina inventada pelo modelo).
    """
    disciplinas = []
    codigos_vistos = set()  # O nosso rastreador de duplicatas

    for linha in (texto or "").split("\n"):
        # Remove o marcador de lista ("1. **", "- ", "• "...) e exige o código
        # logo em seguida: um código citado no meio da justificativa não vira item.
        linha = _PREFIXO_LISTA.sub("", linha).strip()
        codigo_match = _CODIGO.match(linha)
        if not codigo_match:
            continue

        try:
            codigo = codigo_match.group(1).upper()

            if codigos_validos is not None and codigo not in codigos_validos:
                continue

            # Se já vimos esse código pula para a próxima linha
            if codigo in codigos_vistos:
                continue

            codigos_vistos.add(codigo)  # Registra que já pegou essa matéria

            resto = linha[codigo_match.end() :].strip().lstrip("-").strip()

            nome = (
                resto.split("|")[0].strip()
                if "|" in resto
                else (
                    resto.split("Nota:")[0].strip()
                    if "Nota:" in resto
                    else resto.strip()
                )
            )
            nome = nome.strip("*").strip()

            justificativa = ""
            if "Motivo:" in linha:
                justificativa = linha.split("Motivo:")[1].strip().strip("*").strip()

            disciplinas.append(
                {
                    "codigo": codigo,
                    "nome": nome,
                    "nota": _parse_nota(linha),
                    "justificativa": justificativa,
                }
            )
        except Exception:
            continue

    return disciplinas
