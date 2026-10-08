#!/usr/bin/env python3
"""Exemplos locais do desenho e fronteiras de custo; não testa o runtime futuro.

Execute com Python 3.9+ e base de timezones IANA disponível. Sem rede/credenciais.
"""
from pathlib import Path
import datetime
import importlib.util
import math
import sqlite3
from zoneinfo import ZoneInfo

folder = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "costmodel", folder / "monitoring-cost-model-2026-10-08.py"
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
p = m.DEFAULTS
assert m.r2_cost(10_000_000_000, 1_000_000, 10_000_000, p)["total_usd_month"] == "0.000"
assert m.r2_cost(10_000_000_001, 1_000_000, 10_000_000, p)["total_usd_month"] == "0.015"
assert m.r2_cost(10_000_000_000, 1_000_001, 10_000_000, p)["total_usd_month"] == "4.500"
assert m.r2_cost(10_000_000_000, 1_000_000, 10_000_001, p)["total_usd_month"] == "0.360"
assert m.r2_cost(0, 1, 0, p, False)["total_usd_month"] == "4.500"
c = m.calculate(p)
assert not c["scenarios"][2]["fits_collector_20gib_at_80pct"]
assert c["scenarios"][2]["local_reserved_bytes"] <= 32 * 2**30 * 0.8
assert not c["scenarios"][3]["fits_collector_20gib_at_80pct"]
assert (
    c["scenarios"][3]["r2_cost_with_free_tier_available"]["total_usd_month"] == "0.165"
)
# Modelo mínimo de contagem, sem afirmar implementação de runtime.
db = sqlite3.connect(":memory:")
db.executescript(
    "CREATE TABLE e(id TEXT PRIMARY KEY,actor TEXT,day TEXT); CREATE TABLE a(actor TEXT,day TEXT,PRIMARY KEY(actor,day));"
)
for _ in range(10):
    with db:
        cursor = db.execute(
            "INSERT OR IGNORE INTO e VALUES(?,?,?)", ("evt1", "actor1", "2026-10-07")
        )
        if cursor.rowcount:
            db.execute("INSERT OR IGNORE INTO a VALUES(?,?)", ("actor1", "2026-10-07"))
assert db.execute("SELECT count(*) FROM e").fetchone()[0] == 1
assert db.execute("SELECT count(*) FROM a").fetchone()[0] == 1
with db:
    db.execute("INSERT INTO e VALUES(?,?,?)", ("evt2", "actor1", "2026-10-08"))
    db.execute("INSERT OR IGNORE INTO a VALUES(?,?)", ("actor1", "2026-10-08"))
assert db.execute("SELECT count(DISTINCT actor) FROM a").fetchone()[0] == 1
assert db.execute("SELECT count(*) FROM a").fetchone()[0] == 2
z = ZoneInfo("America/Sao_Paulo")
assert (
    datetime.datetime.fromisoformat("2026-10-08T02:59:00+00:00")
    .astimezone(z)
    .date()
    .isoformat()
    == "2026-10-07"
)
assert (
    datetime.datetime.fromisoformat("2026-10-08T03:01:00+00:00")
    .astimezone(z)
    .date()
    .isoformat()
    == "2026-10-08"
)
# A média de p95 entre populações de tamanhos distintos é incorreta.
a = [0.001] * 10000
b = [10.0] * 100


def quant(v):
    return sorted(v)[math.ceil(0.95 * len(v)) - 1]


assert quant(a + b) == 0.001 and (quant(a) + quant(b)) / 2 > 5

print(
    "PASS: fronteiras de tarifa/volume, replay, união de atores, timezone e agregação de percentis."
)
print("Não é teste da futura implementação ou ensaio de capacidade.")

# As novas coortes são orçamento próprio: não inferir cadastro a partir de DAU.
no_signup = dict(p, new_accounts_per_authenticated_dau_assumed=0)
no_signup_result = m.calculate(no_signup)
assert (
    c["scenarios"][0]["local_reserved_bytes"]
    - no_signup_result["scenarios"][0]["local_reserved_bytes"]
    == 60 * 35 * 192 * 2
)
assert c["scenarios"][3]["local_reserved_bytes"] <= 80 * 2**30 * 0.8
# Uma coorte imatura não é taxa zero ou benchmark. D30 necessita dia encerrado+tolerância.
anchor = datetime.date(2026, 10, 8)


def closed_return_window(anchor, day, current):
    return current >= anchor + datetime.timedelta(days=day + 2)


assert not closed_return_window(anchor, 30, datetime.date(2026, 11, 8))
assert closed_return_window(anchor, 30, datetime.date(2026, 11, 9))
# Supressão simples isolada não basta: complemento também pode revelar grupo pequeno.
group_counts = [100, 12]
assert sum(group_counts) >= 20 and any(n < 20 for n in group_counts)
# Telemetria que perde eventos não é fonte suficiente de cobrança contratual.
ledger_operations = 10
observed_success_events = 8
assert ledger_operations != observed_success_events
print(
    "PASS: orçamento independente de coorte, janela D30, supressão complementar e separação de ledger."
)
