/**
 * Alerta de saldo da IA renderizado no servidor (svelte/server): o que o admin
 * lê no topo do dashboard e no card de saldo, com o banco antes da migration
 * 20260930_ai_saldo (RPC ausente → status null) sem quebrar a página.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import IaSaldoAlertas from './IaSaldoAlertas.svelte';
import IaSaldoCard from './IaSaldoCard.svelte';
import { AGORA, statusSaldo } from '$lib/utils/ia-saldo.fixture';

const texto = (html: string) =>
	html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;| /g, ' ')
		.replace(/\s+/g, ' ');

const nada = async () => {};

describe('IaSaldoAlertas', () => {
	it('sem status ou sem alerta: nada no topo', () => {
		expect(texto(render(IaSaldoAlertas, { props: { status: null, agora: AGORA } }).body).trim()).toBe('');
		expect(texto(render(IaSaldoAlertas, { props: { status: statusSaldo(), agora: AGORA } }).body).trim()).toBe('');
	});

	it('um bloco por alerta, na ordem de prioridade, com o link do painel', () => {
		const { body } = render(IaSaldoAlertas, {
			props: {
				agora: AGORA,
				status: statusSaldo({
					alertas: ['sem_creditos', 'urgente', 'desatualizado'],
					saldo_estimado: 3,
					sem_creditos: { janela_horas: 24, eventos: 1, ultimo_evento: '2026-09-30T17:00:00Z' }
				})
			}
		});
		const niveis = [...body.matchAll(/data-nivel="([a-z_]+)"/g)].map((m) => m[1]);
		expect(niveis).toEqual(['sem_creditos', 'urgente', 'desatualizado']);
		expect(body.match(/role="alert"/g)).toHaveLength(2);
		expect(body).toContain('role="status"');
		const t = texto(body);
		expect(t.indexOf('Créditos acabaram')).toBeLessThan(t.indexOf('Urgente: saldo da IA acabando'));
		expect(t).toContain('Saldo desatualizado — confira em plataforma.maritaca.ai');
		expect(body).toContain('href="https://plataforma.maritaca.ai"');
		expect(body).toContain('rel="noopener noreferrer"');
	});

	it('cor por token de status (danger/warning), nunca cor fixa', () => {
		const { body } = render(IaSaldoAlertas, {
			props: { agora: AGORA, status: statusSaldo({ alertas: ['atencao'], saldo_estimado: 20 }) }
		});
		expect(body).toContain('bg-status-warning/10');
		expect(body).toContain('text-status-warning');
		expect(body).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
	});
});

describe('IaSaldoCard', () => {
	it('banco sem a migration: explica, sem formulário', () => {
		const { body } = render(IaSaldoCard, { props: { status: null, onRegistrar: nada } });
		expect(texto(body)).toContain('Saldo indisponível — aplique a migration 20260930_ai_saldo.sql');
		expect(body).not.toContain('<form');
	});

	it('mostra a estimativa, a previsão, quem informou por último e o aviso honesto', () => {
		const t = texto(
			render(IaSaldoCard, {
				props: {
					agora: AGORA,
					onRegistrar: nada,
					status: statusSaldo({
						saldo_estimado: 145.75,
						custo_desde_base: 4.25,
						base: { valor: 100, registrado_em: '2026-09-28T13:00:00Z', recargas: 50, n_recargas: 1 },
						ultimo_registro: {
							...statusSaldo().ultimo_registro!,
							tipo: 'recarga',
							valor: 50,
							observacao: 'boleto pago'
						}
					})
				}
			}).body
		);
		expect(t).toContain('Saldo estimado R$ 145,75');
		expect(t).toContain('R$ 100,00 informados em 28/09/2026, 10:00 + R$ 50,00 em 1 recarga − R$ 4,25 gastos desde então');
		expect(t).toContain('Dá para ~50 dias (média de R$ 2,00/dia nos últimos 7 dias).');
		expect(t).toContain('Recarga de R$ 50,00 · Ana Admin · há 2 dias');
		expect(t).toContain('“boleto pago”');
		expect(t).toContain(
			'Estimativa. Calculada com preço cheio; a Maritaca dá descontos (noturno, cache), então o saldo real tende a ser um pouco maior.'
		);
		expect(t).toContain('Informar saldo atual');
		expect(t).toContain('Registrar recarga');
	});

	it('saldo nunca informado: sem valor inventado e recarga bloqueada', () => {
		const { body } = render(IaSaldoCard, {
			props: {
				agora: AGORA,
				onRegistrar: nada,
				status: statusSaldo({
					configurado: false,
					saldo_estimado: null,
					base: null,
					ultimo_registro: null,
					alertas: ['desatualizado'],
					nivel: 'desatualizado'
				})
			}
		});
		const t = texto(body);
		expect(t).toContain('Saldo estimado —');
		expect(t).toContain('Nenhum saldo informado ainda.');
		expect(body).toMatch(/<button[^>]*disabled[^>]*title="Informe o saldo atual antes de registrar uma recarga\."/);
	});

	it('saldo urgente em vermelho de status, atenção em âmbar de status', () => {
		const urgente = render(IaSaldoCard, {
			props: { agora: AGORA, onRegistrar: nada, status: statusSaldo({ alertas: ['urgente'], saldo_estimado: 5 }) }
		}).body;
		expect(urgente).toMatch(/class="[^"]*text-status-danger[^"]*" data-testid="saldo-estimado"/);
		const atencao = render(IaSaldoCard, {
			props: { agora: AGORA, onRegistrar: nada, status: statusSaldo({ alertas: ['atencao'], saldo_estimado: 25 }) }
		}).body;
		expect(atencao).toMatch(/class="[^"]*text-status-warning[^"]*" data-testid="saldo-estimado"/);
	});

	it('modelo da Maritaca sem preço aparece no card', () => {
		const t = texto(
			render(IaSaldoCard, {
				props: { agora: AGORA, onRegistrar: nada, status: statusSaldo({ modelos_maritaca_sem_preco: ['sabia-5'] }) }
			}).body
		);
		expect(t).toContain('Sem preço em ai_pricing (entram como R$ 0 no gasto): sabia-5.');
	});
});
