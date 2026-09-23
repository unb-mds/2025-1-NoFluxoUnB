# Plano de implementação — Simulação de Dupla Diplomação

Status: planejado, não implementado. Branch de trabalho: `modulo_dupla_diplomacao`.

## Contexto

Regras de negócio já documentadas em [`unb-domain.md`](./unb-domain.md#dupla-diplomação--requisitos):

- Ser provável formando no semestre corrente.
- Integralizar ≥ 70% da CH do curso pretendido, pela fórmula oficial `X = (T - P) / (T - C - E)`,
  onde `T` = CH total exigida, `P` = CH total pendente, `C` = CH complementar exigida,
  `E` = CH de disciplinas obrigatórias de estágio.
- IRA ≥ 3,0.
- Não ter ingressado no curso atual por dupla diplomação.
- CH optativa considerada é limitada ao valor exigido pelo curso pretendido.
- Complementares (módulo livre) não contam para o 70%.

Esse módulo é uma variação do módulo já existente de **Simulação de Troca de Curso**
(`frontend/src/lib/services/mudanca-curso-requisitos.service.ts` +
`frontend/src/lib/services/integralizacao.service.ts` +
`frontend/src/routes/meu-fluxograma/[courseName]`), que já resolve o problema central
de "simular o histórico do aluno contra a grade de outro curso". A tabela abaixo resume
o que muda:

| Aspecto | Troca de Curso (existente) | Dupla Diplomação (novo) |
|---|---|---|
| Requisito na origem | obrigatórias dos períodos 1–2 | nenhum (aluno é formando) |
| Requisito no destino | ≥360h obrigatória+optativa (bruto) | ≥70% via `X=(T-P)/(T-C-E)` |
| Complementares | contam | não contam |
| Estágio obrigatório | conta | excluído do denominador |
| IRA | só desempate | gate de elegibilidade (≥3,0) |
| Optativa | irrestrita | limitada ao exigido no destino |
| Status do aluno | qualquer semestre | precisa ser provável formando |

## O que será reutilizado sem alteração

- `fluxogramaService.getAllCursos()` / `getCourseDataByCurriculoCompleto()` — carregamento de curso/matriz destino.
- `getIntegralizacao()` de `integralizacao.service.ts` com `recalcularPorDisciplinas: true` — motor de casamento de disciplinas do histórico do aluno contra a grade do curso destino. Ele já devolve `realizado.chObrigatoria/chOptativa/chComplementar/chTotal` e `exigido.*`, que são os insumos de `T` e do "realizado" usado para calcular `P`.
- `getCompletedByEquivalenceCodes()` de `types/equivalencia.ts` — expansão de equivalências (passe único, já testado em `equivalencia.test.ts`).
- Padrão de rota `/meu-fluxograma/[courseName]?matriz=...` e a variável derivada `eSimulacaoOutroCurso` em `+page.svelte` — mecanismo de "ver meu fluxograma como se fosse outro curso".
- Padrão visual de `RequisitosMudancaCursoBanner.svelte` (bloco "atende/não atende requisito X").
- Padrão de modal `MudancaCursoModal.svelte` para escolher o curso destino.

## O que precisa ser novo

1. **Separar CH de estágio obrigatório na grade.** Hoje `materias_por_curso.tipo_natureza` só distingue obrigatória (0) / optativa (1); não há sinalização de "estágio obrigatório" isolável. Precisa decidir a fonte: (a) nova coluna/flag no banco, ou (b) heurística por nome/código da disciplina (ex.: contém "ESTÁGIO"). Recomendo (b) para não depender de migração de banco no primeiro corte, com um util isolado e testável, e documentar a limitação.
2. **`dupla-diplomacao-requisitos.service.ts`** (novo arquivo, mesmo diretório de `mudanca-curso-requisitos.service.ts`):
   - Recebe `dadosFluxograma`, `integralizacaoDestino` (resultado de `getIntegralizacao`) e a grade do curso destino (para achar CH de estágio e de complementar exigida).
   - Calcula `T`, `C`, `E` a partir de `integralizacaoDestino.exigido` + util de estágio do item 1.
   - Calcula `P` = CH pendente = `T - realizado` restrito ao núcleo acadêmico (obrigatória + optativa, limitada ao exigido, excluindo estágio).
   - Aplica `X = (T - P) / (T - C - E)`, retorna `pctIntegralizacaoDupla` e `atende70porcento: X >= 0.70`.
   - Aplica gate de IRA: `atendeIra: dadosFluxograma.ira >= 3.0`.
   - Aplica gate "é provável formando": ver item 3.
   - Retorna um objeto `AvaliacaoDuplaDiplomacao` agregando os três gates + `elegivel: boolean`.
3. **Heurística/critério de "provável formando".** Não existe hoje. Opções: (a) checar se todas as obrigatórias da matriz de origem estão concluídas e falta só um resíduo pequeno de optativa/complementar; (b) usar campo explícito se existir no perfil/histórico. Precisa decisão de produto — meter como pergunta aberta no PR/ticket, não travar a primeira versão nisso (pode entrar como aviso não bloqueante inicialmente).
4. **Checagem "não ingressou por dupla diplomação antes".** Não há esse dado hoje no schema (`dados_users` / `historicos_usuarios`). Primeira versão: omitir o gate e deixar como aviso textual manual (o PDF do histórico normalmente não traz essa informação). Não modelar no banco até confirmar necessidade real.
5. **Teto de optativa = exigido no destino.** Pequeno ajuste no cálculo de `P`/`realizado.chOptativa` usado pelo serviço novo: `min(realizado.chOptativa, exigido.chOptativa)` — não mexe em `integralizacao.service.ts` genérico (usado por troca de curso), o clamp fica local ao serviço de dupla diplomação.
6. **UI**:
   - Clonar `MudancaCursoModal.svelte` → `DuplaDiplomacaoModal.svelte` (mesma lista de cursos, texto/CTA diferentes).
   - Clonar `RequisitosMudancaCursoBanner.svelte` → `RequisitosDuplaDiplomacaoBanner.svelte`, mostrando os 3 gates (70%, IRA, formando) com o valor calculado de cada um.
   - Entrypoint: reutilizar a mesma rota `/meu-fluxograma/[courseName]`, adicionando um query param (`?modo=dupla` ou similar) para o banner saber qual serviço de requisitos chamar, já que a rota e a detecção de simulação (`eSimulacaoOutroCurso`) são as mesmas.
7. **Testes**:
   - `dupla-diplomacao-requisitos.test.ts` (mesmo padrão de `equivalencia.test.ts`): casos de aceite/rejeição por 70%, por IRA, e o exemplo já documentado em `unb-domain.md` (`T=3840, P=3450, C=300, E=300 → X=12,03%`).
   - Teste de clamp de optativa (realizado > exigido não deve inflar o percentual).
   - Teste do util de detecção de estágio (heurística por nome/código).

## Sequenciamento sugerido

1. Util de identificação de CH de estágio obrigatório na grade (isolado, testável).
2. `dupla-diplomacao-requisitos.service.ts` + testes unitários (usa dados mockados de `IntegralizacaoResult`, sem precisar de UI ainda).
3. UI (modal + banner) plugada na rota existente.
4. Validação manual: rodar `getIntegralizacao` real contra 1–2 combinações de curso reais e comparar `X` calculado à mão.

## Decisões em aberto (levar para o usuário/PO antes de codar 3 e 4)

- Como definir "estágio obrigatório" na grade sem migração de banco — heurística por nome é aceitável?
- Como definir "provável formando" — travar o módulo ou só avisar?
- Vale a pena já guardar no banco se o aluno usou dupla diplomação antes, ou fica de fora da v1?
