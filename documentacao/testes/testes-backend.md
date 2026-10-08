# Testes do backend — Jest / TypeScript

A configuração Jest está em `backend/package.json`: usa `ts-jest`, ambiente Node e os padrões `tests-ts/**/*.test.ts` e `src/**/__tests__/**/*.test.ts`. O catálogo abaixo apresenta grupos de arquivos identificados em 2026-10-07, sem fixar totais ou resultados de execução.

## Grupos de cenários

| Área | Exemplos de arquivos em `backend/tests-ts/` |
| --- | --- |
| Controllers e contratos HTTP | `cursos_controller.test.ts`, `materias_controller.test.ts`, `users_controller.test.ts`, `fluxograma_controller.test.ts`, `fluxograma_controller.blackbox.test.ts`, `fluxograma_controller.whitebox.test.ts`, `fluxograma_controller.routes.test.ts` |
| Planejamento de formatura | `motor2-v2.test.ts`, `planejamento.test.ts`, `planejamento-corequisitos.test.ts`, `planejamento-restricoes.test.ts`, `equivalencias-cumpridas.test.ts`, `optativas-ja-cursadas.test.ts` |
| Grade, oferta e carga horária | `grade-actuator.test.ts`, `modulo-livre-actuator.test.ts`, `oferta-por-equivalencia.test.ts`, `substitutos-equivalencia.test.ts`, `horario-slots-backend.test.ts`, `periodo-ativo.test.ts` |
| Agente e orquestração | `planejador-agente.test.ts`, `tool-registry.test.ts`, `orquestrador-fase2.test.ts`, `revisor-fase3.test.ts`, `session-persistence.test.ts`, `comando-direto-sem-llm.test.ts` |
| Resiliência, acesso e operação | `assistente-input-limit.test.ts`, `assistente-sabia-resiliencia.test.ts`, `darcy-login-cota.test.ts`, `rate-limit.test.ts`, `cors-origins.test.ts`, `body-limit.test.ts`, `readiness.test.ts`, `shutdown.test.ts`, `ci-workflows.test.ts` |
| SQL local | `db/casar-disciplinas.pglite.test.ts`, `db/catalogo.pglite.test.ts`, `db/darcy-cota.pglite.test.ts`, `db/ai-saldo.pglite.test.ts`, `db/dashboard-rastreabilidade.pglite.test.ts` |
| Utilitários | Arquivos de `utils/`, `controller_logger.test.ts`, `logger-transports.test.ts`, `maritaca-errors.test.ts`, `sabia-service.test.ts` |

O catálogo completo vem dos arquivos e da coleta Jest. Descrições por nome não substituem a leitura das asserções. Por exemplo, `double-rounding-fix.test.ts` e `distribuir-slots-fix.test.ts` verificam preservação de horas internas na distribuição; não são testes de média ponderada do IRA.

## Tipos de integração

Os testes de chat/sessão usam dependências controladas conforme cada arquivo; não confirmam por si só persistência ou respostas no Supabase/Maritaca reais. As suítes PGlite executam SQL em banco local com baseline e migrações selecionadas. Elas oferecem evidência mais direta do contrato SQL exercitado, mas não confirmam aplicação das migrações no banco remoto.

Os cenários de regras acadêmicas verificam o comportamento implementado; não certificam conformidade com toda a regulamentação da UnB.

## Execução

A partir de `backend/`, com dependências instaladas:

```bash
npm test
npm run test:watch
npx jest tests-ts/motor2-v2.test.ts
npx jest tests-ts/db/casar-disciplinas.pglite.test.ts
npm run test:coverage
```

Para listar o que Jest coletaria, use `npx jest --listTests`. Isso identifica arquivos, sem executar as asserções.

Os scripts `npm run type-check` e `npm run lint` são verificações distintas de `npm test`. O [pipeline principal](pipeline-ci.md) usa Jest; o workflow de segurança/qualidade executa seu próprio comando TypeScript estrito.

## Cobertura e relato de execução

O Jest coleta `src/**/*.ts`, exclui `.d.ts`, e gera texto, LCOV e HTML em `backend/coverage/`. O HTML configurado fica em `backend/coverage/index.html`; `lcov.info` é o arquivo de cobertura LCOV. Consulte [métricas](cobertura-metricas.md) para políticas e limites.

Ao publicar resultado, informe revisão, comando, testes pulados e falhas. Relatórios PTOSS-2 anteriores registram a execução da época e devem permanecer históricos.
