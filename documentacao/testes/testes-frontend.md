# Testes do frontend — Vitest e Playwright

O frontend usa SvelteKit 2, Svelte 5 e TypeScript. A configuração de testes está em `frontend/vite.config.ts`, `frontend/playwright.config.ts` e nos scripts de `frontend/package.json`. Este guia foi revisado a partir dessas fontes em 2026-10-07; não afirma totais fixos nem resultado atual.

## Vitest

Há dois projetos no arquivo Vite:

- `unit`: coleta `src/**/*.{test,spec}.{js,ts}`, excluindo `*.a11y.test.ts`. Usa o ambiente padrão Node; não se deve descrever toda a suíte como jsdom.
- `a11y`: coleta `src/**/*.a11y.test.ts`, usa jsdom e resolução `browser` para montar componentes no cliente.

Exemplos de grupos existentes:

| Área | Localização/exemplos |
| --- | --- |
| Montador de grade | `src/lib/stores/grade.store.*.test.ts` para montagem, travas, limites, máscaras e limpeza |
| Matérias candidatas | `src/lib/services/grade-pool.*.test.ts` para matriz, pré-requisitos, saldo, módulo livre e seleção |
| Chat, autenticação e estado | `chat.service.test.ts`, `auth.service.test.ts`, `authGuard.test.ts`, `assistente-chat-store-*.test.ts`, `fluxograma.store.race.test.ts` |
| Parse de PDF | `src/lib/services/pdf/pdfDataExtractor.test.ts`, `pdfPositionExtractor.test.ts`, `pdf/__tests__/edge_cases.test.ts`, `all_pdfs.test.ts` |
| Domínio e horários | `src/lib/utils/expressao-logica*.test.ts`, `curriculum-graph.test.ts`, `horario-slots*.test.ts`, `ira.test.ts` |
| Interface e acessibilidade | `src/lib/components/fluxograma/SubjectSearch.test.ts`, testes de contraste/tema e `components/a11y/*.a11y.test.ts` |

Os testes de PDF podem depender das fixtures presentes ou de históricos locais e podem ser pulados quando não houver dados. A existência do arquivo não informa se todos os seus cenários foram executados.

## Playwright

A configuração coleta `frontend/tests-e2e/`, usa Chromium, um worker, zero retries e base URL `http://localhost:5173`. O `webServer` executa `npm run dev` e reutiliza um servidor existente na porta 5173. Assim, não é obrigatório iniciar outro frontend manualmente; serviços adicionais dependem do spec.

Os specs incluem acessibilidade, upload, busca/filtro, login, assistente, grade manual/automática, viewport mobile, setas e impersonação de desenvolvimento. Algumas sessões exploratórias registram estados e capturas sem uma asserção obrigatória para cada comportamento. A suíte de login declara credenciais sintéticas e OAuth exercitado apenas até o clique inicial; não representa login Google concluído com conta real.

Antes de executar exploratórios, confira as fixtures necessárias e a escrita de capturas em `docs/testes/evidencias/`. Não sobrescreva evidência histórica sem revisar o diff. Impersonação local não substitui um teste real de autenticação e políticas RLS.

## Comandos

A partir de `frontend/`, com dependências instaladas:

```bash
npm run test:unit
npx vitest run src/lib/stores/grade.store.montarAutomatico.test.ts
npm run test:coverage
npx playwright install chromium
npm run test:integration
npm run test:a11y
npm run test:e2e:a11y
```

`npm run check`, lint e build são comandos separados. `npx vitest --ui` depende de suporte UI instalado; ele não é um script configurado nem um requisito para executar os testes.

No workflow principal roda Vitest. O workflow separado `a11y.yml` executa Playwright de acessibilidade com `continue-on-error: true`; isso não significa que a suíte E2E inteira seja um gate de CI. Veja [pipeline](pipeline-ci.md).

## Cobertura

`npm run test:coverage` solicita cobertura ao Vitest. O manifesto declara `@vitest/coverage-v8`; uma instalação completa das dependências deve disponibilizar o provedor. A configuração Vite não define thresholds nem um catálogo próprio de arquivos para cobertura. O resultado e o diretório do relatório devem ser confirmados na execução; não infira percentuais ou um gate a partir da existência do script.
