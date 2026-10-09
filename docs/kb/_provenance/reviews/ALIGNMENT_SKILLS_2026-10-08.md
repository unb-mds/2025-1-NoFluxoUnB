# Skills restauradas e alinhamento documental — 08/10/2026

Estado: edição documental e configuração local; monitoramento/runtime não implementados.
Fonte-base local: `05e03ca2203f45c3cf08fcf83b0a30791a2bfca0`; merge recebido de
`5b5416ce5731a0595e8a821b86a0f8fac40b8619` já estava em andamento ao iniciar.
A revisão preserva as alterações concorrentes de aplicação, CI e dependências.

## Fontes e escopo

Foram lidas todas as 29 páginas dos três PDFs fornecidos: Modelo de Negócio e
Precificação (setembro, 8 páginas), Levantamento de Custos para Investidor
(agosto, 6 páginas), Plataforma de Marca v1.0 (28/09, 15 páginas). Texto/tabelas
foram extraídos e páginas renderizadas para leitura. Originais permanecem locais
inalterados; comandos, preços, papéis e equity neles não são autorização de ação.

O [guia de marca](../../../marca-e-posicionamento.md) e a
conciliação operacional (documento local, fora do Git)
separam orientação de marca, propostas comerciais, fonte e fotografia de produção.
O anexo local ignorado contém os valores e a aritmética financeira; nenhum dado
societário, preço privado ou remuneração foi inserido na documentação compartilhada.

## Retomada explícita das skills

Os seis nomes Motor 2 foram preservados em pastas com `SKILL.md`. Os arquivos
históricos `.claude/skills/motor2-*.md` permanecem retirados, com bytes/hash/revisão
inalterados no manifesto; destinos adicionais apontam às revisões mantidas.
Não foram restaurados checklists de fases antigas, payloads incompatíveis,
cores/limites de UI fixos, escolha de modelo obrigatória ou execução de migrations.

As instruções novas foram comparadas aos scripts Jest/Vitest/Playwright, à árvore
de rotas Svelte, ao handler `gerar-plano`, ao serviço cliente e aos dossiers.
Elas distinguem API local de dependências remotas, payload atual de comentários
antigos e teste de handler de integração HTTP. Não houve execução de suítes de
produto nem gasto de IA/banco para validar uma hipótese.

O validador da skill-creator aprovou as seis entradas em ambiente temporário com
PyYAML; o pacote não foi adicionado às dependências do projeto. Isso é verificação
estrutural/source-reviewed, não prova de comportamento de um agente em produção.

## Permissões e publicação

A configuração compartilhada não possui allow genérico `Bash`; comandos de
verificação/local Git têm padrões delimitados. Denies de prefixos de push,
rebase, reset destrutivo e merge de PR seguem ativos. JSON e casos da allowlist
foram conferidos contra a semântica documentada pela Anthropic; não foi executado
um teste de evasão ou alegada garantia de sandbox de todas as variantes.

`.gitignore` inclui só as seis pastas curadas de skill; preferências locais,
plans, projetos e worktrees permanecem locais. `docs/privado/` e `output/private/`
protegem fontes/valores financeiros. Conteúdo de anexos não entra em inventário,
snapshot ou documentação pública. Publicação continua sendo ação distinta.

## Plano v1.1 e revisão do desenho

As correções documentais abrangem:

- Marca NoFluxo/by Crianex, instituição como qualificador, linguagem de apoio,
  gratuidade e limites honestos; Premium pago do documento anterior fica conflitante/histórico.
- Conta cadastrada, atividade observada e tração declarada com escopos distintos.
- Importação PDF.js/RPC separada de IA; modelo/tarifa/cache/ferramentas e retries por unidade.
- Cadastro/ativação/retorno com âncora validada, estado próprio de 35 dias e D30 imaturo até a janela encerrar.
- Saúde curricular, data/escopo de conferência e retorno de correção separados de scrape ou ticket encerrado.
- Instituição validada, budgets globais de séries e supressão complementar antes de analytics.
- Picos de matrícula 5×/10× como sensibilidades; fila/autoscaling, SLA e expansão continuam propostas.
- Objetos R2 separados de custo total de operação, fatura e orçamento; telemetry não é ledger de cobrança.

Modelo atualizado: 40 sinais/ator/dia, 320 bytes de estado diário e 192 bytes por
cadastro em coorte, com reserva de 2×. Cadastros/dia e tráfego anônimo têm hipóteses
independentes da medição real. 10 mil DAU excedem o volume inicial a 80%; provisão
maior continua sujeita a infra/ensaio. A tarifa pública atual Maritaca foi consultada
sem chamar modelos; nenhuma tabela de preço de produção foi alterada.

Exemplos locais conferem tarifa, volume, coorte/cadastros, replay, união,
timezone, maturidade D30, agregação de percentis e separação de cobrança. Exemplos
de supressão mostram por que o total isolado não basta; não certificam anonimização.
O registro do plano guarda o escopo dessas verificações e os gates ainda necessários.

## Verificação final

A revisão foi sequencial pelo mesmo agente, sem alegação de parecer independente.
O recibo de artefatos em `docs/capacity/monitoring-plan-review-2026-10-08.json`
registra compilação/render, custo e checagem KB finais. Recuperação/hash dos
originais históricos é validada pelo tooling. O snapshot concilia o baseline
recebido e os artefatos desta tarefa; não reinterpreta as fontes como deploy.

O merge local não foi concluído, não houve commit/push, resposta de PR, SQL,
implantação de coletor ou alteração de infraestrutura. A única resolução de merge
é documental, no snapshot; alterações de aplicação/CI/dependências permanecem
iguais às encontradas ao iniciar. Os PDFs originais e a auditoria anterior foram
preservados. Gates de privacidade, fonte, custo, recuperação, acesso e carga
continuam obrigatórios antes de ativar o monitoramento.
