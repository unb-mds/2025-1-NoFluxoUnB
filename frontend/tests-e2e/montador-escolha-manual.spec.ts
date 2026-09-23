/**
 * Regressão do relato: "escolho as turmas certas, aperto Montar grade e ele apaga
 * tudo".
 *
 * `montarAutomatico` reconstruía a seleção do zero e só preservava as matérias
 * TRAVADAS — e a trava só existia para matéria em curso. Resultado: toda turma
 * escolhida na mão para uma matéria nova era reatribuída ou descartada.
 *
 * Aqui a sequência é a do aluno, no app real: montar → trocar uma turma na mão →
 * montar de novo → a escolha tem de continuar de pé.
 *
 * Mesmos pré-requisitos da auditoria (ver auditoria-montador.spec.ts): frontend em
 * :5173, backend do app em :3333 e a instância dev em :3334, mais o
 * sessoes-auditoria.json gerado no scratchpad.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { RELEASE_ID } from '../src/lib/config/release';

const SCRATCH =
	process.env.AUDITORIA_DIR ??
	'C:/Users/FELIPE~1/AppData/Local/Temp/claude/C--Users-Felipe-Pedroza-Documents-UnB-nofluxo-2025-1-NoFluxoUNB/b9ea3c94-f2b4-4264-8e97-2f43a0a91c1c/scratchpad';
const ARQ_SESSOES = path.join(SCRATCH, 'sessoes-auditoria.json');

interface Sessao {
	idUser: number;
	nomeCurso: string;
	storedUser: Record<string, unknown>;
}

const sessoes: Sessao[] = fs.existsSync(ARQ_SESSOES)
	? JSON.parse(fs.readFileSync(ARQ_SESSOES, 'utf8'))
	: [];

test.skip(sessoes.length === 0, 'sessoes-auditoria.json ausente');

/** Código → turma, lido do painel Resumo ("FGA0109 T. 01 · 60h"). */
function lerResumo(texto: string): Map<string, string> {
	const mapa = new Map<string, string>();
	for (const m of texto.matchAll(/([A-Z]{2,4}\d{4})\s*T\.\s*(\d+)/g)) mapa.set(m[1], m[2]);
	return mapa;
}

/**
 * "Montar grade" agora abre o wizard de 2 passos (Configurar → Resultados) em vez
 * de montar direto — o clique sozinho não basta mais. Aqui: abre o passo 1 com os
 * parâmetros padrão, gera as opções e aplica a primeira (equivalente ao clique
 * único de antes, do ponto de vista do que o teste verifica).
 */
async function montarGradeCompleta(page: import('@playwright/test').Page): Promise<void> {
	await page
		.getByRole('button', { name: /Montar grade/i })
		.first()
		.click();
	const gerar = page.getByRole('button', { name: /Gerar opções/i });
	await gerar.waitFor({ state: 'visible', timeout: 10_000 });
	await gerar.click();
	const opcao = page
		.getByRole('button', { name: /Menos dias|Menos lacunas|Semana equilibrada/i })
		.first();
	await opcao.waitFor({ state: 'visible', timeout: 20_000 });
	await opcao.click();
	await page.waitForTimeout(800);
}

test('a turma escolhida na mão sobrevive a "Montar grade"', async ({ page }) => {
	const s = sessoes[0];

	const API_DEV = process.env.AUDITORIA_API ?? 'http://localhost:3334';
	const API_APP = process.env.AUDITORIA_API_ORIGEM ?? 'http://localhost:3333';
	await page.route(`${API_APP}/**`, (route) =>
		route.continue({ url: route.request().url().replace(API_APP, API_DEV) })
	);

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

	await page.goto('/planejamento/grade', { waitUntil: 'domcontentloaded' });

	const resumo = page.locator('[data-tour="resumo"]');
	await resumo.waitFor({ state: 'visible', timeout: 45_000 });

	await montarGradeCompleta(page);

	const antes = lerResumo((await resumo.textContent()) ?? '');
	expect(antes.size, 'a primeira montagem não produziu grade nenhuma').toBeGreaterThan(0);

	// Uma matéria da grade que NÃO seja matrícula em curso e tenha turma alternativa.
	//
	// Excluir as em curso é o ponto do teste: essas já eram travadas antes, então
	// mirar numa delas faria o teste passar mesmo com o bug de volta. O que precisa
	// ser provado é a escolha manual numa matéria nova.
	const alvo = { codigo: '', turma: '' };
	for (const codigo of antes.keys()) {
		// Cada matéria da lista é uma <section> própria (SubjectTurmaSelector).
		const card = page.locator('section').filter({ hasText: codigo }).first();
		const texto = (await card.textContent().catch(() => '')) ?? '';
		const emCurso = /Já cursando/i.test(texto);
		const opcoes = card.getByRole('button', { name: /Turma\s+\S+/ });
		const n = await opcoes.count().catch(() => 0);
		console.log(`[card] ${codigo}: ${n} turma(s), atual T.${antes.get(codigo)}, emCurso=${emCurso}`);
		if (emCurso || n < 2) continue;
		for (let i = 0; i < n; i++) {
			const b = opcoes.nth(i);
			if (await b.isDisabled().catch(() => true)) continue;
			const t = ((await b.textContent()) ?? '').match(/Turma\s+(\S+)/)?.[1] ?? '';
			if (!t || t === antes.get(codigo)) continue;
			await b.click();
			await page.waitForTimeout(800);
			const agora = lerResumo((await resumo.textContent()) ?? '');
			if (agora.get(codigo) === t) {
				alvo.codigo = codigo;
				alvo.turma = t;
			}
			break;
		}
		if (alvo.codigo) break;
	}

	expect(
		alvo.codigo,
		'nenhuma matéria fora da matrícula em curso tinha turma alternativa — sem isso o teste não prova nada'
	).not.toBe('');
	console.log(`[alvo] ${alvo.codigo} → turma ${alvo.turma} escolhida na mão`);

	// O clique que apagava tudo.
	await montarGradeCompleta(page);

	const depois = lerResumo((await resumo.textContent()) ?? '');
	expect(
		depois.get(alvo.codigo),
		`${alvo.codigo}: escolhi a turma ${alvo.turma} na mão e "Montar grade" devolveu ${depois.get(alvo.codigo) ?? 'nada'}`
	).toBe(alvo.turma);
});
