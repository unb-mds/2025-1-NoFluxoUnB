# NoFluxoUNB — mapa atual de engenharia

A documentação canônica está na [KB](kb/INDEX.md), revisada contra a fonte do checkout.
O antigo panorama misturava camadas removidas e dependências de épocas diferentes;
seu conteúdo foi substituído durante a limpeza de 2026-10-07.

Comunicação e prioridades documentais seguem o [guia de marca](marca-e-posicionamento.md).
A conciliação operacional (documento local, fora do Git)
separa os PDFs de marca/modelo/investimento da fonte atual e da observação datada;
o Plano de Monitoramento (documento local, fora do Git)
mede demanda, confiança no dado, qualidade, sustentabilidade e capacidade.
Preços e projeções financeiras ficam em material local ignorado, sem mudar a
implementação, o domínio publicado ou o modo de cobrança.

| Área | Fonte canônica |
|---|---|
| Arquitetura e navegação | [Projeto e documentação](kb/subsystems/project-and-documentation.md) |
| Svelte, fluxograma, PDF e planejamento | [Frontend](kb/subsystems/frontend-and-academic-planning.md) |
| Express, Motor 2, endpoints e cota | [Backend](kb/subsystems/backend-api-and-motor2.md) |
| FastAPI, busca e agentes Darcy | [IA](kb/subsystems/darcy-ai-orchestration.md) |
| SIGAA, ingestão, contratos e schema | [Dados](kb/subsystems/data-ingestion-and-schema.md) |
| CI, Docker e rollout | [Operações](kb/subsystems/deployment-ci-and-operations.md) |
| Autorização, RLS e privacidade | [Segurança](kb/subsystems/auth-security-and-privacy.md) |

Fonte revisada, testes executados, artefatos SQL, deploy e estado público são evidências
separadas. A KB registra essa distinção e os limites conhecidos. O site acadêmico usa
`documentacao/` e `mkdocs.yml`; atas e estudos datados são registros históricos.
