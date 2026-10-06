/**
 * Versão do "pacote de novidades" e do schema do fluxograma persistido.
 *
 * Como usar num release novo:
 * 1. Incremente RELEASE_ID (qualquer string nova reabre o modal 1x por usuário).
 * 2. Atualize RELEASE_NOVIDADES com o que mudou, na voz do usuário.
 * 3. Incremente FLUXOGRAMA_SCHEMA_VERSION SOMENTE se o dado salvo pelo upload
 *    ganhou informação nova (aí o modal pede reenvio do histórico para quem
 *    tem dado de versão anterior).
 */

/** Identificador deste release — mudar reabre o modal de novidades. */
export const RELEASE_ID = '2026-10.1';

/**
 * Versão do schema do fluxograma_atual salvo no upload.
 * v1: uploads antigos (sem o campo schema_version).
 * v2: equivalências do próprio histórico injetadas + módulo livre/extras.
 */
export const FLUXOGRAMA_SCHEMA_VERSION = 2;

export const RELEASE_TITULO = 'Novidades no NoFluxo';

export const RELEASE_NOVIDADES: string[] = [
	'Modo claro: troque o tema no botão do topo. Ao lado, o novo botão de acessibilidade liga alto contraste, letra maior, fonte de leitura e menos animação',
	'Darcy AI agora é exclusivo para quem está logado, com uma rodinha que mostra quantas perguntas você ainda tem no dia. Precisa de mais? É só pedir, sem custo',
	'Upload do histórico mais esperto: o TCC não some mais e PDFs que não são histórico do SIGAA recebem um aviso claro',
	'Integralização honesta: o percentual não arredonda para 100% antes da hora e, quando o IRA não está no histórico, a gente avisa em vez de mostrar 0',
	'Fluxograma no celular já abre enquadrado, com mais contraste e pré-requisitos do tipo "isto OU aquilo" exibidos do jeito certo',
	'O NoFluxo agora é um produto da Crianex, com time atualizado na página inicial'
];

/**
 * Evento em destaque no topo do modal. Deixe `null` para ocultar.
 * `href` sem parâmetros de rastreamento de anúncio.
 */
export const RELEASE_EVENTO: {
	kicker: string;
	titulo: string;
	quando: string;
	onde: string;
	texto: string;
	destaque: string;
	href: string;
	cta: string;
} | null = {
	kicker: 'A convite do evento',
	titulo: 'O NoFluxo vai à INOVATEC 2026',
	quando: '6 e 7 de novembro',
	onde: 'Centro Cultural ADUnB, Brasília',
	texto:
		'Fomos convidados para o **VII INOVATEC**, o congresso internacional de inovação em saúde e tecnologia: vamos estar com **stand na feira** e **apresentação no palco**. Bora com a gente mostrar a força dos estudantes da UnB! A inscrição para visitar a **feira**, onde fica o nosso stand, é **gratuita**.',
	destaque: 'Quem passar no nosso stand leva brindes exclusivos do NoFluxo 🎁',
	href: 'https://inovatecdf.com.br/index.php/incricoes/',
	cta: 'Garantir meu ingresso'
};

/** Aviso curto de algo em construção (sem link). Deixe vazio para ocultar. */
export const RELEASE_EM_CONSTRUCAO = 'App do NoFluxo para celular: em construção. Em breve contamos mais.';

/**
 * Nota da equipe exibida no fim do modal. Trechos entre **asteriscos** viram
 * negrito e [texto](url) vira link. Deixe `agradecimento` vazio para ocultar
 * a seção num release futuro.
 */
export const RELEASE_NOTA_EQUIPE = {
	agradecimento:
		'Cada melhoria desta versão nasceu de um feedback de vocês: obrigado por usar, testar, reclamar e divulgar o NoFluxo.',
	lema: 'A vida do estudante não é linear. Cada estudante tem o seu próprio fluxo.',
	corpo:
		'Seguimos empenhados em trazer mais qualidade de vida para os estudantes da UnB, agora com a **Crianex** junto. Continue mandando sugestões pelo suporte: é assim que vocês levam a gente para outro nível.',
	assinatura: 'Nosso muito obrigado 💜 · Equipe do NoFluxo'
};
