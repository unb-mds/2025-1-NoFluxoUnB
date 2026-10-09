# Design system do frontend — temas, tokens e regras

Referência interna para quem cria ou altera componentes em `frontend/`, conferida
contra a fonte em 2026-10-08. O código suporta **escuro** (padrão sem preferência),
**claro** e escolha **Sistema**. Tokens semânticos são a base do design; existem
também cores fixas e paletas locais, como status de disciplina e modo de todas as
conexões. As regras abaixo são diretrizes para alterações, não uma afirmação de que
todo componente já as cumpre ou de conformidade visual em produção.

Consulte o [dossier frontend](./kb/subsystems/frontend-and-academic-planning.md)
para fluxos, autenticação e limites de verificação.

## Marca e nível de promessa

O [guia de marca](marca-e-posicionamento.md) incorpora a plataforma de 28/09/2026:
NoFluxo com endosso by Crianex; universidade como qualificador, proximidade sem
julgamento e honestidade sobre origem/atualização dos dados. A diretriz visual
preserva os tokens reais abaixo, sem tratar a marca de uma universidade como
endosso oficial. Relatórios institucionais exibem o endosso da Crianex legível.

WCAG 2.2 AA é alvo de avaliação, não status comprovado do produto. Combine cor
com texto/ícone, teclado/foco, alternativa ao arraste e movimento reduzido;
contraste e zoom precisam de teste sobre a composição real. Validação inclui
pessoas e tecnologias assistivas, além de scanners. Veja a
[referência W3C](https://www.w3.org/TR/WCAG22/).

## 1. Onde cada coisa vive

| Peça | Arquivo |
|---|---|
| Tokens HSL dos dois temas | `frontend/src/app.css` (`:root` = claro, `.dark` = escuro) |
| Utilitários do DS (vidro, chips, sombras, CTA) | `frontend/src/lib/styles/nofluxo-ds.css` |
| Mapeamento token → classe Tailwind | `frontend/tailwind.config.ts`, carregado por `@config '../tailwind.config.ts'` em `app.css`; `darkMode: 'class'` |
| Aplicação do tema antes do primeiro paint | `frontend/src/app.html` (script inline no `<head>`) |
| Store de tema (`light` / `dark` / `system`, `resolvedTheme`) | `frontend/src/lib/stores/theme.ts` |
| Botão de troca de tema (Mode Toggle do shadcn) | `frontend/src/lib/components/layout/navbar/ModeToggle.svelte` |
| Primitivos shadcn-svelte (bits-ui + tailwind-variants) | `frontend/src/lib/components/ui/` |
| Estudo de contraste que originou a paleta B | `docs/investigacoes/2026-09-light-mode-contraste.md` |

## 2. Como o tema é aplicado

1. O script inline em `app.html` lê `localStorage.theme` (`light`, `dark` ou `system`),
   resolve `system` com `prefers-color-scheme` e coloca `.light` ou `.dark` no `<html>`
   antes do primeiro paint. Sem valor salvo válido, o padrão é **dark**.
2. A store `theme` mantém a mesma lógica em runtime, atualiza as duas `<meta
   name="theme-color">` e expõe `resolvedTheme` para componentes que precisam saber o
   tema efetivo. Os valores de `theme-color` são `#faf9fe` no claro e `#09090b`
   no escuro; não são cópias exatas de todos os fundos CSS.
3. `ModeToggle` usa `Button variant="outline" size="icon"` com os ícones `Sun` e `Moon`
   do Lucide sobrepostos e um `DropdownMenu` com Claro, Escuro e Sistema. Está na Navbar
   (variantes `bar` e `floating`). Também oferece tamanho compacto (`icon-sm`) e
   `layout="segmented"`, usado pelo `MobileDrawer` sem portal de dropdown.

## 3. Tokens

Os tokens semânticos abaixo guardam componentes HSL sem `hsl()` e são mapeados
como `hsl(var(--x) / <alpha-value>)` em `tailwind.config.ts`. Tokens de grafo
guardam cores completas em hexadecimal. Tailwind 4 é importado por
`@import 'tailwindcss'` e recebe explicitamente o config TypeScript por `@config`.
Confira o CSS gerado e o navegador para variantes/opacidade; não use a sintaxe
de um token HSL para um token que já contém uma cor completa.

### 3.1 Cores semânticas

| Token | Claro (paleta B) | Escuro | Papel |
|---|---|---|---|
| `--background` | `255 71% 99%` | `240 12% 2.4%` | fundo do body e superfícies que usam `background` |
| `--foreground` | `260 24% 10%` | `240 6% 97%` | texto principal |
| `--card` / `--card-foreground` | `0 0% 100%` / foreground | `240 11% 6.8%` / foreground | superfícies elevadas |
| `--popover` / `--popover-foreground` | igual ao card | igual ao card | menus e popovers |
| `--primary` / `--primary-foreground` | `258 77% 56%` / branco | `270 91% 62%` / branco | ação principal, links |
| `--secondary` / `--secondary-foreground` | `258 33% 96%` / foreground | `240 8% 12%` / `240 6% 96%` | botões secundários |
| `--muted` / `--muted-foreground` | `258 33% 96%` / `258 12% 41%` | `240 7% 14%` / `240 5% 56%` | fundos neutros, texto secundário |
| `--accent` / `--accent-foreground` | `258 100% 96%` / `258 63% 50%` | `267 42% 16%` / `267 92% 88%` | destaque lilás (badges, seleção) |
| `--destructive` / `--destructive-foreground` | `0 72% 45%` / branco | `0 72% 51%` / `0 0% 98%` | erros e ações destrutivas |
| `--border` / `--input` | `258 35% 91%` | `240 8% 16%` / `240 9% 15%` | bordas; o primitivo Input usa `border-input` |
| `--border-strong` | `258 15% 58%` | `240 8% 26%` | alternativa para borda com maior contraste |
| `--ring` | igual ao primary | igual ao primary | anel de foco |
| `--ai` / `--ai-soft` | `258 63% 50%` / `258 100% 96%` | `267 92% 78%` / `268 45% 16%` | assinatura do Darcy (texto / fundo) |

`PageBackground.svelte` usa `--page-background`: `255 71% 99%` no claro e
`0 0% 1.9608%` (#050505) no escuro. O glow usa `--primary` com
`--page-glow-alpha: 0.45` e opacidades próprias de 0.22/0.18. Meça contraste
sobre a superfície que realmente fica atrás do elemento, incluindo composição
do glow. `--status-success/warning/danger/info` são tokens de status genéricos;
não substituem automaticamente a paleta específica dos cards de disciplina.

### 3.2 Sombras e brilhos

| Token | Uso |
|---|---|
| `--nf-shadow-card`, `--nf-shadow-card-lg` | cards comuns (`shadow-nofluxo`, `shadow-nofluxoLg`, conforme as chaves do config) |
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
No modo de todas as conexões, `PrerequisiteConnections.svelte` usa também
`--edge-p0` a `--edge-p11` e `--edge-alpha-all` no CSS do próprio componente,
com variantes clara e escura.

### 3.4 Status de disciplina

No fluxograma os cards de status seguem uma regra própria (`SubjectCard.svelte`):

| Tema | Aprovada | Cursando | Disponível | Reprovada | Bloqueada |
|---|---|---|---|---|---|
| Claro | superfície `emerald-50`, faixa lateral e texto `emerald-600/800` | `violet-50` / `violet-600/800` | `amber-50` / `amber-600/800` | `red-50` / `red-600/800` | `muted` / `border-strong` |
| Escuro | preenchido `#1f7a43`, `text-foreground` | `#6b2fcf` / foreground | `#a8671a` / foreground | `#991b1b` / foreground | `#161625` / foreground a 80% |

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

## 5. Diretrizes para escrever componentes

1. **Escreva o claro como padrão, com tokens.** `text-foreground`, `text-muted-foreground`,
   `bg-card`, `border-border`, `bg-muted`, `bg-accent text-accent-foreground`.
2. **Use `dark:` para uma diferença deliberada entre temas** que um token não
   resolve. Compare os dois temas e preserve a referência visual aceita para a mudança.
3. **Prefira tokens a `text-white`, `border-white/10`, `bg-white/5` e hex fixo**.
   Exceções devem ter propósito e revisão nos dois temas:
   scrim de overlay (`bg-black/50` em dialog e sheet), texto branco sobre cor sólida
   igual nos dois temas (`text-primary-foreground`, badges preenchidos) e blocos
   `:global(.dark)` que restauram o histórico.
4. **Contraste mínimo no claro:** 4,5:1 para texto, 3:1 para texto grande, ícones e
   bordas de controle. Texto pequeno sobre superfícies tingidas (`bg-primary/10`,
   `bg-accent`) precisa ser medido, não estimado. Para verificar, calcule a luminância
   relativa (o estudo em `docs/investigacoes/` tem o script).
5. **Declare estados em ambos os temas quando necessário** (`dark:hover:bg-z`,
   `dark:focus-visible:*`). Confira cascata, especificidade e CSS gerado quando
   variantes disputam a mesma propriedade; não presuma precedência universal.
6. **Opacidade de texto secundário:** `text-muted-foreground` já é o tom secundário; não
   reduza ainda mais com `/80` em texto menor que 12px no claro.
7. **Bordas de controle precisam ser avaliadas no fundo real.** `border-border-strong`
   é uma opção; o primitivo `components/ui/input/input.svelte` atualmente usa
   `border-input` e anel/borda de foco. Não presuma que todos os controles usam
   a borda forte. Divisórias decorativas podem usar `border-border`.
8. **Novos tokens** entram nos dois blocos de `app.css` e, se precisarem de classe Tailwind,
   em `tailwind.config.ts`. Não crie `--cor-x` dentro de componente.
9. **Sombras** vêm dos tokens `--nf-shadow-*`; blocos `:global(.dark)` só para o que o
   token não cobre.
10. **Export de imagem** (`utils/screenshot.ts`) escolhe fundo fixo `#fcfbfe` no
    claro ou `#0a0a0f` no escuro pela classe `.dark`. Não lê dinamicamente os
    tokens de alto contraste. Ao criar outra exportação, confira tema,
    acessibilidade e legibilidade do resultado capturado.

## 6. Inventário de componentes

- `components/ui/`: primitivos shadcn-svelte (avatar, badge, button, card, dialog,
  dropdown-menu, input, label, scroll-area, separator, sheet, skeleton, tabs, tooltip)
  mais `AnimatedButton`, `AnimatedSection`, `AuthErrorAlert`, `MarqueeText`.
- `components/layout/`: Navbar e `navbar/*` (NavItems, AccountMenu, NotificationsMenu,
  MobileDrawer, ModeToggle), PageTransition, ReleaseNotesModal. PageBackground está
  em `components/effects/`.
- Domínios: `home/`, `fluxograma/` (cards, layout, controls, dashboard, modal),
  `disciplinas/`, `materia/`, `chat/`, `auth/`, `upload/`, `onboarding/`,
  `planejamento/`, `plano-formatura/`, `tickets/`, `support/`, `admin/`, `effects/`,
  `seo/`, `icons/`.

## 7. Acessibilidade

As preferências de acessibilidade (alto contraste, texto ampliado, fonte de leitura
facilitada, redução de movimento, foco reforçado) viram classes `a11y-*` no `<html>`,
aplicadas pela store `src/lib/stores/a11y.ts` e, antes do primeiro paint, pelo script de
`app.html`. O **alto contraste sobrescreve os tokens** desta página (`html.a11y-high-contrast`
e `html.dark.a11y-high-contrast` em `app.css`). Consumidores desses tokens recebem
os novos valores; cores fixas e paletas locais precisam de revisão própria. As
sombras `--nf-shadow-*` viram anéis de 1px ou 2px conforme o token, o vidro da
navbar fica opaco e o fundo decorativo `.nofluxo-bg` é ocultado. Isso não garante
que todo componente responda ao alto contraste sem ajustes.

Menu na navbar (`components/a11y/A11yMenu.svelte`), lista no drawer mobile e página
`/acessibilidade`. Skip link e foco no `<main>` ficam no layout raiz. A estratégia
de testes está em [acessibilidade](./testes/acessibilidade.md). Também há helpers
e testes locais em `frontend/src/lib/styles/contraste.ts` e
`contraste.test.ts`; sua presença não comprova execução ou conformidade completa.

Regras para novos componentes: ícone sozinho tem `aria-label`; informação por cor tem
texto ou ícone redundante; alvos clicáveis têm pelo menos 24px; não use `outline: none`
sem um `:focus-visible` equivalente.
