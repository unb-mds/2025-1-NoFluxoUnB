/**
 * Contraste do texto dentro do chat da Darcy (ChatPanel + ChatBubble), lendo as
 * classes REAIS dos componentes. Nasceu do bug do negrito: `<strong>` tinha
 * `text-white` fixo e, no tema claro, ficava branco sobre a bolha lilás
 * (`bg-accent`) — invisível. Mesmo padrão nos botões do header e no chip de
 * matéria.
 */
import { describe, expect, it } from 'vitest';
import { lerSrc, piorContraste, type Camada, type Tema } from './contraste';

const PAINEL = lerSrc('lib/components/chat/ChatPanel.svelte');
const BOLHA = lerSrc('lib/components/chat/ChatBubble.svelte');

function achar(fonte: string, re: RegExp, oque: string): string {
	const m = re.exec(fonte);
	if (!m) throw new Error(`não achei ${oque}`);
	return m[1];
}

const BOLHA_DARCY = achar(BOLHA, /:\s*'(bg-accent [^']+)'/, 'classes da bolha da Darcy');
const BOLHA_ALUNO = achar(BOLHA, /\?\s*'(bg-primary [^']+)'/, 'classes da bolha do aluno');
const NEGRITO = achar(PAINEL, /<strong class="([^"]+)"/, '<strong> do texto');
const CHIP = achar(PAINEL, /class="chip-materia ([^{"]+)/, 'chip de matéria');
const HEADER = achar(PAINEL, /<!-- Header -->\s*<div\s+class="([^"{]+)/, 'header do chat');
const BOTAO_HEADER = achar(
	PAINEL,
	/class="([^"{]+)"\s*title="Começar uma conversa nova/,
	'botão do header'
);

/** Fundo do shell do chat: bg-card no claro, #09090b forçado no escuro (ChatWrapper). */
const SHELL: Record<Tema, Camada> = { light: { token: 'card' }, dark: { cor: '#09090b' } };

/** Texto herdado: a cor do filho vence; sem cor própria, herda a da bolha. */
const herdado = (pai: string, filho: string) => `${pai} ${filho}`;

describe.each(['light', 'dark'] as Tema[])('chat da Darcy no tema %s', (tema) => {
	it('negrito na bolha da Darcy ≥ 4,5:1', () => {
		const r = piorContraste(tema, herdado(BOLHA_DARCY, NEGRITO), [SHELL[tema], BOLHA_DARCY]);
		expect(r, `${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
	});

	it('negrito na bolha do aluno ≥ 4,5:1', () => {
		const r = piorContraste(tema, herdado(BOLHA_ALUNO, NEGRITO), [SHELL[tema], BOLHA_ALUNO]);
		expect(r, `${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
	});

	it('chip de matéria ≥ 4,5:1 sobre a bolha', () => {
		const r = piorContraste(tema, CHIP, [SHELL[tema], BOLHA_DARCY, CHIP]);
		expect(r, `${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
	});

	it('botões do header (Conversas anteriores / Nova conversa) ≥ 4,5:1', () => {
		const r = piorContraste(tema, BOTAO_HEADER, [SHELL[tema], HEADER]);
		expect(r, `${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
	});
});

describe('regressão: branco fixo sem par dark:', () => {
	it.each([
		['<strong>', NEGRITO],
		['chip de matéria', CHIP],
		['botão do header', BOTAO_HEADER]
	])('%s não usa text-white sem dark:', (_, classes) => {
		expect(classes.split(/\s+/)).not.toContain('text-white');
	});
});
