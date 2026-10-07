#!/usr/bin/env python3
"""
verificar_rollout.py — confirma que o commit publicado é o que está respondendo.

A Deploy API devolve sucesso assim que aceita o deploy, sem esperar os pods
novos ficarem prontos. Em 06/10/2026 o backend ficou na versão antiga com o
workflow verde (o login obrigatório da IA não entrou no ar). Este script
consulta o endpoint público de cada app (AppConfig.version_path) até o campo
"commit" bater com o commit publicado, e falha se não bater no prazo.

Uso:
  python scripts/deploy/verificar_rollout.py all --commit <sha> [--timeout 600]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from deploy_config import APPS, AppConfig  # noqa: E402


def commit_no_ar(cfg: AppConfig, timeout_s: float = 10.0) -> str | None:
    """Commit que o app está servindo agora (None se não respondeu ou sem campo)."""
    url = f"https://{cfg.domain}{cfg.version_path}?_={int(time.time())}"
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            dados = json.loads(resp.read().decode("utf-8"))
    except (OSError, ValueError):
        return None
    commit = dados.get("commit") if isinstance(dados, dict) else None
    return commit or None


def mesmo_commit(no_ar: str | None, esperado: str) -> bool:
    """Aceita SHA completo ou abreviado dos dois lados (mínimo 7 caracteres)."""
    if not no_ar or len(no_ar) < 7 or len(esperado) < 7:
        return False
    return no_ar.startswith(esperado) or esperado.startswith(no_ar)


def apps_do_alvo(alvo: str) -> list[AppConfig]:
    if alvo == "all":
        escolhidos = list(APPS.values())
    elif alvo in APPS:
        escolhidos = [APPS[alvo]]
    else:
        raise SystemExit(f"Alvo desconhecido: {alvo}. Opções: all, {', '.join(APPS)}")
    return [cfg for cfg in escolhidos if cfg.version_path and cfg.domain]


def esperar(
    alvos: list[AppConfig], esperado: str, timeout_s: int, intervalo_s: int
) -> bool:
    pendentes = {cfg.key: cfg for cfg in alvos}
    limite = time.monotonic() + timeout_s
    ultimo: dict[str, str | None] = {}
    while pendentes and time.monotonic() < limite:
        for key, cfg in list(pendentes.items()):
            ultimo[key] = commit_no_ar(cfg)
            if mesmo_commit(ultimo[key], esperado):
                print(f"✓ {key}: {cfg.domain} servindo {esperado[:8]}")
                del pendentes[key]
        if pendentes:
            time.sleep(intervalo_s)
    for key, cfg in pendentes.items():
        no_ar = ultimo.get(key)
        servindo = no_ar[:8] if no_ar else "uma versão sem commit"
        print(
            f"✗ {key}: {cfg.domain} ainda serve {servindo} depois de {timeout_s}s"
            f" (esperado {esperado[:8]}). Os pods novos não ficaram prontos:"
            " veja os logs do deployment no cluster.",
            file=sys.stderr,
        )
    return not pendentes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        "alvo", help="all ou a chave de um app (backend, frontend, mcp-agent)"
    )
    parser.add_argument("--commit", required=True, help="SHA publicado (GIT_SHA)")
    parser.add_argument(
        "--timeout", type=int, default=600, help="segundos (padrão 600)"
    )
    parser.add_argument(
        "--intervalo", type=int, default=15, help="segundos entre consultas"
    )
    args = parser.parse_args()

    alvos = apps_do_alvo(args.alvo)
    if not alvos:
        print("Nenhum app com version_path para verificar.")
        return 0
    print(f"Esperando {', '.join(c.key for c in alvos)} servirem {args.commit[:8]}…")
    return 0 if esperar(alvos, args.commit, args.timeout, args.intervalo) else 1


if __name__ == "__main__":
    sys.exit(main())
