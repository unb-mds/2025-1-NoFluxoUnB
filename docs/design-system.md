# Design system do frontend — temas, tokens e regras

Referência interna para quem cria ou altera componentes em `frontend/`. O site tem dois
temas, **escuro** (padrão para quem nunca escolheu) e **claro** (paleta B, aprovada em
2026-09-25). Tudo que pinta a tela passa pelos tokens descritos aqui; cores fixas em
componente são exceção documentada.

## 1. Onde cada coisa vive

| Peça | Arquivo |
|---|---|
| Tokens HSL dos dois temas | `frontend/src/app.css` (`:root` = claro, `.dark` = escuro) |
| Utilitários do DS (vidro, chips, sombras, CTA) | `frontend/src/lib/styles/nofluxo-ds.css` |
| Mapeamento token → classe Tailwind | `frontend/tailwind.config.ts` (`darkMode: 'class'`) |
| Aplicação do tema antes do primeiro paint | `frontend/src/app.html` (script inline no `<head>`) |
| Store de tema (`light` / `dark` / `system`, `resolvedTheme`) | `frontend/src/lib/stores/theme.ts` |
| Botão de troca de tema (Mode Toggle do shadcn) | `frontend/src/lib/components/layout/navbar/ModeToggle.svelte` |
| Primitivos shadcn-svelte (bits-ui + tailwind-variants) | `frontend/src/lib/components/ui/` |
| Estudo de contraste que originou a paleta B | `docs/investigacoes/2026-09-light-mode-contraste.md` |

## 2. Como o tema é aplicado

1. O script inline em `app.html` lê `localStorage.theme` (`light`, `dark` ou `system`),
   resolve `system` com `prefers-color-scheme` e coloca `.light` ou `.dark` no `<html>`
   antes de qualquer CSS carregar. Sem valor salvo, o padrão é **dark**.
2. A store `theme` mantém a mesma lógica em runtime, atualiza as duas `<meta
   name="theme-color">` e expõe `resolvedTheme` para componentes que precisam saber o
   tema efetivo (ex.: cores de aresta no canvas do plano de formatura).
3. `ModeToggle` usa `Button variant="outline" size="icon"` com os ícones `Sun` e `Moon`
   do Lucide sobrepostos e um `DropdownMenu` com Claro, Escuro e Sistema. Está na Navbar
   (variantes `bar` e `floating`) e no `MobileDrawer`.

## 3. Tokens

Valores em HSL sem `hsl()`, consumidos como `hsl(var(--x) / <alpha>)`. Os modificadores
de opacidade do Tailwind (`text-foreground/80`) funcionam: o CSS gerado traz um fallback
opaco e um bloco `@supports` com `color-mix`, que é o que os navegadores usam.

### 3.1 Cores semânticas

| Token | Claro (paleta B) | Escuro | Papel |
|---|---|---|---|
| `--background` | `255 71% 99%` (#fcfbfe) | `240 12% 2.4%` | fundo da página |
| `--foreground` | `260 24% 10%` (#17131f) | `240 6% 97%` | texto principal |
| `--card` / `--card-foreground` | `0 0% 100%` / foreground | `240 11% 6.8%` / foreground | superfícies elevadas |
| `--popover` / `--popover-foreground` | igual ao card | igual ao card | menus e popovers |
| `--primary` / `--primary-foreground` | `258 77% 56%` (#6d3ae6) / branco | `270 91% 62%` / branco | ação principal, links |
| `--secondary` / `--secondary-foreground` | `258 33% 96%` / foreground | `240 8% 12%` / `240 6% 96%` | botões secundários |
| `--muted` / `--muted-foreground` | `258 33% 96%` / `258 12% 41%` (#635c74) | `240 7% 14%` / `240 5% 56%` | fundos neutros, texto secundário |
| `--accent` / `--accent-foreground` | `258 100% 96%` (#efe9ff) / `258 63% 50%` (#5b2fd1) | `267 42% 16%` / `267 92% 88%` | destaque lilás (badges, seleção) |
| `--destructive` / `--destructive-foreground` | `0 72% 45%` / branco | `0 72% 51%` / `0 0% 98%` | erros e ações destrutivas |
| `--border` / `--input` | `258 35% 91%` (#e4dff0) | `240 8% 16%` / `240 9% 15%` | divisórias decorativas |
| `--border-strong` | `258 15% 58%` | `240 8% 26%` | bordas que precisam ≥ 3:1 (inputs, checkboxes) |
| `--ring` | igual ao primary | igual ao primary | anel de foco |
| `--ai` / `--ai-soft` | `258 63% 50%` / `258 100% 96%` | `267 92% 78%` / `268 45% 16%` | assinatura do Darcy (texto / fundo) |

Os neutros do tema claro têm matiz 295–299° em OKLCH, a mesma família do roxo do logo
(`#a77bff`, 296°). É isso que faz o claro "parecer NoFluxo" e não um shadcn genérico.

`--border-strong` ficou em 58% de luminosidade, não nos 69% do estudo: 69% dava 2,3:1 e
não passava o mínimo de 3:1 para componentes de interface.

### 3.2 Sombras e brilhos

| Token | Uso |
|---|---|
| `--nf-shadow-card`, `--nf-shadow-card-lg` | cards comuns (`shadow-nofluxo`, `shadow-nofluxo-lg`) |
| `--nf-shadow-pill` | pills e chips |
| `--nf-shadow-glow`, `--nf-shadow-glow-hover` | cards com brilho roxo (hero, features, membros) |

No claro são sombras discretas com um toque de primário; no escuro reproduzem o glow
histórico. Sempre referencie o token em vez de copiar a receita para o componente.

### 3.3 Cores de grafo

| Token | Claro | Escuro | Onde |
|---|---|---|---|
| `--edge-prereq`, `--edge-dep`, `--edge-coreq` | roxo, teal e verde escuros | lilás, teal e verde claros | linhas de pré-requisito no fluxograma |
| `--chain-pre`, `--chain-desc`, `--chain-core` | teal, laranja e índigo escuros | teal, laranja e índigo claros | cadeia de disciplinas |

Expostos no Tailwind como `edge.*` e `chain.*` (`stroke-edge-prereq`, `text-chain-pre`).

### 3.4 Status de disciplina

No fluxograma os cards de status seguem uma regra própria (`SubjectCard.svelte`):

| Tema | Aprovada | Cursando | Disponível | Reprovada | Bloqueada |
|---|---|---|---|---|---|
| Claro | superfície `emerald-50`, faixa lateral e texto `emerald-600/800` | `violet-50` / `violet-600/800` | `amber-50` / `amber-600/800` | `red-50` / `red-600/800` | `muted` / `border-strong` |
| Escuro | preenchido `#1f7a43`, texto branco | `#6b2fcf` | `#a8671a` | `#991b1b` | `#161625` |

A legenda (`FluxogramaLegendControls`) usa as mesmas cores da faixa lateral no claro e os
sólidos históricos no escuro. Se mudar um, mude o outro.

## 4. Utilitários de `nofluxo-ds.css`

| Classe | O que faz |
|---|---|
| `.nf-glass-header`, `.nf-glass-header-floating` | vidro da navbar (fundo com blur, borda e halo) |
| `.nf-chrome-pill` | pílulas do HUD do fluxograma |
| `.nf-card-surface`, `.nf-card-interactive` | superfície de card e variante com hover |
| `.nf-chip`, `.nf-chip-ai` | chips neutros e chips do Darcy |
| `.nf-cta-glow`, `.nf-cta-glow-hover` | brilho do botão principal |
| `.nf-shadow-soft` | sombra suave |
| `.nf-text-ai-muted` | texto lilás atenuado |

A declaração base usa só tokens e vale para o claro; `.dark .classe` restaura, verbatim, a
receita histórica do escuro quando um token não a reproduz.

## 5. Regras para escrever componentes

1. **Escreva o claro como padrão, com tokens.** `text-foreground`, `text-muted-foreground`,
   `bg-card`, `border-border`, `bg-muted`, `bg-accent text-accent-foreground`.
2. **Use `dark:` só para restaurar o valor histórico** quando o token diverge do que o
   escuro tinha (ex.: `bg-background/80 dark:bg-black/40`). O tema escuro é a referência
   visual e não pode mudar de aparência.
3. **Nunca `text-white`, `border-white/10`, `bg-white/5`, hex fixo** fora das exceções:
   scrim de overlay (`bg-black/50` em dialog e sheet), texto branco sobre cor sólida
   igual nos dois temas (`text-primary-foreground`, badges preenchidos) e blocos
   `:global(.dark)` que restauram o histórico.
4. **Contraste mínimo no claro:** 4,5:1 para texto, 3:1 para texto grande, ícones e
   bordas de controle. Texto pequeno sobre superfícies tingidas (`bg-primary/10`,
   `bg-accent`) precisa ser medido, não estimado. Para verificar, calcule a luminância
   relativa (o estudo em `docs/investigacoes/` tem o script).
5. **`hover:` e `focus:` perdem para `dark:` na mesma propriedade** no Tailwind 4. Se um
   elemento tem `hover:bg-x` e `dark:bg-y`, adicione `dark:hover:bg-z`.
6. **Opacidade de texto secundário:** `text-muted-foreground` já é o tom secundário; não
   reduza ainda mais com `/80` em texto menor que 12px no claro.
7. **Bordas de input** usam `border-border-strong`; divisórias decorativas usam `border-border`.
8. **Novos tokens** entram nos dois blocos de `app.css` e, se precisarem de classe Tailwind,
   em `tailwind.config.ts`. Não crie `--cor-x` dentro de componente.
9. **Sombras** vêm dos tokens `--nf-shadow-*`; blocos `:global(.dark)` só para o que o
   token não cobre.
10. **Export de imagem** (`utils/screenshot.ts`) escolhe o fundo pelo tema ativo; se
    criar outra exportação, faça o mesmo.

## 6. Inventário de componentes

- `components/ui/`: primitivos shadcn-svelte (avatar, badge, button, card, dialog,
  dropdown-menu, input, label, scroll-area, separator, sheet, skeleton, tabs, tooltip)
  mais `AnimatedButton`, `AnimatedSection`, `AuthErrorAlert`, `MarqueeText`.
- `components/layout/`: Navbar e `navbar/*` (NavItems, AccountMenu, NotificationsMenu,
  MobileDrawer, ModeToggle), PageBackground, PageTransition, ReleaseNotesModal.
- Domínios: `home/`, `fluxograma/` (cards, layout, controls, dashboard, modal),
  `disciplinas/`, `materia/`, `chat/`, `auth/`, `upload/`, `onboarding/`,
  `planejamento/`, `plano-formatura/`, `tickets/`, `support/`, `admin/`, `effects/`,
  `seo/`, `icons/`.

Removidos em 2026-09-26 por não terem nenhum importador: `forms/Select`, `forms/TextInput`,
`auth/LogoutButton`, `auth/AuthErrorBoundary`, `layout/GradientCTAButton`,
`layout/GlassContainer`, `layout/SplashScreen`, `layout/PageLoading`, `layout/AppLogo`,
`layout/Sidebar`, `layout/Breadcrumbs`, `layout/GradientUnderlineButton` e a função
`getStatusColorClass` de `types/materia.ts`.

## 7. Acessibilidade

As preferências de acessibilidade (alto contraste, texto ampliado, fonte de leitura
facilitada, redução de movimento, foco reforçado) viram classes `a11y-*` no `<html>`,
aplicadas pela store `src/lib/stores/a11y.ts` e, antes do primeiro paint, pelo script de
`app.html`. O **alto contraste sobrescreve os tokens** desta página (`html.a11y-high-contrast`
e `html.dark.a11y-high-contrast` em `app.css`), por isso nenhum componente precisa tratá-lo:
quem usa tokens já o respeita. As sombras `--nf-shadow-*` viram bordas de 1px e o vidro da
navbar fica opaco.

Menu na navbar (`components/a11y/A11yMenu.svelte`), lista no drawer mobile e página
`/acessibilidade`. Skip link e foco no `<main>` ficam no layout raiz. Testes com axe e
critérios WCAG cobertos: `docs/testes/acessibilidade.md`.

Regras para novos componentes: ícone sozinho tem `aria-label`; informação por cor tem
texto ou ícone redundante; alvos clicáveis têm pelo menos 24px; não use `outline: none`
sem um `:focus-visible` equivalente.
