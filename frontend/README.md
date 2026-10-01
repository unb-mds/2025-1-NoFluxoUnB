# NoFluxo — Frontend (SvelteKit)

Frontend atual do NoFluxoUNB: **SvelteKit 2 + Svelte 5 (runes) + TypeScript + Tailwind CSS 4**,
empacotado como **SPA estática** (`@sveltejs/adapter-static` com fallback `index.html`,
sem SSR) e servido em produção via `k8s.frontend-svelte.Dockerfile`. Também é PWA
(`@vite-pwa/sveltekit`, auto-update).

## Rodando

```bash
npm install        # ou pnpm install na raiz do workspace
npm run dev        # http://localhost:5173
npm run build      # gera build/ estático
npm run preview    # http://localhost:4173
```

Variáveis de ambiente (`.env`, ver uso em `src/lib/supabase/` e `src/lib/config/`):
`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_API_URL`, `PRIVATE_API_URL`,
`PUBLIC_REDIRECT_URL`, `PUBLIC_ENVIRONMENT`.

## Testes e qualidade

```bash
npm run test:unit         # Vitest — testes ficam junto ao código (src/**/*.test.ts)
npm run test:integration  # Playwright — tests-e2e/ (sobe o dev server sozinho)
npm run test:coverage     # Vitest com cobertura
npm run check             # svelte-check (4 erros pré-existentes conhecidos; não é gate do CI)
npm run lint && npm run format:check
```

No CI (`pipelineCI.yml`) roda só o Vitest; Playwright e svelte-check são locais.

## Onde estão as coisas

- `src/routes/` — páginas: `fluxogramas/`, `meu-fluxograma/`, `home/`, `login/`,
  `signup/`, `(protected)/`, `api/` (endpoints internos), `dev/` (impersonation local —
  ver `docs/DEV_IMPERSONATION.md`).
- `src/lib/` — `components/` (padrão shadcn-svelte: bits-ui + tailwind-variants),
  `stores/` (estado do montador de grade: `grade.store.*`, `grade-pool.*`),
  `services/`, `supabase/`, `schemas/` (zod), `guards/`, `utils/`.
- Fluxograma interativo: `@xyflow/svelte`. Parse de histórico em PDF é **client-side**
  (`pdfjs-dist`; o worker é copiado no `postinstall`). Export de imagem: `html2canvas-pro`.
- Aliases: `$components`, `$lib`, `$stores`, `$types`, `$services`, `$utils`
  (`svelte.config.js`).
- Tema e design system: tokens em `src/app.css` (`:root` = claro, `.dark` = escuro),
  utilitários em `src/lib/styles/nofluxo-ds.css`, store em `src/lib/stores/theme.ts`,
  toggle em `components/layout/navbar/ModeToggle.svelte`. Regras e inventário em
  `docs/design-system.md`.
