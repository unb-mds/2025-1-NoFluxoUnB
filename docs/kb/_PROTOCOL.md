# Protocolo da base de conhecimento

Esta KB adapta o método verificado em `job-scribe-connect`: dossiers por subsistema,
decisões com IDs estáveis, consulta determinística e revisão independente. É interna;
não faz parte do site MkDocs de `documentacao/`.

## Autoridade e evidência

1. Código e testes do checkout descrevem a implementação; testes presentes não são testes executados.
2. Workflows, Dockerfiles e configuração de deploy descrevem o mecanismo previsto, não o estado servido.
3. SQL e exports descrevem artefatos de schema; não comprovam aplicação no Supabase.
4. `PROJECT_WIDE_DECISIONS.md` registra instruções aceitas; dossiers descrevem comportamento observado no código.
5. Specs e planos são intenção ou história até que confrontados com a fonte.

Classes de evidência: `owner-confirmed`, `curated`, `derived-code`, `derived-schema`,
`derived-git`, `observed-production`, `historical`, `inferred`. Uma revisão de fonte
não promove evidência a `verified-local` ou `verified-production`.

## Autoria e manutenção

- Consulte `npm run kb:query -- "<pergunta>"`, depois leia o dossier e a fonte citada.
- `owns` atribui responsabilidade canônica exclusiva; `watches` acompanha contratos de outro dono.
- Ao mudar uma superfície possuída ou acompanhada, revise os dossiers afetados na mesma mudança.
- Cite caminhos relativos ao repositório e símbolos; evite números de linha frágeis.
- Use `DEC-*` apenas para intenção aceita ou proposta, com status de decisão e implementação separados.
- Código existente não demonstra aprovação do mantenedor. Registre-o como comportamento, não invente decisões aceitas.
- Use `INV-*` para invariantes, `OPEN-*` para escolhas ainda não aceitas. Bugs e divergências factuais ficam nos dossiers/auditoria.
- Reversões adicionam nova decisão com `Supersedes:`; preservam justificativas anteriores.
- Atualize os inventários quando adicionar/remover documentos ou planos. Retire orientação obsoleta da árvore ativa quando houver autorização explícita; registre revisão Git, hash, motivo e destino canônico no manifesto de retirada.
- Execute `npm run kb:check`; registre limitações e resultados de revisão em `_provenance/`.
- Depois de revisar as mudanças de fonte, execute `npm run kb:snapshot` e inspecione o diff. Não atualize o snapshot só para esconder drift.

## Escopo da verificação

Estágio `bootstrap`: checagens estruturais, vínculos e cobertura de inventário são gates
locais. Drift de fonte aparece como `WARN STALE` no `kb:check` (código zero), para PRs
de código em paralelo não conflitarem no snapshot; `kb:check --strict` e `kb:drift`
retornam código não zero quando há drift.
Não há job obrigatório novo no CI.
O snapshot é a referência de hashes das superfícies owned/watched na revisão, não um
recibo de deploy. O grafo é derivado do Markdown e metadados, sem banco/vetores/LLM.

O inventário cobre documentos/templates rastreados selecionados pelo script e tombstones
de retiradas autorizadas. O ledger de planos conserva 29 originais retirados e o README
atual. Ausência sem manifesto válido, bytes históricos divergentes ou restauração
silenciosa falham na checagem. Arquivos locais ignorados, credenciais, caches, dependências e
artefatos de outros checkouts ficam fora da autoridade. Números são conferidos pelo checker.

## Segurança de operação

Esta documentação não autoriza push, merge, deploy, aplicação de SQL, scraping remoto,
chamada paga de IA nem acesso a dados pessoais. Segredos ficam em `.env` fora do Git.
Instruções de execução precisam distinguir comandos de verificação local de comandos
que modificam bancos ou acessam provedores.
