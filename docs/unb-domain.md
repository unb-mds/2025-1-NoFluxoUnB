# Domínio acadêmico representado na implementação

Esta página descreve o modelo e cálculos encontrados no checkout, não regras oficiais
validadas de editais da UnB. Decisões de matrícula, mudança de curso, dupla diplomação
ou formatura exigem conferência institucional; a aplicação oferece simulações.

## Curso, matriz e disciplinas

`cursos` e `matrizes` são entidades distintas. `curriculo_completo` identifica a versão
curricular consumida por vários serviços; natureza/nível estão na associação
`materias_por_curso`, não são propriedades universais de um código de disciplina.
A ingestão atual mapeia natureza optativa para `tipo_natureza=1` e demais casos para 0;
`nivel=0` é válido. Não reduzir todos os requisitos de CH a três categorias universais:
os consumidores também leem campos de eletivas/formatura cuja disponibilidade depende
do schema instalado.

Os contratos de carga horária, IDs e expressões são detalhados no
[guia de dados](../DBA/database/README.md) e no [dossier de schema](kb/subsystems/data-ingestion-and-schema.md).

## Histórico real versus projeção

APR/CUMP são tratados como cumprimento em consumidores revisados. REP/trancamento
não provam aprovação. MATR descreve matrícula em curso, mas o Motor 2 v2 projeta sua
aprovação para organizar semestres futuros. Portanto a afirmação universal
“MATR nunca desbloqueia” não descreve o planejador. A projeção não é integralização
confirmada e pode precisar de revisão quando o resultado acadêmico mudar.

[Motor2](motor2.md) e [backend](kb/subsystems/backend-api-and-motor2.md) explicam
cumpridas/equivalências, passe único, semestre em curso, slots e fallbacks.
Co-requisitos são tentados juntos, mas o fallback SOLO impede uma garantia universal.

## Integralização e simulação

`frontend/src/lib/services/integralizacao.service.ts` e controllers/serviços backend
calculam exigências e progresso com dados da matriz/histórico. A fórmula antiga
rotulada “oficial”, a omissão de campos eletivos e o checklist binário de graduação
foram removidos: não havia verificação normativa atual nessa documentação.
Conversões de 15h por crédito usadas na implementação não substituem a CH real quando
o algoritmo a conserva. Não usar percentual da UI como certificado de elegibilidade.

## Oferta e horários

`frontend/src/lib/utils/sigaa.ts` e parsers de slots implementam leitura de códigos
SIGAA; consulte a fonte e testes para a correspondência exata de slots, inclusive
combinações e horários textuais. As faixas genéricas antigas de manhã/tarde/noite
não correspondiam a todos os slots implementados e foram removidas.
Oferta atual vem de dados por período; não assumir repetição futura nem disponibilidade
no SIGAA a partir de uma sugestão do planejador.

Veja [frontend](kb/subsystems/frontend-and-academic-planning.md),
[backend](kb/subsystems/backend-api-and-motor2.md) e [IA](kb/subsystems/darcy-ai-orchestration.md)
para os contratos efetivos e limites de evidência.
