import { describe, expect, it } from 'vitest';
import { AGORA, statusSaldo } from './ia-saldo.fixture';
import {
	alertasSaldo,
	fmtDataHora,
	fmtDiasRestantes,
	fmtMoeda,
	parseValorReais,
	TEXTO_ESTIMATIVA,
	textoPrevisao,
	textoUltimoRegistro,
	TOM_DO_NIVEL,
	URL_PAINEL_MARITACA
} from './ia-saldo';

describe('alertasSaldo', () => {
	it('sem status (RPC ausente) ou tudo ok: nenhum alerta', () => {
		expect(alertasSaldo(null, AGORA)).toEqual([]);
		expect(alertasSaldo(statusSaldo(), AGORA)).toEqual([]);
	});

	it('mantém a ordem de prioridade do banco e o tom de cada nível', () => {
		const a = alertasSaldo(
			statusSaldo({
				alertas: ['sem_creditos', 'urgente', 'desatualizado'],
				saldo_estimado: 3,
				sem_creditos: { janela_horas: 24, eventos: 2, ultimo_evento: '2026-09-30T17:30:00Z' }
			}),
			AGORA
		);
		expect(a.map((x) => [x.nivel, x.tom])).toEqual([
			['sem_creditos', 'danger'],
			['urgente', 'danger'],
			['desatualizado', 'neutral']
		]);
		expect(TOM_DO_NIVEL.atencao).toBe('warning');
	});

	it('créditos acabaram: conta as chamadas recusadas e diz há quanto tempo', () => {
		const [a] = alertasSaldo(
			statusSaldo({
				alertas: ['sem_creditos'],
				sem_creditos: { janela_horas: 24, eventos: 3, ultimo_evento: '2026-09-30T17:30:00Z' }
			}),
			AGORA
		);
		expect(a.titulo).toBe('Créditos acabaram');
		expect(a.texto).toContain('recusou 3 chamadas por falta de créditos nas últimas 24 h (a última há 30 min)');
	});

	it('créditos acabaram: não promete que registrar a recarga apaga o aviso', () => {
		const [a] = alertasSaldo(
			statusSaldo({
				alertas: ['sem_creditos'],
				sem_creditos: { janela_horas: 24, eventos: 1, ultimo_evento: '2026-09-30T17:30:00Z' }
			}),
			AGORA
		);
		expect(a.texto).toContain('registre a recarga aqui para o saldo estimado ficar certo');
		expect(a.texto).toContain('só some quando passarem 24 h sem novas recusas');
	});

	it('créditos acabaram com recarga já registrada depois da recusa: explica por que o aviso segue', () => {
		const base = statusSaldo();
		const [a] = alertasSaldo(
			statusSaldo({
				alertas: ['sem_creditos'],
				sem_creditos: { janela_horas: 24, eventos: 1, ultimo_evento: '2026-09-30T17:30:00Z' },
				ultimo_registro: { ...base.ultimo_registro!, tipo: 'recarga', registrado_em: '2026-09-30T17:45:00Z' }
			}),
			AGORA
		);
		expect(a.texto).toContain('Já há registro de saldo depois da última recusa');
		expect(a.texto).toContain('some sozinho quando passarem 24 h sem novas recusas');
		expect(a.texto).not.toContain('registre a recarga');
	});

	it('urgente por reais: mostra o saldo e o limiar que disparou', () => {
		const [a] = alertasSaldo(
			statusSaldo({
				alertas: ['urgente'],
				saldo_estimado: 9.5,
				previsao: { ...statusSaldo().previsao, dias_restantes: 4.75 }
			}),
			AGORA
		);
		expect(a.titulo).toBe('Urgente: saldo da IA acabando');
		expect(a.texto.replace(/\s/g, ' ')).toContain(
			'Saldo estimado: R$ 9,50 — dá para ~4 dias (abaixo de R$ 10,00 e menos de 5 dias de uso)'
		);
	});

	it('atenção por dias com saldo acima do limiar em reais', () => {
		const [a] = alertasSaldo(
			statusSaldo({
				alertas: ['atencao'],
				saldo_estimado: 100,
				previsao: { ...statusSaldo().previsao, media_diaria: 10, dias_restantes: 10 }
			}),
			AGORA
		);
		expect(a.titulo).toBe('Atenção: saldo da IA baixo');
		expect(a.texto).toContain('(menos de 14 dias de uso)');
		expect(a.texto).not.toContain('abaixo de');
	});

	it('limiares vêm do banco (config do admin), não de constante do front', () => {
		const [a] = alertasSaldo(
			statusSaldo({
				alertas: ['atencao'],
				saldo_estimado: 100,
				previsao: { ...statusSaldo().previsao, dias_restantes: null, media_diaria: 0 },
				limiares: { ...statusSaldo().limiares, atencao_reais: 200 }
			}),
			AGORA
		);
		expect(a.texto.replace(/\s/g, ' ')).toContain('(abaixo de R$ 200,00)');
	});

	it('desatualizado: nunca informado vs. registro antigo', () => {
		const [nunca] = alertasSaldo(
			statusSaldo({ alertas: ['desatualizado'], configurado: false, ultimo_registro: null }),
			AGORA
		);
		expect(nunca.titulo).toBe('Saldo desatualizado — confira em plataforma.maritaca.ai');
		expect(nunca.texto).toContain('nunca foi informado');

		const [velho] = alertasSaldo(
			statusSaldo({
				alertas: ['desatualizado'],
				ultimo_registro: { ...statusSaldo().ultimo_registro!, registrado_em: '2026-09-10T13:00:00Z' }
			}),
			AGORA
		);
		expect(velho.texto).toContain('O último registro foi há 20 dias (mais de 15 dias)');
	});
});

describe('previsão', () => {
	it('7 dias completos', () => {
		expect(textoPrevisao(statusSaldo()).replace(/\s/g, ' ')).toBe(
			'Dá para ~50 dias (média de R$ 2,00/dia nos últimos 7 dias).'
		);
	});

	it('menos de 7 dias de dados: indica quantos', () => {
		const s = statusSaldo({
			previsao: { ...statusSaldo().previsao, dias_considerados: 1, parcial: true, media_diaria: 3, dias_restantes: 33.3 }
		});
		expect(textoPrevisao(s).replace(/\s/g, ' ')).toBe(
			'Dá para ~33 dias (média de R$ 3,00/dia em 1 dia de dados (menos de 7)).'
		);
	});

	it('só hoje no log: diz de quantas horas veio a projeção', () => {
		const s = statusSaldo({
			previsao: {
				...statusSaldo().previsao,
				dias_considerados: 0,
				horas_hoje: 15,
				parcial: true,
				media_diaria: 4.8,
				dias_restantes: 10
			}
		});
		expect(textoPrevisao(s).replace(/\s/g, ' ')).toBe(
			'Dá para ~10 dias (média de R$ 4,80/dia projetada de 15 horas de uso hoje — menos de 1 dia de dados, estimativa instável).'
		);
	});

	it('sem gasto: sem previsão absurda', () => {
		const s = statusSaldo({ previsao: { ...statusSaldo().previsao, media_diaria: 0, dias_restantes: null } });
		expect(textoPrevisao(s)).toBe('Sem gasto na Maritaca nos últimos 7 dias — sem previsão.');
		expect(textoPrevisao(s)).not.toMatch(/Infinity|NaN/);
	});

	it('sem log nenhum', () => {
		const s = statusSaldo({
			previsao: { ...statusSaldo().previsao, dias_considerados: 0, media_diaria: null, dias_restantes: null }
		});
		expect(textoPrevisao(s)).toBe('Sem uso da Maritaca registrado ainda — sem previsão.');
	});

	it('gasto sem saldo informado: só a média', () => {
		const s = statusSaldo({ configurado: false, previsao: { ...statusSaldo().previsao, dias_restantes: null } });
		expect(textoPrevisao(s).replace(/\s/g, ' ')).toBe('Gasto: média de R$ 2,00/dia nos últimos 7 dias.');
	});

	it.each([
		[null, null],
		[0, 'menos de 1 dia'],
		[0.4, 'menos de 1 dia'],
		[1.9, '~1 dia'],
		[12.7, '~12 dias'],
		[5000, 'mais de um ano']
	])('fmtDiasRestantes(%s) → %s', (dias, esperado) => {
		expect(fmtDiasRestantes(dias)).toBe(esperado);
	});
});

describe('formatação', () => {
	it('moeda em pt-BR', () => {
		expect(fmtMoeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
		expect(fmtMoeda(-3).replace(/\s/g, ' ')).toBe('-R$ 3,00');
	});

	it('data e hora de Brasília', () => {
		expect(fmtDataHora('2026-09-28T13:00:00Z')).toBe('28/09/2026, 10:00');
		expect(fmtDataHora(null)).toBe('—');
	});

	it('último registro: tipo, valor, quem e quando', () => {
		expect(textoUltimoRegistro(statusSaldo(), AGORA).replace(/\s/g, ' ')).toBe(
			'Saldo atual de R$ 100,00 · Ana Admin · há 2 dias'
		);
		expect(textoUltimoRegistro(statusSaldo({ ultimo_registro: null }), AGORA)).toBe(
			'Nenhum saldo informado ainda.'
		);
	});

	it('texto honesto sobre o preço cheio e link para o painel', () => {
		expect(TEXTO_ESTIMATIVA).toBe(
			'Estimativa. Calculada com preço cheio; a Maritaca dá descontos (noturno, cache), então o saldo real tende a ser um pouco maior.'
		);
		expect(URL_PAINEL_MARITACA).toBe('https://plataforma.maritaca.ai');
	});
});

describe('parseValorReais', () => {
	it.each([
		['123,45', 123.45],
		['1.234,56', 1234.56],
		['R$ 50', 50],
		['1234.5', 1234.5],
		['0', 0],
		['  10,0 ', 10]
	])('%s → %s', (txt, v) => {
		expect(parseValorReais(txt)).toBe(v);
	});

	it.each(['', 'abc', '-5', '12,345', '1.234'])('%s é recusado', (txt) => {
		expect(parseValorReais(txt)).toBeNull();
	});

	it('recarga de zero é recusada; saldo zero não', () => {
		expect(parseValorReais('0', 'recarga')).toBeNull();
		expect(parseValorReais('0', 'saldo_atual')).toBe(0);
	});
});
