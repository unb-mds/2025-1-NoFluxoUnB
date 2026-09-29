"""
Testes das funções puras de sabia_utils (parse da resposta do Sabiá, teto de
termos da busca semântica e config do cliente Maritaca).

Rodar a partir de mcp_agent/:
    python test_sabia_utils.py      (sem dependências)
    python -m pytest test_sabia_utils.py
"""

from sabia_utils import (
    codigos_validos_de,
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
