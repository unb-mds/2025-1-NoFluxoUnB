#!/usr/bin/env python3
"""Exemplos locais do desenho e fronteiras de custo; não testa o runtime futuro.

Execute com Python 3.9+ e base de timezones IANA disponível. Sem rede/credenciais.
"""
from pathlib import Path
import json,sqlite3,sys,importlib.util,datetime,math
from zoneinfo import ZoneInfo
folder=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('costmodel',folder/'monitoring-cost-model-2026-10-08.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=m.DEFAULTS
assert m.r2_cost(10_000_000_000,1_000_000,10_000_000,p)['total_usd_month']=='0.000'
assert m.r2_cost(10_000_000_001,1_000_000,10_000_000,p)['total_usd_month']=='0.015'
assert m.r2_cost(10_000_000_000,1_000_001,10_000_000,p)['total_usd_month']=='4.500'
assert m.r2_cost(10_000_000_000,1_000_000,10_000_001,p)['total_usd_month']=='0.360'
assert m.r2_cost(0,1,0,p,False)['total_usd_month']=='4.500'
c=m.calculate(p)
assert c['scenarios'][2]['fits_collector_20gib_at_80pct']
assert not c['scenarios'][3]['fits_collector_20gib_at_80pct']
assert c['scenarios'][3]['r2_cost_with_free_tier_available']['total_usd_month']=='0.075'
# Modelo mínimo de contagem, sem afirmar implementação de runtime.
db=sqlite3.connect(':memory:');db.executescript('CREATE TABLE e(id TEXT PRIMARY KEY,actor TEXT,day TEXT); CREATE TABLE a(actor TEXT,day TEXT,PRIMARY KEY(actor,day));')
for _ in range(10):
 with db:
  cursor=db.execute('INSERT OR IGNORE INTO e VALUES(?,?,?)',('evt1','actor1','2026-10-07'))
  if cursor.rowcount:db.execute('INSERT OR IGNORE INTO a VALUES(?,?)',('actor1','2026-10-07'))
assert db.execute('SELECT count(*) FROM e').fetchone()[0]==1
assert db.execute('SELECT count(*) FROM a').fetchone()[0]==1
with db:
 db.execute('INSERT INTO e VALUES(?,?,?)',('evt2','actor1','2026-10-08'));db.execute('INSERT OR IGNORE INTO a VALUES(?,?)',('actor1','2026-10-08'))
assert db.execute('SELECT count(DISTINCT actor) FROM a').fetchone()[0]==1
assert db.execute('SELECT count(*) FROM a').fetchone()[0]==2
z=ZoneInfo('America/Sao_Paulo')
assert datetime.datetime.fromisoformat('2026-10-08T02:59:00+00:00').astimezone(z).date().isoformat()=='2026-10-07'
assert datetime.datetime.fromisoformat('2026-10-08T03:01:00+00:00').astimezone(z).date().isoformat()=='2026-10-08'
# A média de p95 entre populações de tamanhos distintos é incorreta.
a=[.001]*10000;b=[10.0]*100
quant=lambda v:sorted(v)[math.ceil(.95*len(v))-1]
assert quant(a+b)==.001 and (quant(a)+quant(b))/2>5

print('PASS: fronteiras de tarifa/volume, replay, união de atores, timezone e agregação de percentis.')
print('Não é teste da futura implementação ou ensaio de capacidade.')
