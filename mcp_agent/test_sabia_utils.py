"""
Testes das funções puras de sabia_utils (parse da resposta do Sabiá, teto de
termos da busca semântica e config do cliente Maritaca).

Rodar a partir de mcp_agent/:
    python test_sabia_utils.py      (sem dependências)
    python -m pytest test_sabia_utils.py
"""

import ast
import os
import re
import sys
import types

try:
    import httpx  # noqa: F401
except ImportError:
    # Sem as dependências instaladas: um httpx.Timeout mínimo basta para
    # conferir os valores (read/connect) montados por sabia_utils.
    class _Timeout:
        def __init__(self, timeout, *, connect=None):
            self.read = timeout
            self.connect = connect

    sys.modules["httpx"] = types.SimpleNamespace(Timeout=_Timeout)

from sabia_utils import (
    linha_uso_embeddings,
    MARITACA_CONNECT_TIMEOUT_S,
    MARITACA_GERACAO_SEM_STREAM_TIMEOUT_S,
    MAX_TERMOS_BUSCA,
    codigos_validos_de,
    maritaca_client_kwargs,
    maritaca_opcoes_geracao_sem_stream,
    maritaca_opcoes_roteamento,
    pior_caso_recomendar_s,
    normalizar_termos_busca,
    parse_resposta_sabia,
)


def _codigos(disciplinas):
    return [d["codigo"] for d in disciplinas]


# --- R32: nota decimal com clamp 0-10 --------------------------------------


def test_nota_decimal_com_ponto():
    r = parse_resposta_sabia("**CIC0004 - ALG | Nota: 8.5/10 | Motivo:** base")
    assert r[0]["nota"] == 8.5, r


def test_nota_decimal_com_virgula():
    r = parse_resposta_sabia("**CIC0004 - ALG | Nota: 9,5/10 | Motivo:** base")
    assert r[0]["nota"] == 9.5, r


def test_nota_fora_da_escala_e_limitada_a_10():
    r = parse_resposta_sabia("**CIC0004 - ALG | Nota: 85/10 | Motivo:** base")
    assert r[0]["nota"] == 10, r


def test_nota_inteira_continua_int_e_default_7():
    r = parse_resposta_sabia("**CIC0004 - ALG | Nota: 9/10 | Motivo:** base")
    assert r[0]["nota"] == 9 and isinstance(r[0]["nota"], int), r
    assert parse_resposta_sabia("**CIC0004 - ALG")[0]["nota"] == 7


# --- R32: só códigos que vieram da ferramenta ------------------------------


def test_descarta_codigo_fora_do_resultado_da_busca():
    texto = (
        "**XYZ9999 - DISCIPLINA QUE NAO EXISTE | Nota: 10/10 | Motivo:** x\n"
        "**CIC0004 - ALG | Nota: 9/10 | Motivo:** base"
    )
    r = parse_resposta_sabia(texto, codigos_validos={"CIC0004"})
    assert _codigos(r) == ["CIC0004"], r


def test_sem_codigos_validos_nao_filtra():
    r = parse_resposta_sabia("**XYZ9999 - X | Nota: 10/10", codigos_validos=None)
    assert _codigos(r) == ["XYZ9999"], r


def test_codigos_validos_de_busca_e_optativas():
    busca = '[{"codigo": "cic0004", "nome": "ALG", "similaridade": 0.8}]'
    optativas = '[{"codigo_materia": "MAT0025", "nome_materia": "CALCULO 1"}]'
    assert codigos_validos_de(busca) == {"CIC0004"}
    assert codigos_validos_de(optativas) == {"MAT0025"}
    assert codigos_validos_de("[]") == set()
    # Texto de erro (não é lista JSON) => sem filtro.
    assert codigos_validos_de("Nenhum termo de busca válido foi fornecido.") is None


# --- R33: linhas numeradas -------------------------------------------------


def test_aceita_linhas_numeradas():
    texto = (
        "1. **CIC0004 - ALGORITMOS | Nota: 9/10 | Motivo:** base\n"
        "2) **MAT0025 - CALCULO 1 | Nota: 8/10 | Motivo:** base"
    )
    r = parse_resposta_sabia(texto)
    assert _codigos(r) == ["CIC0004", "MAT0025"], r
    assert r[0]["nome"] == "ALGORITMOS", r
    assert r[0]["justificativa"] == "base", r


def test_outros_marcadores_de_lista_continuam_funcionando():
    texto = (
        "- **CIC0004 - ALG | Nota: 9/10 | Motivo:** a\n"
        "• MAT0025 - CALCULO 1 | Nota: 8/10 | Motivo:** b\n"
        "**FGA0001 - X | Nota: 7/10 | Motivo:** c"
    )
    assert _codigos(parse_resposta_sabia(texto)) == ["CIC0004", "MAT0025", "FGA0001"]


def test_codigo_citado_no_meio_do_texto_nao_vira_item():
    texto = "Motivo: complementa CIC0004\nEssa lista inclui MAT0025 como base."
    assert parse_resposta_sabia(texto) == []


def test_nao_duplica_codigo():
    texto = "1. **CIC0004 - A | Nota: 9/10\n2. **CIC0004 - A | Nota: 8/10"
    assert _codigos(parse_resposta_sabia(texto)) == ["CIC0004"]


# --- R51: teto de termos expandidos ----------------------------------------


def test_limita_termos_a_4():
    termos = normalizar_termos_busca(["t%d" % i for i in range(200)])
    assert termos == ["t0", "t1", "t2", "t3"], termos
    assert MAX_TERMOS_BUSCA == 4


def test_termos_dedup_vazios_e_tamanho():
    assert normalizar_termos_busca(["a", " a ", "", "  ", None, 3, "b"]) == ["a", "b"]
    assert len(normalizar_termos_busca(["x" * 500])[0]) == 80
    assert normalizar_termos_busca("nao e lista") == []


# --- R30: cliente Maritaca com timeout e retries limitados -----------------


def test_cliente_maritaca_tem_timeout_e_poucos_retries():
    kw = maritaca_client_kwargs("chave")
    assert kw["api_key"] == "chave"
    assert kw["base_url"] == "https://chat.maritaca.ai/api"
    # Padrão do SDK OpenAI é 600s e 2 retries (até ~30 min pendurado).
    # O padrão do cliente vale para o stream: read = inatividade entre chunks.
    assert 0 < kw["timeout"].read <= 120, vars(kw["timeout"])
    assert kw["timeout"].connect == MARITACA_CONNECT_TIMEOUT_S <= 15
    assert kw["max_retries"] == 0, kw


def test_geracao_sem_stream_tem_read_timeout_de_geracao_inteira():
    # Sem stream a Maritaca só manda o 1º byte ao fim da geração: o read
    # timeout é o teto da geração inteira do sabia-4 (max_tokens=5000), então
    # não pode ser o de inatividade (90s), que cortava respostas longas.
    op = maritaca_opcoes_geracao_sem_stream()
    assert op["timeout"].read >= 180, vars(op["timeout"])
    assert op["timeout"].read > maritaca_client_kwargs("k")["timeout"].read
    # connect continua curto: provedor fora do ar falha rápido.
    assert op["timeout"].connect == MARITACA_CONNECT_TIMEOUT_S
    # Retry após timeout re-geraria (e cobraria) tudo de novo.
    assert op["max_retries"] == 0, op
    rot = maritaca_opcoes_roteamento()
    assert rot["max_retries"] == 0 and rot["timeout"].read < op["timeout"].read


def _ler_constante_ms(nome):
    caminho = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..",
        "backend",
        "src",
        "services",
        "sabia.service.ts",
    )
    with open(caminho, encoding="utf-8") as f:
        m = re.search(r"export const " + nome + r"\s*=\s*([\d_]+)\s*;", f.read())
    assert m, nome
    return int(m.group(1).replace("_", ""))


def test_teto_do_backend_cobre_o_pior_caso_do_recomendar():
    # Se o backend desistir antes do Python, devolve 504 enquanto a Maritaca
    # ainda gera (e cobra). Margem de 30s para embeddings/RPC da ferramenta.
    teto_backend_s = _ler_constante_ms("SABIA_TIMEOUT_MS") / 1000
    assert teto_backend_s >= pior_caso_recomendar_s() + 30, (
        teto_backend_s,
        pior_caso_recomendar_s(),
    )
    assert pior_caso_recomendar_s() >= MARITACA_GERACAO_SEM_STREAM_TIMEOUT_S


def test_teto_de_inatividade_do_stream_cobre_o_python():
    # No stream, a maior espera sem evento é o roteamento ou o intervalo entre
    # chunks; o backend precisa esperar mais que isso (sem retries no Python).
    idle_s = _ler_constante_ms("SABIA_STREAM_IDLE_TIMEOUT_MS") / 1000
    rot = maritaca_opcoes_roteamento()["timeout"]
    padrao = maritaca_client_kwargs("k")["timeout"]
    assert idle_s > rot.read + rot.connect, idle_s
    assert idle_s > padrao.read + padrao.connect, idle_s


def test_chamadas_sem_stream_do_api_producao_usam_teto_proprio():
    # Toda chamada .create(...) sem stream=True precisa passar por
    # client_maritaca.with_options(**maritaca_opcoes_*()); a geração final do
    # /recomendar (sabia-4) usa o teto de geração inteira.
    caminho = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "api_producao.py"
    )
    with open(caminho, encoding="utf-8") as f:
        arvore = ast.parse(f.read())
    creates = [
        n
        for n in ast.walk(arvore)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr == "create"
    ]
    assert len(creates) == 4, len(creates)
    opcoes_por_modelo = []
    for c in creates:
        kws = {k.arg: k.value for k in c.keywords}
        stream = kws.get("stream")
        if isinstance(stream, ast.Constant) and stream.value is True:
            continue
        alvo = c.func.value.value.value  # client.with_options(...).chat.completions
        assert (
            isinstance(alvo, ast.Call) and alvo.func.attr == "with_options"
        ), ast.dump(c.func)
        opcoes = alvo.keywords[0].value.func.id
        opcoes_por_modelo.append((kws["model"].value, opcoes))
    assert sorted(opcoes_por_modelo) == [
        ("sabia-4", "maritaca_opcoes_geracao_sem_stream"),
        ("sabiazinho-4", "maritaca_opcoes_roteamento"),
        ("sabiazinho-4", "maritaca_opcoes_roteamento"),
    ], opcoes_por_modelo


def _funcao_api_producao(nome):
    caminho = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "api_producao.py"
    )
    with open(caminho, encoding="utf-8") as f:
        arvore = ast.parse(f.read())
    for n in ast.walk(arvore):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == nome:
            return n
    raise AssertionError(f"{nome} não encontrada em api_producao.py")


def test_stream_pede_usage_a_maritaca():
    # analyze-sabia-stream gravava 0 tokens: sem include_usage a Maritaca não
    # manda o chunk final com `usage` da geração em stream.
    stream = _funcao_api_producao("recomendar_materias_stream")
    creates = [
        n
        for n in ast.walk(stream)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr == "create"
    ]
    com_stream = [
        c
        for c in creates
        if any(
            k.arg == "stream" and isinstance(k.value, ast.Constant) and k.value.value
            for k in c.keywords
        )
    ]
    assert com_stream, "nenhuma chamada com stream=True"
    for c in com_stream:
        kws = {k.arg: k.value for k in c.keywords}
        assert "stream_options" in kws, "stream sem stream_options"
        opcoes = ast.literal_eval(kws["stream_options"])
        assert opcoes == {"include_usage": True}, opcoes


def test_todo_fim_de_stream_manda_usage():
    # Os caminhos curtos (resposta direta, "Envie o historico", exceção) saíam
    # sem o evento `usage` e o backend logava a pergunta com 0 tokens. Todo
    # done/error do stream passa por _fim(), que emite usage antes.
    stream = _funcao_api_producao("recomendar_materias_stream")
    fim = next(
        n
        for n in ast.walk(stream)
        if isinstance(n, ast.FunctionDef) and n.name == "_fim"
    )
    dentro_do_fim = {id(n) for n in ast.walk(fim)}
    diretos = [
        n
        for n in ast.walk(stream)
        if isinstance(n, ast.Call)
        and getattr(n.func, "id", None) == "_sse_event"
        and n.args
        and isinstance(n.args[0], ast.Constant)
        and n.args[0].value in ("done", "error")
        and id(n) not in dentro_do_fim
    ]
    assert not diretos, [ast.dump(n.args[0]) for n in diretos]
    usos_do_fim = [
        n
        for n in ast.walk(stream)
        if isinstance(n, ast.Call) and getattr(n.func, "id", None) == "_fim"
    ]
    assert len(usos_do_fim) >= 4, len(usos_do_fim)


def test_api_producao_usa_config_do_cliente_maritaca():
    # Confere via AST (importar api_producao conectaria em Supabase/Gemini).
    caminho = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "api_producao.py"
    )
    with open(caminho, encoding="utf-8") as f:
        arvore = ast.parse(f.read())
    chamadas_openai = [
        n
        for n in ast.walk(arvore)
        if isinstance(n, ast.Call) and getattr(n.func, "id", None) == "OpenAI"
    ]
    assert chamadas_openai, "OpenAI(...) não encontrado em api_producao.py"
    for chamada in chamadas_openai:
        kwargs = [k for k in chamada.keywords if k.arg is None]
        assert kwargs and getattr(kwargs[0].value.func, "id", None) == (
            "maritaca_client_kwargs"
        ), ast.dump(chamada)


def test_linha_uso_embeddings_leva_usuario_e_pergunta():
    # Sem pergunta_id, cada busca semântica feita dentro de uma pergunta do
    # Darcy virava mais uma "pergunta" no card de custo do dashboard.
    uid = "11111111-1111-1111-1111-111111111111"
    pid = "aaaaaaaa-0000-0000-0000-000000000001"
    linha = linha_uso_embeddings("buscar-materias", ["redes", "ia"], 12, True, uid, pid)
    assert linha["user_id"] == uid
    assert linha["pergunta_id"] == pid
    assert linha["endpoint"] == "buscar-materias"
    assert linha["model"] == "gemini-embedding-001"
    assert (
        linha["prompt_tokens"] == linha["total_tokens"] == 2
    )  # "redes ia" = 8 chars / 4


def test_linha_uso_embeddings_descarta_id_invalido():
    # A coluna é uuid: valor lixo derrubaria o insert e a linha de custo sumiria.
    linha = linha_uso_embeddings("buscar-materias", ["x"], 1, True, "nao-e-uuid", 42)
    assert linha["user_id"] is None
    assert linha["pergunta_id"] is None


def test_buscar_materias_repassa_ids_ao_log():
    # Via AST (importar api_producao conectaria em Supabase/Gemini).
    caminho = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "api_producao.py"
    )
    with open(caminho, encoding="utf-8") as f:
        arvore = ast.parse(f.read())
    rota = next(
        n
        for n in ast.walk(arvore)
        if isinstance(n, ast.AsyncFunctionDef) and n.name == "buscar_materias"
    )
    chamadas = [
        n
        for n in ast.walk(rota)
        if isinstance(n, ast.Call)
        and getattr(n.func, "id", None) == "_log_ai_usage_embeddings"
    ]
    assert chamadas, "buscar_materias não loga as embeddings"
    args = [ast.unparse(a) for a in chamadas[0].args]
    assert "busca.user_id" in args and "busca.pergunta_id" in args


def _classe_api_producao(nome):
    caminho = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "api_producao.py"
    )
    with open(caminho, encoding="utf-8") as f:
        arvore = ast.parse(f.read())
    for n in ast.walk(arvore):
        if isinstance(n, ast.ClassDef) and n.name == nome:
            return n
    raise AssertionError(f"classe {nome} não encontrada em api_producao.py")


def test_consulta_recebe_usuario_e_pergunta():
    # O backend manda user_id/pergunta_id no corpo do /recomendar(-stream);
    # sem os campos o pydantic descarta e as embeddings ficam sem pergunta.
    consulta = _classe_api_producao("Consulta")
    campos = {
        n.target.id
        for n in consulta.body
        if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)
    }
    assert {"user_id", "pergunta_id"} <= campos, campos


def test_recomendar_loga_embeddings_da_busca():
    # A busca semântica dentro do /recomendar e do /recomendar-stream chamava o
    # Gemini sem registrar nada no ai_usage_log (só o /buscar-materias logava).
    for rota, endpoint in (
        ("recomendar_materias", "recomendar"),
        ("recomendar_materias_stream", "recomendar-stream"),
    ):
        funcao = _funcao_api_producao(rota)
        chamadas = [
            n
            for n in ast.walk(funcao)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
        ]
        diretas = [c for c in chamadas if c.func.id == "ferramenta_buscar_materias_unb"]
        assert not diretas, f"{rota} busca sem logar as embeddings"
        com_log = [c for c in chamadas if c.func.id == "_buscar_materias_logando"]
        assert com_log, f"{rota} não passa por _buscar_materias_logando"
        args = [ast.unparse(a) for a in com_log[0].args]
        assert args[0] == repr(endpoint), args
        assert "consulta.user_id" in args and "consulta.pergunta_id" in args, args


def test_busca_logada_registra_falha_e_termos_validos():
    # _buscar_materias_logando: loga só com termo válido (sem termo não há
    # chamada ao Gemini) e usa o "ok" que ferramenta_buscar_materias_unb marca.
    funcao = _funcao_api_producao("_buscar_materias_logando")
    fonte = ast.unparse(funcao)
    assert "normalizar_termos_busca(" in fonte
    assert "if termos_validos:" in fonte
    assert "_log_ai_usage_embeddings(" in fonte
    assert "estado['ok']" in fonte
    busca = _funcao_api_producao("ferramenta_buscar_materias_unb")
    assert "estado['ok'] = False" in ast.unparse(busca)


if __name__ == "__main__":
    testes = [
        v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)
    ]
    falhas = 0
    for t in testes:
        try:
            t()
            print(f"PASS  {t.__name__}")
        except AssertionError as e:
            falhas += 1
            print(f"FAIL  {t.__name__}: {e}")
        except Exception as e:  # noqa: BLE001
            falhas += 1
            print(f"ERROR {t.__name__}: {type(e).__name__}: {e}")
    print(f"\n{len(testes) - falhas}/{len(testes)} testes passaram")
    raise SystemExit(1 if falhas else 0)
