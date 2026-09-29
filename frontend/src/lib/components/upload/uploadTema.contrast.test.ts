/**
 * Contraste do upload de histórico (dropzone + mensagens de erro) nos DOIS temas.
 *
 * Regra do produto: o que existe no dark tem que funcionar no light. Os valores
 * vêm do próprio app.css (:root = light, .dark = dark) e da paleta do Tailwind,
 * então trocar um token ou voltar a usar uma cor "só do escuro" (text-red-400,
 * text-amber-400, #fff fixo...) quebra este teste.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
	MIN_GRAFICO,
	MIN_TEXTO,
	misturar,
	paletaTailwind,
	razaoContraste,
	tokenHslParaRgb,
	tokensPorTema,
	type Rgb,
	type Tema
} from '$lib/styles/contrast';

const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const appCss = ler('../../../app.css');
const dropzoneSrc = ler('./FileDropzone.svelte');
const paginaSrc = ler('../../../routes/(protected)/upload-historico/+page.svelte');
const paleta = paletaTailwind(
	readFileSync(createRequire(import.meta.url).resolve('tailwindcss/theme.css'), 'utf8')
);

const TEMAS: Tema[] = ['light', 'dark'];
const tokens = tokensPorTema(appCss);
const t = (tema: Tema, nome: string): Rgb => {
	const v = tokens[tema][nome];
	if (!v) throw new Error(`token --${nome} ausente no tema ${tema}`);
	return tokenHslParaRgb(v);
};

/** Superfícies onde o conteúdo do upload aparece, por tema. */
function superficies(tema: Tema) {
	const card = t(tema, 'card');
	const bg = t(tema, 'background');
	const primary = t(tema, 'primary');
	return {
		card,
		background: bg,
		// .dropzone (repouso) e .dropzone--drag
		dropzone: misturar(primary, 0.04, card),
		dropzoneHover: misturar(primary, 0.07, card),
		dropzoneDrag: misturar(primary, 0.1, card),
		// .retry-btn
		retryBtn: misturar(t(tema, 'secondary'), 0.55, card),
		// botão "Preencha manualmente" (bg-purple-500/10 sobre a página)
		manualBtn: misturar(paleta['purple-500'], 0.1, bg),
		manualBtnHover: misturar(paleta['purple-500'], 0.2, bg)
	};
}

describe.each(TEMAS)('upload de histórico — tema %s', (tema) => {
	const s = superficies(tema);
	const fg = t(tema, 'foreground');
	const fg72 = (sobre: Rgb) => misturar(fg, 0.72, sobre);

	it('dropzone: título, "ou" e dica têm contraste de texto', () => {
		for (const sup of [s.dropzone, s.dropzoneHover, s.dropzoneDrag]) {
			expect(razaoContraste(fg, sup)).toBeGreaterThanOrEqual(MIN_TEXTO);
			expect(razaoContraste(fg72(sup), sup)).toBeGreaterThanOrEqual(MIN_TEXTO);
		}
	});

	it('dropzone: botão "Selecionar arquivo" e ícone sobre o primary', () => {
		const primary = t(tema, 'primary');
		const primaryFg = t(tema, 'primary-foreground');
		// No dark fica em 4,50:1 — no limite; clarear o --primary do dark quebra aqui.
		expect(razaoContraste(primaryFg, primary)).toBeGreaterThanOrEqual(MIN_TEXTO);
	});

	it('mensagens de erro: título e texto (PDF inválido, com senha, não é histórico)', () => {
		expect(razaoContraste(fg, s.card)).toBeGreaterThanOrEqual(MIN_TEXTO);
		expect(razaoContraste(t(tema, 'muted-foreground'), s.card)).toBeGreaterThanOrEqual(MIN_TEXTO);
		expect(razaoContraste(fg, s.retryBtn)).toBeGreaterThanOrEqual(MIN_TEXTO);
	});

	it.each(['status-danger', 'status-warning'])(
		'ícone de erro/aviso (%s) sobre o círculo tingido e o card',
		(nome) => {
			const cor = t(tema, nome);
			const circulo = misturar(cor, 0.1, s.card);
			expect(razaoContraste(cor, circulo)).toBeGreaterThanOrEqual(MIN_GRAFICO);
			expect(razaoContraste(cor, s.card)).toBeGreaterThanOrEqual(MIN_GRAFICO);
		}
	);

	it.each(['status-success', 'status-warning', 'status-danger', 'status-info'])(
		'token %s serve como texto sobre background e card',
		(nome) => {
			const cor = t(tema, nome);
			expect(razaoContraste(cor, s.background)).toBeGreaterThanOrEqual(MIN_TEXTO);
			expect(razaoContraste(cor, s.card)).toBeGreaterThanOrEqual(MIN_TEXTO);
		}
	);

	it('botão "Preencha manualmente" (par purple light/dark)', () => {
		const [texto, hover] =
			tema === 'light'
				? [paleta['purple-700'], paleta['purple-800']]
				: [paleta['purple-300'], paleta['purple-200']];
		expect(razaoContraste(texto, s.manualBtn)).toBeGreaterThanOrEqual(MIN_TEXTO);
		expect(razaoContraste(hover, s.manualBtnHover)).toBeGreaterThanOrEqual(MIN_TEXTO);
	});
});

describe('upload de histórico — sem cor que só funciona no escuro', () => {
	// Classe de paleta clara (100–400) sem o prefixo `dark:` = só legível no fundo escuro.
	const CLARA_SEM_DARK = /(?<![\w:-])(?:hover:)?text-[a-z]+-[1-4]00\b/g;
	// Branco/preto fixo no CSS em vez de token (ex.: color: #fff; hsl(0 0% 100% / .12) em borda).
	const FIXO_CSS =
		/(?:color|stroke|fill|border(?:-color)?)\s*:[^;]*(?:#fff\b|#ffffff\b|hsl\(0 0% 100%)/gi;

	it.each([
		['FileDropzone.svelte', dropzoneSrc],
		['upload-historico/+page.svelte', paginaSrc]
	])('%s', (_nome, src) => {
		expect(src.match(CLARA_SEM_DARK) ?? []).toEqual([]);
		expect(src.match(FIXO_CSS) ?? []).toEqual([]);
		expect(src).not.toMatch(/hsl\(0 72% 51%/); // vermelho fixo do círculo de erro
	});

	it('os ícones de erro/aviso usam os tokens de status', () => {
		expect(paginaSrc).toContain('text-status-danger');
		expect(paginaSrc).toContain('text-status-warning');
	});
});
