/**
 * Tema claro/escuro dos estados do fluxograma (resumo de integralização, IRA,
 * "IRA não encontrado", percentual/anel, carregando/erro/vazio e CTA).
 *
 * Regra do produto: o que existe no dark mode tem de funcionar no light mode.
 * Este teste lê os tokens reais do app.css e a paleta do Tailwind e exige
 * texto >= 4,5:1 e gráficos (ícones, anel, borda de status) >= 3:1 nos DOIS temas.
 * Se alguém voltar para `text-white`, `bg-black/40` ou `text-green-400` sem par
 * `dark:`, o teste de varredura ou o de contraste falha.
 *
 * Premissa: o fundo da página é o `--background` do tema. Hoje o `PageBackground`
 * ainda pinta #050505 fixo (o light mode do app inteiro é outro card); as superfícies
 * daqui usam tokens, então ficam certas quando esse fundo seguir o tema.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import colors from 'tailwindcss/colors';
import {
	MIN_GRAFICO,
	MIN_TEXTO,
	compor,
	contraste,
	fundoEfetivo,
	lerTokens,
	parseCor,
	resolverClasse,
	type Paleta,
	type Propriedade,
	type Tema
} from './contraste-tema';

const SRC = resolve(__dirname, '..', '..');
const ler = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

const tokens = lerTokens(ler('app.css'));
const paleta = colors as unknown as Paleta;
const TEMAS: Tema[] = ['light', 'dark'];

const ARQ = {
	barra: 'lib/components/fluxograma/dashboard/ProgressSummaryBar.svelte',
	secao: 'lib/components/fluxograma/dashboard/ProgressSummarySection.svelte',
	hud: 'lib/components/fluxograma/layout/FluxogramViewportChrome.svelte',
	meu: 'routes/meu-fluxograma/+page.svelte',
	curso: 'routes/meu-fluxograma/[courseName]/+page.svelte'
} as const;

// Superfícies (classes exatas usadas nos componentes)
const PILL = 'border border-border bg-background/80';
const CARD = 'rounded-xl border border-border bg-background/80';
const CIRCULO = 'bg-green-500/20';
const LADO_SEMESTRE = 'bg-muted/50 p-4 dark:bg-black/20';
const CAIXA_IRA = 'bg-background/70 px-2.5 py-1.5 sm:mt-3 dark:bg-foreground/5';
const ERRO = 'border-destructive/30 bg-destructive/10';
const BOTAO_NEUTRO = 'bg-foreground/10 px-6 py-2 text-sm font-medium text-foreground';
const VAZIO_MEU = 'border-border bg-background/80';
const VAZIO_CURSO = 'border-border bg-card/80';

interface Caso {
	nome: string;
	arquivos: (keyof typeof ARQ)[];
	superficies: string[];
	fg: string;
	prop?: Propriedade;
	min: number;
}

const CASOS: Caso[] = [
	// Pílulas do resumo (barra) e HUD da tela cheia
	{ nome: 'pílula: texto base', arquivos: ['barra'], superficies: [PILL], fg: 'text-foreground/80', min: MIN_TEXTO },
	{ nome: 'pílula: rótulo/IRA não encontrado', arquivos: ['barra', 'hud'], superficies: [PILL], fg: 'text-muted-foreground', min: MIN_TEXTO },
	{ nome: 'pílula: valor (IRA, CH)', arquivos: ['barra'], superficies: [PILL], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: 'HUD: valor', arquivos: ['hud'], superficies: [PILL], fg: 'gap-1.5 text-foreground', min: MIN_TEXTO },
	{ nome: 'ícone concluído (verde)', arquivos: ['barra', 'hud', 'secao'], superficies: [PILL], fg: 'text-green-700 dark:text-green-400', min: MIN_GRAFICO },
	{ nome: 'ícone semestre (âmbar)', arquivos: ['barra', 'hud'], superficies: [PILL], fg: 'text-amber-700 dark:text-amber-400', min: MIN_GRAFICO },
	{ nome: 'ícone IRA (roxo)', arquivos: ['hud'], superficies: [PILL], fg: 'text-purple-600 dark:text-purple-400', min: MIN_GRAFICO },

	// Card de integralização + semestre/IRA
	{ nome: 'anel de progresso', arquivos: ['secao'], superficies: [CARD, CIRCULO], fg: 'stroke-green-700 transition-all duration-600 dark:stroke-green-500', prop: 'stroke', min: MIN_GRAFICO },
	{ nome: 'percentual no anel', arquivos: ['secao'], superficies: [CARD, CIRCULO], fg: 'text-sm font-bold text-foreground', min: MIN_TEXTO },
	{ nome: 'rótulo de progresso (verde)', arquivos: ['secao'], superficies: [CARD], fg: 'gap-1.5 text-green-700 dark:text-green-400', min: MIN_TEXTO },
	{ nome: 'sublabel', arquivos: ['secao'], superficies: [CARD], fg: 'text-xs text-muted-foreground', min: MIN_TEXTO },
	{ nome: 'valor de CH', arquivos: ['secao'], superficies: [CARD], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: '"Clique para ver detalhes"', arquivos: ['secao'], superficies: [CARD], fg: 'text-cyan-700 dark:text-cyan-400', min: MIN_TEXTO },
	{ nome: '% simulado', arquivos: ['secao'], superficies: [CARD, 'bg-cyan-500/10'], fg: 'text-cyan-800 dark:text-cyan-200', min: MIN_TEXTO },
	{ nome: 'borda do % simulado', arquivos: ['secao'], superficies: [CARD], fg: 'border-cyan-600 dark:border-cyan-400/50', prop: 'border', min: MIN_GRAFICO },
	{ nome: 'semestre: rótulo (âmbar)', arquivos: ['secao'], superficies: [CARD, LADO_SEMESTRE], fg: 'text-amber-700 dark:text-amber-400', min: MIN_TEXTO },
	{ nome: 'semestre: número', arquivos: ['secao'], superficies: [CARD, LADO_SEMESTRE], fg: 'font-bold text-foreground', min: MIN_TEXTO },
	{ nome: 'semestre: legenda', arquivos: ['secao'], superficies: [CARD, LADO_SEMESTRE], fg: 'text-xs text-muted-foreground', min: MIN_TEXTO },
	{ nome: 'IRA: valor', arquivos: ['secao'], superficies: [CARD, LADO_SEMESTRE, CAIXA_IRA], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: 'IRA: rótulo / não encontrado', arquivos: ['secao'], superficies: [CARD, LADO_SEMESTRE, CAIXA_IRA], fg: 'text-xs text-muted-foreground', min: MIN_TEXTO },

	// Estados da página: carregando, erro, vazio
	{ nome: 'carregando: ícone', arquivos: ['meu', 'curso'], superficies: [], fg: 'text-purple-600 dark:text-purple-400', min: MIN_GRAFICO },
	{ nome: 'carregando: texto', arquivos: ['meu', 'curso'], superficies: [], fg: 'text-sm text-muted-foreground', min: MIN_TEXTO },
	{ nome: 'erro: ícone', arquivos: ['meu', 'curso'], superficies: [ERRO], fg: 'text-red-600 dark:text-red-400', min: MIN_GRAFICO },
	{ nome: 'erro: título', arquivos: ['meu', 'curso'], superficies: [ERRO], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: 'erro: mensagem', arquivos: ['meu', 'curso'], superficies: [ERRO], fg: 'text-red-700 dark:text-red-300/80', min: MIN_TEXTO },
	{ nome: 'erro: "Tentar novamente"', arquivos: ['meu', 'curso'], superficies: [ERRO, BOTAO_NEUTRO], fg: BOTAO_NEUTRO, min: MIN_TEXTO },
	{ nome: 'vazio (sem histórico): ícone', arquivos: ['meu'], superficies: [VAZIO_MEU], fg: 'text-purple-600 dark:text-purple-400', min: MIN_GRAFICO },
	{ nome: 'vazio (sem histórico): título', arquivos: ['meu'], superficies: [VAZIO_MEU], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: 'vazio (sem histórico): texto', arquivos: ['meu'], superficies: [VAZIO_MEU], fg: 'text-sm text-muted-foreground', min: MIN_TEXTO },
	{ nome: 'curso não encontrado: ícone', arquivos: ['curso'], superficies: [VAZIO_CURSO], fg: 'text-amber-600 dark:text-amber-400', min: MIN_GRAFICO },
	{ nome: 'curso não encontrado: título', arquivos: ['curso'], superficies: [VAZIO_CURSO], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: 'curso não encontrado: texto', arquivos: ['curso'], superficies: [VAZIO_CURSO], fg: 'text-sm text-muted-foreground', min: MIN_TEXTO },
	{ nome: 'CTA "Ver fluxogramas"', arquivos: ['curso'], superficies: [VAZIO_CURSO, BOTAO_NEUTRO], fg: BOTAO_NEUTRO, min: MIN_TEXTO }
];

describe('tema dos estados do fluxograma — contraste nos dois temas', () => {
	for (const caso of CASOS) {
		for (const tema of TEMAS) {
			it(`${caso.nome} (${tema}) >= ${caso.min}:1`, () => {
				for (const arq of caso.arquivos) {
					expect(ler(ARQ[arq]), `classe "${caso.fg}" sumiu de ${ARQ[arq]}`).toContain(caso.fg);
					for (const s of caso.superficies) expect(ler(ARQ[arq])).toContain(s);
				}
				const bg = fundoEfetivo(caso.superficies, tema, tokens, paleta);
				const cor = resolverClasse(caso.fg, caso.prop ?? 'text', tema, tokens, paleta);
				expect(cor, `sem cor de ${caso.prop ?? 'text'} em "${caso.fg}"`).not.toBeNull();
				const fg = compor(cor!.rgb, cor!.alfa, bg);
				expect(contraste(fg, bg)).toBeGreaterThanOrEqual(caso.min);
			});
		}
	}

	it.each(TEMAS)('anel de progresso se distingue do trilho (%s) >= 3:1', (tema) => {
		expect(ler(ARQ.secao)).toContain('class="stroke-foreground/10"');
		const bg = fundoEfetivo([CARD, CIRCULO], tema, tokens, paleta);
		const trilho = resolverClasse('stroke-foreground/10', 'stroke', tema, tokens, paleta)!;
		const arco = resolverClasse('stroke-green-700 dark:stroke-green-500', 'stroke', tema, tokens, paleta)!;
		expect(contraste(arco.rgb, compor(trilho.rgb, trilho.alfa, bg))).toBeGreaterThanOrEqual(MIN_GRAFICO);
	});

	it('CTA azul "Enviar/Importar histórico": texto branco >= 4,5:1 nas duas pontas do gradiente', () => {
		expect(ler(ARQ.meu)).toContain('from-blue-600 to-blue-700');
		const branco = parseCor('#fff');
		const azul = paleta.blue as Record<string, string>;
		for (const tom of ['600', '700']) {
			expect(contraste(branco, parseCor(azul[tom]))).toBeGreaterThanOrEqual(MIN_TEXTO);
		}
	});

	it('sanidade: a cor que só funciona no escuro reprova no claro', () => {
		const bg = fundoEfetivo([PILL], 'light', tokens, paleta);
		const branco = resolverClasse('text-white', 'text', 'light', tokens, paleta)!;
		const verde = resolverClasse('text-green-400', 'text', 'light', tokens, paleta)!;
		expect(contraste(branco.rgb, bg)).toBeLessThan(MIN_GRAFICO);
		expect(contraste(verde.rgb, bg)).toBeLessThan(MIN_GRAFICO);
	});
});

/**
 * Trechos tocados pela branch: dentro deles, nada de cor que só existe no escuro.
 * Fora deles (modal de CH, controles de zoom...) o light mode é o card do Trello.
 */
const REGIOES: { arquivo: keyof typeof ARQ; inicio: string; fim: string }[] = [
	{ arquivo: 'barra', inicio: '{#if userFluxograma}', fim: '</div>\n{/if}' },
	{ arquivo: 'secao', inicio: '<!-- Um card: integralização', fim: '<!-- Modal Carga Horária' },
	{ arquivo: 'hud', inicio: '<!-- HUD no modo tela cheia -->', fim: '{/if}\n\n\t<div' },
	{ arquivo: 'meu', inicio: '{#if store.state.loading}', fim: '{:else if store.state.courseData}' },
	{ arquivo: 'curso', inicio: '{#if store.state.loading}', fim: '{:else if store.state.courseData}' },
	{ arquivo: 'curso', inicio: '{:else if cargaIniciada || !courseName}', fim: '</div>\n\t{/if}\n</div>' }
];

/** Branco/preto fixos e tons claros (200–400) sem par `dark:` — só funcionam no escuro. */
const SO_ESCURO =
	/(?<![\w:-])(?:text|bg|border|stroke|fill)-(?:white|black)(?:\/[\w.[\]]+)?(?![\w-])|(?<![\w:-])(?:text|border|stroke|fill)-[a-z]+-[234]00(?:\/\d+)?(?![\w-])|(?:stroke|fill)="(?:#|rgba?\()/g;

describe('tema dos estados do fluxograma — sem cor fixa de tema escuro', () => {
	it.each(REGIOES)('$arquivo: $inicio', ({ arquivo, inicio, fim }) => {
		const src = ler(ARQ[arquivo]);
		const a = src.indexOf(inicio);
		expect(a, `marcador "${inicio}" não encontrado`).toBeGreaterThanOrEqual(0);
		const b = src.indexOf(fim, a);
		expect(b).toBeGreaterThan(a);
		const achados = src
			.slice(a, b)
			.split('\n')
			// CTA com fundo próprio (gradiente azul): branco é intencional e testado acima.
			.filter((l) => !l.includes('bg-gradient-to-r from-blue-600'))
			.flatMap((l) => l.match(SO_ESCURO) ?? []);
		expect(achados).toEqual([]);
	});
});
