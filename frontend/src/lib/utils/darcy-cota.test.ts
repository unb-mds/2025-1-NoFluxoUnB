import { describe, it, expect } from 'vitest';
import {
	classificarErroIA,
	cotaRenovou,
	ErroIA,
	estadoRodinha,
	montarPedidoMaisPerguntas,
	MSG_TETO_GLOBAL,
	TIPO_TICKET_PEDIDO
} from './darcy-cota';
import { isAiSemCreditos } from './ai-errors';

describe('estadoRodinha', () => {
	it('azul no uso normal, com o texto do tooltip', () => {
		expect(estadoRodinha({ usadas: 12, limite: 30 })).toEqual({
			fracao: 0.4,
			percentual: 40,
			cor: 'azul',
			rotulo: '12 de 30 perguntas hoje. Renova à meia-noite.',
			esgotada: false
		});
	});

	it('âmbar quando restam 20% ou menos', () => {
		expect(estadoRodinha({ usadas: 23, limite: 30 }).cor).toBe('azul'); // restam 7 (23%)
		expect(estadoRodinha({ usadas: 24, limite: 30 }).cor).toBe('ambar'); // restam 6 (20%)
		expect(estadoRodinha({ usadas: 29, limite: 30 }).cor).toBe('ambar');
	});

	it('vermelho e anel cheio no limite', () => {
		const e = estadoRodinha({ usadas: 30, limite: 30 });
		expect(e).toMatchObject({ cor: 'vermelho', fracao: 1, percentual: 100, esgotada: true });
	});

	it('limite aumentado por concessão passa do padrão sem estourar o anel', () => {
		expect(estadoRodinha({ usadas: 31, limite: 60 })).toMatchObject({ cor: 'azul', percentual: 52 });
		expect(estadoRodinha({ usadas: 70, limite: 60 })).toMatchObject({ fracao: 1, cor: 'vermelho' });
	});

	it('limite 0 conta como esgotado', () => {
		expect(estadoRodinha({ usadas: 0, limite: 0 })).toMatchObject({ cor: 'vermelho', esgotada: true });
	});

	it('singular com limite 1', () => {
		expect(estadoRodinha({ usadas: 0, limite: 1 }).rotulo).toBe('0 de 1 pergunta hoje. Renova à meia-noite.');
	});
});

describe('classificarErroIA', () => {
	it('401 LOGIN_NECESSARIO → login', () => {
		const e = new ErroIA(401, '{"codigo":"LOGIN_NECESSARIO","error":"Faça login"}', '/assistente/chat');
		expect(classificarErroIA(e)).toEqual({ tipo: 'login' });
	});

	it('401 sem código (sessão inválida no /planejamento/chat) → login', () => {
		expect(classificarErroIA(new Error('Erro 401 ao chamar chat agente: {"error":"Usuário não autorizado"}'))).toEqual({
			tipo: 'login'
		});
	});

	it('429 COTA_DIARIA → cota, com usadas/limite/renova_em', () => {
		const corpo = JSON.stringify({
			codigo: 'COTA_DIARIA',
			usadas: 30,
			limite: 30,
			renova_em: '2026-09-30T03:00:00.000Z'
		});
		expect(classificarErroIA(new ErroIA(429, corpo, '/chat/send'))).toEqual({
			tipo: 'cota',
			cota: { usadas: 30, limite: 30, restantes: 0, renova_em: '2026-09-30T03:00:00.000Z' },
			mensagem: 'Você usou suas 30 perguntas de hoje'
		});
	});

	it('503 TETO_GLOBAL → teto com a mensagem amigável', () => {
		expect(classificarErroIA(new ErroIA(503, '{"codigo":"TETO_GLOBAL"}', 'assistente'))).toEqual({
			tipo: 'teto',
			mensagem: MSG_TETO_GLOBAL
		});
	});

	it('sem créditos e erros genéricos seguem para a bolha de sempre', () => {
		const semCreditos = new ErroIA(503, '{"error":"...","code":"ai_sem_creditos"}', '/chat/send');
		expect(classificarErroIA(semCreditos)).toEqual({ tipo: 'outro' });
		expect(isAiSemCreditos(semCreditos)).toBe(true); // mensagem no formato antigo
		expect(classificarErroIA(new Error('Erro 500 ao chamar /chat/send: timeout'))).toEqual({ tipo: 'outro' });
		expect(classificarErroIA(new TypeError('Failed to fetch'))).toEqual({ tipo: 'outro' });
	});
});

describe('cotaRenovou', () => {
	it('só depois da meia-noite de Brasília informada', () => {
		const cota = { renova_em: '2026-09-30T03:00:00.000Z' };
		expect(cotaRenovou(cota, Date.parse('2026-09-30T02:59:59Z'))).toBe(false);
		expect(cotaRenovou(cota, Date.parse('2026-09-30T03:00:00Z'))).toBe(true);
	});
});

describe('montarPedidoMaisPerguntas', () => {
	it('monta o ticket com título identificável e usadas/limite no corpo', () => {
		const p = montarPedidoMaisPerguntas('  Semana de provas, preciso revisar  ', 'semana', { usadas: 30, limite: 30 });
		expect(p.title).toBe('Mais perguntas no Darcy');
		expect(p.description).toContain('Pedido: Esta semana');
		expect(p.description).toContain('30 de 30 perguntas usadas hoje');
		expect(p.description).toContain('Semana de provas, preciso revisar');
		expect(p.metadata).toEqual({
			tipo: TIPO_TICKET_PEDIDO,
			opcao: 'semana',
			motivo: 'Semana de provas, preciso revisar',
			usadas: 30,
			limite: 30
		});
	});
});
