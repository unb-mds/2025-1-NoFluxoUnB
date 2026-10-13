/**
 * Regressão: a bolha de texto do chat se ajusta ao conteúdo (`max-w-[88%]` num
 * flex `items-start`). `@container` (container-type: inline-size) faz o
 * elemento ignorar o conteúdo para medir a própria largura — dentro da bolha,
 * ela encolhia a zero e o texto saía com uma letra por linha.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ler = (nome: string) => readFileSync(fileURLToPath(new URL(nome, import.meta.url)), 'utf8');

describe('layout das bolhas do chat', () => {
	it('nada dentro da bolha de texto usa @container', () => {
		const painel = ler('./ChatPanel.svelte');
		const ini = painel.indexOf('<ChatBubble');
		const fim = painel.indexOf('</ChatBubble>', ini);
		expect(ini).toBeGreaterThan(-1);
		expect(painel.slice(ini, fim)).not.toMatch(/@container|@(?:sm|md|lg|xl):/);
		expect(ler('./ChatBubble.svelte')).not.toContain('@container');
	});

	it('cards com @container têm largura definida (w-full)', () => {
		for (const arq of ['./GradePreviewChat.svelte', './AcoesGradeCard.svelte']) {
			for (const m of ler(arq).matchAll(/class="([^"]*@container[^"]*)"/g)) {
				expect(m[1].split(/\s+/), arq).toContain('w-full');
			}
		}
	});
});
