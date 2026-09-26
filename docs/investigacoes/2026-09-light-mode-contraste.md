# Light mode — comparação de paletas e contraste (2026-09-25)

Base: `frontend/src/app.css` (tokens HSL em `:root` / `.dark`), logo `noflx-unb-logo_1.svg`
(cores da marca: branco `#ffffff`, lilás `#e3d4ff`, roxo `#a77bff`). Razões calculadas pela
fórmula WCAG 2.x (luminância relativa). Texto: AA ≥ 4,5:1, AAA ≥ 7:1, AA-large ≥ 3:1.
Elementos de UI (bordas, foco): ≥ 3:1.

## Estado atual do site

- Só existe dark na prática: `app.html` tem `<html class="dark">` fixo; `tailwind.config.ts` está em `darkMode: 'class'`.
- `:root` guarda uma paleta clara herdada do shadcn (neutros azulados `slate`), não da marca.
- `src/lib/stores/theme.ts` já implementa `light | dark | system` com `localStorage` e `matchMedia`, mas **nenhum componente importa a store**.
- 87 de 205 arquivos `.svelte` usam utilitários hardcoded (`text-white` ×195, `border-white/10` ×205, `bg-white/5`, `bg-white/10`, `text-white/50…90`), ignorando os tokens. Esse é o custo real do light mode, não os tokens.
- `nofluxo-ds.css` (vidro do header, pills) usa `hsl(240 14% 6% / .78)` etc. hardcoded para dark.

## Paletas comparadas

| Token | DARK atual | A. Light herdado (`:root`) | B. Light marca (neutros lilás) | C. Light minimalista (skill) |
|---|---|---|---|---|
| fundo | `#050507` | `#ffffff` | `#faf9fe` | `#f7f6f3` |
| card | `#0f0f13` | `#ffffff` | `#ffffff` | `#ffffff` |
| texto | `#f7f7f8` | `#020817` | `#17131f` | `#111111` |
| texto secundário | `#898994` | `#64748b` | `#635c74` | `#787774` |
| primário | `#9e46f6` | `#6d24eb` | `#6d3ae6` | `#111111` |
| acento IA | `#c293fb` | `#c293fb` | `#5b2fd1` | `#5b2fd1` |
| fundo IA suave | `#28163b` | `#ede9fe` | `#efe9ff` | `#efe9ff` |
| borda | `#26262c` | `#e2e8f0` | `#e4dff0` | `#eaeaea` |

## Razões de contraste

| Par | DARK atual | A. herdado | B. marca | C. minimalista |
|---|---|---|---|---|
| Texto corpo / fundo | 19,0 AAA | 20,0 AAA | 17,4 AAA | 17,5 AAA |
| Texto secundário / fundo | 5,9 AA | 4,8 AA | 6,1 AA | 4,1 **AA-large** |
| Primário como link / fundo | 4,5 AA | 6,8 AA | 5,9 AA | 17,5 AAA |
| Branco / botão primário | 4,5 AA | 6,8 AA | 6,2 AA | 18,9 AAA |
| Acento IA / fundo IA suave | 7,0 AA | 2,0 **FALHA** | 6,4 AA | 6,4 AA |
| Acento IA / fundo | 8,6 AAA | 2,4 **FALHA** | 7,2 AAA | 7,0 AAA |
| Borda / fundo (UI) | 1,35 falha | 1,23 falha | 1,24 falha | 1,11 falha |
| Anel de foco / fundo (UI) | 4,5 OK | 5,7 OK | 5,9 OK | 5,7 OK |
| Roxo do logo `#a77bff` como texto / fundo | 6,7 AA | 3,0 AA-large | 2,9 **FALHA** | 2,8 **FALHA** |
| Lilás do logo `#e3d4ff` / fundo (UI) | 14,7 OK | 1,4 falha | 1,3 falha | 1,3 falha |

Bordas sutis falham 3:1 em todas as paletas, inclusive na dark atual — é o normal para
divisórias decorativas. Onde a borda define um controle (input, checkbox), usar um token
`border-strong` (≈ `#a9a3bb` sobre `#faf9fe` ≈ 3,1:1).

## Roxo da marca sobre branco (para texto e links no light)

| Cor | Razão | WCAG |
|---|---|---|
| `#a77bff` (logo) | 3,0 | AA-large |
| `#8b5cf6` | 4,2 | AA-large |
| `#7c3aed` | 5,7 | AA |
| `#6d3ae6` | 6,2 | AA |
| `#6d28d9` | 7,1 | AAA |
| `#5b2fd1` | 7,6 | AAA |

O roxo `#a77bff` do logo não serve como texto sobre fundo claro. Ele fica como cor de
**superfície/ícone/marca** (logo, glow, fundo de badge) e o texto roxo usa `#6d3ae6` ou mais
escuro. O lilás `#e3d4ff` vira fundo de destaque (`ai-soft`), não elemento de UI isolado.

## Leitura

- **A (herdado)** é a mais fácil de ligar (já está no `:root`), mas os neutros são azulados
  (slate) e o acento IA lilás falha em 2,0:1 — o "lilás IA" da marca some no claro.
- **B (marca)** mantém a identidade (neutros com matiz roxo, acento IA escurecido para
  `#5b2fd1`) e passa AA em todos os pares de texto, com AAA no acento IA. É a candidata.
- **C (minimalista)** é a mais limpa, mas o secundário `#787774` fica em 4,1:1 (falha AA em
  texto normal), o botão vira preto (a marca perde o roxo no CTA) e a skill proíbe a Inter que
  o site usa. Aproveitar dela só as regras estruturais: bordas 1px, sombras ≤ 0,05 de
  opacidade, whitespace generoso, sem gradientes em superfícies grandes.

## Recomendação

Paleta **B** com as regras estruturais de **C**. Tokens propostos para `:root` (HSL, no formato
que o `tailwind.config.ts` já consome):

```css
:root {
  --background: 255 71% 99%;      /* #faf9fe */
  --foreground: 260 24% 10%;      /* #17131f */
  --card: 0 0% 100%;
  --card-foreground: 260 24% 10%;
  --primary: 258 77% 56%;         /* #6d3ae6 — 6,2:1 sobre branco */
  --primary-foreground: 0 0% 100%;
  --muted: 258 33% 96%;           /* #f3f0fa */
  --muted-foreground: 258 12% 41%;/* #635c74 — 6,1:1 */
  --accent: 258 100% 96%;         /* #efe9ff — lilás do logo clareado */
  --accent-foreground: 258 63% 50%;/* #5b2fd1 */
  --border: 258 35% 91%;          /* #e4dff0 */
  --border-strong: 258 15% 69%;   /* #a9a3bb — 3,1:1 para inputs */
  --ring: 258 77% 56%;
  --ai: 258 63% 50%;              /* #5b2fd1 — 7,2:1 sobre o fundo */
  --ai-soft: 258 100% 96%;
}
```

## Passos de implementação (estimativa)

1. Trocar os tokens de `:root` pela paleta B; remover `class="dark"` fixo do `app.html` e
   aplicar a classe via script inline antes do primeiro paint (evita flash), usando a lógica que
   já existe em `stores/theme.ts`.
2. Adicionar o toggle (ícone sol/lua) no header usando a store existente.
3. Migrar os 87 arquivos com `text-white*` / `border-white/*` / `bg-white/*` para os tokens
   (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`). É trabalho
   mecânico, mas é o grosso do esforço; dá para fazer por rota (home → fluxograma → chat).
4. Reescrever os utilitários de vidro em `nofluxo-ds.css` com `hsl(var(--background) / .78)`
   em vez de valores fixos.
5. Ajustar `meta name="theme-color"` e o `.nf-wordmark-noflx` (branco fixo → `foreground`).
6. Verificar com o checklist acima em cada rota, nos dois temas, em largura de celular.

Skills instaladas para essa frente (via skill-recruiter): `color-expert`, `svelte-styling`,
`svelte-runes`, `minimalist-ui` (só regras estruturais).
