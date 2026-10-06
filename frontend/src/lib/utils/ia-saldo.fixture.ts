/**
 * Status de saldo como o get_ai_saldo_status devolve — fixture dos testes do
 * alerta de saldo (não é importado pela aplicação).
 */
import type { AiSaldoStatus } from '$lib/types/dashboard';

export const AGORA = new Date('2026-09-30T18:00:00Z'); // 15h em Brasília

/** Status padrão (saldo R$ 100, R$ 2/dia, sem alerta) com o que o teste mudar. */
export function statusSaldo(parcial: Partial<AiSaldoStatus> = {}): AiSaldoStatus {
	return {
		moeda: 'BRL',
		agora: AGORA.toISOString(),
		configurado: true,
		saldo_estimado: 100,
		saldo_base: 100,
		custo_desde_base: 0,
		base: { valor: 100, registrado_em: '2026-09-28T13:00:00Z', recargas: 0, n_recargas: 0 },
		ultimo_registro: {
			tipo: 'saldo_atual',
			valor: 100,
			registrado_em: '2026-09-28T13:00:00Z',
			registrado_por: 'a',
			nome: 'Ana Admin',
			email: 'admin@unb.br',
			observacao: null,
			dias_atras: 2.2
		},
		previsao: {
			janela_dias: 7,
			dias_considerados: 7,
			horas_hoje: null,
			parcial: false,
			custo_janela: 14,
			media_diaria: 2,
			dias_restantes: 50
		},
		sem_creditos: { janela_horas: 24, eventos: 0, ultimo_evento: null },
		modelos_maritaca: ['sabia-4', 'sabiazinho-4'],
		modelos_maritaca_sem_preco: [],
		limiares: { urgente_reais: 10, urgente_dias: 5, atencao_reais: 30, atencao_dias: 14, desatualizado_dias: 15 },
		alertas: [],
		nivel: 'ok',
		...parcial
	};
}
