/**
 * AUDITORIA PRÁTICA do Montador de Grade — no app de verdade.
 *
 * Para cada aluno real da amostra: injeta a sessão dele (mesmo payload que o app
 * grava em localStorage) + a flag de impersonação dev que já existe no projeto,
 * abre `/planejamento/grade` e deixa o `onMount` montar a grade sozinho — plano de
 * formatura do backend, semeadura, solver e render, tudo pelo caminho real.
 *
 * Depois lê o que o ALUNO VÊ: o painel Resumo. Nada de espiar store por dentro.
 *
 * Pré-requisitos:
 *   - frontend em :5173 (o webServer do playwright.config sobe se faltar)
 *   - backend do app em :3333 e uma 2ª instância em :3334 com NODE_ENV != production
 *     (é a de :3334 que aceita o bypass X-Dev-Impersonate; ver AUDITORIA_API abaixo)
 *   - node <scratchpad>/exportar-sessoes.cjs  → sessoes-auditoria.json
 *
 * Saída: resultado-auditoria.json no scratchpad, consumido por auditar.cjs.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { RELEASE_ID } from '../src/lib/config/release';
import path from 'node:path';

const SCRATCH =
	process.env.AUDITORIA_DIR ??
	'C:/Users/FELIPE~1/AppData/Local/Temp/claude/C--Users-Felipe-Pedroza-Documents-UnB-nofluxo-2025-1-NoFluxoUNB/b9ea3c94-f2b4-4264-8e97-2f43a0a91c1c/scratchpad';

const ARQ_SESSOES = path.join(SCRATCH, 'sessoes-auditoria.json');
/**
 * Modo da auditoria: `com-matr` (padrão do app) ou `sem-matr` (o aluno desligou as
 * matérias em curso). Rodar os dois e comparar é o que prova a mudança: o modo
 * padrão TEM de reproduzir os números de antes, e o outro TEM de zerar as em curso.
 */
const MODO = process.env.AUDITORIA_MODO === 'sem-matr' ? 'sem-matr' : 'com-matr';
const ARQ_SAIDA = path.join(SCRATCH, `resultado-auditoria-${MODO}.json`);
const DIR_SHOTS = path.join(SCRATCH, 'shots');

interface Sessao {
	idUser: number;
	email: string;
	nomeCompleto: string;
	matriz: string;
	nomeCurso: string;
	semestre: number;
	statuses: Record<string, number>;
	storedUser: Record<string, unknown>;
}

const sessoes: Sessao[] = fs.existsSync(ARQ_SESSOES)
	? JSON.parse(fs.readFileSync(ARQ_SESSOES, 'utf8'))
	: [];

/** Quantos alunos levar ao navegador. Todos por padrão. */
const LIMITE = Number(process.env.AUDITORIA_LIMITE || sessoes.length);
const ALVOS = sessoes.slice(0, LIMITE);

const resultados: Record<string, unknown>[] = [];

test.describe.configure({ mode: 'serial' });

// Sem o export de sessões não há o que auditar — pula em vez de quebrar o CI.
test.skip(ALVOS.length === 0, 'sessoes-auditoria.json ausente');

test.beforeAll(() => {
	if (!fs.existsSync(DIR_SHOTS)) fs.mkdirSync(DIR_SHOTS, { recursive: true });
});

test.afterAll(() => {
	fs.writeFileSync(ARQ_SAIDA, JSON.stringify(resultados, null, 1));
	console.log(`\n[auditoria] ${resultados.length} alunos → ${ARQ_SAIDA}`);
});

for (const s of ALVOS) {
	test(`aluno ${s.idUser} · ${s.nomeCurso.slice(0, 24)}`, async ({ page }) => {
		const errosConsole: string[] = [];
		page.on('console', (m) => {
			if (m.type() === 'error') errosConsole.push(m.text().slice(0, 200));
		});
		page.on('pageerror', (e) => errosConsole.push('pageerror: ' + String(e.message).slice(0, 200)));

		// O backend que o dev usa no dia a dia roda com NODE_ENV=production, onde o
		// bypass X-Dev-Impersonate fica desligado. Em vez de reconfigurar o servidor
		// dele, a auditoria sobe uma segunda instância em modo dev e redireciona as
		// chamadas de API só durante o teste.
		const API_DEV = process.env.AUDITORIA_API ?? 'http://localhost:3334';
		const API_APP = process.env.AUDITORIA_API_ORIGEM ?? 'http://localhost:3333';
		await page.route(`${API_APP}/**`, (route) => {
			route.continue({ url: route.request().url().replace(API_APP, API_DEV) });
		});

		// A sessão precisa existir ANTES de qualquer script da app rodar.
		// Duas modais abrem por cima do montador na primeira visita — o tour de 7
		// passos e o changelog de release. Elas bloqueiam o clique e, sem isso, a
		// auditoria mediria modal em vez de grade. Marcadas como já vistas, que é o
		// estado de qualquer aluno que não seja de primeira viagem.
		await page.addInitScript(
			([user, releaseId]) => {
				localStorage.setItem('nofluxo_user', JSON.stringify(user));
				localStorage.setItem('nofluxo_dev_impersonate', 'true');
				localStorage.setItem('nofluxo:tour:montador-grade-v1', 'done');
				const u = user as { idUser: number };
				localStorage.setItem(`nofluxo:release-vista:${u.idUser}`, releaseId as string);
			},
			[s.storedUser, RELEASE_ID] as const
		);

		const t0 = Date.now();
		await page.goto('/planejamento/grade', { waitUntil: 'domcontentloaded' });

		// O onMount dispara montar(): plano → semeadura → solver. Espera o Resumo
		// existir e sair do estado de carregando.
		const resumo = page.locator('[data-tour="resumo"]');
		let chegou = true;
		let clicou = false;
		try {
			await resumo.waitFor({ state: 'visible', timeout: 45_000 });
			// O `onMount` só SEMEIA a lista; quem dispara o solver é o aluno clicando
			// em "Montar grade". A auditoria faz exatamente esse clique.
			if (MODO === 'sem-matr') {
				// Mesmo caminho do aluno: o botão na barra. Ele já remonta sozinho.
				const alternar = page
					.getByRole('button', { name: /Incluindo cursando|Sem as cursando/i })
					.first();
				if (await alternar.isVisible().catch(() => false)) {
					await alternar.click();
					await page.waitForTimeout(2500);
				}
			}
			// "Montar grade" agora abre o wizard de 2 passos (Configurar → Resultados)
			// em vez de montar direto: gera as opções e aplica a primeira, que é o
			// equivalente do clique único de antes pro que esta auditoria mede.
			const botao = page.getByRole('button', { name: /Montar grade/i }).first();
			await botao.waitFor({ state: 'visible', timeout: 20_000 });
			await botao.click();
			clicou = true;
			const gerar = page.getByRole('button', { name: /Gerar opções/i });
			await gerar.waitFor({ state: 'visible', timeout: 10_000 });
			await gerar.click();
			const opcaoGerada = page
				.getByRole('button', { name: /Menos dias|Menos lacunas|Semana equilibrada/i })
				.first();
			await opcaoGerada.waitFor({ state: 'visible', timeout: 20_000 });
			await opcaoGerada.click();
			await page.waitForTimeout(1500);
		} catch {
			chegou = false;
		}
		const ms = Date.now() - t0;

		const url = page.url();
		const textoResumo = chegou ? ((await resumo.textContent()) ?? '') : '';
		const codigosGrade = [...new Set(textoResumo.match(/[A-Z]{2,4}\d{4}/g) ?? [])];

		const creditos = (() => {
			const m = textoResumo.match(/(\d+)\s*créditos/);
			return m ? Number(m[1]) : null;
		})();

		// Pool: a lista de matérias/turmas da coluna esquerda.
		const textoPagina =
			(await page
				.locator('main')
				.first()
				.textContent()
				.catch(() => '')) ?? '';
		const codigosPagina = [...new Set(textoPagina.match(/[A-Z]{2,4}\d{4}/g) ?? [])];

		// Avisos que a própria tela mostra.
		const avisoPreReq = /pré-requisito/i.test(textoPagina);
		const avisoCoReq = /Co-requisito fora da grade/i.test(textoPagina);
		const avisoPlano = /não indicou matérias|não consegui carregar seu plano/i.test(textoPagina);
		const semGrade = /Nenhuma matéria na grade ainda/i.test(textoResumo);

		await page.screenshot({
			path: path.join(DIR_SHOTS, `aluno-${s.idUser}-${MODO}.png`),
			fullPage: false
		});

		resultados.push({
			modo: MODO,
			idUser: s.idUser,
			nomeCurso: s.nomeCurso,
			matriz: s.matriz,
			semestre: s.semestre,
			statuses: s.statuses,
			url,
			chegouNaTela: chegou && url.includes('/planejamento/grade'),
			ms,
			codigosGrade,
			codigosPagina,
			creditos,
			semGrade,
			avisoPreReq,
			avisoCoReq,
			avisoPlano,
			clicouMontar: clicou,
			errosConsole: errosConsole.slice(0, 5)
		});

		// A auditoria mede, não reprova: o único fracasso é não conseguir observar.
		expect(chegou, `não consegui abrir o montador do aluno ${s.idUser} (url=${url})`).toBe(true);
	});
}
