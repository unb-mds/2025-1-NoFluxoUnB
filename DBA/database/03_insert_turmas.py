#!/usr/bin/env python3
"""
Fase 3: Inserir/atualizar turmas na tabela public.turmas a partir de:
DBA/turmas/turmas_depto_*.json

Regras:
- FK id_materia é resolvida por materias.codigo_materia == turma["codigo"].
- Grava/atualiza por UPSERT usando a chave única:
  (id_materia, turma, ano_periodo) [constraint uq_turmas_oferta].
- horario recebe trim (strip).
- vagas_* são normalizadas para int (ou None).
- vagas_sobrando é recalculada quando vagas_ofertadas e vagas_ocupadas existem,
  para manter consistência com o CHECK do banco.

Uso:
  cd DBA/database
  python -m pip install -r requirements.txt   # instalar dependências
  python 03_insert_turmas.py [--dry-run]
"""

import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone

from supabase import create_client
from tenacity import retry, stop_after_attempt, wait_exponential

from config import DBA_ROOT, SUPABASE_URL, SUPABASE_KEY

DRY_RUN = "--dry-run" in sys.argv
CHUNK_SIZE = 300
FETCH_PAGE = 4000
PASTA_TURMAS = DBA_ROOT / "turmas"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# codigo_materia -> id_materia
CACHE_ID_MATERIA = {}


def reconectar():
    global supabase
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=15))
def db(op, *args, **kwargs):
    try:
        return op(*args, **kwargs)
    except Exception as e:
        err = str(e).lower()
        if "duplicate key" in err or "23505" in err:
            raise
        if any(k in err for k in ["connection", "timeout", "network", "socket"]):
            reconectar()
            time.sleep(3)
            raise
        reconectar()
        time.sleep(2)
        raise


def to_int_or_none(value):
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return None
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def txt(value):
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_cache_materias():
    offset = 0
    while True:
        res = db(
            supabase.table("materias")
            .select("id_materia, codigo_materia")
            .range(offset, offset + FETCH_PAGE - 1)
            .execute
        )
        for row in res.data or []:
            codigo = row.get("codigo_materia")
            id_materia = row.get("id_materia")
            if codigo and id_materia is not None:
                CACHE_ID_MATERIA[str(codigo).strip()] = id_materia
        if len(res.data or []) < FETCH_PAGE:
            break
        offset += FETCH_PAGE


def listar_arquivos_turmas():
    if not PASTA_TURMAS.is_dir():
        return []
    return sorted(PASTA_TURMAS.glob("turmas_depto_*.json"))


def normalizar_linha_turma(turma):
    codigo = txt(turma.get("codigo"))
    if not codigo:
        return None, "sem_codigo"

    id_materia = CACHE_ID_MATERIA.get(codigo)
    if id_materia is None:
        return None, "materia_nao_encontrada"

    turma_nome = txt(turma.get("turma"))
    ano_periodo = txt(turma.get("ano_periodo"))
    if not turma_nome or not ano_periodo:
        return None, "sem_chave_unica"

    vagas_ofertadas = to_int_or_none(turma.get("vagas_ofertadas"))
    vagas_ocupadas = to_int_or_none(turma.get("vagas_ocupadas"))
    vagas_sobrando = to_int_or_none(turma.get("vagas_sobrando"))

    if vagas_ofertadas is not None and vagas_ocupadas is not None:
        vagas_sobrando = vagas_ofertadas - vagas_ocupadas

    row = {
        "id_materia": id_materia,
        "turma": turma_nome,
        "ano_periodo": ano_periodo,
        "docente": txt(turma.get("docente")),
        "horario": txt(turma.get("horario")),  # trim obrigatório solicitado
        "local": txt(turma.get("local")),
        "vagas_ofertadas": vagas_ofertadas,
        "vagas_ocupadas": vagas_ocupadas,
        "vagas_sobrando": vagas_sobrando,
        "last_updated_at": utc_now_iso(),
    }
    return row, None


def flush_upsert(lote):
    if not lote:
        return 0
    if DRY_RUN:
        return len(lote)

    try:
        db(
            supabase.table("turmas")
            .upsert(lote, on_conflict="id_materia,turma,ano_periodo")
            .execute
        )
        return len(lote)
    except Exception:
        inseridas = 0
        for row in lote:
            try:
                db(
                    supabase.table("turmas")
                    .upsert(row, on_conflict="id_materia,turma,ano_periodo")
                    .execute
                )
                inseridas += 1
            except Exception:
                pass
        if inseridas < len(lote):
            print(
                f"    [turmas] lote parcial: {inseridas}/{len(lote)} upserts.",
                flush=True,
            )
        return inseridas


def main():
    t0 = time.time()
    print("Fase 3: Turmas")
    print(f"Fonte: {PASTA_TURMAS} (turmas_depto_*.json)")
    print(f"Batch upsert: {CHUNK_SIZE} por lote")
    if DRY_RUN:
        print(" [DRY-RUN] Nenhuma alteração será persistida.")
    print(flush=True)

    print("[1/3] Carregando cache de matérias...", flush=True)
    load_cache_materias()
    print(
        f"      [Cache] {len(CACHE_ID_MATERIA)} códigos de matéria mapeados.",
        flush=True,
    )

    arquivos = listar_arquivos_turmas()
    print(f"[2/3] Processando {len(arquivos)} arquivos de turmas...", flush=True)
    if not arquivos:
        print("Nenhum turmas_depto_*.json encontrado.")
        return

    total_upserts = 0
    total_lidas = 0
    sem_codigo = 0
    sem_fk = 0
    sem_chave = 0
    codigos_sem_fk = Counter()

    lote = []
    idx_por_chave = {}
    total_arquivos = len(arquivos)

    for idx_arq, arq in enumerate(arquivos):
        n = idx_arq + 1
        if n == 1 or n % 25 == 0 or n == total_arquivos:
            print(f"      {n}/{total_arquivos} arquivos...", flush=True)
        try:
            turmas = json.loads(arq.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  [ERRO] {arq.name}: {e}")
            continue

        if not isinstance(turmas, list):
            continue

        for t in turmas:
            total_lidas += 1
            if not isinstance(t, dict):
                continue

            row, erro = normalizar_linha_turma(t)
            if erro:
                if erro == "sem_codigo":
                    sem_codigo += 1
                elif erro == "materia_nao_encontrada":
                    sem_fk += 1
                    codigos_sem_fk[txt(t.get("codigo")) or "?"] += 1
                elif erro == "sem_chave_unica":
                    sem_chave += 1
                continue

            chave = (row["id_materia"], row["turma"], row["ano_periodo"])
            if chave in idx_por_chave:
                lote[idx_por_chave[chave]] = row
            else:
                idx_por_chave[chave] = len(lote)
                lote.append(row)

            if len(lote) >= CHUNK_SIZE:
                total_upserts += flush_upsert(lote)
                lote = []
                idx_por_chave = {}

    total_upserts += flush_upsert(lote)

    elapsed = round(time.time() - t0, 1)
    print("\n[3/3] Concluído.", flush=True)
    print(f"      Turmas lidas: {total_lidas}", flush=True)
    print(f"      Linhas upsertadas: {total_upserts}", flush=True)
    print(f"      Ignoradas sem codigo: {sem_codigo}", flush=True)
    print(f"      Ignoradas sem FK de materia: {sem_fk}", flush=True)
    print(f"      Ignoradas sem chave (turma/ano_periodo): {sem_chave}", flush=True)
    print(f"      Tempo: {elapsed}s", flush=True)
    if codigos_sem_fk:
        print(
            f"      [Diagnóstico] {len(codigos_sem_fk)} códigos distintos sem matéria correspondente "
            f"(top 20 por volume de turmas):",
            flush=True,
        )
        for codigo, qtd in codigos_sem_fk.most_common(20):
            print(f"        {codigo}: {qtd} turma(s)", flush=True)
    if DRY_RUN:
        print(" [DRY-RUN] Nenhuma alteração foi persistida.", flush=True)


if __name__ == "__main__":
    main()
