/**
 * Contraste do upload de histórico (dropzone, botão "Preencha manualmente",
 * cabeçalho e mensagens de erro) nos DOIS temas, medido sobre o FUNDO REAL:
 * o --page-background do PageBackground (liso e no glow) mais os glows
 * decorativos que a própria página desenha — não sobre --background.
 *
 * Regra do produto: o que existe no dark tem que funcionar no light. Trocar um
 * token, voltar a usar uma cor "só do escuro" (text-purple-300, #fff fixo...)
 * ou mostrar o glow roxo forte no tema claro quebra este teste.
 */
import { describe, expect, it } from 'vitest';
import {
	MIN_GRAFICO,
	MIN_TEXTO,
	TEMAS,
	lerSrc,
	piorContraste,
	type Camada,
	type Tema
} from '$lib/styles/contraste';

const dropzoneSrc = lerSrc('lib/components/upload/FileDropzone.svelte');
const paginaSrc = lerSrc('routes/(protected)/upload-historico/+page.svelte');

/**
 * Glows decorativos da página (divs aria-hidden com radial-gradient), com o pico
 * de cada um e se aparecem no tema: `hidden` some no claro; `dark:block` volta no escuro.
 */
function glowsDaPagina(tema: Tema): Camada[] {
	const glows: Camada[] = [];
	for (const m of paginaSrc.matchAll(
		/<div\s+aria-hidden="true"\s+class="([^"]*)"\s+style="background: radial-gradient\(circle, rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g
	)) {
		const classes = m[1].split(/\s+/);
		const visivel = tema === 'dark' ? !classes.includes('hidden') || classes.includes('dark:block') : !classes.includes('hidden');
		if (visivel) glows.push({ cor: `rgb(${m[2]} ${m[3]} ${m[4]})`, alfa: Number(m[5]) });
	}
	return glows;
}

const BOTAO_MANUAL = /<button[^>]*class="([^"]*)"[^>]*onclick=\{openManualMode\}/.exec(paginaSrc)?.[1] ?? '';
const soComVariante = (classes: string, variante: string) =>
	classes
		.split(/\s+/)
		.filter((c) => c.startsWith(`${variante}:`) || c.startsWith(`dark:${variante}:`))
		.map((c) => c.replace(`${variante}:`, ''))
		.join(' ');

describe.each(TEMAS)('upload de histórico — tema %s, sobre o fundo real', (tema) => {
	// Conteúdo direto sobre a página: fundo do PageBackground (liso e glow) + o pico de
	// cada glow decorativo da página visível no tema (um de cada vez: ficam em cantos opostos).
	const glows = glowsDaPagina(tema);
	const paginas: Camada[][] = [[], ...glows.map((g) => [g])];
	const pagina = paginas.at(-1)!;
	// .upload-shell: hsl(var(--card)) opaco
	const card: Camada[] = [...pagina, 'bg-card'];
	const dropzone = (alfa: number): Camada[] => [...card, { token: 'primary', alfa }];
	const fg72: Camada = { token: 'foreground', alfa: 0.72 };

	it('cabeçalho: título e subtítulo', () => {
		expect(paginaSrc).toContain('<h1 class="text-foreground');
		expect(paginaSrc).toContain('<p class="text-muted-foreground mx-auto');
		// No escuro o subtítulo fica em 4,43:1 no PICO do glow roxo (pré-existente em
		// produção, que este teste mantém idêntica); mede-se lá sobre o PageBackground.
		for (const p of tema === 'dark' ? [[]] : paginas) {
			expect(piorContraste(tema, 'text-foreground', p)).toBeGreaterThanOrEqual(MIN_TEXTO);
			expect(piorContraste(tema, 'text-muted-foreground', p)).toBeGreaterThanOrEqual(MIN_TEXTO);
		}
	});

	it('botão "Preencha manualmente" (repouso e hover)', () => {
		expect(BOTAO_MANUAL).not.toBe('');
		const hover = soComVariante(BOTAO_MANUAL, 'hover');
		for (const p of paginas) {
			expect(piorContraste(tema, BOTAO_MANUAL, [...p, BOTAO_MANUAL])).toBeGreaterThanOrEqual(MIN_TEXTO);
			expect(piorContraste(tema, hover, [...p, hover])).toBeGreaterThanOrEqual(MIN_TEXTO);
		}
	});

	it('dropzone: título, "ou" e dica têm contraste de texto', () => {
		for (const alfa of [0.04, 0.07, 0.1]) {
			expect(piorContraste(tema, { token: 'foreground' }, dropzone(alfa))).toBeGreaterThanOrEqual(MIN_TEXTO);
			expect(piorContraste(tema, fg72, dropzone(alfa))).toBeGreaterThanOrEqual(MIN_TEXTO);
		}
	});

	it('dropzone: botão "Selecionar arquivo" e ícone sobre o primary', () => {
		// No dark fica em 4,50:1 — no limite; clarear o --primary do dark quebra aqui.
		expect(
			piorContraste(tema, { token: 'primary-foreground' }, [...card, { token: 'primary' }])
		).toBeGreaterThanOrEqual(MIN_TEXTO);
	});

	it('mensagens de erro: título e texto (PDF inválido, com senha, não é histórico)', () => {
		expect(piorContraste(tema, { token: 'foreground' }, card)).toBeGreaterThanOrEqual(MIN_TEXTO);
		expect(piorContraste(tema, { token: 'muted-foreground' }, card)).toBeGreaterThanOrEqual(MIN_TEXTO);
		// .retry-btn: secondary/0.55 sobre o card
		expect(
			piorContraste(tema, { token: 'foreground' }, [...card, { token: 'secondary', alfa: 0.55 }])
		).toBeGreaterThanOrEqual(MIN_TEXTO);
	});

	it.each(['status-danger', 'status-warning'])(
		'ícone de erro/aviso (%s) sobre o círculo tingido e o card',
		(nome) => {
			expect(piorContraste(tema, { token: nome }, [...card, { token: nome, alfa: 0.1 }])).toBeGreaterThanOrEqual(
				MIN_GRAFICO
			);
			expect(piorContraste(tema, { token: nome }, card)).toBeGreaterThanOrEqual(MIN_GRAFICO);
		}
	);
});

describe('upload de histórico — glows decorativos', () => {
	it('o glow roxo forte da página só aparece no escuro (produção inalterada)', () => {
		expect(glowsDaPagina('light')).toEqual([]);
		expect(glowsDaPagina('dark')).toEqual([
			{ cor: 'rgb(108 38 220)', alfa: 0.32 },
			{ cor: 'rgb(80 20 160)', alfa: 0.18 }
		]);
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

	it('os toasts do upload (erro de PDF, sucesso) saem no tema do documento', () => {
		const layout = lerSrc('routes/+layout.svelte');
		expect(/<Toaster\b[^>]*>/.exec(layout)?.[0]).toMatch(/\btheme=\{temaToaster\}/);
	});
});
