# Acessibilidade (WCAG 2.2) — módulo, testes e como manter

Recriado em 2026-09-26 sobre o sistema de tokens do tema claro/escuro. O commit original de
2026-06-23 (`feat/testes-acessibilidade`, preservado em `recuperado/feat-testes-acessibilidade`)
pintava o alto contraste componente por componente; esta versão sobrescreve os tokens, então
todo componente que usa tokens já o respeita.

## O que existe

| Peça | Arquivo |
|---|---|
| Preferências (store, persistência, classes no `<html>`) | `frontend/src/lib/stores/a11y.ts` |
| Aplicação antes do primeiro paint | `frontend/src/app.html` (mesmo script do tema) |
| CSS: alto contraste, texto ampliado, Lexend, redução de movimento, foco, skip link | `frontend/src/app.css` (bloco "Acessibilidade") |
| Lista única de opções (rótulo, descrição, critério WCAG, ícone) | `frontend/src/lib/components/a11y/a11y-options.ts` |
| Interruptor acessível (`role="switch"`) | `frontend/src/lib/components/a11y/A11ySwitch.svelte` |
| Menu na navbar (dropdown) e lista no drawer mobile | `frontend/src/lib/components/a11y/A11yMenu.svelte` |
| Página completa | `frontend/src/routes/acessibilidade/+page.svelte` (`/acessibilidade`, pública) |
| Skip link e foco no `<main>` após navegação | `frontend/src/routes/+layout.svelte` |

### Preferências

| Chave | Classe no `<html>` | Efeito |
|---|---|---|
| `highContrast` | `a11y-high-contrast` | Sobrescreve os tokens: preto no branco (claro) ou branco no preto com amarelo (escuro); sombras viram bordas; vidro fica opaco; links sublinhados |
| `largeText` | `a11y-large-text` | `font-size: 112.5%` no `<html>`; tudo em rem cresce |
| `readableFont` | `a11y-readable-font` | Lexend em todo texto, exceto logotipo, código e ícones |
| `reducedMotion` | `a11y-reduced-motion` | Sem animações e transições; `prefers-reduced-motion` do sistema já é respeitado sem o interruptor |
| `focusBold` | `a11y-focus-bold` | `:focus-visible` com anel de 3px e halo |

Salvas em `localStorage.nofluxo_a11y` como JSON. Sem nada salvo, "reduzir movimento" nasce
igual à preferência do sistema.

## Critérios WCAG 2.2 cobertos

| Critério | Como |
|---|---|
| 1.3.1 Informação e relações | `aria-invalid`, `aria-describedby` e `aria-live` nos erros do login; `role="switch"` + `aria-checked` nos interruptores |
| 1.4.1 Uso da cor | status da disciplina em texto (`sr-only` e `aria-label` do card), além da cor e da faixa |
| 1.4.3 / 1.4.11 Contraste | temas claro e escuro ≥ 4,5:1 em texto e ≥ 3:1 em interface (ver estudo em `docs/investigacoes/`); alto contraste opcional |
| 1.4.4 / 1.4.12 Redimensionar texto | texto ampliado; layout em rem |
| 1.4.8 Apresentação visual | fonte de leitura facilitada (Lexend) |
| 2.3.3 Animação por interação | redução de movimento por sistema e por interruptor |
| 2.4.1 Pular blocos | skip link "Pular para o conteúdo" como primeiro foco |
| 2.4.3 Ordem do foco | `afterNavigate` move o foco para `#main-content` |
| 2.4.7 / 2.4.13 Foco visível e aparência | anel de foco em todos os temas; foco reforçado opcional |
| 2.5.8 Tamanho do alvo | pontos do carrossel com alvo de 24px |
| 4.1.2 Nome, papel, valor | nomes acessíveis nos filtros e na paginação de fluxogramas, `aria-current="page"` na navegação |

## Testes

| Comando | O que roda |
|---|---|
| `npm run test:a11y` | Vitest: regras da store (`a11y.test.ts`) e o interruptor com Testing Library + axe em jsdom (`*.a11y.test.ts`, projeto `a11y` do Vitest com resolução `browser`) |
| `npm run test:e2e:a11y` | Playwright + `@axe-core/playwright`: varredura WCAG 2 A/AA e 2.2 AA em `/`, `/login`, `/fluxogramas` e `/acessibilidade` nos dois temas; home com alto contraste; skip link; persistência dos interruptores |
| `npm run test:unit` | tudo, inclusive os dois projetos acima |

Contraste de cor só é medido no Playwright (navegador real); no jsdom a regra fica desligada
porque não há layout.

CI: `.github/workflows/a11y.yml` roda os dois em PRs que tocam `frontend/`, com
`continue-on-error: true` por enquanto. Quando a base ficar estável, remover essa linha para
bloquear regressões.

## Violações corrigidas na primeira varredura (2026-09-26)

| Rota | Regra axe | Correção |
|---|---|---|
| `/` (dois temas) | `target-size` | pontos do carrossel de membros: alvo 24px com ponto visível de 8px desenhado por dentro |
| `/` (escuro) | `color-contrast` | destaques roxos nos títulos dos cards (4,24:1 sobre o card) passaram a `purple-500` no escuro (4,83:1) |
| `/login` (escuro) | `color-contrast` | "ou" do divisor no card branco: gray-400 (2,5:1) → gray-500 (4,6:1) |
| `/fluxogramas` | `button-name`, `select-name` | `aria-label` nos três filtros e nos botões de paginação; `aria-current="page"` na página atual |

## Como manter

- Todo componente novo usa tokens (`docs/design-system.md`); o alto contraste vem de graça.
- Ícone sozinho em botão precisa de `aria-label` ou `sr-only`.
- Informação transmitida por cor precisa de texto ou ícone redundante.
- Rode `npm run test:e2e:a11y` antes de abrir PR que mexa em navegação, formulários ou cores.
