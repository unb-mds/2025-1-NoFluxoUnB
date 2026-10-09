# Impersonação de desenvolvimento

É uma ferramenta de UI/debug local, não autenticação real nem prova de RLS.

## Gates reais

- `frontend/src/routes/dev/impersonar/+page.ts::load` exige `!config.isProd` e `import.meta.env.DEV`; caso contrário responde 404.
- `AuthService.getAuthHeaders` envia `X-Dev-Impersonate` somente em build de desenvolvimento e com `localStorage.nofluxo_dev_impersonate=true`.
- `backend/src/utils.ts::Utils.checkAuthorization` exige `NODE_ENV !== production` **e** opt-in explícito `ALLOW_DEV_IMPERSONATE=true`, além de `User-ID` e email compatível com o perfil existente.

Não basta deixar `NODE_ENV` ausente ou alterar apenas `PUBLIC_ENVIRONMENT`.
Use apenas instâncias e perfis de desenvolvimento autorizados. A UI sintética não
cria sessão Supabase: operações do browser dependentes de RLS continuam tendo sua
própria autenticação. A rota oferece presets/formulário e limpeza da flag/sessão local.

## Verificação

`frontend/tests-e2e/dev-impersonation.spec.ts` contém cenários disponíveis. Sua presença
não significa execução atual nem aceite de produção; não há declaração de PASS nesta página.
Veja [autorização e segurança](kb/subsystems/auth-security-and-privacy.md) e
[frontend](kb/subsystems/frontend-and-academic-planning.md) para limites e consumidores.
