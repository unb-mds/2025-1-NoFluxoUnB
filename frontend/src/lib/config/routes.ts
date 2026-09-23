// Route path constants
export const ROUTES = {
  // Public routes
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  PASSWORD_RECOVERY: '/password-recovery',
  ANONYMOUS_LOGIN: '/login-anonimo',

  // Protected routes
  ASSISTENTE: '/assistente',
  DISCIPLINAS: '/disciplinas',
  UPLOAD_HISTORICO: '/upload-historico',
  FLUXOGRAMAS: '/fluxogramas',
  MEU_FLUXOGRAMA: '/meu-fluxograma',
  PLANO_FORMATURA: '/plano-formatura',
  MONTADOR_GRADE: '/planejamento/grade',
  BUSCAR_TURMAS: '/planejamento/turmas',
  SUPORTE: '/suporte',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_TICKETS: '/admin/tickets',
  ADMIN_CONFIGURACOES: '/admin/configuracoes',

  // Auth routes
  AUTH_CALLBACK: '/auth/callback',
  AUTH_RESET_PASSWORD: '/auth/reset-password',

  // Dynamic routes
  meuFluxograma: (courseName: string) => `/meu-fluxograma/${encodeURIComponent(courseName)}`,
} as const;

// Routes that don't require authentication
export const PUBLIC_ROUTES = [
  '/',
  '/home',
  '/login',
  '/signup',
  '/password-recovery',
  '/login-anonimo',
  '/auth/callback',
  '/auth/reset-password',
  '/conheca',
] as const;

// Protected routes require authentication
export const PROTECTED_ROUTES = [
  '/assistente',
  '/disciplinas',
  '/upload-historico',
  '/fluxogramas',
  '/meu-fluxograma',
  '/plano-formatura',
  '/planejamento',
  '/suporte',
  '/admin',
] as const;

// Rotas admin → escopo exigido em public.admins.scopes (superadmin ignora).
const ADMIN_SCOPE_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ['/admin/tickets', 'tickets'],
  ['/admin/configuracoes', 'settings'],
  ['/admin', 'dashboard'] // fallback p/ qualquer outra área admin
];

export const ADMIN_ROUTES = ['/admin'] as const;

export function requiresAdmin(pathname: string): boolean {
  return ADMIN_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

/** Escopo necessário para a rota admin, ou null se não for rota admin. */
export function requiredAdminScope(pathname: string): string | null {
  for (const [prefix, scope] of ADMIN_SCOPE_BY_PREFIX) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return scope;
  }
  return null;
}

// Check if route requires authentication
export function requiresAuth(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname as any)) {
    return false;
  }
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

// Auth page routes (where logged-in users should be redirected away from)
export const AUTH_ROUTES = [
  '/login',
  '/signup',
  '/password-recovery',
  '/login-anonimo',
] as const;

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.includes(pathname as any);
}
