---
name: motor2-e2e-test
description: Verifique no navegador a jornada do Motor 2, do histórico PDF ao plano e à grade, em ambiente local ou staging de teste explicitamente identificado. Use para E2E; não confunda mocks com produção.
---

# Jornada E2E do Motor 2

Consulte o dossier frontend, o de segurança, os contratos backend e
`frontend/playwright.config.ts`. Identifique URLs, revisão, usuário de teste,
origem de dados e provedores. Login em app local ainda pode gravar no Supabase
remoto: use ambiente de teste autorizado, fixtures sintéticas e limites de custo.

## Caminho a verificar

- Login/retorno e sessão: observe redirecionamento real, não suponha `/fluxograma`.
- Histórico: PDF sintético compatível com o parser atual, não CSV. Diferencie
  extração PDF.js no navegador, casamento RPC e gravação do progresso.
- Fluxograma pessoal: confira correspondências, pendências e equivalências.
- Plano: `/plano-formatura`; confronte preferências e saída com os dados da fixture.
- Grade: `/planejamento/grade`; confira oferta, horários, troca de escolha e limite.
- Recarregamento, logout e troca de conta: nenhum estado pessoal atravessa usuários.

Use testes existentes em `frontend/tests-e2e/` como ponto de partida. Se executar
Playwright, prefira o spec afetado:
`npm --prefix frontend run test:integration -- tests-e2e/upload-historico.exploratorio.spec.ts`.
Leia o spec antes: nome “exploratório” não assegura fixture isolada. Não crie conta,
faça upload real, chame IA paga ou execute carga em produção sem autorização.

Confira teclado, foco, texto/ícone além da cor, tela pequena e movimento reduzido.
Não imponha cor azul, número fixo de perguntas ou recálculo em menos de um segundo
do fluxo antigo. Metas de latência precisam de medição e perfil identificados.

Registre passos, resultado semântico, ambiente e evidência visual redigida. A
mensagem acolhedora não esconde erro ou dado desatualizado. Testes com mocks,
staging, caminho publicado e aceitação acadêmica têm níveis de prova distintos.
