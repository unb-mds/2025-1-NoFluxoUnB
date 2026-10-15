e a fórmula : Fórmula oficial X = (T - P) / (T - C - E): mede o núcleo acadêmico (obrigatórias + optativas, limitada ao exigido), excluindo complementares e estágio obrigatório do denominador . Daonde você tirou ela? Porque ela exclui estágio obrigatorio do denominador?

  Ran 4 shell commands

Fui direto ao ponto errado antes — deixa eu ser preciso sobre a origem.

De onde vem: não inventei a fórmula. Ela já estava em docs/unb-domain.md, adicionada antes desta sessão pelo Felipe Pedroza (commit 890be47e, "fix: Fix buscarMateriasFaltantes..." — a doc entrou de carona nesse commit). O próprio docs/dupla-diplomacao-plano.md que você me pediu pra seguir aponta explicitamente pra essa seção logo no início ("Regras de negócio já documentadas em unb-domain.md#dupla-diplomação--requisitos"). Eu só implementei o que já estava escrito lá — não verifiquei contra uma resolução oficial da UnB (CEG/edital) de forma independente.

Texto exato da doc (docs/unb-domain.md:35-50):
Fórmula oficial da UnB:
X = (T - P) / (T - C - E)

Onde:
- T = Carga Horária Total Exigida pelo curso pretendido
- P = Carga Horária Total Pendente (do histórico simulado)
- C = CH de Atividades Complementares Exigidas
- E = Somatório das CH das disciplinas obrigatórias de estágio

Importante: Estágios e complementares são excluídos do denominador —
o percentual mede só o núcleo acadêmico.

Por que excluir estágio do denominador — minha interpretação, não uma citação de norma: a doc não cita o número da resolução/artigo, só afirma o fato. O raciocínio que faz sentido (mas que eu não confirmei em texto oficial) é: X tenta medir "quanto do conteúdo acadêmico específico do curso pretendido o aluno já cobriu", pra decidir se ele já tem base suficiente pra cursar os dois cursos em paralelo. Estágio obrigatório é uma CH fixa e grande cumprida via prática profissional, não via disciplinas — incluí-la no denominador faria o percentual variar conforme o aluno já fez ou não o estágio (algo que não reflete domínio de conteúdo acadêmico, só timing administrativo). Complementares são excluídas pela mesma lógica: podem ser cumpridas com qualquer atividade fora da grade, sem relação com o curso pretendido especificamente. Removendo os dois do denominador, X vira uma razão só sobre obrigatórias+optativas — a parte que realmente indica sobreposição de conteúdo entre os dois cursos.

Ponto importante: essa fórmula decide elegibilidade real de aluno pra dupla diplomação — vale a pena confirmar com quem escreveu unb-domain.md (ou com a resolução/edital oficial da UnB) se esse texto está correto antes de tratar isso como definitivo, em vez de confiar só na minha implementação em cima da doc do projeto.