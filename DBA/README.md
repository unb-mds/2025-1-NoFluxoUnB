# DBA — coleta e ingestão acadêmica

Python para coletar cursos, matrizes, matérias, relações entre disciplinas,
turmas e calendário da UnB e sincronizá-los no Supabase. Guia revisado contra o
código em 2026-10-07; não confirma a aplicação de SQL nem o estado do banco vivo.
Os contratos e comandos de carga ficam em [database/README.md](database/README.md).
O dossiê completo está em
[docs/kb/subsystems/data-ingestion-and-schema.md](../docs/kb/subsystems/data-ingestion-and-schema.md).

## Áreas e dados

| Área | Uso atual |
|---|---|
| `scraping/scraping_ementa.py` | Estruturas curriculares e dados de conclusão; entrada do script 01. |
| `scraping/scraping_equivalencias.py` | Detalhes de matérias, pré/co-requisitos e equivalências; entrada do 02 e apoio ao 01. |
| `scraping/scraping_turmas.py` | Ofertas por departamento/ano/período; entrada do 03. |
| `scraping/scraping_calendario_academico.py` | Períodos regulares `.1`/`.2` da SAA; entrada do 05. |
| `scraping/atualizar_departamentos_id.py` | Inventário de departamentos. |
| `database/` | Operações 01–05, `expressao_parser.py` e `diff_utils.py`. |
| `tests/` | Suíte Pytest dos módulos Python. |
| `parse_pdf/pdf_parser_final.py` | Parser Flask/PDF/OCR para testes e referência. O produto usa `frontend/src/lib/services/pdf/pdfParser.ts::parsePdf`, no navegador. |
| `dados/cursos-de-graduacao.json` | Dataset de apoio rastreado no Git. |
| `turmas_2026_1/` | Saída histórica rastreada; não é a entrada padrão atual do 03. |

As entradas correntes são `dados/estruturas-curriculares/*.json` (01),
`dados/materias/turmas_depto_*.json` (02),
`dados/dados_finais_teste_p_depto_20/turmas_depto_*.json` (03) e
`dados/calendario-academico-graduacao.json` (05). `.gitignore` exclui
`DBA/dados/**`, exceto o JSON de cursos: um clone não contém toda a coleta.
`DBA/package.json` não tem scripts npm: os antigos apontavam para utilitários
JS já removidos e saíram no #249; não fazem parte do caminho de ingestão.

## Execução e automação

O catálogo deve existir antes das relações/ofertas. A reconciliação 04 depende
de uma rodada completa de coleta e upsert 03; o calendário 05 é independente.
As operações são separadas, sem uma transação única para todo o pipeline.
`--dry-run` evita persistência, mas inicializa cliente e consulta o Supabase.
Confira o ambiente antes de executar comandos de carga.

Os workflows versionados definem:

- `scrape_ementa.yml`: manual ou primeiro dia do mês, 00:00 UTC → 01.
- `scrape_equivalencias.yml`: manual ou sucesso de Scrape Ementa → 02.
- `scrape_turmas_lite.yml`: manual, sucesso de Scrape Equivalencias ou cron de
  30 minutos → decisão por RPC → coleta → 03 → 04. A cadência governa o cron;
  manual/cadeia bem-sucedida a ignoram. Sem período utilizável da RPC, há
  fallback por mês, que pode errar perto do fim do semestre.
- `scrape_calendario.yml`: manual ou segunda-feira, 02:00 UTC → 05.

Ementa/equivalências definem auto-commit de JSONs, embora essas pastas sejam
ignoradas; o workflow não prova publicação dos dados. Os artifacts selecionam
logs de scraping, excluindo logs de carga com credenciais privilegiadas.
Não há evidência de execução atual neste guia.

Para instalar dependências de coleta, da raiz e com ambiente virtual ativo:

```bash
python -m pip install -r DBA/scraping/requirements.txt
```

Scraping acessa serviços externos. Comandos de ingestão, configuração de
credenciais e exclusão na reconciliação estão no README de `database/`.

## Testes

Partindo da raiz, com ambiente virtual ativo:

```bash
python -m pip install -r DBA/tests/requirements.txt
python -m pip install pytest pytest-cov pytest-mock
cd DBA/tests
python -m pytest
```

O CI usa Python 3.11 e instala Tesseract (português) e Poppler para PDF/OCR.
`conftest.py` inclui a raiz nos imports; `pytest.ini` mede `expressao_parser` e
`DBA.parse_pdf.pdf_parser_final`, com limite combinado de 45%. Não há porcentagem
atual medida neste guia. O caso de upload PDF bem-sucedido está marcado como
skip; testes de utilitários de scraping usam cópias locais das funções, sem
validar rede ou módulo de coleta atual.

O diff tem teste standalone, fora da suíte padrão. Partindo da raiz:

```bash
cd DBA/database
python test_diff_campos.py
```

Formatação/lint rodam na raiz: `black --check .` e `flake8 .`; o CI fixa
`black==25.11.0` e `flake8==7.3.0`. Testes locais não confirmam completude da
coleta, aplicação de migrations ou comportamento do banco em produção.
