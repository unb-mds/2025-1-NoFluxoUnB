/**
 * Parser dos marcadores que a Darcy usa nas respostas — o contrato está em
 * `docs/darcy-unificada.md` ("Ações no chat").
 *
 * Função pura e tipada, separada do `ChatPanel`, para o mesmo texto virar sempre
 * os mesmos blocos em qualquer tela; o que cada bloco FAZ ao ser clicado é decisão
 * da tela (prop `acoes` do `ChatPanel`), não do parser.
 *
 * - `[TURMA|turma|docente|horario|local|vagas(|periodo)(|COD|IDTURMA)]` → card.
 * - `[MONTAR_GRADE|COD:ID,...]` → grade pronta; `[MONTAR_GRADE|COD,COD]` → sugestão.
 *   Campos depois do primeiro (formato antigo: turnos, professores, `0`) são ignorados.
 * - `[BOTAO|rótulo(|mensagem)]` → resposta rápida; botões seguidos viram um grupo.
 * - Dentro da bolha: markdown leve — parágrafos, `### título`, listas (`-`, `1.`),
 *   tabela (`| a | b |` + linha `|---|`), `**negrito**`, `*itálico*`, `` `código` ``
 *   e códigos de matéria (`ABC1234`, viram chip). Nada vira HTML cru: o
 *   `ChatPanel` desenha cada linha com elementos Svelte.
 *
 * Marcador incompleto (sem `]`, ou com campos faltando) continua como texto.
 */

export interface SegmentoTexto {
	/** `codigo` = matéria (chip); `mono` = `código` inline que não é matéria. */
	tipo: 'texto' | 'codigo' | 'mono';
	valor: string;
	negrito: boolean;
	/** Só presente quando verdadeiro. */
	italico?: true;
}

/** Uma "linha" de bloco dentro da bolha de texto. */
export type LinhaBolha =
	| { tipo: 'paragrafo'; segmentos: SegmentoTexto[] }
	| { tipo: 'titulo'; segmentos: SegmentoTexto[] }
	| {
			tipo: 'lista';
			ordenada: boolean;
			/** Número do primeiro item (lista ordenada). */
			inicio: number;
			itens: SegmentoTexto[][];
	  }
	| { tipo: 'tabela'; cabecalho: SegmentoTexto[][]; linhas: SegmentoTexto[][][] };

export interface TurmaMarcador {
	turma: string;
	professor: string;
	horario: string;
	local: string;
	vagas: string;
	periodo?: string;
	/** Matéria da turma — ausente no formato antigo (aí o card não tem ação). */
	codigo?: string;
	/** `id_turmas` da oferta — ausente no formato antigo. */
	idTurma?: number;
}

export interface BotaoMarcador {
	rotulo: string;
	mensagem: string;
}

export type BlocoChat =
	| { tipo: 'bolha'; linhas: LinhaBolha[] }
	| { tipo: 'turma'; turma: TurmaMarcador }
	| { tipo: 'botoes'; botoes: BotaoMarcador[] }
	| {
			tipo: 'grade';
			/** Todos os códigos citados, na ordem. */
			codigos: string[];
			/** Pares código→turma; não vazio = grade pronta, vazio = sugestão. */
			selecao: Array<{ codigo: string; idTurma: number }>;
	  };

const RE_CODIGO = /\b[A-Z]{3,4}\d{4}\b/g;
const RE_MARCADOR = /\[(TURMA|BOTAO|MONTAR_GRADE)\|([^\]\n]*)\]/g;

/** Sem excesso de linhas em branco. */
function normalizarTexto(texto: string): string {
	return texto.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/** Quebra um trecho em texto + códigos de matéria. */
function segmentarCodigos(trecho: string, negrito: boolean, italico = false): SegmentoTexto[] {
	const out: SegmentoTexto[] = [];
	const seg = (tipo: SegmentoTexto['tipo'], valor: string): SegmentoTexto =>
		italico ? { tipo, valor, negrito, italico: true } : { tipo, valor, negrito };
	let ultimo = 0;
	for (const m of trecho.matchAll(RE_CODIGO)) {
		const i = m.index ?? 0;
		if (i > ultimo) out.push(seg('texto', trecho.slice(ultimo, i)));
		out.push(seg('codigo', m[0]));
		ultimo = i + m[0].length;
	}
	if (ultimo < trecho.length) out.push(seg('texto', trecho.slice(ultimo)));
	return out;
}

/** `` `código` ``, `**negrito**` (pode conter códigos) e `*itálico*`. */
const RE_INLINE =
	/`([^`\n]+)`|\*\*([^*\n]+)\*\*|(?<![*\w])\*(?![\s*])([^*\n]+?)(?<!\s)\*(?![*\w])/g;

/** Texto corrido → segmentos inline. */
function segmentarTexto(texto: string): SegmentoTexto[] {
	const out: SegmentoTexto[] = [];
	let ultimo = 0;
	for (const m of texto.matchAll(RE_INLINE)) {
		const i = m.index ?? 0;
		if (i > ultimo) out.push(...segmentarCodigos(texto.slice(ultimo, i), false));
		const [, mono, negrito, italico] = m;
		if (mono !== undefined) {
			const valor = mono.trim();
			out.push({
				tipo: /^[A-Z]{3,4}\d{4}$/.test(valor) ? 'codigo' : 'mono',
				valor,
				negrito: false
			});
		} else if (negrito !== undefined) {
			out.push(...segmentarCodigos(negrito, true));
		} else {
			out.push(...segmentarCodigos(italico, false, true));
		}
		ultimo = i + m[0].length;
	}
	if (ultimo < texto.length) out.push(...segmentarCodigos(texto.slice(ultimo), false));
	return out;
}

const RE_TITULO = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const RE_ITEM = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;
const RE_LINHA_TABELA = /^\s*\|.*\|\s*$/;
const RE_SEPARADOR_TABELA = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function celulas(linha: string): string[] {
	return linha
		.trim()
		.replace(/^\|/, '')
		.replace(/\|$/, '')
		.split('|')
		.map((c) => c.trim());
}

/** Texto de uma bolha → parágrafos, títulos, listas e tabelas. */
function linhasDaBolha(texto: string): LinhaBolha[] {
	const out: LinhaBolha[] = [];
	const linhas = texto.split('\n');
	let paragrafo: string[] = [];

	const fecharParagrafo = () => {
		const t = paragrafo.join('\n').trim();
		if (t) out.push({ tipo: 'paragrafo', segmentos: segmentarTexto(t) });
		paragrafo = [];
	};

	for (let i = 0; i < linhas.length; i++) {
		const linha = linhas[i];
		if (linha.trim() === '') {
			fecharParagrafo();
			continue;
		}
		const titulo = RE_TITULO.exec(linha);
		if (titulo) {
			fecharParagrafo();
			out.push({ tipo: 'titulo', segmentos: segmentarTexto(titulo[1]) });
			continue;
		}
		if (RE_LINHA_TABELA.test(linha) && RE_SEPARADOR_TABELA.test(linhas[i + 1] ?? '')) {
			fecharParagrafo();
			const cabecalho = celulas(linha).map(segmentarTexto);
			const corpo: SegmentoTexto[][][] = [];
			let j = i + 2;
			while (j < linhas.length && RE_LINHA_TABELA.test(linhas[j])) {
				corpo.push(celulas(linhas[j]).map(segmentarTexto));
				j++;
			}
			i = j - 1;
			out.push({ tipo: 'tabela', cabecalho, linhas: corpo });
			continue;
		}
		const item = RE_ITEM.exec(linha);
		if (item) {
			fecharParagrafo();
			const ordenada = item[2] !== undefined;
			const anterior = out[out.length - 1];
			const segmentos = segmentarTexto(item[3]);
			if (anterior?.tipo === 'lista' && anterior.ordenada === ordenada) {
				anterior.itens.push(segmentos);
			} else {
				out.push({
					tipo: 'lista',
					ordenada,
					inicio: ordenada ? Number(item[2]) : 1,
					itens: [segmentos]
				});
			}
			continue;
		}
		// Linha recuada logo depois de um item: continuação dele.
		const anterior = out[out.length - 1];
		if (paragrafo.length === 0 && anterior?.tipo === 'lista' && /^\s{2,}\S/.test(linha)) {
			anterior.itens[anterior.itens.length - 1].push(...segmentarTexto('\n' + linha.trim()));
			continue;
		}
		paragrafo.push(linha);
	}
	fecharParagrafo();
	return out;
}

/** Texto puro de uma bolha (prévia de conversa anterior). */
export function textoDaBolha(bloco: Extract<BlocoChat, { tipo: 'bolha' }>): string {
	const texto = (segs: SegmentoTexto[]) => segs.map((s) => s.valor).join('');
	return bloco.linhas
		.map((linha) => {
			if (linha.tipo === 'lista') {
				return linha.itens
					.map((item, i) => (linha.ordenada ? `${linha.inicio + i}. ` : '• ') + texto(item))
					.join('\n');
			}
			if (linha.tipo === 'tabela') {
				return [linha.cabecalho, ...linha.linhas].map((l) => l.map(texto).join(' · ')).join('\n');
			}
			return texto(linha.segmentos);
		})
		.join('\n\n');
}

function parseTurma(campos: string[]): TurmaMarcador | null {
	if (campos.length < 5) return null;
	const [turma, professor, horario, local, vagas, periodo, codigo, id] = campos.map((c) =>
		c.trim()
	);
	if (!turma) return null;
	const idTurma = Number(id);
	return {
		turma,
		professor,
		horario,
		local,
		vagas,
		periodo: periodo || undefined,
		codigo: codigo ? codigo.toUpperCase() : undefined,
		idTurma: id && Number.isInteger(idTurma) && idTurma > 0 ? idTurma : undefined
	};
}

function parseGrade(campos: string[]): Extract<BlocoChat, { tipo: 'grade' }> | null {
	const codigos: string[] = [];
	const selecao: Array<{ codigo: string; idTurma: number }> = [];
	for (const item of (campos[0] ?? '').split(',')) {
		const [cod, id] = item.split(':');
		const codigo = (cod ?? '').trim().toUpperCase();
		if (!/^[A-Z]{3,4}\d{4}$/.test(codigo)) continue;
		codigos.push(codigo);
		const idTurma = Number((id ?? '').trim());
		if (id !== undefined && Number.isInteger(idTurma) && idTurma > 0) {
			selecao.push({ codigo, idTurma });
		}
	}
	return codigos.length > 0 ? { tipo: 'grade', codigos, selecao } : null;
}

function parseBotao(campos: string[]): BotaoMarcador | null {
	const rotulo = (campos[0] ?? '').trim();
	if (!rotulo) return null;
	const mensagem = (campos.slice(1).join('|') || rotulo).trim();
	return { rotulo, mensagem };
}

/** Texto da resposta → blocos para renderizar. */
export function parseMensagemChat(texto: string): BlocoChat[] {
	const fonte = normalizarTexto(texto);
	const blocos: BlocoChat[] = [];
	let textoPendente = '';

	const fecharBolha = () => {
		if (textoPendente.trim() !== '') {
			const linhas = linhasDaBolha(textoPendente);
			if (linhas.length > 0) blocos.push({ tipo: 'bolha', linhas });
		}
		textoPendente = '';
	};

	let ultimo = 0;
	for (const m of fonte.matchAll(RE_MARCADOR)) {
		const i = m.index ?? 0;
		const campos = m[2].split('|');
		let bloco: BlocoChat | null = null;
		if (m[1] === 'TURMA') {
			const turma = parseTurma(campos);
			bloco = turma ? { tipo: 'turma', turma } : null;
		} else if (m[1] === 'MONTAR_GRADE') {
			bloco = parseGrade(campos);
		} else {
			const botao = parseBotao(campos);
			bloco = botao ? { tipo: 'botoes', botoes: [botao] } : null;
		}

		textoPendente += fonte.slice(ultimo, i);
		ultimo = i + m[0].length;
		if (!bloco) {
			// Marcador malformado: some o que não dá pra mostrar sem quebrar a leitura.
			if (m[1] === 'TURMA' || m[1] === 'BOTAO') textoPendente += m[0];
			continue;
		}
		fecharBolha();
		const anterior = blocos[blocos.length - 1];
		if (bloco.tipo === 'botoes' && anterior?.tipo === 'botoes') {
			anterior.botoes.push(...bloco.botoes);
		} else {
			blocos.push(bloco);
		}
	}
	textoPendente += fonte.slice(ultimo);
	fecharBolha();
	return blocos;
}

/**
 * Índice da mensagem cujas ações de resposta (`[BOTAO]`, "Usar esta turma",
 * menus de chip) ainda valem: a última resposta da Darcy, e só se nada veio
 * depois dela e ela não está esperando resposta. `-1` = nenhuma.
 *
 * Responder um "Sim" de três perguntas atrás é responder fora de contexto; por
 * isso as respostas antigas ficam só para leitura.
 */
export function indiceRespostaViva(
	mensagens: ReadonlyArray<{ role: 'user' | 'assistant' }>,
	carregando: boolean
): number {
	if (carregando || mensagens.length === 0) return -1;
	const ultima = mensagens.length - 1;
	return mensagens[ultima].role === 'assistant' ? ultima : -1;
}

/** Frase que "Perguntar sobre" envia — nunca o código cru. */
export function mensagemPerguntarSobre(codigo: string, nome?: string): string {
	return nome ? `Me conta sobre ${nome} (${codigo})` : `Me conta sobre a matéria ${codigo}`;
}

/**
 * Corta o texto para a animação de digitação sem deixar um marcador, um
 * `**negrito**` ou um `` `código` `` pela metade (renderizaria cru até o fim da animação).
 */
export function fatiaSegura(texto: string, n: number): string {
	let out = texto.slice(0, n);
	const abre = out.lastIndexOf('[');
	if (abre >= 0 && out.indexOf(']', abre) === -1) out = out.slice(0, abre);
	const asteriscos = out.split('**').length - 1;
	if (asteriscos % 2 === 1) out = out.slice(0, out.lastIndexOf('**'));
	const crases = out.split('`').length - 1;
	if (crases % 2 === 1) out = out.slice(0, out.lastIndexOf('`'));
	return out;
}
