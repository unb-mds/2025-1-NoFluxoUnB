# Domínio UnB — Regras de Negócio

## Estrutura acadêmica
- Curso tem uma ou mais Matrizes (versões curriculares), identificadas por `curriculo_completo`
- Aluno pertence a uma Matriz específica — não ao curso genérico
- Matriz define: CH obrigatória exigida, CH optativa exigida, CH complementar exigida
- `nivel` em materias_por_curso: 0 = optativa, 1–10 = semestre esperado no fluxo padrão
- Registro em novo curso ocorre sempre na matriz **mais recente** à época do edital

## Tipos de matéria (tipo_natureza)
- Obrigatória: precisa cursar todas
- Optativa: precisa completar CH mínima, escolhe quais
- Complementar (Módulo Livre): CH mínima, fora do catálogo principal — **não conta para dupla diplomação**
- Estágio obrigatório: conta como obrigatória mas é **excluído do cálculo de 70%** na dupla diplomação

## Pré-requisitos
- `expressao_logica` jsonb suporta AND / OR
- Ex: "precisa de A OU B" → aluno com A satisfaz, aluno com B também satisfaz
- Co-requisito: deve cursar NO MESMO semestre, não antes
- Reprovação NÃO desbloqueia pré-requisito — só APR e CUMP desbloqueiam
- Trancamento NÃO desbloqueia pré-requisito

## Status de matéria no histórico
- APR = aprovado (conta para integralização, desbloqueia pré-requisitos)
- CUMP = cumprido por equivalência (conta, desbloqueia pré-requisitos)
- MATR = matriculado (não conta ainda, não desbloqueia)
- REP = reprovado (não conta, NÃO desbloqueia pré-requisito)
- TRANCADO = não conta, não desbloqueia

## Integralização — formatura
- Aluno forma quando: CH_obrigatória >= exigida E CH_optativa >= exigida E CH_complementar >= exigida
- Crédito UnB = 15 horas
- IRA: média ponderada por créditos, só matérias com nota

## Cálculo do percentual de integralização (usado em dupla diplomação)
Fórmula oficial da UnB:

```
X = (T - P) / (T - C - E)
```

Onde:
- T = Carga Horária Total Exigida pelo curso pretendido
- P = Carga Horária Total Pendente (do histórico simulado)
- C = CH de Atividades Complementares Exigidas
- E = Somatório das CH das disciplinas obrigatórias de estágio

**Importante:** Estágios e complementares são excluídos do denominador — o percentual mede só o núcleo acadêmico.

Exemplo: T=3840, P=3450, C=300, E=300 → X = 390/3240 = 12,03%

## Dupla Diplomação — requisitos
- Ser provável formando no curso atual: estar matriculado (status MATR) nas disciplinas
  que faltam para completar 100% da CH exigida do curso atual — isto é, se o aluno
  concluir tudo que está cursando agora, sua integralização chega a 100%.
- Integralizar ≥ 70% da CH do curso pretendido (usando fórmula acima, excluindo estágios e complementares)
- IRA ≥ 3,0
- Não ter ingressado no curso atual por dupla diplomação
- CH optativa considerada é limitada ao valor exigido pelo curso pretendido
- Componentes eletivos (módulo livre) **não contam** para o 70%

## Mudança de Curso — requisitos
- Integralizar todos os componentes obrigatórios dos dois primeiros períodos do curso atual
- Integralizar ≥ 360h em obrigatórias ou optativas do curso pretendido
- Classificação por Média Ponderada das menções em obrigatórias/optativas do curso pretendido
- Desempate: maior CH obrigatória, maior CH total, maior IRA
- Mudança de curso é concedida uma única vez
- Ao mudar, o aluno renuncia a vaga atual automaticamente

## Oferta de turmas
- Turmas mudam todo semestre — nunca assumir que oferta futura repete a atual
- Formato de horário: "46T23" = dias 4 e 6 (qua/sex), turno T (tarde), horários 2 e 3
- Dias: 2=seg, 3=ter, 4=qua, 5=qui, 6=sex, 7=sab
- Turnos: M=manhã (08-12), T=tarde (14-18), N=noite (19-23)

## Equivalências
- Uma matéria pode equivaler a outra de matriz diferente
- `expressao_logica` jsonb — mesma estrutura dos pré-requisitos
- Matéria cumprida por equivalência conta como APR para fins de pré-requisito

## Particularidades importantes
- Aluno pode estar em matriz antiga mesmo que curso tenha versão nova
- Mesmo código de matéria pode ter CH diferente em matrizes diferentes
- Matéria pode ser obrigatória numa matriz e optativa em outra
- Tempo máximo de permanência no novo curso é contado a partir do ingresso no curso original
- Matrícula em componentes após mudança depende de vagas disponíveis — não é garantida