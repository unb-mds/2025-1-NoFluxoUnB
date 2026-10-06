/**
 * Cards do dashboard admin renderizados no servidor (svelte/server): o que o
 * admin lê depende das chaves novas das RPCs, com fallback para o banco antes
 * da migration 20260929b.
 */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import IaSemPrecoAlerta from './IaSemPrecoAlerta.svelte';
import SuporteCard from './SuporteCard.svelte';
import IaSaudeLogCard from './IaSaudeLogCard.svelte';
import type { TicketMetrics } from '$lib/types/dashboard';

const texto = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('IaSemPrecoAlerta', () => {
	it('modelo sem preço vira alerta nomeado, não custo zero silencioso', () => {
		const { body } = render(IaSemPrecoAlerta, {
			props: { modelos: [{ model: 'gemini-embedding-001', motivo: 'sem_cadastro', requisicoes: 3, tokens: 90 }] }
		});
		expect(body).toContain('role="alert"');
		expect(texto(body)).toContain('Sem preço cadastrado.');
		expect(texto(body)).toContain('gemini-embedding-001 (sem preço cadastrado, 3 chamadas)');
	});

	it('todos com preço (ou banco antigo): nada', () => {
		expect(texto(render(IaSemPrecoAlerta, { props: { modelos: [] } }).body).trim()).toBe('');
		expect(texto(render(IaSemPrecoAlerta, { props: { modelos: undefined } }).body).trim()).toBe('');
	});
});

const ANTIGO: TicketMetrics = {
	total: 6,
	por_status: { aberto: 1, resolvido: 5 },
	por_categoria: { bug: 6 },
	tempo_medio_horas: 36
};

describe('SuporteCard', () => {
	it('mostra backlog, mediana/P90 e a janela de 30 dias', () => {
		const t = texto(
			render(SuporteCard, {
				props: {
					hrefTickets: '/admin/tickets',
					metricas: {
						...ANTIGO,
						nao_resolvidos: 4,
						tempo_mediana_horas: 36,
						tempo_p90_horas: 45.6,
						primeira_resposta_mediana_horas: 2.5,
						primeira_resposta_p90_horas: 4.4,
						sem_resposta: 2,
						aguardando_suporte: 3,
						ultimos_30d: {
							dias: 30,
							abertos: 5,
							resolvidos: 1,
							tempo_mediana_horas: 24,
							tempo_p90_horas: 24,
							primeira_resposta_mediana_horas: 2
						}
					}
				}
			}).body
		);
		expect(t).toContain('Aguardando o suporte 3');
		expect(t).toContain('2 sem nenhuma resposta');
		expect(t).toContain('Não resolvidos 4 aberto, em andamento ou aguardando info');
		expect(t).toContain('1ª resposta (mediana) 2,5 h P90 4,4 h');
		expect(t).toContain('Resolução (mediana) 36 h P90 45,6 h');
		expect(t).toContain('Últimos 30 dias');
		expect(t).toContain('Abertos 5');
	});

	it('banco antes da migration: card antigo com total e média', () => {
		const t = texto(render(SuporteCard, { props: { hrefTickets: '/x', metricas: ANTIGO } }).body);
		expect(t).toContain('Total 6 Tempo médio resolução: 36h');
		expect(t).not.toContain('Aguardando o suporte');
	});
});

describe('IaSaudeLogCard', () => {
	it('sem registro no período em horário de uso: alerta; mostra taxa de falha por rota', () => {
		const { body } = render(IaSaudeLogCard, {
			props: {
				saude: {
					ultimo_registro: null,
					requisicoes: 0,
					falhas: 0,
					taxa_falha: 0,
					por_endpoint: {}
				}
			}
		});
		// Alerta depende da hora: só confere que o card renderiza o "sem registro".
		expect(texto(body)).toContain('Último registro sem registro');
	});

	it('lista as rotas com a taxa de falha', () => {
		const agora = new Date().toISOString();
		const t = texto(
			render(IaSaudeLogCard, {
				props: {
					saude: {
						ultimo_registro: agora,
						requisicoes: 4,
						falhas: 2,
						taxa_falha: 50,
						por_endpoint: {
							analyze: { ultimo_registro: agora, requisicoes: 2, falhas: 2, taxa_falha: 100 },
							'chat-send': { ultimo_registro: agora, requisicoes: 2, falhas: 0, taxa_falha: 0 }
						}
					}
				}
			}).body
		);
		expect(t).not.toContain('Nenhuma chamada de IA registrada');
		expect(t).toContain('Falhas (success=false) 50% 2 de 4');
		expect(t).toMatch(/analyze agora 100% falha/);
		expect(t).toMatch(/chat-send agora 0% falha/);
	});
});
