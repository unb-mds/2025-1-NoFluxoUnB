# Montador de Grade — regras de negócio

Como o Montador decide **o que entra na lista** de matérias (semeadura) e **o que
entra na grade** (solver). Rota: `frontend/src/routes/(protected)/planejamento/grade/`.

| Etapa | Onde mora |
|---|---|
| Semeadura (o que entra na lista) | `frontend/src/lib/services/grade-pool.service.ts` → `montarPoolRecomendado`, `candidatosModuloLivre`, `motivoParaNaoAdicionar` |
| Orçamento da semeadura | `gradeStore.orcamentoParaSemear` + `semear()` na rota |
| Montagem (o que entra na grade) | `frontend/src/lib/stores/grade.store.svelte.ts` → `construirEntradaSolver`, `montarAutomatico`, `montarOpcoes` |
| Solver | `frontend/src/lib/utils/horario-slots.ts` |
| Equivalências | `frontend/src/lib/types/equivalencia.ts`, `frontend/src/lib/utils/oferta-equivalencia.ts` |

---

## 1. Quem nunca é recomendado

Vale para a semeadura (obrigatórias, optativas e módulo livre) e para a adição
manual, que mostra o motivo em vez de aceitar calada.

- **Já concluída**, inclusive **por equivalência**: "cursou C e a tabela diz que
  X equivale a C" marca X como concluída (`getCompletedByEquivalenceCodes`).
- **Em curso** (entra pelo caminho próprio das matrículas, seção 3).
- **Equivalente de matéria já aproveitada**: se X está concluída ou em curso e a
  tabela diz que **R sozinha substitui X**, R não é recomendada, porque cursá-la
  não contaria de novo. Os substitutos são os mesmos da oferta por equivalência
  (`construirSubstitutosPorCodigo`):
  - só ramos `OU`: em "X ≡ R E S", R é metade do conteúdo e continua valendo;
  - só a direção registrada na tabela (a leitura inversa é inferência);
  - vale para obrigatórias, optativas e módulo livre.
- **Pré-requisito pendente** que não fecha nem com o que o aluno cursa agora
  (dependência *em curso* continua sendo recomendada).
- **Sem turma no período**: sem oferta não vira bloco na grade. Obrigatória nessa
  situação é avisada (`obrigatoriasSemOferta`); optativa não.
- **Fora da matriz** só entra como módulo livre, por busca com tema — o plano de
  formatura não injeta matéria de fora da matriz.

> **Limite conhecido:** só são carregadas as linhas de equivalência cuja origem
> está na matriz do aluno. "X ≡ R" com X fora da matriz não é detectado.

## 2. Ordem da semeadura

A lista é preenchida até o **limite de créditos** escolhido, nesta ordem:

1. **Matérias em curso** — sempre, mesmo sem oferta publicada.
2. **Obrigatórias pendentes** com turma, a mais atrasada (menor nível) primeiro;
   o semestre recomendado do plano de formatura só desempata.
3. **Optativas que ainda contam** — primeiro as *optatórias* (optativa que é
   pré-requisito de obrigatória pendente), limitadas pela carga que falta de cada
   natureza.
4. **Complemento da lacuna**: se ainda sobra crédito, entra o que mais couber da
   matriz, inclusive optativa além da carga exigida. Fica sempre depois das que
   contam e tem o menor peso no solver, então nunca toma o lugar de uma obrigatória.

Cada matéria só entra se cabe: tem turma num turno permitido, sem conflito com o
que já foi escolhido, e não estoura o limite.

### Orçamento (o que já está ocupado)

- Com **"Incluir matérias que já curso" ligado**, o crédito das matérias em curso
  é descontado uma vez (pela semeadura) e o horário delas bloqueia.
- **Desligado**, elas não ocupam crédito nem horário — exceto a disciplina
  **essencial**, que entra de qualquer jeito.
- As demais matérias já selecionadas ocupam crédito e horário.

### Lixeira

O que o aluno remove não volta sozinho, e "Limpar tudo" joga a lista inteira na
lixeira. Mas em **"Gerar opções"** (pedido explícito), se fora da lixeira não há
nada a trazer, a lixeira é ignorada. "Voltar ao início" zera a lixeira.

## 3. Montagem da grade (solver)

O solver maximiza a **soma dos pesos** das matérias que cabem. Os degraus são
separados por fator 1000, então nenhuma quantidade de um degrau desloca uma única
matéria do degrau de cima:

| Degrau | Peso | Quem |
|---|---|---|
| Em curso | 10¹² | Matrícula já feita (com o interruptor ligado) |
| Prioritária | 10⁹ | Estrela marcada pelo aluno |
| Obrigatória | 10⁶ | Obrigatória e optatória |
| Necessária | 10³ | Optativa / módulo livre cuja carga ainda falta |
| Saturada | 1 | Natureza já cumprida — só preenche buraco livre |

Dentro do mesmo degrau, a matéria de semestre mais baixo vale até 50% a mais
(`fatorAtraso`), sem nunca cruzar degrau.

- **Essencial**: tem peso dominante e entra em todas as opções se houver turma
  viável. Se não couber, o aviso diz o motivo real: sem turma com vaga, fora do
  turno, pré-requisito ou conflito com uma matéria específica.
- **Turma real**: matéria em curso entra na turma em que o aluno está matriculado
  (histórico do SIGAA), e fica travada.
- **Vagas**: turma sem vaga sobrando não entra na montagem automática
  (`vagas_sobrando` desconhecido conta como disponível). A turma real de quem já
  cursa vale mesmo lotada — a vaga já é dele.
- **Turnos**: só turmas inteiramente dentro dos turnos permitidos.
- **Turma travada**: a escolha manual é mantida.
- **Limite de créditos**: ao baixar o limite, as matérias saem na ordem inversa
  da escada acima (`ajustarParaLimite`).

### Estratégias (as três opções geradas)

Todas alocam o mesmo tanto de matéria por degrau; mudam só a forma da semana:

| Opção | Critério principal | Desempate |
|---|---|---|
| Menos dias | dias com aula | minutos de janela |
| Menos janelas | minutos de janela | dias com aula |
| Equilibrada | variância da carga diária | minutos de janela |

Opções idênticas são deduplicadas, então podem aparecer menos de três.

## 4. Análise da grade (nota 0–100)

`AnaliseGradePanel.svelte`: parte de 100 e desconta

- 4 pontos por hora de **janela** entre aulas no mesmo dia (intervalo de 10 min
  entre módulos não conta; buraco acima de 3 h é período livre, não janela);
- 8 por matéria que **não coube**;
- 10 se a carga passar do **limite**;
- 5 por **co-requisito** fora da grade.
