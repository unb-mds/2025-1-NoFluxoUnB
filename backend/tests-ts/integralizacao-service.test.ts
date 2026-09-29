import { calcularIntegralizacao, pct } from '../src/services/integralizacao.service';

// Mock do SupabaseWrapper: `.from().select().eq().maybeSingle()` devolve a matriz do teste.
var mockMatriz: Record<string, unknown> | null = null;
jest.mock('../src/supabase_wrapper', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    like: () => builder,
    order: () => builder,
    limit: async () => ({ data: [], error: null }),
    maybeSingle: async () => ({ data: mockMatriz, error: null }),
  };
  return { SupabaseWrapper: { get: () => ({ from: () => builder }) } };
});

const MATRIZ = {
  id_matriz: 1,
  id_curso: 6360,
  curriculo_completo: '6360/1 - 2017.1',
  ch_obrigatoria_exigida: 3000,
  ch_optativa_exigida: 855,
  ch_complementar_exigida: 0,
  ch_total_exigida: 3855,
};

describe('integralizacao.service (backend)', () => {
  beforeEach(() => {
    mockMatriz = { ...MATRIZ };
  });

  // Pré-mortem R13: Math.round levava 3840/3855 (99,6%) para 100% com 15 h faltando.
  it('pct nunca chega a 100 faltando horas', () => {
    expect(pct(3855, 3840)).toBe(99);
    expect(pct(3855, 3855)).toBe(100);
    expect(pct(0, 10)).toBe(0);
    expect(pct(100, -13)).toBe(0);
  });

  it('3840 de 3855 h: pctTotal 99 e faltam 15 h', async () => {
    const r = await calcularIntegralizacao('6360/1 - 2017.1', {
      obrigatoria: 2990,
      optativa: 850,
      complementar: 0,
      total: 3840,
    });
    expect(r?.faltam.chTotal).toBe(15);
    expect(r?.pctTotal).toBe(99);
    expect(r?.pctObrigatoria).toBe(99);
  });

  it('CH em string no body não é concatenada', async () => {
    const r = await calcularIntegralizacao('6360/1 - 2017.1', {
      obrigatoria: '990' as unknown as number,
      optativa: '120' as unknown as number,
      complementar: '0' as unknown as number,
      total: 0,
    });
    expect(r?.realizado.chTotal).toBe(1110);
  });
});
