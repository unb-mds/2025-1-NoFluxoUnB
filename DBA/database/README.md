# DBA/database — sincronização com Supabase

Scripts de leitura/escrita do catálogo e calendário a partir de `DBA/dados`.
Guia revisado contra o código em 2026-10-07. A presença de script ou SQL não
confirma o estado do banco vivo. Dossiê e lacunas de schema:
[data-ingestion-and-schema.md](../../docs/kb/subsystems/data-ingestion-and-schema.md).

## Ambiente e comandos

Partindo da raiz, com ambiente virtual ativo:

```bash
python -m pip install -r DBA/database/requirements.txt
cd DBA/database
```

`config.py` procura o primeiro `.env` existente em `backend/`, raiz do repo,
diretório corrente e `DBA/`, nessa ordem. O carregamento padrão do dotenv
preserva variáveis já definidas no ambiente. Defina `SUPABASE_URL` para o alvo
correto: o código tem um URL padrão. A chave é selecionada nesta ordem:
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_KEY`.
Não há chave hardcoded nem fallback para `SUPABASE_ANON_KEY` neste módulo.

O guard recusa chave ausente, prefixo `sb_publishable_` e formatos desconhecidos;
aceita `sb_secret_` ou prefixo JWT legado `eyJ`. Valida formato, não role/validade
de JWT. Nunca versionar credenciais.

Os cinco scripts aceitam `--dry-run`: não persistem a carga, mas inicializam
cliente e leem o banco. Não são simulações offline. Importar módulos de ingestão
também inicializa configuração/cliente; para testes puros, use os helpers
`expressao_parser` e `diff_utils`.

Exemplos de inspeção, executados de `DBA/database/`:

```bash
python 01_insert_cursos_matrizes_materias.py --dry-run
python 02_insert_pre_requisitos_equivalencias.py --dry-run
python 03_insert_turmas.py --dry-run
python 05_insert_calendario_academico.py --dry-run
```

Remover `--dry-run` habilita escrita. O 01 inclui normalização estrutural de IDs
legados; o 04 exclui linhas. Nenhum comando foi executado nesta revisão.

## Contratos do domínio

| Campo | Contrato aplicado pelo código |
|---|---|
| `cursos.id_curso` | Inteiro antes de `/`: `8150/-4` → `8150`. Sem offset de turno. O schema deve permitir IDs explícitos; o baseline usa `bigint NOT NULL` sem IDENTITY. |
| `cursos.turno` | Texto em maiúsculas vindo do JSON/nome do arquivo; separado de `curriculo_completo`. |
| `matrizes.curriculo_completo` | Texto `codigo/versao - periodo`, ex. `8150/-4 - 2014.1`, sem DIURNO/NOTURNO. |
| `matrizes.versao` / `ano_vigor` | Texto do currículo/período; com `id_curso`, forma a correspondência alternativa. Não são campos do diff. |
| `materias.codigo_materia` | Código para resolver ID nas relações e ofertas. |
| `materias_por_curso.tipo_natureza` | Inteiro: `1` se `natureza` contém “optativa”; `0` nos demais casos, inclusive ausência. |
| `materias_por_curso.nivel` | Inteiro inicial do nome do nível; optativas, ausência ou nome não reconhecido → `0`. Zero é válido. |
| Cargas horárias (`ch_*`, `carga_horaria`) | Horas inteiras, não créditos. `ch_to_int` aceita inteiro ou texto inteiro com sufixo `h/H`; falha de conversão → `None`. No diff, só valor novo positivo altera CH. |
| `matrizes.formatura` | JSON não vazio vindo de `conclusao` do dataset; sincronizado pelo diff. |
| `expressao_logica` | JSONB: código único ou árvore com `operador` igual a `E`/`OU` e lista recursiva `condicoes`. |

O 01 normaliza currículo numérico sem `/` para versão `/1`. Nome do curso passa
para maiúsculas sem acentos. Matérias e associações usam IDs gerados no baseline:
`id_matriz`, `id_materia`, `id_materia_curso`, `id_pre_requisito`,
`id_co_requisito`, `id_equivalencia` e `id_turmas` são `bigint`. Matéria/matriz
ligam tabelas por FK. O 02 escreve expressão inteira e `id_materia`; não
preenche `id_materia_requisito`/`id_materia_corequisito` individuais.

`get_or_create_matriz` converte as entradas de `prazos_cargas`:

| Entrada JSON | Campo do banco |
|---|---|
| `ch_obrigatoria_total` | `ch_obrigatoria_exigida` |
| `ch_optativa_minima` | `ch_optativa_exigida` |
| `total_minima` | `ch_total_exigida` |
| `ch_complementar_minima` | `ch_complementar_exigida` |
| `carga_horaria_maxima_componentes_eletivos` | `ch_maxima_componentes_eletivos` |

## Operações de ingestão

### 01 — cursos, matrizes, matérias e vínculos

Entrada: `DBA/dados/estruturas-curriculares/*.json`, com apoio dos detalhes em
`DBA/dados/materias`. Insere ausentes e corrige existentes via caches e
`flush_updates`. Curso corresponde primeiro por ID e depois nome/turno/tipo;
matriz por currículo completo ou curso/versão/ano; matéria por código;
vínculo por matriz/matéria.

`diff_utils.diff_campos` preenche/corrige sem apagar com fonte vazia:

- Curso: nome, tipo e turno não vazios corrigem diferenças.
- Matriz: CH positiva e `formatura` não vazia corrigem diferenças.
  `get_or_create_matriz::_update_row` também atualiza `status` recebido
  não-`None` e diferente; normaliza currículo antigo com sufixo de turno na
  correspondência alternativa.
- Matéria em cache: nome só preenche vazio; CH positiva, ementa e departamento
  não vazios corrigem diferenças. Na busca fora do cache, ementa/departamento
  não vazios também corrigem diferenças, mas CH só preenche atual ausente/zero.
- Vínculo: nível e natureza corrigem diferenças; zero é válido.

Antes da carga, `normalizar_cursos_id_legado` trata IDs `>=100000` como legado
`codigo_base+100000`: tenta criar curso base, reatribuir FKs de matrizes e
equivalências e excluir curso legado. Algumas falhas de FK são capturadas; a
mensagem de conclusão não garante normalização completa. Não há transação única.

### 02 — pré/co-requisitos e equivalências

Entrada: `DBA/dados/materias/turmas_depto_*.json`. Insere relações ausentes nos
caches. Chave de pré/co-requisito: matéria + expressão original. Equivalência
acrescenta curso/currículo. Mudança de expressão pode criar outra linha; este
caminho não atualiza nem exclui a relação antiga.

`expressao_parser.parse_expression` normaliza códigos/espaços/parênteses,
aplica precedência `E` antes de `OU` e achata operadores iguais. Erros de parse
são contados; matérias não resolvidas são ignoradas. O tokenizer pula caracteres
não reconhecidos: o parse não é validação textual sem perdas.

Equivalência genérica omite curso/currículo. A específica conserva currículo,
resolve curso por matriz ou código existente e converte `AAAA.1`/`AAAA.2` para
1º de janeiro/1º de julho em `data_vigencia`. Pode conservar currículo mesmo
quando curso não foi resolvido; não presumir FK preenchida em todo caso.

### 03 — upsert de turmas

Entrada: `DBA/dados/dados_finais_teste_p_depto_20/turmas_depto_*.json`.
`normalizar_linha_turma` resolve matéria pelo código, exige turma/período,
limpa espaços e converte vagas para inteiro ou `None`. Recalcula
`vagas_sobrando = vagas_ofertadas - vagas_ocupadas` quando ambos existem.
Grava timestamp UTC `last_updated_at`. O upsert usa a chave única
`(id_materia, turma, ano_periodo)` (`uq_turmas_oferta`), incluindo dados atuais
de docente/horário/local/vagas. Não exclui ofertas ausentes.

Arquivos inválidos, matéria sem FK e linhas sem chave são ignorados. Erros de
lote recebem fallback por linha; falhas parciais são relatadas sem garantir exit
code de falha. Sem arquivos, o comando retorna normalmente.

### 04 — exclusão de turmas não tocadas na rodada

`listar_turmas_obsoletas` seleciona só o `--ano-periodo` informado com
`last_updated_at < run_started_at`; `apagar_turmas` exclui IDs selecionados.
O início precisa vir de `--run-started-at` ou `RUN_STARTED_AT` e corresponder ao
timestamp registrado **antes** da coleta/03. Outros períodos ficam fora.

Exemplo de inspeção; valores devem corresponder à rodada real:

```bash
python 04_reconciliar_turmas.py --ano-periodo 2026.1 --run-started-at 2026-07-16T03:00:00Z --dry-run
```

Não há verificação de completude da coleta/upsert antes de excluir. Uma rodada
parcial pode deixar ofertas válidas com timestamp antigo; sucesso de comando
não basta para concluir que foram canceladas. É uma operação destrutiva.

### 05 — calendário acadêmico

Entrada padrão: `DBA/dados/calendario-academico-graduacao.json`; `--json CAMINHO`
permite outra fonte. Valida `AAAA.[12]`, ano inteiro consistente e fim posterior
ao início; converte datas `DD/MM/YYYY` para ISO. Upsert por `periodo` quando há
período novo ou datas alteradas. `texto_bruto` sozinho não dispara atualização.
Não envia `limite_matricula_25pct`, que o contrato espera como coluna gerada.
Linhas inválidas são puladas; nenhuma válida aborta.

## Schema e verificação

O export em `backend/docs/` e
`supabase/migrations/latest_init_from_export.sql` são de 2026-07-16. O código
atual também exige `matrizes.status`, `ch_maxima_componentes_eletivos`,
`formatura` e `calendario_academico`, ausentes desse baseline. Workflows esperam
RPC/calendário mais recentes; o export antigo ainda calcula período por mês.
Não aplicar o baseline como retrato atual do banco. Migrations em
`supabase/migrations/` são aplicadas manualmente; aplicação não foi verificada.

`cd backend && npm run export-schema`, partindo da raiz, lê banco configurado e
reescreve documentação **e** baseline local (`export_schema.ts::exportSchema`,
bloco `if (true)`). A rotina não foi executada nesta revisão.

Para validar helpers sem Supabase: de `DBA/database/`, execute
`python test_diff_campos.py`. Suíte de parser/PDF e limites:
[DBA/README.md](../README.md). Testes locais ficam separados de completude dos
datasets, migrations aplicadas e aceitação em produção.
