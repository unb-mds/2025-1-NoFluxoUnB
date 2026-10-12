import { describe, it, expect } from 'vitest';
import {
	parseMensagemChat,
	fatiaSegura,
	indiceRespostaViva,
	mensagemPerguntarSobre,
	textoDaBolha,
	type BlocoChat,
	type LinhaBolha
} from './chat-markers';

const tipos = (b: BlocoChat[]) => b.map((x) => x.tipo);

/** Linhas da única bolha de `texto`. */
function linhas(texto: string): LinhaBolha[] {
	const [b] = parseMensagemChat(texto);
	if (b?.tipo !== 'bolha') throw new Error('esperava bolha');
	return b.linhas;
}

/** Segmentos do primeiro parágrafo de `texto`. */
function paragrafo(texto: string) {
	const [l] = linhas(texto);
	if (l.tipo !== 'paragrafo') throw new Error(`esperava parágrafo, veio ${l.tipo}`);
	return l.segmentos;
}

/** Texto puro da bolha `i`. */
function textoBolha(b: BlocoChat[], i = 0): string {
	const bolha = b[i];
	if (bolha?.tipo !== 'bolha') throw new Error('esperava bolha');
	return textoDaBolha(bolha);
}

describe('parseMensagemChat — texto, negrito e códigos', () => {
	it('texto simples vira uma bolha com um parágrafo', () => {
		const b = parseMensagemChat('Olá, tudo bem?');
		expect(b).toEqual([
			{
				tipo: 'bolha',
				linhas: [
					{
						tipo: 'paragrafo',
						segmentos: [{ tipo: 'texto', valor: 'Olá, tudo bem?', negrito: false }]
					}
				]
			}
		]);
	});

	it('códigos de matéria viram segmentos próprios', () => {
		const segs = paragrafo('Pegue FGA0240 antes de MAT0026.');
		expect(segs.filter((s) => s.tipo === 'codigo').map((s) => s.valor)).toEqual([
			'FGA0240',
			'MAT0026'
		]);
	});

	it('código dentro de **negrito** continua sendo código, marcado como negrito', () => {
		const segs = paragrafo('Recomendo **Cálculo 2 (MAT0026)** agora.');
		expect(segs.find((s) => s.tipo === 'codigo')).toEqual({
			tipo: 'codigo',
			valor: 'MAT0026',
			negrito: true
		});
		expect(segs.some((s) => s.tipo === 'texto' && s.negrito)).toBe(true);
	});

	it('*itálico* e `código` inline', () => {
		const segs = paragrafo('Use *com calma* o `freeMask` e `MAT0026`.');
		expect(segs).toEqual([
			{ tipo: 'texto', valor: 'Use ', negrito: false },
			{ tipo: 'texto', valor: 'com calma', negrito: false, italico: true },
			{ tipo: 'texto', valor: ' o ', negrito: false },
			{ tipo: 'mono', valor: 'freeMask', negrito: false },
			{ tipo: 'texto', valor: ' e ', negrito: false },
			{ tipo: 'codigo', valor: 'MAT0026', negrito: false },
			{ tipo: 'texto', valor: '.', negrito: false }
		]);
	});

	it('asterisco solto (3 * 4) não vira itálico', () => {
		expect(paragrafo('São 3 * 4 = 12 créditos').every((s) => !s.italico)).toBe(true);
	});

	it('linhas em branco separam parágrafos; quebra simples fica no parágrafo', () => {
		const l = linhas('Um\ndois\n\n\n\nTrês');
		expect(l.map((x) => x.tipo)).toEqual(['paragrafo', 'paragrafo']);
		expect(textoBolha(parseMensagemChat('Um\ndois\n\n\n\nTrês'))).toBe('Um\ndois\n\nTrês');
	});
});

describe('parseMensagemChat — listas, títulos e tabelas', () => {
	it('itens com - * • viram uma lista não ordenada', () => {
		const l = linhas('Itens:\n- um\n* dois\n• três');
		expect(l.map((x) => x.tipo)).toEqual(['paragrafo', 'lista']);
		const lista = l[1];
		if (lista.tipo !== 'lista') return;
		expect(lista.ordenada).toBe(false);
		expect(lista.itens.map((i) => i.map((s) => s.valor).join(''))).toEqual(['um', 'dois', 'três']);
	});

	it('lista ordenada guarda o número inicial', () => {
		const [lista] = linhas('3. três\n4) quatro');
		expect(lista).toMatchObject({ tipo: 'lista', ordenada: true, inicio: 3 });
		if (lista.tipo === 'lista') expect(lista.itens).toHaveLength(2);
	});

	it('item com negrito e código', () => {
		const [lista] = linhas('- **MAT0026** — Cálculo 2');
		if (lista.tipo !== 'lista') throw new Error('esperava lista');
		expect(lista.itens[0][0]).toEqual({ tipo: 'codigo', valor: 'MAT0026', negrito: true });
	});

	it('linha recuada logo após um item continua o item', () => {
		const [lista] = linhas('- primeiro\n  continua aqui\n- segundo');
		if (lista.tipo !== 'lista') throw new Error('esperava lista');
		expect(lista.itens).toHaveLength(2);
		expect(lista.itens[0].map((s) => s.valor).join('')).toBe('primeiro\ncontinua aqui');
	});

	it('### título vira linha de título', () => {
		const l = linhas('### Opção 1\nMenos dias.');
		expect(l[0]).toEqual({
			tipo: 'titulo',
			segmentos: [{ tipo: 'texto', valor: 'Opção 1', negrito: false }]
		});
		expect(l[1].tipo).toBe('paragrafo');
	});

	it('tabela com separador vira cabeçalho + linhas', () => {
		const [t] = linhas('| Opção | Dias |\n|---|:--:|\n| A | 3 |\n| B | 4 |');
		if (t.tipo !== 'tabela') throw new Error('esperava tabela');
		const txt = (c: { valor: string }[]) => c.map((s) => s.valor).join('');
		expect(t.cabecalho.map(txt)).toEqual(['Opção', 'Dias']);
		expect(t.linhas.map((l) => l.map(txt))).toEqual([
			['A', '3'],
			['B', '4']
		]);
	});

	it('linha com | sem separador continua texto', () => {
		expect(linhas('| só isso |').map((x) => x.tipo)).toEqual(['paragrafo']);
	});

	it('textoDaBolha achata lista e tabela', () => {
		const b = parseMensagemChat('Veja:\n1. A\n2. B\n\n| x | y |\n|---|---|\n| 1 | 2 |');
		expect(textoBolha(b)).toBe('Veja:\n\n1. A\n2. B\n\nx · y\n1 · 2');
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
		expect(textoBolha(b)).not.toContain('MONTAR_GRADE');
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
		expect(textoBolha(b)).toContain('[BOTAO|Sim');
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
	it('não deixa `código` aberto', () => {
		expect(fatiaSegura('Use `freeMask` aí', 8)).toBe('Use ');
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
		expect(mensagemPerguntarSobre('MAT0026', 'Cálculo 2')).toBe(
			'Me conta sobre Cálculo 2 (MAT0026)'
		);
		expect(mensagemPerguntarSobre('MAT0026')).toBe('Me conta sobre a matéria MAT0026');
	});
});
