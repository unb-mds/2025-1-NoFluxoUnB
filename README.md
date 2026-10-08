<div align="center">

<a href="https://no-fluxo.crianex.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/banner-dark.svg">
    <img src="assets/readme/banner-light.svg" alt="NoFluxo UnB — A vida do estudante não é linear. Cada um tem o seu próprio fluxo." width="100%">
  </picture>
</a>

<br/>

[![CI](https://github.com/unb-mds/2025-1-NoFluxoUnB/actions/workflows/pipelineCI.yml/badge.svg)](https://github.com/unb-mds/2025-1-NoFluxoUnB/actions/workflows/pipelineCI.yml)
[![Deploy](https://github.com/unb-mds/2025-1-NoFluxoUnB/actions/workflows/deploy.yml/badge.svg)](https://github.com/unb-mds/2025-1-NoFluxoUnB/actions/workflows/deploy.yml)
[![Licença](https://img.shields.io/github/license/unb-mds/2025-1-NoFluxoUnB?color=6c38e5)](./LICENSE)
[![Último commit](https://img.shields.io/github/last-commit/unb-mds/2025-1-NoFluxoUnB?color=6c38e5)](https://github.com/unb-mds/2025-1-NoFluxoUnB/commits/main)
[![Contribuidores](https://img.shields.io/github/contributors/unb-mds/2025-1-NoFluxoUnB?color=6c38e5)](https://github.com/unb-mds/2025-1-NoFluxoUnB/graphs/contributors)
[![Stars](https://img.shields.io/github/stars/unb-mds/2025-1-NoFluxoUnB?style=social)](https://github.com/unb-mds/2025-1-NoFluxoUnB/stargazers)

**[🌐 Acessar o NoFluxo](https://no-fluxo.crianex.com)** ·
**[📖 Documentação](https://unb-mds.github.io/2025-1-NoFluxoUnB/)** ·
**[📋 Board](https://github.com/orgs/unb-mds/projects/29)** ·
**[🎨 Protótipo](https://www.figma.com/design/uy5ZwJGkuzjRaeREouMSlI/-arquivado--Prototipo-e-IDV-No-FLX-UnB?node-id=0-1&p=f&t=wMKM19zNX9jK3v7F-0)** ·
**[🤝 Contribuir](./CONTRIBUTING.md)**

</div>

---

## ✨ O que é

O **NoFluxo UnB** é o fluxograma acadêmico interativo da Universidade de Brasília. O estudante envia o histórico do SIGAA e vê, em segundos, onde está no curso: o que já cumpriu, o que pode cursar agora, o que está travado por pré-requisito e quanto falta para formar — com um assistente de IA, o **Darcy**, para ajudar a escolher optativas e montar o plano.

Nasceu como projeto do Squad 03 em Métodos de Desenvolvimento de Software (MDS 2025/1, FGA/UnB) e hoje é um produto da **[Crianex](https://crianex.com)**, mantido por parte do time original.

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/readme/home-dark.jpg">
    <img src="assets/readme/home-light.jpg" alt="Página inicial do NoFluxo" width="92%">
  </picture>
</div>

## 🧭 Funcionalidades

| | |
|---|---|
| 🗺️ **Fluxograma interativo** | Todos os cursos da UnB, por matriz e turno. Cadeia de pré-requisitos ao passar o mouse, equivalências, optativas e módulo livre, zoom legível na abertura e modo tela cheia. |
| 📄 **Histórico do SIGAA** | Envie o PDF e o fluxograma se pinta sozinho: aprovadas, matriculadas, disponíveis, reprovadas e bloqueadas. PDFs que não são histórico são recusados com aviso claro. |
| 📊 **Integralização** | Percentual honesto por natureza (obrigatórias, optativas, módulo livre), horas que faltam e IRA. |
| 🎓 **Plano de Formatura** | Previsão semestre a semestre até a formatura, com limite de créditos e sugestões de optativas. |
| 🧩 **Montador de Grade** | Monta a grade do próximo semestre com as turmas ofertadas. |
| 🤖 **Darcy (IA)** | Recomenda optativas pelos seus interesses a partir das ementas. Exclusivo para quem está logado, com cota diária gratuita e rastreamento de custo no painel de administração. |
| 🌗 **Modo claro e escuro** | Os dois temas seguem o mesmo design system, com contraste medido em testes. |
| ♿ **Acessibilidade** | Alto contraste, texto ampliado, fonte de leitura facilitada (Lexend), reduzir movimento e foco reforçado — no desktop e no celular. |

<div align="center">
  <img src="assets/readme/fluxograma-temas.gif" alt="Fluxograma de Engenharia de Software alternando entre o tema escuro e o claro" width="92%">
  <br/>
  <sub>Fluxograma de Engenharia de Software nos temas escuro e claro.</sub>
</div>

<br/>

<table align="center">
  <tr>
    <td align="center" valign="top" width="26%">
      <img src="assets/readme/mobile-acessibilidade.jpg" alt="Menu de acessibilidade no celular" width="220"><br/>
      <sub>Acessibilidade sempre à mão no celular.</sub>
    </td>
    <td align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="assets/readme/crianex-dark.jpg">
        <img src="assets/readme/crianex-light.jpg" alt="Seção Crianex na página inicial" width="100%">
      </picture><br/>
      <sub>Um produto <code>/cria._nex&gt;</code>.</sub>
    </td>
  </tr>
</table>

## 🎨 Design system

Dois temas — **escuro** (padrão) e **claro** (paleta B) — sobre os mesmos tokens HSL. Nada pinta a tela com cor fixa: componentes usam os tokens de `frontend/src/app.css` (`:root` = claro, `.dark` = escuro) via Tailwind 4 e shadcn-svelte.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--primary` | ![](https://img.shields.io/badge/-%236c38e5-6c38e5?style=flat-square) | ![](https://img.shields.io/badge/-%239e46f6-9e46f6?style=flat-square) | Ações principais, destaques, "UNB" da logo |
| `--ai` | ![](https://img.shields.io/badge/-%235f2fd0-5f2fd0?style=flat-square) | ![](https://img.shields.io/badge/-%23c293fb-c293fb?style=flat-square) | Darcy e elementos de IA |
| `--background` | ![](https://img.shields.io/badge/-%23fcfbfe-fcfbfe?style=flat-square) | ![](https://img.shields.io/badge/-%23050507-050507?style=flat-square) | Fundo da página |
| `--foreground` | ![](https://img.shields.io/badge/-%23171320-171320?style=flat-square) | ![](https://img.shields.io/badge/-%23f7f7f8-f7f7f8?style=flat-square) | Texto |
| `--crianex` | ![](https://img.shields.io/badge/-%23157f3c-157f3c?style=flat-square) | ![](https://img.shields.io/badge/-%234ade80-4ade80?style=flat-square) | Marca Crianex |

**Status das disciplinas** — mesmas cores na faixa do card, na legenda e nas conexões:

![Aprovado](https://img.shields.io/badge/Aprovado-059669?style=flat-square) ![Matriculado](https://img.shields.io/badge/Matriculado-7c3aed?style=flat-square) ![Disponível](https://img.shields.io/badge/Dispon%C3%ADvel-d97706?style=flat-square) ![Reprovado](https://img.shields.io/badge/Reprovado-dc2626?style=flat-square) ![Bloqueado](https://img.shields.io/badge/Bloqueado-6b7280?style=flat-square)

**Tipografia** — Inter (interface) · Permanent Marker (logo NOFLX) · Rock Salt (mote) · Lexend (fonte de leitura) · JetBrains Mono (códigos e marca Crianex).

**Regras** — texto ≥ 4,5:1 e elementos gráficos ≥ 3:1 nos dois temas, medidos sobre o fundo real da página por testes automatizados (`frontend/src/lib/styles/contraste.ts`); toda tela nova nasce em claro e escuro; animações respeitam `prefers-reduced-motion`. Guia completo em [`docs/design-system.md`](./docs/design-system.md).

## 🏗️ Arquitetura

```mermaid
flowchart LR
    A["👩‍🎓 Estudante"] --> F["Frontend<br/>SvelteKit 2 · Svelte 5 · Tailwind 4<br/>no-fluxo.crianex.com"]
    F -- "catálogo, fluxogramas<br/>(RLS)" --> DB[("Supabase<br/>Postgres + pgvector")]
    F -- "upload, Darcy,<br/>planejamento" --> B["Backend<br/>Node · Express · TypeScript"]
    B --> DB
    B -- "login + cota diária" --> D["Darcy<br/>FastAPI · Python"]
    D --> M["Maritaca<br/>Sabiá"]
    D --> G["Gemini<br/>embeddings"]
    D --> DB
    S["DBA<br/>scraping do SIGAA"] --> DB
```

Os três serviços (frontend, backend e Darcy) rodam em contêineres num cluster K3s da Crianex. O deploy só acontece com o CI verde e só termina quando cada serviço responde, no endereço público, com o commit publicado.

## 🛡️ Qualidade e segurança

- **CI** (GitHub Actions, filtrado por área): Vitest e axe/Playwright no frontend, Jest no backend, Pytest + Black + Flake8 no Python, `npm audit` e Code Quality.
- **Deploy verificado**: workflow espera o rollout e confere o commit em `/health` de cada serviço.
- **Dependências**: Dependabot com atualizações de segurança automáticas.
- **Pré-mortem** (set/2026): riscos levantados com a pergunta *"6 meses depois o NoFluxo falhou — por quê?"*, provados por teste e corrigidos em PRs com regressão.
- **Dados**: RLS no catálogo, IA paga só para usuários logados, segredos só por variável de ambiente.

## 💻 Rodando localmente

```bash
# 1. Ambiente (venv Python + dependências Node)
python scripts/setup_env.py --node

# 2. Frontend — http://localhost:5173
cd frontend && npm run dev

# 3. Backend — porta 3325 com o .env.example (dev:full sobe também o Darcy)
cd backend && npm run dev

# 4. Testes
cd frontend && npm run test:unit
cd backend && npm test
cd DBA/tests && python -m pytest
```

Variáveis de ambiente, Supabase local e solução de problemas: [CONTRIBUTING.md](./CONTRIBUTING.md).

| Pasta | O que é |
|---|---|
| `frontend/` | SvelteKit 2 + Svelte 5 (runes) + Tailwind 4, SPA estática |
| `backend/` | API Node/TypeScript + Express |
| `mcp_agent/` | Darcy: FastAPI + Maritaca + Gemini + pgvector |
| `DBA/` | Scraping do SIGAA, ingestão no Supabase, parser de PDF |
| `supabase/migrations/` | SQL do banco |
| `docs/` | Specs técnicas internas (design system, motores, investigações) |
| `documentacao/` | Site público MkDocs (atas, requisitos, testes) |
| `kubernetes_docs/` | Infra: cluster, registry e deploy |

## 👥 Equipe

### Time atual

<table align="center">
  <tr>
    <td align="center"><img src="frontend/static/team/vitor-marconi.webp" width="96" alt="Vitor Marconi"/><br/><b>Vitor Marconi</b><br/><sub>CEO · Crianex<br/>dev e mantenedor</sub><br/><a href="https://github.com/Vitor-Trancoso">@Vitor-Trancoso</a></td>
    <td align="center"><img src="frontend/static/team/bessone.webp" width="96" alt="Rodrigo Bessone"/><br/><b>Rodrigo Bessone</b><br/><sub>CMO · Crianex<br/>direção criativa e comercial</sub><br/><a href="https://www.instagram.com/besssone">@besssone</a></td>
    <td align="center"><img src="https://github.com/darkymeubem.png" width="96" alt="Felipe Pedroza"/><br/><b>Felipe Pedroza</b><br/><sub>mantenedor</sub><br/><a href="https://github.com/darkymeubem">@darkymeubem</a></td>
    <td align="center"><img src="https://github.com/staann.png" width="96" alt="Gustavo Choueiri"/><br/><b>Gustavo Choueiri</b><br/><sub>mantenedor</sub><br/><a href="https://github.com/staann">@staann</a></td>
    <td align="center"><img src="https://github.com/hisarxt.png" width="96" alt="Arthur Fernandes"/><br/><b>Arthur Fernandes</b><br/><sub>mantenedor</sub><br/><a href="https://github.com/hisarxt">@hisarxt</a></td>
  </tr>
</table>

### Fundadores — Squad 03 · MDS 2025/1 · FGA/UnB

<table align="center">
  <tr>
    <td align="center"><img src="https://github.com/ArthurNRamalho.png" width="72" alt="Arthur Ramalho"/><br/><sub><b>Arthur Ramalho</b></sub></td>
    <td align="center"><img src="https://github.com/hisarxt.png" width="72" alt="Arthur Fernandes"/><br/><sub><b>Arthur Fernandes</b></sub></td>
    <td align="center"><img src="https://github.com/erickaalves.png" width="72" alt="Erick Alves"/><br/><sub><b>Erick Alves</b></sub></td>
    <td align="center"><img src="https://github.com/darkymeubem.png" width="72" alt="Felipe Pedroza"/><br/><sub><b>Felipe Pedroza</b></sub></td>
    <td align="center"><img src="https://github.com/gusmoles.png" width="72" alt="Guilherme Gusmão"/><br/><sub><b>Guilherme Gusmão</b></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="https://github.com/staann.png" width="72" alt="Gustavo Choueiri"/><br/><sub><b>Gustavo Choueiri</b></sub></td>
    <td align="center"><img src="https://github.com/knz13.png" width="72" alt="Otavio Maya"/><br/><sub><b>Otavio Maya</b></sub></td>
    <td align="center"><img src="https://github.com/Vinicius-Ribeiro04.png" width="72" alt="Vinícius Pereira"/><br/><sub><b>Vinícius Pereira</b></sub></td>
    <td align="center"><img src="https://github.com/Vitor-Trancoso.png" width="72" alt="Vitor Marconi"/><br/><sub><b>Vitor Marconi</b></sub></td>
    <td></td>
  </tr>
</table>

---

<div align="center">
  <sub>Código aberto sob a licença <a href="./LICENSE">GPL-3.0</a> · Um produto <a href="https://crianex.com"><code>/cria._nex&gt;</code></a></sub>
</div>
