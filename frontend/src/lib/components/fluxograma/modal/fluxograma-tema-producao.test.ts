/**
 * Modal de detalhes da matéria, editor de status, aba de turmas e etiquetas do
 * card: contraste nos DOIS temas e, no escuro (produção), nunca pior que a main.
 *
 * Cada caso tem a combinação que está em produção (classes da main, escritas
 * aqui como referência fixa) e a atual (lida do componente: o teste confere que
 * as classes ainda estão no fonte). Tudo é medido com o helper compartilhado,
 * sobre o fundo real da página (--page-background liso e no glow):
 *  - claro e escuro: texto ≥ 4,5:1, gráfico ≥ 3:1;
 *  - escuro: contraste atual ≥ o da main — o redesenho para tokens não pode
 *    deixar o que já está no ar menos legível.
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
	type Propriedade
} from '$lib/styles/contraste';

const ARQ = {
	modal: 'lib/components/fluxograma/modal/SubjectDetailsModal.svelte',
	editor: 'lib/components/fluxograma/modal/ManualStatusEditor.svelte',
	turmas: 'lib/components/fluxograma/modal/SubjectClassesTab.svelte',
	cores: 'lib/components/fluxograma/cards/subject-card-colors.ts',
	card: 'lib/components/fluxograma/cards/SubjectCard.svelte'
} as const;
type Arq = keyof typeof ARQ;

// ─── Pilhas de fundo ─────────────────────────────────────────────────────────

/** Backdrop do modal (igual na main) + caixa do modal. */
const PROD_MODAL: Camada[] = ['bg-black/60', 'bg-gray-900/95'];
const MODAL: Camada[] = ['bg-black/60', 'bg-popover/95 dark:bg-gray-900/95'];

/** Gradiente do cabeçalho por status (igual na main): as duas pontas. */
const GRADIENTES = {
	Aprovado: 'from-green-500/20 to-green-700/10',
	Cursando: 'from-purple-500/20 to-purple-700/10',
	Disponível: 'from-amber-500/20 to-amber-700/10',
	Reprovado: 'from-red-500/20 to-red-700/10',
	Bloqueado: 'from-gray-500/20 to-gray-700/10'
} as const;
function pontas(gradiente: string): Camada[][] {
	return (['from', 'to'] as const).map((lado) => {
		const c = resolverClasse(gradiente, lado, 'dark')!;
		return [{ cor: c.rgb, alfa: c.alfa }];
	});
}

// ─── Casos ───────────────────────────────────────────────────────────────────

interface Lado {
	/** Camadas de fundo, de fora para dentro (a página real fica por baixo). */
	fundo: Camada[];
	/** Classes do elemento (lê-se `prop`). */
	frente: string;
}
interface Caso {
	onde: string;
	arquivo: Arq;
	prod: Lado;
	atual: Lado;
	min: number;
	prop?: Propriedade;
	/** Variações do fundo (ex.: pontas do gradiente) somadas às duas pilhas. */
	variantes?: Camada[][];
	/** Trechos que também precisam estar no fonte (ex.: o gradiente). */
	fonte?: string[];
}

const cabecalho = (onde: string, prodFrente: string, atualFrente: string): Caso[] =>
	Object.entries(GRADIENTES).map(([status, g]) => ({
		onde: `cabeçalho (${status}): ${onde}`,
		arquivo: 'modal',
		prod: { fundo: PROD_MODAL, frente: prodFrente },
		atual: { fundo: MODAL, frente: atualFrente },
		variantes: pontas(g),
		min: MIN_TEXTO
	}));

/** Dentro do corpo do modal, sobre uma superfície (chip, card, caixa). */
const corpo = (
	onde: string,
	arquivo: Arq,
	prod: [string[], string],
	atual: [string[], string],
	min = MIN_TEXTO
): Caso => ({
	onde,
	arquivo,
	prod: { fundo: [...PROD_MODAL, ...prod[0]], frente: prod[1] },
	atual: { fundo: [...MODAL, ...atual[0]], frente: atual[1] },
	min
});

const CASOS: Caso[] = [
	// Cabeçalho (pré-mortem: text-white/60 → text-muted-foreground derrubou o dark)
	...cabecalho('código e rótulo do status', 'text-white/60', 'text-foreground/75'),
	...cabecalho('nome da matéria', 'text-white', 'text-foreground sm:text-lg dark:text-white'),
	...cabecalho('créditos', 'text-white/50', 'text-foreground/75'),
	...cabecalho(
		'chip optativa',
		'text-purple-200',
		'text-purple-800 dark:text-purple-200'
	).map((c) => ({
		...c,
		prod: { ...c.prod, fundo: [...c.prod.fundo, 'bg-purple-500/25'] },
		atual: { ...c.atual, fundo: [...c.atual.fundo, 'bg-purple-500/25'] }
	})),
	...cabecalho('chip módulo livre', 'text-teal-200', 'text-teal-900 dark:text-teal-200').map(
		(c) => ({
			...c,
			prod: { ...c.prod, fundo: [...c.prod.fundo, 'bg-teal-500/25'] },
			atual: { ...c.atual, fundo: [...c.atual.fundo, 'bg-teal-500/25'] }
		})
	),
	// Bolinha do status (gráfico) ao lado do rótulo, na ponta do gradiente do próprio status
	...(
		[
			['Aprovado', 'bg-green-500', 'bg-status-completed dark:bg-green-500'],
			['Cursando', 'bg-purple-500', 'bg-status-in-progress dark:bg-purple-500'],
			['Disponível', 'bg-amber-500', 'bg-status-available dark:bg-amber-500'],
			['Reprovado', 'bg-red-500', 'bg-status-failed dark:bg-red-500'],
			['Bloqueado', 'bg-gray-500', 'bg-muted-foreground']
		] as const
	).map(
		([status, prod, atual]): Caso => ({
			onde: `cabeçalho (${status}): bolinha do status`,
			arquivo: 'modal',
			prod: { fundo: PROD_MODAL, frente: prod },
			atual: { fundo: MODAL, frente: atual },
			variantes: pontas(GRADIENTES[status]),
			prop: 'bg',
			min: MIN_GRAFICO
		})
	),
	corpo(
		'botão fechar (ícone)',
		'modal',
		[['bg-white/10'], 'text-white/70'],
		[['bg-muted'], 'text-foreground/75'],
		MIN_GRAFICO
	),

	// Caixas de equivalência / aproveitamento / optatória
	corpo('optatória: rótulo', 'modal', [['bg-amber-500/10'], 'text-amber-300'], [['bg-amber-500/10'], 'text-amber-800 dark:text-amber-300']),
	corpo('equivalência: rótulo', 'modal', [['bg-purple-500/10'], 'text-purple-300'], [['bg-purple-500/10'], 'text-purple-700 dark:text-purple-300']),
	corpo('aproveitamento: rótulo', 'modal', [['bg-emerald-500/10'], 'text-emerald-300'], [['bg-emerald-500/10'], 'text-emerald-700 dark:text-emerald-300']),
	corpo('caixas: texto', 'modal', [['bg-purple-500/10'], 'text-white/80'], [['bg-purple-500/10'], 'text-foreground/85']),
	corpo('equivalência: período', 'modal', [['bg-purple-500/10'], 'text-white/50'], [['bg-purple-500/10'], 'text-foreground/75']),
	corpo('chips do SIGAA', 'modal', [['bg-white/10'], 'text-white/80'], [['bg-muted'], 'text-foreground/85']),

	// Abas
	corpo('aba ativa', 'modal', [[], 'text-purple-300'], [[], 'text-primary dark:text-purple-300']),
	corpo('aba inativa', 'modal', [[], 'text-white/50'], [[], 'text-foreground/75']),

	// Aba Info
	corpo('info: títulos (Ementa, Co-requisitos)', 'modal', [[], 'text-white/50'], [[], 'text-foreground/75']),
	corpo('info: ementa', 'modal', [[], 'text-white/80'], [[], 'text-foreground/85']),
	corpo('info: rótulo do quadro', 'modal', [['bg-white/5'], 'text-white/50'], [['bg-muted/50'], 'text-foreground/75']),
	corpo('info: valor do quadro', 'modal', [['bg-white/5'], 'text-white'], [['bg-muted/50'], 'text-foreground']),
	corpo('info: co-requisito', 'modal', [['bg-white/5'], 'text-white/80'], [['bg-muted/50'], 'text-foreground/85']),

	// Aba Pré-requisitos
	corpo('pré-req: instrução', 'modal', [['bg-white/5'], 'text-white/70'], [['bg-muted/50'], 'text-foreground/75']),
	corpo('pré-req: "uma das opções"', 'modal', [['bg-white/5'], 'text-white/95'], [['bg-muted/50'], 'text-foreground']),
	corpo('pré-req: "Opção N"', 'modal', [['bg-white/5', 'bg-black/20'], 'text-white/40'], [['bg-muted/50', 'bg-muted/40 dark:bg-black/20'], 'text-foreground/75']),
	corpo('pré-req: chip (código)', 'modal', [['bg-white/5', 'bg-black/20', 'bg-[#7f9cf5]/10'], 'text-[#b8adff]'], [['bg-muted/50', 'bg-muted/40 dark:bg-black/20', 'bg-primary/10 dark:bg-[#7f9cf5]/10'], 'text-accent-foreground dark:text-[#b8adff]']),
	corpo('pré-req: chip (nome)', 'modal', [['bg-white/5', 'bg-black/20', 'bg-[#7f9cf5]/10'], 'text-white/85'], [['bg-muted/50', 'bg-muted/40 dark:bg-black/20', 'bg-primary/10 dark:bg-[#7f9cf5]/10'], 'text-foreground/90']),
	corpo('pré-req: chip (status)', 'modal', [['bg-white/5', 'bg-black/20', 'bg-[#7f9cf5]/10'], 'text-white/50'], [['bg-muted/50', 'bg-muted/40 dark:bg-black/20', 'bg-primary/10 dark:bg-[#7f9cf5]/10'], 'text-foreground/75']),
	corpo('pré-req único: nome', 'modal', [['bg-white/5', 'bg-[#7f9cf5]/10'], 'text-white/60'], [['bg-muted/50', 'bg-primary/10 dark:bg-[#7f9cf5]/10'], 'text-foreground/75']),
	corpo('pré-req sem matéria: código', 'modal', [['bg-white/5', 'bg-white/5'], 'text-white/80'], [['bg-muted/50', 'bg-muted/50'], 'text-foreground/85']),
	corpo('sem pré-requisitos / sem equivalência', 'modal', [[], 'text-white/50'], [[], 'text-foreground/75']),

	// Aba Equivalências
	corpo('equivalência: "Específica"', 'modal', [['bg-white/5', 'bg-amber-500/20'], 'text-amber-300'], [['bg-muted/50', 'bg-amber-500/20'], 'text-amber-800 dark:text-amber-300']),
	corpo('equivalência: "Geral"', 'modal', [['bg-white/5', 'bg-cyan-500/20'], 'text-cyan-300'], [['bg-muted/50', 'bg-cyan-500/20'], 'text-cyan-800 dark:text-cyan-300']),
	corpo('equivalência: nome', 'modal', [['bg-white/5'], 'text-white/90'], [['bg-muted/50'], 'text-foreground']),
	corpo('equivalência: expressão', 'modal', [['bg-white/5'], 'text-purple-300/70'], [['bg-muted/50'], 'text-purple-700 dark:text-purple-300/70']),
	corpo('equivalência: currículo', 'modal', [['bg-white/5'], 'text-white/50'], [['bg-muted/50'], 'text-foreground/75']),

	// Rodapé
	corpo('planejada: aviso', 'modal', [['bg-black/20'], 'text-white/50'], [['bg-muted/40 dark:bg-black/20'], 'text-foreground/75']),
	corpo('planejada: "Remover"', 'modal', [['bg-black/20', 'bg-red-500/15'], 'text-red-100'], [['bg-muted/40 dark:bg-black/20', 'bg-destructive/10'], 'text-red-700 dark:text-red-100']),
	...(['from', 'to'] as const).map((lado) => {
		// bg-gradient-to-r from-purple-600 to-purple-700 (igual à main): as duas pontas
		const c = resolverClasse('from-purple-600 to-purple-700', lado, 'dark')!;
		const ponta: Camada = { cor: c.rgb, alfa: c.alfa };
		return {
			...corpo(`CTA previsão de formatura (${lado})`, 'modal', [[], 'text-white'], [[], 'text-primary-foreground']),
			variantes: [[ponta]],
			fonte: ['from-purple-600 to-purple-700']
		};
	}),
	corpo('remover (sessão anônima)', 'modal', [['bg-white/5'], 'text-white/80'], [['bg-muted/50'], 'text-foreground/85']),

	// ManualStatusEditor (dentro do modal)
	corpo('editor: título', 'editor', [['bg-black/20'], 'text-white/90'], [['bg-muted/40 p-4 dark:bg-black/20'], 'text-foreground']),
	corpo('editor: "Remover"', 'editor', [['bg-black/20'], 'text-red-400'], [['bg-muted/40 p-4 dark:bg-black/20'], 'text-red-700 dark:text-red-400']),
	corpo('editor: status não escolhido', 'editor', [['bg-black/20', 'bg-white/5'], 'text-white/60'], [['bg-muted/40 p-4 dark:bg-black/20', 'bg-muted/50'], 'text-foreground/75']),
	corpo('editor: APR escolhido', 'editor', [['bg-black/20', 'bg-green-500/20'], 'text-green-300'], [['bg-muted/40 p-4 dark:bg-black/20', 'bg-green-500/20'], 'text-green-800 dark:text-green-300']),
	corpo('editor: REP escolhido', 'editor', [['bg-black/20', 'bg-red-500/20'], 'text-red-300'], [['bg-muted/40 p-4 dark:bg-black/20', 'bg-red-500/20'], 'text-red-800 dark:text-red-300']),
	corpo('editor: MATR escolhido', 'editor', [['bg-black/20', 'bg-blue-500/20'], 'text-blue-300'], [['bg-muted/40 p-4 dark:bg-black/20', 'bg-blue-500/20'], 'text-blue-800 dark:text-blue-300']),
	corpo('editor: TRC escolhido', 'editor', [['bg-black/20', 'bg-gray-500/20'], 'text-gray-300'], [['bg-muted/40 p-4 dark:bg-black/20', 'bg-muted'], 'text-foreground']),
	corpo('editor: opções avançadas', 'editor', [['bg-black/20', 'bg-purple-500/10'], 'text-purple-300'], [['bg-muted/40 p-4 dark:bg-black/20', 'bg-primary/10'], 'text-primary dark:text-purple-300']),
	corpo('editor: rótulos dos campos', 'editor', [['bg-black/20'], 'text-white/50'], [['bg-muted/40 p-4 dark:bg-black/20'], 'text-foreground/75']),
	corpo('editor: campo', 'editor', [['bg-black/20', 'bg-white/5'], 'text-white'], [['bg-muted/40 p-4 dark:bg-black/20', 'bg-background dark:bg-white/5'], 'text-foreground dark:text-white']),
	corpo('editor: "Salvar Opções"', 'editor', [['bg-black/20', 'bg-purple-600'], 'text-white'], [['bg-muted/40 p-4 dark:bg-black/20', 'bg-purple-600'], 'text-primary-foreground']),

	// SubjectClassesTab (dentro do modal)
	corpo('turmas: carregando / vazio', 'turmas', [[], 'text-white/50'], [[], 'text-foreground/75']),
	corpo('turmas: erro', 'turmas', [[], 'text-red-300/80'], [[], 'text-red-700 dark:text-red-300/80']),
	corpo('turmas: código ofertado', 'turmas', [['bg-sky-500/10'], 'text-sky-200/90'], [['bg-sky-500/10'], 'text-sky-800 dark:border-sky-300/25 dark:text-sky-200/90']),
	corpo('turmas: "Turma X"', 'turmas', [['bg-white/5'], 'text-white/90'], [['bg-muted/50'], 'text-foreground']),
	corpo('turmas: vagas', 'turmas', [['bg-white/5', 'bg-white/10'], 'text-white/70'], [['bg-muted/50', 'bg-muted'], 'text-foreground/75']),
	corpo('turmas: docente', 'turmas', [['bg-white/5'], 'text-white/60'], [['bg-muted/50'], 'text-foreground/75']),
	corpo('turmas: horário e local', 'turmas', [['bg-white/5'], 'text-white/50'], [['bg-muted/50'], 'text-foreground/75'])
];

/** Etiquetas do card sobre o card de Aprovado (onde aparecem). */
const CARD_APROVADO_PROD = ['bg-[#1f7a43]'];
const CARD_APROVADO = ['bg-status-completed'];
const ETIQUETAS: Caso[] = [
	['equivalência', 'bg-purple-500/90', 'text-white', 'bg-tag-equivalencia', 'text-tag-equivalencia-foreground', 'cores'],
	['aproveitamento', 'bg-zinc-50/95', 'text-emerald-900', 'bg-tag-aproveitamento', 'text-tag-aproveitamento-foreground', 'cores'],
	['optativa', 'bg-blue-500/85', 'text-white', 'bg-tag-optativa', 'text-tag-optativa-foreground', 'cores'],
	['optatória', 'bg-amber-500/90', 'text-black', 'bg-tag-optatoria', 'text-tag-optatoria-foreground', 'cores'],
	['módulo livre', 'bg-teal-400/90', 'text-black', 'bg-tag-modulo-livre', 'text-tag-modulo-livre-foreground', 'cores'],
	['pré-requisitos ok', 'bg-green-500/72', 'text-white/95', 'bg-status-prereq-ok', 'text-status-on-solid', 'cores'],
	['pré-requisitos pendentes', 'bg-amber-500/72', 'text-white/95', 'bg-status-prereq-pending', 'text-status-on-solid', 'cores']
].map(([onde, pb, pf, ab, af, arquivo]) => ({
	onde: `etiqueta do card: ${onde}`,
	arquivo: arquivo as Arq,
	prod: { fundo: [...CARD_APROVADO_PROD, pb], frente: pf },
	atual: { fundo: [...CARD_APROVADO, ab], frente: af },
	min: MIN_TEXTO
}));

/** Contorno do card selecionado, sobre a página. */
const CONTORNOS: Caso[] = [
	{
		onde: 'contorno do card selecionado',
		arquivo: 'cores',
		prod: { fundo: [], frente: 'border-white/60' },
		atual: { fundo: [], frente: 'border-foreground/65 ring-2 ring-foreground/30 dark:border-white/60' },
		prop: 'border',
		min: MIN_GRAFICO
	},
	{
		onde: 'contorno do card reprovado em destaque',
		arquivo: 'cores',
		prod: { fundo: [], frente: 'border-red-300/85' },
		atual: { fundo: [], frente: 'border-status-failed-ring/85 dark:border-red-300/85' },
		prop: 'border',
		min: MIN_GRAFICO
	}
];

// ─── Medição ─────────────────────────────────────────────────────────────────

function medir(tema: 'light' | 'dark', lado: Lado, caso: Caso): number {
	const variantes = caso.variantes ?? [[]];
	return Math.min(
		...variantes.map((v) => piorContraste(tema, lado.frente, [...lado.fundo, ...v], caso.prop ?? 'text'))
	);
}

describe.each([...CASOS, ...ETIQUETAS, ...CONTORNOS])('$onde', (caso) => {
	it('as classes medidas estão no componente', () => {
		const fonte = lerSrc(ARQ[caso.arquivo]);
		const classes = caso.atual.frente.split(/\s+/);
		const naMesmaLinha = fonte
			.split('\n')
			.some((l) => classes.every((c) => new RegExp(`(?<![\\w:/-])${c.replace(/[/[\]#.]/g, '\\$&')}(?![\\w/-])`).test(l)));
		expect(naMesmaLinha, `"${caso.atual.frente}" sumiu de ${ARQ[caso.arquivo]}`).toBe(true);
		for (const c of caso.atual.fundo) {
			if (typeof c === 'string' && !MODAL.includes(c)) expect(fonte).toContain(c);
		}
		for (const trecho of caso.fonte ?? []) expect(fonte).toContain(trecho);
	});

	it.each(TEMAS)('tema %s: contraste mínimo', (tema) => {
		const r = medir(tema, caso.atual, caso);
		expect(r, `${tema}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(caso.min);
	});

	it('escuro (produção): nunca pior que a main', () => {
		const prod = medir('dark', caso.prod, caso);
		const atual = medir('dark', caso.atual, caso);
		expect(atual, `main ${prod.toFixed(2)}:1 → agora ${atual.toFixed(2)}:1`).toBeGreaterThanOrEqual(prod);
	});
});

/**
 * Mudanças só visuais (sem ganho de contraste) não entram no escuro de produção
 * sem aceite do mantenedor: lá fica o valor da main, byte a byte.
 */
describe('escuro (produção): superfícies e contornos idênticos à main', () => {
	it.each([
		['modal', 'painel do modal', 'dark:border-white/10 dark:bg-gray-900/95'],
		['modal', 'chip de pré-requisito', 'dark:border-[#7f9cf5]/35 bg-primary/10 dark:bg-[#7f9cf5]/10'],
		['modal', 'chip de pré-requisito (texto)', 'dark:text-[#b8adff]'],
		['editor', 'campos do editor', 'dark:border-white/10 bg-background dark:bg-white/5'],
		['editor', 'placeholder dos campos', 'dark:placeholder:text-white/30'],
		['cores', 'card selecionado', 'dark:border-white/60 dark:ring-white/30'],
		['cores', 'reprovado em destaque', 'dark:border-red-300/85 dark:ring-red-400/45']
	] as const)('%s: %s', (arquivo, _onde, trecho) => {
		expect(lerSrc(ARQ[arquivo])).toContain(trecho);
	});

	it('a cor medida no escuro é a da main', () => {
		for (const [atual, main, prop] of [
			['bg-popover/95 dark:bg-gray-900/95', 'bg-gray-900/95', 'bg'],
			['text-accent-foreground dark:text-[#b8adff]', 'text-[#b8adff]', 'text'],
			['border-foreground/65 dark:border-white/60', 'border-white/60', 'border'],
			['ring-status-failed-ring/45 dark:ring-red-400/45', 'ring-red-400/45', 'ring']
		] as const) {
			expect(resolverClasse(atual, prop, 'dark')).toMatchObject({
				rgb: resolverClasse(main, prop, 'dark')!.rgb,
				alfa: resolverClasse(main, prop, 'dark')!.alfa
			});
		}
	});
});

describe('regressão do cabeçalho (pré-mortem)', () => {
	it('text-muted-foreground no código/status fica abaixo de 4,5:1 e abaixo da main no escuro', () => {
		const caso = CASOS[0];
		const comMuted = { ...caso.atual, frente: 'text-muted-foreground' };
		expect(medir('dark', comMuted, caso)).toBeLessThan(MIN_TEXTO);
		expect(medir('dark', comMuted, caso)).toBeLessThan(medir('dark', caso.prod, caso));
		expect(medir('light', comMuted, caso)).toBeLessThan(MIN_TEXTO);
	});
});
