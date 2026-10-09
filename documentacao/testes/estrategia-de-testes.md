# Estratégia de testes — NoFluxoUNB

A estratégia combina testes rápidos de lógica, integração entre módulos e observação pelo navegador. Ela é descrita a partir das configurações e dos casos existentes em 2026-10-07; não afirma cobertura exaustiva nem aprovação atual das suítes.

## Níveis de teste

| Nível | Exemplos existentes | Limite da evidência |
| --- | --- | --- |
| Unidade | Parser de expressões, horários, stores de grade, utilitários do Darcy | Demonstra o contrato das entradas exercitadas |
| Integração local | Controllers com dependências simuladas, orquestrador com client de modelo simulado, SQL/RPC em PGlite | Exercita composição local; não confirma banco ou modelo remoto |
| Navegador | Specs Playwright para busca, upload, autenticação, grade, acessibilidade e fluxograma | Cada spec tem suas próprias asserções, mocks, fixtures e possíveis registros exploratórios |
| Observação externa | Verificação da revisão publicada e teste do caminho real do usuário | Requer execução e ambiente apropriados; não resulta automaticamente do teste local |

## Técnicas usadas

Particionamento de equivalência e valores limite ajudam a cobrir arquivos vazios, arquivos acima do limite, entrada inválida, estados acadêmicos diferentes e limites configurados de carga horária. Esses limites são contratos do código testado; não devem ser apresentados como resolução oficial da UnB sem fonte normativa.

Há casos de caixa-preta, caixa-branca e rotas do fluxograma em `backend/tests-ts/fluxograma_controller.*.test.ts`. Os relatórios PTOSS-2 preservam a análise de decisão/MC/DC da sessão original. A existência desses relatórios não estabelece MC/DC completo de todos os algoritmos do produto.

Testes de regressão devem reproduzir o comportamento incorreto e verificar uma propriedade observável após a correção. Casos de pré-requisito, equivalência, horas/créditos, cancelamento e falha de IA são exemplos úteis. Inspecionar apenas um campo interno pode demonstrar uma pré-condição sem demonstrar todo o comportamento final.

## Isolamento e dados

Mocks de Supabase e de modelos permitem testar respostas, falhas, autorização e sessões sem depender de um serviço pago ou banco vivo. Algumas suítes executam SQL em PGlite com baseline e migrações selecionadas; esse banco local é um tipo diferente de integração.

O parser de PDF também possui testes condicionais dependentes de arquivos disponíveis no checkout ou de históricos locais. Specs exploratórios podem salvar capturas em `docs/testes/evidencias/`. Antes de executar, identifique os efeitos do spec, os serviços de destino e a presença das fixtures.

## Diretrizes para novos casos

1. Defina a propriedade do produto e uma entrada que possa violá-la.
2. Escolha o menor nível que reproduza o problema; use integração quando o contrato atravessar módulos, SQL ou protocolos.
3. Controle relógio, dependências externas e estado entre casos quando necessário.
4. Diferencie asserção obrigatória, observação exploratória e teste pulado.
5. Registre revisão, comando e resultado; cobertura percentual complementa essa evidência, sem substituí-la.

As páginas de [backend](testes-backend.md), [frontend](testes-frontend.md), [Python](testes-python.md) e [CI](pipeline-ci.md) detalham execução e seleção das suítes.
