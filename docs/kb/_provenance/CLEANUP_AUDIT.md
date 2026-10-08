# Limpeza autorizada da documentação

Solicitação explícita em 2026-10-07; rechecagem final em 2026-10-08. Fonte Git de origem:
`c57fb02cc1b2ea3dd920a2566d01b66c6ef7f7a7`, branch `feat/new-docs`, mudanças locais.

## Árvore atual e proveniência

Foram retirados 42 documentos obsoletos: 29 planos originais, 6 guias task-specific Motor 2,
o guia MCP/stdin Sabiá,2 guias legados backend, o panorama LaTeX, o backlog frontend
superado e 2 planos de migração Kubernetes da arquitetura aposentada.
[document-retirement.csv](document-retirement.csv) identifica cada caminho, original Git,
SHA-256, tamanho, motivo, autorização e destino canônico. Não é pasta de arquivo com
instruções antigas: o conteúdo é recuperável no Git por revision:path.

[document-inventory.csv](document-inventory.csv) contém 271 registros: 229 arquivos atuais
sob a seleção documentada e 42 tombstones. A ampliação de 3 linhas cobre templates de
ambiente da raiz/frontend/backend, anteriormente fora do catálogo. O ledger inclui
artefatos/bins de evidência; não declara que todos foram renderizados ou executados.
[plan-disposition.csv](plan-disposition.csv) contém 29 planos retirados e 1 README atual.

## Correções em documentos mantidos

READMEs frontend/backend/IA/DBA, contribuidores e Docker foram alinhados com código,
comandos e variáveis realmente consumidas. Guias de infra agora diferenciam helpers
reutilizáveis do deploy NoFluxo; links a serviços/setup ausentes e alegações de cluster
instalado foram removidos. O template backend usa placeholders e a porta Python 8000.

Entradas Motor 2/chat/domínio/overview foram substituídas por contratos curtos e links
canônicos. Impersonação explicita opt-in backend e gate de build DEV. A política de
segurança não inventa confidencialidade de draft PR nem canal privado habilitado.
Guias públicos arquitetura/testes usam a implementação/configuração atual, sem totais
antigos ou promessa de execução/aceite. Atas, estudos e evidência exploratória datada
continuam sendo história; estudos são explicitamente separados da stack atual.

Os dossiers foram reconciliados com essa limpeza: não acusam READMEs já corrigidos
nem linkam arquivos removidos. A arquitetura inclui geração Maritaca direta Node e
busca/recomendação Python. Limites de fonte, algoritmo, schema e produção permanecem.

## Checagem e revisão

[SECOND_REVIEW.md](reviews/SECOND_REVIEW.md) contém a nova revisão independente,
achados e rechecagem. O checker valida retiradas contra objetos Git originais, falha
para exclusão sem autorização/proveniência, divergência de hash e restauração silenciosa.
Os 26 testes locais do tooling incluem casos adversariais e staging de exclusões em
repos temporários. Snapshot renovado somente depois da revisão dos documentos.
Resultados finais efetivamente executados estão em [FINAL_REVIEW.md](reviews/FINAL_REVIEW.md).

Sem deploy, push, merge, SQL aplicado, scraping ou chamadas pagas. Runtime preservado;
trabalho concorrente em `docs/capacity/` e `output/` permaneceu fora desta limpeza.
