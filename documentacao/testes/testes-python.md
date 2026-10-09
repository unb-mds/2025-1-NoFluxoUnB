# Testes Python — dados, parser legado e utilitários de IA

As suítes têm escopos distintos. A configuração principal de dados está em `DBA/tests/pytest.ini`; os testes dos utilitários do serviço de IA ficam em `mcp_agent/`. Este guia descreve o código revisado em 2026-10-07 e não publica uma medição de cobertura.

## Suíte `DBA/tests/`

| Arquivo | O que exercita | Limite |
| --- | --- | --- |
| `test_expressao_parser.py` | Parser de expressões lógicas importado da área DBA | Entradas e propriedades das asserções existentes |
| `test_scraping_equivalencias.py` | Helpers definidos dentro do próprio arquivo: limpeza de texto/acentos e extração de HTML sintético | Não importa o scraper de produção; não certifica a coleta real do SIGAA |
| `test_upload_pdf.py` | Cliente de teste Flask do `DBA.parse_pdf.pdf_parser_final`, incluindo ausência de arquivo | O caso de upload bem-sucedido está marcado `unittest.skip` e depende de fixture referenciada |

O Flask permanece nesse parser legado e em seus testes. O upload atual do produto é processado no navegador pelo frontend com `pdfjs-dist`, seguido da RPC de casamento de disciplinas; não é um request para esse Flask.

`conftest.py` ajusta importação dos módulos. O `pytest.ini` define relatórios HTML/XML/terminal e mede `expressao_parser` e `DBA.parse_pdf.pdf_parser_final`, com piso `--cov-fail-under=45`. A configuração é a fonte do piso; os percentuais descritos em comentários antigos não são uma medição atual.

## Utilitários do serviço de IA

- `mcp_agent/test_tool_call_utils.py`: funções puras que extraem tool calls de texto/JSON e normalizam termos de matéria.
- `mcp_agent/test_sabia_utils.py`: parsing de recomendações, códigos válidos, notas, termos de busca, uso de embeddings e opções/timeouts do cliente Maritaca.

Esses testes não demonstram chamadas bem-sucedidas aos modelos, disponibilidade do FastAPI ou busca no Supabase vivo. O serviço atual é FastAPI (`mcp_agent/api_producao.py`), apesar do nome histórico da pasta. O job Pytest principal do CI roda em `DBA/tests/`; não coleta automaticamente os arquivos `mcp_agent/test_*.py`.

## Execução

Use um ambiente Python com as dependências da área instaladas. A partir da raiz:

```bash
python -m pip install -r DBA/tests/requirements.txt pytest pytest-cov pytest-mock
(cd DBA/tests && python -m pytest)
(cd mcp_agent && python -m pytest test_tool_call_utils.py test_sabia_utils.py)
```

As funções puras também possuem runner direto:

```bash
(cd mcp_agent && python test_tool_call_utils.py)
(cd mcp_agent && python test_sabia_utils.py)
```

Para cobertura DBA, o comando padrão já lê o `pytest.ini`. Não acrescente `--cov=.` dentro de `DBA/tests/`: isso adiciona o diretório dos próprios testes como alvo e altera o significado da métrica.

O CI instala Tesseract e Poppler para o ambiente PDF/OCR. A disponibilidade de fixtures e de dependências é distinta da aprovação de cada caso.

## Qualidade estática

O workflow principal executa, na raiz, Black 25.11.0 e Flake8 7.3.0:

```bash
black --check .
flake8 .
```

Formatação/lint aprovados não demonstram correção do parser, scrape real ou integridade dos dados ingeridos. Consulte [pipeline](pipeline-ci.md) e [métricas](cobertura-metricas.md) para a divisão dos checks.
