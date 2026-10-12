#!/usr/bin/env python3
"""
Fase 4: Reconciliar a tabela public.turmas depois de uma rodada de scraping.

O upsert do 03_insert_turmas.py nunca remove turmas que somem do SIGAA
(ex.: turma cancelada) — ele só insere/atualiza. Este script fecha esse
buraco: apaga, para um único ano_periodo, as turmas que NÃO foram tocadas
na rodada atual (last_updated_at < run_started_at).

Nunca toca em ano_periodo diferente do informado — turmas de períodos
anteriores são preservadas (usadas por get_turmas_demanda no dashboard
admin).

Uso:
  cd DBA/database
  python -m pip install -r requirements.txt   # instalar dependências
  python 04_reconciliar_turmas.py --ano-periodo 2026.1 --run-started-at 2026-07-16T03:00:00Z [--dry-run]

  # ou via env var RUN_STARTED_AT (setada no início do workflow):
  RUN_STARTED_AT=2026-07-16T03:00:00Z python 04_reconciliar_turmas.py --ano-periodo 2026.1
"""

import argparse
import os
import sys
import time

from supabase import create_client
from tenacity import retry, stop_after_attempt, wait_exponential

from config import SUPABASE_URL, SUPABASE_KEY

FETCH_PAGE = 1000

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def reconectar():
    global supabase
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=15))
def db(op, *args, **kwargs):
    try:
        return op(*args, **kwargs)
    except Exception as e:
        err = str(e).lower()
        if any(k in err for k in ["connection", "timeout", "network", "socket"]):
            reconectar()
            time.sleep(3)
            raise
        reconectar()
        time.sleep(2)
        raise


def listar_turmas_obsoletas(ano_periodo, run_started_at):
    """Retorna [(id_turmas, turma)] do ano_periodo com last_updated_at anterior à rodada atual."""
    obsoletas = []
    offset = 0
    while True:
        res = db(
            supabase.table("turmas")
            .select("id_turmas, turma, last_updated_at")
            .eq("ano_periodo", ano_periodo)
            .lt("last_updated_at", run_started_at)
            .range(offset, offset + FETCH_PAGE - 1)
            .execute
        )
        rows = res.data or []
        obsoletas.extend(rows)
        if len(rows) < FETCH_PAGE:
            break
        offset += FETCH_PAGE
    return obsoletas


def contar_turmas_tocadas(ano_periodo, run_started_at):
    """Quantas turmas do ano_periodo esta rodada inseriu/atualizou."""
    res = db(
        supabase.table("turmas")
        .select("id_turmas", count="exact")
        .eq("ano_periodo", ano_periodo)
        .gte("last_updated_at", run_started_at)
        .limit(1)
        .execute
    )
    return res.count or 0


def apagar_turmas(ids, dry_run):
    if not ids:
        return 0
    if dry_run:
        return len(ids)

    apagadas = 0
    for i in range(0, len(ids), FETCH_PAGE):
        lote = ids[i : i + FETCH_PAGE]
        db(supabase.table("turmas").delete().in_("id_turmas", lote).execute)
        apagadas += len(lote)
    return apagadas


def main():
    parser = argparse.ArgumentParser(
        description="Apaga turmas obsoletas (não tocadas na rodada atual) de um único ano_periodo."
    )
    parser.add_argument(
        "--ano-periodo", required=True, help="Período a reconciliar, ex.: 2026.1"
    )
    parser.add_argument(
        "--run-started-at",
        default=None,
        help="Timestamp ISO8601 (UTC) de início da rodada de scraping. "
        "Default: variável de ambiente RUN_STARTED_AT.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    run_started_at = args.run_started_at or os.getenv("RUN_STARTED_AT")
    if not run_started_at:
        print(
            "[ERRO] --run-started-at (ou env var RUN_STARTED_AT) é obrigatório — "
            "sem ele não é seguro decidir o que é obsoleto.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Fase 4: Reconciliar turmas")
    print(f"  ano_periodo: {args.ano_periodo}")
    print(f"  run_started_at: {run_started_at}")
    if args.dry_run:
        print(" [DRY-RUN] Nenhuma alteração será persistida.")
    print(flush=True)

    # Rodada que não tocou nenhuma turma do período não prova que elas sumiram:
    # o SIGAA ainda não publicou a oferta (caso normal do próximo semestre), ou
    # a coleta falhou/foi bloqueada. Reconciliar aí apagava o período inteiro.
    tocadas = contar_turmas_tocadas(args.ano_periodo, run_started_at)
    print(f"  Turmas tocadas nesta rodada: {tocadas}")
    if tocadas == 0:
        print("  Nada coletado para este período — reconciliação pulada, nada apagado.")
        return

    obsoletas = listar_turmas_obsoletas(args.ano_periodo, run_started_at)
    print(f"  Turmas obsoletas encontradas: {len(obsoletas)}")

    ids = [row["id_turmas"] for row in obsoletas]
    apagadas = apagar_turmas(ids, args.dry_run)

    if args.dry_run:
        print(f"  [DRY-RUN] {apagadas} turma(s) seriam apagadas.")
    else:
        print(f"  {apagadas} turma(s) apagadas.")


if __name__ == "__main__":
    main()
