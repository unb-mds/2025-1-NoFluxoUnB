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
 * - `**negrito**` e códigos de matéria (`ABC1234`) ficam dentro da bolha de texto.
 *
 * Marcador incompleto (sem `]`, ou com campos faltando) continua como texto.
 */

export interface SegmentoTexto {
	tipo: 'texto' | 'codigo';
	valor: string;
	negrito: boolean;
}

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
	| { tipo: 'bolha'; segmentos: SegmentoTexto[] }
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

/** Tipografia: bullets de verdade e sem excesso de linhas em branco. */
function normalizarTexto(texto: string): string {
	return texto
		.replace(/\n{3,}/g, '\n\n')
		.replace(/^[ \t]*[-*]\s+/gm, '•  ')
		.replace(/^[ \t]*(\d+)[.)]\s+/gm, '$1.  ');
}

/** Quebra um trecho em texto + códigos de matéria. */
function segmentarCodigos(trecho: string, negrito: boolean): SegmentoTexto[] {
	const out: SegmentoTexto[] = [];
	let ultimo = 0;
	for (const m of trecho.matchAll(RE_CODIGO)) {
		const i = m.index ?? 0;
		if (i > ultimo) out.push({ tipo: 'texto', valor: trecho.slice(ultimo, i), negrito });
		out.push({ tipo: 'codigo', valor: m[0], negrito });
		ultimo = i + m[0].length;
	}
	if (ultimo < trecho.length) out.push({ tipo: 'texto', valor: trecho.slice(ultimo), negrito });
	return out;
}

/** Texto corrido → segmentos, respeitando `**negrito**` (que pode conter códigos). */
function segmentarTexto(texto: string): SegmentoTexto[] {
	const out: SegmentoTexto[] = [];
	const re = /\*\*([^*\n]+)\*\*/g;
	let ultimo = 0;
	for (const m of texto.matchAll(re)) {
		const i = m.index ?? 0;
		if (i > ultimo) out.push(...segmentarCodigos(texto.slice(ultimo, i), false));
		out.push(...segmentarCodigos(m[1], true));
		ultimo = i + m[0].length;
	}
	if (ultimo < texto.length) out.push(...segmentarCodigos(texto.slice(ultimo), false));
	return out;
}

function parseTurma(campos: string[]): TurmaMarcador | null {
	if (campos.length < 5) return null;
	const [turma, professor, horario, local, vagas, periodo, codigo, id] = campos.map((c) => c.trim());
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
			blocos.push({ tipo: 'bolha', segmentos: segmentarTexto(textoPendente) });
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
 * Corta o texto para a animação de digitação sem deixar um marcador ou um
 * `**negrito**` pela metade (renderizaria cru até o fim da animação).
 */
export function fatiaSegura(texto: string, n: number): string {
	let out = texto.slice(0, n);
	const abre = out.lastIndexOf('[');
	if (abre >= 0 && out.indexOf(']', abre) === -1) out = out.slice(0, abre);
	const asteriscos = out.split('**').length - 1;
	if (asteriscos % 2 === 1) out = out.slice(0, out.lastIndexOf('**'));
	return out;
}
