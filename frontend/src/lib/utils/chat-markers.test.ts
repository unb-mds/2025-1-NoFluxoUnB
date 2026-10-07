import { describe, it, expect } from 'vitest';
import {
	parseMensagemChat,
	fatiaSegura,
	indiceRespostaViva,
	mensagemPerguntarSobre,
	type BlocoChat
} from './chat-markers';

const tipos = (b: BlocoChat[]) => b.map((x) => x.tipo);

describe('parseMensagemChat — texto, negrito e códigos', () => {
	it('texto simples vira uma bolha', () => {
		const b = parseMensagemChat('Olá, tudo bem?');
		expect(b).toEqual([
			{ tipo: 'bolha', segmentos: [{ tipo: 'texto', valor: 'Olá, tudo bem?', negrito: false }] }
		]);
	});

	it('códigos de matéria viram segmentos próprios', () => {
		const [bolha] = parseMensagemChat('Pegue FGA0240 antes de MAT0026.');
		expect(bolha.tipo).toBe('bolha');
		if (bolha.tipo !== 'bolha') return;
		expect(bolha.segmentos.filter((s) => s.tipo === 'codigo').map((s) => s.valor)).toEqual([
			'FGA0240',
			'MAT0026'
		]);
	});

	it('código dentro de **negrito** continua sendo código, marcado como negrito', () => {
		const [bolha] = parseMensagemChat('Recomendo **Cálculo 2 (MAT0026)** agora.');
		if (bolha.tipo !== 'bolha') throw new Error('esperava bolha');
		const codigo = bolha.segmentos.find((s) => s.tipo === 'codigo');
		expect(codigo).toEqual({ tipo: 'codigo', valor: 'MAT0026', negrito: true });
		expect(bolha.segmentos.some((s) => s.tipo === 'texto' && s.negrito)).toBe(true);
	});

	it('normaliza bullets e linhas em branco em excesso', () => {
		const [bolha] = parseMensagemChat('Itens:\n\n\n\n- um\n* dois');
		if (bolha.tipo !== 'bolha') throw new Error('esperava bolha');
		const texto = bolha.segmentos.map((s) => s.valor).join('');
		expect(texto).toBe('Itens:\n\n•  um\n•  dois');
	});
});

describe('parseMensagemChat — [TURMA]', () => {
	it('formato novo traz código e id da turma', () => {
		const b = parseMensagemChat(
			'Turmas:\n[TURMA|01|RAFAEL MORGADO|24M12|FGA I1|10/40|2026.2|IFD0171|1234]'
		);
		expect(tipos(b)).toEqual(['bolha', 'turma']);
		expect(b[1]).toEqual({
			tipo: 'turma',
			turma: {
				turma: '01',
				professor: 'RAFAEL MORGADO',
				horario: '24M12',
				local: 'FGA I1',
				vagas: '10/40',
				periodo: '2026.2',
				codigo: 'IFD0171',
				idTurma: 1234
			}
		});
	});

	it('formato antigo de 5 e 6 campos continua valendo, sem ação', () => {
		const [cinco] = parseMensagemChat('[TURMA|01|Prof|24M12|Sala|10]');
		const [seis] = parseMensagemChat('[TURMA|01|Prof|24M12|Sala|10|2026.2]');
		expect(cinco.tipo === 'turma' && cinco.turma.codigo).toBeFalsy();
		expect(seis.tipo === 'turma' && seis.turma.periodo).toBe('2026.2');
		expect(seis.tipo === 'turma' && seis.turma.idTurma).toBeUndefined();
	});

	it('TURMA com campos de menos vira texto', () => {
		const b = parseMensagemChat('[TURMA|01|Prof]');
		expect(tipos(b)).toEqual(['bolha']);
	});
});

describe('parseMensagemChat — [MONTAR_GRADE]', () => {
	it('pares COD:ID = grade pronta', () => {
		const [g] = parseMensagemChat('[MONTAR_GRADE|IFD0171:12,MAT0026:34]');
		expect(g).toEqual({
			tipo: 'grade',
			codigos: ['IFD0171', 'MAT0026'],
			selecao: [
				{ codigo: 'IFD0171', idTurma: 12 },
				{ codigo: 'MAT0026', idTurma: 34 }
			]
		});
	});

	it('só códigos = sugestão (seleção vazia)', () => {
		const [g] = parseMensagemChat('[MONTAR_GRADE|IFD0171,MAT0026]');
		expect(g).toEqual({ tipo: 'grade', codigos: ['IFD0171', 'MAT0026'], selecao: [] });
	});

	it('campos do formato antigo (turnos, professores, 0) são ignorados', () => {
		const [g] = parseMensagemChat('[MONTAR_GRADE|IFD0171|M,T|IFD0171=Fulano|0]');
		expect(g).toEqual({ tipo: 'grade', codigos: ['IFD0171'], selecao: [] });
	});

	it('sem código válido não gera bloco nem sobra texto cru', () => {
		const b = parseMensagemChat('Pronto. [MONTAR_GRADE|M,T]');
		expect(tipos(b)).toEqual(['bolha']);
		if (b[0].tipo !== 'bolha') return;
		expect(b[0].segmentos.map((s) => s.valor).join('')).not.toContain('MONTAR_GRADE');
	});
});

describe('parseMensagemChat — [BOTAO]', () => {
	it('botões seguidos viram um grupo', () => {
		const b = parseMensagemChat('Quer?\n[BOTAO|Sim|Sim, monta]\n[BOTAO|Não]');
		expect(tipos(b)).toEqual(['bolha', 'botoes']);
		expect(b[1]).toEqual({
			tipo: 'botoes',
			botoes: [
				{ rotulo: 'Sim', mensagem: 'Sim, monta' },
				{ rotulo: 'Não', mensagem: 'Não' }
			]
		});
	});

	it('marcador sem fechar colchete continua como texto', () => {
		const b = parseMensagemChat('Escolha [BOTAO|Sim');
		expect(tipos(b)).toEqual(['bolha']);
		if (b[0].tipo !== 'bolha') return;
		expect(b[0].segmentos.map((s) => s.valor).join('')).toContain('[BOTAO|Sim');
	});

	it('texto entre botões separa os grupos', () => {
		const b = parseMensagemChat('[BOTAO|A]\nmeio\n[BOTAO|B]');
		expect(tipos(b)).toEqual(['botoes', 'bolha', 'botoes']);
	});
});

describe('fatiaSegura', () => {
	it('não corta marcador pela metade', () => {
		expect(fatiaSegura('Oi [BOTAO|Sim]', 9)).toBe('Oi ');
	});
	it('não deixa negrito aberto', () => {
		expect(fatiaSegura('Oi **forte** fim', 6)).toBe('Oi ');
	});
});


describe('indiceRespostaViva — ações só na última resposta', () => {
	const u = { role: 'user' as const };
	const a = { role: 'assistant' as const };

	it('a última resposta da Darcy é a viva', () => {
		expect(indiceRespostaViva([u, a, u, a], false)).toBe(3);
	});
	it('respostas antigas ficam só para leitura depois de nova pergunta', () => {
		expect(indiceRespostaViva([u, a, u], false)).toBe(-1);
	});
	it('nada vivo enquanto carrega (clique já enviado)', () => {
		expect(indiceRespostaViva([u, a], true)).toBe(-1);
	});
	it('conversa vazia não tem resposta viva', () => {
		expect(indiceRespostaViva([], false)).toBe(-1);
	});
});

describe('mensagemPerguntarSobre', () => {
	it('frase completa com nome e código, nunca o código cru', () => {
		expect(mensagemPerguntarSobre('MAT0026', 'Cálculo 2')).toBe('Me conta sobre Cálculo 2 (MAT0026)');
		expect(mensagemPerguntarSobre('MAT0026')).toBe('Me conta sobre a matéria MAT0026');
	});
});
