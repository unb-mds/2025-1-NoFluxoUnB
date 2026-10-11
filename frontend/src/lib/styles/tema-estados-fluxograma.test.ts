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
 * Fundo: as superfícies são empilhadas sobre o fundo REAL da página — o
 * `--page-background` que o PageBackground pinta (no escuro, o #050505 de
 * produção), liso e no pico do glow roxo — via helper compartilhado
 * (lib/styles/contraste.ts). Medir contra `--background` supunha um fundo que
 * não é o que aparece atrás das pílulas translúcidas (bg-background/80).
 */
import { describe, expect, it } from 'vitest';
import {
	MIN_GRAFICO,
	MIN_TEXTO,
	PALETA,
	TEMAS,
	compor,
	contraste,
	empilhar,
	fundosDaPagina,
	lerSrc as ler,
	parseCor,
	piorContraste,
	resolverClasse,
	type Propriedade
} from './contraste';

const ARQ = {
	barra: 'lib/components/fluxograma/dashboard/ProgressSummaryBar.svelte',
	secao: 'lib/components/fluxograma/dashboard/ProgressSummarySection.svelte',
	hud: 'lib/components/fluxograma/layout/FluxogramViewportChrome.svelte',
	meu: 'routes/meu-fluxograma/+page.svelte',
	curso: 'routes/meu-fluxograma/[courseName]/+page.svelte'
} as const;

// Superfícies (classes atuais, design da light-mode)
const PILL = 'bg-background/80 dark:bg-black/40';
const HUD = 'bg-background/80 dark:bg-black/50';
const CARD = 'bg-background/80 dark:bg-black/40';
const CIRCULO = 'bg-green-500/20';
const LADO_SEMESTRE = 'bg-muted/50 dark:bg-black/20';
const CAIXA_IRA = 'bg-muted/60';
const ERRO = 'bg-red-500/10';
const BOTAO_NEUTRO = 'bg-foreground/10 px-6 py-2 text-sm font-medium text-foreground';
const VAZIO_MEU = 'bg-card p-8 text-center backdrop-blur-md dark:bg-background/80';
const VAZIO_CURSO = 'bg-card/80';

interface Caso {
	nome: string;
	arquivos: (keyof typeof ARQ)[];
	superficies: string[];
	fg: string;
	prop?: Propriedade;
	min: number;
	/** Mínimo no escuro quando o design já fica abaixo de `min` (documentado no caso). */
	minEscuro?: number;
}

const CASOS: Caso[] = [
	// Pílulas do resumo (barra) e HUD da tela cheia
	{ nome: 'pílula: texto base', arquivos: ['barra'], superficies: [PILL], fg: 'text-foreground/80 backdrop-blur-md', min: MIN_TEXTO },
	{ nome: 'pílula: rótulo / IRA não encontrado', arquivos: ['barra'], superficies: [PILL], fg: 'text-muted-foreground', min: MIN_TEXTO },
	{ nome: 'pílula: valor (IRA, CH)', arquivos: ['barra'], superficies: [PILL], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: 'HUD: valor', arquivos: ['hud'], superficies: [HUD], fg: 'gap-1.5 text-foreground', min: MIN_TEXTO },
	{ nome: 'HUD: legenda / IRA não encontrado', arquivos: ['hud'], superficies: [HUD], fg: 'font-medium text-muted-foreground', min: MIN_TEXTO },
	{ nome: 'pílula: ícone concluído (verde)', arquivos: ['barra'], superficies: [PILL], fg: 'text-emerald-600 dark:text-green-400', min: MIN_GRAFICO },
	{ nome: 'HUD: ícone concluído (verde)', arquivos: ['hud'], superficies: [HUD], fg: 'text-emerald-600 dark:text-green-400', min: MIN_GRAFICO },
	{ nome: 'card: ícone concluído (verde)', arquivos: ['secao'], superficies: [CARD], fg: 'text-emerald-700 sm:h-7 sm:w-7 dark:text-green-400', min: MIN_GRAFICO },
	{ nome: 'pílula: ícone semestre (âmbar)', arquivos: ['barra'], superficies: [PILL], fg: 'text-amber-700 dark:text-amber-400', min: MIN_GRAFICO },
	{ nome: 'HUD: ícone semestre (âmbar)', arquivos: ['hud'], superficies: [HUD], fg: 'text-amber-700 dark:text-amber-400', min: MIN_GRAFICO },
	{ nome: 'ícone IRA', arquivos: ['hud'], superficies: [HUD], fg: 'text-primary dark:text-purple-400', min: MIN_GRAFICO },

	// Card de integralização + semestre/IRA
	{ nome: 'percentual no anel', arquivos: ['secao'], superficies: [CARD, CIRCULO], fg: 'text-sm font-bold text-foreground', min: MIN_TEXTO },
	{ nome: 'rótulo de progresso (verde)', arquivos: ['secao'], superficies: [CARD], fg: 'gap-1.5 text-emerald-700 dark:text-green-400', min: MIN_TEXTO },
	{ nome: 'sublabel', arquivos: ['secao'], superficies: [CARD], fg: 'text-xs text-muted-foreground', min: MIN_TEXTO },
	{ nome: '"Clique para ver detalhes"', arquivos: ['secao'], superficies: [CARD], fg: 'text-cyan-700 sm:mt-1.5 dark:text-cyan-400', min: MIN_TEXTO },
	{ nome: '% simulado', arquivos: ['secao'], superficies: [CARD, 'bg-cyan-500/10'], fg: 'text-cyan-800 sm:text-sm dark:text-cyan-200', min: MIN_TEXTO },
	{ nome: 'semestre: rótulo (âmbar)', arquivos: ['secao'], superficies: [CARD, LADO_SEMESTRE], fg: 'gap-1.5 text-amber-700 dark:text-amber-400', min: MIN_TEXTO },
	{ nome: 'semestre: número', arquivos: ['secao'], superficies: [CARD, LADO_SEMESTRE], fg: 'font-bold text-foreground', min: MIN_TEXTO },
	{ nome: 'IRA: valor', arquivos: ['secao'], superficies: [CARD, LADO_SEMESTRE, CAIXA_IRA], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: 'IRA: rótulo / não encontrado', arquivos: ['secao'], superficies: [CARD, LADO_SEMESTRE, CAIXA_IRA], fg: 'text-xs text-muted-foreground', min: MIN_TEXTO },

	// Estados da página: carregando, erro, vazio
	{ nome: 'carregando: ícone', arquivos: ['meu', 'curso'], superficies: [], fg: 'animate-spin text-ai', min: MIN_GRAFICO },
	{ nome: 'carregando: texto', arquivos: ['meu', 'curso'], superficies: [], fg: 'text-sm text-muted-foreground', min: MIN_TEXTO },
	{ nome: 'erro: ícone', arquivos: ['meu', 'curso'], superficies: [ERRO], fg: 'text-red-700 dark:text-red-400', min: MIN_GRAFICO },
	{ nome: 'erro: título', arquivos: ['meu', 'curso'], superficies: [ERRO], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: 'erro: mensagem', arquivos: ['meu', 'curso'], superficies: [ERRO], fg: 'text-red-700 dark:text-red-300/80', min: MIN_TEXTO },
	{ nome: 'erro: "Tentar novamente"', arquivos: ['meu', 'curso'], superficies: [ERRO, BOTAO_NEUTRO], fg: BOTAO_NEUTRO, min: MIN_TEXTO },
	{ nome: 'vazio (sem histórico): ícone', arquivos: ['meu'], superficies: [VAZIO_MEU], fg: 'mb-3 h-8 w-8 text-ai', min: MIN_GRAFICO },
	{ nome: 'vazio (sem histórico): título', arquivos: ['meu'], superficies: [VAZIO_MEU], fg: 'font-semibold text-foreground', min: MIN_TEXTO },
	{ nome: 'vazio (sem histórico): texto', arquivos: ['meu'], superficies: [VAZIO_MEU], fg: 'mb-4 text-sm text-muted-foreground', min: MIN_TEXTO },
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
					for (const s of caso.superficies)
						for (const cls of s.split(/\s+/)) expect(ler(ARQ[arq]), `classe de superfície "${cls}" sumiu de ${ARQ[arq]}`).toContain(cls);
				}
				const prop = caso.prop ?? 'text';
				expect(resolverClasse(caso.fg, prop, tema), `sem cor de ${prop} em "${caso.fg}"`).not.toBeNull();
				const min = tema === 'dark' ? (caso.minEscuro ?? caso.min) : caso.min;
				expect(piorContraste(tema, caso.fg, caso.superficies, prop)).toBeGreaterThanOrEqual(min);
			});
		}
	}

	it.each(TEMAS)('anel de progresso (--ps-ring) se distingue do trilho (%s) >= 3:1', (tema) => {
		const secao = ler(ARQ.secao);
		expect(secao).toContain('style:stroke="var(--ps-ring)"');
		expect(secao).toContain('class="stroke-foreground/[0.12]"');
		// --ps-ring: emerald-700 no claro, #22c55e (o da main) no escuro
		const arco = parseCor(tema === 'dark' ? '#22c55e' : '#047857');
		expect(secao).toContain(tema === 'dark' ? '--ps-ring: #22c55e' : '--ps-ring: #047857');
		const trilho = resolverClasse('stroke-foreground/[0.12]', 'stroke', tema)!;
		for (const pagina of fundosDaPagina(tema)) {
			const bg = empilhar(tema, [CARD, CIRCULO], pagina);
			expect(contraste(arco, compor(trilho.rgb, trilho.alfa, bg))).toBeGreaterThanOrEqual(MIN_GRAFICO);
		}
	});

	it('CTA azul "Enviar/Importar histórico": texto branco >= 4,5:1 nas pontas do gradiente', () => {
		expect(ler(ARQ.meu)).toContain('from-blue-600 to-blue-800');
		const branco = parseCor('#fff');
		const azul = PALETA.blue as Record<string, string>;
		for (const tom of ['500', '600', '700', '800']) {
			expect(contraste(branco, parseCor(azul[tom]))).toBeGreaterThanOrEqual(tom === '500' ? 3 : MIN_TEXTO);
		}
	});

	it('sanidade: a cor que só funciona no escuro reprova no claro', () => {
		expect(piorContraste('light', 'text-white', [PILL])).toBeLessThan(MIN_GRAFICO);
		expect(piorContraste('light', 'text-green-400', [PILL])).toBeLessThan(MIN_GRAFICO);
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
