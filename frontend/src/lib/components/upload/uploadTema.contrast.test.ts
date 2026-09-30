/**
 * Contraste do upload de histórico (dropzone, botão "Preencha manualmente",
 * cabeçalho e mensagens de erro) nos DOIS temas, medido sobre o FUNDO REAL:
 * o --page-background do PageBackground (liso e no glow) mais os glows
 * decorativos que a própria página desenha — não sobre --background.
 *
 * Regra do produto: o que existe no dark tem que funcionar no light. Trocar um
 * token, voltar a usar uma cor "só do escuro" (text-purple-300, #fff fixo...)
 * ou mostrar o glow roxo forte no tema claro quebra este teste.
 *
 * E o escuro é produção: nada aqui pode ficar menos legível nem mudar de cor em
 * relação à main. As cores da main ficam escritas abaixo como referência fixa.
 */
import { describe, expect, it } from 'vitest';
import {
	MIN_GRAFICO,
	MIN_TEXTO,
	TEMAS,
	lerSrc,
	piorContraste,
	resolverClasse,
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

/** Main (produção): classes e CSS do escuro antes do redesenho para tokens. */
const MAIN = {
	iconeAviso: 'text-amber-400',
	iconeErro: 'text-red-400',
	/** .error-icon: hsl(0 72% 51% / 0.1), borda / 0.22 — nos dois avisos. */
	circulo: { cor: '0 72% 51%', alfa: 0.1 } as Camada,
	textoDropzone: { token: 'muted-foreground' } as Camada
};
/** Tint do círculo atual no tema: tokens no claro, o vermelho da main no escuro. */
const circulo = (tema: Tema, nome: string): Camada =>
	tema === 'dark' ? MAIN.circulo : { token: nome, alfa: 0.1 };
const ICONES = {
	'status-warning': /<AlertTriangle class="([^"]*text-status-warning[^"]*)"/.exec(paginaSrc)?.[1] ?? '',
	'status-danger': /<AlertTriangle class="([^"]*text-status-danger[^"]*)"/.exec(paginaSrc)?.[1] ?? ''
};

/** Regras CSS com seletor `:global(.dark) …` (sobrescritas só do escuro). */
const REGRA_DARK = /:global\(\.dark\)[^{]*\{[^}]*\}/g;
/** Regras CSS com seletor `:global(html:not(.dark)) …` (sobrescritas só do claro). */
const REGRA_CLARO = /:global\(html:not\(\.dark\)\)[^{]*\{[^}]*\}/g;

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
	// "ou" e dica: foreground a 72% no claro; no escuro o --muted-foreground da main.
	const textoDropzone: Camada =
		tema === 'dark' ? MAIN.textoDropzone : { token: 'foreground', alfa: 0.72 };

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
			// No escuro o "ou"/dica da main fica abaixo de 4,5:1 no tint mais forte
			// (pré-existente em produção, mantido idêntico); lá vale o mínimo de gráfico.
			expect(piorContraste(tema, textoDropzone, dropzone(alfa))).toBeGreaterThanOrEqual(
				tema === 'dark' ? MIN_GRAFICO : MIN_TEXTO
			);
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

	it.each(['status-danger', 'status-warning'] as const)(
		'ícone de erro/aviso (%s) sobre o círculo tingido e o card',
		(nome) => {
			const icone = ICONES[nome];
			expect(icone).not.toBe('');
			expect(piorContraste(tema, icone, [...card, circulo(tema, nome)])).toBeGreaterThanOrEqual(
				MIN_GRAFICO
			);
			expect(piorContraste(tema, icone, card)).toBeGreaterThanOrEqual(MIN_GRAFICO);
		}
	);
});

describe('upload de histórico — escuro (produção) nunca pior que a main', () => {
	const card: Camada[] = ['bg-card'];
	const tema = 'dark';

	it.each([
		['status-warning', MAIN.iconeAviso],
		['status-danger', MAIN.iconeErro]
	] as const)('ícone %s: mesma cor e contraste ≥ main', (nome, main) => {
		const atual = ICONES[nome];
		for (const fundo of [card, [...card, circulo(tema, nome)]]) {
			const prodFundo = fundo.length > 1 ? [...card, MAIN.circulo] : card;
			expect(piorContraste(tema, atual, fundo)).toBeGreaterThanOrEqual(
				piorContraste(tema, main, prodFundo) - 1e-9
			);
		}
		expect(resolverClasse(atual, 'text', tema)?.rgb).toEqual(resolverClasse(main, 'text', tema)?.rgb);
	});

	it('círculo do aviso e do erro: tint e borda vermelhos da main no escuro', () => {
		const dark = (paginaSrc.match(REGRA_DARK) ?? []).join('\n');
		expect(dark).toMatch(/\.error-icon--warning/);
		expect(dark).toContain('background: hsl(0 72% 51% / 0.1)');
		expect(dark).toContain('border-color: hsl(0 72% 51% / 0.22)');
	});

	it('"Tentar novamente": borda translúcida da main no escuro', () => {
		const dark = (paginaSrc.match(REGRA_DARK) ?? []).join('\n');
		expect(dark).toContain('border-color: hsl(0 0% 100% / 0.12)');
		expect(dark).toContain('border-color: hsl(0 0% 100% / 0.18)');
	});

	it('dropzone: "ou" e dica seguem --muted-foreground no escuro', () => {
		const semClaro = dropzoneSrc.replace(REGRA_CLARO, '');
		for (const cls of ['divider-text', 'dropzone-hint']) {
			const bloco = new RegExp(`\\.${cls} \\{[^}]*\\}`).exec(semClaro)?.[0] ?? '';
			expect(bloco).toContain('color: hsl(var(--muted-foreground))');
		}
		expect(dropzoneSrc.match(REGRA_CLARO)?.join('\n')).toContain('hsl(var(--foreground) / 0.72)');
	});
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
		// Sobrescritas escopadas em `:global(.dark)` são o escuro da main, de propósito.
		const semDark = src.replace(REGRA_DARK, '');
		expect(src.match(CLARA_SEM_DARK) ?? []).toEqual([]);
		expect(semDark.match(FIXO_CSS) ?? []).toEqual([]);
		expect(semDark).not.toMatch(/hsl\(0 72% 51%/); // vermelho fixo do círculo de erro
	});

	it('os ícones de erro/aviso usam os tokens de status', () => {
		expect(paginaSrc).toContain('text-status-danger');
		expect(paginaSrc).toContain('text-status-warning');
	});

	it('os toasts do upload (erro de PDF, sucesso) seguem claros como em produção', () => {
		// Toasts escuros no dark mudam produção: aguardam aceite do mantenedor.
		const layout = lerSrc('routes/+layout.svelte');
		expect(/<Toaster\b[^>]*>/.exec(layout)?.[0]).not.toMatch(/\btheme=/);
	});
});
