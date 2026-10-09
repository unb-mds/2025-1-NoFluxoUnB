# Proveniência da consolidação

- `document-inventory.csv`: catálogo atual e tombstones; classificação não significa execução/aceitação.
- `DOCUMENTATION_AUDIT.md`: auditoria inicial preservada como histórico.
- `CLEANUP_AUDIT.md`: resultado atual da limpeza autorizada e escopo preservado.
- `document-retirement.csv`: 42 retiradas autorizadas, bytes/hash/revisão Git e destinos canônicos.
- `plan-disposition.csv`: 29 planos retirados e README atual, com disposição confrontada com a fonte.
- `PLAN_AUDIT.md`: critérios, referências e limites da auditoria de planos.
- `source-snapshot.json`: hashes owned/watched, HEAD e referência para drift; gerado após revisão.
- `reviews/`: achados independentes, correções e verificação final da documentação.

Planos/guias obsoletos foram retirados da árvore ativa após solicitação explícita;
a checagem valida o histórico Git e não apaga arquivos automaticamente. Arquivos
locais não rastreados fora da KB não participam dos inventários. A referência
Job Scribe foi apenas lida, sem alterações.
